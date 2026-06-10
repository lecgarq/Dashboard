/**
 * Tests for dcProgressiveBackfill — pure state machine that emits the daily
 * slice list grouped into APS-50-cap batches.
 *
 * Covers requirements:
 *   DC8-07: progressive breadth-first backfill (30-day slice across all admin projects)
 *   DC8-11: quota fallback resume-state per (projectId, slice)
 *   DC8-13: auto-detect new admin projects + accelerate their backfill
 */
import { describe, it, expect } from 'vitest';
import { subDays } from 'date-fns';
import {
  planDailySlice,
  applySliceCompletion,
  PROJECT_BATCH_LIMIT,
  resolveSliceDays,
  type ProjectProgress,
  type Slice,
} from './dcProgressiveBackfill';

const yesterday = new Date('2026-05-14T00:00:00Z');

function newProj(id: string, createdDaysAgo = 200): ProjectProgress {
  return {
    projectId: id,
    earliestCovered: null,
    latestCovered: null,
    projectCreatedAt: subDays(yesterday, createdDaysAgo),
    newProjectFlag: true,
  };
}

function existingProj(
  id: string,
  earliestDaysAgo: number,
  latestDaysAgo: number,
  createdDaysAgo = 200,
): ProjectProgress {
  return {
    projectId: id,
    earliestCovered: subDays(yesterday, earliestDaysAgo),
    latestCovered: subDays(yesterday, latestDaysAgo),
    projectCreatedAt: subDays(yesterday, createdDaysAgo),
    newProjectFlag: false,
  };
}

