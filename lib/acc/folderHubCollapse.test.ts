import { describe, it, expect } from "vitest";
import {
  collapseFoldersToDepth,
  type CollapsedFolder,
  type FolderHubInputRow,
} from "./folderHubCollapse";

/**
 * Tests for the pure depth-N folder-collapse module.
 *
 * Plan 07-02 (TDD). The module folds rows from accFoldersRouter.getMatrix
 * down to a hub set at depth N (default 2), with UNION semantics on
 * (roleId, permType) permissions across descendants.
 */

function row(partial: Partial<FolderHubInputRow>): FolderHubInputRow {
  return {
    folderId: "f1",
    folderPath: "/Project Files",
    projectId: "p1",
    roleId: "r1",
    permType: "View Only",
    ...partial,
  };
}

describe("collapseFoldersToDepth", () => {
  it("returns [] for empty input", () => {
    expect(collapseFoldersToDepth([])).toEqual([]);
  });

  it("preserves original folders when all rows are shallower than maxDepth", () => {
    const rows: FolderHubInputRow[] = [
      row({ folderId: "fa", folderPath: "/Project Files", projectId: "p1" }),
      row({ folderId: "fb", folderPath: "/Plans", projectId: "p1", roleId: "r2" }),
    ];
    const out = collapseFoldersToDepth(rows, 2);
    expect(out).toHaveLength(2);
    const byId = new Map(out.map((c) => [c.id, c]));
    expect(byId.get("fa")?.fullPath).toBe("/Project Files");
    expect(byId.get("fb")?.fullPath).toBe("/Plans");
    // No collapsed: prefixed ids for shallow rows
    expect(out.every((c) => !c.id.startsWith("collapsed:"))).toBe(true);
  });

  it("collapses folders deeper than maxDepth=2 to a single depth-2 hub", () => {
    const rows: FolderHubInputRow[] = [
      row({
        folderId: "leaf-a",
        folderPath: "/Project Files/Plans/02 Architecture/A.dwg",
        projectId: "p1",
        roleId: "r1",
        permType: "View Only",
      }),
      row({
        folderId: "leaf-b",
        folderPath: "/Project Files/Plans/02 Architecture/B.dwg",
        projectId: "p1",
        roleId: "r1",
        permType: "View Only",
      }),
    ];
    const out = collapseFoldersToDepth(rows, 2);
    expect(out).toHaveLength(1);
    expect(out[0].fullPath).toBe("/Project Files/Plans");
    expect(out[0].id.startsWith("collapsed:")).toBe(true);
    expect(out[0].name).toBe("Plans");
    expect(out[0].projectId).toBe("p1");
  });

  it("UNIONs permissions across descendants of the same depth-N ancestor", () => {
    const rows: FolderHubInputRow[] = [
      row({
        folderId: "leaf-a",
        folderPath: "/Project Files/Plans/02 Architecture/A.dwg",
        projectId: "p1",
        roleId: "rA",
        permType: "View Only",
      }),
      row({
        folderId: "leaf-b",
        folderPath: "/Project Files/Plans/02 Architecture/B.dwg",
        projectId: "p1",
        roleId: "rB",
        permType: "Full Controller",
      }),
    ];
    const out = collapseFoldersToDepth(rows, 2);
    expect(out).toHaveLength(1);
    expect(out[0].permissions).toHaveLength(2);
    const keys = out[0].permissions.map((p) => `${p.roleId}::${p.permType}`).sort();
    expect(keys).toEqual(["rA::View Only", "rB::Full Controller"].sort());
  });

  it("dedupes permissions by (roleId, permType) within a collapsed hub", () => {
    const rows: FolderHubInputRow[] = [
      row({
        folderId: "leaf-a",
        folderPath: "/Project Files/Plans/02 Architecture/A.dwg",
        projectId: "p1",
        roleId: "r1",
        permType: "View Only",
      }),
      row({
        folderId: "leaf-b",
        folderPath: "/Project Files/Plans/02 Architecture/B.dwg",
        projectId: "p1",
        roleId: "r1",
        permType: "View Only",
      }),
      row({
        folderId: "leaf-c",
        folderPath: "/Project Files/Plans/02 Architecture/C.dwg",
        projectId: "p1",
        roleId: "r1",
        permType: "View Only",
      }),
    ];
    const out = collapseFoldersToDepth(rows, 2);
    expect(out).toHaveLength(1);
    expect(out[0].permissions).toEqual([{ roleId: "r1", permType: "View Only" }]);
  });

  it("preserves every original folder when maxDepth=Infinity (escape hatch)", () => {
    const rows: FolderHubInputRow[] = [
      row({ folderId: "fa", folderPath: "/Project Files", projectId: "p1" }),
      row({
        folderId: "leaf-a",
        folderPath: "/Project Files/Plans/02 Architecture/A.dwg",
        projectId: "p1",
      }),
      row({
        folderId: "leaf-b",
        folderPath: "/Project Files/Plans/02 Architecture/B.dwg",
        projectId: "p1",
        roleId: "r2",
      }),
    ];
    const out = collapseFoldersToDepth(rows, Infinity);
    expect(out).toHaveLength(3);
    expect(out.every((c) => !c.id.startsWith("collapsed:"))).toBe(true);
    const paths = out.map((c) => c.fullPath).sort();
    expect(paths).toEqual(
      [
        "/Project Files",
        "/Project Files/Plans/02 Architecture/A.dwg",
        "/Project Files/Plans/02 Architecture/B.dwg",
      ].sort()
    );
  });

  it("keeps cross-project folders distinct even on identical paths", () => {
    const rows: FolderHubInputRow[] = [
      row({
        folderId: "leaf-p1",
        folderPath: "/Project Files/Plans/02 Architecture/A.dwg",
        projectId: "p1",
      }),
      row({
        folderId: "leaf-p2",
        folderPath: "/Project Files/Plans/02 Architecture/A.dwg",
        projectId: "p2",
      }),
    ];
    const out = collapseFoldersToDepth(rows, 2);
    expect(out).toHaveLength(2);
    const projects = out.map((c) => c.projectId).sort();
    expect(projects).toEqual(["p1", "p2"]);
  });
});
