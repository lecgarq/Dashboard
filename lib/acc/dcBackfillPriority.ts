/**
 * DC backfill slice priority ordering and fairness-aware selection.
 *
 * Pure module — no Prisma, no fs, no fetch. Accepts a list of Slice objects
 * and a project-priority map, and returns a NEW array sorted by a fully
 * deterministic total order so the most important work runs first.
 *
 * Also exports `selectRunnableWithFairness` which applies a budget + fairness
 * reserve so that low-priority (but chronologically starved) projects are never
 * indefinitely deferred.
 */
import type { Slice, SliceReason } from './dcProgressiveBackfill';

/** Maps a SliceReason to a numeric tiebreak weight (lower = higher priority). */
const REASON_ORDER: Record<SliceReason, number> = {
  'new-project': 0,
  'forward': 1,
  'backward': 2,
};

/**
 * Returns the minimum value from `map` across all of a slice's projectIds.
 * Any projectId absent from `map` contributes `+Infinity`.
 * Used for both priority-rank and age-rank lookups.
 */
function minMappedRank(
  slice: Slice,
  map: Map<string, number>,
): number {
  let min = Number.POSITIVE_INFINITY;
  for (const id of slice.projectIds) {
    const rank = map.get(id) ?? Number.POSITIVE_INFINITY;
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
    const rankA = minMappedRank(a, priorityByProjectId);
    const rankB = minMappedRank(b, priorityByProjectId);
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


/**
 * Selects up to `budget` slices from a priority-ordered list, reserving
 * `reserve` slots for the most chronologically starved (oldest-progressed)
 * projects so that low-priority work is never indefinitely deferred.
 *
 * ### Exact semantics (deterministic, no mutation)
 * 1. `budget <= 0` → return `[]`.
 * 2. `effectiveReserve = clamp(reserve, 0, budget)`.
 * 3. Priority prefix = first `prefixCount = budget - effectiveReserve` slices
 *    of `sortedSlices` — auto-selected.
 * 4. Fairness picks come ONLY from the non-prefix tail (indices >= prefixCount).
 *    Each slice's age key = min ageRank among its member projectIds (absent →
 *    +Infinity). Sort tail by (ageKey asc, original index asc); take up to
 *    `effectiveReserve` of them.
 * 5. Top-up: if fewer than `budget` slices are selected (e.g. tail was shorter
 *    than `effectiveReserve`), fill from still-unselected tail slices in
 *    original index order until `budget` is reached or exhausted.
 * 6. Final list returned in original `sortedSlices` index order.
 * 7. Result length = `min(budget, sortedSlices.length)`. Never exceed `budget`;
 *    never include a slice twice.
 */
export function selectRunnableWithFairness(
  sortedSlices: Slice[],
  budget: number,
  reserve: number,
  ageRankByProjectId: Map<string, number>,
): Slice[] {
  // 1. Guard: nothing to do.
  if (budget <= 0) {
    return [];
  }

  // 2. Clamp reserve.
  const effectiveReserve = Math.min(Math.max(reserve, 0), budget);

  // 3. Priority prefix: first prefixCount elements are auto-selected.
  const prefixCount = budget - effectiveReserve;
  const selectedIndices = new Set<number>();

  for (let i = 0; i < prefixCount && i < sortedSlices.length; i++) {
    selectedIndices.add(i);
  }

  // 4. Fairness picks from the non-prefix tail.
  // Build an array of [originalIndex, ageKey] for tail items.
  const tailEntries: Array<{ idx: number; ageKey: number }> = [];
  for (let i = prefixCount; i < sortedSlices.length; i++) {
    tailEntries.push({
      idx: i,
      ageKey: minMappedRank(sortedSlices[i], ageRankByProjectId),
    });
  }

  // Sort tail by (ageKey asc, original index asc) — stable, deterministic.
  // tailEntries is a fresh local array; sort in place (no copy needed).
  const sortedTail = tailEntries.sort((a, b) => {
    if (a.ageKey !== b.ageKey) {
      // Both could be +Infinity; if equal the index tiebreak below handles it.
      // When one is +Infinity and the other finite, finite < +Infinity safely.
      return a.ageKey - b.ageKey;
    }
    return a.idx - b.idx;
  });

  let fairnessPicked = 0;
  for (const entry of sortedTail) {
    if (fairnessPicked >= effectiveReserve) {
      break;
    }
    // Invariant: tail indices are >= prefixCount; prefix only added indices
    // < prefixCount. The ranges are disjoint, so no tail entry can already be
    // selected. Assert loudly so a future refactor that breaks the invariant
    // fails immediately rather than silently producing a short result.
    if (selectedIndices.has(entry.idx)) {
      throw new Error(
        `dcBackfillPriority invariant violated: tail index ${entry.idx} was already selected (prefixCount=${prefixCount}). ` +
        `This indicates tailEntries contains an index that was added by the priority prefix, which must not happen.`,
      );
    }
    selectedIndices.add(entry.idx);
    fairnessPicked++;
  }

  // 5. Top-up: fill remaining budget slots from unselected tail in original order.
  if (selectedIndices.size < budget) {
    for (let i = prefixCount; i < sortedSlices.length; i++) {
      if (selectedIndices.size >= budget) {
        break;
      }
      if (!selectedIndices.has(i)) {
        selectedIndices.add(i);
      }
    }
  }

  // 6. Return selected slices in original sortedSlices index order.
  const result: Slice[] = [];
  for (let i = 0; i < sortedSlices.length; i++) {
    if (selectedIndices.has(i)) {
      result.push(sortedSlices[i]);
    }
  }

  return result;
}
