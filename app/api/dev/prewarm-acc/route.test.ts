import { afterEach, describe, expect, it, vi } from "vitest";

const prewarmAccHotCache = vi.fn(async () => ({
  startedAt: "2026-05-21T12:00:00.000Z",
  totalMs: 12,
  tasks: [
    { name: "accDcGraph.bulkUsers", ok: true, ms: 5, rows: 1 },
    { name: "accMembers.enrichedUsers", ok: true, ms: 4, rows: 1 },
    { name: "users.bulkAccSummary", ok: true, ms: 3, rows: 1 },
  ],
  cache: { entries: 3, hits: 0, misses: 3, invalidations: 0 },
}));

vi.mock("@/server/db", () => ({
  db: {},
}));

vi.mock("@/lib/server/acc-hot-cache", () => ({
  prewarmAccHotCache,
}));

describe("GET /api/dev/prewarm-acc", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    prewarmAccHotCache.mockClear();
  });

  it("warms ACC caches for local non-production requests", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost:3000/api/dev/prewarm-acc"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tasks).toHaveLength(3);
    expect(prewarmAccHotCache).toHaveBeenCalledWith({});
  });

  it("rejects production requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost:3000/api/dev/prewarm-acc"));

    expect(response.status).toBe(404);
    expect(prewarmAccHotCache).not.toHaveBeenCalled();
  });

  it("rejects non-local requests", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://example.com/api/dev/prewarm-acc"));

    expect(response.status).toBe(403);
    expect(prewarmAccHotCache).not.toHaveBeenCalled();
  });
});
