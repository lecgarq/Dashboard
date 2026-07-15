/**
 * dimensionBands.ts — Pure labeled-tier banding for the continuous aperture
 * dimensions on /users/spatial-graph (Phase 25, DIM-01/DIM-05).
 *
 * Group-by / Color-by need discrete buckets, so every continuous node dimension
 * bands into a SHORT LABELED tier — never a bare number, never a one-bucket
 * "None" collapse. Cut-points are FIXED (documented below), not dataset
 * quantiles, so each function stays per-node pure and the displayed tiers are
 * inspectable and honest (owner decision: banded swatches, no ramps).
 *
 * Fixed cut-points:
 *  - riskScore (0..5 count of true riskFlags):  0–1 Low · 2–3 Med · 4 High · 5 Crit
 *  - permissionStrength (0..5 access ladder):   0 None · 1–2 Low · 3–4 Med · 5 High
 *  - activityVolume (event total): reuses featureSnapshot.bucketActivity —
 *    0 None · 1–10 Low · 11–100 Med · 101+ High
 *  - folderBreadth (distinct folders granted):  0 None · <10 · <100 · <1k · 1k+
 *  - accessibleData (reachable bytes; 0 until crawled):
 *    0/unknown None · <1 GB · <100 GB · <1 TB · 1 TB+
 *
 * Every function is total and deterministic: null/undefined map to a stable
 * labeled tier ("None"/"Unknown"), never an empty string or a bare number.
 * Pure: no React/DOM/IO, no dataset state.
 */
import { bucketActivity } from "./featureSnapshot";

/** riskScore 0..5 → Low / Med / High / Crit. null/undefined → Unknown. */
export function bandRiskScore(v: number | null | undefined): string {
  if (v == null) return "Unknown";
  const s = Math.max(0, Math.min(5, Math.round(v)));
  if (s <= 1) return "Low";
  if (s <= 3) return "Med";
  if (s === 4) return "High";
  return "Crit";
}

/** permissionStrength 0..5 (access ladder) → None / Low / Med / High. */
export function bandPermissionStrength(v: number | null | undefined): string {
  if (v == null) return "None";
  const s = Math.max(0, Math.min(5, Math.round(v)));
  if (s === 0) return "None";
  if (s <= 2) return "Low";
  if (s <= 4) return "Med";
  return "High";
}

/** Activity event total → the snapshot's coarse bucket (None/Low/Med/High). */
export function bandActivityVolume(total: number | null | undefined): string {
  return bucketActivity(total ?? 0);
}

/** Distinct folders granted → labeled breadth band. */
export function bandFolderBreadth(breadth: number | null | undefined): string {
  if (breadth == null || breadth <= 0) return "None";
  if (breadth < 10) return "< 10 folders";
  if (breadth < 100) return "< 100 folders";
  if (breadth < 1000) return "< 1k folders";
  return "1k+ folders";
}

const GB = 1024 ** 3;
const TB = 1024 ** 4;

/** Reachable bytes → labeled size band. 0/null = "None" (0 until crawled). */
export function bandAccessibleData(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "None";
  if (bytes < GB) return "< 1 GB";
  if (bytes < 100 * GB) return "< 100 GB";
  if (bytes < TB) return "< 1 TB";
  return "1 TB+";
}
