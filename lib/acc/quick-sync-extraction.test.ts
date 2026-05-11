// lib/acc/quick-sync-extraction.test.ts
//
// Vitest coverage for the project extraction primitives.
// Pins two correctness-critical behaviors:
//   1. Pagination terminates when results.length < PROJECT_PAGE_SIZE
//   2. Soft-delete uses set-difference (status:"active" + id notIn freshIds)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAllProjects,
  extractAndPersistProjects,
  fetchHubRoles,
  extractAndPersistHubRoles,
  normalizeProducts,
  fetchProjectMembers,
  fetchProjectRoles,
  extractAndPersistProjectData,
  runPerProjectFanOut,
  type RawProject,
  type MemberAggregator,
} from "./quick-sync-extraction";

function makeProject(id: string, overrides: Partial<RawProject> = {}): RawProject {
  return {
    id,
    name: `Project ${id}`,
    accountId: "acct-xyz",
    type: "ACC",
    jobNumber: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchAllProjects pagination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("terminates on short page (page 1 full, page 2 partial)", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeProject(`p1-${i}`));
    const page2 = Array.from({ length: 47 }, (_, i) => makeProject(`p2-${i}`));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("offset=0")) return jsonResponse({ results: page1 });
      if (url.includes("offset=100")) return jsonResponse({ results: page2 });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const all = await fetchAllProjects("acct-xyz", "token");

    expect(all).toHaveLength(147);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toContain("offset=100");
  });

  it("single-page early exit when first page is short", async () => {
    const page1 = Array.from({ length: 30 }, (_, i) => makeProject(`p-${i}`));
    const fetchMock = vi.fn(async () => jsonResponse({ results: page1 }));
    vi.stubGlobal("fetch", fetchMock);

    const all = await fetchAllProjects("acct-xyz", "token");

    expect(all).toHaveLength(30);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("extractAndPersistProjects soft-delete", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function buildPrismaMock(staleRows: { id: string }[]) {
    return {
      accProject: {
        upsert: vi.fn(async () => ({})),
        findMany: vi.fn(async () => staleRows),
        updateMany: vi.fn(async () => ({ count: staleRows.length })),
      },
    };
  }

  it("calls updateMany with set-difference of stale IDs", async () => {
    const fresh = [makeProject("p1"), makeProject("p2")];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: fresh })));

    const prisma = buildPrismaMock([{ id: "stale-1" }, { id: "stale-2" }]);

    await extractAndPersistProjects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-xyz",
      "token",
    );

    expect(prisma.accProject.upsert).toHaveBeenCalledTimes(2);

    expect(prisma.accProject.findMany).toHaveBeenCalledWith({
      where: { status: "active", id: { notIn: ["p1", "p2"] } },
      select: { id: true },
    });

    expect(prisma.accProject.updateMany).toHaveBeenCalledTimes(1);
    const updateArgs = (prisma.accProject.updateMany.mock.calls[0] as unknown as [{
      where: { id: { in: string[] } };
      data: { status: string };
    }])[0];
    expect(updateArgs.data).toEqual({ status: "inactive" });
    expect(updateArgs.where.id.in).toEqual(expect.arrayContaining(["stale-1", "stale-2"]));
    expect(updateArgs.where.id.in).toHaveLength(2);
  });

  it("does not call updateMany when no stale projects exist", async () => {
    const fresh = [makeProject("p1")];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: fresh })));

    const prisma = buildPrismaMock([]);

    await extractAndPersistProjects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-xyz",
      "token",
    );

    expect(prisma.accProject.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.accProject.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hub roles (ROLE-01) — plan 02-02
// ---------------------------------------------------------------------------

describe("fetchHubRoles", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps snake_case member_count to camelCase memberCount", async () => {
    const raw = [
      { id: "r1", name: "Architect", member_count: 5 },
      { id: "r2", name: "Engineer", member_count: 0 },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(raw)));

    const roles = await fetchHubRoles("acct-xyz", "token");

    expect(roles).toEqual([
      { id: "r1", name: "Architect", memberCount: 5 },
      { id: "r2", name: "Engineer", memberCount: 0 },
    ]);
  });

  it("filters out entries missing id or name (defensive)", async () => {
    const raw = [
      { id: "r1", name: "Architect", member_count: 5 },
      { id: null, name: "Bad" },              // missing id
      { id: "r3", name: null, member_count: 2 }, // missing name
      { id: "r4", name: "Engineer" },           // missing member_count → 0
    ];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(raw)));

    const roles = await fetchHubRoles("acct-xyz", "token");

    expect(roles).toEqual([
      { id: "r1", name: "Architect", memberCount: 5 },
      { id: "r4", name: "Engineer", memberCount: 0 },
    ]);
  });
});

