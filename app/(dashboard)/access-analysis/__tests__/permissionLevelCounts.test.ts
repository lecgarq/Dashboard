import { describe, expect, it } from "vitest";
import { PERMISSION_LEVEL_ORDER, summarizePermissionLevel } from "../permissionLevelCounts";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";

function row(over: Partial<PermissionLevelRow>): PermissionLevelRow {
  return {
    projectId: "p1",
    projectName: "Project One",
    roleId: "r1",
    roleName: "Role One",
    permType: "View Only",
    folderCount: 1,
    ...over,
  };
}

describe("summarizePermissionLevel", () => {
  it("aggregates folder counts per role, split by verbatim permType level", () => {
    const rows: PermissionLevelRow[] = [
      row({ projectId: "p1", roleId: "r1", roleName: "Admin", permType: "Full Controller", folderCount: 5 }),
      row({ projectId: "p1", roleId: "r1", roleName: "Admin", permType: "View Only", folderCount: 3 }),
      row({ projectId: "p2", roleId: "r1", roleName: "Admin", permType: "View Only", folderCount: 2 }),
    ];
    const { bars } = summarizePermissionLevel(rows);
    expect(bars).toHaveLength(1);
    expect(bars[0].roleId).toBe("r1");
    expect(bars[0].total).toBe(10);
    expect(bars[0].byLevel).toEqual({ "Full Controller": 5, "View Only": 5 });
    expect(bars[0].projectCount).toBe(2);
  });

  it("sorts bars by total desc, tiebreak by roleName", () => {
    const rows: PermissionLevelRow[] = [
      row({ roleId: "r1", roleName: "Small", folderCount: 10 }),
      row({ roleId: "r2", roleName: "Big", folderCount: 900 }),
      row({ roleId: "r3", roleName: "Medium", folderCount: 500 }),
    ];
    const { bars } = summarizePermissionLevel(rows);
    expect(bars.map((b) => b.roleName)).toEqual(["Big", "Medium", "Small"]);
  });

  it("collapses roles beyond topN into a trailing 'Other (N roles)' bar with aggregated byLevel and no drill entry", () => {
    const rows: PermissionLevelRow[] = [
      row({ roleId: "r1", roleName: "Role A", permType: "Full Controller", folderCount: 500 }),
      row({ roleId: "r2", roleName: "Role B", permType: "View Only", folderCount: 400 }),
      row({ roleId: "r3", roleName: "Role C", permType: "View Only", folderCount: 300 }),
      row({ roleId: "r4", roleName: "Role D", permType: "Full Controller", folderCount: 200 }),
    ];
    const { bars, projectsByRole } = summarizePermissionLevel(rows, 2);
    expect(bars.map((b) => b.roleName)).toEqual(["Role A", "Role B", "Other (2 roles)"]);
    const other = bars[2];
    expect(other.total).toBe(300 + 200);
    expect(other.byLevel).toEqual({ "View Only": 300, "Full Controller": 200 });
    expect(projectsByRole.has("Other (2 roles)")).toBe(false);
  });

  it("orders levels: known PERMISSION_LEVEL_ORDER members present in data, then unknown values appended alphabetically", () => {
    const rows: PermissionLevelRow[] = [
      row({ roleId: "r1", permType: "View Only" }),
      row({ roleId: "r1", permType: "Full Controller" }),
      row({ roleId: "r1", permType: "Zeta Custom Tier" }),
      row({ roleId: "r1", permType: "Alpha Custom Tier" }),
    ];
    const { levels } = summarizePermissionLevel(rows);
    expect(levels).toEqual(["Full Controller", "View Only", "Alpha Custom Tier", "Zeta Custom Tier"]);
    // Sanity: PERMISSION_LEVEL_ORDER itself is strongest -> weakest for the 6 live values.
    expect(PERMISSION_LEVEL_ORDER[0]).toBe("Full Controller");
    expect(PERMISSION_LEVEL_ORDER[PERMISSION_LEVEL_ORDER.length - 1]).toBe("View Only");
  });

  it("zero-fills implicitly — a role with no rows at a level has that level absent from byLevel (chart-safe, not present as 0)", () => {
    const rows: PermissionLevelRow[] = [row({ roleId: "r1", permType: "View Only", folderCount: 5 })];
    const { bars } = summarizePermissionLevel(rows);
    expect(bars[0].byLevel["View Only"]).toBe(5);
    expect(bars[0].byLevel["Full Controller"]).toBeUndefined();
  });

  it("keeps verbatim stored labels — 'Full Controller' appears, PermTier's 'Full administrative controls' label never does", () => {
    const rows: PermissionLevelRow[] = [row({ roleId: "r1", permType: "Full Controller", folderCount: 5 })];
    const { bars, levels } = summarizePermissionLevel(rows);
    expect(levels).toContain("Full Controller");
    expect(levels).not.toContain("Full administrative controls");
    expect(Object.keys(bars[0].byLevel)).toContain("Full Controller");
  });

  it("sorts per-role project drill rows by folderCount desc", () => {
    const rows: PermissionLevelRow[] = [
      row({ projectId: "p1", projectName: "Alpha", roleId: "r1", roleName: "Admin", folderCount: 3 }),
      row({ projectId: "p2", projectName: "Beta", roleId: "r1", roleName: "Admin", folderCount: 9 }),
    ];
    const { projectsByRole } = summarizePermissionLevel(rows);
    const drill = projectsByRole.get("Admin")!;
    expect(drill.map((p) => p.projectName)).toEqual(["Beta", "Alpha"]);
  });

  it("bars output is bounded — bars.length <= topN + 1 (Other)", () => {
    const rows: PermissionLevelRow[] = Array.from({ length: 50 }, (_, i) =>
      row({ projectId: `p${i}`, roleId: `r${i}`, roleName: `Role ${i}`, folderCount: 50 - i }),
    );
    const { bars } = summarizePermissionLevel(rows, 10);
    expect(bars.length).toBeLessThanOrEqual(11);
    expect(bars.length).toBe(11); // 10 kept + 1 Other
  });
});
