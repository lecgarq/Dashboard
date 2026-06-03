import { describe, it, expect } from "vitest";
import { stampUserProjectCounts } from "./userProjectCounts";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const f = (nodeId: string): NodeFeatureSnapshot => ({ nodeId } as NodeFeatureSnapshot);

describe("stampUserProjectCounts", () => {
  it("stamps each node with how many projects its user is on", () => {
    const fs = [f("u1::p1"), f("u1::p2"), f("u2::p1")];
    stampUserProjectCounts(fs);
    expect(fs[0].projectCount).toBe(2);
    expect(fs[1].projectCount).toBe(2);
    expect(fs[2].projectCount).toBe(1);
  });
  it("handles an empty list", () => {
    const fs: NodeFeatureSnapshot[] = [];
    stampUserProjectCounts(fs);
    expect(fs.length).toBe(0);
  });
});
