/**
 * selectionAggregates.ts — Pure, in-memory aggregation for the lasso SelectionPanel.
 *
 * Replaces the DuckDB inline-`IN (<all selected ids>)` queries (the retired
 * selectionQueries.ts) that parsed ~17k-literal SQL strings twice per lasso. The
 * lasso panel summarizes what the SELECTED GRAPH NODES already carry, so we
 * aggregate straight off the feature snapshot — O(selection), no SQL, no async.
 *
 * Semantics (Phase 5 decision): aggregate snapshot fields (role, permTier). The
 * folder-permission JOIN is intentionally NOT used here; a deeper folder-security
 * drilldown, if ever needed, is a separate surface — not the default lasso pie.
 */

import type { DonutSlice } from "./DonutPanel";
import type { NodeFeatureSnapshot } from "./interactionTypes";

/** Stable categorical palette (legible on the dark zinc background). */
export const PALETTE: readonly string[] = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#64748b", // slate
];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

/** Missing / empty categorical values bucket under this label. */
export const UNKNOWN_LABEL = "Unknown";

/**
 * Count `indices` into the feature snapshot by a categorical field. Same category
 * → same slice; null/empty → "Unknown". Returns slices ordered by count desc, then
 * label asc (deterministic), each assigned a palette color by rank.
 */
function aggregateField(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  indices: Iterable<number>,
  pick: (f: NodeFeatureSnapshot) => string | null | undefined,
): DonutSlice[] {
  const counts = new Map<string, number>();
  for (const i of indices) {
    const f = features[i];
    if (!f) continue;
    const raw = pick(f);
    const label = raw == null || raw === "" ? UNKNOWN_LABEL : String(raw);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return sorted.map(([label, value], i) => ({ label, value, color: colorForIndex(i) }));
}

/** Aggregate the selected nodes by role (snapshot `role`). */
export function aggregateSelectionByRole(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  indices: Iterable<number>,
): DonutSlice[] {
  return aggregateField(features, indices, (f) => f.role);
}

/** Aggregate the selected nodes by permission tier (snapshot `permTier`). */
export function aggregateSelectionByTier(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  indices: Iterable<number>,
): DonutSlice[] {
  return aggregateField(features, indices, (f) => f.permTier);
}

/** Aggregate the selected nodes by project (snapshot `project`). */
export function aggregateSelectionByProject(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  indices: Iterable<number>,
): DonutSlice[] {
  return aggregateField(features, indices, (f) => f.project);
}

/** Headline KPI counts for the lasso selection — total, external, admins, projects. */
export interface SelectionKpis {
  total: number;
  external: number;
  admins: number;
  projects: number;
}

/**
 * One-pass headline summary over the selected nodes. `admins` counts any instance
 * flagged `isAdmin` (project-admin); `projects` is the count of DISTINCT non-empty
 * project names touched by the selection.
 */
export function selectionKpis(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  indices: Iterable<number>,
): SelectionKpis {
  let total = 0;
  let external = 0;
  let admins = 0;
  const projects = new Set<string>();
  for (const i of indices) {
    const f = features[i];
    if (!f) continue;
    total++;
    if (f.isExternal) external++;
    if (f.isAdmin) admins++;
    if (f.project) projects.add(f.project);
  }
  return { total, external, admins, projects: projects.size };
}
