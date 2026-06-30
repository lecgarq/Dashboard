import "server-only";
import { db } from "@/server/db";
import type { FolderActivityRow } from "@/app/(dashboard)/access-analysis/folderActivityCounts";

/** Per-project folder-scoped activity totals, for the project ranking / level. */
export interface ProjectActivityTotal {
  projectId: string;
  projectName: string;
  activity: number;
  folders: number;
}

interface RawProjectRow {
  projectId: string;
  activity: number;
  folders: number;
}

const TTL_MS = 5 * 60 * 1000;
let projectsCache: { at: number; key: string; rows: ProjectActivityTotal[] } | null = null;
const treeCache = new Map<string, { at: number; rows: FolderActivityRow[] }>();

/**
 * Builds a merged project-name map from AccProject (authoritative live superset)
 * and AccDcProject (Data Connector subset). AccProject names take precedence when
 * the same id appears in both sources; the DC names fill in any gap not covered
 * by the live superset.
 *
 * Split out as a pure function so it can be unit-tested without a DB connection.
 */
export function buildProjectNameMap(
  accProject: ReadonlyArray<{ id: string; name: string }>,
  accDcProject: ReadonlyArray<{ id: string; name: string }>,
): Map<string, string> {
  // Load DC names first so AccProject entries (authoritative) overwrite on conflict.
  const map = new Map<string, string>();
  for (const p of accDcProject) {
    map.set(p.id, p.name);
  }
  for (const p of accProject) {
    map.set(p.id, p.name);
  }
  return map;
}

/**
 * Resolves a projectId to a human-readable name using the provided name map.
 * Returns "Unknown project" for any id absent from the map or for a blank id —
 * previously the code fell back to the raw project id string, which leaked
 * internal identifiers in the "Folder Activity by Role" view.
 *
 * Pure function — safe to unit-test without a DB connection.
 */
export function resolveProjectName(nameById: Map<string, string>, projectId: string): string {
  if (!projectId) return "Unknown project";
  return nameById.get(projectId) ?? "Unknown project";
}

/**
 * Folder-scoped activity totals per project, for the given project ids. One
 * grouped index scan over AccActivityAccds (folder rows only), names merged from
 * AccProject (1,153 live superset) + AccDcProject (550 DC subset) in JS. Sorted
 * by activity desc. Unresolved project ids render as "Unknown project" — never
 * as a raw GUID.
 *
 * The `userEmail IS NOT NULL` filter matches loadFolderActivityTree's filter, so a
 * project's headline `activity` reconciles exactly with the sum of its drill-down
 * (role → user) tree — a user-less (system) action can't be attributed to a role,
 * so it is excluded from both the headline and the tree rather than only the tree.
 */
export async function loadFolderActivityProjects(projectIds: string[]): Promise<ProjectActivityTotal[]> {
  if (projectIds.length === 0) return [];
  const key = [...projectIds].sort().join(",");
  if (projectsCache && projectsCache.key === key && Date.now() - projectsCache.at < TTL_MS) {
    return projectsCache.rows;
  }

  const [raw, accProjects, dcProjects] = await Promise.all([
    db.$queryRaw<RawProjectRow[]>`
      SELECT "projectId" AS "projectId",
             COUNT(*)::int AS activity,
             COUNT(DISTINCT "folderName")::int AS folders
      FROM "AccActivityAccds"
      WHERE "projectId" = ANY(${projectIds})
        AND "folderName" IS NOT NULL AND "folderName" <> ''
        AND "userEmail" IS NOT NULL
      GROUP BY "projectId"
    `,
    // AccProject is the authoritative live superset (1,153 projects); its names
    // take precedence over AccDcProject in the merged map.
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = buildProjectNameMap(accProjects, dcProjects);

  const rows: ProjectActivityTotal[] = raw
    .map((r) => ({
      projectId: r.projectId,
      projectName: resolveProjectName(nameById, r.projectId),
      activity: r.activity,
      folders: r.folders,
    }))
    .sort((a, b) => b.activity - a.activity || a.projectName.localeCompare(b.projectName));

  projectsCache = { at: Date.now(), key, rows };
  return rows;
}

/**
 * One project's folder-scoped activity, grouped to (folder, actor) totals. Bounded
 * per project; cached per projectId. userName comes from the accds row (fallback to
 * email at fold time). Used by the client fold summarizeFolderActivity.
 */
export async function loadFolderActivityTree(projectId: string): Promise<FolderActivityRow[]> {
  if (!projectId) return [];
  const hit = treeCache.get(projectId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const rows = await db.$queryRaw<FolderActivityRow[]>`
    SELECT "folderName" AS "folderName",
           "userEmail" AS "userEmail",
           MAX(COALESCE(NULLIF("userName", ''), "userEmail")) AS "userName",
           COUNT(*)::int AS count
    FROM "AccActivityAccds"
    WHERE "projectId" = ${projectId}
      AND "folderName" IS NOT NULL AND "folderName" <> ''
      AND "userEmail" IS NOT NULL
    GROUP BY "folderName", "userEmail"
  `;

  treeCache.set(projectId, { at: Date.now(), rows });
  return rows;
}
