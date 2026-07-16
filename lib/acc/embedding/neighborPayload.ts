/**
 * neighborPayload.ts — pure normalizer for AccInstanceEmbedding.neighbors Json.
 *
 * Phase 30 changed the stored payload SHAPE: old rows are a bare array
 * `[{nodeId, score}]`; new rows (pipeline v2) are
 * `{v: 2, matches: [{nodeId, score, why: string[]}], twins: {count, ids}}`.
 * Every consumer goes through `normalizeNeighborsPayload` so a stale row (or a
 * not-yet-rerun pipeline) renders gracefully instead of crashing the panel.
 * No DB / tRPC / React imports.
 */

export interface NeighborMatch {
  nodeId: string;
  score: number;
  /** Top contributing dimension keys (python-computed, <=3). Empty on old rows. */
  why: string[];
}

export interface NeighborTwins {
  /** Exact count of other nodes with a byte-identical hybrid vector. */
  count: number;
  /** Capped member nodeIds (<= pipeline TWIN_ID_CAP); count may exceed length. */
  ids: string[];
}

export interface NeighborsPayload {
  matches: NeighborMatch[];
  twins: NeighborTwins;
}

const EMPTY_TWINS: NeighborTwins = { count: 0, ids: [] };

function coerceMatch(raw: unknown): NeighborMatch | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as { nodeId?: unknown; score?: unknown; why?: unknown };
  if (typeof m.nodeId !== "string" || m.nodeId === "") return null;
  if (typeof m.score !== "number" || !Number.isFinite(m.score)) return null;
  const why = Array.isArray(m.why)
    ? m.why.filter((k): k is string => typeof k === "string")
    : [];
  return { nodeId: m.nodeId, score: m.score, why };
}

function coerceTwins(raw: unknown): NeighborTwins {
  if (typeof raw !== "object" || raw === null) return EMPTY_TWINS;
  const t = raw as { count?: unknown; ids?: unknown };
  const count =
    typeof t.count === "number" && Number.isFinite(t.count) && t.count > 0
      ? Math.floor(t.count)
      : 0;
  const ids = Array.isArray(t.ids)
    ? t.ids.filter((id): id is string => typeof id === "string" && id !== "")
    : [];
  return count === 0 && ids.length === 0 ? EMPTY_TWINS : { count, ids };
}

/**
 * Normalize any stored neighbors Json generation to the v2 payload:
 * - v2 object → coerced pass-through (malformed matches dropped);
 * - old bare array `[{nodeId, score}]` → matches with `why: []`, zero twins;
 * - null / garbage → empty payload. Never throws.
 */
export function normalizeNeighborsPayload(raw: unknown): NeighborsPayload {
  if (Array.isArray(raw)) {
    return {
      matches: raw.map(coerceMatch).filter((m): m is NeighborMatch => m !== null),
      twins: EMPTY_TWINS,
    };
  }
  if (typeof raw === "object" && raw !== null && Array.isArray((raw as { matches?: unknown }).matches)) {
    const p = raw as { matches: unknown[]; twins?: unknown };
    return {
      matches: p.matches.map(coerceMatch).filter((m): m is NeighborMatch => m !== null),
      twins: coerceTwins(p.twins),
    };
  }
  return { matches: [], twins: EMPTY_TWINS };
}
