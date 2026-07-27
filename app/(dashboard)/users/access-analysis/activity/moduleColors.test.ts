import { describe, expect, it } from "vitest";
import {
  ACTIVITY_MODULE_COLORS,
  buildModuleColorBuffer,
  buildModuleLegend,
  moduleColorHex,
} from "./moduleColors";
import { buildActivitySizes } from "./activitySizes";
import { UNMAPPED_MODULE_LABEL, buildActivityTaxonomy } from "./activityTaxonomyLabels";

// The dict the loader now installs: taxonomy product labels, not serviceGroup tags.
const MODULE_LABELS = buildActivityTaxonomy(["view-entity"], ["(none)"]).moduleLabels;
const DATA_MANAGEMENT = MODULE_LABELS.indexOf("Data Management");
const ADMIN_ACTIONS = MODULE_LABELS.indexOf("Admin Actions");

describe("moduleColors (ACT-01 first-paint color-by, owner decision 3)", () => {
  it("covers every real module dict label with a stable distinct color", () => {
    const hexes = MODULE_LABELS.map(moduleColorHex);
    expect(new Set(hexes).size).toBe(MODULE_LABELS.length); // all distinct
    for (const label of MODULE_LABELS) {
      expect(ACTIVITY_MODULE_COLORS[label]).toBeDefined();
    }
    expect(moduleColorHex(UNMAPPED_MODULE_LABEL)).toBe("#71717a"); // zinc-500 honest bucket
  });

  it("builds an RGBA buffer keyed by moduleId with alpha 1", () => {
    const moduleId = new Uint16Array([0, DATA_MANAGEMENT, DATA_MANAGEMENT, ADMIN_ACTIONS]);
    const rgba = buildModuleColorBuffer(moduleId, MODULE_LABELS);
    expect(rgba.length).toBe(16);
    // Data Management #4e8ccb → r=0x4e/255
    expect(rgba[4]).toBeCloseTo(0x4e / 255, 5);
    expect(rgba[7]).toBe(1);
    // rows 1 and 2 identical (same module)
    expect(rgba.slice(4, 8)).toEqual(rgba.slice(8, 12));
  });

  it("legend counts the FULL set honestly and sorts by count desc", () => {
    const moduleId = new Uint16Array([
      DATA_MANAGEMENT, DATA_MANAGEMENT, DATA_MANAGEMENT, ADMIN_ACTIONS, ADMIN_ACTIONS, 0,
    ]);
    const legend = buildModuleLegend(moduleId, MODULE_LABELS);
    expect(legend.map((e) => e.label)).toEqual([
      "Data Management",
      "Admin Actions",
      UNMAPPED_MODULE_LABEL,
    ]);
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
