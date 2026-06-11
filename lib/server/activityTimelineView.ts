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
 * Per-(project, month) activity counts for the Activity timeline. One grouped
 * raw query buckets ~1M AccActivity rows by UTC calendar month (date_trunc),
 * collapsing to a few thousand compact rows the client re-buckets + zero-fills
 * (the same ship-and-rebucket shape as the donut views). Modeled on the
 * day-bucketed getCoverageMatrix query in server/routers/acc-activity.ts.
 *
 * Scope is ALL recorded activity (this is volume, not attributed users): rows
 * with a null userEmail are still counted; admin rows (null/empty projectId)
 * fold into an "Account-level" project — selectable in the picker like any other.
 */
export async function loadActivityTimeline(force = false): Promise<ActivityTimelineRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects] = await Promise.all([
    db.$queryRaw<RawRow[]>`
      SELECT
        COALESCE(NULLIF(a."projectId", ''), '') AS "projectId",
        to_char(date_trunc('month', a."createdAt"), 'YYYY-MM') AS month,
        COUNT(*)::int AS count
      FROM "AccActivity" a
      GROUP BY 1, 2
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
