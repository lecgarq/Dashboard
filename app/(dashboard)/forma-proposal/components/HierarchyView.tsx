"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stratify, tree } from "d3-hierarchy";
import { Maximize2, Plus, Minus, MousePointer2 } from "lucide-react";
import { cn } from "@/lib/core/utils";
import {
  canReparent, toOrgInput, HIERARCHY_ROOT, type HierarchyMap, type OrgInput,
} from "@/lib/forma/hierarchy";
import type { FormaRole } from "@/lib/forma/defaultRoles";
import { OrgNode } from "./OrgNode";

const NODE_W = 172;
const NODE_H = 138;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1.6;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface PositionedNode { id: string; x: number; y: number; depth: number }
interface PositionedLink { id: string; sx: number; sy: number; tx: number; ty: number }

function elbow(sx: number, sy: number, tx: number, ty: number): string {
  const my = (sy + ty) / 2;
  return `M${sx},${sy} L${sx},${my} L${tx},${my} L${tx},${ty}`;
}

type Interaction =
  | { mode: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { mode: "node"; roleId: string; sx: number; sy: number; moved: boolean }
  | null;

export function HierarchyView({
  roles, hierarchy, coverage, folderCount, onSelectRole, onReparent,
}: {
  roles: FormaRole[];
  hierarchy: HierarchyMap;
  coverage: Record<string, number>;
  folderCount: number;
  onSelectRole: (roleId: string) => void;
  onReparent: (roleId: string, parentId: string | null) => void;
}) {
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const { nodes, links, bbox } = useMemo(() => {
    const input = toOrgInput(roles.map((r) => r.id), hierarchy);
    const root = stratify<OrgInput>().id((d) => d.id).parentId((d) => d.parentId)(input);
    const laid = tree<OrgInput>().nodeSize([NODE_W, NODE_H])(root);
    const ns: PositionedNode[] = laid.descendants().map((n) => ({ id: n.data.id, x: n.x, y: n.y, depth: n.depth }));
    const ls: PositionedLink[] = laid.links().map((l) => ({
      id: `${l.source.data.id}->${l.target.data.id}`,
      sx: l.source.x, sy: l.source.y, tx: l.target.x, ty: l.target.y,
    }));
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y);
    return {
      nodes: ns, links: ls,
      bbox: { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) },
    };
  }, [roles, hierarchy]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth, h = el.clientHeight;
    const contentW = bbox.maxX - bbox.minX + NODE_W;
    const contentH = bbox.maxY - bbox.minY + NODE_H;
    const scale = clamp(Math.min(w / contentW, h / contentH) * 0.9, MIN_SCALE, 1.2);
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    setView({ scale, x: w / 2 - cx * scale, y: h / 2 - cy * scale });
  }, [bbox]);

  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current) { fit(); fitted.current = true; }
  }, [fit]);

  // Non-passive wheel zoom (around the cursor).
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

  // Drag (pan + node reparent) via window listeners reading a ref.
  const interaction = useRef<Interaction>(null);
  const dropRef = useRef<string | null | undefined>(undefined); // undefined=none, null=top, string=roleId
  const [dragRole, setDragRole] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);

  const setDrop = (v: string | null | undefined) => { dropRef.current = v; setDropTarget(v); };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const it = interaction.current;
      if (!it) return;
      if (it.mode === "pan") {
        setView((v) => ({ ...v, x: it.ox + (e.clientX - it.sx), y: it.oy + (e.clientY - it.sy) }));
        return;
      }
      // node drag
      const dist = Math.hypot(e.clientX - it.sx, e.clientY - it.sy);
      if (!it.moved && dist > 5) { it.moved = true; setDragRole(it.roleId); }
      if (it.moved) {
        setGhost({ x: e.clientX, y: e.clientY });
        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const nodeEl = el?.closest("[data-node-id]") as HTMLElement | null;
        const tid = nodeEl?.getAttribute("data-node-id") ?? null;
        if (tid && tid !== it.roleId && tid !== HIERARCHY_ROOT && canReparent(it.roleId, tid, hierarchy)) {
          setDrop(tid);
        } else {
          setDrop(null); // empty canvas / root / invalid → top level
        }
      }
    };
    const onUp = () => {
      const it = interaction.current;
      interaction.current = null;
      if (it?.mode === "node") {
        if (it.moved) {
          const target = dropRef.current;
          if (target === null) onReparent(it.roleId, null);
          else if (typeof target === "string") onReparent(it.roleId, target);
        } else {
          onSelectRole(it.roleId);
        }
      }
      setDragRole(null);
      setGhost(null);
      setDrop(undefined);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [hierarchy, onReparent, onSelectRole]);

  const onBgPointerDown = (e: React.PointerEvent) => {
    interaction.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y };
  };
  const onNodePointerDown = (e: React.PointerEvent, roleId: string) => {
    e.stopPropagation();
    interaction.current = { mode: "node", roleId, sx: e.clientX, sy: e.clientY, moved: false };
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

  return (
    <div
      ref={containerRef}
      onPointerDown={onBgPointerDown}
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_1px_1px,theme(colors.border)_1px,transparent_0)] [background-size:22px_22px] active:cursor-grabbing"
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <svg className="absolute left-0 top-0 overflow-visible text-muted-foreground/40" width={1} height={1}>
          {links.map((l) => (
            <path key={l.id} d={elbow(l.sx, l.sy, l.tx, l.ty)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
        </svg>

        {nodes.map((n) => {
          const isRoot = n.id === HIERARCHY_ROOT;
          const role = roleById.get(n.id);
          return (
            <div
              key={n.id}
              data-node-id={n.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: n.x, top: n.y }}
              onPointerDown={isRoot ? undefined : (e) => onNodePointerDown(e, n.id)}
            >
              <OrgNode
                depth={n.depth}
                root={isRoot}
                label={isRoot ? "Roles" : role?.label ?? n.id}
                coverage={isRoot ? undefined : coverage[n.id] ?? 0}
                total={folderCount}
                dropTarget={dropTarget === n.id}
                dimmed={dragRole !== null && dragRole !== n.id && dropTarget !== n.id && !isRoot}
              />
            </div>
          );
        })}
      </div>

      {/* hint */}
      <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
        <MousePointer2 className="h-3 w-3" /> Drag a role onto another to set its manager · click to edit
      </div>

      {/* controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button type="button" onClick={() => zoomBy(1.2)} className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="zoom in">
          <Plus className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.2)} className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="zoom out">
          <Minus className="h-4 w-4" />
        </button>
        <button type="button" onClick={fit} className="grid h-8 w-8 place-items-center rounded-md border border-border/70 bg-card text-foreground/80 shadow-sm transition-colors hover:text-foreground" aria-label="fit to view">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* drag ghost */}
      {dragRole && ghost && (
        <div
          className={cn(
            "pointer-events-none fixed z-50 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-lg",
            dropTarget ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground",
          )}
          style={{ left: ghost.x + 12, top: ghost.y + 12 }}
        >
          {roleById.get(dragRole)?.label ?? dragRole}
          <span className="ml-1 font-normal opacity-70">
            {dropTarget === null || dropTarget === undefined ? "→ top" : "→ under"}
          </span>
        </div>
      )}
    </div>
  );
}
