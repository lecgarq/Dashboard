import { describe, it, expect } from "vitest";
import { deriveSameUserEdges } from "./sameUserEdges";
import {
  computeLinkEmphasisColors,
  countBrightEdges,
  assertLinkArrays,
  DEFAULT_LINK_COLORS,
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
