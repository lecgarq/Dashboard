/**
 * actionBuckets.ts — Per-action relative quantile bucketing (Phase D).
 *
 * Spec §8/§10 decision 4: each ACTION dimension buckets a node's raw count into
 * none / low / med / high using cut points computed over that action's OWN nonzero
 * distribution, so a 2,228-user action and a 1-user action each use their full range
 * and outliers cannot stretch the layout. The catalog's action descriptors already
 * extract the raw count (f.actionCounts?.[id] ?? 0); this turns counts into buckets.
 *
 * Pure: no React/DOM/IO. Deterministic.
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

/** Bucket index along the ordinal ramp: 0=none, 1=low, 2=med, 3=high. */
export type ActionBucket = 0 | 1 | 2 | 3;
export const ACTION_BUCKET_COUNT = 4;

/** Interior tercile cut points over an action's NONZERO counts: [t1, t2]. */
export type ActionThresholds = readonly [number, number];

/** Linear-interpolated quantile of a pre-sorted ascending array. Precondition: sorted.length >= 1. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Precompute per-action thresholds. For each action id, collect every node's
 * count > 0, sort ascending, and take the 1/3 and 2/3 quantiles as [t1, t2].
 * A node's bucket is then: 0 if count<=0; 1 if count<t1; 2 if count<t2; else 3.
 *
 * Degenerate distributions collapse gracefully: an action with no data anywhere
 * gets [Infinity, Infinity] (every count → none); a single present value puts that
 * value at high (spec §17: rare actions become "did vs didn't").
 */
export function computeActionThresholds(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  actionIds: ReadonlyArray<string>,
): Map<string, ActionThresholds> {
  const byAction = new Map<string, number[]>();
  for (const id of actionIds) byAction.set(id, []);
  for (const f of features) {
    const counts = f.actionCounts;
    if (!counts) continue;
    for (const id of actionIds) {
      const c = counts[id] ?? 0;
      if (c > 0) byAction.get(id)!.push(c);
    }
  }
  const out = new Map<string, ActionThresholds>();
  for (const id of actionIds) {
    const arr = byAction.get(id)!;
    if (arr.length === 0) {
      out.set(id, [Infinity, Infinity]);
      continue;
    }
    arr.sort((a, b) => a - b);
    out.set(id, [quantile(arr, 1 / 3), quantile(arr, 2 / 3)]);
  }
  return out;
}

// NaN counts are not guarded; callers must pass a finite number. NaN falls through to bucket 3 (all NaN comparisons are false).
/** Classify a raw count into a bucket using the action's thresholds. */
export function bucketForCount(count: number, thresholds: ActionThresholds): ActionBucket {
  if (count <= 0) return 0;
  if (count < thresholds[0]) return 1;
  if (count < thresholds[1]) return 2;
  return 3;
}
