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
 * Folder-scoped activity totals per project, for the given project ids. One
 * grouped index scan over AccActivityAccds (folder rows only), names merged from
 * AccDcProject in JS (mirrors moduleActivityView). Sorted by activity desc.
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

  const [raw, projects] = await Promise.all([
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
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ProjectActivityTotal[] = raw
    .map((r) => ({
      projectId: r.projectId,
      projectName: nameById.get(r.projectId) ?? r.projectId,
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
