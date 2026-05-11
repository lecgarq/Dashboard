// lib/acc/quick-sync-extraction.test.ts
//
// Vitest coverage for the project extraction primitives.
// Pins two correctness-critical behaviors:
//   1. Pagination terminates when results.length < PROJECT_PAGE_SIZE
//   2. Soft-delete uses set-difference (status:"active" + id notIn freshIds)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchAllProjects, extractAndPersistProjects, type RawProject } from "./quick-sync-extraction";

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
    const updateArgs = prisma.accProject.updateMany.mock.calls[0][0] as {
      where: { id: { in: string[] } };
      data: { status: string };
    };
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
