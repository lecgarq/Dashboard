import { describe, expect, it } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  ACC_SNAPSHOT_STALE_TIME_MS,
  mapFallbackDirectoryToOrgPeople,
  mergeAccSummaryWithEnrichment,
  mergePeopleWithAccSummary,
  selectAccSummarySource,
  attachDirectoryFields,
  type OrgPerson,
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

function person(over: Partial<OrgPerson>): OrgPerson {
  return {
    resourceName: "people/1",
    displayName: "Ada Lovelace",
    email: "ada@hermosillo.com",
    photoUrl: "https://lh3.googleusercontent.com/a/ada",
    department: null,
    jobTitle: null,
    phoneNumber: null,
    costCenter: "ENG-100",
    ...over,
  };
}

function accUser(email: string): BulkAccUser {
  return {
    email,
    name: "Ada (ACC)",
    found: true,
    projectCount: 1,
    activeCount: 1,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-06-16T00:00:00.000Z",
    allRoles: [],
    allModules: [],
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
  };
}

describe("mergePeopleWithAccSummary — directory enrichment", () => {
  it("attaches photoUrl + costCenter onto a matched ACC user", () => {
    const out = mergePeopleWithAccSummary(
      [person({ email: "ada@hermosillo.com" })],
      [accUser("ada@hermosillo.com")],
    );
    const row = out.find((u) => u.email === "ada@hermosillo.com")!;
    expect(row.found).toBe(true);
    expect(row.photoUrl).toBe("https://lh3.googleusercontent.com/a/ada");
    expect(row.costCenter).toBe("ENG-100");
  });

  it("sets photoUrl + costCenter on a directory-only stub user", () => {
    const out = mergePeopleWithAccSummary(
      [person({ email: "new@hermosillo.com", photoUrl: "p", costCenter: "CC-9" })],
      [],
    );
    const row = out.find((u) => u.email === "new@hermosillo.com")!;
    expect(row.found).toBe(false);
    expect(row.photoUrl).toBe("p");
    expect(row.costCenter).toBe("CC-9");
  });

  it("leaves photoUrl/costCenter undefined for an ACC user with no directory match", () => {
    const out = mergePeopleWithAccSummary([], [accUser("ghost@x.com")]);
    const row = out.find((u) => u.email === "ghost@x.com")!;
    expect(row.photoUrl).toBeUndefined();
    expect(row.costCenter).toBeUndefined();
  });
});

describe("attachDirectoryFields", () => {
  it("spreads photoUrl + costCenter onto matched users (by email)", () => {
    const out = attachDirectoryFields(
      [accUser("ada@hermosillo.com"), accUser("nobody@x.com")],
      [person({ email: "ada@hermosillo.com", photoUrl: "P", costCenter: "CC" })],
    );
    const ada = out.find((u) => u.email === "ada@hermosillo.com")!;
    expect(ada.photoUrl).toBe("P");
    expect(ada.costCenter).toBe("CC");
  });

  it("leaves unmatched users unchanged", () => {
    const out = attachDirectoryFields(
      [accUser("nobody@x.com")],
      [person({ email: "ada@hermosillo.com" })],
    );
    expect(out[0].photoUrl).toBeUndefined();
    expect(out[0].costCenter).toBeUndefined();
  });

  it("returns users unchanged when there are no directory people", () => {
    const users = [accUser("a@x.com")];
    expect(attachDirectoryFields(users, [])).toEqual(users);
  });
});
