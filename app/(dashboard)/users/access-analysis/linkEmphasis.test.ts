import { describe, it, expect } from "vitest";
import { deriveSameUserEdges } from "./sameUserEdges";
import {
  computeLinkEmphasisColors,
  countBrightEdges,
  assertLinkArrays,
  DEFAULT_LINK_COLORS,
  GOSSAMER_LIGHT,
  GOSSAMER_DARK,
} from "./linkEmphasis";

const edges = deriveSameUserEdges(["u1::p1", "u1::p2", "u2::p1", "u2::p2"]).edges; // 1 edge per user

describe("computeLinkEmphasisColors", () => {
  it("no focus → all edges use base color, length = edges*4", () => {
    const colors = computeLinkEmphasisColors(edges, new Set());
    expect(colors).toHaveLength(edges.length * 4);
    const first4 = Array.from(colors.slice(0, 4));
    const expected = Array.from(DEFAULT_LINK_COLORS.base);
    for (let i = 0; i < 4; i++) {
      expect(first4[i]).toBeCloseTo(expected[i]);
    }
  });

  it("focus → active user's edges bright, others dim", () => {
    const colors = computeLinkEmphasisColors(edges, new Set(["u1"]));
    const u1 = edges.findIndex((e) => e.userId === "u1");
    const u2 = edges.findIndex((e) => e.userId === "u2");
    expect(colors[u1 * 4 + 3]).toBeCloseTo(DEFAULT_LINK_COLORS.bright[3]);
    expect(colors[u2 * 4 + 3]).toBeCloseTo(DEFAULT_LINK_COLORS.dim[3]);
  });

  it("all values are finite and within [0,1]", () => {
    const colors = computeLinkEmphasisColors(edges, new Set(["u1"]));
    for (const v of colors) expect(Number.isFinite(v) && v >= 0 && v <= 1).toBe(true);
  });
});

describe("countBrightEdges", () => {
  it("returns 0 with no focus", () => {
    expect(countBrightEdges(edges, new Set())).toBe(0);
  });
  it("counts only active-user edges under focus", () => {
    expect(countBrightEdges(edges, new Set(["u1"]))).toBe(1);
  });
});

describe("assertLinkArrays", () => {
  it("passes for matching lengths", () => {
    expect(() => assertLinkArrays(edges.length, new Float32Array(edges.length * 2), new Float32Array(edges.length * 4))).not.toThrow();
  });
  it("throws on length mismatch", () => {
    expect(() => assertLinkArrays(edges.length, new Float32Array(1), new Float32Array(edges.length * 4))).toThrow();
  });
});

describe("gossamer link presets", () => {
  it("light base is a dark cool grey at ~0.10 alpha", () => {
    expect(GOSSAMER_LIGHT.base[3]).toBeCloseTo(0.10, 2);
    expect(GOSSAMER_LIGHT.base[0]).toBeLessThan(0.5); // darker than mid-grey → reads on white
  });
  it("dark base is a light grey, slightly higher alpha so it reads on near-black", () => {
    expect(GOSSAMER_DARK.base[3]).toBeGreaterThan(GOSSAMER_LIGHT.base[3]);
    expect(GOSSAMER_DARK.base[0]).toBeGreaterThan(0.5);
  });
  it("both keep bright > base alpha for same-user focus emphasis", () => {
    expect(GOSSAMER_LIGHT.bright[3]).toBeGreaterThan(GOSSAMER_LIGHT.base[3]);
    expect(GOSSAMER_DARK.bright[3]).toBeGreaterThan(GOSSAMER_DARK.base[3]);
  });
});

describe("link colors are faint grey at rest", () => {
  it("base is grey (r≈g≈b) and low-opacity", () => {
    const [r, g, b, a] = DEFAULT_LINK_COLORS.base;
    expect(Math.abs(r - g)).toBeLessThan(0.08);
    expect(Math.abs(g - b)).toBeLessThan(0.08);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(0.3);
  });
  it("no focus → every edge gets the base grey", () => {
    const out = computeLinkEmphasisColors(edges, new Set());
    const first4 = Array.from(out.slice(0, 4));
    const expected = Array.from(DEFAULT_LINK_COLORS.base);
    for (let i = 0; i < 4; i++) {
      expect(first4[i]).toBeCloseTo(expected[i]);
    }
  });
  it("focused user's edge brightens to near-white", () => {
    const out = computeLinkEmphasisColors(edges, new Set(["u1"]));
    const u1 = edges.findIndex((e) => e.userId === "u1");
    expect(out[u1 * 4 + 3]).toBeCloseTo(DEFAULT_LINK_COLORS.bright[3]);
  });
});
