import { describe, expect, it } from "vitest";
import {
  classifyActivity,
  donutModules,
  GROUP_ORDER,
  OTHER_GROUP,
  UNMAPPED_MODULE,
} from "./activityClassification";

/**
 * Pin test for the classifier (BND-02 move + 2026-07-06 owner-directed
 * drill-down regroup: generic action categories replaced by per-module ACC
 * tool groups, Model Coordination restored to the donut).
 * Keep this LIGHT — one representative rawAction per branch.
 */
describe("activityClassification (BND-02 pin test)", () => {
  describe("classifyActivity", () => {
    it("maps a coordination issue rawAction (issue-attach) to Build's Issues group", () => {
      const result = classifyActivity("issue-attach");
      expect(result).toEqual({
        moduleId: "build",
        label: "Issue Attach",
        group: "Issues",
        attributedBy: "verb",
      });
    });

    it("maps an EXTRA_ACTIONS rawAction (create-project) to adminActions / Projects & settings", () => {
      const result = classifyActivity("create-project");
      expect(result).toEqual({
        moduleId: "adminActions",
        label: "Create Project",
        group: "Projects & settings",
        attributedBy: "verb",
      });
    });

    it("maps an EXTRA_ACTIONS rawAction (add-member) to adminActions / Members & access", () => {
      const result = classifyActivity("add-member");
      expect(result).toEqual({
        moduleId: "adminActions",
        label: "Add Member",
        group: "Members & access",
        attributedBy: "verb",
      });
    });

    it("maps an unknown rawAction to UNMAPPED_MODULE with the Other group", () => {
      const result = classifyActivity("totally-unknown-action-xyz-999");
      expect(result).toEqual({
        moduleId: UNMAPPED_MODULE,
        label: "totally-unknown-action-xyz-999",
        group: OTHER_GROUP,
        attributedBy: "verb",
      });
    });

    it("routes catalog modelCoordination actions (create-collection) to Model Coordination / Views", () => {
      // 2026-07-06 owner-directed regroup restored Model Coordination to the donut;
      // the earlier redirect of its catalog actions to dataManagement is removed.
      const result = classifyActivity("create-collection");
      expect(result.moduleId).toBe("modelCoordination");
      expect(result.group).toBe("Views");
    });
  });

  describe("donutModules", () => {
    it("contains adminActions immediately after preconstruction", () => {
      const modules = donutModules();
      const preconstructionIdx = modules.findIndex((m) => m.id === "preconstruction");
      expect(preconstructionIdx).toBeGreaterThan(-1);
      expect(modules[preconstructionIdx + 1]).toMatchObject({ id: "adminActions" });
    });

    it("contains modelCoordination (restored 2026-07-06 owner-directed)", () => {
      const modules = donutModules();
      expect(modules.some((m) => m.id === "modelCoordination")).toBe(true);
    });

    it("contains adminActions", () => {
      const modules = donutModules();
      expect(modules.some((m) => m.id === "adminActions")).toBe(true);
    });
  });

  describe("GROUP_ORDER (ACC tool groups, owner-directed 2026-07-06)", () => {
    it("lists each product's tool tabs and ends with Other", () => {
      // Data Management (Docs)
      expect(GROUP_ORDER).toEqual(expect.arrayContaining(["Files", "Specifications", "Reviews", "Transmittals", "Boards"]));
      // Build
      expect(GROUP_ORDER).toEqual(expect.arrayContaining(["Sheets", "Issues", "Forms", "Photos", "RFIs", "Submittals", "Schedule"]));
      // Design Collaboration
      expect(GROUP_ORDER).toEqual(expect.arrayContaining(["Changes", "Create packages", "Consume packages"]));
      // Model Coordination
      expect(GROUP_ORDER).toEqual(expect.arrayContaining(["Views", "Clashes"]));
      expect(GROUP_ORDER[GROUP_ORDER.length - 1]).toBe(OTHER_GROUP);
    });

    it("has no duplicate groups (one global order is safe for per-module sorting)", () => {
      expect(new Set(GROUP_ORDER).size).toBe(GROUP_ORDER.length);
    });
  });

  describe("UNMAPPED_MODULE", () => {
    it("equals the string 'unmapped'", () => {
      expect(UNMAPPED_MODULE).toBe("unmapped");
    });
  });

  describe("per-module tool groups", () => {
    it("Data Management: file verbs -> Files, review verbs -> Reviews, transmittals -> Transmittals", () => {
      expect(classifyActivity("view-entity").group).toBe("Files");
      expect(classifyActivity("upload-entity").group).toBe("Files");
      expect(classifyActivity("submit-review").group).toBe("Reviews");
      expect(classifyActivity("set-approval-status").group).toBe("Reviews");
      expect(classifyActivity("notify-final-members").group).toBe("Reviews"); // review step whose id lacks "review"
      expect(classifyActivity("create-transmittal").group).toBe("Transmittals");
      expect(classifyActivity("view-transmittal").group).toBe("Transmittals");
    });

    it("Build: sheets cluster -> Sheets, rfi/response -> RFIs, submittals -> Submittals", () => {
      expect(classifyActivity("view-sheet").group).toBe("Sheets");
      expect(classifyActivity("create-version-set").group).toBe("Sheets");
      expect(classifyActivity("add-version-to-set").group).toBe("Sheets");
      expect(classifyActivity("rfi-view", "rfis").group).toBe("RFIs");
      expect(classifyActivity("submittals-item-create", "submittals").group).toBe("Submittals");
    });

    it("Design Collaboration: publish-entity -> Changes, send/receive -> Create/Consume packages", () => {
      expect(classifyActivity("publish-entity").group).toBe("Changes");
      expect(classifyActivity("send-entity-to-project").group).toBe("Create packages");
      expect(classifyActivity("receive-entity-from-project-with-automation").group).toBe("Consume packages");
    });

    it("Datum: naming-standard family -> Naming standards, attribute verbs -> Custom attributes", () => {
      expect(classifyActivity("apply-naming-standard").group).toBe("Naming standards");
      expect(classifyActivity("add-folder-naming-standard").group).toBe("Naming standards");
      expect(classifyActivity("create-custom-attribute").group).toBe("Custom attributes");
    });
  });

  describe("service-first attribution", () => {
    it("omitted service -> identical result to the verb path, attributedBy: verb", () => {
      const result = classifyActivity("view-entity");
      expect(result).toEqual({
        moduleId: "dataManagement",
        label: "View Entity",
        group: "Files",
        attributedBy: "verb",
      });
    });

    it("undefined/null/empty/unrecognized service -> same as omitted, attributedBy: verb", () => {
      const base = classifyActivity("view-entity");
      expect(classifyActivity("view-entity", undefined)).toEqual(base);
      expect(classifyActivity("view-entity", null)).toEqual(base);
      expect(classifyActivity("view-entity", "")).toEqual(base);
      expect(classifyActivity("view-entity", "not-a-real-service")).toEqual(base);
    });

    it("decisive override: submittals service overrides a non-build verb result -> build, regrouped there", () => {
      const result = classifyActivity("view-entity", "submittals");
      expect(result.moduleId).toBe("build");
      expect(result.attributedBy).toBe("service");
      // Label kept from the verb result; group re-resolved against the FINAL module
      // (view-entity matches no Build tool tab -> Other).
      expect(result.label).toBe("View Entity");
      expect(result.group).toBe(OTHER_GROUP);
    });

    it("decisive override: admin service overrides a non-adminActions verb result -> adminActions", () => {
      const result = classifyActivity("view-entity", "admin");
      expect(result.moduleId).toBe("adminActions");
      expect(result.attributedBy).toBe("service");
    });

    it("umbrella deference: a permission verb (-> adminActions) + docs service stays adminActions, not dataManagement", () => {
      const result = classifyActivity("assign-permission", "docs");
      expect(result.moduleId).toBe("adminActions");
      expect(result.group).toBe("Members & access");
      expect(result.attributedBy).toBe("service");
    });

    it("unmapped rescue: a nonsense rawAction + docs service -> dataManagement, grouped by the destination's rules", () => {
      const result = classifyActivity("totally-unknown-action-xyz-999", "docs");
      expect(result).toEqual({
        moduleId: "dataManagement",
        label: "totally-unknown-action-xyz-999",
        group: "Files", // dataManagement's fallback tool group
        attributedBy: "service",
      });
    });

    it("unmapped, no service -> stays unmapped", () => {
      const result = classifyActivity("totally-unknown-action-xyz-999");
      expect(result.moduleId).toBe(UNMAPPED_MODULE);
      expect(result.attributedBy).toBe("verb");
    });

    it("case/whitespace normalization: ' Docs ' behaves as 'docs'", () => {
      const withSpacing = classifyActivity("totally-unknown-action-xyz-999", " Docs ");
      const canonical = classifyActivity("totally-unknown-action-xyz-999", "docs");
      expect(withSpacing).toEqual(canonical);
    });
  });

  /**
   * Owner-delegated mapping review (21.1-04 checkpoint, 2026-07-06): 4 taxonomy
   * corrections applied after the owner audited all live (rawAction, service)
   * combos, plus a 5th OWNER-DIRECTED correction from the final-look verdict
   * ("approved BUT move sheets and friends to the Build module"): the whole
   * Sheets cluster (sheet verbs + version-set family + the sheets service
   * rescue target) routes to Build. See activityClassification.ts's
   * EXTRA_ACTIONS / MODULE_OVERRIDES / SERVICE_TO_MODULE comments.
   */
  describe("owner-delegated mapping review (21.1-04 checkpoint)", () => {
    it("sheets rescue: an unmapped sheets-service action lands in build (owner-directed) under Sheets", () => {
      const result = classifyActivity("view-sheet-public-link", "sheets");
      expect(result.moduleId).toBe("build");
      expect(result.group).toBe("Sheets");
      expect(result.attributedBy).toBe("service");
    });

    it("sheets rescue: create-public-link-for-sheets + sheets service -> build", () => {
      const result = classifyActivity("create-public-link-for-sheets", "sheets");
      expect(result.moduleId).toBe("build");
      expect(result.group).toBe("Sheets");
    });

    it("sheet verb cluster routes to build (owner-directed: Sheets is an ACC Build tool)", () => {
      expect(classifyActivity("view-sheet").moduleId).toBe("build");
      expect(classifyActivity("publish-sheet").moduleId).toBe("build");
      expect(classifyActivity("export-sheet").moduleId).toBe("build");
      expect(classifyActivity("delete-sheet").moduleId).toBe("build");
      expect(classifyActivity("print-sheet").moduleId).toBe("build");
      expect(classifyActivity("shared-with-recipients-for-sheets").moduleId).toBe("build");
    });

    it("version-set family follows the Sheets tool to build; publish-entity STAYS designCollaboration", () => {
      expect(classifyActivity("create-version-set").moduleId).toBe("build");
      expect(classifyActivity("add-version-to-set").moduleId).toBe("build");
      expect(classifyActivity("rename-version-set").moduleId).toBe("build");
      expect(classifyActivity("update-version-set").moduleId).toBe("build");
      // publish-entity is the docs-tagged Revit model publish (Design Collaboration
      // workflow), NOT a Sheets action — pinned so the sheets-cluster move never drags it.
      expect(classifyActivity("publish-entity").moduleId).toBe("designCollaboration");
      expect(classifyActivity("send-entity-to-project").moduleId).toBe("designCollaboration");
    });

    it("restore-version and create-set are NOT moved (Docs file-versioning/Sets features stay dataManagement)", () => {
      expect(classifyActivity("restore-version").moduleId).toBe("dataManagement");
      expect(classifyActivity("create-set").moduleId).toBe("dataManagement");
    });

    it("notify-final-members moves from adminActions to dataManagement, alongside its review-workflow siblings", () => {
      const result = classifyActivity("notify-final-members");
      expect(result.moduleId).toBe("dataManagement");
      expect(classifyActivity("notify-reviewers").moduleId).toBe("dataManagement");
      expect(classifyActivity("submit-review").moduleId).toBe("dataManagement");
      expect(classifyActivity("claim-review-task").moduleId).toBe("dataManagement");
    });

    it("add-folder-naming-standard is mapped to datum, unified with its naming-standard siblings", () => {
      const result = classifyActivity("add-folder-naming-standard");
      expect(result).toEqual({
        moduleId: "datum",
        label: "Add Folder Naming Standard",
        group: "Naming standards",
        attributedBy: "verb",
      });
      expect(classifyActivity("apply-naming-standard").moduleId).toBe("datum");
      expect(classifyActivity("add-attribute-to-naming-standard").moduleId).toBe("datum");
    });
  });
});
