/**
 * activitySelectionBreakdown.test.ts — lasso selection analytics aggregation.
 * Pins ranking, sentinel-aware coverage, project-GUID labels, and month labels.
 */
import { describe, expect, it } from "vitest";
import { buildSelectionBreakdown } from "./activitySelectionBreakdown";

// 5 events. Columns are index-aligned to the FULL index.
// verbId (sentinel: 0 = Unknown), roleId (sentinel), projectId (sentinel + GUID),
// monthId (no sentinel), plus the other resident columns the dims read.
const columns = {
  verbId: Uint16Array.from([1, 1, 2, 0, 1]),
  moduleId: Uint16Array.from([0, 0, 1, 1, 1]),
  objectTypeId: Uint16Array.from([1, 2, 1, 1, 0]),
  monthId: Uint16Array.from([0, 0, 1, 1, 1]),
  roleId: Uint16Array.from([1, 2, 1, 0, 1]),
  companyId: Uint16Array.from([1, 1, 1, 2, 0]),
  projectId: Uint32Array.from([1, 1, 2, 0, 1]),
  authorId: Uint32Array.from([1, 2, 3, 1, 1]),
};

const dicts: Record<string, unknown> = {
  verb: ["Unknown", "created", "updated"],
  module: ["(none)", "Docs"],
  objectType: ["Unknown", "file", "folder"],
  role: ["Unknown", "Manager", "Engineer"],
  company: ["Unknown", "Acme", "Globex"],
  project: ["", "guid-aaa", "guid-bbb"],
  author: ["Unknown author", "Ana", "Beto", "Cira"],
  monthCount: 2,
  monthFloor: "2026-06",
};

const projectNames = { "guid-aaa": "Alpha Tower", "guid-bbb": "Beta Bridge" };

describe("buildSelectionBreakdown", () => {
  it("ranks categories by count and resolves labels through dicts", () => {
    const all = Uint32Array.from([0, 1, 2, 3, 4]);
    const b = buildSelectionBreakdown(all, columns, dicts, projectNames);
    const verb = b.find((d) => d.id === "verb")!;
    // verb ids [1,1,2,0,1] → created×3 (top), updated×1, Unknown×1
    expect(verb.top[0]).toEqual({ label: "created", count: 3 });
    expect(verb.total).toBe(5);
    // sentinel dim: one id-0 event is not "covered".
    expect(verb.covered).toBe(4);
    expect(verb.distinct).toBe(3);
  });

  it("labels project GUIDs via projectNames and treats sentinel as uncovered", () => {
    const all = Uint32Array.from([0, 1, 2, 3, 4]);
    const project = buildSelectionBreakdown(all, columns, dicts, projectNames).find((d) => d.id === "project")!;
    // projectId [1,1,2,0,1] → Alpha Tower×3 top, Beta Bridge×1, sentinel×1.
    expect(project.top[0]).toEqual({ label: "Alpha Tower", count: 3 });
    expect(project.covered).toBe(4);
  });

  it("month is sentinel-free: coverage equals the whole selection, labels generated", () => {
    const all = Uint32Array.from([0, 1, 2, 3, 4]);
    const month = buildSelectionBreakdown(all, columns, dicts, projectNames).find((d) => d.id === "month")!;
    expect(month.covered).toBe(5);
    expect(month.top[0].count).toBe(3); // monthId 1 (Jul 2026) appears 3×
    expect(month.top.map((c) => c.label)).toContain("Jul 2026");
  });

  it("aggregates only the selected subset, not the whole corpus", () => {
    const subset = Uint32Array.from([0, 1]); // both authorId 1 and 2
    const author = buildSelectionBreakdown(subset, columns, dicts, projectNames).find((d) => d.id === "author")!;
    expect(author.total).toBe(2);
    expect(author.distinct).toBe(2);
    expect(author.top.reduce((s, c) => s + c.count, 0)).toBe(2);
  });
});
