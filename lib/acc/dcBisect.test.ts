/**
 * Unit tests for dcBisect.ts — pure bisection helper.
 *
 * Uses a fake submitFn that 403s iff the batch intersects a designated "bad"
 * set, else resolves. Every call argument is tracked.
 */
import { describe, it, expect, vi } from 'vitest';
import { bisectOnForbidden, DcSubmitForbiddenError } from './dcBisect';
import { QuotaExceededError } from './dcIngest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a fake submitFn that throws DcSubmitForbiddenError iff the batch
 *  contains ANY id in `badIds`. Records every invocation in `calls`. */
function makeFakeSubmit(badIds: Set<string>, calls: string[][] = []) {
  return async (projectIds: string[]): Promise<void> => {
    calls.push([...projectIds]);
    const hasBad = projectIds.some((id) => badIds.has(id));
    if (hasBad) {
      throw new DcSubmitForbiddenError(projectIds);
    }
  };
}

/** Build a list of n project IDs: "p0", "p1", ... */
function ids(n: number, prefix = 'p'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}

// ---------------------------------------------------------------------------
// Test 1: one bad project in 50 salvages the good ones
// ---------------------------------------------------------------------------
describe('bisectOnForbidden', () => {
  it('one bad project in 50 salvages the good ones', async () => {
    const projects = ids(50);
    const bad = new Set(['p17']);
    const calls: string[][] = [];
    const summary = await bisectOnForbidden(projects, makeFakeSubmit(bad, calls), {
      maxRequests: 200,
    });

    // All 49 good projects are successful
    expect(summary.successfulProjectIds.sort()).toEqual(
      projects.filter((id) => !bad.has(id)).sort(),
    );
    // The bad one is isolated
    expect(summary.inaccessibleProjectIds).toEqual(['p17']);
    expect(summary.unprobedProjectIds).toEqual([]);
    // Reasonable request count — bisecting 50 takes at most ceil(log2(50))+1 = 7 splits per path
    // Generous cap: log2(50)*50 is very safe; spec says ≤ ~13 for 1 bad in 50
    expect(summary.requestsUsed).toBeLessThanOrEqual(13);
    expect(summary.requestsUsed).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Test 2: two scattered bad projects isolate both
  // ---------------------------------------------------------------------------
  it('two scattered bad projects isolate both', async () => {
    const projects = ids(50);
    const bad = new Set(['p3', 'p41']);
    const calls: string[][] = [];
    const summary = await bisectOnForbidden(projects, makeFakeSubmit(bad, calls), {
      maxRequests: 300,
    });

    expect(summary.inaccessibleProjectIds.sort()).toEqual(['p3', 'p41'].sort());
    expect(summary.successfulProjectIds.sort()).toEqual(
      projects.filter((id) => !bad.has(id)).sort(),
    );
    expect(summary.unprobedProjectIds).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Test 3: all-good batch uses exactly one request
  // ---------------------------------------------------------------------------
  it('all-good batch uses exactly one request', async () => {
    const projects = ids(50);
    const bad = new Set<string>();
    const calls: string[][] = [];
    const summary = await bisectOnForbidden(projects, makeFakeSubmit(bad, calls), {
      maxRequests: 200,
    });

    expect(summary.requestsUsed).toBe(1);
    expect(calls.length).toBe(1);
    expect(summary.successfulProjectIds.sort()).toEqual([...projects].sort());
    expect(summary.inaccessibleProjectIds).toEqual([]);
    expect(summary.unprobedProjectIds).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Test 4: 429 propagates and never bisects
  // ---------------------------------------------------------------------------
  it('429 propagates and never bisects', async () => {
    const projects = ids(10);
    const calls: string[][] = [];
    const submitFn = async (projectIds: string[]): Promise<void> => {
      calls.push([...projectIds]);
      throw new QuotaExceededError();
    };

    await expect(
      bisectOnForbidden(projects, submitFn, { maxRequests: 200 }),
    ).rejects.toBeInstanceOf(QuotaExceededError);

    // Must have been called exactly once (no bisection on non-403 errors)
    expect(calls.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 5: 5xx / generic errors do not bisect
  // ---------------------------------------------------------------------------
  it('5xx / generic errors do not bisect', async () => {
    const projects = ids(10);
    const calls: string[][] = [];
    const fatalError = new Error('Internal Server Error');
    const submitFn = async (projectIds: string[]): Promise<void> => {
      calls.push([...projectIds]);
      throw fatalError;
    };

    await expect(
      bisectOnForbidden(projects, submitFn, { maxRequests: 200 }),
    ).rejects.toBe(fatalError);

    expect(calls.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Test 6: budget exhausted stops bisection safely
  // ---------------------------------------------------------------------------
  it('budget exhausted stops bisection safely (maxRequests)', async () => {
    // All projects are bad so every batch 403s and splits. With maxRequests=3
    // the function must stop without throwing and put residual in unprobed.
    const projects = ids(20);
    const bad = new Set(projects); // all bad
    const calls: string[][] = [];
    const summary = await bisectOnForbidden(projects, makeFakeSubmit(bad, calls), {
      maxRequests: 3,
    });

    // Must not throw
    expect(summary.requestsUsed).toBe(3);
    // All projects must end up somewhere (no data loss)
    const allPlaced = [
      ...summary.successfulProjectIds,
      ...summary.inaccessibleProjectIds,
      ...summary.unprobedProjectIds,
    ].sort();
    expect(allPlaced).toEqual([...projects].sort());
  });

  it('budget exhausted stops bisection safely (hasBudget)', async () => {
    const projects = ids(20);
    const bad = new Set(projects); // all bad
    let callCount = 0;
    const calls: string[][] = [];
    // hasBudget returns true for first 2, then false
    const hasBudget = () => callCount < 2;
    const submitFn = async (projectIds: string[]): Promise<void> => {
      calls.push([...projectIds]);
      callCount++;
      throw new DcSubmitForbiddenError(projectIds);
    };

    const summary = await bisectOnForbidden(projects, submitFn, {
      maxRequests: 200,
      hasBudget,
    });

    // Must not throw; requestsUsed == 2 (hasBudget false is checked BEFORE submit)
    expect(summary.requestsUsed).toBe(2);
    const allPlaced = [
      ...summary.successfulProjectIds,
      ...summary.inaccessibleProjectIds,
      ...summary.unprobedProjectIds,
    ].sort();
    expect(allPlaced).toEqual([...projects].sort());
  });

  // ---------------------------------------------------------------------------
  // Test 7: culprit isolation / coverage guarantee
  // ---------------------------------------------------------------------------
  it('culprit is in inaccessibleProjectIds and NOT in successfulProjectIds', async () => {
    const projects = ids(8);
    const bad = new Set(['p2', 'p6']);
    const summary = await bisectOnForbidden(projects, makeFakeSubmit(bad), {
      maxRequests: 100,
    });

    for (const culprit of ['p2', 'p6']) {
      expect(summary.inaccessibleProjectIds).toContain(culprit);
      expect(summary.successfulProjectIds).not.toContain(culprit);
    }
    for (const good of projects.filter((id) => !bad.has(id))) {
      expect(summary.successfulProjectIds).toContain(good);
      expect(summary.inaccessibleProjectIds).not.toContain(good);
    }
  });

  // ---------------------------------------------------------------------------
  // Test 8: determinism — same inputs produce identical submitFn call sequence
  // ---------------------------------------------------------------------------
  it('determinism: same inputs produce identical call sequence across two runs', async () => {
    const projects = ids(16);
    const bad = new Set(['p5', 'p11']);

    const calls1: string[][] = [];
    const calls2: string[][] = [];

    await bisectOnForbidden(projects, makeFakeSubmit(bad, calls1), { maxRequests: 200 });
    await bisectOnForbidden(projects, makeFakeSubmit(bad, calls2), { maxRequests: 200 });

    expect(calls1).toEqual(calls2);
  });

  it('split uses ceil(len/2) left-first', async () => {
    // Batch of 4 where the bad is in position 3 (right half).
    // First call: [p0,p1,p2,p3] — 403 (contains p3)
    // Second call: left half [p0,p1] (ceil(4/2)=2) — should succeed
    // Third call: right half [p2,p3] — 403
    // Then: [p2] — success, [p3] — isolated
    const projects = ['p0', 'p1', 'p2', 'p3'];
    const bad = new Set(['p3']);
    const calls: string[][] = [];

    await bisectOnForbidden(projects, makeFakeSubmit(bad, calls), { maxRequests: 200 });

    expect(calls[0]).toEqual(['p0', 'p1', 'p2', 'p3']); // initial full batch
    expect(calls[1]).toEqual(['p0', 'p1']);               // left half (ceil(4/2)=2) — success
    expect(calls[2]).toEqual(['p2', 'p3']);               // right half — 403
    expect(calls[3]).toEqual(['p2']);                     // left of right — success
    expect(calls[4]).toEqual(['p3']);                     // right of right — isolated
  });
});
