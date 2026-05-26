import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  hashNodeSet,
  hashNodeSetAndSliders,
  packPositions,
  unpackPositions,
  ensurePositionsSchema,
  savePositions,
  loadCachedPositions,
  LAYOUT_VERSION,
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
  // Primary-key columns per table, parsed from the CREATE TABLE schema so the
  // mock enforces the SAME uniqueness real DuckDB-WASM does. This is what lets
  // these tests reproduce the "Duplicate key violates primary key constraint"
  // runtime crash without spinning up a real wasm connection.
  const primaryKeys: Record<string, string[]> = {};

  // Split on top-level commas only (ignores commas inside `PRIMARY KEY (a, b)`).
  function splitTopLevel(s: string): string[] {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  function parseValues(sql: string): Row[] {
    // Handles: INSERT INTO t (c1, c2, ...) VALUES (...),(...)
    const colMatch = sql.match(/INSERT INTO \w+ \(([^)]+)\)/i);
    if (!colMatch) return [];
    const cols = colMatch[1].split(",").map((c) => c.trim());

    const valuesSection = sql.slice(sql.toUpperCase().indexOf("VALUES") + 6).trimStart();
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
          // Extract column names + primary key from schema (paren-aware so a
          // table-level `PRIMARY KEY (a, b)` constraint is parsed correctly).
          const colDefs = s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"));
          const defs = splitTopLevel(colDefs)
            .map((d) => d.trim())
            .filter(Boolean);
          const cols: string[] = [];
          let pk: string[] = [];
          for (const def of defs) {
            const tableLevelPk = def.match(/^PRIMARY KEY\s*\(([^)]+)\)/i);
            if (tableLevelPk) {
              pk = tableLevelPk[1].split(",").map((c) => c.trim());
              continue;
            }
            const name = def.split(/\s+/)[0];
            cols.push(name);
            if (/PRIMARY KEY/i.test(def)) pk = [name];
          }
          columns[tbl] = cols;
          primaryKeys[tbl] = pk;
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
        const pk = primaryKeys[tbl] ?? [];
        for (const row of rows) {
          if (pk.length > 0) {
            const clash = tables[tbl].some((existing) =>
              pk.every((c) => existing[c] === row[c]),
            );
            if (clash) {
              const keyDesc = pk.map((c) => `${c}: ${row[c]}`).join(", ");
              throw new Error(
                `Constraint Error: Duplicate key "${keyDesc}" violates primary key constraint.`,
              );
            }
          }
          tables[tbl].push(row);
        }
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

// ---------------------------------------------------------------------------
// Layout-version namespacing — forces invalidation of stale "globe" positions
// written before featureTargets (all-zero-target) layouts existed.
// ---------------------------------------------------------------------------

/** Replica of the pre-version FNV-1a algorithm (no LAYOUT_VERSION mixed in). */
function versionlessHashAndSliders(
  ids: readonly string[],
  sliders: Readonly<Record<string, number>>,
): string {
  const sortedIds = [...ids].sort();
  const sortedSliderKeys = Object.keys(sliders).sort();
  let h = 0x811c9dc5;
  const mix = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x0a;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const id of sortedIds) mix(id);
  mix("|");
  for (const k of sortedSliderKeys) {
    mix(k);
    const q = Math.round((sliders[k] ?? 0) * 100) / 100;
    mix(q.toString());
  }
  return h.toString(16).padStart(8, "0");
}

/** Replica of the pre-version FNV-1a algorithm for hashNodeSet. */
function versionlessHashSet(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  let h = 0x811c9dc5;
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x0a;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

describe("layout-version cache namespacing", () => {
  it("exposes a non-empty LAYOUT_VERSION", () => {
    expect(typeof LAYOUT_VERSION).toBe("string");
    expect(LAYOUT_VERSION.length).toBeGreaterThan(0);
  });

  it("hashNodeSetAndSliders no longer collides with the pre-version key (stale globe positions invalidated)", () => {
    const ids = ["user1::proj1", "user2::proj2"];
    const sliders = { role: 0, project: 0 };
    expect(hashNodeSetAndSliders(ids, sliders)).not.toBe(
      versionlessHashAndSliders(ids, sliders),
    );
  });

  it("hashNodeSet no longer collides with the pre-version key", () => {
    const ids = ["user1::proj1", "user2::proj2"];
    expect(hashNodeSet(ids)).not.toBe(versionlessHashSet(ids));
  });
});

// ---------------------------------------------------------------------------
// Multi-layout cache: the table stores one position set per (set_hash, node_id).
// A node_id-only primary key prevented saving a second slider state for the same
// node set and caused the "Duplicate key ... violates primary key constraint"
// runtime crash on the first slider move. The real invariant is the COMPOSITE
// (set_hash, node_id): the same node legitimately has different positions under
// different slider hashes.
// ---------------------------------------------------------------------------
describe("multi-layout cache: one position row per (set_hash, node_id)", () => {
  const IDS = ["a", "b"];
  const XYZ_A = new Float32Array([1, 1, 1, 2, 2, 2]);
  const XYZ_B = new Float32Array([3, 3, 3, 4, 4, 4]);

  it("saves the same node set under two slider hashes without a duplicate-key error", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);

    await savePositions(conn, "hashA", IDS, XYZ_A);
    // Before the fix this rejects: node_ids "a"/"b" already exist under hashA and
    // the single-column PRIMARY KEY (node_id) rejects the second layout.
    await expect(savePositions(conn, "hashB", IDS, XYZ_B)).resolves.toBeUndefined();
  });

  it("keeps each hash's positions independently retrievable", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);
    await savePositions(conn, "hashA", IDS, XYZ_A);
    await savePositions(conn, "hashB", IDS, XYZ_B);

    const a = await loadCachedPositions(conn, "hashA", IDS);
    const b = await loadCachedPositions(conn, "hashB", IDS);
    expect(a && Array.from(a)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(b && Array.from(b)).toEqual([3, 3, 3, 4, 4, 4]);
  });

  it("replacing one hash does not delete another hash's positions", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);
    await savePositions(conn, "hashA", IDS, XYZ_A);
    await savePositions(conn, "hashB", IDS, XYZ_B);

    // Re-save (replace) hashB only.
    await savePositions(conn, "hashB", IDS, new Float32Array([9, 9, 9, 8, 8, 8]));

    const a = await loadCachedPositions(conn, "hashA", IDS);
    const b = await loadCachedPositions(conn, "hashB", IDS);
    expect(a && Array.from(a)).toEqual([1, 1, 1, 2, 2, 2]); // hashA untouched
    expect(b && Array.from(b)).toEqual([9, 9, 9, 8, 8, 8]); // hashB replaced
  });

  it("saving the same hash twice replaces only that hash (no row accumulation)", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);
    await savePositions(conn, "hashA", IDS, XYZ_A);
    await savePositions(conn, "hashA", IDS, new Float32Array([5, 5, 5, 6, 6, 6]));

    const a = await loadCachedPositions(conn, "hashA", IDS);
    expect(a && Array.from(a)).toEqual([5, 5, 5, 6, 6, 6]);
  });

  it("loadCachedPositions returns positions only for the requested set_hash", async () => {
    const conn = makeInMemoryConn();
    await ensurePositionsSchema(conn);
    await savePositions(conn, "hashA", IDS, XYZ_A);
    // hashB was never saved → cache miss (null), not a leak of hashA's positions.
    expect(await loadCachedPositions(conn, "hashB", IDS)).toBeNull();
  });
});
