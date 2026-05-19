import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  hashNodeSet,
  hashNodeSetAndSliders,
  packPositions,
  unpackPositions,
  ensurePositionsSchema,
  savePositions,
  loadCachedPositions,
} from "./positionsCache";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

// ---------------------------------------------------------------------------
// Minimal in-memory DuckDB connection mock
// Supports: CREATE TABLE, CREATE INDEX, INSERT INTO, DELETE FROM, SELECT
// with enough fidelity to test positionsCache save/load roundtrips.
// ---------------------------------------------------------------------------
function makeInMemoryConn(): AsyncDuckDBConnection {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {};
  const columns: Record<string, string[]> = {};

  function parseValues(sql: string): Row[] {
    // Handles: INSERT INTO t (c1, c2, ...) VALUES (...),(...)
    const colMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/i);
    if (!colMatch) return [];
    const cols = colMatch[1].split(",").map((c) => c.trim());

    const valuesSection = sql.replace(/^.*?VALUES\s*/si, "");
    const rowMatches = [...valuesSection.matchAll(/\(([^)]+)\)/g)];
    return rowMatches.map((m) => {
      const parts = m[1].split(",").map((s) => s.trim().replace(/^'(.*)'$/, "$1"));
      const row: Row = {};
      cols.forEach((c, i) => {
        const raw = parts[i];
        row[c] = isNaN(Number(raw)) ? raw : Number(raw);
      });
      return row;
    });
  }

  const conn = {
    query: vi.fn(async (sql: string) => {
      const s = sql.trim();

      if (/^CREATE TABLE IF NOT EXISTS (\w+)/i.test(s)) {
        const m = s.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i)!;
        const tbl = m[1];
        if (!tables[tbl]) {
          tables[tbl] = [];
          // Extract column names from schema
          const colDefs = s.match(/\(([^;]+)\)/s)?.[1] ?? "";
          columns[tbl] = colDefs
            .split(",")
            .map((def) => def.trim().split(/\s+/)[0])
            .filter(Boolean);
        }
        return { toArray: () => [] };
      }

      if (/^CREATE INDEX/i.test(s)) {
        return { toArray: () => [] };
      }

      if (/^INSERT INTO (\w+)/i.test(s)) {
        const m = s.match(/^INSERT INTO (\w+)/i)!;
        const tbl = m[1];
        if (!tables[tbl]) tables[tbl] = [];
        const rows = parseValues(s);
        tables[tbl].push(...rows);
        return { toArray: () => [] };
      }

      if (/^DELETE FROM (\w+)/i.test(s)) {
        const m = s.match(/^DELETE FROM (\w+) WHERE set_hash = '([^']+)'/i);
        if (m) {
          const tbl = m[1];
          const hash = m[2];
          if (tables[tbl]) {
            tables[tbl] = tables[tbl].filter((r) => r["set_hash"] !== hash);
          }
        }
        return { toArray: () => [] };
      }

      if (/^SELECT .* FROM (\w+) WHERE set_hash = '([^']+)'/i.test(s)) {
        const m = s.match(/FROM (\w+) WHERE set_hash = '([^']+)'/i)!;
        const tbl = m[1];
        const hash = m[2];
        const rows = (tables[tbl] ?? []).filter((r) => r["set_hash"] === hash);
        return { toArray: () => rows };
      }

      return { toArray: () => [] };
    }),
  } as unknown as AsyncDuckDBConnection;

  return conn;
}

describe("hashNodeSet", () => {
  it("is order-independent", () => {
    expect(hashNodeSet(["a", "b", "c"])).toEqual(hashNodeSet(["c", "a", "b"]));
  });
  it("differs when the set differs by one element", () => {
    expect(hashNodeSet(["a", "b", "c"])).not.toEqual(hashNodeSet(["a", "b", "d"]));
  });
  it("is stable across calls (deterministic)", () => {
    const h1 = hashNodeSet(["foo", "bar"]);
    const h2 = hashNodeSet(["foo", "bar"]);
    expect(h1).toBe(h2);
  });
});

