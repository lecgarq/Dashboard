import "server-only";
import { db } from "@/server/db";

/**
 * Users by strongest folder-permission level (owner request 2026-07-13:
 * "donut graph of how many users we have for type of permissions").
 *
 * A user usually holds many role×folder grants across projects, so an
 * exclusive donut needs one bucket per user: their STRONGEST stored
 * `permType`, ranked by the same strongest→weakest vocabulary as
 * `permissionLevelCounts.PERMISSION_LEVEL_ORDER`. Any stored permType outside
 * that vocabulary ranks 0 and surfaces as "Unrecognized" — honest passthrough,
 * never dropped or silently remapped.
 *
 * Sourced from `AccFolderPermissionSummary` (the Ph18/19 22k-row projection,
 * cron-refreshed), NOT the ~6M-row `AccFolderPermission` table: the identical
 * user counts were live-verified 2026-07-13 at 30ms vs 7s. Join semantics:
 * user→role per project (`AccDcProjectUserRole`) → that role's distinct
 * permTypes in the same project (`unnest(s."permTypes")`).
 */
export interface PermissionUserTier {
  /** Stored permType label (or "Unrecognized" for out-of-vocabulary values). */
  permType: string;
  /** Distinct users whose STRONGEST grant is this level. */
  users: number;
}

export interface PermissionUserCounts {
  /** Present tiers only, ordered strongest → weakest. */
  tiers: PermissionUserTier[];
  /** Sum over tiers — users with at least one recorded folder permission. */
  usersWithGrants: number;
  /** Distinct users holding any role assignment (the donut's honest denominator). */
  usersWithRoles: number;
  /** All DC snapshot users, for the coverage caption. */
  totalDcUsers: number;
}

/** Rank (SQL CASE value) → display label, strongest first. Index = rank. */
const RANK_LABELS: readonly string[] = [
  "Unrecognized",
  "View Only",
  "Upload Only",
  "View+Download",
  "View+Download+Upload",
  "View+Download+Upload+Edit",
  "Full Controller",
];

interface RawTierRow {
  strongest: number;
  users: number;
}

/**
 * Pure assembly — exported for the sibling `.test.ts` (no DB). Maps rank rows
 * to labeled tiers ordered strongest→weakest and computes the caption totals.
 */
export function assemblePermissionUserCounts(
  aggRows: ReadonlyArray<RawTierRow>,
  usersWithRoles: number,
  totalDcUsers: number,
): PermissionUserCounts {
  const tiers = [...aggRows]
    .sort((a, b) => b.strongest - a.strongest)
    .map((r) => ({
      permType: RANK_LABELS[r.strongest] ?? "Unrecognized",
      users: r.users,
    }));
  return {
    tiers,
    usersWithGrants: tiers.reduce((sum, t) => sum + t.users, 0),
    usersWithRoles,
    totalDcUsers,
  };
}

let cache: { at: number; counts: PermissionUserCounts } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Loads the users-by-strongest-permission-level aggregate with the standard
 * sibling 5-minute in-process cache (mirrors `loadPermissionLevel`). Pass
 * `force: true` to bypass the cache.
 */
export async function loadPermissionUserCounts(force = false): Promise<PermissionUserCounts> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.counts;

  const [aggRows, roleUserRow, dcUserRow] = await Promise.all([
    db.$queryRaw<RawTierRow[]>`
      WITH ranked AS (
        SELECT pur."userId",
               MAX(CASE pt
                 WHEN 'Full Controller' THEN 6
                 WHEN 'View+Download+Upload+Edit' THEN 5
                 WHEN 'View+Download+Upload' THEN 4
                 WHEN 'View+Download' THEN 3
                 WHEN 'Upload Only' THEN 2
                 WHEN 'View Only' THEN 1
                 ELSE 0 END) AS strongest
        FROM "AccDcProjectUserRole" pur
        JOIN "AccFolderPermissionSummary" s
          ON s."roleId" = pur."roleId" AND s."projectId" = pur."projectId"
        CROSS JOIN LATERAL unnest(s."permTypes") AS pt
        GROUP BY pur."userId"
      )
      SELECT strongest::int AS strongest, COUNT(*)::int AS users
      FROM ranked
      GROUP BY strongest
    `,
    db.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(DISTINCT "userId")::int AS n FROM "AccDcProjectUserRole"
    `,
    db.$queryRaw<Array<{ n: number }>>`
      SELECT COUNT(*)::int AS n FROM "AccDcUser"
    `,
  ]);

  const counts = assemblePermissionUserCounts(
    aggRows,
    roleUserRow[0]?.n ?? 0,
    dcUserRow[0]?.n ?? 0,
  );
  cache = { at: Date.now(), counts };
  return counts;
}
