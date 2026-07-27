import "server-only";
import { db } from "@/server/db";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

interface RawRow {
  projectId: string;
  rawAction: string;
  service: string | null;
  count: number;
}

let cache: { at: number; rows: ModuleActivityRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Per-(project, rawAction) activity counts for the Reviews / Transmittals /
 * RFIs / Submittals workflow-tool donuts (Projects tab).
 *
 * Why this loader exists instead of reusing loadModuleActivity()'s merged rows:
 * the accds live feed NEVER emits RFI/submittal verbs (verified live 2026-07-13:
 * zero `rfi-*` / `response-*` / `comment-*` / `submittal*` rows in
 * AccActivityAccds vs ~13k each in AccActivity). The standard merge drops DC
 * rows inside each project's accds window on the assumption accds covers them —
 * true for review verbs, false for RFI/submittal verbs, which would undercount
 * those tools ~20x (636 vs 13,127 RFI rows). So the keep-predicate here is
 * per verb family:
 *   - RFI/submittal family rows: kept from AccActivity unconditionally (DC is
 *     the sole source that records them).
 *   - Review + transmittal family rows: standard two-feed dedup, identical to
 *     lib/server/moduleActivityView.ts (accds primary, DC backfill only where
 *     accds hasn't reached) — both feeds record these verbs (verified live
 *     2026-07-13: transmittals ~166k accds / ~8k DC).
 *
 * SQL prefilters are a SUPERSET of the classifier's tool-group rules; the
 * client-side classifyActivity() decides final group membership and drops
 * anything that lands outside Reviews/RFIs/Submittals.
 */
export async function loadWorkflowTools(force = false): Promise<ModuleActivityRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const [pairs, liveProjects, dcProjects] = await Promise.all([
    db.$queryRaw<RawRow[]>`
      WITH astart AS (
        SELECT "projectId", MIN("createdAt") AS s
        FROM "AccActivityAccds"
        GROUP BY "projectId"
      )
      SELECT pid AS "projectId", action AS "rawAction", service, SUM(c)::int AS count
      FROM (
        SELECT "projectId" AS pid, "activityVerb" AS action, "serviceGroup" AS service, COUNT(*)::int AS c
          FROM "AccActivityAccds"
          WHERE "activityVerb" ILIKE '%review%' OR "activityVerb" ILIKE '%approval%' OR "activityVerb" = 'notify-final-members'
             OR "activityVerb" ILIKE '%transmittal%'
             OR "activityVerb" ILIKE 'rfi-%' OR "activityVerb" ILIKE 'response-%' OR "activityVerb" ILIKE 'comment-%'
             OR "activityVerb" ILIKE 'submittal%'
          GROUP BY 1, 2, 3
        UNION ALL
        -- RFI/submittal family: DC feed is the only source; keep every row.
        SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, d."rawAction" AS action, d."service" AS service, COUNT(*)::int AS c
          FROM "AccActivity" d
          WHERE d."rawAction" ILIKE 'rfi-%' OR d."rawAction" ILIKE 'response-%' OR d."rawAction" ILIKE 'comment-%'
             OR d."rawAction" ILIKE 'submittal%'
          GROUP BY 1, 2, 3
        UNION ALL
        -- Review + transmittal families: standard accds-primary / DC-backfill dedup (moduleActivityView.ts).
        SELECT COALESCE(NULLIF(d."projectId", ''), '') AS pid, d."rawAction" AS action, d."service" AS service, COUNT(*)::int AS c
          FROM "AccActivity" d
          LEFT JOIN astart a ON a."projectId" = d."projectId"
          WHERE (d."rawAction" ILIKE '%review%' OR d."rawAction" ILIKE '%approval%' OR d."rawAction" = 'notify-final-members' OR d."rawAction" ILIKE '%transmittal%')
            AND NOT (d."rawAction" ILIKE 'rfi-%' OR d."rawAction" ILIKE 'response-%' OR d."rawAction" ILIKE 'comment-%' OR d."rawAction" ILIKE 'submittal%')
            AND (d."projectId" IS NULL OR d."projectId" = '' OR a.s IS NULL OR d."createdAt" < a.s)
          GROUP BY 1, 2, 3
      ) u
      GROUP BY pid, action, service
    `,
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = buildProjectNameMap(liveProjects, dcProjects);
  const rows: ModuleActivityRow[] = pairs.map((p) => ({
    projectId: p.projectId,
    projectName: p.projectId === "" ? "Account-level" : resolveProjectName(nameById, p.projectId),
    rawAction: p.rawAction,
    service: p.service,
    count: p.count,
  }));

  cache = { at: Date.now(), rows };
  return rows;
}
