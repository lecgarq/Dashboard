import { describe, it, expect } from "vitest";
import { sliderDimensions, sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";

const dim = (over: Partial<CatalogDimension>): CatalogDimension => ({
  id: "x", label: "X", family: "structure", kind: "categorical", source: "t",
  confidence: "high", available: true, surfaces: ["slider"], extract: () => null, ...over,
});

describe("catalogSliders", () => {
  const catalog = [
    dim({ id: "project", surfaces: ["slider", "color"], available: true }),
    dim({ id: "view-entity", family: "activity", kind: "ordinal", surfaces: ["slider", "color"], available: true }),
    dim({ id: "ghost-action", family: "activity", kind: "ordinal", surfaces: ["slider", "color"], available: false }),
    dim({ id: "folder:size", family: "folder", surfaces: [], available: false }),
    dim({ id: "role", surfaces: ["color"], available: true }),
  ];

  it("sliderDimensions = slider-surfaced AND available (drives physics)", () => {
    expect(sliderDimensions(catalog).map((d) => d.id)).toEqual(["project", "view-entity"]);
  });
  it("sliderDimensionIds covers ALL slider-surfaced dims incl. greyed (for the UI list)", () => {
    expect(sliderDimensionIds(catalog)).toEqual(["project", "view-entity", "ghost-action"]);
  });
  it("catalogDefaultSliders = every available slider dim at 0", () => {
    expect(catalogDefaultSliders(catalog)).toEqual({ "project": 0, "view-entity": 0 });
  });
});
