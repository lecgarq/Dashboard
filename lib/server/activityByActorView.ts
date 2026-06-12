import "server-only";
import { db } from "@/server/db";

/** One compact row: total activity for a (project, actor) pair. */
export interface ActivityActorRow {
  projectId: string;
  projectName: string;
  userEmail: string; // lowercased, as stored on AccActivity
  userName: string; // resolved from AccDcUser; falls back to the email
  count: number;
}

interface RawRow {
  projectId: string;
  userEmail: string;
  count: number;
}

let cache: { at: number; rows: ActivityActorRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Per-(project, actor) activity counts for the "Activity by role" donut.
 * As of 2026-06-12 the query uses a unified accds + DC-backfill merge:
 *   - Primary source: AccActivityAccds (real-time accds feed, all dates).
 *   - DC backfill: AccActivity rows scoped to projects that accds has not yet
 *     reached (astart IS NULL) OR rows predating the first accds row for that
 *     project (createdAt < astart). This avoids double-counting the overlap.
 *   - Account-level rows remain EXCLUDED on both sides: a role is a per-project
 *     concept, so rows with no project carry no role to attribute to the donut.
 *
 * The union collapses to ~2.7k (project, actor) pairs which the client
 * re-buckets by the actor's project role — same ship-and-rebucket shape as
 * the roles and modules views. Mirrors `moduleActivityView`, but groups by the
 * actor rather than the raw action.
 */
export async function loadActivityByActor(force = false): Promise<ActivityActorRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects, users] = await Promise.all([
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", email AS "userEmail", SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid, "userEmail" AS email, COUNT(*)::int AS c
          FROM "AccActivityAccds"
          WHERE "projectId" IS NOT NULL AND "projectId" <> '' AND "userEmail" IS NOT NULL
          GROUP BY 1, 2
        UNION ALL
        SELECT d."projectId" AS pid, d."userEmail" AS email, COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          -- DC backfill, project rows only (account-level has no role, so excluded):
          -- a project accds has not reached yet (a.s IS NULL), or rows predating its
          -- first accds row (d.createdAt < a.s). The overlap accds already covers is excluded.
          WHERE d."projectId" IS NOT NULL AND d."projectId" <> ''
            AND d."userEmail" IS NOT NULL
            AND (a.s IS NULL OR d."createdAt" < a.s)
          GROUP BY 1, 2
      ) u
      GROUP BY pid, email
    `,
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    db.accDcUser.findMany({ select: { email: true, name: true } }),
  ]);

  const nameByProject = new Map(projects.map((p) => [p.id, p.name]));
  const nameByEmail = new Map<string, string>();
  for (const u of users) {
    if (u.email) nameByEmail.set(u.email.toLowerCase(), u.name ?? u.email);
  }

  const rows: ActivityActorRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const userEmail = p.userEmail ?? "";
    return {
      projectId,
      projectName: nameByProject.get(projectId) ?? projectId,
      userEmail,
      userName: nameByEmail.get(userEmail) ?? userEmail,
      count: p.count,
    };
  });

  cache = { at: Date.now(), rows };
  return rows;
}
