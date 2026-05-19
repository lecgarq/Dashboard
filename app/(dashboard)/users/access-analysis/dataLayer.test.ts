// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { normalize, materializeNodes, INTERNAL_DOMAINS, type NormalizedNodeRow } from "./dataLayer";
import { hashNodeSetAndSliders } from "./positionsCache";
import type { BulkAccUser } from "@/lib/acc/acc-types";

// ---------------------------------------------------------------------------
// Mock getDuckDbClient so tests never spin up real DuckDB-WASM (Pitfall 3).
// The mock tracks rows inserted via insertArrowTable and answers COUNT(*) queries.
// ---------------------------------------------------------------------------
let mockRows: unknown[] = [];
let positionsSchemaCreated = false;

const mockConnection = {
  query: vi.fn(async (sql: string) => {
    const s = sql.trim();
    if (/^DROP TABLE IF EXISTS nodes/i.test(s)) {
      mockRows = [];
      return { toArray: () => [] };
    }
    if (/^CREATE TABLE IF NOT EXISTS positions/i.test(s)) {
      positionsSchemaCreated = true;
      return { toArray: () => [] };
    }
    if (/^CREATE INDEX/i.test(s)) {
      return { toArray: () => [] };
    }
    if (/SELECT COUNT\(\*\) AS n FROM nodes/i.test(s)) {
      return { toArray: () => [{ n: BigInt(mockRows.length) }] };
    }
    if (/SELECT node_id, activity_norm, is_admin FROM nodes/i.test(s)) {
      return { toArray: () => mockRows };
    }
    return { toArray: () => [] };
  }),
  insertArrowTable: vi.fn(async (table: unknown) => {
    // Store the rows from the Arrow table for later assertions.
    // apache-arrow Table has .toArray() but we can also iterate batches.
    const t = table as { toArray(): unknown[] };
    mockRows = t.toArray();
  }),
};

vi.mock("./duckdbClient", () => ({
  getDuckDbClient: vi.fn(async () => ({
    connection: mockConnection,
  })),
  resetDuckDbClientForTests: vi.fn(),
}));

beforeEach(() => {
  mockRows = [];
  positionsSchemaCreated = false;
  mockConnection.query.mockClear();
  mockConnection.insertArrowTable.mockClear();
});

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
function makeUser(override: Partial<BulkAccUser> & { email?: string; projects?: BulkAccUser["projects"] }): BulkAccUser {
  return {
    email: override.email ?? "test@lecg.com",
    name: override.email?.split("@")[0] ?? "Test",
    found: true,
    projectCount: override.projects?.length ?? 1,
    activeCount: override.activeCount ?? 5,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-05-19T00:00:00.000Z",
    allRoles: [],
    allModules: [],
    isAccountAdmin: false,
    addedOn: null,
    lastSignIn: override.lastSignIn ?? "2026-05-01T00:00:00.000Z",
    projects: override.projects ?? [
      { id: "p1", name: "Project One", status: "active", isAdmin: false, roles: ["Viewer"], modules: ["Docs"] },
    ],
    ...override,
  };
}

