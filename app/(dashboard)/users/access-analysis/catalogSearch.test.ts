import { describe, it, expect } from "vitest";
import { filterSections } from "./catalogSearch";
import type { CatalogSection } from "./dimensionCatalog";
import type { CatalogDimension } from "./dimensionCatalog.types";

const d = (id: string, label: string, family: CatalogDimension["family"] = "structure"): CatalogDimension => ({
  id, label, family, kind: "categorical", source: "t", confidence: "high", available: true, surfaces: ["slider"], extract: () => null,
});

const sections: CatalogSection[] = [
  { kind: "structural", label: "Structure & Access", dims: [d("project", "Project"), d("role", "Role")] },
  { kind: "activity", label: "Activity", modules: [
    { moduleId: "build", moduleLabel: "Build", groups: [
      { groupId: "content-change" as any, groupLabel: "Content Change", actions: [d("create-issue", "Create Issue", "activity"), d("delete-issue", "Delete Issue", "activity")] },
    ] },
  ] },
  { kind: "folder", label: "Folder attributes", dims: [d("folder:size", "Folder Size", "folder")] },
];

describe("filterSections", () => {
  it("empty query returns all sections unchanged", () => {
    expect(filterSections(sections, "")).toEqual(sections);
  });
  it("matches structural dims by label", () => {
    const r = filterSections(sections, "proj");
    expect(r.find((s) => s.kind === "structural")!.dims!.map((x) => x.id)).toEqual(["project"]);
  });
  it("matches action labels and prunes empty groups/modules", () => {
    const r = filterSections(sections, "create");
    const act = r.find((s) => s.kind === "activity")!;
    expect(act.modules!.length).toBe(1);
    expect(act.modules![0].groups[0].actions.map((a) => a.id)).toEqual(["create-issue"]);
  });
  it("a query matching a MODULE label keeps all its actions", () => {
    const r = filterSections(sections, "build");
    const act = r.find((s) => s.kind === "activity")!;
    expect(act.modules![0].groups[0].actions.length).toBe(2);
  });
  it("drops sections with no matches", () => {
    const r = filterSections(sections, "zzz");
    expect(r.every((s) => (s.dims?.length ?? 0) === 0 && (s.modules?.length ?? 0) === 0)).toBe(true);
  });
});
