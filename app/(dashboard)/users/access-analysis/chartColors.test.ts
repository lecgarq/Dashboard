// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chartColor, sequenceColor } from "./chartColors";

describe("chartColors", () => {
  it("resolves semantic roles to light-theme fallback hex in jsdom", () => {
    // jsdom returns "" for CSS custom properties, so the fallback map is used.
    expect(chartColor("good")).toBe("#0E8A6D");
    expect(chartColor("watch")).toBe("#B0810A");
    expect(chartColor("risk")).toBe("#C42021");
    expect(chartColor("info")).toBe("#2E5F95");
    expect(chartColor("neutral")).toBe("#6B7280");
  });

  it("returns curated sequence colors and wraps after five", () => {
    expect(sequenceColor(0)).toBe("#2E5F95");
    expect(sequenceColor(4)).toBe("#7E3567");
    expect(sequenceColor(5)).toBe("#2E5F95"); // wraps
    expect(sequenceColor(-1)).toBe("#7E3567"); // negative wraps
  });
});
