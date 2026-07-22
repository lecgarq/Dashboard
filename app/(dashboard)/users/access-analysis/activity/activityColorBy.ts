/**
 * activityColorBy.ts — v2.7 Phase 40 (DIM-07).
 *
 * Color-by buffers + honest legends for any activity dimension. Module keeps
 * its established 7-color language (delegates to moduleColors). Every other
 * dimension gives every dictionary category its own stable color. The slot-0
 * sentinel remains muted grey but keeps its real label — no "Other" bucket.
 * Pure — no React/DOM/IO.
 */

import { CATEGORICAL_PALETTE, OTHER_GREY, type RGB } from "../bucketedColors";
import { buildModuleColorBuffer, moduleColorHex } from "./moduleColors";
import type { ActivityDimension } from "./activityDimensions";

export interface ActivityLegendEntry {
  label: string;
  colorHex: string;
  count: number;
}

function rgbToHex([r, g, b]: RGB): string {
  const h = (v: number): string =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export interface DimColorResult {
  /** RGBA Float32Array aligned to the input ids (len*4, values 0–1). */
  colors: Float32Array;
  /** Honest legend, count-desc; grey remainder row last when present. */
  legend: ActivityLegendEntry[];
  /** Per-category RGB aligned to category id — for label-chip color lookup. */
  categoryColors: RGB[];
}

const GOLDEN_RATIO = 0.618033988749895;

/** Stable brand-palette variants: distinct per category without an Other bucket. */
function categoryColor(category: number): RGB {
  if (category === 0) return OTHER_GREY;
  const index = category - 1;
  const base = CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length];
  const round = Math.floor(index / CATEGORICAL_PALETTE.length);
  if (round === 0) return base;

  const mix = 0.08 + ((round * GOLDEN_RATIO) % 1) * 0.2;
  const target = round % 2 === 0 ? 1 : 0;
  return base.map((channel) => Math.fround(channel + (target - channel) * mix)) as RGB;
}

/** Active-period legend using a corpus-stable category palette. */
export function buildDimLegend(
  ids: ArrayLike<number>,
  dim: ActivityDimension,
  labels: readonly string[],
  categoryColors: readonly RGB[],
): ActivityLegendEntry[] {
  const counts = new Uint32Array(Math.max(1, labels.length));
  for (let i = 0; i < ids.length; i++) counts[ids[i] < counts.length ? ids[i] : 0] += 1;
  if (dim.id === "module") {
    return labels
      .map((label, c) => ({ label, colorHex: moduleColorHex(label), count: counts[c] }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
  }
  return labels
    .map((label, c) => ({ label, colorHex: rgbToHex(categoryColors[c] ?? OTHER_GREY), count: counts[c], c }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.c - b.c)
    .map(({ c: _c, ...entry }) => entry);
}

/**
 * Color buffer + legend for one dimension over the given id column (full set
 * or a gathered subset). Counts — and therefore the legend — are honest over
 * exactly the ids passed in.
 */
export function buildDimColors(
  ids: ArrayLike<number>,
  dim: ActivityDimension,
  labels: readonly string[],
): DimColorResult {
  const k = Math.max(1, labels.length);

  if (dim.id === "module") {
    // Established 7-color module language, unchanged (owner decision, Ph39).
    const u16 = ids instanceof Uint16Array ? ids : Uint16Array.from(ids as ArrayLike<number>);
    const categoryColors: RGB[] = labels.map((label) => {
      const hex = moduleColorHex(label);
      const n = parseInt(hex.replace("#", ""), 16);
      return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    });
    const legend = buildDimLegend(u16, dim, labels, categoryColors);
    return { colors: buildModuleColorBuffer(u16, labels), legend, categoryColors };
  }

  const categoryColors: RGB[] = Array.from({ length: k }, (_, c) =>
    dim.hasSentinel && c === 0 ? OTHER_GREY : categoryColor(c),
  );

  // Palette table → single O(n) lookup pass.
  const palette = new Float32Array(k * 4);
  for (let c = 0; c < k; c++) {
    const [r, g, b] = categoryColors[c];
    palette[c * 4] = r;
    palette[c * 4 + 1] = g;
    palette[c * 4 + 2] = b;
    palette[c * 4 + 3] = 1;
  }
  const colors = new Float32Array(ids.length * 4);
  for (let i = 0; i < ids.length; i++) {
    const p = (ids[i] < k ? ids[i] : 0) * 4;
    colors[i * 4] = palette[p];
    colors[i * 4 + 1] = palette[p + 1];
    colors[i * 4 + 2] = palette[p + 2];
    colors[i * 4 + 3] = 1;
  }

  const legend = buildDimLegend(ids, dim, labels, categoryColors);
  return { colors, legend, categoryColors };
}
