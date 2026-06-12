import "server-only";
import { db } from "@/server/db";
import type { ActivityTimelineRow } from "@/app/(dashboard)/access-analysis/timelineCounts";

/** Label for the synthetic project that holds account-level (admin) activity. */
const ACCOUNT_LEVEL = "Account-level";

let cache: { at: number; rows: ActivityTimelineRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

interface RawRow {
  projectId: string;
  month: string;
  count: number;
}

/**
 * Per-(project, month) activity counts for the Activity timeline (spec 2026-06-12).
 * Uses a merged accds+DC-backfill query: AccActivityAccds is primary for each project
 * ([earliest accds row → now]); AccActivity (DC) fills only months before a project's
 * first accds row. Account-level DC rows (null/empty projectId) are kept all-time and
 * fold into the "Account-level" synthetic project via COALESCE(NULLIF(...), '').
 */
export async function loadActivityTimeline(force = false): Promise<ActivityTimelineRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects] = await Promise.all([
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", month, SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid,
               to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
               COUNT(*)::int AS c
          FROM "AccActivityAccds"
          GROUP BY 1, 2
        UNION ALL
        SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid,
               to_char(date_trunc('month', d."createdAt"), 'YYYY-MM') AS month,
               COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE d."projectId" IS NULL OR d."projectId" = ''
             OR a.s IS NULL
             OR d."createdAt" < a.s
          GROUP BY 1, 2
      ) u
      GROUP BY pid, month
    `,
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ActivityTimelineRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const projectName = projectId === "" ? ACCOUNT_LEVEL : nameById.get(projectId) ?? projectId;
    return { projectId, projectName, month: p.month, count: p.count };
  });

  cache = { at: Date.now(), rows };
  return rows;
}
