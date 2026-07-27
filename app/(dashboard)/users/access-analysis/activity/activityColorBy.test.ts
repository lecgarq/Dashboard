import { describe, expect, it } from "vitest";
import { buildDimColors, buildDimLegend } from "./activityColorBy";
import { activityDimensionById } from "./activityDimensions";
import { buildModuleColorBuffer } from "./moduleColors";
import { OTHER_GREY } from "../bucketedColors";

const MODULE_LABELS = ["(none)", "docs", "issues"];

describe("activityColorBy (DIM-07)", () => {
  it("module passthrough is byte-identical to the established moduleColors buffer", () => {
    const ids = Uint16Array.from([0, 1, 2, 1]);
    const dim = activityDimensionById("module")!;
    const { colors, legend } = buildDimColors(ids, dim, MODULE_LABELS);
    expect(Array.from(colors)).toEqual(
      Array.from(buildModuleColorBuffer(ids, MODULE_LABELS)),
    );
    // Count-desc; the 1-count tie keeps dict order (stable sort): (none) then issues.
    expect(legend.map((e) => e.label)).toEqual(["docs", "(none)", "issues"]);
    expect(legend.reduce((s, e) => s + e.count, 0)).toBe(4);
  });

  it("high-cardinality: every real category gets its own color and legend row", () => {
    const dim = activityDimensionById("verb")!;
    const k = 30;
    const labels = Array.from({ length: k }, (_, i) => (i === 0 ? "(none)" : `verb-${i}`));
    // Category c gets c occurrences (sentinel 0 gets 5).
    const arr: number[] = [];
    for (let c = 1; c < k; c++) for (let j = 0; j < c; j++) arr.push(c);
    for (let j = 0; j < 5; j++) arr.push(0);
    const ids = Uint16Array.from(arr);
    const { colors, legend, categoryColors } = buildDimColors(ids, dim, labels);

    expect(legend).toHaveLength(k);
    expect(legend.some((entry) => /other|more/i.test(entry.label))).toBe(false);
    expect(legend.reduce((s, e) => s + e.count, 0)).toBe(ids.length);

    // Sentinel is its own honestly-labelled category; every real category is distinct.
    expect(categoryColors[0]).toEqual(OTHER_GREY);
    expect(new Set(categoryColors.slice(1).map((rgb) => rgb.join(","))).size).toBe(k - 1);

    // Buffer alignment: node colored per its category.
    const first = ids[0];
    expect(colors[0]).toBeCloseTo(categoryColors[first][0], 5);
    expect(colors.length).toBe(ids.length * 4);
  });

  it("low-cardinality non-sentinel categories all get distinct hues", () => {
    const dim = activityDimensionById("role")!;
    const labels = ["Unknown", "Architect", "Engineer", "Owner"];
    const ids = Uint16Array.from([1, 2, 3, 1, 0]);
    const { legend, categoryColors } = buildDimColors(ids, dim, labels);
    const hues = new Set([1, 2, 3].map((c) => categoryColors[c].join(",")));
    expect(hues.size).toBe(3);
    expect(legend.find((e) => e.label === "Unknown")?.count).toBe(1);
  });

  it("recounts an active month without changing corpus category colors", () => {
    const dim = activityDimensionById("role")!;
    const labels = ["Unknown", "Architect", "Engineer", "Owner"];
    const corpus = buildDimColors(Uint16Array.from([1, 1, 2, 2, 2, 3, 0]), dim, labels);
    const active = buildDimLegend(Uint16Array.from([1, 3, 3]), dim, labels, corpus.categoryColors);
    expect(active.map((e) => [e.label, e.count])).toEqual([
      ["Owner", 2],
      ["Architect", 1],
    ]);
    expect(active[0].colorHex).toBe(corpus.legend.find((e) => e.label === "Owner")?.colorHex);
  });
});
