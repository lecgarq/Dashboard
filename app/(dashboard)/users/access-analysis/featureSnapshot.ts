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
import { classifyAffiliation } from "./internalDomains";
import { BASELINE_MODULES } from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { deriveModuleFlags } from "./moduleFlags";
import { computeRiskFlags, riskScoreFromFlags } from "./riskFlags";

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

/** Membership tenure bucket from age in days. null → "unknown". */
export function bucketMembership(days: number | null): NodeFeatureSnapshot["membershipBucket"] {
  if (days === null || !Number.isFinite(days)) return "unknown";
  if (days < 30) return "<30d";
  if (days < 90) return "<90d";
  if (days < 365) return "<1y";
  return ">1y";
}

/** Six-way recency bucket from days since last activity/sign-in. null → "none". */
export function bucketRecency(days: number | null): NodeFeatureSnapshot["activityRecencyBucket"] {
  if (days === null || !Number.isFinite(days)) return "none";
  if (days <= 7) return "0-7d";
  if (days <= 14) return "8-14d";
  if (days <= 30) return "15-30d";
  if (days <= 60) return "31-60d";
  return "60d+";
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

/**
 * Parse the pipe-delimited `module_ids` column into a node's module SIGNATURE:
 * non-baseline product keys only (baselines are near-universal → no signal),
 * trimmed, deduped, sorted for deterministic output. See discovery §3.
 */
export function parseModuleSignature(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const baseline = new Set(BASELINE_MODULES);
  const out = new Set<string>();
  for (const part of raw.split("|")) {
    const key = part.trim();
    if (key !== "" && !baseline.has(key)) out.add(key);
  }
  return Array.from(out).sort();
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
  activity_count: bigint | number | null;
  last_signin_days: bigint | number | null;
  firm_name: string | null;
  account_status: string | null;
  permission_coverage: string | null;
  is_project_admin: boolean | number | null;
  module_ids: string | null;
  added_on: bigint | number | null;
  last_sign_in_instance: bigint | number | null;
  perm_strength: bigint | number | null;
  folder_breadth: bigint | number | null;
  accessible_data_bytes: bigint | number | null;
  full_controller: boolean | number | null;
  perm_mixed: boolean | number | null;
  activity_mix_json: string | null;
  activity_actions_json: string | null;
  activity_total: bigint | number | null;
  last_activity: bigint | number | null;
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
      -- Affiliation (internal/external/unknown) is derived in JS from 'email'
      -- via internalDomains.classifyAffiliation — not in SQL — so the rule lives
      -- in one place and unknown/malformed emails are not mislabeled external.
      COALESCE(MAX(u.active_count), 0)                                   AS activity_count,
      CASE
        WHEN MAX(u.last_sign_in) IS NULL THEN NULL
        ELSE CAST((epoch_ms(now()) - MAX(u.last_sign_in)) / 86400000 AS INTEGER)
      END                                                                AS last_signin_days,
      COALESCE(ANY_VALUE(u.firm_name), '')                               AS firm_name,
      COALESCE(ANY_VALUE(u.account_status), '')                          AS account_status,
      COALESCE(ANY_VALUE(u.permission_coverage), 'unknown')              AS permission_coverage,
      COALESCE(ANY_VALUE(up.is_project_admin), FALSE)                    AS is_project_admin,
      COALESCE(ANY_VALUE(up.module_ids), '')                            AS module_ids,
      ANY_VALUE(up.added_on)                                            AS added_on,
      ANY_VALUE(up.last_sign_in_instance)                               AS last_sign_in_instance,
      COALESCE(ANY_VALUE(up.perm_strength), 0)                          AS perm_strength,
      COALESCE(ANY_VALUE(up.folder_breadth), 0)                         AS folder_breadth,
      COALESCE(ANY_VALUE(up.accessible_data_bytes), 0)                  AS accessible_data_bytes,
      COALESCE(ANY_VALUE(up.full_controller), FALSE)                    AS full_controller,
      COALESCE(ANY_VALUE(up.perm_mixed), FALSE)                         AS perm_mixed,
      ANY_VALUE(up.activity_mix_json)                                   AS activity_mix_json,
      ANY_VALUE(up.activity_actions_json)                              AS activity_actions_json,
      COALESCE(ANY_VALUE(up.activity_total), 0)                         AS activity_total,
      ANY_VALUE(up.last_activity)                                       AS last_activity
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
    // Affiliation derived from email domain (internalDomains.ts). unknown -> not
    // external for P1 (isExternal stays a boolean; 3-way weighting is a later phase).
    const affiliation = classifyAffiliation(email);
    const isExternal = affiliation === "external";

    const permissionStrength = Number(r.perm_strength ?? 0);
    const folderBreadth = Number(r.folder_breadth ?? 0);
    const accessibleDataBytes = Number(r.accessible_data_bytes ?? 0);
    const activityMix = (() => {
      try { return r.activity_mix_json ? JSON.parse(r.activity_mix_json) : {}; }
      catch { return {}; }
    })();
    const actionCounts = (() => {
      try { return r.activity_actions_json ? JSON.parse(r.activity_actions_json) : {}; }
      catch { return {}; }
    })();
    const activityTotal = Number(r.activity_total ?? 0);
    const lastActivityMs =
      r.last_activity === null || r.last_activity === undefined ? null : Number(r.last_activity);
    const lastActivityDays =
      lastActivityMs === null ? null : Math.floor((Date.now() - lastActivityMs) / 86_400_000);
    const riskFlags = computeRiskFlags({
      isExternal,
      isAdmin: Boolean(r.is_project_admin),
      signinBucket: bucketSignin(signinDays),
      accountStatus: String(r.account_status ?? ""),
      // hasAccess: instance is in the feed → it is a real membership.
      hasAccess: true,
      permissionStrength,
      folderBreadth,
      activityTotal,
    });

    const addedOnMs =
      r.added_on === null || r.added_on === undefined ? null : Number(r.added_on);
    const membershipAgeDays =
      addedOnMs === null ? null : Math.floor((Date.now() - addedOnMs) / 86_400_000);
    const instanceSigninMs =
      r.last_sign_in_instance === null || r.last_sign_in_instance === undefined
        ? null
        : Number(r.last_sign_in_instance);
    const instanceRecencyDays =
      instanceSigninMs === null ? null : Math.floor((Date.now() - instanceSigninMs) / 86_400_000);

    map.set(id, {
      nodeId: id,
      nameLower: fullName.toLowerCase(),
      emailLower: email.toLowerCase(),
      userName: fullName || email || userId,
      project: (r.project_name ?? "").toString() || projectId,
      role: (r.role_display ?? "(no role)").toString(),
      permTier: r.perm_tier === null || r.perm_tier === undefined ? null : String(r.perm_tier),
      isExternal,
      affiliation,
      activityBucket: bucketActivity(activityCount),
      signinBucket: bucketSignin(signinDays),
      activityCountRaw: activityCount,
      lastSignInRel: formatRel(signinDays),
      permissionCoverage: (r.permission_coverage as NodeFeatureSnapshot["permissionCoverage"]) ?? "unknown",
      firmName: String(r.firm_name ?? ""),
      accountStatus: String(r.account_status ?? ""),
      isAdmin: Boolean(r.is_project_admin),
      moduleSignature: parseModuleSignature(r.module_ids),
      moduleFlags: deriveModuleFlags(parseModuleSignature(r.module_ids)),
      riskFlags,
      riskScore: riskScoreFromFlags(riskFlags),
      membershipAgeDays,
      membershipBucket: bucketMembership(membershipAgeDays),
      // P5-C: TRUE last-activity recency overrides the P5-B sign-in proxy when present.
      activityRecencyBucket: lastActivityMs !== null
        ? bucketRecency(lastActivityDays)
        : bucketRecency(instanceRecencyDays),
      activityMix,
      actionCounts,
      activityTotal,
      permissionStrength,
      accessibleDataBytes,
      permissionTypeSummary: {
        folderBreadth,
        coverage: (r.permission_coverage as NodeFeatureSnapshot["permissionCoverage"]) ?? "unknown",
        mixedProfile: Boolean(r.perm_mixed),
        fullController: Boolean(r.full_controller),
      },
    });
  }

  // Fallback for unknown ids — keeps cosmos index alignment intact.
  const fallback = (id: string): NodeFeatureSnapshot => ({
    nodeId: id,
    nameLower: "",
    emailLower: "",
    userName: id.split("::")[0] || id,
    project: "(unknown)",
    role: "(no role)",
    permTier: null,
    isExternal: false,
    affiliation: "unknown",
    activityBucket: "None",
    signinBucket: ">90d",
    activityCountRaw: 0,
    lastSignInRel: "Never",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "",
    isAdmin: false,
    moduleSignature: [],
    moduleFlags: deriveModuleFlags([]),
    riskFlags: computeRiskFlags({
      isExternal: false, isAdmin: false, signinBucket: ">90d",
      accountStatus: "", hasAccess: false,
      permissionStrength: 0, folderBreadth: 0, activityTotal: 0,
    }),
    riskScore: 0,
    membershipAgeDays: null,
    membershipBucket: "unknown",
    activityRecencyBucket: "none",
    permissionStrength: 0,
    accessibleDataBytes: 0,
    permissionTypeSummary: { folderBreadth: 0, coverage: "unknown", mixedProfile: false, fullController: false },
    activityMix: {},
    actionCounts: {},
    activityTotal: 0,
  });

  return nodeIds.map((id) => map.get(id) ?? fallback(id));
}
