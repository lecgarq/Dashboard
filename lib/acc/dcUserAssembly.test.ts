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

  it("does not classify project admins as account admins", () => {
    const out = assembleDcUsers(base);
    expect(out[0].adminCount).toBe(1);
    expect(out[0].projectAdmin).toBe(true);
    expect(out[0].isAccountAdmin).toBe(false);
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

  it("classifies isExternal via the canonical internal-domain rule", () => {
    const make = (email: string | null) => ({
      ...base,
      users: [{ id: "u1", email, name: "X", status: "active", companyId: "c1" }],
    });
    // Internal: hermosillo.com domain.
    expect(assembleDcUsers(make("user@hermosillo.com"))[0].isExternal).toBe(false);
    // External: any other valid domain (legacy lecg.com is now external).
    expect(assembleDcUsers(make("x@vendor.com"))[0].isExternal).toBe(true);
    expect(assembleDcUsers(make("legacy@lecg.com"))[0].isExternal).toBe(true);
    // Unknown (null / malformed) must NOT be auto-flagged external.
    expect(assembleDcUsers(make(null))[0].isExternal).toBe(false);
    expect(assembleDcUsers(make("bademail"))[0].isExternal).toBe(false);
  });

  it("derives firm from project-user company joins when AccDcUser.companyId is empty", () => {
    const out = assembleDcUsers({
      ...base,
      users: [{ id: "u1", email: "a@lecg.com", name: "Ana", status: "active", companyId: null }],
      companies: [
        { id: "c1", name: "LECG" },
        { id: "c2", name: "Partner" },
      ],
      projectUsers: [
        { projectId: "p1", userId: "u1" },
        { projectId: "p2", userId: "u1" },
      ],
      projectUserCompanies: [
        { projectId: "p1", userId: "u1", companyId: "c2" },
        { projectId: "p2", userId: "u1", companyId: "c2" },
      ],
      projectMeta: {
        p1: { name: "P1", status: "active", crawlStatus: "ok" },
        p2: { name: "P2", status: "active", crawlStatus: "ok" },
      },
    });

    expect(out[0].firmId).toBe("c2");
    expect(out[0].firmName).toBe("Partner");
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
      includePermissionContexts: true,
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
      includePermissionContexts: true,
      projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "never" } },
      folderPermissions: [
        { folderId: "f1", roleId: "Architect", permType: "View Only", actions: [], projectId: "p1", folderPath: "/x" },
      ],
    });
    expect(out[0].permissionContexts).toEqual([]);
  });

  it("omits permission contexts by default (lean node feed)", () => {
    const out = assembleDcUsers({
      ...base,
      folderPermissions: [
        { folderId: "f1", roleId: "Architect", permType: "View+Download+Upload+Edit", actions: ["VIEW", "EDIT"], projectId: "p1", folderPath: "/Project/Models" },
      ],
    });
    expect(out[0].permissionContexts).toEqual([]);
  });
});

describe("per-instance addedOn / lastSignIn", () => {
  it("carries AccDcProjectUser.addedOn + lastSignIn onto the project", () => {
    const input: DcAssemblyInput = {
      ...base,
      users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
      projectUsers: [{ projectId: "p1", userId: "u1", addedOn: "2025-01-01T00:00:00.000Z", lastSignIn: "2026-05-01T00:00:00.000Z" }],
      projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "ok" } },
    };
    const out = assembleDcUsers(input);
    expect(out[0].projects[0].addedOn).toBe("2025-01-01T00:00:00.000Z");
    expect(out[0].projects[0].lastSignIn).toBe("2026-05-01T00:00:00.000Z");
  });

  it("defaults to null when the membership row omits the dates", () => {
    const out = assembleDcUsers(base);
    expect(out[0]?.projects[0]?.addedOn ?? null).toBeNull();
  });
});

describe("includePermissionSummary", () => {
  const withGrants: DcAssemblyInput = {
    ...base,
    users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
    projectUsers: [{ projectId: "p1", userId: "u1" }],
    projectUserRoles: [{ projectId: "p1", userId: "u1", roleId: "r1" }],
    projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "ok" } },
    folderPermissions: [
      { folderId: "f1", roleId: "r1", permType: "View Only", actions: [], projectId: "p1", folderPath: "A" },
      { folderId: "f2", roleId: "r1", permType: "Full Controller", actions: [], projectId: "p1", folderPath: "B" },
    ],
  };

  it("computes strength=control(5), breadth=2, mixed=true, fullController=true", () => {
    const out = assembleDcUsers({ ...withGrants, includePermissionSummary: true });
    const proj = out[0].projects[0];
    expect(proj.permissionStrength).toBe(5);
    expect(proj.folderBreadth).toBe(2);
    expect(proj.permMixedProfile).toBe(true);
    expect(proj.fullController).toBe(true);
  });

  it("leaves summary undefined and contexts empty when flag is off", () => {
    const out = assembleDcUsers(withGrants);
    expect(out[0].projects[0].permissionStrength).toBeUndefined();
    expect(out[0].permissionContexts).toEqual([]);
  });

  it("summary mode does NOT ship raw permissionContexts", () => {
    const out = assembleDcUsers({ ...withGrants, includePermissionSummary: true });
    expect(out[0].permissionContexts).toEqual([]);
  });
});

describe("activityByInstance attach", () => {
  it("attaches mix/total/lastActivity to the matching project (keyed by email)", () => {
    const out = assembleDcUsers({
      ...base,
      users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
      activityByInstance: new Map([["a@hermosillo.com::p1", { mix: { view: 4 }, total: 4, lastActivity: "2026-05-10T00:00:00.000Z" }]]),
    });
    const proj = out[0].projects[0];
    expect(proj.activityTotal).toBe(4);
    expect(proj.activityMix!.view).toBe(4);
    expect(proj.lastActivity).toBe("2026-05-10T00:00:00.000Z");
  });
  it("defaults to undefined when no aggregate is supplied", () => {
    expect(assembleDcUsers(base)[0].projects[0].activityTotal).toBeUndefined();
  });
});
