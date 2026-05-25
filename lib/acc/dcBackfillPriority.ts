/**
 * DC backfill slice priority ordering.
 *
 * Pure module — no Prisma, no fs, no fetch. Accepts a list of Slice objects
 * and a project-priority map, and returns a NEW array sorted by a fully
 * deterministic total order so the most important work runs first.
 *
 * Single responsibility: reorder-only adapter. Fairness / quota logic lives
 * elsewhere (YAGNI).
 */
import type { Slice, SliceReason } from './dcProgressiveBackfill';

/** Maps a SliceReason to a numeric tiebreak weight (lower = higher priority). */
const REASON_ORDER: Record<SliceReason, number> = {
  'new-project': 0,
  'forward': 1,
  'backward': 2,
};

/**
 * Returns the minimum priority rank for a slice across all of its projectIds.
 * Any projectId absent from `priorityByProjectId` contributes `+Infinity`.
 */
function minRankForSlice(
  slice: Slice,
  priorityByProjectId: Map<string, number>,
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const id of slice.projectIds) {
    const rank = priorityByProjectId.get(id) ?? Number.POSITIVE_INFINITY;
    if (rank < min) {
      min = rank;
    }
  }
  return min;
}

/**
 * Returns a new array of `slices` sorted by a fully deterministic total order.
 *
 * Sort key (lower = earlier in result):
 *  1. Primary   — min priority rank across member projectIds (absent → Infinity).
 *  2. Tiebreak 1 — reason: `new-project` (0) < `forward` (1) < `backward` (2).
 *  3. Tiebreak 2 — `start` ascending (earlier start.getTime() first).
 *  4. Tiebreak 3 — `end` ascending.
 *  5. Tiebreak 4 — first projectId in the slice's `projectIds` array, lexicographic.
 *
 * The input array and all Slice objects are never mutated.
 *
 * Precondition: each Slice is expected to have at least one projectId
 * (`projectIds.length >= 1`). The `Slice` type does not enforce non-emptiness,
 * so an empty `projectIds` array is tolerated — its Tiebreak 4 key falls back to
 * `''` (sorting it before any non-empty first projectId). Callers should not
 * rely on this fallback; it exists only to keep the comparator total.
 */
export function orderSlicesByPriority(
  slices: Slice[],
  priorityByProjectId: Map<string, number>,
): Slice[] {
  return slices.slice().sort((a, b) => {
    // 1. Primary: min rank.
    // Ranks are finite integers or +Infinity. The `rankA !== rankB` guard means
    // we only subtract when they differ, so we never compute Infinity - Infinity
    // (which is NaN). The both-Infinity case (all projectIds unmapped on both
    // sides) falls through to the reason/start/end/projectId tiebreaks below.
    const rankA = minRankForSlice(a, priorityByProjectId);
    const rankB = minRankForSlice(b, priorityByProjectId);
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // 2. Tiebreak 1: reason order
    const reasonDiff = REASON_ORDER[a.reason] - REASON_ORDER[b.reason];
    if (reasonDiff !== 0) {
      return reasonDiff;
    }

    // 3. Tiebreak 2: start ascending
    const startDiff = a.start.getTime() - b.start.getTime();
    if (startDiff !== 0) {
      return startDiff;
    }

    // 4. Tiebreak 3: end ascending
    const endDiff = a.end.getTime() - b.end.getTime();
    if (endDiff !== 0) {
      return endDiff;
    }

    // 5. Tiebreak 4: first projectId lexicographic
    const firstA = a.projectIds[0] ?? '';
    const firstB = b.projectIds[0] ?? '';
    return firstA.localeCompare(firstB);
  });
}
