import { describe, it, expect } from "vitest";
import { GENERATED_ACTIONS } from "./accTaxonomyActions.generated";

describe("generated actions", () => {
  it("parsed a substantial catalog with unique ids", () => {
    expect(GENERATED_ACTIONS.length).toBeGreaterThan(140);
    expect(new Set(GENERATED_ACTIONS.map((a) => a.id)).size).toBe(GENERATED_ACTIONS.length);
  });
  it("placed issues/rfis/submittals under build and files under dataManagement", () => {
    const byId = new Map(GENERATED_ACTIONS.map((a) => [a.id, a]));
    expect(byId.get("issue-create")?.moduleId).toBe("build");
    expect(byId.get("rfi-view")?.moduleId).toBe("build");
    expect(byId.get("view-entity")?.moduleId).toBe("dataManagement");
    expect(byId.get("view-sheet")?.moduleId).toBe("designCollaboration");
  });
  it("flagged the 5 admin-source actions", () => {
    const byId = new Map(GENERATED_ACTIONS.map((a) => [a.id, a]));
    expect(byId.get("assign-member")?.source).toBe("admin");
    expect(byId.get("edit-project")?.source).toBe("admin");
  });
});
