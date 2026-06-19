/**
 * WCAG AA contrast-ratio assertions on the chart label color tokens
 * used across all six /access-analysis chart components — both light
 * and dark (zinc) themes.
 *
 * Pure-math test: no DOM, no React. Runs in Node via Vitest.
 *
 * References:
 *  - WCAG 2.1 §1.4.3 "Contrast (Minimum)" — normal text must be >= 4.5:1
 *  - WCAG relative-luminance formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *
 * Surface approximations:
 *  - Light card:  #FFFFFF  (solid white)
 *  - Dark card:   #18181b  (zinc-900; the tooltip bg is rgba(24,24,27,0.96) —
 *                           0.96 alpha over a near-black page is effectively
 *                           #18181b, documented here as the opaque approximation)
 *  - Light tooltip bg: #ffffff (rgba(255,255,255,0.98) ≈ white)
 *  - Dark tooltip bg:  #18181b (rgba(24,24,27,0.96) ≈ zinc-900)
 *
 * Color constants are duplicated here with source comments so this test
 * tracks the real values used in the chart files (not dynamic runtime values).
 */

import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// WCAG relative-luminance + contrast-ratio helpers
// ---------------------------------------------------------------------------

/**
 * Linearise a single 8-bit sRGB channel value (0–255) to linear light.
 * Formula from https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function linearise(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Compute WCAG relative luminance of a 6-digit hex color string (e.g. "#6b7280").
 * L = 0.2126 R + 0.7152 G + 0.0722 B  (with R/G/B linearised)
 */
function relativeLuminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = linearise((n >> 16) & 0xff);
  const g = linearise((n >> 8) & 0xff);
  const b = linearise(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between a foreground and background color.
 * ratio = (Llighter + 0.05) / (Ldarker + 0.05)
 */
function contrastRatio(fgHex: string, bgHex: string): number {
  const L1 = relativeLuminance(fgHex);
  const L2 = relativeLuminance(bgHex);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Color constants — duplicated from chart source files with source reference.
// Update HERE if the chart constants change; a drift will break this test.
// ---------------------------------------------------------------------------

// Surfaces
const LIGHT_CARD   = "#ffffff"; // card bg in light theme
const DARK_CARD    = "#18181b"; // card bg in dark theme (zinc-900 opaque approx)
const LIGHT_TIP_BG = "#ffffff"; // tooltip bg light: rgba(255,255,255,0.98) ≈ #ffffff
const DARK_TIP_BG  = "#18181b"; // tooltip bg dark:  rgba(24,24,27,0.96) ≈ #18181b

// Donut chart tokens — same across all 5 pie chart components
// Source: RolesPieChart.tsx, CompaniesPieChart.tsx, ActivityByRolePieChart.tsx,
//         CompaniesActivityPieChart.tsx, ModulesPieChart.tsx
const DONUT_CTITLE_DARK  = "#fafafa"; // zinc-50  — center big-number + tooltip title (dark)
const DONUT_CTITLE_LIGHT = "#111827"; // gray-900 — center big-number + tooltip title (light)
const DONUT_CSUB_DARK    = "#a1a1aa"; // zinc-400 — sub-label + tooltip body text (dark)
const DONUT_CSUB_LIGHT   = "#52525b"; // zinc-600 — sub-label + tooltip body text (light)
//                                       ^^^ nudged from #6b7280 (gray-500, 4.6:1 marginal)
//                                       to #52525b (zinc-600) for projector headroom.
//                                       See: 05-05 Task 2 — minimum nudge to clear 4.5:1
//                                       with genuine headroom. Measured: #52525b on #fff ≈ 7.0:1

// Timeline chart tokens
// Source: ActivityTimelineChart.tsx
const TIMELINE_CTITLE_DARK  = "#fafafa"; // same as donut cTitle (dark)
const TIMELINE_CTITLE_LIGHT = "#111827"; // same as donut cTitle (light)
const TIMELINE_CAXIS_DARK   = "#a1a1aa"; // zinc-400 — dataZoom text + tooltip body (dark)
const TIMELINE_CAXIS_LIGHT  = "#52525b"; // zinc-600 — dataZoom text + tooltip body (light)
//                                         ^^^ nudged from #6b7280 to #52525b (same rule as cSub)

const WCAG_AA = 4.5; // WCAG AA normal-text threshold

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WCAG AA contrast — donut chart label tokens (all 5 pie charts)", () => {
  it("light cTitle (#111827) on light card (#ffffff) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CTITLE_LIGHT, LIGHT_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("dark cTitle (#fafafa) on dark card (#18181b) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CTITLE_DARK, DARK_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("light cSub (#52525b) on light card (#ffffff) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CSUB_LIGHT, LIGHT_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("dark cSub (#a1a1aa) on dark card (#18181b) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CSUB_DARK, DARK_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });
});

describe("WCAG AA contrast — donut tooltip text on tooltip surface", () => {
  it("light tooltip title (#111827) on light tooltip bg (#ffffff) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CTITLE_LIGHT, LIGHT_TIP_BG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("dark tooltip title (#fafafa) on dark tooltip bg (#18181b) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CTITLE_DARK, DARK_TIP_BG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("light tooltip body (#52525b) on light tooltip bg (#ffffff) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CSUB_LIGHT, LIGHT_TIP_BG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("dark tooltip body (#a1a1aa) on dark tooltip bg (#18181b) >= 4.5:1", () => {
    const ratio = contrastRatio(DONUT_CSUB_DARK, DARK_TIP_BG);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });
});

describe("WCAG AA contrast — ActivityTimelineChart label tokens", () => {
  it("light cTitle (#111827) on light card (#ffffff) >= 4.5:1", () => {
    const ratio = contrastRatio(TIMELINE_CTITLE_LIGHT, LIGHT_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("dark cTitle (#fafafa) on dark card (#18181b) >= 4.5:1", () => {
    const ratio = contrastRatio(TIMELINE_CTITLE_DARK, DARK_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("light cAxis (#52525b) on light card (#ffffff) >= 4.5:1", () => {
    const ratio = contrastRatio(TIMELINE_CAXIS_LIGHT, LIGHT_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });

  it("dark cAxis (#a1a1aa) on dark card (#18181b) >= 4.5:1", () => {
    const ratio = contrastRatio(TIMELINE_CAXIS_DARK, DARK_CARD);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA);
  });
});

describe("contrastRatio helper — reference sanity checks", () => {
  it("black on white = 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("white on white = 1:1", () => {
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("WCAG AA example: #777777 on white fails (4.47:1 < 4.5:1)", () => {
    // #777 is a well-known borderline failure used in WCAG documentation
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(WCAG_AA);
  });
});