describe("packPositions / unpackPositions (xyz triples)", () => {
  it("round-trips a Float32Array of (x, y, z) triples", () => {
    const ids = ["a", "b", "c"];
    const xyz = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rows = packPositions(ids, xyz);
    expect(rows).toEqual([
      { node_id: "a", x: 1, y: 2, z: 3 },
      { node_id: "b", x: 4, y: 5, z: 6 },
      { node_id: "c", x: 7, y: 8, z: 9 },
    ]);

    const back = unpackPositions(rows, ids);
    expect(back).not.toBeNull();
    expect(Array.from(back!)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("handles rows in a different order than ids", () => {
    const rows = [
      { node_id: "b", x: 3, y: 4, z: 5 },
      { node_id: "a", x: 1, y: 2, z: 0 },
    ];
    const xyz = unpackPositions(rows, ["a", "b"]);
    expect(xyz).not.toBeNull();
    expect(Array.from(xyz!)).toEqual([1, 2, 0, 3, 4, 5]);
  });

  it("returns null when a required id is missing from rows", () => {
    const rows = [{ node_id: "a", x: 1, y: 2, z: 0 }];
    expect(unpackPositions(rows, ["a", "b"])).toBeNull();
  });
});

describe("z column DuckDB roundtrip (via in-memory mock)", () => {
  it("persists z and reads back bit-exact via Float32 typed arrays", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);

    const ids = ["node1", "node2"];
    const xyz = new Float32Array([1, 2, 3, 4, 5, 6]);
    const hash = "testhash01";

    await savePositions(conn, hash, ids, xyz);
    const result = await loadCachedPositions(conn, hash, ids);

    expect(result).not.toBeNull();
    expect(result![0]).toBeCloseTo(1, 5);
    expect(result![1]).toBeCloseTo(2, 5);
    expect(result![2]).toBeCloseTo(3, 5); // z=3 roundtrips
    expect(result![3]).toBeCloseTo(4, 5);
    expect(result![4]).toBeCloseTo(5, 5);
    expect(result![5]).toBeCloseTo(6, 5); // z=6 roundtrips
  });

  it("z = 0 roundtrips correctly (physics z-seed default)", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);

    const ids = ["n1"];
    const xyz = new Float32Array([10, 20, 0]);
    const hash = "testhash02";

    await savePositions(conn, hash, ids, xyz);
    const result = await loadCachedPositions(conn, hash, ids);

    expect(result).not.toBeNull();
    expect(result![2]).toBe(0); // z must be exactly 0, not NaN
  });
});

describe("hashNodeSetAndSliders", () => {
  it("is deterministic: same inputs produce same hash", () => {
    const ids = ["a", "b", "c"];
    const sliders = { activity: 0.5, recency: 0.3 };
    expect(hashNodeSetAndSliders(ids, sliders)).toBe(hashNodeSetAndSliders(ids, sliders));
  });

  it("is order-independent on ids: ['b','a'] and ['a','b'] produce same hash with same sliders", () => {
    const sliders = { activity: 0.5 };
    expect(hashNodeSetAndSliders(["b", "a"], sliders)).toBe(
      hashNodeSetAndSliders(["a", "b"], sliders),
    );
  });

  it("slider quantization: 0.3 and 0.30000000000000004 produce same hash (Pitfall 4)", () => {
    const ids = ["x"];
    expect(hashNodeSetAndSliders(ids, { a: 0.3 })).toBe(
      hashNodeSetAndSliders(ids, { a: 0.30000000000000004 }),
    );
  });

  it("different sliders produce different hashes: {a: 0.3} vs {a: 0.5}", () => {
    const ids = ["x"];
    expect(hashNodeSetAndSliders(ids, { a: 0.3 })).not.toBe(
      hashNodeSetAndSliders(ids, { a: 0.5 }),
    );
  });

  it("filter-change invariance: same ids + same sliders → same hash regardless of external filter state", () => {
    const ids = ["user1|proj1", "user2|proj2"];
    const sliders = { activity: 0.5, recency: 0.0 };

    // Filter changes (alpha masks) do NOT affect the hash — only sliders and node ids do.
    const k1 = hashNodeSetAndSliders(ids, sliders);
    const k2 = hashNodeSetAndSliders(ids, sliders);

    expect(k2).toBe(k1);
  });
});
