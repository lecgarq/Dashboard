/**
 * activityColorBy.ts — v2.7 Phase 40 (DIM-07).
 *
 * Color-by buffers + honest legends for any activity dimension. Module keeps
 * its established 7-color language (delegates to moduleColors). Every other
 * dimension gets top-N distinct hues (CATEGORICAL_PALETTE, legible both
 * themes) with the remainder — and the slot-0 sentinel — in muted grey; the
 * legend carries honest counts including an explicit "(+K more)" grey row.
 * Pure — no React/DOM/IO.
 */

import { CATEGORICAL_PALETTE, OTHER_GREY, type RGB } from "../bucketedColors";
import { buildModuleColorBuffer, buildModuleLegend } from "./moduleColors";
import type { ActivityDimension } from "./activityDimensions";

export interface ActivityLegendEntry {
  label: string;
  colorHex: string;
  count: number;
  isOther?: boolean;
}

export const MAX_DIM_COLORS = 12;

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

/**
 * Color buffer + legend for one dimension over the given id column (full set
 * or a gathered subset). Counts — and therefore the legend — are honest over
 * exactly the ids passed in.
 */
export function buildDimColors(
  ids: ArrayLike<number>,
  dim: ActivityDimension,
  labels: readonly string[],
  maxColors: number = MAX_DIM_COLORS,
): DimColorResult {
  const k = Math.max(1, labels.length);

  if (dim.id === "module") {
    // Established 7-color module language, unchanged (owner decision, Ph39).
    const u16 = ids instanceof Uint16Array ? ids : Uint16Array.from(ids as ArrayLike<number>);
    const legend = buildModuleLegend(u16, labels).map((e) => ({
      label: e.label,
      colorHex: e.colorHex,
      count: e.count,
    }));
    const categoryColors: RGB[] = labels.map((label) => {
      const hex = legend.find((e) => e.label === label)?.colorHex ?? rgbToHex(OTHER_GREY);
      const n = parseInt(hex.replace("#", ""), 16);
      return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
    });
    return { colors: buildModuleColorBuffer(u16, labels), legend, categoryColors };
  }

  const counts = new Uint32Array(k);
  for (let i = 0; i < ids.length; i++) {
    const c = ids[i] < k ? ids[i] : 0;
    counts[c] += 1;
  }
  // Top-N by count — the sentinel slot never earns a hue (always grey).
  const ranked = Array.from({ length: k }, (_, c) => c)
    .filter((c) => counts[c] > 0 && !(dim.hasSentinel && c === 0))
    .sort((a, b) => counts[b] - counts[a] || a - b);
  const colored = ranked.slice(0, maxColors);

  const categoryColors: RGB[] = new Array(k).fill(OTHER_GREY);
  colored.forEach((c, i) => {
    categoryColors[c] = CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length];
  });

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

  const legend: ActivityLegendEntry[] = colored.map((c) => ({
    label: labels[c] ?? `#${c}`,
    colorHex: rgbToHex(categoryColors[c]),
    count: counts[c],
  }));
  let otherCount = 0;
  let otherCats = 0;
  for (let c = 0; c < k; c++) {
    if (counts[c] > 0 && !colored.includes(c)) {
      otherCount += counts[c];
      otherCats += 1;
    }
  }
  if (otherCount > 0) {
    legend.push({
      label: `(+${otherCats.toLocaleString("en-US")} more)`,
      colorHex: rgbToHex(OTHER_GREY),
      count: otherCount,
      isOther: true,
    });
  }
  return { colors, legend, categoryColors };
}
