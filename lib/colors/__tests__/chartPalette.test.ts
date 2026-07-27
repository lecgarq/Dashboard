import { describe, it, expect } from "vitest";
import {
  CHART_PALETTE_LIGHT,
  CHART_PALETTE_DARK,
  chartColorAt,
} from "../chartPalette";

const HEX = /^#[0-9a-f]{6}$/;

/** Relative luminance per WCAG 2.x. */
function lum(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
}

function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe("chartPalette", () => {
  it("exposes 24 unique valid hex slots per theme", () => {
    for (const p of [CHART_PALETTE_LIGHT, CHART_PALETTE_DARK]) {
      expect(p).toHaveLength(24);
      expect(p.every((c) => HEX.test(c))).toBe(true);
      expect(new Set(p).size).toBe(24);
    }
  });

  it("keeps the first eight slots exactly on the DESIGN.md brand tokens", () => {
    expect(CHART_PALETTE_LIGHT.slice(0, 8)).toEqual([
      "#2e5f95", "#e65a28", "#0089a3", "#b0810a",
      "#7e3567", "#68803a", "#1b80b3", "#c42021",
    ]);
    expect(CHART_PALETTE_DARK.slice(0, 8)).toEqual([
      "#4e8ccb", "#e2683a", "#0e98a8", "#ba8a0e",
      "#b4679c", "#849c4c", "#3a9dbf", "#e05b55",
    ]);
  });

  it("is not single-mode — every slot differs between themes", () => {
    CHART_PALETTE_LIGHT.forEach((c, i) => {
      expect(c).not.toBe(CHART_PALETTE_DARK[i]);
    });
  });

  // The bug this palette replaces: the old 24-color array lightened in BOTH
  // themes, so its tail fell under 3:1 on white.
  it("holds a 3:1 contrast floor against its own surface, including the tail", () => {
    for (const c of CHART_PALETTE_LIGHT) expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(3);
    for (const c of CHART_PALETTE_DARK) expect(contrast(c, "#18181b")).toBeGreaterThanOrEqual(3);
  });

  it("cycles past the end rather than returning undefined", () => {
    expect(chartColorAt(24, true)).toBe(CHART_PALETTE_DARK[0]);
    expect(chartColorAt(30, false)).toBe(CHART_PALETTE_LIGHT[6]);
  });
});
