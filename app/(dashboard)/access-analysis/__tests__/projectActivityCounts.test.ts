import { describe, it, expect } from "vitest";
import { DEFAULT_TOP_N, summarizeProjectActivity } from "../projectActivityCounts";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

const mk = (projectId: string, rawAction: string, count: number): ModuleActivityRow => ({
  projectId,
  projectName: projectId === "" ? "Account-level" : `Project ${projectId}`,
  rawAction,
  count,
});

describe("summarizeProjectActivity", () => {
  it("returns an empty summary for no rows", () => {
    const s = summarizeProjectActivity([]);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.accountLevelCount).toBe(0);
    expect(s.otherProjectCount).toBe(0);
    expect(s.rowsByProject.size).toBe(0);
  });

  it("excludes the synthetic Account-level bucket (projectId '') from slices and total, but tracks it separately", () => {
    const rows: ModuleActivityRow[] = [
      mk("", "admin-action", 25),
      mk("p1", "view-entity", 10),
    ];
    const s = summarizeProjectActivity(rows);
    expect(s.slices).toHaveLength(1);
    expect(s.slices[0].projectId).toBe("p1");
    expect(s.accountLevelCount).toBe(25);
    expect(s.total).toBe(10); // Account-level volume excluded from total
    expect(s.rowsByProject.has("")).toBe(false);
  });

  it("aggregates activity per project, summing across rawActions, sorted desc (tiebreak projectName)", () => {
    const rows: ModuleActivityRow[] = [
      mk("p1", "view-entity", 100),
      mk("p1", "issue-create", 40),
      mk("p2", "view-entity", 50),
    ];
    const s = summarizeProjectActivity(rows);
    expect(s.slices.map((sl) => sl.name)).toEqual(["Project p1", "Project p2"]);
    expect(s.slices[0].value).toBe(140);
    expect(s.slices[1].value).toBe(50);
    expect(s.total).toBe(190);
  });

  it("top-N + Other: 12 projects with distinct volumes collapse the tail into one Other bucket", () => {
    const rows: ModuleActivityRow[] = Array.from({ length: 12 }, (_, i) =>
      mk(`p${i}`, "view-entity", 100 - i), // p0=100 ... p11=89, strictly desc
    );
    const s = summarizeProjectActivity(rows, DEFAULT_TOP_N);
    expect(s.slices).toHaveLength(11); // 10 kept + 1 Other
    expect(s.otherProjectCount).toBe(2);
    const other = s.slices[10];
    expect(other.name).toBe("Other (2 projects)");
    // The two smallest: p10=90, p11=89
    expect(other.value).toBe(90 + 89);
    expect(other.projectId).toBe("");
    // The folded tail is preserved, ranked desc, for the Other slice's expand-to-list drill.
    expect(s.otherProjects.map((p) => [p.projectId, p.value])).toEqual([
      ["p10", 90],
      ["p11", 89],
    ]);
    expect(s.otherProjects[0].name).toBe("Project p10");
  });

  it("otherProjects is empty when every project fits inside topN", () => {
    const s = summarizeProjectActivity([mk("p1", "view-entity", 10)], DEFAULT_TOP_N);
    expect(s.otherProjects).toEqual([]);
  });

  it("uses singular 'project' noun when exactly one project folds into Other", () => {
    const rows: ModuleActivityRow[] = Array.from({ length: 11 }, (_, i) => mk(`p${i}`, "view-entity", 100 - i));
    const s = summarizeProjectActivity(rows, DEFAULT_TOP_N);
    expect(s.otherProjectCount).toBe(1);
    expect(s.slices[10].name).toBe("Other (1 project)");
  });

  it("topN === distinct-project count expands in place — no Other bucket", () => {
    const rows: ModuleActivityRow[] = [
      mk("p1", "view-entity", 30),
      mk("p2", "issue-create", 20),
      mk("p3", "create-custom-attribute", 10),
    ];
    const s = summarizeProjectActivity(rows, 3);
    expect(s.slices).toHaveLength(3);
    expect(s.otherProjectCount).toBe(0);
    expect(s.slices.every((sl) => sl.projectId !== "")).toBe(true);
  });

  it("rowsByProject preserves a kept project's raw rows verbatim (usable by summarizeModules), with no entry for Other or Account-level", () => {
    const rows: ModuleActivityRow[] = [
      mk("", "admin-action", 5),
      mk("p1", "view-entity", 30),
      mk("p1", "issue-create", 20),
      mk("p2", "view-entity", 1),
    ];
    const s = summarizeProjectActivity(rows, 1); // only p1 kept, p2 -> Other
    expect(s.rowsByProject.has("p1")).toBe(true);
    expect(s.rowsByProject.get("p1")).toEqual([
      mk("p1", "view-entity", 30),
      mk("p1", "issue-create", 20),
    ]);
    expect(s.rowsByProject.has("p2")).toBe(false); // folded into Other
    expect(s.rowsByProject.has("")).toBe(false); // Account-level, never a drill entry
  });

  it("slices sum equals total (donut percentages add to 100%)", () => {
    const rows: ModuleActivityRow[] = Array.from({ length: 15 }, (_, i) => mk(`p${i}`, "view-entity", 30 - i));
    const s = summarizeProjectActivity(rows, 5);
    const sum = s.slices.reduce((acc, sl) => acc + sl.value, 0);
    expect(sum).toBe(s.total);
  });
});
