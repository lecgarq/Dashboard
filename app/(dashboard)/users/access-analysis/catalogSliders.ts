/**
 * catalogSliders.ts — Slider-dimension selection over the Phase C catalog (Phase E).
 * Pure: no React/DOM/IO.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

/** Slider dims that actually drive physics: slider-surfaced AND available (have data). */
export function sliderDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  return catalog.filter((d) => d.surfaces.includes("slider") && d.available);
}

/** All slider-surfaced ids incl. greyed (no-data) — the UI lists these as disabled rows. */
export function sliderDimensionIds(catalog: readonly CatalogDimension[]): string[] {
  return catalog.filter((d) => d.surfaces.includes("slider")).map((d) => d.id);
}

/** Default state per spec decision #3: every (available) slider at 0. */
export function catalogDefaultSliders(catalog: readonly CatalogDimension[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of sliderDimensions(catalog)) out[d.id] = 0;
  return out;
}
