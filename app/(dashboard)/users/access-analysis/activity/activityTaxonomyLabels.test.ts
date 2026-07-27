import { describe, expect, it } from "vitest";
import {
  NO_OBJECT_TYPE_LABEL,
  UNMAPPED_MODULE_LABEL,
  buildActivityTaxonomy,
  objectTypeLabel,
  remapModuleIds,
} from "./activityTaxonomyLabels";

// The payload's real dict shape: raw kebab verbs, Autodesk serviceGroup tags.
const VERBS = ["(none)", "assign-member", "view-entity", "issue-create", "not-a-real-verb"];
const MODULES = ["(none)", "admin", "docs", "issues"];

describe("activityTaxonomyLabels", () => {
  it("relabels raw verbs with catalog labels, keeping unmapped verbs verbatim", () => {
    const { verbLabels } = buildActivityTaxonomy(VERBS, MODULES);
    expect(verbLabels[1]).toBe("Assign Member");
    expect(verbLabels[2]).toBe("View Entity");
    // No catalog entry → the raw id stands rather than an invented label.
    expect(verbLabels[4]).toBe("not-a-real-verb");
  });

  it("module dict is slot-0 Unmapped then the donut's module list", () => {
    const { moduleLabels } = buildActivityTaxonomy(VERBS, MODULES);
    expect(moduleLabels[0]).toBe(UNMAPPED_MODULE_LABEL);
    expect(moduleLabels).toContain("Data Management");
    expect(moduleLabels).toContain("Build");
    expect(moduleLabels).toContain("Admin Actions");
    expect(moduleLabels).not.toContain("docs");
  });

  it("keeps the verb refinement a flat serviceGroup rename would lose", () => {
    // The whole point of the pair table: assign-member tagged `docs` is an Admin
    // Actions row in the taxonomy, NOT Data Management.
    const tax = buildActivityTaxonomy(VERBS, MODULES);
    const slot = (v: number, m: number) => tax.moduleSlotByPair[v * MODULES.length + m];
    expect(tax.moduleLabels[slot(1, 2)]).toBe("Admin Actions"); // assign-member @ docs
    expect(tax.moduleLabels[slot(2, 2)]).toBe("Data Management"); // view-entity @ docs
    expect(tax.moduleLabels[slot(3, 3)]).toBe("Build"); // issue-create @ issues
  });

  it("attributes by verb when the service tag is absent (the DC-sourced slice)", () => {
    const tax = buildActivityTaxonomy(VERBS, MODULES);
    const slot = (v: number, m: number) => tax.moduleSlotByPair[v * MODULES.length + m];
    expect(tax.moduleLabels[slot(1, 0)]).toBe("Admin Actions"); // assign-member @ (none)
    // Neither verb nor service resolves → honest Unmapped, never a guessed product.
    expect(slot(4, 0)).toBe(0);
  });

  it("remaps the moduleId column through the pair table", () => {
    const tax = buildActivityTaxonomy(VERBS, MODULES);
    const verbIds = Uint16Array.from([1, 2, 4, 1]);
    const moduleIds = Uint16Array.from([2, 2, 0, 0]);
    const out = remapModuleIds(verbIds, moduleIds, tax);
    expect([...out].map((s) => tax.moduleLabels[s])).toEqual([
      "Admin Actions",
      "Data Management",
      UNMAPPED_MODULE_LABEL,
      "Admin Actions",
    ]);
  });

  it("clamps out-of-range ids to slot 0 instead of reading past the table", () => {
    const tax = buildActivityTaxonomy(VERBS, MODULES);
    const out = remapModuleIds(Uint16Array.from([99, 1]), Uint16Array.from([1, 99]), tax);
    expect([...out]).toEqual([0, 0]);
  });

  it("strips the Autodesk URN namespace and spaces the entity class", () => {
    // Every real objectType value in the shipped payload dict.
    expect(
      [
        "(none)",
        "items:autodesk.bim360:File",
        "items:autodesk.bim360:Document",
        "items:autodesk.bim360:TitleBlock",
        "folders:autodesk.bim360:Folder",
        "WorkflowTransmittal",
        "approvalWorkflowReview",
        "approvalWorkflow",
        "NamingStandard",
        "Sheet",
        "comment",
        "company",
        "project",
        "user",
      ].map(objectTypeLabel),
    ).toEqual([
      NO_OBJECT_TYPE_LABEL,
      "File",
      "Document",
      "Title Block",
      "Folder",
      "Workflow Transmittal",
      "Approval Workflow Review",
      "Approval Workflow",
      "Naming Standard",
      "Sheet",
      "Comment",
      "Company",
      "Project",
      "User",
    ]);
  });

  it("keeps an unrecognized token readable instead of blanking it", () => {
    // A type Autodesk adds later must still render — no lookup table to miss it.
    expect(objectTypeLabel("items:autodesk.bim360:RFIResponse")).toBe("RFI Response");
    expect(objectTypeLabel("some_new-thing")).toBe("Some new thing");
    expect(objectTypeLabel(":")).toBe(":");
  });

  it("survives an empty dict pair without throwing", () => {
    const tax = buildActivityTaxonomy([], []);
    expect(remapModuleIds(Uint16Array.from([0]), Uint16Array.from([0]), tax)).toEqual(
      Uint16Array.from([0]),
    );
  });
});
