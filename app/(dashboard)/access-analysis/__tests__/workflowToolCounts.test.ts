import { describe, it, expect } from "vitest";
import { summarizeWorkflowTools, WORKFLOW_TOOLS } from "../workflowToolCounts";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

const mk = (projectId: string, rawAction: string, count: number, service?: string | null): ModuleActivityRow => ({
  projectId,
  projectName: projectId === "" ? "Account-level" : `Project ${projectId}`,
  rawAction,
  count,
  service,
});

describe("summarizeWorkflowTools", () => {
  it("returns an empty summary per tool for no rows", () => {
    const s = summarizeWorkflowTools([]);
    for (const tool of WORKFLOW_TOOLS) {
      expect(s[tool].slices).toEqual([]);
      expect(s[tool].total).toBe(0);
      expect(s[tool].projectCount).toBe(0);
    }
  });

  it("buckets actions into their tool group via the taxonomy", () => {
    const rows: ModuleActivityRow[] = [
      mk("p1", "rfi-view", 10),
      mk("p1", "rfi-create", 3),
      mk("p2", "submittals-item-create", 5),
      mk("p1", "add-docs-to-review", 7),
      mk("p1", "create-transmittal", 8),
      mk("p2", "view-transmittal", 2),
    ];
    const s = summarizeWorkflowTools(rows);
    expect(s.RFIs.total).toBe(13);
    expect(s.RFIs.slices.map((sl) => sl.label)).toEqual(["RFI View", "RFI Create"]);
    expect(s.Submittals.total).toBe(5);
    expect(s.Reviews.total).toBe(7);
    expect(s.Transmittals.total).toBe(10);
    expect(s.Transmittals.projectCount).toBe(2);
  });

  it("drops rows whose group is outside the three tools", () => {
    const rows: ModuleActivityRow[] = [
      mk("p1", "view-entity", 100), // Files group
      mk("p1", "issue-create", 4), // Issues group
      mk("p1", "rfi-view", 1),
    ];
    const s = summarizeWorkflowTools(rows);
    expect(s.RFIs.total).toBe(1);
    expect(s.Reviews.total).toBe(0);
    expect(s.Submittals.total).toBe(0);
  });

  it("merges the same action across projects into one slice with a per-project breakdown, volume desc", () => {
    const rows: ModuleActivityRow[] = [
      mk("p1", "rfi-view", 2),
      mk("p2", "rfi-view", 9),
    ];
    const s = summarizeWorkflowTools(rows);
    expect(s.RFIs.slices).toHaveLength(1);
    const slice = s.RFIs.slices[0];
    expect(slice.value).toBe(11);
    expect(slice.projects.map((p) => p.projectId)).toEqual(["p2", "p1"]);
    expect(s.RFIs.projectCount).toBe(2);
  });

  it("excludes the account-level sentinel from projectCount but keeps its volume", () => {
    const rows: ModuleActivityRow[] = [mk("", "rfi-view", 6), mk("p1", "rfi-view", 1)];
    const s = summarizeWorkflowTools(rows);
    expect(s.RFIs.total).toBe(7);
    expect(s.RFIs.projectCount).toBe(1);
    expect(s.RFIs.slices[0].projects.map((p) => p.projectId)).toEqual(["", "p1"]);
  });

  it("sorts slices by volume desc with label tiebreak", () => {
    const rows: ModuleActivityRow[] = [
      mk("p1", "rfi-create", 5),
      mk("p1", "rfi-update", 5),
      mk("p1", "rfi-view", 20),
    ];
    const s = summarizeWorkflowTools(rows);
    expect(s.RFIs.slices.map((sl) => sl.label)).toEqual(["RFI View", "RFI Create", "RFI Update"]);
  });
});
