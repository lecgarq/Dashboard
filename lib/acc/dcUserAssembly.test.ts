import { describe, it, expect } from "vitest";
import { assembleDcUsers, normalizePermTier, type DcAssemblyInput } from "./dcUserAssembly";

const base: DcAssemblyInput = {
  users: [{ id: "u1", email: "a@lecg.com", name: "Ana", status: "active", companyId: "c1" }],
  projectUsers: [{ projectId: "p1", userId: "u1" }],
  projectUserRoles: [{ projectId: "p1", userId: "u1", roleId: "Architect" }],
  projectUserProducts: [{ projectId: "p1", userId: "u1", productKey: "build", accessLevel: "project_admin" }],
  companies: [{ id: "c1", name: "LECG" }],
  roleNames: { Architect: "Architect" },
  projectMeta: { p1: { name: "Proj One", status: "active", crawlStatus: "ok" } },
};

describe("assembleDcUsers", () => {
  it("assembles one BulkAccUser per DC user with project membership", () => {
    const out = assembleDcUsers(base);
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe("a@lecg.com");
    expect(out[0].firmName).toBe("LECG");
    expect(out[0].accountStatus).toBe("active");
    expect(out[0].projects[0]).toMatchObject({ id: "p1", name: "Proj One", crawlStatus: "ok" });
  });

  it("marks admin from product accessLevel=project_admin", () => {
    const out = assembleDcUsers(base);
    expect(out[0].projects[0].isAdmin).toBe(true);
    expect(out[0].adminCount).toBe(1);
  });

  it("derives permissionCoverage from project crawl status", () => {
    const partial = { ...base, projectUsers: [
      { projectId: "p1", userId: "u1" }, { projectId: "p2", userId: "u1" },
    ], projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "ok" }, p2: { name: "P2", status: "active", crawlStatus: "never" } } };
    expect(assembleDcUsers(partial)[0].permissionCoverage).toBe("partial");
    expect(assembleDcUsers(base)[0].permissionCoverage).toBe("known");
  });

  it("excludes DC users with no project membership", () => {
    const orphan = { ...base, projectUsers: [] };
    expect(assembleDcUsers(orphan)).toHaveLength(0);
  });

  it("flags external users by non-lecg email domain", () => {
    const ext = { ...base, users: [{ id: "u1", email: "x@vendor.com", name: "X", status: "active", companyId: "c1" }] };
    expect(assembleDcUsers(ext)[0].isExternal).toBe(true);
  });
});

describe("permissionContexts", () => {
  it("normalizes permType to a tier rank", () => {
    expect(normalizePermTier("View Only")).toBe("view");
    expect(normalizePermTier("View+Download")).toBe("download");
    expect(normalizePermTier("View+Download+Upload")).toBe("upload");
    expect(normalizePermTier("View+Download+Upload+Edit")).toBe("edit");
    expect(normalizePermTier("Full Controller")).toBe("control");
  });

  it("emits a permission context per user-role-folder grant in a crawled project", () => {
    const out = assembleDcUsers({
      ...base,
      folderPermissions: [
        { folderId: "f1", roleId: "Architect", permType: "View+Download+Upload+Edit", actions: ["VIEW", "EDIT"], projectId: "p1", folderPath: "/Project/Models" },
      ],
    });
    expect(out[0].permissionContexts).toEqual([
      { projectId: "p1", folderId: "f1", folderPath: "/Project/Models", permType: "View+Download+Upload+Edit", permissionTier: "edit", actions: ["VIEW", "EDIT"], crawlStatus: "ok", roleId: "Architect" },
    ]);
  });

  it("emits no permission context for roles/folders in uncrawled projects", () => {
    const out = assembleDcUsers({
      ...base,
      projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "never" } },
      folderPermissions: [
        { folderId: "f1", roleId: "Architect", permType: "View Only", actions: [], projectId: "p1", folderPath: "/x" },
      ],
    });
    expect(out[0].permissionContexts).toEqual([]);
  });
});
