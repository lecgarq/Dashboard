/**
 * bucketedColors.ts — Top-N categorical coloring with a grey "Other" bucket,
 * plus a legend model. At most `maxColors` distinct hues; everything else
 * collapses to one muted grey. Ordered/numeric dims keep the existing
 * sequential ramp (buildNodeColors) and return an EMPTY discrete legend.
 * Pure: no React/DOM/IO. Returns RGBA Float32Array(n*4) in [0,1].
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { categoryForColor, buildNodeColors, type ColorMode } from "./nodeColors";
import { getDimension, type DimensionId } from "./dimensionRegistry";

export type RGB = [number, number, number];

/**
 * Helper: round-trip a number through Float32 so the constant exactly matches
 * what Float32Array stores on write-back. Avoids a test assertion mismatch when
 * callers compare `CATEGORICAL_PALETTE[i]` against values extracted from the buffer.
 */
const fr = (v: number): number => Math.fround(v);
const rgb32 = (r: number, g: number, b: number): RGB => [fr(r), fr(g), fr(b)];

/** 12 distinguishable hues (legible on white and near-black). RGB in [0,1]. */
export const CATEGORICAL_PALETTE: readonly RGB[] = [
  rgb32(0.231, 0.510, 0.965), rgb32(0.976, 0.451, 0.086), rgb32(0.133, 0.773, 0.369),
  rgb32(0.545, 0.361, 0.965), rgb32(0.024, 0.714, 0.831), rgb32(0.918, 0.702, 0.031),
  rgb32(0.925, 0.282, 0.600), rgb32(0.078, 0.722, 0.651), rgb32(0.937, 0.267, 0.267),
  rgb32(0.659, 0.333, 0.969), rgb32(0.388, 0.400, 0.945), rgb32(0.518, 0.800, 0.086),
];

/** Muted grey for the residual "Other" bucket. */
export const OTHER_GREY: RGB = rgb32(0.706, 0.737, 0.784);

export interface LegendEntry {
  label: string;
  color: RGB;
  count: number;
  isOther?: boolean;
}

export interface BucketedColors {
  colors: Float32Array;
  legend: LegendEntry[];
}

function isOrdered(mode: ColorMode): boolean {
  // "status" has no registry entry → getDimension returns undefined → false (categorical).
  const d = getDimension(mode as DimensionId);
  return d?.colorScale === "ordered";
}

export function buildBucketedColors(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  mode: ColorMode,
  maxColors = 12,
): BucketedColors {
  if (isOrdered(mode)) {
    return { colors: buildNodeColors(features, mode), legend: [] };
  }

  const counts = new Map<string, number>();
  const cats: string[] = new Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const c = categoryForColor(features[i], mode);
    cats[i] = c;
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );

  const effectiveMax = Math.min(maxColors, CATEGORICAL_PALETTE.length);
  const colorByCat = new Map<string, RGB>();
  const legend: LegendEntry[] = [];
  const top = ranked.slice(0, effectiveMax);
  const rest = ranked.slice(effectiveMax);

  top.forEach(([label, count], i) => {
    const color = CATEGORICAL_PALETTE[i];
    colorByCat.set(label, color);
    legend.push({ label, color, count });
  });
  if (rest.length > 0) {
    const otherCount = rest.reduce((s, [, c]) => s + c, 0);
    for (const [label] of rest) colorByCat.set(label, OTHER_GREY);
    legend.push({ label: "Other", color: OTHER_GREY, count: otherCount, isOther: true });
  }

  const colors = new Float32Array(features.length * 4);
  for (let i = 0; i < features.length; i++) {
    const rgb = colorByCat.get(cats[i]) ?? OTHER_GREY;
    colors[i * 4] = rgb[0];
    colors[i * 4 + 1] = rgb[1];
    colors[i * 4 + 2] = rgb[2];
    colors[i * 4 + 3] = 1;
  }
  return { colors, legend };
}
