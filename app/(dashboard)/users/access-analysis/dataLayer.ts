/**
 * dataLayer.ts — Data ingestion, normalization, and DuckDB-WASM materialization.
 *
 * Produces one NormalizedNodeRow per (email, projectId) instance from BulkAccUser[].
 * Materializes the rows into a DuckDB `nodes` Arrow table for downstream queries.
 *
 * Imports: ONLY apache-arrow, duckdbClient, positionsCache, and type-only acc-types.
 * NO React, NO three, NO d3-force, NO react-force-graph.
 */
import { tableFromArrays } from "apache-arrow";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { getDuckDbClient } from "./duckdbClient";
import { ensurePositionsSchema } from "./positionsCache";
import { classifyAffiliation } from "./internalDomains";

/**
 * One row per (email, projectId) instance — the fundamental unit of the graph.
 * Normalized columns (activityNorm, recencyNorm) are pre-computed here so the
 * math layer can read plain numbers without re-normalizing.
 */
export interface NormalizedNodeRow {
  /** Stable composite id: `${email.toLowerCase()}|${projectId}` */
  id: string;
  /** Lowercased email */
  email: string;
  projectId: string;
  /** Raw activity count from BulkAccUser.activeCount */
  activityRaw: number;
  /** log1p(activityRaw) → min-max scaled to [0, 1] across all rows */
  activityNorm: number;
  /** 1 - min(ageDays / 90, 1); null lastSignIn → 0 (fully cold) */
  recencyNorm: number;
  /** 1 if project-level admin, else 0 */
  isAdmin: number;
  /** 1 if affiliation is "external"; 0 for internal OR unknown (P1 — see internalDomains.ts) */
  isExternal: number;
  /** Deduped, non-empty role ids for this (user, project) */
  roleIds: string[];
  /**
   * Per-module uniform weight: 1 / modules.length.
   * TODO: Replace with activity_in_module / total_activity once DC CSV join is
   * wired (RESEARCH Open Question #1). Blocked on per-module activity source.
   */
  moduleWeights: Map<string, number>;
  /** Folder permission tier from GraphFolderPermissionRow; null in Phase 1 (joined later) */
  permTier: string | null;
}

/**
 * Normalize a BulkAccUser[] into one NormalizedNodeRow per (user, project).
 *
 * Activity normalization: log1p(activeCount) → min-max across all rows.
 * Recency normalization: 1 - min(ageDays/90, 1); null lastSignIn → 0.
 * isExternal: 1 when classifyAffiliation(email) === "external"; internal and
 * unknown (missing/malformed email) both map to 0 (P1 — see internalDomains.ts).
 */
export function normalize(users: BulkAccUser[]): NormalizedNodeRow[] {
  const now = Date.now();

  // Pre-scan: compute log1p of activeCount for each (user, project) pair.
  // All projects for a user share the same activeCount in Phase 1 (no per-project counts yet).
  const allLogged: number[] = [];
  for (const u of users) {
    const lv = Math.log1p(Math.max(0, u.activeCount));
    for (let i = 0; i < u.projects.length; i++) {
      allLogged.push(lv);
    }
  }

  const lmin = allLogged.length > 0 ? Math.min(...allLogged) : 0;
  const lmax = allLogged.length > 0 ? Math.max(...allLogged) : 0;
  // Guard divide-by-zero on degenerate datasets (all same activity, single row, etc.)
  const span = (lmax - lmin) || 1;

  const rows: NormalizedNodeRow[] = [];
  for (const u of users) {
    const emailLower = u.email.toLowerCase();
    const isExternal = classifyAffiliation(emailLower) === "external" ? 1 : 0;

    const lastSignIn = u.lastSignIn ?? null;
    const ageDays = lastSignIn
      ? (now - Date.parse(lastSignIn)) / 86_400_000
      : Number.POSITIVE_INFINITY;
    const recencyNorm = 1 - Math.min(ageDays / 90, 1);

    const lv = Math.log1p(Math.max(0, u.activeCount));
    const activityNorm = (lv - lmin) / span;

    for (const p of u.projects) {
      rows.push({
        id: `${emailLower}|${p.id}`,
        email: emailLower,
        projectId: p.id,
        activityRaw: u.activeCount,
        activityNorm,
        recencyNorm,
        isAdmin: p.isAdmin ? 1 : 0,
        isExternal,
        roleIds: [...new Set(p.roles.filter(Boolean))],
        moduleWeights: weightsFromModules(p.modules),
        permTier: null, // Joined later from GraphFolderPermissionRow (Phase 2+)
      });
    }
  }

  return rows;
}

/**
 * Build uniform module weights: 1 / modules.length per module.
 *
 * TODO: Replace with per-module activity fraction once DC CSV join is wired
 * (RESEARCH Open Question #1). Current implementation is a correct placeholder.
 */
function weightsFromModules(modules: string[]): Map<string, number> {
  if (modules.length === 0) return new Map();
  const w = 1 / modules.length;
  return new Map(modules.map((m) => [m, w]));
}

/**
 * Materialize NormalizedNodeRow[] into a DuckDB-WASM `nodes` Arrow table.
 *
 * Uses typed arrays for efficient Arrow column inference (Pitfall 1).
 * Always drops the table first to ensure idempotency (Pitfall 5).
 * Bootstraps the positions schema after table creation.
 *
 * NOTE: getDuckDbClient() throws if called outside a browser runtime.
 * Tests must use // @vitest-environment jsdom and mock getDuckDbClient,
 * or use a stub connection (Pitfall 3).
 */
export async function materializeNodes(rows: NormalizedNodeRow[]): Promise<void> {
  const table = tableFromArrays({
    node_id: rows.map((r) => r.id),
    email: rows.map((r) => r.email),
    project_id: rows.map((r) => r.projectId),
    // Typed arrays → Arrow infers correct column types (Pitfall 1)
    activity_raw: Int32Array.from(rows.map((r) => r.activityRaw)),
    activity_norm: Float32Array.from(rows.map((r) => r.activityNorm)),
    recency_norm: Float32Array.from(rows.map((r) => r.recencyNorm)),
    is_admin: Uint8Array.from(rows.map((r) => r.isAdmin)),
    is_external: Uint8Array.from(rows.map((r) => r.isExternal)),
    // Arrow LIST<UTF8> typing is fussy — pipe-join keeps the column scalar
    role_ids: rows.map((r) => r.roleIds.join("|")),
    module_weights_json: rows.map((r) => JSON.stringify(Object.fromEntries(r.moduleWeights))),
    perm_tier: rows.map((r) => r.permTier ?? ""),
  });

  const { connection } = await getDuckDbClient();
  // Drop first: insertArrowTable appends without this (Pitfall 5)
  await connection.query("DROP TABLE IF EXISTS nodes");
  await connection.insertArrowTable(table, { name: "nodes" });
  await ensurePositionsSchema(connection);
}
