import { describe, it, expect } from "vitest";
import { buildFolderTerrain } from "@/lib/server/templateFolderTerrain";

// Real ACC stores a folder permission's actions[] ONLY where explicitly set; an
// inheriting subfolder comes back with EMPTY actions (actionCount 0) and a
// floored "View Only" permType. The terrain must resolve each empty-actions cell
// to the effective level it inherits from the nearest explicit ancestor.
//
// Tree: Project Files (L1) → X, Y (L2) → Z, W (L3 under X)
//   PF: RoleA = Full Controller (7)             explicit root grant
//   X : RoleA = View Only (0)   inherits PF   → effective Full Controller  (INHERITED, depth 0)
//   Y : RoleA = View+Download (3)               explicit override          (CHANGED,   depth 0)
//   Z : RoleA = View Only (0)   inherits X     → effective Full Controller  (INHERITED, depth 1)
//   W : RoleA = View+Download+Upload+Edit (6)   explicit override          (CHANGED,   depth 1)
const folders = [
  { id: "pf", parentId: null, name: "Project Files", fullPath: "/PF" },
  { id: "x", parentId: "pf", name: "X", fullPath: "/PF/X" },
  { id: "y", parentId: "pf", name: "Y", fullPath: "/PF/Y" },
  { id: "z", parentId: "x", name: "Z", fullPath: "/PF/X/Z" },
  { id: "w", parentId: "x", name: "W", fullPath: "/PF/X/W" },
];
const perms = [
  { folderId: "pf", roleId: "rA", roleName: "RoleA", permType: "Full Controller", actionCount: 7 },
  { folderId: "x", roleId: "rA", roleName: "RoleA", permType: "View Only", actionCount: 0 },
  { folderId: "y", roleId: "rA", roleName: "RoleA", permType: "View+Download", actionCount: 3 },
  { folderId: "z", roleId: "rA", roleName: "RoleA", permType: "View Only", actionCount: 0 },
  { folderId: "w", roleId: "rA", roleName: "RoleA", permType: "View+Download+Upload+Edit", actionCount: 6 },
];
const roster = [
  { name: "Ann", email: "ann@x.com", role: "RoleA" },
  { name: "Bob", email: "bob@x.com", role: "RoleA" },
];

describe("buildFolderTerrain", () => {
  it("keeps every level ≥2 folder, tagged inherited (by effective perms) + depth", () => {
    const t = buildFolderTerrain({
      projectId: "p", projectName: "Template", folders, perms, roster, generatedAt: "2026-06-10T00:00:00.000Z",
    });
    expect(t).not.toBeNull();
    // PF excluded (level 1); ordered by fullPath: /PF/X → /PF/X/W → /PF/X/Z → /PF/Y
    expect(t!.folders.map((f) => f.id)).toEqual(["x", "w", "z", "y"]);
    const byId = new Map(t!.folders.map((f) => [f.id, f]));
    expect(byId.get("x")).toMatchObject({ inherited: true, depth: 0 });  // empty → inherits PF
    expect(byId.get("y")).toMatchObject({ inherited: false, depth: 0 }); // explicit override
    expect(byId.get("w")).toMatchObject({ inherited: false, depth: 1 }); // explicit override
    expect(byId.get("z")).toMatchObject({ inherited: true, depth: 1 });  // empty → inherits X (eff FC)
  });

  it("resolves inherited (empty-actions) cells to the effective level, keeps explicit grants", () => {
    const t = buildFolderTerrain({
      projectId: "p", projectName: "Template", folders, perms, roster, generatedAt: "2026-06-10T00:00:00.000Z",
    })!;
    expect(t.roles).toEqual([{ id: "rA", name: "RoleA" }]);
    const cell = (fid: string) => t.cells.find((c) => c.folderId === fid)!;
    expect(t.cells).toHaveLength(4);
    // X inherits Full Controller from Project Files (NOT the stored "View Only").
    expect(cell("x")).toMatchObject({ folderName: "X", tier: "Full Controller", inherited: true });
    // Y keeps its explicit downgrade.
    expect(cell("y")).toMatchObject({ tier: "View+Download", rank: 2, inherited: false });
    // W keeps its explicit grant.
    expect(cell("w")).toMatchObject({ tier: "View+Download+Upload+Edit", inherited: false });
    // Z inherits Full Controller two levels down (PF → X → Z).
    expect(cell("z")).toMatchObject({ tier: "Full Controller", inherited: true });
    expect(t.usersByRole.rA.map((u) => u.name)).toEqual(["Ann", "Bob"]);
    expect(t.maxUserCount).toBe(2);
  });

  it("returns null when no Project Files folder exists", () => {
    expect(buildFolderTerrain({
      projectId: "p", projectName: "T", folders: [{ id: "a", parentId: null, name: "Other", fullPath: "/a" }],
      perms: [], roster: [], generatedAt: "t",
    })).toBeNull();
  });
});
