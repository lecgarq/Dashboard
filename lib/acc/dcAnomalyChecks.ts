/**
 * dcAnomalyChecks — DC8-09 anomaly auto-quarantine.
 *
 * Pure module aside from a type-only import of Prisma.TransactionClient.
 * Plan 08-05 (dcAdminCsvIngest) calls `assertNoAnomalies` INSIDE its transaction
 * so a violation throws and rolls back the snapshot rather than silently wiping
 * the dashboard.
 *
 * Thresholds per RESEARCH.md Pattern 4. First-ever run (previous=null) is silent
 * so cold starts can't be blocked by a missing baseline.
 */

import type { Prisma } from '@prisma/client';

export interface AnomalyThresholds {
  maxUserDropPct: number;       // default 10
  maxProjectDropPct: number;    // default 5
  requireAllAdminCsvs: boolean; // default true
  requireNonZeroInsert: boolean;// default true
}

export interface PreviousRunMetrics {
  userCount: number;
  projectCount: number;
  rowsByAdminCsv: Record<string, number>;
}

export const DEFAULT_THRESHOLDS: AnomalyThresholds = {
  maxUserDropPct: 10,
  maxProjectDropPct: 5,
  requireAllAdminCsvs: true,
  requireNonZeroInsert: true,
};

export class AnomalyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnomalyError';
  }
}

/**
 * Assert no anomalies versus the previous run baseline.
 *
 * @param tx active Prisma transaction client (will be queried for current AccDc* counts)
 * @param previous previous-run metrics (null on first-ever ingest -> silent)
 * @param thresholds tunable thresholds (defaults from DEFAULT_THRESHOLDS)
 * @param currentRowsByAdminCsv optional map of admin-csv -> rows inserted in THIS run
 *                              (required to evaluate requireNonZeroInsert)
 */
export async function assertNoAnomalies(
  tx: Prisma.TransactionClient,
  previous: PreviousRunMetrics | null,
  thresholds: AnomalyThresholds = DEFAULT_THRESHOLDS,
  currentRowsByAdminCsv?: Record<string, number>,
): Promise<void> {
  if (previous == null) {
    return; // first-ever run; nothing to compare against
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const txAny = tx as any;
  const [currentUserCount, currentProjectCount] = await Promise.all([
    txAny.accDcUser.count() as Promise<number>,
    txAny.accDcProject.count() as Promise<number>,
  ]);

  if (previous.userCount > 0) {
    const dropPct = ((previous.userCount - currentUserCount) / previous.userCount) * 100;
    if (dropPct > thresholds.maxUserDropPct) {
      throw new AnomalyError(
        `User count dropped ${dropPct.toFixed(1)}% (from ${previous.userCount} to ${currentUserCount}); threshold ${thresholds.maxUserDropPct}%`,
      );
    }
  }

  if (previous.projectCount > 0) {
    const dropPct = ((previous.projectCount - currentProjectCount) / previous.projectCount) * 100;
    if (dropPct > thresholds.maxProjectDropPct) {
      throw new AnomalyError(
        `Project count dropped ${dropPct.toFixed(1)}% (from ${previous.projectCount} to ${currentProjectCount}); threshold ${thresholds.maxProjectDropPct}%`,
      );
    }
  }

  if (thresholds.requireNonZeroInsert && currentRowsByAdminCsv) {
    for (const [csvName, prevRows] of Object.entries(previous.rowsByAdminCsv)) {
      if (prevRows > 0) {
        const currentRows = currentRowsByAdminCsv[csvName] ?? 0;
        if (currentRows === 0) {
          throw new AnomalyError(
            `Admin CSV "${csvName}" inserted 0 rows in this run but had ${prevRows} previously; requireNonZeroInsert blocked commit`,
          );
        }
      }
    }
  }

  if (thresholds.requireAllAdminCsvs && currentRowsByAdminCsv) {
    for (const csvName of Object.keys(previous.rowsByAdminCsv)) {
      if (!(csvName in currentRowsByAdminCsv)) {
        throw new AnomalyError(
          `Admin CSV "${csvName}" missing from current run; requireAllAdminCsvs blocked commit`,
        );
      }
    }
  }
}
