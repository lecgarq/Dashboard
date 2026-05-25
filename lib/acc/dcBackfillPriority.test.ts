import { describe, it, expect } from 'vitest';
import { orderSlicesByPriority, selectRunnableWithFairness, composePrioritizedSlices } from './dcBackfillPriority';
import type { Slice } from './dcProgressiveBackfill';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSlice(
  projectIds: string[],
  reason: Slice['reason'],
  startISO: string,
  endISO: string,
): Slice {
  return {
    projectIds,
    start: new Date(startISO),
    end: new Date(endISO),
    reason,
  };
}

function serializeSlice(s: Slice) {
  return JSON.stringify({
    projectIds: [...s.projectIds].sort(),
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    reason: s.reason,
  });
}

// ---------------------------------------------------------------------------
// Test 1: Priority ordering
// ---------------------------------------------------------------------------

describe('orderSlicesByPriority — priority ordering', () => {
  it('places the slice with the smallest min-rank first', () => {
    const priorityByProjectId = new Map([
      ['proj-a', 5],
      ['proj-b', 2],
      ['proj-c', 8],
    ]);

    // sliceHigh: min rank = 5 (proj-a)
    const sliceHigh = makeSlice(['proj-a'], 'backward', '2024-01-01', '2024-01-31');
    // sliceLow: min rank = 2 (proj-b)
    const sliceLow = makeSlice(['proj-b'], 'backward', '2024-01-01', '2024-01-31');
    // sliceUnmapped: projectId not in map → rank = Infinity → sorts last
    const sliceUnmapped = makeSlice(['proj-z'], 'backward', '2024-01-01', '2024-01-31');
    // sliceMixed: min rank = min(5, 8) = 5, same as sliceHigh
    const sliceMixed = makeSlice(['proj-a', 'proj-c'], 'backward', '2024-01-01', '2024-01-31');

    const input = [sliceUnmapped, sliceHigh, sliceMixed, sliceLow];
    const result = orderSlicesByPriority(input, priorityByProjectId);

    // sliceLow (rank 2) must be first
    expect(result[0]).toBe(sliceLow);
    // sliceUnmapped (rank Infinity) must be last
    expect(result[result.length - 1]).toBe(sliceUnmapped);
  });

  it('sorts a slice with unmapped projectId after all mapped slices', () => {
    const priorityByProjectId = new Map([['proj-a', 1]]);

    const sliceMapped = makeSlice(['proj-a'], 'forward', '2024-02-01', '2024-02-28');
    const sliceUnmapped = makeSlice(['proj-unknown'], 'forward', '2024-02-01', '2024-02-28');

    const result = orderSlicesByPriority([sliceUnmapped, sliceMapped], priorityByProjectId);

    expect(result[0]).toBe(sliceMapped);
    expect(result[1]).toBe(sliceUnmapped);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Permutation invariance
// ---------------------------------------------------------------------------

describe('orderSlicesByPriority — permutation invariance', () => {
  it('returns all input slices (same length, same multiset, no mutations)', () => {
    const priorityByProjectId = new Map([
      ['p1', 3],
      ['p2', 1],
      ['p3', 7],
    ]);

    const slice1 = makeSlice(['p1'], 'new-project', '2024-01-01', '2024-01-31');
    const slice2 = makeSlice(['p2'], 'forward', '2024-02-01', '2024-02-29');
    const slice3 = makeSlice(['p3'], 'backward', '2023-12-01', '2023-12-31');

    // Snapshot original state before calling
    const originalProjectIds = slice1.projectIds.slice();
    const originalStart = new Date(slice1.start.getTime());
    const originalEnd = new Date(slice1.end.getTime());

    const input = [slice1, slice2, slice3];
    const inputSnapshot = input.map(serializeSlice);
    const result = orderSlicesByPriority(input, priorityByProjectId);

    // Same length
    expect(result).toHaveLength(input.length);

    // Same multiset: sort serializations of both arrays and compare
    const resultSorted = result.map(serializeSlice).sort();
    const inputSorted = inputSnapshot.slice().sort();
    expect(resultSorted).toEqual(inputSorted);

    // Input array was NOT mutated (same references in same positions)
    expect(input[0]).toBe(slice1);
    expect(input[1]).toBe(slice2);
    expect(input[2]).toBe(slice3);

    // Individual slice objects were NOT mutated
    expect(slice1.projectIds).toEqual(originalProjectIds);
    expect(slice1.start.getTime()).toBe(originalStart.getTime());
    expect(slice1.end.getTime()).toBe(originalEnd.getTime());
  });
});

// ---------------------------------------------------------------------------
// Test 3: Determinism — exercises every tiebreak
// ---------------------------------------------------------------------------

describe('orderSlicesByPriority — determinism and tiebreaks', () => {
  it('produces identical results on two calls with the same input', () => {
    const priorityByProjectId = new Map([
      ['p1', 1],
      ['p2', 1],
      ['p3', 1],
    ]);

    // All three have min-rank = 1, so tiebreaks matter
    // Tiebreak 1 (reason): new-project < forward < backward
    const sliceNewProject = makeSlice(['p1'], 'new-project', '2024-01-01', '2024-01-31');
    const sliceForward = makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31');
    const sliceBackward = makeSlice(['p3'], 'backward', '2024-01-01', '2024-01-31');

    const input = [sliceBackward, sliceForward, sliceNewProject];
    const result1 = orderSlicesByPriority(input, priorityByProjectId);
    const result2 = orderSlicesByPriority(input, priorityByProjectId);

    expect(result1.map(serializeSlice)).toEqual(result2.map(serializeSlice));
  });

  it('tiebreak 1: new-project < forward < backward', () => {
    const priorityByProjectId = new Map([['px', 1]]);

    const sliceNew = makeSlice(['px'], 'new-project', '2024-03-01', '2024-03-31');
    const sliceFwd = makeSlice(['px'], 'forward', '2024-03-01', '2024-03-31');
    const sliceBwd = makeSlice(['px'], 'backward', '2024-03-01', '2024-03-31');

    const result = orderSlicesByPriority([sliceBwd, sliceFwd, sliceNew], priorityByProjectId);

    expect(result[0]).toBe(sliceNew);
    expect(result[1]).toBe(sliceFwd);
    expect(result[2]).toBe(sliceBwd);
  });

  it('tiebreak 2: earlier start sorts first when rank+reason match', () => {
    const priorityByProjectId = new Map([['px', 1]]);

    const sliceLater = makeSlice(['px'], 'forward', '2024-06-01', '2024-06-30');
    const sliceEarlier = makeSlice(['px'], 'forward', '2024-01-01', '2024-01-31');

    const result = orderSlicesByPriority([sliceLater, sliceEarlier], priorityByProjectId);

    expect(result[0]).toBe(sliceEarlier);
    expect(result[1]).toBe(sliceLater);
  });

  it('tiebreak 3: earlier end sorts first when rank+reason+start match', () => {
    const priorityByProjectId = new Map([['px', 1]]);

    const sameStart = '2024-01-01';
    const sliceLonger = makeSlice(['px'], 'backward', sameStart, '2024-03-31');
    const sliceShorter = makeSlice(['px'], 'backward', sameStart, '2024-01-31');

    const result = orderSlicesByPriority([sliceLonger, sliceShorter], priorityByProjectId);

    expect(result[0]).toBe(sliceShorter);
    expect(result[1]).toBe(sliceLonger);
  });

  it('tiebreak 4: lexicographic first projectId when all else matches', () => {
    const priorityByProjectId = new Map([
      ['aaa', 1],
      ['bbb', 1],
    ]);

    const sliceB = makeSlice(['bbb', 'ccc'], 'new-project', '2024-01-01', '2024-01-31');
    const sliceA = makeSlice(['aaa', 'ccc'], 'new-project', '2024-01-01', '2024-01-31');

    const result = orderSlicesByPriority([sliceB, sliceA], priorityByProjectId);

    expect(result[0]).toBe(sliceA);
    expect(result[1]).toBe(sliceB);
  });

  it('empty priorityByProjectId map → every slice ranks Infinity, tiebreaks decide order', () => {
    // No project has a rank, so primary min-rank is +Infinity for every slice.
    // Ordering must fall through entirely to the reason → start → end → projectId
    // tiebreak chain.
    const emptyPriority = new Map<string, number>();

    // Construct slices so each successive tiebreak is the deciding one:
    //  - s1 wins on reason (new-project < forward).
    //  - s2 vs s3 tie on reason+start+end, decided by projectId (alpha < beta).
    //  - s3 vs s4 tie on reason, decided by start (Jan < Feb).
    //  - s5 loses on reason (backward).
    const s1 = makeSlice(['alpha'], 'new-project', '2024-01-01', '2024-01-31');
    const s2 = makeSlice(['alpha'], 'forward',     '2024-01-01', '2024-01-31');
    const s3 = makeSlice(['beta'],  'forward',     '2024-01-01', '2024-01-31');
    const s4 = makeSlice(['beta'],  'forward',     '2024-02-01', '2024-02-29');
    const s5 = makeSlice(['gamma'], 'backward',    '2024-01-01', '2024-01-31');

    const input = [s5, s4, s3, s2, s1];
    const result = orderSlicesByPriority(input, emptyPriority);

    expect(result[0]).toBe(s1); // new-project
    expect(result[1]).toBe(s2); // forward, alpha, Jan
    expect(result[2]).toBe(s3); // forward, beta, Jan
    expect(result[3]).toBe(s4); // forward, beta, Feb
    expect(result[4]).toBe(s5); // backward
  });

  it('full tiebreak chain produces a fully deterministic total order', () => {
    const priorityByProjectId = new Map([
      ['alpha', 2],
      ['beta', 2],
      ['gamma', 2],
      ['delta', 2],
      ['epsilon', 2],
    ]);

    // All same rank. Differentiated by tiebreaks in order.
    const s1 = makeSlice(['alpha'], 'new-project', '2024-01-01', '2024-01-31');  // TB1 wins
    const s2 = makeSlice(['alpha'], 'forward',     '2024-01-01', '2024-01-31');  // TB1 mid
    const s3 = makeSlice(['beta'],  'forward',     '2024-01-01', '2024-01-31');  // TB4 loses to s2
    const s4 = makeSlice(['beta'],  'forward',     '2024-02-01', '2024-02-29');  // TB2 loses to s3
    const s5 = makeSlice(['gamma'], 'backward',    '2024-01-01', '2024-01-31');  // TB1 loses

    const input = [s5, s4, s3, s2, s1];
    const result = orderSlicesByPriority(input, priorityByProjectId);

    expect(result[0]).toBe(s1); // new-project, alpha
    expect(result[1]).toBe(s2); // forward, alpha, Jan
    expect(result[2]).toBe(s3); // forward, beta, Jan
    expect(result[3]).toBe(s4); // forward, beta, Feb
    expect(result[4]).toBe(s5); // backward
  });
});

// ---------------------------------------------------------------------------
// Test 4: Edge cases
// ---------------------------------------------------------------------------

describe('orderSlicesByPriority — edge cases', () => {
  it('empty slices array returns []', () => {
    const priorityByProjectId = new Map([['p1', 1]]);
    const result = orderSlicesByPriority([], priorityByProjectId);
    expect(result).toEqual([]);
  });

  it('tolerates a slice with empty projectIds (Tiebreak 4 falls back to "")', () => {
    // Documents the conscious contract: orderSlicesByPriority expects each Slice
    // to have at least one projectId, but the comparator stays total when one is
    // empty. An empty-projectIds slice has min-rank +Infinity (no ids to look up)
    // and its Tiebreak 4 key is '' (the `?? ''` fallback), so it sorts before a
    // non-empty first projectId once all earlier tiebreaks tie.
    const priorityByProjectId = new Map<string, number>();

    // Both rank Infinity, same reason/start/end → decided purely by Tiebreak 4.
    const sliceEmpty = makeSlice([], 'forward', '2024-01-01', '2024-01-31');
    const sliceNonEmpty = makeSlice(['zzz'], 'forward', '2024-01-01', '2024-01-31');

    const result = orderSlicesByPriority([sliceNonEmpty, sliceEmpty], priorityByProjectId);

    // '' < 'zzz' lexicographically → empty-projectIds slice sorts first.
    expect(result[0]).toBe(sliceEmpty);
    expect(result[1]).toBe(sliceNonEmpty);

    // Comparator stayed total: no throw, both inputs returned.
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// selectRunnableWithFairness tests
// ---------------------------------------------------------------------------

describe('selectRunnableWithFairness — budget respected', () => {
  it('budget <= 0 returns []', () => {
    const s0 = makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31');
    const s1 = makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31');
    const ageRank = new Map([['p1', 1], ['p2', 2]]);

    expect(selectRunnableWithFairness([s0, s1], 0, 0, ageRank)).toEqual([]);
    expect(selectRunnableWithFairness([s0, s1], -5, 2, ageRank)).toEqual([]);
  });

  it('budget >= total returns all slices in original order', () => {
    const s0 = makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31');
    const s1 = makeSlice(['p2'], 'forward', '2024-02-01', '2024-02-28');
    const s2 = makeSlice(['p3'], 'backward', '2024-03-01', '2024-03-31');
    const sorted = [s0, s1, s2];
    const ageRank = new Map([['p1', 1], ['p2', 2], ['p3', 3]]);

    const result = selectRunnableWithFairness(sorted, 10, 2, ageRank);
    expect(result).toHaveLength(3);
    // Original order must be preserved
    expect(result[0]).toBe(s0);
    expect(result[1]).toBe(s1);
    expect(result[2]).toBe(s2);
  });

  it('returns exactly min(budget, total) slices; no duplicates', () => {
    const slices = Array.from({ length: 5 }, (_, i) =>
      makeSlice([`p${i}`], 'forward', '2024-01-01', '2024-01-31'),
    );
    const ageRank = new Map(slices.map((s, i) => [s.projectIds[0], i]));

    const result = selectRunnableWithFairness(slices, 3, 1, ageRank);
    expect(result).toHaveLength(3);
    // No duplicates: all references are unique
    const refs = new Set(result);
    expect(refs.size).toBe(3);
  });
});

describe('selectRunnableWithFairness — reserve clamping and zero-reserve', () => {
  it('reserve > budget: clamped to budget so all slots come from fairness (oldest-first)', () => {
    // 5 slices, budget 3, reserve 99 → effectiveReserve = 3, prefixCount = 0
    // All 3 selected come from fairness (oldest ageRank first)
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 10 (newest)
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 5
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 1 (oldest)
      makeSlice(['p3'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 2
      makeSlice(['p4'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 3
    ];
    const ageRank = new Map([['p0', 10], ['p1', 5], ['p2', 1], ['p3', 2], ['p4', 3]]);

    // All slices in tail (prefixCount = 0). Fairness picks oldest 3: p2(1), p3(2), p4(3)
    const result = selectRunnableWithFairness(slices, 3, 99, ageRank);
    expect(result).toHaveLength(3);
    // Result in original index order: p2 is index 2, p3 is index 3, p4 is index 4
    expect(result[0]).toBe(slices[2]); // p2
    expect(result[1]).toBe(slices[3]); // p3
    expect(result[2]).toBe(slices[4]); // p4
  });

  it('reserve == 0: no fairness slots; returns the first budget slices in priority order', () => {
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p3'], 'forward', '2024-01-01', '2024-01-31'),
    ];
    const ageRank = new Map([['p0', 10], ['p1', 1], ['p2', 2], ['p3', 3]]);

    const result = selectRunnableWithFairness(slices, 2, 0, ageRank);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(slices[0]);
    expect(result[1]).toBe(slices[1]);
  });
});

describe('selectRunnableWithFairness — fairness reserve honored', () => {
  it('the most starved (oldest) tail slice is included even when it is last in priority', () => {
    // 6 slices sorted by priority. budget=4, reserve=2 → prefix takes [0,1], fairness takes 2 from tail [2,3,4,5].
    // p5 has the smallest ageRank (most starved) so it should be in the fairness set.
    const slices = [
      makeSlice(['pA'], 'forward', '2024-01-01', '2024-01-31'), // index 0 — priority prefix
      makeSlice(['pB'], 'forward', '2024-01-01', '2024-01-31'), // index 1 — priority prefix
      makeSlice(['pC'], 'forward', '2024-01-01', '2024-01-31'), // index 2 — tail, ageRank 50
      makeSlice(['pD'], 'forward', '2024-01-01', '2024-01-31'), // index 3 — tail, ageRank 40
      makeSlice(['pE'], 'forward', '2024-01-01', '2024-01-31'), // index 4 — tail, ageRank 30
      makeSlice(['pF'], 'forward', '2024-01-01', '2024-01-31'), // index 5 — tail, ageRank 1 (most starved)
    ];
    const ageRank = new Map([
      ['pA', 99], ['pB', 99],
      ['pC', 50], ['pD', 40], ['pE', 30], ['pF', 1],
    ]);

    const result = selectRunnableWithFairness(slices, 4, 2, ageRank);
    expect(result).toHaveLength(4);

    // Prefix slices (indices 0,1) must be present
    expect(result).toContain(slices[0]);
    expect(result).toContain(slices[1]);

    // Fairness picks the 2 oldest from the tail: pF (ageRank 1) and pE (ageRank 30)
    expect(result).toContain(slices[5]); // pF — most starved
    expect(result).toContain(slices[4]); // pE — second most starved

    // pC (index 2) and pD (index 3) were NOT selected
    expect(result).not.toContain(slices[2]);
    expect(result).not.toContain(slices[3]);

    // Output is in original sortedSlices index order
    const indices = result.map(s => slices.indexOf(s));
    expect(indices).toEqual([0, 1, 4, 5]);
  });

  it('starvation surfaced: last-priority slice with oldest ageRank appears in result when reserve >= 1', () => {
    const slices = [
      makeSlice(['high1'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['high2'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['low'],   'backward', '2024-01-01', '2024-01-31'), // last in priority, most starved
    ];
    const ageRank = new Map([['high1', 100], ['high2', 200], ['low', 1]]);

    const result = selectRunnableWithFairness(slices, 2, 1, ageRank);
    expect(result).toHaveLength(2);
    // The high-priority slice (index 0) fills the prefix
    expect(result).toContain(slices[0]);
    // The most-starved low-priority slice (index 2) fills the fairness slot
    expect(result).toContain(slices[2]);
    // In original index order
    const indices = result.map(s => slices.indexOf(s));
    expect(indices).toEqual([0, 2]);
  });
});

describe('selectRunnableWithFairness — top-up', () => {
  it('tail exactly fills reserve: all tail items selected by fairness, no top-up needed', () => {
    // 4 slices, budget=4, reserve=3 → prefixCount=1, tail=[1,2,3] (3 items).
    // effectiveReserve=3, tail has exactly 3 items → fairness picks all 3 → total=4.
    // Top-up is not the observable mechanism here; fairness already fills the budget.
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p3'], 'forward', '2024-01-01', '2024-01-31'),
    ];
    const ageRank = new Map([['p0', 4], ['p1', 3], ['p2', 2], ['p3', 1]]);
    const result = selectRunnableWithFairness(slices, 4, 3, ageRank);
    expect(result).toHaveLength(4);
    // All slices returned in original order
    expect(result[0]).toBe(slices[0]);
    expect(result[1]).toBe(slices[1]);
    expect(result[2]).toBe(slices[2]);
    expect(result[3]).toBe(slices[3]);
  });

  it('fairness picks 3 oldest from 5-item tail; result is those 3 exact slices in original order', () => {
    // budget=3, reserve=3 → prefixCount=0, tail=all 5 slices, effectiveReserve=3.
    // Fairness picks the 3 oldest: p4(ageRank 1), p3(2), p2(3).
    // No top-up needed (fairness already reached budget).
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 5 (newest)
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 4
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 3
      makeSlice(['p3'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 2
      makeSlice(['p4'], 'forward', '2024-01-01', '2024-01-31'), // ageRank 1 (oldest)
    ];
    const ageRank = new Map([['p0', 5], ['p1', 4], ['p2', 3], ['p3', 2], ['p4', 1]]);

    const result = selectRunnableWithFairness(slices, 3, 3, ageRank);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(slices[2]); // p2 (original index 2)
    expect(result[1]).toBe(slices[3]); // p3 (original index 3)
    expect(result[2]).toBe(slices[4]); // p4 (original index 4)
  });

  it('top-up is the observable mechanism: tail shorter than effectiveReserve forces top-up to add specific slices', () => {
    // budget=5, reserve=4 → prefixCount=1.
    // 4 slices total → tail=[1,2,3] (only 3 items, shorter than effectiveReserve=4).
    // Fairness picks all 3 tail items (the 3 oldest by ageRank): p3(1), p2(2), p1(3).
    // After fairness: selected = {0,1,2,3} = 4 slots; budget=5 → top-up must add 1 more.
    // But ALL tail items are already selected → top-up finds nothing; result = min(5,4) = 4.
    //
    // To make top-up visibly ADD a slice: we need a scenario where fairness picks FEWER
    // than budget-prefixCount items AND the remaining tail item fills the gap.
    //
    // Setup: budget=4, reserve=3 → prefixCount=1, effectiveReserve=3.
    // 5 slices. Tail=[1,2,3,4] (4 items). Fairness picks 3 oldest: p4(1),p3(2),p2(3).
    // After fairness: selected = {0, 2, 3, 4} = 4 = budget. No top-up slot needed here.
    //
    // The truly observable top-up case: budget=4, reserve=2 → prefixCount=2.
    // 5 slices. Tail=[2,3,4] (3 items, > effectiveReserve=2 so fairness fills 2 slots).
    // Fairness picks 2 oldest from tail [2,3,4]: p4(ageRank 1) and p3(ageRank 2).
    // After fairness: selected = {0, 1, 3, 4} = 4 = budget. Still no leftover for top-up.
    //
    // True minimal observable case: budget=3, reserve=2 → prefixCount=1.
    // Tail has exactly 1 item (shorter than effectiveReserve=2).
    // Fairness picks that 1 item. Selected = 2, budget = 3. Top-up must add 1 more from tail.
    // But tail only had 1 item and it's already selected → top-up finds nothing.
    // Result length = min(3, 2) = 2.
    //
    // Correct setup for observable top-up:
    //   budget=4, reserve=3 → prefixCount=1, effectiveReserve=3.
    //   6 slices. Tail=[1,2,3,4,5]. Fairness picks 3 oldest by ageRank.
    //   We bias ageRanks so that ONLY 2 tail items have finite ageRank (others Infinity).
    //   Fairness picks those 2 (< effectiveReserve=3). Top-up fills 1 more from tail
    //   in original index order = the NEXT unselected tail item = slices[1] (lowest index).
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'), // prefix (index 0)
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'), // tail index 1, ageRank Infinity
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'), // tail index 2, ageRank Infinity
      makeSlice(['p3'], 'forward', '2024-01-01', '2024-01-31'), // tail index 3, ageRank 2 (starved)
      makeSlice(['p4'], 'forward', '2024-01-01', '2024-01-31'), // tail index 4, ageRank 1 (most starved)
      makeSlice(['p5'], 'forward', '2024-01-01', '2024-01-31'), // tail index 5, ageRank Infinity
    ];
    // Only p3 and p4 have finite ageRank — fairness will pick exactly those 2 (< reserve=3).
    // Top-up must then fill 1 more slot. The top-up loop walks original tail order (i=1,2,3,4,5)
    // and picks the first unselected: slices[1] (p1).
    const ageRank = new Map([['p3', 2], ['p4', 1]]);
    // budget=4, reserve=3 → prefixCount=1, effectiveReserve=3
    const result = selectRunnableWithFairness(slices, 4, 3, ageRank);

    expect(result).toHaveLength(4);
    // Prefix: slices[0]
    expect(result).toContain(slices[0]);
    // Fairness: slices[4] (p4, ageRank 1) and slices[3] (p3, ageRank 2)
    expect(result).toContain(slices[4]);
    expect(result).toContain(slices[3]);
    // Top-up: slices[1] (p1, first unselected tail item in original order)
    expect(result).toContain(slices[1]);
    // Verify exact identities in original index order
    const indices = result.map(s => slices.indexOf(s));
    expect(indices).toEqual([0, 1, 3, 4]);
    // slices[2] and slices[5] were NOT selected
    expect(result).not.toContain(slices[2]);
    expect(result).not.toContain(slices[5]);
  });

  it('top-up cannot fill beyond available slices: result length caps at total slice count', () => {
    // budget=5, reserve=3 → prefixCount=2.
    // Only 4 slices total → tail has 2 slices (indices 2,3).
    // Fairness picks both (2 < 3), top-up tries to fill 1 more but tail is exhausted.
    // Total = min(5, 4) = 4.
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p3'], 'forward', '2024-01-01', '2024-01-31'),
    ];
    const ageRank = new Map([['p0', 4], ['p1', 3], ['p2', 2], ['p3', 1]]);
    const result = selectRunnableWithFairness(slices, 5, 3, ageRank);
    expect(result).toHaveLength(4);
  });
});

describe('selectRunnableWithFairness — determinism', () => {
  it('identical inputs produce identical output across two calls', () => {
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'backward', '2024-01-01', '2024-01-31'),
      makeSlice(['p3'], 'backward', '2024-01-01', '2024-01-31'),
    ];
    const ageRank = new Map([['p0', 10], ['p1', 5], ['p2', 2], ['p3', 2]]); // p2 and p3 tie on ageRank

    const r1 = selectRunnableWithFairness(slices, 3, 1, ageRank);
    const r2 = selectRunnableWithFairness(slices, 3, 1, ageRank);

    expect(r1.map(s => slices.indexOf(s))).toEqual(r2.map(s => slices.indexOf(s)));
  });

  it('tie in ageRank resolved by original index (lower index wins)', () => {
    // budget=2, reserve=2 → prefixCount=0 (all in tail).
    // p0 ageRank=5, p1 ageRank=1, p2 ageRank=1 → p1 and p2 tie; p1 is original index 1, p2 is index 2 → p1 wins tie.
    // Fairness picks p1(idx1) and p2(idx2) over p0(idx0 but ageRank=5).
    // Wait: budget=2, effectiveReserve=2, prefixCount=0, tail=[0,1,2].
    // Sort tail by (ageKey asc, index asc): p1(1,idx1), p2(1,idx2), p0(5,idx0).
    // Take 2: p1, p2. In original index order: index1(p1), index2(p2).
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'), // idx 0, ageRank 5
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'), // idx 1, ageRank 1
      makeSlice(['p2'], 'forward', '2024-01-01', '2024-01-31'), // idx 2, ageRank 1
    ];
    const ageRank = new Map([['p0', 5], ['p1', 1], ['p2', 1]]);

    const result = selectRunnableWithFairness(slices, 2, 2, ageRank);
    expect(result).toHaveLength(2);
    // p1 and p2 selected (tied ageRank, lower index wins tiebreak vs p0)
    expect(result[0]).toBe(slices[1]); // p1, original index 1
    expect(result[1]).toBe(slices[2]); // p2, original index 2
  });
});

describe('selectRunnableWithFairness — no mutation', () => {
  it('input array and slice objects are not mutated', () => {
    const slices = [
      makeSlice(['p0'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'backward', '2024-01-01', '2024-01-31'),
    ];
    const inputCopy = slices.slice();
    const snapshotsBefore = slices.map(serializeSlice);
    const ageRank = new Map([['p0', 3], ['p1', 2], ['p2', 1]]);

    selectRunnableWithFairness(slices, 2, 1, ageRank);

    // Array not mutated
    expect(slices).toHaveLength(3);
    expect(slices[0]).toBe(inputCopy[0]);
    expect(slices[1]).toBe(inputCopy[1]);
    expect(slices[2]).toBe(inputCopy[2]);

    // Slice objects not mutated
    slices.forEach((s, i) => {
      expect(serializeSlice(s)).toBe(snapshotsBefore[i]);
    });
  });
});

// ---------------------------------------------------------------------------
// composePrioritizedSlices tests
// ---------------------------------------------------------------------------

describe('composePrioritizedSlices — permutation completeness', () => {
  it('returns a permutation of all input slices (no loss, no dup), length == input length', () => {
    const slices = [
      makeSlice(['p0'], 'forward',  '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'backward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward',  '2024-02-01', '2024-02-29'),
      makeSlice(['p3'], 'new-project', '2024-01-01', '2024-01-31'),
      makeSlice(['p4'], 'backward', '2024-02-01', '2024-02-29'),
    ];
    const priorityByProjectId = new Map([['p0', 2], ['p1', 1], ['p2', 3], ['p3', 0], ['p4', 4]]);
    const ageByProjectId = new Map([['p0', 3], ['p1', 0], ['p2', 1], ['p3', 4], ['p4', 2]]);

    const result = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, 3, 1);

    // Same length
    expect(result).toHaveLength(slices.length);

    // Same multiset
    const inputSerialized = slices.map(serializeSlice).sort();
    const resultSerialized = result.map(serializeSlice).sort();
    expect(resultSerialized).toEqual(inputSerialized);
  });
});

describe('composePrioritizedSlices — first budget entries == fairness selection', () => {
  it('first budget entries match selectRunnableWithFairness(orderSlicesByPriority(...))', () => {
    const slices = [
      makeSlice(['p0'], 'forward',     '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'backward',    '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward',     '2024-02-01', '2024-02-29'),
      makeSlice(['p3'], 'new-project', '2024-01-01', '2024-01-31'),
      makeSlice(['p4'], 'backward',    '2024-02-01', '2024-02-29'),
    ];
    const priorityByProjectId = new Map([['p0', 2], ['p1', 1], ['p2', 3], ['p3', 0], ['p4', 4]]);
    const ageByProjectId = new Map([['p0', 3], ['p1', 0], ['p2', 1], ['p3', 4], ['p4', 2]]);
    const budget = 3;
    const reserve = 1;

    const result = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, budget, reserve);

    // Compute reference using the component functions directly
    const ordered = orderSlicesByPriority(slices, priorityByProjectId);
    const expected = selectRunnableWithFairness(ordered, budget, reserve, ageByProjectId);

    // First `budget` entries must equal the fairness selection (same references, same order)
    const head = result.slice(0, budget);
    expect(head).toHaveLength(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(head[i]).toBe(expected[i]);
    }
  });
});

describe('composePrioritizedSlices — remainder in priority order', () => {
  it('entries after the first budget are the deferred slices in priority order', () => {
    const slices = [
      makeSlice(['p0'], 'forward',     '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'backward',    '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward',     '2024-02-01', '2024-02-29'),
      makeSlice(['p3'], 'new-project', '2024-01-01', '2024-01-31'),
      makeSlice(['p4'], 'backward',    '2024-02-01', '2024-02-29'),
    ];
    const priorityByProjectId = new Map([['p0', 2], ['p1', 1], ['p2', 3], ['p3', 0], ['p4', 4]]);
    const ageByProjectId = new Map([['p0', 3], ['p1', 0], ['p2', 1], ['p3', 4], ['p4', 2]]);
    const budget = 3;
    const reserve = 1;

    const result = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, budget, reserve);

    // The ordered set, minus runnable, in priority order
    const ordered = orderSlicesByPriority(slices, priorityByProjectId);
    const runnable = selectRunnableWithFairness(ordered, budget, reserve, ageByProjectId);
    const runnableSet = new Set(runnable);
    const expectedDeferred = ordered.filter((s) => !runnableSet.has(s));

    const tail = result.slice(budget);
    expect(tail).toHaveLength(expectedDeferred.length);
    for (let i = 0; i < expectedDeferred.length; i++) {
      expect(tail[i]).toBe(expectedDeferred[i]);
    }
  });
});

describe('composePrioritizedSlices — quota accounting', () => {
  it('truncating result to first budget entries yields exactly the runnable set, deferred == total - budget', () => {
    const slices = [
      makeSlice(['p0'], 'forward',     '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'backward',    '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward',     '2024-02-01', '2024-02-29'),
      makeSlice(['p3'], 'new-project', '2024-01-01', '2024-01-31'),
      makeSlice(['p4'], 'backward',    '2024-02-01', '2024-02-29'),
    ];
    const priorityByProjectId = new Map([['p0', 2], ['p1', 1], ['p2', 3], ['p3', 0], ['p4', 4]]);
    const ageByProjectId = new Map([['p0', 3], ['p1', 0], ['p2', 1], ['p3', 4], ['p4', 2]]);
    const budget = 3;
    const reserve = 1;

    const result = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, budget, reserve);

    // Simulate what limitSlicesToBudget does: take first `budget` items
    const runnable = result.slice(0, budget);
    const deferred = result.slice(budget);

    // Runnable must equal fairness-aware selection
    const ordered = orderSlicesByPriority(slices, priorityByProjectId);
    const expectedRunnable = selectRunnableWithFairness(ordered, budget, reserve, ageByProjectId);
    const expectedRunnableSet = new Set(expectedRunnable);
    const actualRunnableSet = new Set(runnable);
    expect(actualRunnableSet.size).toBe(expectedRunnableSet.size);
    for (const s of expectedRunnableSet) {
      expect(actualRunnableSet.has(s)).toBe(true);
    }

    // Deferred count == total - budget
    expect(deferred).toHaveLength(slices.length - budget);
  });
});

describe('composePrioritizedSlices — determinism', () => {
  it('identical inputs produce identical output across two calls', () => {
    const slices = [
      makeSlice(['p0'], 'forward',  '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'backward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward',  '2024-02-01', '2024-02-29'),
    ];
    const priorityByProjectId = new Map([['p0', 1], ['p1', 0], ['p2', 2]]);
    const ageByProjectId = new Map([['p0', 2], ['p1', 0], ['p2', 1]]);

    const r1 = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, 2, 1);
    const r2 = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, 2, 1);

    expect(r1.map(serializeSlice)).toEqual(r2.map(serializeSlice));
  });
});

describe('composePrioritizedSlices — budget >= total', () => {
  it('when budget >= total, all slices returned with no deferred tail', () => {
    const slices = [
      makeSlice(['p0'], 'forward',  '2024-01-01', '2024-01-31'),
      makeSlice(['p1'], 'backward', '2024-01-01', '2024-01-31'),
      makeSlice(['p2'], 'forward',  '2024-02-01', '2024-02-29'),
    ];
    const priorityByProjectId = new Map([['p0', 1], ['p1', 0], ['p2', 2]]);
    const ageByProjectId = new Map([['p0', 2], ['p1', 0], ['p2', 1]]);

    const result = composePrioritizedSlices(slices, priorityByProjectId, ageByProjectId, 100, 5);

    // All slices returned
    expect(result).toHaveLength(slices.length);

    // All input slices present in result
    const inputSet = new Set(slices);
    for (const s of result) {
      expect(inputSet.has(s)).toBe(true);
    }

    // Deferred tail is empty: result.slice(100) == []
    expect(result.slice(100)).toHaveLength(0);
  });
});
