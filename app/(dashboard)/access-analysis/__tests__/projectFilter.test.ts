import { describe, it, expect } from "vitest";
import {
  filterRowsByProject,
  distinctProjectNames,
  countMatchedProjects,
  type ProjectRoleRow,
} from "../projectFilter";

const rows: ProjectRoleRow[] = [
  { projectId: "p1", projectName: "Tower A", roles: ["Member"] },
  { projectId: "p1", projectName: "Tower A", roles: [] },
  { projectId: "p2", projectName: "Tower B", roles: ["Admin"] },
  { projectId: "p3", projectName: "Bridge North", roles: ["Member"] },
];

describe("filterRowsByProject", () => {
  it("returns every row when the query is empty or whitespace", () => {
    expect(filterRowsByProject(rows, "")).toHaveLength(4);
    expect(filterRowsByProject(rows, "   ")).toHaveLength(4);
  });

  it("matches project name by case-insensitive substring", () => {
    const out = filterRowsByProject(rows, "tower");
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.projectName.startsWith("Tower"))).toBe(true);
  });

  it("narrows to a single project when the full name is typed", () => {
    const out = filterRowsByProject(rows, "Tower B");
    expect(out).toHaveLength(1);
    expect(out[0].projectId).toBe("p2");
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(filterRowsByProject(rows, "  bridge  ")).toHaveLength(1);
  });

  it("returns no rows when nothing matches", () => {
    expect(filterRowsByProject(rows, "nonexistent")).toEqual([]);
  });
});

describe("distinctProjectNames", () => {
  it("lists unique project names sorted alphabetically", () => {
    expect(distinctProjectNames(rows)).toEqual(["Bridge North", "Tower A", "Tower B"]);
  });
});

describe("countMatchedProjects", () => {
  it("counts distinct projects (not rows) in a row list", () => {
    expect(countMatchedProjects(rows)).toBe(3);
    expect(countMatchedProjects(filterRowsByProject(rows, "tower"))).toBe(2);
    expect(countMatchedProjects([])).toBe(0);
  });
});
