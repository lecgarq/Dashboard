import { describe, it, expect } from "vitest";
import { buildRolePermissionTree } from "@/lib/server/templateRoleTree";

const folders = [
  { id: "f1", name: "Client Docs", fullPath: "/PF/Client Docs" },
  { id: "f2", name: "Design Docs", fullPath: "/PF/Design Docs" },
  { id: "f3", name: "IFC", fullPath: "/PF/Design Docs/IFC" },
];
const perms = [
  // Architect: Full on f2, View Only on f1, f3
  { folderId: "f2", roleId: "rArch", roleName: "Architect", permType: "Full Controller" },
  { folderId: "f1", roleId: "rArch", roleName: "Architect", permType: "View Only" },
  { folderId: "f3", roleId: "rArch", roleName: "Architect", permType: "View Only" },
  // Designer: +Edit on f3
  { folderId: "f3", roleId: "rDes", roleName: "Designer", permType: "View+Download+Upload+Edit" },
];

describe("buildRolePermissionTree", () => {
  it("groups folders by role then tier (rank desc), with counts", () => {
    const tree = buildRolePermissionTree(perms, folders);

    // roles sorted by folder count desc: Architect (3) before Designer (1)
    expect(tree.map((n) => [n.roleName, n.folderCount])).toEqual([
      ["Architect", 3],
      ["Designer", 1],
    ]);

    const arch = tree[0];
    // tiers rank desc: Full control (5) then View only (1)
    expect(arch.tiers.map((t) => [t.label, t.folders.length])).toEqual([
      ["Full control", 1],
      ["View only", 2],
    ]);
    // Full-control folder is f2; View-only folders sorted by path: f1 then f3
    expect(arch.tiers[0].folders.map((f) => f.id)).toEqual(["f2"]);
    expect(arch.tiers[1].folders.map((f) => f.id)).toEqual(["f1", "f3"]);

    const des = tree[1];
    expect(des.tiers.map((t) => t.label)).toEqual(["+ Edit"]);
    expect(des.tiers[0].folders[0]).toEqual({ id: "f3", name: "IFC", path: "/PF/Design Docs/IFC" });
  });

  it("ignores perms whose folder is missing and handles empty input", () => {
    expect(buildRolePermissionTree([{ folderId: "ghost", roleId: "r", roleName: "R", permType: "View Only" }], folders)).toEqual([]);
    expect(buildRolePermissionTree([], folders)).toEqual([]);
  });
});
