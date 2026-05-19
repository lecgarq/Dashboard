// @vitest-environment jsdom
/**
 * selectionQueries.test.ts — Phase 4-02 Task 1 coverage:
 *   - empty selection returns [] without query
 *   - escapes single quotes in IDs (basic injection guard)
 *   - role aggregation maps result rows + BigInt→Number cast
 *   - tier aggregation empty-rows fallback to "(no tier data)" slice
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

interface FakeRow {
  label: string;
  value: number | bigint;
}

let mockRows: FakeRow[] = [];
let lastSql = "";
const mockConnection = {
  query: vi.fn(async (sql: string) => {
    lastSql = sql;
    return { toArray: () => mockRows };
  }),
};

vi.mock("../duckdbClient", () => ({
  getDuckDbClient: vi.fn(async () => ({ connection: mockConnection })),
}));

import { aggregateSelectionByRole, aggregateSelectionByTier } from "../selectionQueries";

beforeEach(() => {
  mockRows = [];
  lastSql = "";
  mockConnection.query.mockClear();
});

describe("aggregateSelectionByRole", () => {
  it("returns [] for empty input (no query issued)", async () => {
    const out = await aggregateSelectionByRole([]);
    expect(out).toEqual([]);
    expect(mockConnection.query).not.toHaveBeenCalled();
  });

  it("escapes single quotes and casts BigInt values to Number", async () => {
    mockRows = [
      { label: "admin", value: BigInt(5) },
      { label: "viewer", value: BigInt(2) },
    ];
    const out = await aggregateSelectionByRole([
      "a::p1",
      "b'::p2", // contains an apostrophe — must be escaped to ''
      "c::p3",
    ]);
    expect(mockConnection.query).toHaveBeenCalledTimes(1);
    expect(lastSql).toContain("'b''::p2'");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ label: "admin", value: 5 });
    expect(out[1]).toMatchObject({ label: "viewer", value: 2 });
    expect(typeof out[0].value).toBe("number");
  });
});

describe("aggregateSelectionByTier — empty fallback", () => {
  it("returns the '(no tier data)' fallback slice when underlying rows are empty", async () => {
    mockRows = [];
    const ids = ["x::p", "y::p", "z::p"];
    const out = await aggregateSelectionByTier(ids);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("(no tier data)");
    expect(out[0].value).toBe(ids.length);
  });

  it("returns the fallback when every row is the placeholder '(no tier)'", async () => {
    mockRows = [{ label: "(no tier)", value: 3 }];
    const out = await aggregateSelectionByTier(["x::p", "y::p", "z::p"]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("(no tier data)");
  });
});
