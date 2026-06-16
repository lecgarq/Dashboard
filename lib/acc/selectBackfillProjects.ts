export interface SelectBackfillInput {
  /**
   * The real extraction universe: active ∩ MTY-allowlist ∩ not-low-value-name,
   * already filtered upstream via isDcBackfillEligibleProject. Matches the
   * scope reported by scripts/dc-coverage-report.cjs.
   */
  eligibleIds: ReadonlySet<string>;
  /** projectId -> AccDcBackfillProgress.earliestCovered (null if a row exists but has no date). */
  earliestCoveredById: ReadonlyMap<string, Date | null>;
  /** projectId -> activity row count, used only for priority ordering. */
  activityCountById: ReadonlyMap<string, number>;
  /** All-time floor; a project whose earliestCovered <= floor is considered done. */
  floor: Date;
}

/**
 * Return the ordered list of project IDs that still need a backward backfill.
 *
 * A project qualifies when it is in the eligible set and has NOT yet been
 * covered back to the floor. Ordering is by activity count descending (most
 * valuable history first), with a deterministic id tiebreak so re-runs and
 * tests are stable.
 */
export function selectBackfillProjects(input: SelectBackfillInput): string[] {
  const floorMs = input.floor.getTime();
  const remaining: { id: string; count: number }[] = [];

  for (const id of input.eligibleIds) {
    const earliest = input.earliestCoveredById.get(id) ?? null;
    if (earliest && earliest.getTime() <= floorMs) continue; // already covered to floor
    remaining.push({ id, count: input.activityCountById.get(id) ?? 0 });
  }

  remaining.sort((x, y) => y.count - x.count || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return remaining.map((r) => r.id);
}
