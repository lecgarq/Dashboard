import { describe, it, expect, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  assertNoAnomalies,
  AnomalyError,
  DEFAULT_THRESHOLDS,
  type PreviousRunMetrics,
} from './dcAnomalyChecks';

// Covers requirement DC8-09: anomaly auto-quarantine — sanity checks block transaction commit.

function makeMockTx(userCount: number, projectCount: number): Prisma.TransactionClient {
  return {
    accDcUser: { count: vi.fn().mockResolvedValue(userCount) },
    accDcProject: { count: vi.fn().mockResolvedValue(projectCount) },
  } as unknown as Prisma.TransactionClient;
}

describe('dcAnomalyChecks', () => {
  it('resolves silently when no previous baseline exists (first-ever run)', async () => {
    const tx = makeMockTx(0, 0);
    await expect(assertNoAnomalies(tx, null, DEFAULT_THRESHOLDS)).resolves.toBeUndefined();
  });

  it('resolves when user count drops 5% (within 10% threshold)', async () => {
    const tx = makeMockTx(95, 100);
    const prev: PreviousRunMetrics = { userCount: 100, projectCount: 100, rowsByAdminCsv: {} };
    await expect(assertNoAnomalies(tx, prev, DEFAULT_THRESHOLDS)).resolves.toBeUndefined();
  });

  it('throws AnomalyError when user count drops 15% (above 10% threshold)', async () => {
    const tx = makeMockTx(85, 100);
    const prev: PreviousRunMetrics = { userCount: 100, projectCount: 100, rowsByAdminCsv: {} };
    await expect(assertNoAnomalies(tx, prev, DEFAULT_THRESHOLDS)).rejects.toThrow(AnomalyError);
    await expect(assertNoAnomalies(tx, prev, DEFAULT_THRESHOLDS)).rejects.toThrow(/User count dropped/);
  });

  it('throws AnomalyError when project count drops 8% (above 5% threshold)', async () => {
    const tx = makeMockTx(100, 92);
    const prev: PreviousRunMetrics = { userCount: 100, projectCount: 100, rowsByAdminCsv: {} };
    await expect(assertNoAnomalies(tx, prev, DEFAULT_THRESHOLDS)).rejects.toThrow(/Project count/);
  });

  it('throws when admin_users had 100 rows previously but new ingest got 0 with requireNonZeroInsert', async () => {
    const tx = makeMockTx(100, 100);
    const prev: PreviousRunMetrics = {
      userCount: 100,
      projectCount: 100,
      rowsByAdminCsv: { admin_users: 100 },
    };
    await expect(
      assertNoAnomalies(tx, prev, { ...DEFAULT_THRESHOLDS, requireNonZeroInsert: true }, { admin_users: 0 }),
    ).rejects.toThrow(AnomalyError);
  });

  it('resolves the same scenario with requireNonZeroInsert=false', async () => {
    const tx = makeMockTx(100, 100);
    const prev: PreviousRunMetrics = {
      userCount: 100,
      projectCount: 100,
      rowsByAdminCsv: { admin_users: 100 },
    };
    await expect(
      assertNoAnomalies(tx, prev, { ...DEFAULT_THRESHOLDS, requireNonZeroInsert: false }, { admin_users: 0 }),
    ).resolves.toBeUndefined();
  });

  it('threshold override allows 30% user-count drop when maxUserDropPct=50', async () => {
    const tx = makeMockTx(70, 100);
    const prev: PreviousRunMetrics = { userCount: 100, projectCount: 100, rowsByAdminCsv: {} };
    await expect(
      assertNoAnomalies(tx, prev, { ...DEFAULT_THRESHOLDS, maxUserDropPct: 50 }),
    ).resolves.toBeUndefined();
  });
});