describe("extractAndPersistHubRoles", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("upserts once per role using APS role id as where.id", async () => {
    const raw = [
      { id: "r1", name: "Architect", member_count: 5 },
      { id: "r2", name: "Engineer", member_count: 3 },
      { id: "r3", name: "Owner", member_count: 1 },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(raw)));

    const upsert = vi.fn(async (_args: unknown) => ({}));
    const prisma = { accRole: { upsert } };

    const roles = await extractAndPersistHubRoles(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-xyz",
      "token",
    );

    expect(upsert).toHaveBeenCalledTimes(3);
    type UpsertArgs = {
      where: { id: string };
      create: { id: string; accountId: string; name: string; memberCount: number };
    };
    const calls = upsert.mock.calls as unknown as Array<[UpsertArgs]>;
    const whereIds = calls.map((call) => call[0].where.id);
    expect(whereIds).toEqual(["r1", "r2", "r3"]);

    // Verify create payload preserves PK + accountId join
    const firstCall = calls[0][0];
    expect(firstCall.create.id).toBe("r1");
    expect(firstCall.create.accountId).toBe("acct-xyz");
    expect(firstCall.create.name).toBe("Architect");
    expect(firstCall.create.memberCount).toBe(5);

    // Returned roles match the upsert input for downstream consumption (plan 02-03)
    expect(roles).toHaveLength(3);
    expect(roles[0]).toEqual({ id: "r1", name: "Architect", memberCount: 5 });
  });
});

// ---------------------------------------------------------------------------
// Per-project members + roles (MEM-01..05, ROLE-02, ROLE-03) — plan 02-03
// ---------------------------------------------------------------------------

describe("normalizeProducts", () => {
  it("maps canonical keys straight through", () => {
    expect(
      normalizeProducts([
        { key: "docs", access: "administrator" },
        { key: "build", access: "member" },
      ]),
    ).toEqual({ docs: "administrator", build: "member" });
  });

  it("normalizes documentManagement/fieldManagement/costManagement aliases", () => {
    expect(
      normalizeProducts([
        { key: "documentManagement", access: "administrator" },
        { key: "fieldManagement", access: "none" },
        { key: "costManagement", access: "member" },
      ]),
    ).toEqual({ docs: "administrator", build: "none", cost: "member" });
  });

  it("returns empty object for nullish input", () => {
    expect(normalizeProducts(null)).toEqual({});
    expect(normalizeProducts(undefined)).toEqual({});
  });
});

describe("fetchProjectMembers lastSignIn key detection", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  function makeRawMember(overrides: Record<string, unknown> = {}) {
    return {
      autodeskId: "u1",
      name: "Alice",
      email: "alice@example.com",
      status: "active",
      lastSignIn: "2026-01-01T00:00:00Z",
      ...overrides,
    };
  }

  it("flags lastSignInPresent=false when the key is missing on the first member", async () => {
    const member = makeRawMember();
    delete (member as Record<string, unknown>).lastSignIn;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [member] })),
    );

    const { members, lastSignInPresent } = await fetchProjectMembers("p1", "tok");
    expect(members).toHaveLength(1);
    expect(lastSignInPresent).toBe(false);
  });

  it("flags lastSignInPresent=true when the key exists but the value is null", async () => {
    const member = makeRawMember({ lastSignIn: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ results: [member] })),
    );

    const { lastSignInPresent } = await fetchProjectMembers("p1", "tok");
    expect(lastSignInPresent).toBe(true);
  });
});

describe("fetchProjectRoles services casing", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("reads document_management AND documentManagement variants", async () => {
    const raw = [
      {
        id: "r1",
        name: "Architect",
        services: { document_management: { access_level: "read" } },
      },
      {
        id: "r2",
        name: "Engineer",
        services: { documentManagement: { access_level: "write" } },
      },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(raw)));

    const roles = await fetchProjectRoles("acct", "p1", "tok");
    expect(roles).toHaveLength(2);
    expect(roles[0].docsAccessLevel).toBe("read");
    expect(roles[1].docsAccessLevel).toBe("write");
  });
});

