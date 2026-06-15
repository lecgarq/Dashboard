"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { OrgNode } from "./OrgNode";

const ROOT = "__root__";
const ROOT_COLOR = "#6366f1"; // indigo for the synthetic root
const NODE_W = 156;
const NODE_H = 124;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface OrgInput { id: string; parentId: string | null }
interface PNode { id: string; x: number; y: number; depth: number }
interface PLink { id: string; sx: number; sy: number; tx: number; ty: number }

const sortFolders = (arr: readonly FormaFolder[]): FormaFolder[] =>
  [...arr].sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name));

function elbow(sx: number, sy: number, tx: number, ty: number): string {
  const my = (sy + ty) / 2;
  return `M${sx},${sy} L${sx},${my} L${tx},${my} L${tx},${ty}`;
}

// Default: show roots + their direct children; collapse deeper (depth ≥ 2 with kids).
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

  // Layout depends only on structure + collapse (NOT on the tier colors), so
  // changing a permission recolors without re-laying-out the tree.
  const { nodes, links, bbox } = useMemo(() => {
    const visible: FormaFolder[] = [];
    const walk = (f: FormaFolder) => {
      visible.push(f);
      if (!collapsed.has(f.id)) for (const c of sortFolders(index.childrenOf.get(f.id) ?? [])) walk(c);
    };
    for (const r of sortFolders(index.roots)) walk(r);

    const ids = new Set(visible.map((f) => f.id));
    const input: OrgInput[] = [
      { id: ROOT, parentId: null },
      ...visible.map((f) => ({ id: f.id, parentId: f.parentId && ids.has(f.parentId) ? f.parentId : ROOT })),
    ];
    const root = stratify<OrgInput>().id((d) => d.id).parentId((d) => d.parentId)(input);
    const laid = tree<OrgInput>().nodeSize([NODE_W, NODE_H])(root);
    const ns: PNode[] = laid.descendants().map((n) => ({ id: n.data.id, x: n.x, y: n.y, depth: n.depth }));
    const ls: PLink[] = laid.links().map((l) => ({
      id: `${l.source.data.id}->${l.target.data.id}`,
      sx: l.source.x, sy: l.source.y, tx: l.target.x, ty: l.target.y,
    }));
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
    return {
      nodes: ns, links: ls,
      bbox: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    };
  }, [index, collapsed]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const scale = clamp(Math.min(w / (bbox.maxX - bbox.minX + NODE_W), h / (bbox.maxY - bbox.minY + NODE_H)) * 0.9, MIN_SCALE, 1.2);
    const cx = (bbox.minX + bbox.maxX) / 2, cy = (bbox.minY + bbox.maxY) / 2;
    setView({ scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale });
  }, [bbox]);

  const fitted = useRef(false);
  useEffect(() => { if (!fitted.current) { fit(); fitted.current = true; } }, [fit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => {
        const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
        const wx = (mx - v.x) / v.scale, wy = (my - v.y) / v.scale;
        return { scale, x: mx - wx * scale, y: my - wy * scale };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Background pan.
  const pan = useRef<null | { sx: number; sy: number; ox: number; oy: number }>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pan.current;
      if (!p) return;
      setView((v) => ({ ...v, x: p.ox + (e.clientX - p.sx), y: p.oy + (e.clientY - p.sy) }));
    };
    const onUp = () => { pan.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);
  const onBgPointerDown = (e: React.PointerEvent) => {
    pan.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  };

  const zoomBy = (factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    const cx = el.clientWidth / 2, cy = el.clientHeight / 2;
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
      const wx = (cx - v.x) / v.scale, wy = (cy - v.y) / v.scale;
      return { scale, x: cx - wx * scale, y: cy - wy * scale };
    });
  };

  const rolesByGroup = useMemo(() => {
    const m = new Map<string, FormaRole[]>();
    for (const r of roles) (m.get(r.group) ?? m.set(r.group, []).get(r.group)!).push(r);
    return m;
  }, [roles]);
  const groupOrder = [
    ...(FORMA_GROUPS as readonly string[]).filter((g) => rolesByGroup.has(g)),
    ...[...rolesByGroup.keys()].filter((g) => !(FORMA_GROUPS as readonly string[]).includes(g)),
  ];

  return (
    <div
      ref={containerRef}
      onPointerDown={onBgPointerDown}
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_1px_1px,theme(colors.border)_1px,transparent_0)] [background-size:22px_22px] active:cursor-grabbing"
    >
      {/* Role picker */}
      <div className="absolute left-3 top-3 z-10" onPointerDown={(e) => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/90 px-2.5 py-1.5 text-xs shadow-sm backdrop-blur transition-colors hover:border-border">
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

      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg className="absolute left-0 top-0 overflow-visible text-muted-foreground/40" width={1} height={1}>
          {links.map((l) => (
            <path key={l.id} d={elbow(l.sx, l.sy, l.tx, l.ty)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
        </svg>

        {nodes.map((n) => {
          if (n.id === ROOT) {
            return (
              <div key={n.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: n.x, top: n.y }}>
                <OrgNode color={ROOT_COLOR} label={rootLabel} sublabel="all folders" root />
              </div>
            );
          }
          const folder = index.byId.get(n.id);
          if (!folder) return null;
          const eff = resolveEffectiveTier(n.id, explicit, index.byId);
          const color = TIER_COLOR[eff.tier];
          const hasKids = (index.childrenOf.get(n.id) ?? []).length > 0;
          const isCollapsed = collapsed.has(n.id);
          return (
            <div
              key={n.id}
              data-node-id={n.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: n.x, top: n.y }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="outline-none">
                    <OrgNode
                      color={color}
                      label={folder.name}
                      sublabel={TIER_SHORT[eff.tier] + (eff.inherited ? " · inherited" : "")}
                      inherited={eff.inherited}
                      open={hasKids && !isCollapsed}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="min-w-[13rem]">
                  <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">{folder.name}</DropdownMenuLabel>
                  {FORMA_TIERS.map((t) => (
                    <DropdownMenuItem key={t} onSelect={() => onSetTier(n.id, t)} className="cursor-pointer gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: TIER_COLOR[t] }} />
                      <span className="flex-1 text-[13px]">{t}</span>
                      {t === eff.tier && <Check className="h-3.5 w-3.5 text-foreground" />}
                    </DropdownMenuItem>
                  ))}
                  {hasKids && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onApplySubtree(n.id, eff.tier)} className="cursor-pointer gap-2 text-[13px]">
                        <Layers className="h-3.5 w-3.5" /> Apply “{TIER_SHORT[eff.tier]}” to subtree
                      </DropdownMenuItem>
                    </>
                  )}
                  {eff.sourceId === n.id && (
                    <DropdownMenuItem onSelect={() => onClear(n.id)} className="cursor-pointer gap-2 text-[13px]">
                      <Undo2 className="h-3.5 w-3.5" /> Clear override
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {hasKids && (
                <button
                  type="button"
                  onClick={() => toggle(n.id)}
                  className="absolute -bottom-0.5 left-1/2 grid h-4 w-4 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full border border-border bg-card text-[10px] font-bold leading-none text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                  aria-label={isCollapsed ? "expand" : "collapse"}
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  {isCollapsed ? "+" : "−"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* hint */}
      <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
        Click a folder to set its tier for this role · drag to pan · scroll to zoom
      </div>

      {/* controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button type="button" onClick={() => zoomBy(1.2)} className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="zoom in"><Plus className="h-4 w-4" /></button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="zoom out"><Minus className="h-4 w-4" /></button>
        <button type="button" onClick={fit} className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="fit"><Maximize2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
