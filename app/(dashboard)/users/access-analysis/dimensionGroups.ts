/**
 * dimensionGroups.ts — Pure UI grouping of registry dimensions.
 *
 * No React/DOM/I/O. Decides which dims are PRIMARY (always-visible, top group) vs
 * ADVANCED (grouped by registry `family`, collapsed by default). This is the data
 * that lets the sidebar scale toward 50 dims without a flat list: a new dimension
 * surfaces by appearing in the registry and being listed here — no component edits.
 */

import {
  DIMENSION_REGISTRY,
  RUNTIME_DIMENSION_IDS,
  type DimensionFamily,
  type DimensionId,
  type DimensionType,
} from "./dimensionRegistry";

/** Always-visible top group — the high-signal, UAT-tuned six. */
export const PRIMARY_DIMENSION_IDS: readonly DimensionId[] = [...RUNTIME_DIMENSION_IDS];

/**
 * Dimension types that get a SLIDER (a layout-weight control). Scalar/temporal/
 * multi-hot/categorical/binary all map to a 0..100 weight today (transformer=1);
 * `derived` dims are excluded until their compute lands (see out-of-scope).
 */
const SLIDER_CAPABLE_TYPES = new Set<DimensionType>(["categorical", "binary", "scalar", "temporal", "multi-hot"]);

/** Every dim that should get a slider, in registry order. */
export const SLIDER_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter((d) =>
  SLIDER_CAPABLE_TYPES.has(d.type),
).map((d) => d.id);

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
  for (const d of DIMENSION_REGISTRY) {
    if (!SLIDER_CAPABLE_TYPES.has(d.type)) continue;
    if (primary.has(d.id)) continue;
    const arr = byFamily.get(d.family) ?? [];
    arr.push(d.id);
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
