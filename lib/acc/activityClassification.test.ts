import { describe, expect, it } from "vitest";
import {
  classifyActivity,
  donutModules,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  UNMAPPED_MODULE,
} from "./activityClassification";

/**
 * Pin test for the moved classifier (BND-02).
 * Asserts that classifyActivity, donutModules, CATEGORY_LABELS, and
 * CATEGORY_ORDER produce byte-identical output after the verbatim move from
 * app/(dashboard)/access-analysis/moduleOverrides.ts.
 * Keep this LIGHT — one representative rawAction per branch.
 */
describe("activityClassification (BND-02 pin test)", () => {
  describe("classifyActivity", () => {
    it("maps a coordination issue rawAction (issue-attach) to Build with workflowChange category", () => {
      const result = classifyActivity("issue-attach");
      expect(result).toEqual({
        moduleId: "build",
        label: "Issue Attach",
        category: "Workflow",
        attributedBy: "verb",
      });
    });

    it("maps an EXTRA_ACTIONS rawAction (create-project) to adminActions", () => {
      const result = classifyActivity("create-project");
      expect(result).toEqual({
        moduleId: "adminActions",
        label: "Create Project",
        category: "Workflow",
        attributedBy: "verb",
      });
    });

    it("maps an EXTRA_ACTIONS rawAction (add-member) to adminActions with accessChange category", () => {
      const result = classifyActivity("add-member");
      expect(result).toEqual({
        moduleId: "adminActions",
        label: "Add Member",
        category: "Access & permissions",
        attributedBy: "verb",
      });
    });

    it("maps an unknown rawAction to UNMAPPED_MODULE with unknown category", () => {
      const result = classifyActivity("totally-unknown-action-xyz-999");
      expect(result).toEqual({
        moduleId: UNMAPPED_MODULE,
        label: "totally-unknown-action-xyz-999",
        category: CATEGORY_LABELS.unknown,
        attributedBy: "verb",
      });
    });

    it("never returns moduleId modelCoordination (redirected to dataManagement)", () => {
      // Run a broad sweep of known rawActions and assert none produce modelCoordination
      const testActions = [
        "issue-attach",
        "create-project",
        "add-member",
        "add-version-to-set",
        "create-set",
        "calibrate-entity",
        "setting-update",
        "totally-unknown-action-xyz-999",
      ];
      for (const action of testActions) {
        const result = classifyActivity(action);
        expect(result.moduleId).not.toBe("modelCoordination");
      }
    });
  });

  describe("donutModules", () => {
    it("contains adminActions immediately after preconstruction", () => {
      const modules = donutModules();
      const preconstructionIdx = modules.findIndex((m) => m.id === "preconstruction");
      expect(preconstructionIdx).toBeGreaterThan(-1);
      expect(modules[preconstructionIdx + 1]).toMatchObject({ id: "adminActions" });
    });

    it("never contains modelCoordination", () => {
      const modules = donutModules();
      expect(modules.some((m) => m.id === "modelCoordination")).toBe(false);
    });

    it("contains adminActions", () => {
      const modules = donutModules();
      expect(modules.some((m) => m.id === "adminActions")).toBe(true);
    });
  });

  describe("CATEGORY_LABELS", () => {
    it("has all expected category keys with correct labels", () => {
      expect(CATEGORY_LABELS).toEqual({
        contentChange: "Content changes",
        workflowChange: "Workflow",
        accessChange: "Access & permissions",
        read: "Viewing & exports",
        delete: "Deletions",
        unknown: "Other",
      });
    });
  });

  describe("CATEGORY_ORDER", () => {
    it("has 6 entries in the correct display order", () => {
      expect(CATEGORY_ORDER).toEqual([
        "Content changes",
        "Workflow",
        "Access & permissions",
        "Viewing & exports",
        "Deletions",
        "Other",
      ]);
    });
  });

  describe("UNMAPPED_MODULE", () => {
    it("equals the string 'unmapped'", () => {
      expect(UNMAPPED_MODULE).toBe("unmapped");
    });
  });

  describe("service-first attribution", () => {
    it("omitted service -> identical result to today's verb path, attributedBy: verb", () => {
      const result = classifyActivity("view-entity");
      expect(result).toEqual({
        moduleId: "dataManagement",
        label: "View Entity",
        category: "Viewing & exports",
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

    it("decisive override: submittals service overrides a non-build verb result -> build", () => {
      const result = classifyActivity("view-entity", "submittals");
      expect(result.moduleId).toBe("build");
      expect(result.attributedBy).toBe("service");
      // label/category kept from the verb result per precedence rule 4.
      expect(result.label).toBe("View Entity");
      expect(result.category).toBe("Viewing & exports");
    });

    it("decisive override: admin service overrides a non-adminActions verb result -> adminActions", () => {
      const result = classifyActivity("view-entity", "admin");
      expect(result.moduleId).toBe("adminActions");
      expect(result.attributedBy).toBe("service");
    });

    it("umbrella deference: a permission verb (-> adminActions) + docs service stays adminActions, not dataManagement", () => {
      const result = classifyActivity("assign-permission", "docs");
      expect(result.moduleId).toBe("adminActions");
      expect(result.attributedBy).toBe("service");
    });

    it("unmapped rescue: a nonsense rawAction + docs service -> dataManagement, label = raw string", () => {
      const result = classifyActivity("totally-unknown-action-xyz-999", "docs");
      expect(result).toEqual({
        moduleId: "dataManagement",
        label: "totally-unknown-action-xyz-999",
        category: CATEGORY_LABELS.unknown,
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
});
