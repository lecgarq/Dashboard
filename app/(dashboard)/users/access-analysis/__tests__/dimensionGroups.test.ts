import { describe, it, expect } from "vitest";
import {
  PRIMARY_DIMENSION_IDS,
  SLIDER_DIMENSION_IDS,
  ADVANCED_DIMENSION_GROUPS,
  getDimensionGroups,
} from "../dimensionGroups";
import { RUNTIME_DIMENSION_IDS, getDimension } from "../dimensionRegistry";

describe("dimensionGroups", () => {
  it("PRIMARY_DIMENSION_IDS equals the registry's primary runtime ids", () => {
    expect(PRIMARY_DIMENSION_IDS).toEqual([...RUNTIME_DIMENSION_IDS]);
  });

  it("SLIDER_DIMENSION_IDS = primary + every advanced slider dim, no dupes", () => {
    const set = new Set(SLIDER_DIMENSION_IDS);
    expect(set.size).toBe(SLIDER_DIMENSION_IDS.length); // no dupes
    for (const id of PRIMARY_DIMENSION_IDS) expect(set.has(id)).toBe(true);
    expect(set.has("module")).toBe(true); // promoted (decision 4)
    expect(set.has("company")).toBe(true);
    expect(set.has("isAdmin")).toBe(true);
  });

  it("advanced groups are keyed by family and contain only slider-capable, non-primary dims", () => {
    const primary = new Set(PRIMARY_DIMENSION_IDS);
    for (const group of ADVANCED_DIMENSION_GROUPS) {
      expect(group.ids.length).toBeGreaterThan(0);
      for (const id of group.ids) {
        expect(primary.has(id)).toBe(false); // never duplicate a primary dim
        expect(getDimension(id)).toBeDefined();
        expect(getDimension(id)!.family).toBe(group.family); // grouped by family
      }
    }
  });

  it("getDimensionGroups returns primary first, then advanced, covering exactly SLIDER_DIMENSION_IDS", () => {
    const groups = getDimensionGroups();
    expect(groups[0].kind).toBe("primary");
    expect(groups.slice(1).every((g) => g.kind === "advanced")).toBe(true);
    const flat = groups.flatMap((g) => g.ids);
    expect([...flat].sort()).toEqual([...SLIDER_DIMENSION_IDS].sort());
  });

  it("advanced groups are collapsed by default; primary is always open", () => {
    const groups = getDimensionGroups();
    expect(groups[0].defaultOpen).toBe(true);
    expect(groups.slice(1).every((g) => g.defaultOpen === false)).toBe(true);
  });
});
