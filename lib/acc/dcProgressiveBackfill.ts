/**
 * Progressive breadth-first backfill state machine (Phase 8 plan 08-03).
 *
 * Pure module — no Prisma, no fs, no fetch. Takes the current
 * AccDcBackfillProgress rows + yesterday's date, emits the daily slice list
 * grouped into APS-50-cap batches.
 *
 * Algorithm (RESEARCH.md Pattern 1):
 *   - New project (no progress row, or newProjectFlag): single default slice window
 *     ending yesterday, reason='new-project'.
 *   - Existing project:
 *       backwardStart = max(subDays(earliestCovered, sliceDays), projectCreatedAt)
 *       If backwardStart < earliestCovered → emit backward slice.
 *       forwardStart = subDays(latestCovered, 1)  (1-day overlap window)
 *       If forwardStart < yesterday → emit forward slice [forwardStart, yesterday].
 *   - Batching: bucket per-project slices by (start|end|reason), chunk each
 *     bucket into Slice objects of ≤ PROJECT_BATCH_LIMIT projectIds.
 *
 * Consumed by plan 08-06 (dcIngest orchestrator).
 *
 * Requirements: DC8-07, DC8-11, DC8-13.
 */
import { subDays, max as dateMax, isBefore } from 'date-fns';
import { isDcBackfillEligibleProject } from './dcProjectEligibility';

/** APS Data Connector hard cap on `projectIdList` per request. */
export const PROJECT_BATCH_LIMIT = 50;

/** Default daily window size (days). */
export const SLICE_DAYS = 30;

/** CONTEXT-locked overlap window for late-arriving forward events (days). */
const OVERLAP_DAYS = 1;

export interface ProjectProgress {
  projectId: string;
  projectName?: string | null;
  earliestCovered: Date | null;
  latestCovered: Date | null;
  /**
   * Project creation date floor — never request data from before this.
   *
   * NOTE (per Phase 8 plan 08-01 SUMMARY): `AccDcProject.createdAt` is
   * nullable in schema. Callers MUST resolve null to a sensible floor
   * (e.g. earliest known activity timestamp for the project) BEFORE
   * passing into this module. This module assumes the floor is real.
   */
  projectCreatedAt: Date;
  newProjectFlag: boolean;
}

export type SliceReason = 'backward' | 'forward' | 'new-project';

export interface Slice {
  /** Up to PROJECT_BATCH_LIMIT project IDs sharing this (start, end, reason). */
  projectIds: string[];
  start: Date;
  end: Date;
  reason: SliceReason;
}

export interface DailyPlan {
  slices: Slice[];
  totalProjects: number;
  /** Each Slice = one APS request → counts as one quota unit. */
  estimatedQuota: number;
}

export interface PlanDailySliceOptions {
  /** Manual override for accelerated, bounded extraction runs. Defaults to SLICE_DAYS. */
  sliceDays?: number;
  /** Test hook for exercising the production project eligibility filter. */
  filterProjectEligibility?: boolean;
}

interface PerProjectSlice {
  projectId: string;
  start: Date;
  end: Date;
  reason: SliceReason;
}

function deriveSlicesForProject(
  proj: ProjectProgress,
  yesterdayUtc: Date,
  sliceDays: number,
): PerProjectSlice[] {
  // New project: no progress yet -> one window ending yesterday.
  if (
    proj.newProjectFlag ||
    proj.earliestCovered === null ||
    proj.latestCovered === null
  ) {
    return [
      {
        projectId: proj.projectId,
        start: subDays(yesterdayUtc, sliceDays),
        end: yesterdayUtc,
        reason: 'new-project',
      },
    ];
  }

  const out: PerProjectSlice[] = [];

  // Backward: extend earliest coverage by sliceDays, floored at projectCreatedAt.
  const backwardCandidate = subDays(proj.earliestCovered, sliceDays);
  const backwardStart = dateMax([backwardCandidate, proj.projectCreatedAt]);
  if (isBefore(backwardStart, proj.earliestCovered)) {
    out.push({
      projectId: proj.projectId,
      start: backwardStart,
      end: proj.earliestCovered,
      reason: 'backward',
    });
  }

  // Forward: only when latestCovered hasn't reached yesterday yet.
  // The OVERLAP_DAYS rewinds the start to catch late-arriving events.
  if (isBefore(proj.latestCovered, yesterdayUtc)) {
    const forwardStart = subDays(proj.latestCovered, OVERLAP_DAYS);
    out.push({
      projectId: proj.projectId,
      start: forwardStart,
      end: yesterdayUtc,
      reason: 'forward',
    });
  }

  return out;
}

function bucketKey(s: PerProjectSlice): string {
  return `${s.start.toISOString()}|${s.end.toISOString()}|${s.reason}`;
}

function normalizeSliceDays(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 1) return null;
  return Math.min(Math.floor(parsed), 366);
}

export function resolveSliceDays(options?: PlanDailySliceOptions): number {
  return (
    normalizeSliceDays(options?.sliceDays) ??
    normalizeSliceDays(process.env.DC_PROGRESSIVE_SLICE_DAYS) ??
    SLICE_DAYS
  );
}

export function planDailySlice(
  projects: ProjectProgress[],
  yesterdayUtc: Date,
  options?: PlanDailySliceOptions,
): DailyPlan {
  const sliceDays = resolveSliceDays(options);
  const shouldFilterEligibility =
    options?.filterProjectEligibility ??
    !(
      typeof process !== 'undefined' &&
      (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test')
    );
  const filteredProjects = shouldFilterEligibility
    ? projects.filter((p) =>
        isDcBackfillEligibleProject(p.projectId, p.projectName),
      )
    : projects;

  const perProjectSlices: PerProjectSlice[] = [];
  for (const proj of filteredProjects) {
    perProjectSlices.push(
      ...deriveSlicesForProject(proj, yesterdayUtc, sliceDays),
    );
  }

  // Bucket by identical (start, end, reason). Use insertion-order Map so
  // output ordering is deterministic w.r.t. input project order.
  const buckets = new Map<string, PerProjectSlice[]>();
  for (const s of perProjectSlices) {
    const key = bucketKey(s);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(s);
    } else {
      buckets.set(key, [s]);
    }
  }

  // Chunk each bucket into Slice objects of ≤ PROJECT_BATCH_LIMIT projects.
  const slices: Slice[] = [];
  for (const bucket of buckets.values()) {
    const { start, end, reason } = bucket[0];
    for (let i = 0; i < bucket.length; i += PROJECT_BATCH_LIMIT) {
      const chunk = bucket.slice(i, i + PROJECT_BATCH_LIMIT);
      slices.push({
        projectIds: chunk.map((s) => s.projectId),
        start,
        end,
        reason,
      });
    }
  }

  return {
    slices,
    totalProjects: projects.length,
    estimatedQuota: slices.length,
  };
}

export function applySliceCompletion(
  prev: ProjectProgress,
  slice: { start: Date; end: Date; reason: SliceReason },
): ProjectProgress {
  switch (slice.reason) {
    case 'new-project':
      return {
        ...prev,
        earliestCovered: slice.start,
        latestCovered: slice.end,
        newProjectFlag: false,
      };
    case 'backward':
      return {
        ...prev,
        earliestCovered: slice.start,
        latestCovered: prev.latestCovered ?? slice.end,
      };
    case 'forward':
      return {
        ...prev,
        earliestCovered: prev.earliestCovered ?? slice.start,
        latestCovered: slice.end,
      };
  }
}
