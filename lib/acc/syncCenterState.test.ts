import { describe, expect, it } from 'vitest';

import { mapRunStatusToSyncCenterStatus } from './syncCenterState';

describe('mapRunStatusToSyncCenterStatus', () => {
  it.each([
    ['running', 'running'],
    ['pending', 'running'],
    ['killed', 'paused'],
    ['failed', 'failed'],
    ['success', 'complete'],
    ['quota-paused', 'quota-paused'],
    ['quota-exceeded', 'quota-paused'],
    [null, 'idle'],
  ] as const)('maps %s to %s', (input, expected) => {
    expect(mapRunStatusToSyncCenterStatus(input)).toBe(expected);
  });
});
