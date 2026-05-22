/**
 * sliderPresets.ts — Pure named layout-weight profiles (no React/DOM/I/O).
 *
 * A preset is a sparse weight map; applyPreset() expands it over a 0-baseline for
 * EVERY slider dim, so unlisted dims are explicitly off. The `organic` preset is the
 * UAT-approved P3 default (registry defaultWeight×100 for the primary six + module).
 */

import { getDimension, type DimensionId } from "./dimensionRegistry";
import { PRIMARY_DIMENSION_IDS, SLIDER_DIMENSION_IDS } from "./dimensionGroups";

export interface SliderPreset {
  id: string;
  label: string;
  /** Sparse: only the dims this preset turns on. Unlisted → 0. Values are 0..100. */
  weights: Partial<Record<DimensionId, number>>;
}

/**
 * Organic default = registry defaultWeight×100 for the PRIMARY dims + `module`.
 * Advanced dims (company, isAdmin, …) are intentionally OFF (absent → 0 via the
 * applyPreset 0-baseline), per decision 2: advanced sliders default to 0 EXCEPT
 * module. This reproduces the UAT-approved P3 default layout exactly — it does NOT
 * turn on every slider-capable dim.
 */
function registryOrganicWeights(): Record<string, number> {
  const out: Record<string, number> = {};
  const activeIds: readonly DimensionId[] = [...PRIMARY_DIMENSION_IDS, "module"];
  for (const id of activeIds) {
    const d = getDimension(id);
    if (d) out[id] = Math.round(d.defaultWeight * 100);
  }
  return out;
}

const ORGANIC = registryOrganicWeights();

export const SLIDER_PRESETS: readonly SliderPreset[] = [
  { id: "organic", label: "Organic (default)", weights: ORGANIC },
  {
    id: "structural",
    label: "Structural",
    weights: { project: 45, role: 35, tier: 25, company: 20, module: 20 },
  },
  {
    id: "behavioral",
    label: "Behavioral",
    weights: { activity: 40, signin: 35, role: 15, project: 15 },
  },
  {
    id: "flat",
    label: "Flat (equal)",
    weights: Object.fromEntries(SLIDER_DIMENSION_IDS.map((id) => [id, 20])) as Partial<
      Record<DimensionId, number>
    >,
  },
  // `free` = every slider 0 → no semantic attraction → the organic base distribution.
  // NOT a globe / disc / origin-collapse (see decision 7 + the P4.9 layout assertions).
  { id: "free", label: "Free / No semantic clustering", weights: {} },
];

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Expand a preset's sparse weights over a 0-baseline for every slider dim. */
export function applyPreset(presetId: string): Record<string, number> {
  const preset = SLIDER_PRESETS.find((p) => p.id === presetId);
  const out: Record<string, number> = {};
  for (const id of SLIDER_DIMENSION_IDS) out[id] = 0;
  if (preset) {
    for (const [id, v] of Object.entries(preset.weights)) {
      if (id in out && typeof v === "number") out[id] = clamp(v);
    }
  }
  return out;
}

/** Return the preset id whose expanded weights equal `values`, else null (= "Custom"). */
export function detectActivePreset(values: Record<string, number>): string | null {
  for (const p of SLIDER_PRESETS) {
    const expanded = applyPreset(p.id);
    const same = SLIDER_DIMENSION_IDS.every((id) => (values[id] ?? 0) === expanded[id]);
    if (same) return p.id;
  }
  return null;
}
