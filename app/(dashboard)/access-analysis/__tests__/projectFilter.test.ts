import { describe, it, expect } from "vitest";
import {
  projectOptions,
  filterProjectOptions,
  filterRowsBySelection,
  type ProjectRoleRow,
} from "../projectFilter";

const rows: ProjectRoleRow[] = [
  { projectId: "p1", projectName: "Tower A", roles: ["Member"] },
  { projectId: "p1", projectName: "Tower A", roles: ["Admin", "Member"] },
  { projectId: "p2", projectName: "Tower B", roles: ["Designer"] },
  { projectId: "p3", projectName: "Bridge North", roles: ["Member"] },
];

describe("projectOptions", () => {
  it("lists distinct projects as {id,name}, sorted by name", () => {
    expect(projectOptions(rows)).toEqual([
      { id: "p3", name: "Bridge North" },
      { id: "p1", name: "Tower A" },
      { id: "p2", name: "Tower B" },
    ]);
  });
});

describe("filterProjectOptions", () => {
  const options = projectOptions(rows);

  it("returns every option when the query is empty or whitespace", () => {
    expect(filterProjectOptions(options, "")).toHaveLength(3);
    expect(filterProjectOptions(options, "   ")).toHaveLength(3);
  });

  it("matches option name by case-insensitive, trimmed substring", () => {
    expect(filterProjectOptions(options, "tower").map((o) => o.id)).toEqual(["p1", "p2"]);
    expect(filterProjectOptions(options, "  BRIDGE ").map((o) => o.id)).toEqual(["p3"]);
  });

  it("returns no options when nothing matches", () => {
    expect(filterProjectOptions(options, "nonexistent")).toEqual([]);
  });
});

describe("filterRowsBySelection", () => {
  it("keeps only rows whose project is in the selected set", () => {
    const out = filterRowsBySelection(rows, new Set(["p3"]));
    expect(out).toHaveLength(1);
    expect(out[0].projectId).toBe("p3");
  });

  it("keeps every row when all projects are selected", () => {
    expect(filterRowsBySelection(rows, new Set(["p1", "p2", "p3"]))).toHaveLength(4);
  });

  it("keeps nothing when the selection is empty", () => {
    expect(filterRowsBySelection(rows, new Set())).toEqual([]);
  });
});
