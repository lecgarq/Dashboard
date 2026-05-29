import { describe, it, expect } from "vitest";
import { buildDimensionCatalog, getCatalogSections } from "./dimensionCatalog";
import { getActions } from "./accTaxonomy";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const features: NodeFeatureSnapshot[] = [
  { nodeId: "u::p", actionCounts: { "issue-create": 3 } } as unknown as NodeFeatureSnapshot,
];

describe("buildDimensionCatalog", () => {
  const dims = buildDimensionCatalog(features);
  const byId = Object.fromEntries(dims.map((d) => [d.id, d]));

  it("includes structural + every action + folder attrs", () => {
    expect(byId.project).toBeTruthy();
    expect(byId.moduleAccess).toBeTruthy();
    expect(byId["issue-create"]).toBeTruthy();
    expect(byId["folder:folder-size"]).toBeTruthy();
    // 9 base structural + 5 per-tier permission sliders (Slice B) + actions + 19 folder placeholders
    expect(dims.length).toBe(9 + 5 + getActions().length + 19);
  });
  it("ids are unique", () => {
    expect(new Set(dims.map((d) => d.id)).size).toBe(dims.length);
  });
  it("derives action availability from the features (issue-create live, view-entity greyed)", () => {
    expect(byId["issue-create"].available).toBe(true);
    expect(byId["view-entity"].available).toBe(false);
  });
  it("folder attrs are greyed (available:false, no surfaces)", () => {
    expect(byId["folder:folder-size"].available).toBe(false);
    expect(byId["folder:folder-size"].surfaces).toEqual([]);
  });
});

describe("getCatalogSections", () => {
  const sections = getCatalogSections(buildDimensionCatalog(features));

  it("emits a pinned structural section, an activity tree, and a folder section", () => {
    expect(sections.map((s) => s.kind)).toEqual(["structural", "activity", "folder"]);
  });
  it("the activity tree is module -> group -> action, only for modules with actions", () => {
    const activity = sections.find((s) => s.kind === "activity")!;
    expect(activity.modules!.length).toBeGreaterThan(0);
    const build = activity.modules!.find((m) => m.moduleId === "build");
    expect(build).toBeTruthy();
    const wf = build!.groups.find((g) => g.groupId === "workflowChange");
    expect(wf!.actions.some((a) => a.id === "issue-create")).toBe(true);
  });
});
