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
  type RawProject,
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

    const prisma = {
      accRole: {
        upsert: vi.fn(async () => ({})),
      },
    };

    const roles = await extractAndPersistHubRoles(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-xyz",
      "token",
    );

    expect(prisma.accRole.upsert).toHaveBeenCalledTimes(3);
    const whereIds = prisma.accRole.upsert.mock.calls.map(
      (call) => (call[0] as { where: { id: string } }).where.id,
    );
    expect(whereIds).toEqual(["r1", "r2", "r3"]);

    // Verify create payload preserves PK + accountId join
    const firstCall = prisma.accRole.upsert.mock.calls[0][0] as {
      create: { id: string; accountId: string; name: string; memberCount: number };
    };
    expect(firstCall.create.id).toBe("r1");
    expect(firstCall.create.accountId).toBe("acct-xyz");
    expect(firstCall.create.name).toBe("Architect");
    expect(firstCall.create.memberCount).toBe(5);

    // Returned roles match the upsert input for downstream consumption (plan 02-03)
    expect(roles).toHaveLength(3);
    expect(roles[0]).toEqual({ id: "r1", name: "Architect", memberCount: 5 });
  });
});
