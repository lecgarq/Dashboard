/**
 * Canonical categorical palette for charts.
 *
 * Single source of truth: the eight CVD-validated brand families declared in
 * DESIGN.md §2 (and mirrored as --chart-1..8 in app/globals.css). Slots 9-24
 * are derived lightness steps of those same families, so a 20-category chart
 * never introduces a hue that isn't LECG brand.
 *
 * Derivation shifts AWAY from the surface in each theme — darker on light,
 * lighter on dark. The previous hand-maintained 24-color array lightened in
 * both themes, so its tail (slots 17-24) washed out against white.
 *
 * Series identity is positional: slot N is the same family in light and dark,
 * so a chart keeps its meaning across a theme switch.
 */

/** Brand families on a light surface (#FFFFFF). DESIGN.md §2 :root. */
const BRAND_LIGHT = [
  "#2E5F95", "#E65A28", "#0089A3", "#B0810A",
  "#7E3567", "#68803A", "#1B80B3", "#C42021",
] as const;

/** Brand families on a dark surface (#18181B). DESIGN.md §2 .dark. */
const BRAND_DARK = [
  "#4E8CCB", "#E2683A", "#0E98A8", "#BA8A0E",
  "#B4679C", "#849C4C", "#3A9DBF", "#E05B55",
] as const;

/** How far slots 9-16 and 17-24 shift from their base family. */
const STEPS = [0.28, 0.52] as const;

function mix(hex: string, toward: readonly [number, number, number], t: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = rgb.map((c, i) => Math.round(c + (toward[i] - c) * t));
  return `#${out.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function ramp(brand: readonly string[], toward: readonly [number, number, number]): string[] {
  return [
    ...brand.map((c) => c.toLowerCase()),
    ...STEPS.flatMap((t) => brand.map((c) => mix(c, toward, t))),
  ];
}

const WHITE = [255, 255, 255] as const;
const INK = [12, 12, 16] as const;

/** 24 slots: 8 brand families + two derived lightness steps of each. */
export const CHART_PALETTE_LIGHT: readonly string[] = ramp(BRAND_LIGHT, INK);
export const CHART_PALETTE_DARK: readonly string[] = ramp(BRAND_DARK, WHITE);

export function chartPalette(dark: boolean): readonly string[] {
  return dark ? CHART_PALETTE_DARK : CHART_PALETTE_LIGHT;
}

/**
 * Color for series index `i`. Cycles past 24 — callers rendering more than 24
 * categories should collapse the tail into an "Other" slice instead of relying
 * on the wrap, because recycled colors read as duplicate categories.
 */
export function chartColorAt(i: number, dark: boolean): string {
  const p = chartPalette(dark);
  return p[i % p.length];
}
