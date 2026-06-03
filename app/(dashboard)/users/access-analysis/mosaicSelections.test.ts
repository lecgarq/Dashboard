import { describe, expect, it } from "vitest";
import { isAnalyticsSelectionEmpty, mergeGraphAnalyticsSelections, nodeMatchesAnalyticsSelection, selectionFromFacet } from "./mosaicSelections";

describe("mosaicSelections", () => {
  it("maps chart facets into graph analytics selections", () => {
    expect(selectionFromFacet("project_id", ["p1", "p2"])).toEqual({ projectIds: ["p1", "p2"] });
    expect(selectionFromFacet("role_id", ["Architect"])).toEqual({ roleIds: ["Architect"] });
    expect(selectionFromFacet("dimension", ["roles"])).toEqual({ similarityDims: ["roles"] });
  });

  it("merges selections without duplicates", () => {
    expect(
      mergeGraphAnalyticsSelections(
        { userIds: ["a@example.com"], roleIds: ["Architect"] },
        { userIds: ["a@example.com", "b@example.com"], projectIds: ["p1"] },
      ),
    ).toEqual({ userIds: ["a@example.com", "b@example.com"], projectIds: ["p1"], roleIds: ["Architect"] });
  });

  it("matches graph nodes without mutating the input selection", () => {
    const selection = { userIds: ["alpha@example.com"], projectIds: ["p1"], roleIds: ["Architect"] };
    const before = JSON.stringify(selection);

    expect(
      nodeMatchesAnalyticsSelection(
        { id: "alpha@example.com::p1", userId: "alpha@example.com", email: "alpha@example.com", projectId: "p1", roles: ["Architect"] },
        selection,
      ),
    ).toBe(true);
    expect(
      nodeMatchesAnalyticsSelection(
        { id: "beta@example.com::p1", userId: "beta@example.com", email: "beta@example.com", projectId: "p1", roles: ["Architect"] },
        selection,
      ),
    ).toBe(false);
    expect(JSON.stringify(selection)).toBe(before);
  });

  it("treats empty selections as inactive", () => {
    expect(isAnalyticsSelectionEmpty(null)).toBe(true);
    expect(isAnalyticsSelectionEmpty({ userIds: [] })).toBe(true);
    expect(isAnalyticsSelectionEmpty({ userIds: ["a@example.com"] })).toBe(false);
  });
});
