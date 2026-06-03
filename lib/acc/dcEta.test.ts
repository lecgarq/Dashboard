import { describe, expect, it } from 'vitest';

import {
  estimateExtractionTiming,
  formatHumanDuration,
} from './dcEta';

describe('formatHumanDuration', () => {
  it('formats seconds', () => {
    expect(formatHumanDuration(42_000)).toBe('42 seconds');
  });

  it('formats minutes and seconds', () => {
    expect(formatHumanDuration(492_000)).toBe('8 minutes 12 seconds');
  });

  it('formats hours and minutes', () => {
    expect(formatHumanDuration(12_060_000)).toBe('3 hours 21 minutes');
  });

  it('formats days and hours', () => {
    expect(formatHumanDuration(187_200_000)).toBe('2 days 4 hours');
  });

  it('formats weeks and days', () => {
    expect(formatHumanDuration(864_000_000)).toBe('1 week 3 days');
  });
});

describe('estimateExtractionTiming', () => {
  it('uses completed request throughput to estimate remaining time and clock completion', () => {
    const now = new Date('2026-05-18T18:00:00Z');
    const timing = estimateExtractionTiming({
      startedAt: new Date('2026-05-18T17:00:00Z'),
      endedAt: null,
      quotaUsed: 4,
      plannedRequests: 10,
      now,
    });

    expect(timing.elapsedLabel).toBe('1 hour');
    expect(timing.remainingLabel).toBe('1 hour 30 minutes');
    expect(timing.completionDurationLabel).toBe('1 hour 30 minutes');
    expect(timing.completionTime?.toISOString()).toBe('2026-05-18T19:30:00.000Z');
  });
});
