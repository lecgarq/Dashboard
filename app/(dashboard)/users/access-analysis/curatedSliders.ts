/**
 * curatedSliders.ts — The active slider set. The full catalog stays defined; this
 * narrows what the sidebar surfaces AND what drives the layout, so non-curated dims
 * are "safe" (re-enable by editing CURATED_SLIDER_IDS). Pure: no React/DOM/IO.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { sliderDimensions } from "./catalogSliders";

/** The only sliders the graph currently uses. Order is irrelevant (layout sorts by value).
 *  Pared to a single "user" slider (2026-06-02) to nail the user-name blob behavior first;
 *  "project" and "role" return next, but as an ORGANIC multi-attribute layout — NOT the rigid
 *  cross-tab grid (Luis: "the form always needs to be organic, not like a fixed grid"). */
export const CURATED_SLIDER_IDS = ["user"] as const;

const SET = new Set<string>(CURATED_SLIDER_IDS);

/** Curated ∩ (slider-surfaced AND available). Use everywhere the old code used sliderDimensions. */
export function curatedSliderDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  return sliderDimensions(catalog).filter((d) => SET.has(d.id));
}
