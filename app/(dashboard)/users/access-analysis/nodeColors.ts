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

import {
  DIMENSION_REGISTRY,
  getDimension,
  dimensionHasSurface,
  type DimensionId,
} from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/**
 * Dimension-backed color modes: any registry dim declaring a "color" surface.
 * Capability-based (not raw type) so ordered/color-only dims (riskScore,
 * permissionStrength, activityMix) become color modes while keeping every
 * existing categorical/binary mode.
 */
const COLORABLE_DIM_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter((d) =>
  dimensionHasSurface(d, "color"),
).map((d) => d.id);

/** Non-dimension extra modes (no registry dim). `status` reads accountStatus. */
const EXTRA_COLOR_MODES = ["status"] as const;

export type ColorMode = DimensionId | (typeof EXTRA_COLOR_MODES)[number];

// "company" leads (firm grouping is the first coloring most users want). Then "role",
// then the rest of the dim-backed modes, then the non-dimension extras.
export const COLOR_MODES: readonly ColorMode[] = [
  "company",
  "role",
  ...COLORABLE_DIM_IDS.filter((id) => id !== "company" && id !== "role"),
  ...EXTRA_COLOR_MODES,
];

/** Human-readable labels for the Toolbar color-mode selector. */
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  ...Object.fromEntries(COLORABLE_DIM_IDS.map((id) => [id, getDimension(id)!.label])),
  company: "Company",
  status: "Account status",
} as Record<ColorMode, string>;

/** Category string used to pick a color. Dim-backed → descriptor.extract; extras explicit. */
export function categoryForColor(f: NodeFeatureSnapshot, mode: ColorMode): string {
  if (mode === "status") return f.accountStatus || "(unknown)";
  const d = getDimension(mode as DimensionId);
  const v = d ? d.extract(f) : null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join("|") : "(none)";
  return "(none)";
}

/** One-time migration: the legacy `external` color-mode id → `internalExternal`. */
export function migrateColorMode(mode: string): ColorMode {
  if (mode === "external") return "internalExternal";
  return (COLOR_MODES as readonly string[]).includes(mode) ? (mode as ColorMode) : "role";
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

/**
 * Sequential ramp for "ordered" color-scale dims: blue (low) → red (high),
 * legible on the dark zinc (#09090B) background. Reuses local hslToRgb.
 */
function colorForOrdered(value: number, max: number): [number, number, number] {
  const t = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return hslToRgb(0.58 - 0.58 * t, 0.7, 0.55);
}

// ---------------------------------------------------------------------------
// Buffer builder
// ---------------------------------------------------------------------------

/**
 * Cluster assignment matching the color grouping: nodes with the same color
 * category (for the given mode) get the same contiguous cluster index (0..k-1).
 * `labels[idx]` is that cluster's category string (for future cluster labels).
 */
export function buildClusterAssignment(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  mode: ColorMode,
): { clusterIds: Int32Array; labels: string[] } {
  const indexByCat = new Map<string, number>();
  const labels: string[] = [];
  const clusterIds = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const cat = categoryForColor(features[i], mode);
    let idx = indexByCat.get(cat);
    if (idx === undefined) { idx = labels.length; indexByCat.set(cat, idx); labels.push(cat); }
    clusterIds[i] = idx;
  }
  return { clusterIds, labels };
}

/**
 * Build an RGBA Float32Array(n*4) coloring each node by `mode`. Same category →
 * same color; alpha is always 1.0.
 */
export function buildNodeColors(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  mode: ColorMode,
): Float32Array {
  const buf = new Float32Array(features.length * 4);
  const dim = getDimension(mode as DimensionId);

  // Ordered (sequential) ramp path: numeric extract → normalized blue→red.
  if (dim?.colorScale === "ordered") {
    // Find max ONCE across all features → deterministic normalization.
    let max = 0;
    for (const f of features) {
      const v = Number(dim.extract(f)) || 0;
      if (v > max) max = v;
    }
    for (let i = 0; i < features.length; i++) {
      const v = Number(dim.extract(features[i])) || 0;
      const rgb = colorForOrdered(v, max);
      buf[i * 4] = rgb[0];
      buf[i * 4 + 1] = rgb[1];
      buf[i * 4 + 2] = rgb[2];
      buf[i * 4 + 3] = 1;
    }
    return buf;
  }

  // Categorical hashed-hue path (unchanged).
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
