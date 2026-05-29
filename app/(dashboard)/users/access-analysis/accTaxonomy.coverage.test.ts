import { describe, it, expect } from "vitest";
import { getAction, resolveActionId, isAdminSourceAction } from "./accTaxonomy";
import fixture from "./__fixtures__/acc-db-actions.json";

type Row = { rawAction: string; service: string | null };
const project = fixture.project as Row[];
const admin = fixture.admin as Row[];

describe("excel <-> data coverage gate", () => {
  it("catalogs EVERY project action (no uncatalogued)", () => {
    const uncatalogued = project.filter((r) => !getAction(resolveActionId(r.rawAction)));
    expect(uncatalogued.map((r) => r.rawAction)).toEqual([]);
  });

  it("catalogs every admin action and flags it admin-source", () => {
    const bad = admin.filter((r) => {
      const id = resolveActionId(r.rawAction);
      return !getAction(id) || !isAdminSourceAction(id);
    });
    expect(bad.map((r) => r.rawAction)).toEqual([]);
  });

  it("places every issues/rfis/submittals action under Build (service cross-check)", () => {
    const violations = project
      .filter((r) => r.service === "issues" || r.service === "rfis" || r.service === "submittals")
      .map((r) => ({ a: r.rawAction, m: getAction(resolveActionId(r.rawAction))?.moduleId }))
      .filter((x) => x.m !== "build");
    expect(violations).toEqual([]);
  });
});
