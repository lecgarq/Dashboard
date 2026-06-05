import { describe, it, expect } from "vitest";
import { curatedSliderDimensions } from "./curatedSliders";
import { buildDimensionCatalog } from "./dimensionCatalog";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function sampleFeatures(): NodeFeatureSnapshot[] {
  // One minimal node is enough: buildStructuralDimensions marks structural dims
  // available:true regardless of row count, so they surface.
  return [
    {
      nodeId: "u1::p1", userName: "A", project: "p1", role: "r1",
      moduleSignature: [], permissionStrength: 2,
    } as unknown as NodeFeatureSnapshot,
  ];
}

describe("curatedSliderDimensions (un-pared)", () => {
  it("surfaces the meaningful structural dimensions, not just user", () => {
    const catalog = buildDimensionCatalog(sampleFeatures());
    const ids = curatedSliderDimensions(catalog).map((d) => d.id);
    expect(ids).toContain("project");
    expect(ids).toContain("role");
    expect(ids).toContain("user");
    expect(ids).toContain("moduleAccess");
    expect(ids.length).toBeGreaterThan(5);
  });
});
