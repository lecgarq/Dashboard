import { describe, expect, it } from "vitest";
import { formatBytes, summarizePermissionFootprint } from "../permissionFootprintCounts";
import type { PermissionFootprintRow } from "@/lib/server/permissionFootprintView";

describe("formatBytes", () => {
  it("renders '0 B' for non-finite or non-positive values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });

  it("renders bytes with no decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("renders KB/MB/GB/TB with 1 decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(42.3 * 1024 ** 3)).toBe("42.3 GB");
    expect(formatBytes(2.96 * 1024 ** 4)).toBe("3.0 TB");
  });
});

function row(over: Partial<PermissionFootprintRow>): PermissionFootprintRow {
  return {
    projectId: "p1",
    projectName: "Project One",
    roleId: "r1",
    roleName: "Role One",
    folderCount: 1,
    totalBytes: 100,
    ...over,
  };
}

describe("summarizePermissionFootprint", () => {
  it("aggregates folder count, bytes, and distinct project count per role", () => {
    const rows: PermissionFootprintRow[] = [
      row({ projectId: "p1", roleId: "r1", roleName: "Admin", folderCount: 5, totalBytes: 100 }),
      row({ projectId: "p2", roleId: "r1", roleName: "Admin", folderCount: 3, totalBytes: 200 }),
    ];
    const { bars, projectsByRole } = summarizePermissionFootprint(rows);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({ roleId: "r1", roleName: "Admin", folderCount: 8, totalBytes: 300, projectCount: 2 });
    expect(projectsByRole.get("Admin")).toHaveLength(2);
  });

  it("sorts bars by totalBytes desc", () => {
    const rows: PermissionFootprintRow[] = [
      row({ roleId: "r1", roleName: "Small", totalBytes: 100 }),
      row({ roleId: "r2", roleName: "Big", totalBytes: 900 }),
      row({ roleId: "r3", roleName: "Medium", totalBytes: 500 }),
    ];
    const { bars } = summarizePermissionFootprint(rows);
    expect(bars.map((b) => b.roleName)).toEqual(["Big", "Medium", "Small"]);
  });

  it("collapses roles beyond topN into a trailing 'Other (N roles)' bar with no drill entry", () => {
    const rows: PermissionFootprintRow[] = [
      row({ roleId: "r1", roleName: "Role A", totalBytes: 500 }),
      row({ roleId: "r2", roleName: "Role B", totalBytes: 400 }),
      row({ roleId: "r3", roleName: "Role C", totalBytes: 300, folderCount: 2 }),
      row({ roleId: "r4", roleName: "Role D", totalBytes: 200, folderCount: 4 }),
    ];
    const { bars, projectsByRole } = summarizePermissionFootprint(rows, 2);
    expect(bars.map((b) => b.roleName)).toEqual(["Role A", "Role B", "Other (2 roles)"]);
    const other = bars[2];
    expect(other.totalBytes).toBe(300 + 200);
    expect(other.folderCount).toBe(2 + 4);
    expect(projectsByRole.has("Other (2 roles)")).toBe(false);
  });

  it("sorts per-role project drill rows by totalBytes desc", () => {
    const rows: PermissionFootprintRow[] = [
      row({ projectId: "p1", projectName: "Alpha", roleId: "r1", roleName: "Admin", totalBytes: 100 }),
      row({ projectId: "p2", projectName: "Beta", roleId: "r1", roleName: "Admin", totalBytes: 900 }),
    ];
    const { projectsByRole } = summarizePermissionFootprint(rows);
    const drill = projectsByRole.get("Admin")!;
    expect(drill.map((p) => p.projectName)).toEqual(["Beta", "Alpha"]);
  });

  it("output row count is bounded by distinct roles, not raw row count", () => {
    const rows: PermissionFootprintRow[] = Array.from({ length: 50 }, (_, i) =>
      row({ projectId: `p${i}`, roleId: `r${i % 5}`, roleName: `Role ${i % 5}`, totalBytes: i + 1 }),
    );
    const { bars } = summarizePermissionFootprint(rows, 10);
    expect(bars.length).toBe(5); // only 5 distinct roleIds across 50 rows, no Other needed
  });
});
