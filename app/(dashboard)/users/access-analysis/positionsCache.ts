import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

/**
 * Cache-key namespace for the layout algorithm. Bump this whenever the meaning of
 * cached positions changes so stale entries are never reused.
 *
 * "feature-targets-v1": positions are now produced by volumetric feature-anchored
 * targets (featureTargets.ts) instead of the legacy all-zero "globe" targets.
 * Mixing this into every position hash invalidates the old globe positions.
 * "feature-targets-v2": Phase D positioning engine + perceptual slider-response calibration; invalidates v1 positions.
 */
export const LAYOUT_VERSION = "feature-targets-v2";

export interface PositionRow {
  node_id: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Stable, order-independent 32-bit FNV-1a-derived hex hash of a node id set.
 * Used as a cache key: when the set of (user, project) instance ids changes,
 * the cached positions are invalidated automatically.
 */
export function hashNodeSet(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  let h = 0x811c9dc5;
  // Namespace by layout version so stale globe positions never collide.
  for (let i = 0; i < LAYOUT_VERSION.length; i++) {
    h ^= LAYOUT_VERSION.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
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

export function packPositions(ids: readonly string[], xyz: Float32Array): PositionRow[] {
  if (xyz.length !== ids.length * 3) {
    throw new Error(`packPositions: xyz length ${xyz.length} != 3 * ids.length ${ids.length}`);
  }
  const rows: PositionRow[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    rows[i] = { node_id: ids[i], x: xyz[i * 3], y: xyz[i * 3 + 1], z: xyz[i * 3 + 2] };
  }
  return rows;
}

export function unpackPositions(
  rows: readonly PositionRow[],
  ids: readonly string[],
): Float32Array | null {
  const map = new Map<string, PositionRow>();
  for (const row of rows) map.set(row.node_id, row);
  const xyz = new Float32Array(ids.length * 3);
  for (let i = 0; i < ids.length; i++) {
    const row = map.get(ids[i]);
    if (!row) return null;
    xyz[i * 3] = row.x;
    xyz[i * 3 + 1] = row.y;
    xyz[i * 3 + 2] = row.z;
  }
  return xyz;
}

/**
 * Slider-aware cache key: FNV-1a over sorted node ids + quantized slider values.
 * Quantizes slider values to 2 decimal places before hashing to avoid cache
 * poisoning from float drift (Pitfall 4).
 *
 * Filter changes (alpha masks) do NOT invalidate the key — only slider/node changes do.
 */
export function hashNodeSetAndSliders(
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

  // Namespace by layout version so stale globe positions never collide.
  mix(LAYOUT_VERSION);
  mix("|");
  for (const id of sortedIds) mix(id);
  mix("|"); // domain separator between id-set and slider-set
  for (const k of sortedSliderKeys) {
    mix(k);
    // Quantize to 2 decimals: slider UI is 0..1 with 2dp sufficient (Pitfall 4)
    const q = Math.round((sliders[k] ?? 0) * 100) / 100;
    mix(q.toString());
  }

  return h.toString(16).padStart(8, "0");
}

// The cache stores one layout per slider hash, so the same node legitimately
// appears under many set_hash values. The uniqueness invariant is therefore the
// COMPOSITE (set_hash, node_id) — NOT node_id alone. A node_id-only primary key
// rejected the second slider state with a "Duplicate key violates primary key
// constraint" crash, freezing the physics pipeline on the first slider move.
// set_hash leads the key so `WHERE set_hash = ?` (load/delete) stays index-served.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS positions (
    node_id TEXT NOT NULL,
    set_hash TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL,
    z REAL NOT NULL,
    PRIMARY KEY (set_hash, node_id)
  );
  CREATE INDEX IF NOT EXISTS positions_set_hash_idx ON positions(set_hash);
`;

export async function ensurePositionsSchema(conn: AsyncDuckDBConnection): Promise<void> {
  for (const stmt of SCHEMA_SQL.split(";")) {
    const sql = stmt.trim();
    if (sql) await conn.query(sql);
  }
}

export async function loadCachedPositions(
  conn: AsyncDuckDBConnection,
  setHash: string,
  ids: readonly string[],
): Promise<Float32Array | null> {
  const result = await conn.query(
    `SELECT node_id, x, y, z FROM positions WHERE set_hash = '${setHash.replace(/'/g, "''")}'`,
  );
  const rows = result.toArray() as PositionRow[];
  if (rows.length !== ids.length) return null;
  return unpackPositions(rows, ids);
}

export async function savePositions(
  conn: AsyncDuckDBConnection,
  setHash: string,
  ids: readonly string[],
  xyz: Float32Array,
): Promise<void> {
  await conn.query(`DELETE FROM positions WHERE set_hash = '${setHash.replace(/'/g, "''")}'`);
  const rows = packPositions(ids, xyz);
  // Batch insert chunked to avoid exceeding the statement size limit.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = slice
      .map(
        (r) =>
          `('${r.node_id.replace(/'/g, "''")}', '${setHash}', ${r.x}, ${r.y}, ${r.z})`,
      )
      .join(",");
    await conn.query(
      `INSERT INTO positions (node_id, set_hash, x, y, z) VALUES ${values}`,
    );
  }
}
