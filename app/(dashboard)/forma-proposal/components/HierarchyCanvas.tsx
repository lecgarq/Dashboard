"use client";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import {
  Maximize2, Plus, Minus, Check, Layers, Undo2, ChevronDown, ChevronRight, UserRound,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/core/utils";
import {
  resolveEffectiveTier, type ExplicitMap, type FolderIndex,
} from "@/lib/forma/inheritance";
import {
  FORMA_TIERS, NO_ACCESS, TIER_COLOR, TIER_SHORT, TIER_GROUP, TIER_GROUP_ORDER, type FormaTier,
} from "@/lib/forma/tiers";
import { FORMA_GROUPS, type FormaRole } from "@/lib/forma/defaultRoles";
import { OrgNode } from "./OrgNode";
import {
  ROOT, NODE_W, NODE_H, MIN_SCALE, MAX_SCALE, clamp, curve,
  type VNode, type VLink,
} from "./useHierarchyLayout";

// Brand azul, one step per theme (OrgNode concatenates hex-alpha, so this must
// stay a hex literal, not var(--primary)).
const ROOT_COLOR_DARK = "#4e8ccb";
const ROOT_COLOR_LIGHT = "#2e5f95";

// ─── TierMenuItems (render-only, stays with the canvas) ───────────────────────

function TierMenuItems({ current, onPick }: { current: FormaTier; onPick: (t: FormaTier) => void }) {
  return (
    <>
      <DropdownMenuItem onSelect={() => onPick(NO_ACCESS)} className="cursor-pointer gap-2.5">
        <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: TIER_COLOR[NO_ACCESS] }} />
        <span className="flex-1 text-[13px]">No access</span>
        {current === NO_ACCESS && <Check className="h-3.5 w-3.5 text-foreground" />}
      </DropdownMenuItem>
      {TIER_GROUP_ORDER.map((g) => (
        <Fragment key={g}>
          <DropdownMenuLabel className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground/70">{g}</DropdownMenuLabel>
          {FORMA_TIERS.filter((t) => TIER_GROUP[t] === g).map((t) => (
            <DropdownMenuItem key={t} onSelect={() => onPick(t)} className="cursor-pointer gap-2.5">
              <span className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: TIER_COLOR[t] }} />
              <span className="flex-1 text-[13px]">{t}</span>
              {current === t && <Check className="h-3.5 w-3.5 text-foreground" />}
            </DropdownMenuItem>
          ))}
        </Fragment>
      ))}
    </>
  );
}

// ─── HierarchyCanvas props ────────────────────────────────────────────────────

export interface HierarchyCanvasProps {
  // From useHierarchyLayout:
  nodes: VNode[];
  links: VLink[];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  // Public 8-prop API forwarded from HierarchyView shell:
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
}

// ─── HierarchyCanvas ─────────────────────────────────────────────────────────

