import { describe, it, expect } from 'vitest';
import { orderSlicesByPriority } from './dcBackfillPriority';
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
