import { describe, it, expect } from "vitest";
import {
  getModules, getGroups, getActions, getAction, getModuleById, resolveActionId,
  getModuleForEntitlement, getActionsByModule, isAdminSourceAction,
} from "./accTaxonomy";

describe("accTaxonomy API", () => {
  it("exposes modules, groups, and the generated actions", () => {
    expect(getModules().length).toBe(9);
    expect(getGroups().length).toBe(6);
    expect(getActions().length).toBeGreaterThan(140);
  });
  it("resolves a rawAction to a canonical id (alias-aware)", () => {
    expect(resolveActionId("issue-create")).toBe("issue-create");
    expect(resolveActionId("Issue Create")).toBe("issue-create");
    expect(resolveActionId("add-attribute-to-namingstandard")).toBe("add-attribute-to-naming-standard");
  });
  it("looks up an action by id", () => {
    expect(getAction("view-entity")?.moduleId).toBe("dataManagement");
    expect(getAction("nope")).toBeUndefined();
  });
  it("looks up a module by id", () => {
    expect(getModuleById("build")?.label).toBe("Build");
    expect(getModuleById("nope")).toBeUndefined();
  });
  it("maps entitlement keys to module ids (cost folds into build)", () => {
    expect(getModuleForEntitlement("cost")?.id).toBe("build");
    expect(getModuleForEntitlement("forma")?.id).toBe("design");
    expect(getModuleForEntitlement("unknownKey")).toBeUndefined();
  });
  it("groups actions by module", () => {
    const build = getActionsByModule("build");
    expect(build.every((a) => a.moduleId === "build")).toBe(true);
    expect(build.some((a) => a.id === "issue-create")).toBe(true);
  });
  it("knows admin-source actions", () => {
    expect(isAdminSourceAction("assign-member")).toBe(true);
    expect(isAdminSourceAction("view-entity")).toBe(false);
  });
});
