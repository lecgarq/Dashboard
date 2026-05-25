import { describe, expect, it } from 'vitest';

import {
  DAILY_SAFE_REQUEST_BUDGET,
  DAILY_QUOTA_CAP,
  buildQuotaBudget,
  limitSlicesToBudget,
  nextDailyQuotaReset,
} from './dcQuota';
import type { Slice } from './dcProgressiveBackfill';

function slice(id: number): Slice {
  return {
    projectIds: [`p${id}`],
    start: new Date('2026-05-01T00:00:00Z'),
    end: new Date('2026-05-02T00:00:00Z'),
    reason: 'forward',
  };
}

describe('buildQuotaBudget', () => {
  it('reports full safe daily budget when nothing has run today', () => {
    expect(buildQuotaBudget({ usedToday: 0 }).safeRemainingToday).toBe(20);
  });

  it('reports partial remaining budget', () => {
    expect(buildQuotaBudget({ usedToday: 12 }).safeRemainingToday).toBe(8);
  });

  it('reports zero once the safe budget is exhausted', () => {
    expect(buildQuotaBudget({ usedToday: 20 }).safeRemainingToday).toBe(0);
  });

  it('never reports remaining hard quota above the cap', () => {
    const budget = buildQuotaBudget({ usedToday: 30 });
    expect(budget.hardRemainingToday).toBe(0);
    expect(budget.safeRemainingToday).toBe(0);
    expect(budget.dailyQuotaCap).toBe(DAILY_QUOTA_CAP);
    expect(budget.dailySafeRequestBudget).toBe(DAILY_SAFE_REQUEST_BUDGET);
  });
});

describe('limitSlicesToBudget', () => {
  it('splits runnable and deferred slices at the safe daily budget', () => {
    const slices = [slice(1), slice(2), slice(3), slice(4)];
    const limited = limitSlicesToBudget(slices, 2);

    expect(limited.runnableSlices.map((s) => s.projectIds[0])).toEqual(['p1', 'p2']);
    expect(limited.deferredSlices.map((s) => s.projectIds[0])).toEqual(['p3', 'p4']);
    expect(limited.plannedRequests).toBe(4);
    expect(limited.runnableRequests).toBe(2);
    expect(limited.deferredRequests).toBe(2);
  });

  it('defers everything when no safe budget remains', () => {
    const slices = [slice(1), slice(2)];
    const limited = limitSlicesToBudget(slices, 0);

    expect(limited.runnableSlices).toEqual([]);
    expect(limited.deferredSlices).toEqual(slices);
  });
});

describe('nextDailyQuotaReset', () => {
  it('returns the next UTC midnight', () => {
    expect(nextDailyQuotaReset(new Date('2026-05-18T18:00:00Z')).toISOString()).toBe(
      '2026-05-19T00:00:00.000Z',
    );
  });
});
