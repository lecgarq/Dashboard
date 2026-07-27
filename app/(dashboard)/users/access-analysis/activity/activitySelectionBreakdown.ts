/**
 * activitySelectionBreakdown.ts — lasso → live per-attribute analytics.
 *
 * Pure aggregation for the activity-universe selection panel: given the FULL
 * indices a lasso captured, histogram every resident dimension (verb, module,
 * object type, month, author role, author company, project, author) straight
 * off the payload's int columns — zero fetches, same dicts the hover/legend use.
 * Labels resolve through dimensionLabels (project GUIDs via projectNames). No
 * React/DOM/IO so it stays unit-testable and reusable.
 */

import {
  ACTIVITY_DIMENSIONS,
  dimensionLabels,
} from "./activityDimensions";

export interface BreakdownCategory {
  label: string;
  count: number;
}

export interface DimensionBreakdown {
  /** Dimension id ("verb", "role", "author", …). */
  id: string;
  /** Human dimension label ("Verb", "Author role", …). */
  label: string;
  /** Distinct categories present in the selection (includes the sentinel). */
  distinct: number;
  /** Selected events with a real (non-sentinel) id; equals total for sentinel-free dims. */
  covered: number;
  /** Selection size. */
  total: number;
  /** Top categories by count, highest first. */
  top: BreakdownCategory[];
}

/**
 * Build a ranked breakdown of `fullIndices` across every activity dimension.
 * `topN` optionally caps each dimension's category list.
 */
export function buildSelectionBreakdown(
  fullIndices: ArrayLike<number>,
  columns: Record<string, ArrayLike<number> | undefined>,
  dicts: Record<string, unknown>,
  projectNames: Record<string, string> | undefined,
  topN = Number.POSITIVE_INFINITY,
): DimensionBreakdown[] {
  const total = fullIndices.length;
  const out: DimensionBreakdown[] = [];

  for (const dim of ACTIVITY_DIMENSIONS) {
    const col = columns[dim.column];
    if (!col) continue;
    const labels = dimensionLabels(dim, dicts, projectNames);
    const counts = new Map<number, number>();
    let covered = 0;

    for (let k = 0; k < total; k++) {
      const id = col[fullIndices[k]] ?? 0;
      if (!dim.hasSentinel || id !== 0) covered += 1;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([id, count]) => ({ label: labels[id] ?? `#${id}`, count }));

    out.push({
      id: dim.id,
      label: dim.label,
      distinct: counts.size,
      covered: dim.hasSentinel ? covered : total,
      total,
      top,
    });
  }

  return out;
}
