import { describe, it, expect } from 'vitest';
// Placeholder — Wave 1 (plan 08-03) implements lib/acc/dcProgressiveBackfill.ts
// Covers requirements:
//   DC8-07: progressive breadth-first backfill (30-day slice across all admin projects)
//   DC8-11: quota fallback resume-state per (projectId, slice)
//   DC8-13: auto-detect new admin projects + accelerate their backfill

describe('dcProgressiveBackfill', () => {
  it('exports planDailySlice that produces correct slices across edge cases (DC8-07, DC8-11, DC8-13)', () => {
    // Wave 1 will:
    //   import { planDailySlice } from './dcProgressiveBackfill';
    //   - new project (no progress row) → slice = last 30d, newProjectFlag=true
    //   - fully-backfilled project (earliestCovered === createdAt) → no backward slice
    //   - project at floor → slice clamped to projectCreatedAt
    //   - groups by identical (start,end) windows for APS 50-project batch limit
    expect.fail('NOT YET IMPLEMENTED — Wave 1 plan 08-03 ships lib/acc/dcProgressiveBackfill.ts');
  });
});
