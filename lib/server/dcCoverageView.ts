import "server-only";
import { db } from "@/server/db";

/**
 * DC-metadata coverage: how many of the live AccProject universe are represented
 * in the Data Connector snapshot (AccDcProject).
 *
 * - covered  ≈ 550  — AccDcProject rows (DC-extractable projects)
 * - total    ≈ 1,153 — AccProject rows  (full live-API project universe)
 *
 * TRUTH-01: these live counts (not hard-coded) power the per-metric DC coverage
 * label on /access-analysis.
 */
export interface DcCoverage {
  covered: number;
  total: number;
}

let cache: { at: number; data: DcCoverage } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Pure assembly — exported for unit testing.
 * Returns `{ covered, total }` verbatim so callers can assert the values came
 * from live counts without any hard-coded constant.
 */
export function assembleDcCoverage(covered: number, total: number): DcCoverage {
  return { covered, total };
}

/**
 * Returns live DC-metadata coverage counts with a 5-minute in-process cache.
 *
 * Precedent: mirrors the pattern of `loadProjectCoverage` in `projectCoverageView.ts`.
 * No Prisma access in client components — DB queries live here only.
 */
export async function loadDcCoverage(force = false): Promise<DcCoverage> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [covered, total] = await Promise.all([
    db.accDcProject.count(),
    db.accProject.count(),
  ]);

  const data = assembleDcCoverage(covered, total);
  cache = { at: Date.now(), data };
  return data;
}
