"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { stratify, tree } from "d3-hierarchy";
import {
  Maximize2, Plus, Minus, Check, Layers, Undo2, ChevronDown, UserRound,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/core/utils";
import {
  resolveEffectiveTier, type ExplicitMap, type FolderIndex, type FormaFolder,
} from "@/lib/forma/inheritance";
import { FORMA_TIERS, TIER_COLOR, TIER_SHORT, type FormaTier } from "@/lib/forma/tiers";
import { FORMA_GROUPS, type FormaRole } from "@/lib/forma/defaultRoles";

const ROOT = "__root__";
const ROOT_COLOR = "#6366f1";
const NODE_W = 64;
const NODE_H = 64;
const R = 9; // sphere radius

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface VNode { id: string; x: number; y: number; depth: number }
interface VLink { sx: number; sy: number; tx: number; ty: number }

const sortFolders = (arr: readonly FormaFolder[]): FormaFolder[] =>
  [...arr].sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name));

function initialCollapsed(index: FolderIndex): Set<string> {
  const collapsed = new Set<string>();
  const queue: { f: FormaFolder; depth: number }[] = index.roots.map((f) => ({ f, depth: 1 }));
  while (queue.length) {
    const { f, depth } = queue.shift()!;
    const kids = index.childrenOf.get(f.id) ?? [];
    if (depth >= 2 && kids.length > 0) collapsed.add(f.id);
    for (const c of kids) queue.push({ f: c, depth: depth + 1 });
  }
  return collapsed;
}

