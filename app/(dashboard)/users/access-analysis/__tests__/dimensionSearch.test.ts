import { describe, it, expect } from "vitest";
import { matchDimension, filterDimensionIds } from "../dimensionSearch";
import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";

describe("dimensionSearch", () => {
  it("matchDimension matches on label, id, and family, case-insensitively", () => {
    expect(matchDimension("project", "proj")).toBe(true);   // id/label
    expect(matchDimension("internalExternal", "EXTERN")).toBe(true); // label "Internal / external"
    expect(matchDimension("company", "affil")).toBe(true);  // family "affiliation"
    expect(matchDimension("role", "signin")).toBe(false);
  });

  it("an empty/whitespace query matches everything (no filtering)", () => {
    expect(filterDimensionIds(SLIDER_DIMENSION_IDS, "")).toEqual([...SLIDER_DIMENSION_IDS]);
    expect(filterDimensionIds(SLIDER_DIMENSION_IDS, "   ")).toEqual([...SLIDER_DIMENSION_IDS]);
  });

  it("filterDimensionIds preserves input order and returns only matches", () => {
    const out = filterDimensionIds(SLIDER_DIMENSION_IDS, "a"); // matches several
    expect(out).toEqual(out.filter((id) => SLIDER_DIMENSION_IDS.includes(id)));
    expect(filterDimensionIds(SLIDER_DIMENSION_IDS, "zzzznomatch")).toEqual([]);
  });
});
