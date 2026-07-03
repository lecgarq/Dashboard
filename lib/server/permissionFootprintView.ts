import "server-only";
import { db } from "@/server/db";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

/**
 * Permission reach by role: folder count + total bytes granted, sourced from the
 * materialized `AccFolderPermissionSummary` (22,082 rows, cron-refreshed since v2.2
 * Ph18/19) — zero touch of the raw ~6M-row `AccFolderPermission` table.
 *
 * `totalBytes` is converted from Prisma's `BigInt` to a plain `number` HERE, at the
 * server boundary, never on the client (Pitfall 2 in 20-RESEARCH.md: passing a BigInt
 * across the RSC->client boundary throws "Do not know how to serialize a BigInt" —
 * `tsc --noEmit` does not catch this, it's a runtime failure). Max observed totalBytes
 * in this dataset is ~2.96e12, well inside Number's 2^53 safe-integer range, so this
 * conversion loses no precision at this scale.
 */
export interface PermissionFootprintRow {
  projectId: string;
  projectName: string;
  roleId: string;
  roleName: string;
  folderCount: number;
  totalBytes: number;
}

let cache: { at: number; rows: PermissionFootprintRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Pure assembly — exported for the sibling `.test.ts` (no DB). Resolves project
 * names via the shared `buildProjectNameMap`/`resolveProjectName` precedence
 * (AccProject authoritative over AccDcProject) and role names via a roleId map,
 * falling back to "Unknown role" for any roleId absent from AccRole (none observed
 * live, but defensive per convention).
 */
export function assemblePermissionFootprint(
  summaryRows: ReadonlyArray<{ projectId: string; roleId: string; folderCount: number; totalBytes: bigint }>,
  projects: ReadonlyArray<{ id: string; name: string }>,
  dcProjects: ReadonlyArray<{ id: string; name: string }>,
  roles: ReadonlyArray<{ id: string; name: string }>,
): PermissionFootprintRow[] {
  const nameById = buildProjectNameMap(projects, dcProjects);
  const roleNameById = new Map(roles.map((r) => [r.id, r.name]));
  return summaryRows.map((r) => ({
    projectId: r.projectId,
    projectName: resolveProjectName(nameById, r.projectId),
    roleId: r.roleId,
    roleName: roleNameById.get(r.roleId) ?? "Unknown role",
    folderCount: r.folderCount,
    totalBytes: Number(r.totalBytes),
  }));
}

/**
 * Loads every `AccFolderPermissionSummary` row assembled into display-ready rows,
 * with a 5-minute in-process cache (mirrors `loadDcCoverage`/`loadFolderActivityProjects`).
 * Pass `force: true` to bypass the cache.
 */
export async function loadPermissionFootprint(force = false): Promise<PermissionFootprintRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [summaryRows, projects, dcProjects, roles] = await Promise.all([
    db.accFolderPermissionSummary.findMany({
      select: { projectId: true, roleId: true, folderCount: true, totalBytes: true },
    }),
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    db.accRole.findMany({ select: { id: true, name: true } }),
  ]);

  const rows = assemblePermissionFootprint(summaryRows, projects, dcProjects, roles);
  cache = { at: Date.now(), rows };
  return rows;
}
