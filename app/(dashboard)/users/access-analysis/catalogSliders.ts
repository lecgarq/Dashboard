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

/** Grouping strength applied to the default clustering dimension on first load. */
export const GROUPING_DEFAULT = 60;

/**
 * Default slider state. The primary grouping dimension is seeded to `primaryStrength`
 * (default `GROUPING_DEFAULT`) for settle-on-load organised clusters; every other
 * slider is 0. Callers pass `0` to load loose/scatter (as the projector does after
 * the Role-default wiring). Prefers Role; falls back to Project; else all 0.
 */
export function catalogDefaultSliders(
  catalog: readonly CatalogDimension[],
  primaryStrength: number = GROUPING_DEFAULT,
): Record<string, number> {
  const dims = sliderDimensions(catalog);                  // available sliders only
  const out: Record<string, number> = {};
  for (const d of dims) out[d.id] = 0;
  const has = (id: string): boolean => dims.some((d) => d.id === id);
  const primary = has("role") ? "role" : has("project") ? "project" : null;
  if (primary) out[primary] = primaryStrength;
  return out;
}
