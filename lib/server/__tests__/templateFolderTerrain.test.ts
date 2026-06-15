import { describe, it, expect } from "vitest";
import { buildFolderTerrain } from "@/lib/server/templateFolderTerrain";

// Tree: Project Files (L1) → X, Y (L2) → Z, W (L3 under X)
//   PF: RoleA=View Only
//   X : RoleA=Full Controller   (differs from PF → CHANGED, depth 0)
//   Y : RoleA=View Only         (same as PF → INHERITED, depth 0)
//   Z : RoleA=Full Controller   (same as X → INHERITED, depth 1)
//   W : RoleA=View+Download     (differs from X → CHANGED, depth 1)
const folders = [
  { id: "pf", parentId: null, name: "Project Files", fullPath: "/PF" },
  { id: "x", parentId: "pf", name: "X", fullPath: "/PF/X" },
  { id: "y", parentId: "pf", name: "Y", fullPath: "/PF/Y" },
  { id: "z", parentId: "x", name: "Z", fullPath: "/PF/X/Z" },
  { id: "w", parentId: "x", name: "W", fullPath: "/PF/X/W" },
];
const perms = [
  { folderId: "pf", roleId: "rA", roleName: "RoleA", permType: "View Only" },
  { folderId: "x", roleId: "rA", roleName: "RoleA", permType: "Full Controller" },
  { folderId: "y", roleId: "rA", roleName: "RoleA", permType: "View Only" },
  { folderId: "z", roleId: "rA", roleName: "RoleA", permType: "Full Controller" },
  { folderId: "w", roleId: "rA", roleName: "RoleA", permType: "View+Download" },
];
const roster = [
  { name: "Ann", email: "ann@x.com", role: "RoleA" },
  { name: "Bob", email: "bob@x.com", role: "RoleA" },
];

describe("buildFolderTerrain", () => {
  it("keeps every level ≥2 folder, tagged inherited + depth (PF/level-1 excluded)", () => {
    const t = buildFolderTerrain({
      projectId: "p", projectName: "Template", folders, perms, roster, generatedAt: "2026-06-10T00:00:00.000Z",
    });
    expect(t).not.toBeNull();
    // All of X, Y, W, Z kept (PF excluded as level 1), ordered by fullPath:
    //   /PF/X (x) → /PF/X/W (w) → /PF/X/Z (z) → /PF/Y (y)
    expect(t!.folders.map((f) => f.id)).toEqual(["x", "w", "z", "y"]);
    const byId = new Map(t!.folders.map((f) => [f.id, f]));
    expect(byId.get("x")).toMatchObject({ inherited: false, depth: 0 }); // changed vs PF
    expect(byId.get("y")).toMatchObject({ inherited: true, depth: 0 });  // == PF
    expect(byId.get("w")).toMatchObject({ inherited: false, depth: 1 }); // changed vs X
    expect(byId.get("z")).toMatchObject({ inherited: true, depth: 1 });  // == X
  });

  it("builds cells with tier + rank, inherited flag, and role→roster users for height", () => {
    const t = buildFolderTerrain({
      projectId: "p", projectName: "Template", folders, perms, roster, generatedAt: "2026-06-10T00:00:00.000Z",
    })!;
    expect(t.roles).toEqual([{ id: "rA", name: "RoleA" }]);
    const cell = (fid: string) => t.cells.find((c) => c.folderId === fid)!;
    expect(t.cells).toHaveLength(4);
    expect(cell("x")).toMatchObject({ folderName: "X", tier: "Full Controller", userCount: 2, inherited: false });
    expect(cell("w")).toMatchObject({ folderName: "W", tier: "View+Download", rank: 2, userCount: 2, inherited: false });
    expect(cell("z")).toMatchObject({ tier: "Full Controller", inherited: true });
    expect(cell("y")).toMatchObject({ tier: "View Only", inherited: true });
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
