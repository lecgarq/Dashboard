// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chartColor, sequenceColor } from "./chartColors";

describe("chartColors", () => {
  it("resolves semantic roles to light-theme fallback hex in jsdom", () => {
    // jsdom returns "" for CSS custom properties, so the fallback map is used.
    expect(chartColor("good")).toBe("#059669");
    expect(chartColor("watch")).toBe("#D97706");
    expect(chartColor("risk")).toBe("#EF4444");
    expect(chartColor("info")).toBe("#2563EB");
    expect(chartColor("neutral")).toBe("#6B7280");
  });

  it("returns curated sequence colors and wraps after five", () => {
    expect(sequenceColor(0)).toBe("#2563EB");
    expect(sequenceColor(4)).toBe("#EA580C");
    expect(sequenceColor(5)).toBe("#2563EB"); // wraps
    expect(sequenceColor(-1)).toBe("#EA580C"); // negative wraps
  });
});
