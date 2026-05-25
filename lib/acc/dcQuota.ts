import type { Slice } from './dcProgressiveBackfill';

export const DAILY_QUOTA_CAP = 25;
export const DAILY_SAFE_REQUEST_BUDGET = 20;

export interface QuotaBudgetInput {
  usedToday: number;
  dailyQuotaCap?: number;
  dailySafeRequestBudget?: number;
}

export interface QuotaBudget {
  usedToday: number;
  dailyQuotaCap: number;
  dailySafeRequestBudget: number;
  reserveRequests: number;
  hardRemainingToday: number;
  safeRemainingToday: number;
}

export function buildQuotaBudget(input: QuotaBudgetInput): QuotaBudget {
  const dailyQuotaCap = input.dailyQuotaCap ?? DAILY_QUOTA_CAP;
  const dailySafeRequestBudget =
    input.dailySafeRequestBudget ?? DAILY_SAFE_REQUEST_BUDGET;
  const usedToday = Math.max(0, input.usedToday);
  const hardRemainingToday = Math.max(0, dailyQuotaCap - usedToday);
  const safeRemainingToday = Math.max(
    0,
    Math.min(dailySafeRequestBudget - usedToday, hardRemainingToday),
  );

  return {
    usedToday,
    dailyQuotaCap,
    dailySafeRequestBudget,
    reserveRequests: Math.max(0, dailyQuotaCap - dailySafeRequestBudget),
    hardRemainingToday,
    safeRemainingToday,
  };
}

export interface LimitedSlicePlan {
  runnableSlices: Slice[];
  deferredSlices: Slice[];
  plannedRequests: number;
  runnableRequests: number;
  deferredRequests: number;
}

export function limitSlicesToBudget(
  slices: Slice[],
  safeRemainingToday: number,
): LimitedSlicePlan {
  const runnableCount = Math.max(0, Math.floor(safeRemainingToday));
  const runnableSlices = slices.slice(0, runnableCount);
  const deferredSlices = slices.slice(runnableCount);

  return {
    runnableSlices,
    deferredSlices,
    plannedRequests: slices.length,
    runnableRequests: runnableSlices.length,
    deferredRequests: deferredSlices.length,
  };
}

export function nextDailyQuotaReset(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}
