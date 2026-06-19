"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { stratify, tree } from "d3-hierarchy";
import type { ExplicitMap, FolderIndex, FormaFolder } from "@/lib/forma/inheritance";

// ─── Constants & types ────────────────────────────────────────────────────────

export const ROOT = "__root__";
export const NODE_W = 168;
export const NODE_H = 132;
export const MIN_SCALE = 0.3;
export const MAX_SCALE = 1.6;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface VNode { id: string; x: number; y: number; depth: number }
export interface VLink { id: string; sx: number; sy: number; tx: number; ty: number }

/** Smooth vertical bezier between node centres. */
export function curve(sx: number, sy: number, tx: number, ty: number): string {
  const my = (sy + ty) / 2;
  return `M${sx},${sy} C${sx},${my} ${tx},${my} ${tx},${ty}`;
}

export const sortFolders = (arr: readonly FormaFolder[]): FormaFolder[] =>
  [...arr].sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name));

export function initialCollapsed(index: FolderIndex): Set<string> {
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface HierarchyLayoutResult {
  nodes: VNode[];
  links: VLink[];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  collapsed: Set<string>;
  toggle: (id: string) => void;
  /** fit is exposed as a stable no-arg callback; it requires a DOM ref that
   *  lives in the canvas, so the canvas must call setFitCallback once it has
   *  a ref. Use the simpler bbox-only approach: the hook returns bbox and the
   *  canvas computes fit locally. */
}

/**
 * Layout hook: owns collapsed state, the visible-folder walk, and the
 * d3-hierarchy stratify + tree computation.  The canvas is responsible for
 * computing `fit` using its own containerRef and the bbox returned here.
 */
export function useHierarchyLayout(
  index: FolderIndex,
  explicit: ExplicitMap,
): HierarchyLayoutResult {
  // explicit is consumed by the canvas (resolveEffectiveTier); we accept it here
  // so the hook signature mirrors the full context available at the call site.
  void explicit;

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
      if (!collapsed.has(f.id))
        for (const c of sortFolders(index.childrenOf.get(f.id) ?? [])) walk(c);
    };
    for (const r of sortFolders(index.roots)) walk(r);

    const ids = new Set(visible.map((f) => f.id));
    const input = [
      { id: ROOT, parentId: null as string | null },
      ...visible.map((f) => ({
        id: f.id,
        parentId: f.parentId && ids.has(f.parentId) ? f.parentId : ROOT,
      })),
    ];

    const root = stratify<{ id: string; parentId: string | null }>()
      .id((d) => d.id)
      .parentId((d) => d.parentId)(input);

    const laid = tree<{ id: string; parentId: string | null }>().nodeSize([NODE_W, NODE_H])(root);

    const ns: VNode[] = laid
      .descendants()
      .map((n) => ({ id: n.data.id, x: n.x, y: n.y, depth: n.depth }));

    const ls: VLink[] = laid.links().map((l) => ({
      id: `${l.source.data.id}->${l.target.data.id}`,
      sx: l.source.x,
      sy: l.source.y,
      tx: l.target.x,
      ty: l.target.y,
    }));

    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    return {
      nodes: ns,
      links: ls,
      bbox: {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      },
    };
  }, [index, collapsed]);

  return { nodes, links, bbox, collapsed, toggle };
}
