import { describe, expect, it } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import type { SimilarityInput } from "@/lib/acc/userSimilarity";
import type { AccTopologyGraph } from "../accGraphOrganicLayout";
import { buildGraphArrowTables, buildSimilarityInputFromUsers } from "./graphTables";

function user(overrides: Partial<BulkAccUser>): BulkAccUser {
  return {
    email: "alpha@example.com",
    name: "Alpha",
    found: true,
    projectCount: 1,
    activeCount: 1,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-05-01T00:00:00.000Z",
    allRoles: ["Architect"],
    allModules: ["Docs"],
    projects: [
      { id: "p1", name: "Project One", status: "active", isAdmin: false, roles: ["Architect"], modules: ["Docs"] },
    ],
    companyRole: "Design",
    lastSignIn: "2026-05-10T00:00:00.000Z",
    isAccountAdmin: false,
    addedOn: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildGraphArrowTables", () => {
  it("builds stable Arrow table row counts and schema names", async () => {
    const users = [
      user({ email: "alpha@example.com", name: "Alpha" }),
      user({
        email: "beta@example.com",
        name: "Beta",
        projects: [
          { id: "p1", name: "Project One", status: "active", isAdmin: true, roles: ["Architect", "Manager"], modules: ["Docs", "Build"] },
        ],
      }),
    ];
    const similarityInput: SimilarityInput = {
      users: [
        {
          id: "alpha@example.com",
          projectIds: ["p1"],
          roleIds: ["Architect"],
          folderIds: ["f1"],
          activityFileIds: [],
          coverageFlags: ["acc"],
          lastSignIn: Date.parse("2026-05-10T00:00:00.000Z"),
          addedAt: Date.parse("2026-04-01T00:00:00.000Z"),
        },
        {
          id: "beta@example.com",
          projectIds: ["p1"],
          roleIds: ["Architect", "Manager"],
          folderIds: ["f1"],
          activityFileIds: [],
          coverageFlags: ["acc"],
          lastSignIn: Date.parse("2026-05-11T00:00:00.000Z"),
          addedAt: Date.parse("2026-04-02T00:00:00.000Z"),
        },
      ],
    };
    const topology: AccTopologyGraph = {
      visibleNodes: [],
      hiddenNodes: [
        { id: "folder:f1", kind: "folder", label: "Plans" },
        { id: "project:p1", kind: "project", label: "Project One" },
        { id: "role:Architect", kind: "role", label: "Architect" },
      ],
      links: [
        { source: "role:Architect", target: "folder:f1", kind: "role-folder", permTier: "edit" },
        { source: "folder:f1", target: "project:p1", kind: "folder-project" },
      ],
    };

    const tables = await buildGraphArrowTables({ users, similarityInput, topology });

    expect(tables.users.numRows).toBe(2);
    expect(tables.userProjects.numRows).toBe(3);
    expect(tables.similarityEdges.numRows).toBeGreaterThan(0);
    expect(tables.folderPermissions.numRows).toBe(1);
    expect(tables.users.schema.fields.map((field) => field.name)).toEqual([
      "user_id",
      "email",
      "name",
      "found",
      "project_count",
      "active_count",
      "admin_count",
      "is_account_admin",
      "company_role",
      "last_sign_in",
      "added_on",
      "aggregated_status",
      "company_name",
      "firm_name",
      "account_status",
      "permission_coverage",
    ]);
  });

  it("can build folder permission rows directly from the folder matrix", async () => {
    const tables = await buildGraphArrowTables({
      users: [],
      similarityInput: null,
      topology: null,
      folderRows: [{ folderId: "f1", folderPath: "Plans", projectId: "p1", roleId: "Architect", permType: "Full Controller" }],
    });

    expect(tables.folderPermissions.numRows).toBe(1);
    expect(tables.folderPermissions.schema.fields.map((field) => field.name)).toEqual([
      "role_id",
      "folder_id",
      "folder_label",
      "project_id",
      "perm_tier",
    ]);
  });

  it("emits added_on + last_sign_in_instance columns on userProjects (epoch ms or null)", async () => {
    const users = [
      user({
        projects: [
          { id: "p1", name: "P1", status: "active", isAdmin: false, roles: ["R"], modules: ["build"], addedOn: "2025-01-01T00:00:00.000Z", lastSignIn: "2026-05-01T00:00:00.000Z" } as any,
        ],
      }),
    ];
    const tables = await buildGraphArrowTables({ users, similarityInput: null, topology: null });
    const row = tables.userProjects.toArray()[0] as any;
    expect(typeof row.added_on === "number" || row.added_on === null).toBe(true);
    expect(row.added_on).toBe(Date.parse("2025-01-01T00:00:00.000Z"));
    expect(row.last_sign_in_instance).toBe(Date.parse("2026-05-01T00:00:00.000Z"));
  });

  it("emits permission summary columns on userProjects", async () => {
    const users = [
      user({
        projects: [
          { id: "p1", name: "P1", status: "active", isAdmin: false, roles: ["R"], modules: ["build"], permissionStrength: 5, folderBreadth: 3, fullController: true, permMixedProfile: true } as any,
        ],
      }),
    ];
    const tables = await buildGraphArrowTables({ users, similarityInput: null, topology: null });
    const row = tables.userProjects.toArray()[0] as any;
    expect(row.perm_strength).toBe(5);
    expect(row.folder_breadth).toBe(3);
    expect(row.full_controller).toBe(true);
    expect(row.perm_mixed).toBe(true);
  });
});

const u = (o: Partial<BulkAccUser>): BulkAccUser => ({
  email: "a@lecg.com", name: "A", found: true, projectCount: 1, activeCount: 1,
  adminCount: 1, hasNoProjects: false, syncedAt: "", allRoles: [], allModules: [],
  projects: [{ id: "p1", name: "P1", status: "active", isAdmin: true, roles: ["Architect"], modules: ["build"] }],
  isAccountAdmin: true, addedOn: null, isExternal: false, firmId: "c1",
  accountStatus: "active", permissionCoverage: "known", ...o,
}) as BulkAccUser;

describe("buildSimilarityInputFromUsers (extended)", () => {
  it("passes moduleIds, isAdmin, isExternal, firmId into SimilarityUser", () => {
    const { users } = buildSimilarityInputFromUsers([u({})]);
    expect(users[0].moduleIds).toContain("build");
    expect(users[0].isAdmin).toBe(true);
    expect(users[0].isExternal).toBe(false);
    expect(users[0].firmId).toBe("c1");
  });

  it("excludes baseline products docs/insight from moduleIds", () => {
    const { users } = buildSimilarityInputFromUsers([u({ projects: [{ id: "p1", name: "P1", status: "active", isAdmin: false, roles: [], modules: ["docs", "insight", "build"] }] })]);
    expect(users[0].moduleIds).toEqual(["build"]);
  });
});
