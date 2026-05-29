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
    // The DB `service` tag corroborates the excel's module placement, but the excel
    // (canonical) deliberately overrides it for a few generic actions: `comment-create`
    // is tagged service=rfis (it's an RFI comment) yet the excel files it under
    // Data Management > Workflow Change (a generic comment workflow). Excel wins.
    const SERVICE_MODULE_EXCEPTIONS = new Set(["comment-create"]);
    const violations = project
      .filter((r) => r.service === "issues" || r.service === "rfis" || r.service === "submittals")
      .filter((r) => !SERVICE_MODULE_EXCEPTIONS.has(resolveActionId(r.rawAction)))
      .map((r) => ({ a: r.rawAction, m: getAction(resolveActionId(r.rawAction))?.moduleId }))
      .filter((x) => x.m !== "build");
    expect(violations).toEqual([]);
  });
});
