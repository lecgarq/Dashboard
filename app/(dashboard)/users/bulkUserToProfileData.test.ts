import { describe, expect, it } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { bulkUserToProfileData } from "./bulkUserToProfileData";

const baseUser: BulkAccUser = {
  email: "jane@hermosillo.com",
  name: "Jane Doe",
  found: true,
  projectCount: 2,
  activeCount: 1,
  adminCount: 1,
  hasNoProjects: false,
  syncedAt: "2026-05-29T10:00:00.000Z",
  allRoles: ["Architect"],
  allModules: ["docs", "build"],
  isAccountAdmin: false,
  addedOn: "2025-01-15T00:00:00.000Z",
  lastSignIn: "2026-05-20T08:30:00.000Z",
  companyName: "Hermosillo",
  aggregatedStatus: "active",
  projectAdmin: true,
  projects: [
    {
      id: "p1",
      name: "Tower A",
      status: "active",
      isAdmin: true,
      roles: ["Architect"],
      modules: ["docs", "build"],
      addedOn: "2025-01-15T00:00:00.000Z",
    },
    {
      id: "p2",
      name: "Tower B",
      status: "archived",
      isAdmin: false,
      roles: [],
      modules: ["docs"],
    },
  ],
};

describe("bulkUserToProfileData", () => {
  it("maps a found user to AccProfileData with projects and metadata", () => {
    const data = bulkUserToProfileData(baseUser);
    expect(data.found).toBe(true);
    expect(data.name).toBe("Jane Doe");
    expect(data.status).toBe("active");
    expect(data.company).toBe("Hermosillo");
    expect(data.addedOn).toBe("2025-01-15T00:00:00.000Z");
    expect(data.lastSignIn).toBe("2026-05-20T08:30:00.000Z");
    expect(data.syncedAt).toBe("2026-05-29T10:00:00.000Z");
    expect(data.role).toBe("project_admin");
    expect(data.projects).toHaveLength(2);
    expect(data.projects?.[0]).toMatchObject({
      id: "p1",
      name: "Tower A",
      status: "active",
      isAdmin: true,
      roles: ["Architect"],
      modules: ["docs", "build"],
      addedOn: "2025-01-15T00:00:00.000Z",
    });
    // Project without addedOn maps to undefined (not null) for the renderer.
    expect(data.projects?.[1].addedOn).toBeUndefined();
  });

  it("derives account_admin role and falls back on missing enrichment", () => {
    const admin = bulkUserToProfileData({
      ...baseUser,
      isAccountAdmin: true,
      aggregatedStatus: undefined,
      projectAdmin: undefined,
      companyName: null,
    });
    expect(admin.role).toBe("account_admin");
    // No aggregatedStatus → derive "active" because activeCount > 0.
    expect(admin.status).toBe("active");
    // companyName null → company undefined (renderer hides the row).
    expect(admin.company).toBeUndefined();
  });

  it("derives inactive status when no active projects and no enrichment", () => {
    const data = bulkUserToProfileData({
      ...baseUser,
      activeCount: 0,
      aggregatedStatus: undefined,
    });
    expect(data.status).toBe("inactive");
  });
});
