import { describe, it, expect } from "vitest";
import { buildChangedFolderTerrain } from "@/lib/server/templateFolderTerrain";

// Tree: Project Files (L1) → X, Y (L2) → Z, W (L3 under X)
//   PF: RoleA=View Only
//   X : RoleA=Full Controller   (differs from PF → CHANGED)
//   Y : RoleA=View Only         (same as PF → inherited → excluded)
//   Z : RoleA=Full Controller   (same as X → inherited → excluded)
//   W : RoleA=View+Download     (differs from X → CHANGED)
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

describe("buildChangedFolderTerrain", () => {
  it("keeps only folders (level ≥2) whose permissions differ from their parent", () => {
    const t = buildChangedFolderTerrain({
      projectId: "p", projectName: "Template", folders, perms, roster, generatedAt: "2026-06-10T00:00:00.000Z",
    });
    expect(t).not.toBeNull();
    // X (changed vs PF) and W (changed vs X); Y + Z excluded (inherited); PF excluded (level 1)
    expect(t!.folders.map((f) => f.id).sort()).toEqual(["w", "x"]);
    // ordered by fullPath: /PF/X (x) before /PF/X/W (w)
    expect(t!.folders.map((f) => f.id)).toEqual(["x", "w"]);
  });

  it("builds cells with tier + rank and role→roster users for height", () => {
    const t = buildChangedFolderTerrain({
      projectId: "p", projectName: "Template", folders, perms, roster, generatedAt: "2026-06-10T00:00:00.000Z",
    })!;
    expect(t.roles).toEqual([{ id: "rA", name: "RoleA" }]);
    expect(t.cells).toEqual([
      { folderId: "x", folderName: "X", roleId: "rA", roleName: "RoleA", tier: "Full Controller", rank: 5, userCount: 2 },
      { folderId: "w", folderName: "W", roleId: "rA", roleName: "RoleA", tier: "View+Download", rank: 2, userCount: 2 },
    ]);
    expect(t.usersByRole.rA.map((u) => u.name)).toEqual(["Ann", "Bob"]);
    expect(t.maxUserCount).toBe(2);
  });

  it("returns null when no Project Files folder exists", () => {
    expect(buildChangedFolderTerrain({
      projectId: "p", projectName: "T", folders: [{ id: "a", parentId: null, name: "Other", fullPath: "/a" }],
      perms: [], roster: [], generatedAt: "t",
    })).toBeNull();
  });
});
