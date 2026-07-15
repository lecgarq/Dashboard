import { describe, it, expect } from "vitest";
import {
  sliderDimensions,
  sliderDimensionIds,
  catalogDefaultSliders,
  catalogPreviewDimensions,
  GROUPING_DEFAULT,
} from "./catalogSliders";
import { buildDimensionCatalog } from "./dimensionCatalog";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

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
  it("catalogPreviewDimensions includes unavailable placeholders but excludes available color-only dims", () => {
    expect(catalogPreviewDimensions(catalog).map((d) => d.id)).toEqual([
      "project",
      "view-entity",
      "ghost-action",
      "folder:size",
    ]);
  });

  it("a color-only role is NOT chosen as primary; falls back to the first slider dim (project)", () => {
    // role here is surfaces:["color"] (not a slider) → primary must be an available SLIDER dim.
    const d = catalogDefaultSliders(catalog);
    expect(d.project).toBe(GROUPING_DEFAULT);
    expect(d["view-entity"]).toBe(0);
    expect("role" in d).toBe(false); // role isn't a slider dim, so it's not in the default map
  });
});

it("the full catalog preview vocabulary contains exactly 208 entries", () => {
  const features = [{ nodeId: "u::p", actionCounts: { "issue-create": 1 } }] as unknown as NodeFeatureSnapshot[];
  expect(catalogPreviewDimensions(buildDimensionCatalog(features))).toHaveLength(208);
});

describe("catalogDefaultSliders default grouping", () => {
  const sliderDim = (id: string, available = true): CatalogDimension =>
    ({ id, label: id, family: "structure", kind: "categorical", source: "t",
       confidence: "high", available, surfaces: ["slider"], extract: () => null } as CatalogDimension);

  it("defaults Role to the grouping value, everything else 0", () => {
    const cat = [sliderDim("role"), sliderDim("project"), sliderDim("user")];
    const d = catalogDefaultSliders(cat);
    expect(d.role).toBe(GROUPING_DEFAULT);
    expect(d.project).toBe(0);
    expect(d.user).toBe(0);
  });

  it("falls back to Project when Role is absent/unavailable", () => {
    const cat = [sliderDim("role", false), sliderDim("project"), sliderDim("user")];
    const d = catalogDefaultSliders(cat);
    expect(d.role ?? 0).toBe(0); // role greyed → not an available slider
    expect(d.project).toBe(GROUPING_DEFAULT);
  });

  it("leaves all 0 when neither role nor project is available", () => {
    const cat = [sliderDim("user"), sliderDim("company")];
    const d = catalogDefaultSliders(cat);
    expect(Object.values(d).every((v) => v === 0)).toBe(true);
  });

  it("seeds the primary at the given strength; 0 leaves everything loose (projector scatter)", () => {
    const cat = [sliderDim("role"), sliderDim("project"), sliderDim("user")];
    const seeded = catalogDefaultSliders(cat, 0);
    expect(Object.values(seeded).every((v) => v === 0)).toBe(true);
    const at40 = catalogDefaultSliders(cat, 40);
    expect(at40.role).toBe(40);
    expect(at40.project).toBe(0);
    expect(at40.user).toBe(0);
  });
});
