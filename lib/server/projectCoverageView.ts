import "server-only";
import { db } from "@/server/db";
import { getProjectIdsWithUnifiedActivity } from "@/lib/server/unifiedActivitySource";

/**
 * Per-project data-coverage signals for the shared project picker. A project is
 * "fully covered" when we hold BOTH its activity log AND a successful folder
 * crawl — the two extraction pipelines that feed Access Analysis. The deeper
 * Slice-D file crawl (`fileCrawled`) is surfaced as an extra, stronger tier.
 *
 *  - hasActivity   — appears in unified ACCDS + DC-backfill activity
 *  - folderCrawled — AccProject.folderCrawlStatus === "ok" (folder tree + perms read)
 *  - fileCrawled   — some folder has a populated fileCount (file-level crawl ran)
 */
export interface ProjectCoverage {
  projectId: string;
  hasActivity: boolean;
  folderCrawled: boolean;
  fileCrawled: boolean;
}

let cache: { at: number; rows: ProjectCoverage[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadProjectCoverage(force = false): Promise<ProjectCoverage[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [activity, projects, fileFolders] = await Promise.all([
    getProjectIdsWithUnifiedActivity(db),
    db.accProject.findMany({ select: { id: true, folderCrawlStatus: true } }),
    db.accFolder.groupBy({ by: ["projectId"], where: { fileCount: { not: null } }, _count: { id: true } }),
  ]);

  const rows = buildCoverage(activity, projects, fileFolders);
  cache = { at: Date.now(), rows };
  return rows;
}

/** Pure assembly of the coverage rows — split out so it can be unit tested. */
export function buildCoverage(
  activity: ReadonlyArray<{ projectId: string | null }>,
  projects: ReadonlyArray<{ id: string; folderCrawlStatus: string }>,
  fileFolders: ReadonlyArray<{ projectId: string }>,
): ProjectCoverage[] {
  const activitySet = new Set(activity.map((a) => a.projectId).filter((id): id is string => !!id));
  const fileSet = new Set(fileFolders.map((f) => f.projectId));
  const crawlById = new Map(projects.map((p) => [p.id, p.folderCrawlStatus]));

  const ids = new Set<string>();
  for (const p of projects) ids.add(p.id);
  for (const id of activitySet) ids.add(id);
  for (const id of fileSet) ids.add(id);

  return [...ids].map((projectId) => ({
    projectId,
    hasActivity: activitySet.has(projectId),
    folderCrawled: crawlById.get(projectId) === "ok",
    fileCrawled: fileSet.has(projectId),
  }));
}
