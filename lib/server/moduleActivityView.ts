import "server-only";
import { db } from "@/server/db";
import type { ModuleActivityRow } from "@/app/(dashboard)/access-analysis/moduleCounts";

interface RawRow {
  projectId: string;
  rawAction: string;
  count: number;
}

/** Label for the synthetic project that holds account-level (admin) activity. */
const ACCOUNT_LEVEL = "Account-level";

let cache: { at: number; rows: ModuleActivityRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Compact per-(project, rawAction) activity counts for the modules donut.
 *
 * Data source (spec 2026-06-12): unified accds + DC-backfill merge.
 *   - Primary: AccActivityAccds (real-time webhook feed). activityVerb is aliased
 *     to rawAction so the downstream classifyActivity classifier is unchanged —
 *     both tables share the same vocabulary (e.g. "view-entity", "assign-permission").
 *   - Backfill: AccActivity (DC batch feed) fills the gaps:
 *       • account-level admin rows (null/empty projectId) — all-time, accds has no
 *         equivalent source for these;
 *       • projects accds has not yet reached (no AccActivityAccds row for that project);
 *       • each project's rows that predate its earliest accds row (createdAt < min
 *         AccActivityAccds.createdAt for that project).
 *     This prevents double-counting in the overlap window.
 *
 * The merged result collapses to ~2–3k rows (~200 KB), which the client
 * re-buckets into modules — same ship-and-rebucket shape as the roles view.
 */
export async function loadModuleActivity(force = false): Promise<ModuleActivityRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects] = await Promise.all([
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", action AS "rawAction", SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid, "activityVerb" AS action, COUNT(*)::int AS c
          FROM "AccActivityAccds"
          GROUP BY 1, 2
        UNION ALL
        SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, d."rawAction" AS action, COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          -- DC backfill keep-predicate: account-level admin rows (no project) all-time;
          -- projects accds has not reached yet (a.s IS NULL); and each project's rows
          -- that predate its first accds row (d.createdAt < a.s). The overlap accds
          -- already covers (createdAt >= a.s) is excluded here to avoid double-counting.
          WHERE d."projectId" IS NULL OR d."projectId" = ''
             OR a.s IS NULL
             OR d."createdAt" < a.s
          GROUP BY 1, 2
      ) u
      GROUP BY pid, action
    `,
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ModuleActivityRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const projectName = projectId === "" ? ACCOUNT_LEVEL : nameById.get(projectId) ?? projectId;
    return { projectId, projectName, rawAction: p.rawAction, count: p.count };
  });

  cache = { at: Date.now(), rows };
  return rows;
}