describe("extractAndPersistProjectData role linking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  function buildPrismaMock() {
    return {
      accRole: { upsert: vi.fn(async () => ({})) },
      accProjectRole: {
        upsert: vi.fn(async () => ({})),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      accProjectMember: {
        upsert: vi.fn(async () => ({ id: "mem-1" })),
      },
    };
  }

  function stubFetch(roles: unknown, members: unknown) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/industry_roles")) return jsonResponse(roles);
        if (url.includes("/users")) return jsonResponse({ results: members });
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );
  }

  it("resolves member.roles[] names case-insensitively and links via accProjectRole.upsert", async () => {
    stubFetch(
      [{ id: "r1", name: "Architect" }],
      [
        {
          autodeskId: "u1",
          name: "Alice",
          email: "Alice@Example.com",
          status: "active",
          // Intentionally lowercased to test case-insensitive match
          roles: [{ name: "architect" }],
        },
      ],
    );

    const prisma = buildPrismaMock();
    const aggregator: MemberAggregator = new Map();

    await extractAndPersistProjectData(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct",
      { id: "p1", name: "Project 1" },
      "tok",
      aggregator,
    );

    // Two upserts on accProjectRole expected:
    //  - none (memberId=null path uses findFirst+create — not upsert)
    //  - one for memberId="mem-1"
    expect(prisma.accProjectRole.upsert).toHaveBeenCalledTimes(1);
    const linkCall = prisma.accProjectRole.upsert.mock
      .calls[0] as unknown as [
      {
        where: { projectId_roleId_memberId: { roleId: string; memberId: string } };
        create: { roleId: string; memberId: string };
      },
    ];
    expect(linkCall[0].where.projectId_roleId_memberId.roleId).toBe("r1");
    expect(linkCall[0].where.projectId_roleId_memberId.memberId).toBe("mem-1");

    // Aggregator entry keyed by lowercased email
    expect(aggregator.size).toBe(1);
    expect(aggregator.get("alice@example.com")).toBeDefined();
  });

  it("logs a warning for unresolved role names without throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    stubFetch(
      [{ id: "r1", name: "Architect" }],
      [
        {
          autodeskId: "u1",
          name: "Alice",
          email: "alice@example.com",
          status: "active",
          roles: [{ name: "GhostRole" }],
        },
      ],
    );

    const prisma = buildPrismaMock();
    const aggregator: MemberAggregator = new Map();

    await expect(
      extractAndPersistProjectData(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        prisma as any,
        "acct",
        { id: "p1", name: "Project 1" },
        "tok",
        aggregator,
      ),
    ).resolves.toBeUndefined();

    // No member-link upsert because GhostRole did not resolve
    expect(prisma.accProjectRole.upsert).not.toHaveBeenCalled();

    // Warning emitted at least once mentioning GhostRole
    const warnedAboutGhost = warn.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("GhostRole")),
    );
    expect(warnedAboutGhost).toBe(true);
  });
});

describe("runPerProjectFanOut skip-and-continue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  it("records the bad project in failures and processes the rest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        // Per-project industry_roles → throw for p2 only
        if (url.includes("/projects/p2/industry_roles")) {
          return new Response("boom", { status: 500, statusText: "ISE" });
        }
        if (url.includes("/industry_roles")) {
          return jsonResponse([{ id: "r1", name: "Architect" }]);
        }
        if (url.includes("/projects/") && url.includes("/users")) {
          // Use the URL to fish out projectId so aggregator gets distinct emails
          const m = url.match(/\/projects\/([^/]+)\/users/);
          const pid = m ? m[1] : "x";
          return jsonResponse({
            results: [
              {
                autodeskId: `u-${pid}`,
                name: `Alice ${pid}`,
                email: `alice-${pid}@example.com`,
                status: "active",
                roles: [],
              },
            ],
          });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    );

    const prisma = {
      accRole: { upsert: vi.fn(async () => ({})) },
      accProjectRole: {
        upsert: vi.fn(async () => ({})),
        findFirst: vi.fn(async () => null),
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
      },
      accProjectMember: { upsert: vi.fn(async () => ({ id: "mem" })) },
    };

    const result = await runPerProjectFanOut(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct",
      [
        { id: "p1", name: "P1" },
        { id: "p2", name: "P2" },
        { id: "p3", name: "P3" },
      ],
      "tok",
    );

    expect(result.failCount).toBe(1);
    expect(result.failures[0].projectId).toBe("p2");
    // Aggregator still picked up p1 + p3 members
    expect(result.aggregator.get("alice-p1@example.com")).toBeDefined();
    expect(result.aggregator.get("alice-p3@example.com")).toBeDefined();
    expect(result.aggregator.get("alice-p2@example.com")).toBeUndefined();
  });
});