describe('planDailySlice', () => {
  it('returns empty plan for empty projects array', () => {
    const plan = planDailySlice([], yesterday);
    expect(plan).toEqual({ slices: [], totalProjects: 0, estimatedQuota: 0 });
  });

  it('emits a single new-project slice for a brand-new project', () => {
    const plan = planDailySlice([newProj('p1')], yesterday);
    expect(plan.slices).toHaveLength(1);
    const s = plan.slices[0];
    expect(s.reason).toBe('new-project');
    expect(s.projectIds).toEqual(['p1']);
    expect(s.start.toISOString()).toBe(subDays(yesterday, 30).toISOString());
    expect(s.end.toISOString()).toBe(yesterday.toISOString());
    expect(plan.totalProjects).toBe(1);
    expect(plan.estimatedQuota).toBe(1);
  });

  it('emits 0 slices for a fully-backfilled project', () => {
    // earliestCovered == projectCreatedAt AND latestCovered == yesterday
    const proj: ProjectProgress = {
      projectId: 'p1',
      earliestCovered: subDays(yesterday, 200),
      latestCovered: yesterday,
      projectCreatedAt: subDays(yesterday, 200),
      newProjectFlag: false,
    };
    const plan = planDailySlice([proj], yesterday);
    expect(plan.slices).toHaveLength(0);
    expect(plan.totalProjects).toBe(1);
    expect(plan.estimatedQuota).toBe(0);
  });

  it('emits a backward slice for project with room to extend backward', () => {
    // earliestCovered = yesterday-60d, projectCreatedAt = yesterday-200d, latestCovered=yesterday
    const proj: ProjectProgress = {
      projectId: 'p1',
      earliestCovered: subDays(yesterday, 60),
      latestCovered: yesterday,
      projectCreatedAt: subDays(yesterday, 200),
      newProjectFlag: false,
    };
    const plan = planDailySlice([proj], yesterday);
    expect(plan.slices).toHaveLength(1);
    const s = plan.slices[0];
    expect(s.reason).toBe('backward');
    expect(s.start.toISOString()).toBe(subDays(yesterday, 90).toISOString());
    expect(s.end.toISOString()).toBe(subDays(yesterday, 60).toISOString());
  });

  it('uses an explicit slice-day override for accelerated manual extraction', () => {
    const newPlan = planDailySlice([newProj('p1')], yesterday, { sliceDays: 92 });
    expect(newPlan.slices).toHaveLength(1);
    expect(newPlan.slices[0].reason).toBe('new-project');
    expect(newPlan.slices[0].start.toISOString()).toBe(
      subDays(yesterday, 92).toISOString(),
    );

    const backwardPlan = planDailySlice(
      [existingProj('p2', 100, 0, 300)],
      yesterday,
      { sliceDays: 92 },
    );
    expect(backwardPlan.slices).toHaveLength(1);
    expect(backwardPlan.slices[0].reason).toBe('backward');
    expect(backwardPlan.slices[0].start.toISOString()).toBe(
      subDays(yesterday, 192).toISOString(),
    );
    expect(backwardPlan.slices[0].end.toISOString()).toBe(
      subDays(yesterday, 100).toISOString(),
    );
  });

  it('uses DC_PROGRESSIVE_SLICE_DAYS for accelerated manual extraction', () => {
    const previous = process.env.DC_PROGRESSIVE_SLICE_DAYS;
    process.env.DC_PROGRESSIVE_SLICE_DAYS = '92';

    try {
      expect(resolveSliceDays()).toBe(92);

      const plan = planDailySlice([newProj('p1')], yesterday);
      expect(plan.slices).toHaveLength(1);
      expect(plan.slices[0].start.toISOString()).toBe(
        subDays(yesterday, 92).toISOString(),
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DC_PROGRESSIVE_SLICE_DAYS;
      } else {
        process.env.DC_PROGRESSIVE_SLICE_DAYS = previous;
      }
    }
  });

  it('hard-skips allowlisted low-value projects before creating slices', () => {
    const projects: ProjectProgress[] = [
      {
        ...newProj('2a46d219-9e58-479f-a4ba-daed763c7d61'),
        projectName: 'ACC Template Ejecucion MTY',
      },
      {
        ...newProj('96ed997a-f39b-4035-baf9-9eca1b5eb6b3'),
        projectName: 'MTY BIM Sharespace',
      },
      {
        ...newProj('fa948b7b-43eb-458e-8d8b-9f4cf7aa957f'),
        projectName: 'MTY Caterpillar Azteca - OMTY083',
      },
    ];

    const plan = planDailySlice(projects, yesterday, {
      filterProjectEligibility: true,
    });

    expect(plan.slices).toHaveLength(1);
    expect(plan.slices[0].projectIds).toEqual([
      'fa948b7b-43eb-458e-8d8b-9f4cf7aa957f',
    ]);
    expect(plan.totalProjects).toBe(3);
    expect(plan.estimatedQuota).toBe(1);
  });

  it('clamps backward slice start to projectCreatedAt floor', () => {
    // earliestCovered = yesterday-100d, projectCreatedAt = yesterday-110d, latestCovered=yesterday
    const proj: ProjectProgress = {
      projectId: 'p1',
      earliestCovered: subDays(yesterday, 100),
      latestCovered: yesterday,
      projectCreatedAt: subDays(yesterday, 110),
      newProjectFlag: false,
    };
    const plan = planDailySlice([proj], yesterday);
    expect(plan.slices).toHaveLength(1);
    const s = plan.slices[0];
    expect(s.reason).toBe('backward');
    expect(s.start.toISOString()).toBe(subDays(yesterday, 110).toISOString());
    expect(s.end.toISOString()).toBe(subDays(yesterday, 100).toISOString());
  });

  it('emits 0 backward slices when already at floor', () => {
    // earliestCovered == projectCreatedAt; latestCovered=yesterday => fully backfilled
    const proj: ProjectProgress = {
      projectId: 'p1',
      earliestCovered: subDays(yesterday, 200),
      latestCovered: yesterday,
      projectCreatedAt: subDays(yesterday, 200),
      newProjectFlag: false,
    };
    const plan = planDailySlice([proj], yesterday);
    const backward = plan.slices.filter((s) => s.reason === 'backward');
    expect(backward).toHaveLength(0);
  });

  it('emits a forward slice when latestCovered < yesterday', () => {
    // earliestCovered = projectCreatedAt (no backward), latestCovered = yesterday-5d
    const proj: ProjectProgress = {
      projectId: 'p1',
      earliestCovered: subDays(yesterday, 200),
      latestCovered: subDays(yesterday, 5),
      projectCreatedAt: subDays(yesterday, 200),
      newProjectFlag: false,
    };
    const plan = planDailySlice([proj], yesterday);
    expect(plan.slices).toHaveLength(1);
    const s = plan.slices[0];
    expect(s.reason).toBe('forward');
    expect(s.start.toISOString()).toBe(subDays(yesterday, 6).toISOString());
    expect(s.end.toISOString()).toBe(yesterday.toISOString());
  });

  it('emits both backward and forward slices for a project needing both', () => {
    // earliestCovered = yesterday-60d, latestCovered = yesterday-5d, projectCreatedAt = yesterday-200d
    const proj = existingProj('p1', 60, 5, 200);
    const plan = planDailySlice([proj], yesterday);
    expect(plan.slices).toHaveLength(2);
    const reasons = plan.slices.map((s) => s.reason).sort();
    expect(reasons).toEqual(['backward', 'forward']);
  });

  it('groups 50 projects sharing identical backward window into 1 Slice', () => {
    const projects: ProjectProgress[] = Array.from({ length: 50 }, (_, i) =>
      existingProj(`p${i}`, 60, 0, 200),
    );
    const plan = planDailySlice(projects, yesterday);
    // All have same backward window (yesterday-90d -> yesterday-60d); none have forward (latestCovered=yesterday)
    expect(plan.slices).toHaveLength(1);
    expect(plan.slices[0].projectIds).toHaveLength(50);
    expect(plan.slices[0].reason).toBe('backward');
  });

  it('spills 51 projects sharing the same window into 2 Slices (50 + 1)', () => {
    const projects: ProjectProgress[] = Array.from({ length: 51 }, (_, i) =>
      existingProj(`p${i}`, 60, 0, 200),
    );
    const plan = planDailySlice(projects, yesterday);
    expect(plan.slices).toHaveLength(2);
    const sizes = plan.slices.map((s) => s.projectIds.length).sort((a, b) => b - a);
    expect(sizes).toEqual([50, 1]);
    expect(plan.slices.every((s) => s.reason === 'backward')).toBe(true);
  });

  it('groups mixed windows correctly; estimatedQuota = number of slices', () => {
    // 10 brand-new projects (all share the same new-project window)
    const news: ProjectProgress[] = Array.from({ length: 10 }, (_, i) => newProj(`n${i}`));
    // 10 forward-edge projects with DIFFERENT latestCovered values (1..10 days ago)
    // → 10 distinct forward windows → 10 separate slices
    const fwd: ProjectProgress[] = Array.from({ length: 10 }, (_, i) =>
      existingProj(`f${i}`, 200, i + 1, 200),
    );
    const plan = planDailySlice([...news, ...fwd], yesterday);
    // Expected: 1 slice for the 10 news + 10 slices for the 10 distinct forward windows = 11
    expect(plan.slices).toHaveLength(11);
    expect(plan.estimatedQuota).toBe(11);
    expect(plan.totalProjects).toBe(20);
    const newsSlice = plan.slices.find((s) => s.reason === 'new-project');
    expect(newsSlice?.projectIds).toHaveLength(10);
    const fwdSlices = plan.slices.filter((s) => s.reason === 'forward');
    expect(fwdSlices).toHaveLength(10);
    expect(fwdSlices.every((s) => s.projectIds.length === 1)).toBe(true);
  });
});