export function HierarchyCanvas({
  nodes, links, bbox, collapsed, onToggle,
  index, explicit, rootLabel, roles, activeRoleId, activeRoleLabel,
  onPickRole, onSetTier, onApplySubtree, onClear,
}: HierarchyCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const { resolvedTheme } = useTheme();
  const ROOT_COLOR = resolvedTheme !== "light" ? ROOT_COLOR_DARK : ROOT_COLOR_LIGHT;

  // fit: computed from bbox + containerRef (both live here in the canvas)
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const scale = clamp(
      Math.min(w / (bbox.maxX - bbox.minX + NODE_W), h / (bbox.maxY - bbox.minY + NODE_H)) * 0.9,
      MIN_SCALE,
      1.1,
    );
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    setView({ scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale });
  }, [bbox]);

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) {
      fit();
      fitted.current = true;
    }
  }, [fit]);

  // Re-fit when bbox changes (collapsed/expanded tree)
  useEffect(() => {
    fitted.current = false;
  }, [bbox]);

  // wheel = pan (scroll); ctrl/⌘+wheel = zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        setView((v) => {
          const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
          const wx = (mx - v.x) / v.scale, wy = (my - v.y) / v.scale;
          return { scale, x: mx - wx * scale, y: my - wy * scale };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
    for (const r of roles) {
      const a = m.get(r.group);
      if (a) a.push(r);
      else m.set(r.group, [r]);
    }
    return m;
  }, [roles]);

  const declared = FORMA_GROUPS as readonly string[];
  const groupOrder = [
    ...declared.filter((g) => rolesByGroup.has(g)),
    ...[...rolesByGroup.keys()].filter((g) => !declared.includes(g)),
  ];

  return (
    <div
      ref={containerRef}
      onPointerDown={(e) => { pan.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y }; }}
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_1px_1px,theme(colors.border)_1px,transparent_0)] [background-size:24px_24px] active:cursor-grabbing"
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        <svg className="absolute left-0 top-0 overflow-visible text-muted-foreground/35" width={1} height={1}>
          {links.map((l) => (
            <path key={l.id} d={curve(l.sx, l.sy, l.tx, l.ty)} fill="none" stroke="currentColor" strokeWidth={1.5} />
          ))}
        </svg>

        {nodes.map((n) => {
          const isRoot = n.id === ROOT;
          const folder = isRoot ? null : index.byId.get(n.id);
          if (!isRoot && !folder) return null;
          const eff = isRoot ? null : resolveEffectiveTier(n.id, explicit, index.byId);
          const color = isRoot ? ROOT_COLOR : TIER_COLOR[eff!.tier];
          const hasKids = isRoot ? false : (index.childrenOf.get(n.id) ?? []).length > 0;
          const isCollapsed = collapsed.has(n.id);
          return (
            <div
              key={n.id}
              className="group/node absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: n.x, top: n.y }}
              onPointerDown={isRoot ? undefined : (e) => e.stopPropagation()}
            >
              {isRoot ? (
                <OrgNode color={color} label={rootLabel} root />
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="cursor-pointer outline-none">
                      <OrgNode
                        color={color}
                        label={folder!.name}
                        tierShort={TIER_SHORT[eff!.tier]}
                        inherited={eff!.inherited}
                        open={hasKids && !isCollapsed}
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="max-h-[70vh] min-w-[15rem] overflow-y-auto">
                    <DropdownMenuLabel className="truncate text-[11px] text-muted-foreground">
                      {folder!.name}
                    </DropdownMenuLabel>
                    <TierMenuItems current={eff!.tier} onPick={(t) => onSetTier(n.id, t)} />
                    {hasKids && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => onApplySubtree(n.id, eff!.tier)}
                          className="cursor-pointer gap-2 text-[13px]"
                        >
                          <Layers className="h-3.5 w-3.5" /> Apply "{TIER_SHORT[eff!.tier]}" to subtree
                        </DropdownMenuItem>
                      </>
                    )}
                    {eff!.sourceId === n.id && (
                      <DropdownMenuItem
                        onSelect={() => onClear(n.id)}
                        className="cursor-pointer gap-2 text-[13px]"
                      >
                        <Undo2 className="h-3.5 w-3.5" /> Clear override
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {hasKids && (
                <button
                  type="button"
                  onClick={() => onToggle(n.id)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute left-1/2 top-[58px] grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                  aria-label={isCollapsed ? "expand" : "collapse"}
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* role picker */}
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
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  {g}
                </DropdownMenuLabel>
                {(rolesByGroup.get(g) ?? []).map((r) => (
                  <DropdownMenuItem
                    key={r.id}
                    onSelect={() => onPickRole(r.id)}
                    className="cursor-pointer gap-2 text-[13px]"
                  >
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
        Scroll to move · drag to pan · ⌘/Ctrl+scroll or +/− to zoom · click a folder to set its tier
      </div>

      {/* controls */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => zoomBy(1.2)}
          className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground"
          aria-label="zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground"
          aria-label="zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={fit}
          className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground"
          aria-label="fit"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
