import { describe, it, expect } from "vitest";
import {
  computeActionThresholds,
  bucketForCount,
  ACTION_BUCKET_COUNT,
} from "./actionBuckets";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function feat(actionCounts: Record<string, number>): NodeFeatureSnapshot {
  // Only actionCounts matters here; cast through unknown for the partial shape.
  return { actionCounts } as unknown as NodeFeatureSnapshot;
}

describe("actionBuckets", () => {
  it("has 4 buckets (none/low/med/high)", () => {
    expect(ACTION_BUCKET_COUNT).toBe(4);
  });

  it("count 0 is always bucket 0 (none), regardless of thresholds", () => {
    expect(bucketForCount(0, [5, 10])).toBe(0);
    expect(bucketForCount(0, [Infinity, Infinity])).toBe(0);
  });

  it("classifies nonzero counts into low/med/high by tercile cut points", () => {
    // 9 nonzero values 1..9 → terciles t1≈3.67, t2≈6.33
    const features = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => feat({ view: c }));
    const th = computeActionThresholds(features, ["view"]).get("view")!;
    expect(th[0]).toBeGreaterThan(0);
    expect(th[1]).toBeGreaterThan(th[0]);
    expect(bucketForCount(1, th)).toBe(1); // low
    expect(bucketForCount(5, th)).toBe(2); // med
    expect(bucketForCount(9, th)).toBe(3); // high
  });

  it("per-action relative: a rare 1-user action degenerates to none vs present", () => {
    const features = [feat({ rare: 1 }), feat({ rare: 0 }), feat({})];
    const th = computeActionThresholds(features, ["rare"]).get("rare")!;
    expect(bucketForCount(0, th)).toBe(0);
    expect(bucketForCount(1, th)).toBe(3); // the single present value lands at high
  });

  it("an action with no data anywhere gets [Infinity, Infinity] (all counts → none)", () => {
    const th = computeActionThresholds([feat({})], ["ghost"]).get("ghost")!;
    expect(th).toEqual([Infinity, Infinity]);
    expect(bucketForCount(0, th)).toBe(0);
  });

  it("outliers do not move the cut points off the bulk (relative, not absolute)", () => {
    const counts = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000]; // one huge outlier
    const th = computeActionThresholds(counts.map((c) => feat({ a: c })), ["a"]).get("a")!;
    // t1/t2 stay near the bulk (1), so a count of 2 is already high, not "low".
    expect(th[0]).toBeLessThan(1000);
    expect(bucketForCount(1, th)).toBeLessThanOrEqual(3);
  });
});
