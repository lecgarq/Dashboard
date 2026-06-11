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

let cache: { at: number; rows: ActivityActorRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Per-(project, actor) activity counts for the "Activity by role" donut. One
 * grouped query over ~1M AccActivity rows collapses to ~2.7k rows, which the
 * client re-buckets by the actor's project role (the same ship-and-rebucket shape
 * as the roles and modules views). Mirrors `moduleActivityView`, but groups by the
 * actor rather than the raw action.
 *
 * Scope is PROJECT activity only: rows with no project (empty/null `projectId`) or
 * no actor (null `userEmail`) carry no per-project role and are excluded in SQL —
 * matching the donut's "project activity attributed to a role" framing.
 */
export async function loadActivityByActor(force = false): Promise<ActivityActorRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, projects, users] = await Promise.all([
    db.accActivity.groupBy({
      by: ["projectId", "userEmail"],
      _count: { id: true },
      where: {
        AND: [{ projectId: { not: null } }, { projectId: { not: "" } }, { userEmail: { not: null } }],
      },
    }),
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
      count: p._count.id,
    };
  });

  cache = { at: Date.now(), rows };
  return rows;
}
