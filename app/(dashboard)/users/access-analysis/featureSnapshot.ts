/**
 * featureSnapshot.ts — One-shot DuckDB read that builds NodeFeatureSnapshot[] for
 * the entire graph in cosmos index order. Held in a ref by GraphInteractions and
 * fed into usePredicateEngine on every filter/search/lasso/isolate change.
 *
 * RESEARCH Open Q#3 resolution: read once at mount, NOT via React Query — re-snapshot
 * only when sync data updates (rare). This avoids React re-render storms when chrome
 * (04-02) flips filter chips at high frequency.
 *
 * RESEARCH Pitfall 2: any BigInt from DuckDB (COUNT, BIGINT cols) is cast to Number
 * before storage — `BigInt + 0` throws inside the predicate engine.
 */

import { getDuckDbClient } from "./duckdbClient";
import { GRAPH_ANALYTICS_SOURCE_TABLES } from "./graphSql";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// ---- Bucketing helpers (RESEARCH Open Q#2 — defaults) ---------------------

/**
 * Activity bucket boundaries — None=0, Low=1–10, Med=11–100, High=101+.
 * Derived from Hermosillo distribution recommendation in RESEARCH.
 */
export function bucketActivity(count: number): NodeFeatureSnapshot["activityBucket"] {
  if (!Number.isFinite(count) || count <= 0) return "None";
  if (count <= 10) return "Low";
  if (count <= 100) return "Med";
  return "High";
}

/** Day-based bucket. Negative / null treated as ">90d" (unknown == far). */
export function bucketSignin(days: number | null): NodeFeatureSnapshot["signinBucket"] {
  if (days === null || !Number.isFinite(days)) return ">90d";
  if (days < 7) return "<7d";
  if (days < 30) return "<30d";
  if (days < 90) return "<90d";
  return ">90d";
}

/** Pre-format the relative last-sign-in string for the tooltip. */
function formatRel(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "Never";
  if (days <= 0) return "Today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ---- Row shape returned by the DuckDB SELECT ------------------------------

interface RawFeatureRow {
  user_id: string;
  project_id: string;
  full_name: string | null;
  email: string | null;
  project_name: string | null;
  role_display: string | null;
  perm_tier: string | null;
  // BigInt-prone columns — cast immediately on read (Pitfall 2)
  is_external: bigint | number | boolean | null;
  activity_count: bigint | number | null;
  last_signin_days: bigint | number | null;
}

// ---- Public API ------------------------------------------------------------

export interface BuildFeatureSnapshotOptions {
  /** Cosmos node ids in render order ("userId::projectId"). */
  nodeIds: readonly string[];
}

/**
 * Build a NodeFeatureSnapshot[] aligned to `nodeIds` (cosmos render order).
 *
 * Missing rows (unknown nodeIds) fall back to a safe "(unknown)" snapshot so the
 * predicate engine never sees `undefined` — RESEARCH Pitfall 2.
 */
export async function buildFeatureSnapshot(
  opts: BuildFeatureSnapshotOptions,
): Promise<NodeFeatureSnapshot[]> {
  const { nodeIds } = opts;
  const { connection } = await getDuckDbClient();

  const userProjectsView = GRAPH_ANALYTICS_SOURCE_TABLES.userProjects;
  const usersView = GRAPH_ANALYTICS_SOURCE_TABLES.users;
  const folderPermsView = GRAPH_ANALYTICS_SOURCE_TABLES.folderPermissions;

  // The view `graph_user_projects` columns are: user_id, email, project_id,
  // project_name, project_status, is_project_admin, role_id, module_ids.
  //
  // We DO NOT mutate the view. Instead, we COALESCE missing columns to safe
  // defaults (per PLAN action step #3) and LEFT JOIN graph_users for last_sign_in
  // + active_count, and graph_folder_permissions for permission tier.
  const sql = `
    SELECT
      up.user_id                                                         AS user_id,
      up.project_id                                                      AS project_id,
      COALESCE(u.name, up.email, up.user_id)                             AS full_name,
      COALESCE(up.email, u.email)                                        AS email,
      COALESCE(up.project_name, up.project_id)                           AS project_name,
      COALESCE(up.role_id, '(no role)')                                  AS role_display,
      ANY_VALUE(fp.perm_tier)                                            AS perm_tier,
      CASE
        WHEN LOWER(COALESCE(up.email, u.email, '')) LIKE '%@lecg.com'    THEN FALSE
        ELSE TRUE
      END                                                                AS is_external,
      COALESCE(MAX(u.active_count), 0)                                   AS activity_count,
      CASE
        WHEN MAX(u.last_sign_in) IS NULL THEN NULL
        ELSE CAST((epoch_ms(now()) - MAX(u.last_sign_in)) / 86400000 AS INTEGER)
      END                                                                AS last_signin_days
    FROM ${userProjectsView} up
    LEFT JOIN ${usersView} u ON u.user_id = up.user_id
    LEFT JOIN ${folderPermsView} fp ON fp.project_id = up.project_id AND fp.role_id = up.role_id
    GROUP BY up.user_id, up.project_id, u.name, up.email, u.email, up.project_name, up.role_id
  `;

  const result = await connection.query(sql);
  const rows = result.toArray() as RawFeatureRow[];

  // Build lookup keyed by "userId::projectId" — matches CosmosCanvasClient node-id convention.
  const map = new Map<string, NodeFeatureSnapshot>();
  for (const r of rows) {
    const userId = String(r.user_id);
    const projectId = String(r.project_id);
    const id = `${userId}::${projectId}`;
    const email = (r.email ?? "").toString();
    const fullName = (r.full_name ?? "").toString();
    // Pitfall 2 — BigInt to Number immediately
    const activityCount = Number(r.activity_count ?? 0);
    const signinDays =
      r.last_signin_days === null || r.last_signin_days === undefined
        ? null
        : Number(r.last_signin_days);
    const isExternal =
      typeof r.is_external === "boolean" ? r.is_external : Number(r.is_external ?? 1) !== 0;

    map.set(id, {
      nodeId: id,
      nameLower: fullName.toLowerCase(),
      emailLower: email.toLowerCase(),
      project: (r.project_name ?? "").toString() || projectId,
      role: (r.role_display ?? "(no role)").toString(),
      permTier: r.perm_tier === null || r.perm_tier === undefined ? null : String(r.perm_tier),
      isExternal,
      activityBucket: bucketActivity(activityCount),
      signinBucket: bucketSignin(signinDays),
      activityCountRaw: activityCount,
      lastSignInRel: formatRel(signinDays),
    });
  }

  // Fallback for unknown ids — keeps cosmos index alignment intact.
  const fallback = (id: string): NodeFeatureSnapshot => ({
    nodeId: id,
    nameLower: "",
    emailLower: "",
    project: "(unknown)",
    role: "(no role)",
    permTier: null,
    isExternal: false,
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
  });

  return nodeIds.map((id) => map.get(id) ?? fallback(id));
}
