import { describe, expect, it } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  ACC_SNAPSHOT_STALE_TIME_MS,
  mapFallbackDirectoryToOrgPeople,
  mergeAccSummaryWithEnrichment,
  mergePeopleWithAccSummary,
  selectAccSummarySource,
} from "./useMergedAccUsers";

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
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
    ...overrides,
  };
}

describe("ACC user merge helpers", () => {
  it("uses a 10 minute snapshot stale window for ACC summary queries", () => {
    expect(ACC_SNAPSHOT_STALE_TIME_MS).toBe(10 * 60_000);
  });

  it("merges enriched member fields case-insensitively", () => {
    const merged = mergeAccSummaryWithEnrichment(
      [user({ email: "Alpha@Example.com" })],
      [
        {
          email: "alpha@example.com",
          aggregatedStatus: "active",
          projectAdmin: true,
          executive: false,
          companyName: "LECG",
          perProjectRoleNames: ["Project Admin"],
        },
      ],
    );

    expect(merged[0]).toMatchObject({
      aggregatedStatus: "active",
      projectAdmin: true,
      companyName: "LECG",
      perProjectRoleNames: ["Project Admin"],
    });
  });

  it("creates ACC stubs for directory people without ACC summary rows", () => {
    const people = mapFallbackDirectoryToOrgPeople([
      {
        id: "u1",
        name: null,
        email: "new@example.com",
        image: null,
        department: "Design",
        jobTitle: "Architect",
      },
    ]);

    const merged = mergePeopleWithAccSummary(people, []);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      email: "new@example.com",
      name: "new@example.com",
      found: false,
      hasNoProjects: true,
      projects: [],
      isAccountAdmin: false,
    });
  });

  it("keeps ACC-only users when a directory list is available", () => {
    const people = mapFallbackDirectoryToOrgPeople([
      {
        id: "u1",
        name: "Directory User",
        email: "directory@example.com",
        image: null,
        department: "Design",
        jobTitle: "Architect",
      },
    ]);

    const merged = mergePeopleWithAccSummary(people, [
      user({ email: "directory@example.com", name: "ACC Directory User" }),
      user({ email: "vendor@example.com", name: "Vendor User", projectCount: 3 }),
    ]);

    expect(merged.map((u) => u.email)).toEqual(["directory@example.com", "vendor@example.com"]);
    expect(merged[1]).toMatchObject({ found: true, projectCount: 3 });
  });

  it("prefers DC bulk users over stale cache summary users when DC is available", () => {
    const cacheUsers = [
      user({ email: "cache@example.com", projectCount: 100 }),
    ];
    const dcUsers = [
      user({ email: "dc@example.com", projectCount: 2 }),
    ];

    expect(selectAccSummarySource(dcUsers, cacheUsers)).toEqual(dcUsers);
    expect(selectAccSummarySource([], cacheUsers)).toEqual(cacheUsers);
  });
});