export function HierarchyView({
  index, explicit, rootLabel, roles, activeRoleId, activeRoleLabel,
  onPickRole, onSetTier, onApplySubtree, onClear,
}: {
  index: FolderIndex;
  explicit: ExplicitMap;
  rootLabel: string;
  roles: FormaRole[];
  activeRoleId: string;
  activeRoleLabel: string;
  onPickRole: (roleId: string) => void;
  onSetTier: (folderId: string, tier: FormaTier) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => initialCollapsed(index));
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { nodes, links, bbox } = useMemo(() => {
    const visible: FormaFolder[] = [];
    const walk = (f: FormaFolder) => {
      visible.push(f);
      if (!collapsed.has(f.id)) for (const c of sortFolders(index.childrenOf.get(f.id) ?? [])) walk(c);
    };
    for (const r of sortFolders(index.roots)) walk(r);
    const ids = new Set(visible.map((f) => f.id));
    const input = [
      { id: ROOT, parentId: null as string | null },
      ...visible.map((f) => ({ id: f.id, parentId: f.parentId && ids.has(f.parentId) ? f.parentId : ROOT })),
    ];
    const root = stratify<{ id: string; parentId: string | null }>().id((d) => d.id).parentId((d) => d.parentId)(input);
    const laid = tree<{ id: string; parentId: string | null }>().nodeSize([NODE_W, NODE_H])(root);
    const ns: VNode[] = laid.descendants().map((n) => ({ id: n.data.id, x: n.x, y: n.y, depth: n.depth }));
    const ls: VLink[] = laid.links().map((l) => ({ sx: l.source.x, sy: l.source.y, tx: l.target.x, ty: l.target.y }));
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
    return {
      nodes: ns, links: ls,
      bbox: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 },
    };
  }, [index, collapsed]);

  // --- three.js scene ---
  const mountRef = useRef<HTMLDivElement>(null);
  const overlayRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const posRef = useRef<Map<string, THREE.Vector3>>(new Map());
  const target = useRef(new THREE.Vector3());
  const orbit = useRef({ radius: 600, theta: Math.PI / 2 - 0.45, phi: Math.PI / 2 - 0.32 });

  const updateCamera = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    const { radius, theta, phi } = orbit.current;
    const t = target.current;
    cam.position.set(
      t.x + radius * Math.sin(phi) * Math.cos(theta),
      t.y + radius * Math.cos(phi),
      t.z + radius * Math.sin(phi) * Math.sin(theta),
    );
    cam.lookAt(t);
  }, []);

  const fit = useCallback(() => {
    const span = Math.max(bbox.maxX - bbox.minX + 160, bbox.maxY - bbox.minY + 160);
    target.current.set(bbox.cx, -bbox.cy, 0);
    orbit.current.radius = clamp(span * 1.1, 220, 4000);
    orbit.current.theta = Math.PI / 2 - 0.45;
    orbit.current.phi = Math.PI / 2 - 0.32;
    updateCamera();
  }, [bbox, updateCamera]);

  // init renderer / scene / camera / loop (once)
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 900, 2600);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 1, 6000);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(200, 400, 600);
    scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0x99bbff, 0.25);
    dir2.position.set(-300, -200, -400);
    scene.add(dir2);

    fit();

    let raf = 0;
    const tmp = new THREE.Vector3();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      renderer.render(scene, camera);
      const w = mount.clientWidth, h = mount.clientHeight;
      posRef.current.forEach((pos, id) => {
        const el = overlayRefs.current.get(id);
        if (!el) return;
        tmp.copy(pos).project(camera);
        if (tmp.z > 1) { el.style.display = "none"; return; }
        el.style.display = "";
        const sx = (tmp.x * 0.5 + 0.5) * w;
        const sy = (-tmp.y * 0.5 + 0.5) * h;
        el.style.transform = `translate(${sx}px, ${sy}px)`;
      });
    };
    animate();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // scroll = pan, wheel non-passive
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = cameraRef.current!;
      const speed = orbit.current.radius * 0.0014;
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1);
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0);
      target.current.addScaledVector(up, -e.deltaY * speed).addScaledVector(right, e.deltaX * speed);
      updateCamera();
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("wheel", onWheel);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (re)build spheres + links when the visible set changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    // clear previous
    meshesRef.current.forEach((m) => {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    meshesRef.current.clear();
    posRef.current.clear();
    const prevLines = scene.getObjectByName("forma-links");
    if (prevLines) scene.remove(prevLines);

    const sphere = new THREE.SphereGeometry(R, 28, 28);
    for (const n of nodes) {
      const isRoot = n.id === ROOT;
      const color = isRoot ? ROOT_COLOR : TIER_COLOR[resolveEffectiveTier(n.id, explicit, index.byId).tier];
      const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35, metalness: 0.15, emissive: new THREE.Color(color), emissiveIntensity: 0.12 });
      const mesh = new THREE.Mesh(sphere.clone(), mat);
      if (isRoot) mesh.scale.setScalar(1.4);
      const pos = new THREE.Vector3(n.x, -n.y, 0);
      mesh.position.copy(pos);
      scene.add(mesh);
      meshesRef.current.set(n.id, mesh);
      posRef.current.set(n.id, pos);
    }
    sphere.dispose();

    const pts: number[] = [];
    for (const l of links) { pts.push(l.sx, -l.sy, 0, l.tx, -l.ty, 0); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 }));
    lines.name = "forma-links";
    scene.add(lines);
  }, [nodes, links, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // recolor spheres when permissions change (no rebuild)
  useEffect(() => {
    meshesRef.current.forEach((mesh, id) => {
      if (id === ROOT) return;
      const folder = index.byId.get(id);
      if (!folder) return;
      const color = TIER_COLOR[resolveEffectiveTier(id, explicit, index.byId).tier];
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(color);
      mat.emissive.set(color);
    });
  }, [explicit, index, nodes]);

  // orbit on background drag
  const drag = useRef<null | { x: number; y: number }>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      orbit.current.theta -= dx * 0.005;
      orbit.current.phi = clamp(orbit.current.phi - dy * 0.005, 0.2, Math.PI - 0.2);
      updateCamera();
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [updateCamera]);

  const zoomBy = (factor: number) => {
    orbit.current.radius = clamp(orbit.current.radius * factor, 120, 4500);
    updateCamera();
  };

  const rolesByGroup = useMemo(() => {
    const m = new Map<string, FormaRole[]>();
    for (const r of roles) { const a = m.get(r.group); if (a) a.push(r); else m.set(r.group, [r]); }
    return m;
  }, [roles]);
  const declared = FORMA_GROUPS as readonly string[];
  const groupOrder = [...declared.filter((g) => rolesByGroup.has(g)), ...[...rolesByGroup.keys()].filter((g) => !declared.includes(g))];

  return (
    <div
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; }}
    >
      <div ref={mountRef} className="absolute inset-0" />

      {/* node overlays (labels + click hit-areas), positioned by projection each frame */}
      <div className="pointer-events-none absolute inset-0">
        {nodes.map((n) => {
          const isRoot = n.id === ROOT;
          const folder = isRoot ? null : index.byId.get(n.id);
          if (!isRoot && !folder) return null;
          const eff = isRoot ? null : resolveEffectiveTier(n.id, explicit, index.byId);
          const hasKids = isRoot ? false : (index.childrenOf.get(n.id) ?? []).length > 0;
          const label = isRoot ? rootLabel : folder!.name;
          return (
            <div
              key={n.id}
              ref={(el) => { if (el) overlayRefs.current.set(n.id, el); else overlayRefs.current.delete(n.id); }}
              className="absolute left-0 top-0 will-change-transform"
            >
              <div className="-translate-x-1/2 -translate-y-1/2">
                {isRoot ? (
                  <div className="pointer-events-none flex flex-col items-center">
                    <div className="h-9 w-9" />
                    <div className="mt-0.5 max-w-[120px] truncate text-[11px] font-semibold text-foreground drop-shadow">{label}</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          className="pointer-events-auto h-9 w-9 rounded-full outline-none ring-primary/50 transition focus-visible:ring-2"
                          aria-label={`set tier for ${label}`}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="min-w-[13rem]">
                        <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">{label}</DropdownMenuLabel>
                        {FORMA_TIERS.map((t) => (
                          <DropdownMenuItem key={t} onSelect={() => onSetTier(n.id, t)} className="cursor-pointer gap-2.5">
                            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: TIER_COLOR[t] }} />
                            <span className="flex-1 text-[13px]">{t}</span>
                            {eff && t === eff.tier && <Check className="h-3.5 w-3.5 text-foreground" />}
                          </DropdownMenuItem>
                        ))}
                        {hasKids && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => toggle(n.id)} className="cursor-pointer gap-2 text-[13px]">
                              {collapsed.has(n.id) ? "Expand children" : "Collapse children"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => eff && onApplySubtree(n.id, eff.tier)} className="cursor-pointer gap-2 text-[13px]">
                              <Layers className="h-3.5 w-3.5" /> Apply “{eff ? TIER_SHORT[eff.tier] : ""}” to subtree
                            </DropdownMenuItem>
                          </>
                        )}
                        {eff?.sourceId === n.id && (
                          <DropdownMenuItem onSelect={() => onClear(n.id)} className="cursor-pointer gap-2 text-[13px]">
                            <Undo2 className="h-3.5 w-3.5" /> Clear override
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="pointer-events-none mt-0.5 text-center">
                      <div className="max-w-[120px] truncate text-[10.5px] font-medium leading-tight text-foreground drop-shadow-sm" title={label}>{label}</div>
                      {eff && (
                        <div className={cn("text-[9px] leading-tight", eff.inherited ? "italic text-muted-foreground/80" : "text-muted-foreground")}>
                          {TIER_SHORT[eff.tier]}{eff.inherited ? " · inherited" : ""}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* role picker */}
      <div className="absolute left-3 top-3 z-10" onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="pointer-events-auto inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur transition-colors hover:border-border">
              <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Viewing</span>
              <span className="font-semibold text-foreground">{activeRoleLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-[60vh] w-56 overflow-y-auto">
            {groupOrder.map((g) => (
              <Fragment key={g}>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{g}</DropdownMenuLabel>
                {(rolesByGroup.get(g) ?? []).map((r) => (
                  <DropdownMenuItem key={r.id} onSelect={() => onPickRole(r.id)} className="cursor-pointer gap-2 text-[13px]">
                    <span className="flex-1 truncate">{r.label}</span>
                    {r.id === activeRoleId && <Check className="h-3.5 w-3.5 text-foreground" />}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* hint */}
      <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
        Drag to rotate · scroll to pan · +/− to zoom · click a node to set its tier
      </div>

      {/* controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} className="pointer-events-auto grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoomBy(1.2)} className="pointer-events-auto grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="zoom out"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={fit} className="pointer-events-auto grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="fit"><Maximize2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
