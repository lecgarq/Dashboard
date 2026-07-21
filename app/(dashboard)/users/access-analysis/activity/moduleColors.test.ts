import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MODULE_COLORS,
  buildModuleColorBuffer,
  buildModuleLegend,
  moduleColorHex,
} from "./moduleColors";
import { buildActivitySizes } from "./activitySizes";

// Real dict labels from the Phase-38 payload meta.
const MODULE_LABELS = ["(none)", "admin", "docs", "issues", "rfis", "sheets", "submittals"];

describe("moduleColors (ACT-01 first-paint color-by, owner decision 3)", () => {
  it("covers every real module dict label with a stable distinct color", () => {
    const hexes = MODULE_LABELS.map(moduleColorHex);
    expect(new Set(hexes).size).toBe(MODULE_LABELS.length); // all distinct
    for (const label of MODULE_LABELS) {
      expect(ACTIVITY_MODULE_COLORS[label]).toBeDefined();
    }
    expect(moduleColorHex("(none)")).toBe("#71717a"); // zinc-500 honest bucket
  });

  it("builds an RGBA buffer keyed by moduleId with alpha 1", () => {
    const moduleId = new Uint16Array([0, 2, 2, 6]);
    const rgba = buildModuleColorBuffer(moduleId, MODULE_LABELS);
    expect(rgba.length).toBe(16);
    // docs #4e8ccb → r=0x4e/255
    expect(rgba[4]).toBeCloseTo(0x4e / 255, 5);
    expect(rgba[7]).toBe(1);
    // rows 1 and 2 identical (same module)
    expect(rgba.slice(4, 8)).toEqual(rgba.slice(8, 12));
  });

  it("legend counts the FULL set honestly and sorts by count desc", () => {
    const moduleId = new Uint16Array([2, 2, 2, 1, 1, 0]);
    const legend = buildModuleLegend(moduleId, MODULE_LABELS);
    expect(legend.map((e) => e.label)).toEqual(["docs", "admin", "(none)"]);
    expect(legend[0].count).toBe(3);
    expect(legend[2].count).toBe(1);
  });
});

describe("activitySizes (ACT-01 sizing from real event data)", () => {
  it("ramps radius by recency within tight bounds", () => {
    const sizes = buildActivitySizes(new Uint16Array([0, 10, 19]), 20);
    expect(sizes[0]).toBeCloseTo(1.5, 5);
    expect(sizes[2]).toBeCloseTo(3.5, 5);
    expect(sizes[1]).toBeGreaterThan(sizes[0]);
    expect(sizes[1]).toBeLessThan(sizes[2]);
  });
});
