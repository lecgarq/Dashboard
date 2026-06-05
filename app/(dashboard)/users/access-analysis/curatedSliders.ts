/**
 * curatedSliders.ts — The active slider set. 3D-only restore (2026-06-05): un-pared
 * from the single "user" slider back to the full surfaced+available catalog, so every
 * meaningful dimension is a physics slider. The sidebar groups these into Structural /
 * Activity (collapsible) / Folder, which is the "meaningful + advanced" layout.
 * Pure: no React/DOM/IO.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { sliderDimensions } from "./catalogSliders";

/** Surfaced sliders that drive physics: slider-surfaced AND available (have data). */
export function curatedSliderDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  return sliderDimensions(catalog);
}