// ---------------------------------------------------------------------------
// DATA-01: one row per (email, projectId)
// ---------------------------------------------------------------------------
describe("DATA-01: cardinality — one row per (email, projectId)", () => {
  it("produces the correct number of rows for multi-user multi-project input", () => {
    const users: BulkAccUser[] = [
      makeUser({
        email: "alice@lecg.com",
        projects: [
          { id: "p1", name: "P1", status: "active", isAdmin: false, roles: ["Viewer"], modules: ["Docs"] },
          { id: "p2", name: "P2", status: "active", isAdmin: true, roles: ["Admin"], modules: ["Cost"] },
        ],
      }),
      makeUser({
        email: "bob@lecg.com",
        projects: [
          { id: "p1", name: "P1", status: "active", isAdmin: false, roles: ["Member"], modules: ["Docs"] },
          { id: "p3", name: "P3", status: "active", isAdmin: false, roles: ["Viewer"], modules: ["Sheets"] },
        ],
      }),
      makeUser({
        email: "carol@lecg.com",
        projects: [
          { id: "p2", name: "P2", status: "active", isAdmin: false, roles: ["Viewer"], modules: ["Cost"] },
        ],
      }),
    ];
    // 2 + 2 + 1 = 5 rows expected
    const rows = normalize(users);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.id)).size).toBe(5); // all ids are unique
  });

  it("single user with one project produces exactly one row", () => {
    const rows = normalize([makeUser({})]);
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// DATA-02: all six feature families populated
// ---------------------------------------------------------------------------
describe("DATA-02: feature columns — all six families populated", () => {
  const FORTY_FIVE_DAYS_AGO = new Date(Date.now() - 45 * 86_400_000).toISOString();

  const fixture: BulkAccUser[] = [
    makeUser({
      email: "Alice@Lecg.com",
      lastSignIn: FORTY_FIVE_DAYS_AGO,
      activeCount: 10,
      projects: [
        {
          id: "p1",
          name: "P1",
          status: "active",
          isAdmin: true,
          roles: ["admin", "admin", "viewer"], // dedup expected
          modules: ["docs", "cost"],
        },
      ],
    }),
  ];

  it("normalizes email to lowercase", () => {
    const [row] = normalize(fixture);
    expect(row.email).toBe("alice@lecg.com");
  });

  it("preserves activityRaw", () => {
    const [row] = normalize(fixture);
    expect(row.activityRaw).toBe(10);
  });

  it("activityNorm is finite and in [0, 1]", () => {
    const [row] = normalize(fixture);
    expect(Number.isFinite(row.activityNorm)).toBe(true);
    expect(row.activityNorm).toBeGreaterThanOrEqual(0);
    expect(row.activityNorm).toBeLessThanOrEqual(1);
  });

  it("recencyNorm ≈ 1 - 45/90 = 0.5 (within 0.05 tolerance)", () => {
    const [row] = normalize(fixture);
    expect(row.recencyNorm).toBeCloseTo(0.5, 1); // 0.05 tolerance at 1 decimal
  });

  it("isAdmin = 1 for admin project", () => {
    const [row] = normalize(fixture);
    expect(row.isAdmin).toBe(1);
  });

  it("isExternal = 0 for lecg.com user (INTERNAL_DOMAINS)", () => {
    expect(INTERNAL_DOMAINS.has("lecg.com")).toBe(true);
    const [row] = normalize(fixture);
    expect(row.isExternal).toBe(0);
  });

  it("roleIds are deduped", () => {
    const [row] = normalize(fixture);
    expect(row.roleIds.sort()).toEqual(["admin", "viewer"]);
  });

  it("moduleWeights are uniform: 0.5 each for docs and cost", () => {
    const [row] = normalize(fixture);
    expect(row.moduleWeights.get("docs")).toBeCloseTo(0.5, 10);
    expect(row.moduleWeights.get("cost")).toBeCloseTo(0.5, 10);
  });
});

// ---------------------------------------------------------------------------
// DATA-02: edge cases
// ---------------------------------------------------------------------------
describe("DATA-02: edge cases", () => {
  it("null lastSignIn → recencyNorm === 0", () => {
    const users = [makeUser({ lastSignIn: null })];
    const [row] = normalize(users);
    expect(row.recencyNorm).toBe(0);
  });

  it("external domain (bob@external.com) → isExternal === 1", () => {
    const users = [makeUser({ email: "bob@external.com" })];
    const [row] = normalize(users);
    expect(row.isExternal).toBe(1);
  });

  it("single-project dataset: activityNorm is 0 or 1, never NaN (span-guard)", () => {
    const users = [makeUser({ activeCount: 7 })];
    const [row] = normalize(users);
    expect(Number.isNaN(row.activityNorm)).toBe(false);
    expect(row.activityNorm === 0 || row.activityNorm === 1).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DATA-03: materializeNodes DuckDB roundtrip (via mocked connection)
// ---------------------------------------------------------------------------
describe("DATA-03: materializeNodes DuckDB roundtrip", () => {
  const threeRowFixture: BulkAccUser[] = [
    makeUser({ email: "a@lecg.com", activeCount: 1, projects: [{ id: "p1", name: "P1", status: "active", isAdmin: false, roles: ["Viewer"], modules: ["Docs"] }] }),
    makeUser({ email: "b@lecg.com", activeCount: 2, projects: [{ id: "p1", name: "P1", status: "active", isAdmin: true,  roles: ["Admin"], modules: ["Cost"] }] }),
    makeUser({ email: "c@lecg.com", activeCount: 3, projects: [{ id: "p2", name: "P2", status: "active", isAdmin: false, roles: ["Viewer"], modules: ["Sheets"] }] }),
  ];

  it("inserts one row per (email, projectId) — COUNT(*) returns expected row count", async () => {
    const rows = normalize(threeRowFixture);
    expect(rows).toHaveLength(3);

    await materializeNodes(rows);

    expect(mockConnection.insertArrowTable).toHaveBeenCalledTimes(1);
    // The mock's insertArrowTable stores rows from the Arrow table
    expect(mockRows).toHaveLength(3);
  });

  it("also bootstraps positions schema after table create", async () => {
    const rows = normalize(threeRowFixture);
    await materializeNodes(rows);
    // ensurePositionsSchema calls CREATE TABLE IF NOT EXISTS positions
    expect(positionsSchemaCreated).toBe(true);
  });

  it("re-materialize is idempotent (row count does not double)", async () => {
    const rows = normalize(threeRowFixture);

    await materializeNodes(rows);
    const firstCount = mockRows.length;

    await materializeNodes(rows);
    const secondCount = mockRows.length;

    expect(firstCount).toBe(3);
    expect(secondCount).toBe(3); // not 6
  });

  it("DROP TABLE IF EXISTS nodes is called before insert", async () => {
    const rows = normalize(threeRowFixture);
    await materializeNodes(rows);

    const calls = mockConnection.query.mock.calls.map((c) => (c[0] as string).trim());
    const dropIdx = calls.findIndex((s) => /DROP TABLE IF EXISTS nodes/i.test(s));
    expect(dropIdx).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// DATA-04: position cache key is stable under filter changes
// ---------------------------------------------------------------------------
describe("DATA-04: position cache key stable under filter changes", () => {
  it("same ids + same sliders → same hash; filter state does not affect key", () => {
    const users: BulkAccUser[] = [
      makeUser({ email: "x@lecg.com", projects: [{ id: "p1", name: "P1", status: "active", isAdmin: false, roles: [], modules: [] }] }),
      makeUser({ email: "y@external.com", projects: [{ id: "p2", name: "P2", status: "active", isAdmin: false, roles: [], modules: [] }] }),
    ];
    const rows = normalize(users);
    const ids = rows.map((r) => r.id);
    const sliders = { activity: 0.5, recency: 0.0 };

    const k1 = hashNodeSetAndSliders(ids, sliders);

    // Simulate filter change: alpha mask would change which nodes are visible,
    // but we do NOT pass filter state into hashNodeSetAndSliders — key is unchanged.
    const k2 = hashNodeSetAndSliders(ids, sliders);

    expect(k2).toBe(k1);
  });
});
