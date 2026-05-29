import { describe, it, expect } from "vitest";
import {
  MODULES, GROUPS, ACCESS_LEVELS, STRUCTURAL_DIMS,
  ENTITLEMENT_TO_MODULE, ACTION_ALIASES, ADMIN_SOURCE_ACTION_IDS,
} from "./accTaxonomyStatic";

describe("accTaxonomyStatic", () => {
  it("has the 9 excel modules with unique ids", () => {
    expect(MODULES).toHaveLength(9);
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(9);
    expect(MODULES.map((m) => m.label)).toContain("Data Management");
    expect(MODULES.map((m) => m.label)).toContain("Preconstruction");
  });
  it("maps all 9 DB entitlement keys, folding cost into build", () => {
    const keys = ["build", "cost", "docs", "designCollaboration", "modelCoordination", "insight", "autoSpecs", "takeoff", "forma"];
    for (const k of keys) expect(ENTITLEMENT_TO_MODULE[k]).toBeTruthy();
    expect(ENTITLEMENT_TO_MODULE.cost).toBe("build");
    expect(ENTITLEMENT_TO_MODULE.docs).toBe("dataManagement");
    expect(ENTITLEMENT_TO_MODULE.takeoff).toBe("preconstruction");
    expect(ENTITLEMENT_TO_MODULE.forma).toBe("design");
    const moduleIds = new Set(MODULES.map((m) => m.id));
    for (const id of Object.values(ENTITLEMENT_TO_MODULE)) expect(moduleIds.has(id)).toBe(true);
  });
  it("has the real 6-rung access ladder (none..fullController)", () => {
    expect(ACCESS_LEVELS.map((a) => a.strength)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ACCESS_LEVELS.find((a) => a.strength === 5)?.permType).toBe("Full Controller");
    expect(ACCESS_LEVELS.find((a) => a.strength === 0)?.permType).toBeNull();
  });
  it("declares the structural dims", () => {
    const ids = STRUCTURAL_DIMS.map((d) => d.id);
    expect(ids).toEqual(
      expect.arrayContaining(["project", "role", "company", "status", "permission", "tenure", "moduleAccess", "admin", "internalExternal"]),
    );
  });
  it("carries the known hyphenation alias and the 5 admin-source actions", () => {
    expect(ACTION_ALIASES["add-attribute-to-namingstandard"]).toBe("add-attribute-to-naming-standard");
    expect([...ADMIN_SOURCE_ACTION_IDS].sort()).toEqual(
      ["assign-admin", "assign-member", "edit-project", "remove-admin", "remove-member"],
    );
  });
  it("groups include the excel's 5 real groups + unknown", () => {
    expect(GROUPS.map((g) => g.id).sort()).toEqual(
      ["accessChange", "contentChange", "delete", "read", "unknown", "workflowChange"],
    );
  });
});
