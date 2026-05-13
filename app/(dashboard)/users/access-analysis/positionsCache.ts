import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

export interface PositionRow {
  node_id: string;
  x: number;
  y: number;
}

/**
 * Stable, order-independent 32-bit FNV-1a-derived hex hash of a node id set.
 * Used as a cache key: when the set of (user, project) instance ids changes,
 * the cached positions are invalidated automatically.
 */
export function hashNodeSet(ids: readonly string[]): string {
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

export function packPositions(ids: readonly string[], xy: Float32Array): PositionRow[] {
  if (xy.length !== ids.length * 2) {
    throw new Error(`packPositions: xy length ${xy.length} != 2 * ids.length ${ids.length}`);
  }
  const rows: PositionRow[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    rows[i] = { node_id: ids[i], x: xy[i * 2], y: xy[i * 2 + 1] };
  }
  return rows;
}

export function unpackPositions(
  rows: readonly PositionRow[],
  ids: readonly string[],
): Float32Array | null {
  const map = new Map<string, PositionRow>();
  for (const row of rows) map.set(row.node_id, row);
  const xy = new Float32Array(ids.length * 2);
  for (let i = 0; i < ids.length; i++) {
    const row = map.get(ids[i]);
    if (!row) return null;
    xy[i * 2] = row.x;
    xy[i * 2 + 1] = row.y;
  }
  return xy;
}

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS positions (
    node_id TEXT PRIMARY KEY,
    set_hash TEXT NOT NULL,
    x REAL NOT NULL,
    y REAL NOT NULL
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
    `SELECT node_id, x, y FROM positions WHERE set_hash = '${setHash.replace(/'/g, "''")}'`,
  );
  const rows = result.toArray() as PositionRow[];
  if (rows.length !== ids.length) return null;
  return unpackPositions(rows, ids);
}

export async function savePositions(
  conn: AsyncDuckDBConnection,
  setHash: string,
  ids: readonly string[],
  xy: Float32Array,
): Promise<void> {
  await conn.query(`DELETE FROM positions WHERE set_hash = '${setHash.replace(/'/g, "''")}'`);
  const rows = packPositions(ids, xy);
  // Batch insert chunked to avoid exceeding the statement size limit.
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = slice
      .map(
        (r) =>
          `('${r.node_id.replace(/'/g, "''")}', '${setHash}', ${r.x}, ${r.y})`,
      )
      .join(",");
    await conn.query(
      `INSERT INTO positions (node_id, set_hash, x, y) VALUES ${values}`,
    );
  }
}
