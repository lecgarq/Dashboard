import { describe, it, expect } from "vitest";
import {
  projectOptions,
  filterProjectOptions,
  filterRowsBySelection,
  applySliceFilters,
  type ProjectRoleRow,
  type SliceFilters,
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

  it("trims padded hub names and labels blank names honestly (no mystery rows on top)", () => {
    const padded: ProjectRoleRow[] = [
      { projectId: "p9", projectName: "  ACC Test Demo 1 ", roles: [] },
      { projectId: "abcd1234-guid", projectName: "   ", roles: [] },
      { projectId: "p1", projectName: "Tower A", roles: [] },
    ];
    expect(projectOptions(padded)).toEqual([
      { id: "p9", name: "ACC Test Demo 1" },
      { id: "p1", name: "Tower A" },
      { id: "abcd1234-guid", name: "Unnamed project · abcd1234" },
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

describe("applySliceFilters", () => {
  type Row = { projectId: string; projectName: string; roles: string[]; company?: string | null };
  const sliceRows: Row[] = [
    { projectId: "p1", projectName: "Tower A", roles: ["PM", "Admin"], company: "Acme" },
    { projectId: "p2", projectName: "Tower B", roles: ["Designer"], company: "Acme" },
    { projectId: "p3", projectName: "Bridge", roles: ["PM"], company: "Beta" },
    { projectId: "p4", projectName: "Depot", roles: ["Member"], company: null },
  ];

  it("empty filters returns all rows unchanged (referential pass-through)", () => {
    const result = applySliceFilters(sliceRows, {} as SliceFilters);
    expect(result).toHaveLength(4);
  });

  it("{ role: 'PM' } keeps only rows whose roles include PM", () => {
    const result = applySliceFilters(sliceRows, { role: "PM" });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.projectId)).toEqual(["p1", "p3"]);
  });

  it("{ company: 'Acme' } keeps only rows where company === Acme", () => {
    const result = applySliceFilters(sliceRows, { company: "Acme" });
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.projectId)).toEqual(["p1", "p2"]);
  });

  it("{ role: 'PM', company: 'Acme' } AND-stacks both filters", () => {
    const result = applySliceFilters(sliceRows, { role: "PM", company: "Acme" });
    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBe("p1");
  });

  it("a row with company: null is excluded by { company: 'Acme' } filter", () => {
    const result = applySliceFilters(sliceRows, { company: "Acme" });
    const ids = result.map((r) => r.projectId);
    expect(ids).not.toContain("p4"); // p4 has company: null
  });

  it("unknown dimension keys in filters are ignored", () => {
    const result = applySliceFilters(sliceRows, { unknownDim: "whatever" } as SliceFilters);
    expect(result).toHaveLength(4);
  });
});
