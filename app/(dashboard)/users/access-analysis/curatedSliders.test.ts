import { describe, it, expect } from "vitest";
import { buildDimensionCatalog } from "./dimensionCatalog";
import { CURATED_SLIDER_IDS, curatedSliderDimensions } from "./curatedSliders";

describe("curatedSliders", () => {
  it("curated set is exactly project, role, user", () => {
    expect([...CURATED_SLIDER_IDS]).toEqual(["project", "role", "user"]);
  });

  it("returns only the curated, available, slider-surfaced dims", () => {
    const catalog = buildDimensionCatalog([]);
    const dims = curatedSliderDimensions(catalog);
    expect(dims.map((d) => d.id).sort()).toEqual(["project", "role", "user"]);
  });

  it("every returned dim is slider-surfaced and available", () => {
    const dims = curatedSliderDimensions(buildDimensionCatalog([]));
    for (const d of dims) {
      expect(d.surfaces).toContain("slider");
      expect(d.available).toBe(true);
    }
  });
});
