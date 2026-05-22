// @vitest-environment jsdom
/**
 * featureSnapshot.test.ts — covers the Phase 4-01 Task 1 contract:
 *  - Output array length === input nodeIds length
 *  - Cosmos render order preserved across the DuckDB Map roundtrip
 *  - Activity bucket boundaries (0→None, 1→Low, 11→Med, 101→High)
 *  - BigInt-prone columns (activity_count, last_signin_days) cast to Number (Pitfall 2)
 *  - Unknown nodeId returns the safe fallback snapshot
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock DuckDB client BEFORE importing featureSnapshot ------------------

interface FakeRow {
  user_id: string;
  project_id: string;
  full_name: string | null;
  email: string | null;
  project_name: string | null;
  role_display: string | null;
  perm_tier: string | null;
  is_external: bigint | number | boolean | null;
  activity_count: bigint | number | null;
  last_signin_days: bigint | number | null;
  firm_name: string | null;
  account_status: string | null;
  permission_coverage: string | null;
}

let mockRows: FakeRow[] = [];
const mockConnection = {
  query: vi.fn(async (_sql: string) => ({
    toArray: () => mockRows,
  })),
};

vi.mock("../duckdbClient", () => ({
  getDuckDbClient: vi.fn(async () => ({ connection: mockConnection })),
}));

import { buildFeatureSnapshot, bucketActivity, bucketSignin } from "../featureSnapshot";

beforeEach(() => {
  mockRows = [];
  mockConnection.query.mockClear();
});

// ---- bucket boundary helpers ----------------------------------------------

describe("bucketActivity boundaries", () => {
  it("0 → None, 1 → Low, 11 → Med, 101 → High", () => {
    expect(bucketActivity(0)).toBe("None");
    expect(bucketActivity(1)).toBe("Low");
    expect(bucketActivity(10)).toBe("Low");
    expect(bucketActivity(11)).toBe("Med");
    expect(bucketActivity(100)).toBe("Med");
    expect(bucketActivity(101)).toBe("High");
  });
});

describe("bucketSignin boundaries", () => {
  it("buckets days into <7d / <30d / <90d / >90d", () => {
    expect(bucketSignin(0)).toBe("<7d");
    expect(bucketSignin(6)).toBe("<7d");
    expect(bucketSignin(7)).toBe("<30d");
    expect(bucketSignin(29)).toBe("<30d");
    expect(bucketSignin(30)).toBe("<90d");
    expect(bucketSignin(89)).toBe("<90d");
    expect(bucketSignin(90)).toBe(">90d");
    expect(bucketSignin(null)).toBe(">90d");
  });
});

// ---- buildFeatureSnapshot --------------------------------------------------

describe("buildFeatureSnapshot — Task 1 contract", () => {
  it("preserves cosmos index order; length === input.nodeIds.length", async () => {
    mockRows = [
      makeRow({ user_id: "a", project_id: "p1", activity_count: BigInt(0) }),
      makeRow({ user_id: "b", project_id: "p2", activity_count: BigInt(5) }),
      makeRow({ user_id: "c", project_id: "p3", activity_count: BigInt(150) }),
    ];
    // Intentionally reorder the requested cosmos ids — output MUST follow this order.
    const requested = ["c::p3", "a::p1", "b::p2"];
    const result = await buildFeatureSnapshot({ nodeIds: requested });

    expect(result).toHaveLength(3);
    expect(result.map((f) => f.nodeId)).toEqual(["c::p3", "a::p1", "b::p2"]);
  });

  it("buckets activity at the documented boundaries (0, 1, 11, 101)", async () => {
    mockRows = [
      makeRow({ user_id: "u0", project_id: "p", activity_count: BigInt(0) }),
      makeRow({ user_id: "u1", project_id: "p", activity_count: BigInt(1) }),
      makeRow({ user_id: "u11", project_id: "p", activity_count: BigInt(11) }),
      makeRow({ user_id: "u101", project_id: "p", activity_count: BigInt(101) }),
    ];
    const ids = ["u0::p", "u1::p", "u11::p", "u101::p"];
    const result = await buildFeatureSnapshot({ nodeIds: ids });
    expect(result[0]!.activityBucket).toBe("None");
    expect(result[1]!.activityBucket).toBe("Low");
    expect(result[2]!.activityBucket).toBe("Med");
    expect(result[3]!.activityBucket).toBe("High");
  });

  it("casts BigInt activity_count and last_signin_days to Number (Pitfall 2)", async () => {
    mockRows = [
      makeRow({
        user_id: "x",
        project_id: "p",
        activity_count: BigInt(42),
        last_signin_days: BigInt(5),
      }),
    ];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["x::p"] });
    expect(typeof f!.activityCountRaw).toBe("number");
    expect(f!.activityCountRaw).toBe(42);
    expect(f!.signinBucket).toBe("<7d");
    expect(f!.lastSignInRel).toBe("5d ago");
    // Confirm no BigInt leaked into anything that does arithmetic later
    expect(() => f!.activityCountRaw + 1).not.toThrow();
  });

  it("returns the safe fallback for unknown nodeIds (Pitfall 2 — no undefined)", async () => {
    mockRows = [makeRow({ user_id: "known", project_id: "p", activity_count: BigInt(5) })];
    const result = await buildFeatureSnapshot({
      nodeIds: ["known::p", "ghost::missing"],
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      nodeId: "ghost::missing",
      role: "(no role)",
      project: "(unknown)",
      permTier: null,
      activityBucket: "None",
      signinBucket: ">90d",
      activityCountRaw: 0,
      lastSignInRel: "Never",
    });
  });

  it("surfaces firmName, accountStatus, permissionCoverage from mocked row", async () => {
    mockRows = [
      makeRow({
        user_id: "u1",
        project_id: "p1",
        firm_name: "ACME Corp",
        account_status: "active",
        permission_coverage: "known",
      }),
    ];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u1::p1"] });
    expect(f!.firmName).toBe("ACME Corp");
    expect(f!.accountStatus).toBe("active");
    expect(f!.permissionCoverage).toBe("known");
  });

  it("fallback for unknown nodeId yields permissionCoverage:'unknown', firmName:'', accountStatus:''", async () => {
    mockRows = [makeRow({ user_id: "known", project_id: "p", activity_count: BigInt(5) })];
    const result = await buildFeatureSnapshot({
      nodeIds: ["known::p", "ghost::missing"],
    });
    expect(result[1]).toMatchObject({
      nodeId: "ghost::missing",
      permissionCoverage: "unknown",
      firmName: "",
      accountStatus: "",
    });
  });

  it("pre-lowercases nameLower and emailLower for prefix matching", async () => {
    mockRows = [
      makeRow({
        user_id: "u",
        project_id: "p",
        full_name: "Luis Cortes",
        email: "Luis.ECortez@LECG.com",
      }),
    ];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.nameLower).toBe("luis cortes");
    expect(f!.emailLower).toBe("luis.ecortez@lecg.com");
  });
});

// ---- Affiliation derived from email (P1 internalDomains) ------------------

describe("affiliation derived from email domain", () => {
  it("hermosillo.com → internal, isExternal false", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", email: "a@hermosillo.com" })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.affiliation).toBe("internal");
    expect(f!.isExternal).toBe(false);
  });

  it("gmail.com → external, isExternal true", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", email: "a@gmail.com" })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.affiliation).toBe("external");
    expect(f!.isExternal).toBe(true);
  });

  it("malformed email → unknown, isExternal false (not auto-external)", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", email: "bademail" })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.affiliation).toBe("unknown");
    expect(f!.isExternal).toBe(false);
  });

  it("unknown nodeId fallback → affiliation 'unknown'", async () => {
    const result = await buildFeatureSnapshot({ nodeIds: ["ghost::missing"] });
    expect(result[0]!.affiliation).toBe("unknown");
    expect(result[0]!.isExternal).toBe(false);
  });
});

// ---- Helpers --------------------------------------------------------------

function makeRow(over: Partial<FakeRow> & { user_id: string; project_id: string }): FakeRow {
  return {
    user_id: over.user_id,
    project_id: over.project_id,
    full_name: over.full_name ?? "Test User",
    email: over.email ?? "test@lecg.com",
    project_name: over.project_name ?? "Project",
    role_display: over.role_display ?? "Member",
    perm_tier: over.perm_tier ?? null,
    is_external: over.is_external ?? false,
    activity_count: over.activity_count ?? BigInt(0),
    last_signin_days: over.last_signin_days ?? null,
    firm_name: over.firm_name ?? null,
    account_status: over.account_status ?? null,
    permission_coverage: over.permission_coverage ?? null,
  };
}
