/**
 * Contrast + ordering floor for the flat-2D tier ramp (`tierSwatch`).
 *
 * Regression guard: the ramp used to be a single theme-INVARIANT set
 * (`TIER_COLORS`), and every one of its six ranks failed the DESIGN.md §2 3:1
 * floor in one theme or the other — ranks 1-2 measured 1.38:1 and 2.38:1 on the
 * zinc card, ranks 3-6 measured 2.84:1 down to 1.48:1 on white. On the workshop
 * projector "View only" was effectively invisible.
 *
 * These tests fail if anyone re-flattens the ramp or nudges a hex past the floor.
 */
import { describe, it, expect } from "vitest";
import { tierSwatch } from "../folderTerrainModel";

/** DESIGN.md §2 surfaces: card background in each theme. */
const LIGHT_SURFACE = "#FFFFFF";
const DARK_SURFACE = "#18181B";
const FLOOR = 3;

const RANKS = [1, 2, 3, 4, 5, 6];

function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("tierSwatch", () => {
  it.each([
    ["light", false, LIGHT_SURFACE],
    ["dark", true, DARK_SURFACE],
  ])("clears the 3:1 floor against the %s card surface at every rank", (_label, dark, surface) => {
    for (const rank of RANKS) {
      const ratio = contrast(tierSwatch(rank, dark as boolean), surface);
      expect(ratio, `rank ${rank} on ${surface}`).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it("stays monotone in luminance so the sequential read survives", () => {
    // Light theme darkens as access grows; dark theme lightens. Either way the
    // ramp moves consistently AWAY from its own surface, never back toward it.
    const light = RANKS.map((r) => relativeLuminance(tierSwatch(r, false)));
    const dark = RANKS.map((r) => relativeLuminance(tierSwatch(r, true)));

    for (let i = 1; i < RANKS.length; i += 1) {
      expect(light[i], `light rank ${i + 1} vs ${i}`).toBeLessThan(light[i - 1]);
      expect(dark[i], `dark rank ${i + 1} vs ${i}`).toBeGreaterThan(dark[i - 1]);
    }
  });

  it("gives light and dark genuinely different values at every rank", () => {
    // The original bug was one ramp serving both themes. If these ever converge
    // again, the floor above is only satisfiable by accident.
    for (const rank of RANKS) {
      expect(tierSwatch(rank, false)).not.toBe(tierSwatch(rank, true));
    }
  });

  it("clamps out-of-range ranks instead of returning undefined", () => {
    expect(tierSwatch(0, false)).toBe(tierSwatch(1, false));
    expect(tierSwatch(99, true)).toBe(tierSwatch(6, true));
  });
});
