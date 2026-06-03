/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SyncCenterStatusPanel,
  type SyncCenterStatusViewModel,
} from './SyncCenterStatusPanel';

function model(
  status: SyncCenterStatusViewModel['status'],
): SyncCenterStatusViewModel {
  return {
    status,
    activeJobId: status === 'running' ? 'run-1' : null,
    activeRequestId: status === 'running' ? 'req-1' : null,
    elapsedTime: '8 minutes 12 seconds',
    estimatedRemainingTime: '3 hours 21 minutes',
    completionEstimateDuration: '3 hours 21 minutes',
    completionEstimateTime: new Date(2026, 4, 18, 21, 21),
    quotaUsedToday: 7,
    quotaRemainingToday: 13,
    dailyQuotaCap: 25,
    dailySafeRequestBudget: 20,
    reserveRequests: 5,
    nextSafeRunTime: new Date(2026, 4, 19, 0, 0),
    plannedRequests: 18,
    runnableRequestsToday: 13,
    deferredRequests: 5,
    paused: status === 'paused',
    latestLogs: ['log line'],
    latestErrors: status === 'failed' ? ['failed for test'] : [],
  };
}

describe('SyncCenterStatusPanel', () => {
  it.each([
    ['idle', 'Idle'],
    ['running', 'Running'],
    ['paused', 'Paused'],
    ['failed', 'Failed'],
    ['complete', 'Complete'],
    ['quota-paused', 'Quota paused'],
  ] as const)('renders %s state', (status, label) => {
    render(<SyncCenterStatusPanel data={model(status)} isBusy={false} />);

    expect(screen.getByText(label)).not.toBeNull();
  });

  it('renders quota, ETA, next safe run, logs, and errors', () => {
    render(<SyncCenterStatusPanel data={model('failed')} isBusy={false} />);

    expect(screen.getByText('7 / 20')).not.toBeNull();
    expect(screen.getByText('13 safe requests')).not.toBeNull();
    expect(screen.getAllByText('3 hours 21 minutes').length).toBeGreaterThan(0);
    expect(screen.getByText('May 19, 2026, 12:00 AM')).not.toBeNull();
    expect(screen.getByText('log line')).not.toBeNull();
    expect(screen.getByText('failed for test')).not.toBeNull();
  });
});
