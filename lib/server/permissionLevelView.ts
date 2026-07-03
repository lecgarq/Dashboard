import "server-only";
import { db } from "@/server/db";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

/**
 * Permission volume by level, per role (PERM-01 reframe — owner UAT item 3,
 * verbatim: "which role has the most admin permissions out of all"). Counts
 * `AccFolderPermission` rows grouped by (project, role, permType), using the
 * STORED `permType` string verbatim — never remapped through
 * `lib/acc/permissionMapping.ts`'s `PermTier` vocabulary (research Pitfall 1:
 * the 6 live stored values do not match PermTier's labels).
 *
 * This is its own bounded `$queryRaw` GROUP BY, NOT routed through
 * `lib/server/folderPermQuery.ts`'s `loadFolderPermRows` — that module's header
 * explicitly forbids single-use additions and returns per-folder rows (not
 * pre-aggregated by permType), which would require re-deriving the same
 * GROUP BY client-side. This aggregate GROUPs BY at the DB layer instead
 * (bounded 60,110-row output, live-verified), same "different consumer"
 * precedent as the Ph18 backfill script noted in STATE.md.
 *
 * `folderCount` comes from `COUNT(*)::int` in Postgres — already a plain JS
 * number by the time Prisma returns it, so no BigInt ever crosses this
 * module's boundary (unlike `permissionFootprintView.ts`'s `totalBytes`).
 */
export interface PermissionLevelRow {
  projectId: string;
  projectName: string;
  roleId: string;
  roleName: string;
  permType: string;
  folderCount: number;
}

interface RawPermissionLevelRow {
  projectId: string;
  roleId: string;
  permType: string;
  folderCount: number;
}

let cache: { at: number; rows: PermissionLevelRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Pure assembly — exported for the sibling `.test.ts` (no DB). Resolves project
 * names via the shared `buildProjectNameMap`/`resolveProjectName` precedence
 * (AccProject authoritative over AccDcProject) and role names via a roleId map,
 * falling back to "Unknown role"/"Unknown project". `permType` passes through
 * VERBATIM — including any value not in the known 6-member vocabulary, which is
 * kept rather than dropped or remapped (honest passthrough).
 */
export function assemblePermissionLevel(
  aggRows: ReadonlyArray<RawPermissionLevelRow>,
  projects: ReadonlyArray<{ id: string; name: string }>,
  dcProjects: ReadonlyArray<{ id: string; name: string }>,
  roles: ReadonlyArray<{ id: string; name: string }>,
): PermissionLevelRow[] {
  const nameById = buildProjectNameMap(projects, dcProjects);
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  return aggRows.map((r) => ({
    projectId: r.projectId,
    projectName: resolveProjectName(nameById, r.projectId),
    roleId: r.roleId,
    roleName: roleNameById.get(r.roleId) ?? "Unknown role",
    permType: r.permType,
    folderCount: r.folderCount,
  }));
}

/**
 * Loads the bounded (project, role, permType) permission-level aggregate,
 * assembled into display-ready rows, with a 5-minute in-process cache
 * (standard sibling TTL — mirrors `loadPermissionFootprint`/`loadDcCoverage`;
 * NOT the `ingestFreshnessView` no-cache exception, which is per-page-load by
 * design for a different reason). Pass `force: true` to bypass the cache.
 */
export async function loadPermissionLevel(force = false): Promise<PermissionLevelRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [aggRows, projects, dcProjects, roles] = await Promise.all([
    db.$queryRaw<RawPermissionLevelRow[]>`
      SELECT f."projectId" AS "projectId",
             fp."roleId"   AS "roleId",
             fp."permType" AS "permType",
             COUNT(*)::int AS "folderCount"
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      GROUP BY f."projectId", fp."roleId", fp."permType"
    `,
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    db.accRole.findMany({ select: { id: true, name: true } }),
  ]);

  const rows = assemblePermissionLevel(aggRows, projects, dcProjects, roles);
  cache = { at: Date.now(), rows };
  return rows;
}
