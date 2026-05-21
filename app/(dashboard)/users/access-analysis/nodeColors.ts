/**
 * nodeColors.ts — Pure semantic node-color helpers for the Access Analysis graph.
 *
 * No React, no DOM, no I/O. Produces RGBA Float32Array(n*4) buffers in [0,1] that
 * the renderer consumes directly (REND-04 purity contract — the renderer never
 * computes color, it only uploads a precomputed buffer).
 *
 * WHY THIS EXISTS
 * ===============
 * `AccessAnalysisShell` currently fills a CONSTANT light-blue for every node, so
 * the graph carries no semantic encoding. This module colors nodes by a chosen
 * categorical dimension (role / permission tier / account status / internal-vs-
 * external), porting the *idea* of the donor color system (`buildNodeColorBuffer`
 * / `roleColor` in the legacy `AccUsersGraph` stack) without importing it.
 *
 * Alpha is always 1.0: dimming/greyout is a MASK concern (handled by the physics
 * alpha mask + cosmos `pointGreyoutOpacity` / three.js DIM), kept orthogonal to
 * color so the two never fight.
 *
 * NOTE: additive and intentionally UNWIRED. A later phase adds a color-by selector
 * in the Toolbar and swaps the constant buffer in the shell for `buildNodeColors`.
 */

import type { NodeFeatureSnapshot } from "./interactionTypes";

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

export type ColorMode = "role" | "tier" | "status" | "external";

// "external" leads — it is the default color mode (the clearest at-a-glance
// security signal: who is internal vs an outside collaborator).
export const COLOR_MODES: readonly ColorMode[] = ["external", "role", "tier", "status"];

/** Human-readable labels for the Toolbar color-mode selector. */
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  external: "Internal / External",
  role: "Role",
  tier: "Permission tier",
  status: "Account status",
};

/** The categorical value used to pick a color for the given mode. */
export function categoryForColor(f: NodeFeatureSnapshot, mode: ColorMode): string {
  switch (mode) {
    case "role":
      return f.role;
    case "tier":
      return f.permTier ?? "(none)";
    case "status":
      return f.accountStatus || "(unknown)";
    case "external":
      return f.isExternal ? "external" : "internal";
  }
}

// ---------------------------------------------------------------------------
// Deterministic category → color
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash — deterministic, well-spread for short category strings. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619, kept in 32-bit unsigned space.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * HSL → RGB, all inputs/outputs normalized to [0,1]. Standard conversion; kept
 * local so this module has zero dependencies.
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

/**
 * Deterministic RGB for a category string. Hash → hue spreads categories across
 * the wheel; fixed saturation/lightness keep colors legible against the dark zinc
 * (#09090B) background.
 */
function colorForCategory(category: string): [number, number, number] {
  const hue = (hash32(category) % 360) / 360;
  return hslToRgb(hue, 0.6, 0.6);
}

// ---------------------------------------------------------------------------
// Buffer builder
// ---------------------------------------------------------------------------

/**
 * Build an RGBA Float32Array(n*4) coloring each node by `mode`. Same category →
 * same color; alpha is always 1.0.
 */
export function buildNodeColors(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  mode: ColorMode,
): Float32Array {
  const buf = new Float32Array(features.length * 4);
  // Cache color per category so repeated values reuse one computation.
  const cache = new Map<string, [number, number, number]>();
  for (let i = 0; i < features.length; i++) {
    const category = categoryForColor(features[i], mode);
    let rgb = cache.get(category);
    if (!rgb) {
      rgb = colorForCategory(category);
      cache.set(category, rgb);
    }
    buf[i * 4] = rgb[0];
    buf[i * 4 + 1] = rgb[1];
    buf[i * 4 + 2] = rgb[2];
    buf[i * 4 + 3] = 1;
  }
  return buf;
}
