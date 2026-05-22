/**
 * dimensionGroups.ts — Pure UI grouping of registry dimensions.
 *
 * No React/DOM/I/O. Decides which dims are PRIMARY (always-visible, top group) vs
 * ADVANCED (grouped by registry `family`, collapsed by default). This is the data
 * that lets the sidebar scale toward 50 dims without a flat list: a new dimension
 * surfaces by appearing in the registry and being listed here — no component edits.
 */

import {
  RUNTIME_DIMENSION_IDS,
  RUNTIME_TARGET_DIMENSION_IDS,
  getDimension,
  type DimensionFamily,
  type DimensionId,
} from "./dimensionRegistry";

/** Always-visible top group — the high-signal, UAT-tuned six. */
export const PRIMARY_DIMENSION_IDS: readonly DimensionId[] = [...RUNTIME_DIMENSION_IDS];

/** Every slider-capable dim, single-sourced from the registry (no duplicate filter). */
export const SLIDER_DIMENSION_IDS: readonly DimensionId[] = RUNTIME_TARGET_DIMENSION_IDS;

export interface AdvancedDimensionGroup {
  family: DimensionFamily;
  /** Human-readable group header. */
  label: string;
  ids: readonly DimensionId[];
}

/** Family → display label for advanced group headers. */
const FAMILY_LABELS: Record<DimensionFamily, string> = {
  structure: "Structure",
  access: "Access & permissions",
  affiliation: "Affiliation",
  behavior: "Behavior",
  tenure: "Tenure",
  risk: "Risk",
};

/** Advanced = slider-capable dims that are NOT primary, grouped by family (stable order). */
export const ADVANCED_DIMENSION_GROUPS: readonly AdvancedDimensionGroup[] = (() => {
  const primary = new Set<DimensionId>(PRIMARY_DIMENSION_IDS);
  const byFamily = new Map<DimensionFamily, DimensionId[]>();
  for (const id of SLIDER_DIMENSION_IDS) {
    if (primary.has(id)) continue;
    const d = getDimension(id);
    if (!d) continue;
    const arr = byFamily.get(d.family) ?? [];
    arr.push(id);
    byFamily.set(d.family, arr);
  }
  const out: AdvancedDimensionGroup[] = [];
  for (const [family, ids] of byFamily) {
    out.push({ family, label: FAMILY_LABELS[family], ids });
  }
  return out;
})();

export interface SliderGroupView {
  kind: "primary" | "advanced";
  /** Header shown in the sidebar. "Primary" for the top group, else the family label. */
  label: string;
  family: DimensionFamily | null;
  ids: readonly DimensionId[];
  defaultOpen: boolean;
}

/** Ordered groups for the sidebar: primary (open) first, then advanced (collapsed). */
export function getDimensionGroups(): SliderGroupView[] {
  return [
    { kind: "primary", label: "Primary", family: null, ids: PRIMARY_DIMENSION_IDS, defaultOpen: true },
    ...ADVANCED_DIMENSION_GROUPS.map((g) => ({
      kind: "advanced" as const,
      label: g.label,
      family: g.family,
      ids: g.ids,
      defaultOpen: false,
    })),
  ];
}