describe('applySliceCompletion', () => {
  it('updates a brand-new project after a new-project slice', () => {
    const prev = newProj('p1');
    const slice = {
      start: subDays(yesterday, 30),
      end: yesterday,
      reason: 'new-project' as const,
    };
    const next = applySliceCompletion(prev, slice);
    expect(next.earliestCovered?.toISOString()).toBe(slice.start.toISOString());
    expect(next.latestCovered?.toISOString()).toBe(slice.end.toISOString());
    expect(next.newProjectFlag).toBe(false);
    expect(next.projectId).toBe('p1');
    expect(next.projectCreatedAt).toEqual(prev.projectCreatedAt);
  });

  it('moves earliestCovered backward after a backward slice; latestCovered untouched', () => {
    const prev = existingProj('p1', 60, 0, 200);
    const slice = {
      start: subDays(yesterday, 90),
      end: subDays(yesterday, 60),
      reason: 'backward' as const,
    };
    const next = applySliceCompletion(prev, slice);
    expect(next.earliestCovered?.toISOString()).toBe(slice.start.toISOString());
    expect(next.latestCovered?.toISOString()).toBe(prev.latestCovered!.toISOString());
  });

  it('moves latestCovered forward after a forward slice; earliestCovered untouched', () => {
    const prev = existingProj('p1', 200, 5, 200);
    const slice = {
      start: subDays(yesterday, 6),
      end: yesterday,
      reason: 'forward' as const,
    };
    const next = applySliceCompletion(prev, slice);
    expect(next.latestCovered?.toISOString()).toBe(slice.end.toISOString());
    expect(next.earliestCovered?.toISOString()).toBe(prev.earliestCovered!.toISOString());
  });
});

describe('PROJECT_BATCH_LIMIT', () => {
  it('is exported as 50 (APS hard cap)', () => {
    expect(PROJECT_BATCH_LIMIT).toBe(50);
  });
});

// Type assertion to keep Slice in the public surface.
const _sliceSurface: Slice = {
  projectIds: ['x'],
  start: yesterday,
  end: yesterday,
  reason: 'forward',
};
void _sliceSurface;
