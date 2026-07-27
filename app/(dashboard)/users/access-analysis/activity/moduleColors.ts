/**
 * moduleColors.ts — v2.7 Phase 39 (ACT-01, owner decision 3).
 *
 * First-paint color-by for the activity universe: module.
 * Pure — no React/DOM/IO. Colors reuse the established /access-analysis
 * module color language (ModulesPieChart MODULE_COLORS hues), fixed hex that
 * reads on both themes, with zinc-500 as the honest Unmapped bucket.
 *
 * Keyed by the ACC PRODUCT LABEL, not Autodesk's raw serviceGroup tag: the
 * payload's module dict is rewritten through the shared taxonomy on load
 * (activityTaxonomyLabels.ts), so a module reads and colors identically here
 * and in the /access-analysis donut. The hexes are duplicated from
 * ModulesPieChart.MODULE_COLORS deliberately — importing that client chart
 * module for a 10-entry color map would drag ECharts into this bundle.
 */

/** Module display label → hex. Labels come from the payload meta module dict. */
export const ACTIVITY_MODULE_COLORS: Record<string, string> = {
  Unmapped: "#71717a", // zinc-500 — data-quality bucket, matches UNMAPPED_COLOR
  "Data Management": "#4e8ccb", // azul
  Build: "#e2683a", // naranja
  "Design Collaboration": "#849c4c", // palm
  Preconstruction: "#b4679c", // wine
  "Model Coordination": "#3a9dbf", // state-blue sky
  "Admin Actions": "#e0577b", // wine-rose — permission/membership/admin activity
  Datum: "#e05b55", // warm red
  Insight: "#efb628", // goldenrod
  Design: "#0e98a8", // seaweed
  AutoSpecs: "#c992b8", // wine (light tier)
};

const FALLBACK = "#888888";

export function moduleColorHex(label: string): string {
  return ACTIVITY_MODULE_COLORS[label] ?? FALLBACK;
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/**
 * Full-set RGBA buffer (n*4, values 0–1) from the moduleId column + dict labels.
 * Palette is resolved once per distinct id — the 4.9M loop is a table lookup.
 */
export function buildModuleColorBuffer(
  moduleId: Uint16Array,
  moduleLabels: readonly string[],
): Float32Array {
  const palette = new Float32Array(moduleLabels.length * 4);
  for (let m = 0; m < moduleLabels.length; m++) {
    const [r, g, b] = hexToRgb01(moduleColorHex(moduleLabels[m]));
    palette[m * 4] = r;
    palette[m * 4 + 1] = g;
    palette[m * 4 + 2] = b;
    palette[m * 4 + 3] = 1;
  }
  const out = new Float32Array(moduleId.length * 4);
  for (let i = 0; i < moduleId.length; i++) {
    const p = (moduleId[i] < moduleLabels.length ? moduleId[i] : 0) * 4;
    out[i * 4] = palette[p];
    out[i * 4 + 1] = palette[p + 1];
    out[i * 4 + 2] = palette[p + 2];
    out[i * 4 + 3] = 1;
  }
  return out;
}

export interface ModuleLegendEntry {
  label: string;
  colorHex: string;
  count: number;
}

/** Legend rows (one per module present), sorted by count desc. Honest counts over the FULL resident set. */
export function buildModuleLegend(
  moduleId: Uint16Array,
  moduleLabels: readonly string[],
): ModuleLegendEntry[] {
  const counts = new Array<number>(moduleLabels.length).fill(0);
  for (let i = 0; i < moduleId.length; i++) {
    const m = moduleId[i] < moduleLabels.length ? moduleId[i] : 0;
    counts[m] += 1;
  }
  return moduleLabels
    .map((label, m) => ({ label, colorHex: moduleColorHex(label), count: counts[m] }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count);
}
