import { describe, it, expect } from "vitest";
import { explicitFolderIds } from "@/lib/server/templateRoleSimilarity";

// Tree: Project Files (L1) → X, Y (L2) → Z, W (L3 under X)
//   PF: RoleA=View Only        (differs from its (permless) parent → EXPLICIT, kept)
//   X : RoleA=Full Controller  (differs from PF → EXPLICIT)
//   Y : RoleA=View Only        (same as PF → inherited → dropped)
//   Z : RoleA=Full Controller  (same as X → inherited → dropped)
//   W : RoleA=View+Download    (differs from X → EXPLICIT)
const folders = [
  { id: "pf", parentId: null, name: "Project Files" },
  { id: "x", parentId: "pf", name: "X" },
  { id: "y", parentId: "pf", name: "Y" },
  { id: "z", parentId: "x", name: "Z" },
  { id: "w", parentId: "x", name: "W" },
];
const perms = [
  { folderId: "pf", roleId: "rA", permType: "View Only" },
  { folderId: "x", roleId: "rA", permType: "Full Controller" },
  { folderId: "y", roleId: "rA", permType: "View Only" },
  { folderId: "z", roleId: "rA", permType: "Full Controller" },
  { folderId: "w", roleId: "rA", permType: "View+Download" },
];

describe("explicitFolderIds", () => {
  it("keeps Project Files + every folder whose permission set differs from its parent", () => {
    const ids = explicitFolderIds(folders, perms);
    expect([...ids].sort()).toEqual(["pf", "w", "x"]);
  });

  it("returns an empty set when there is no Project Files folder", () => {
    expect(explicitFolderIds([{ id: "a", parentId: null, name: "Other" }], []).size).toBe(0);
  });
});
