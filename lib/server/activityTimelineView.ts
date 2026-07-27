import "server-only";
import { db } from "@/server/db";
import type { ActivityTimelineRow } from "@/lib/acc/timelineCounts";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

/** Label for the synthetic project that holds account-level (admin) activity. */
const ACCOUNT_LEVEL = "Account-level";

export interface ActivityTimelineResult {
  rows: ActivityTimelineRow[];
  /** Account-wide earliest activity month as "YYYY-MM", or null if no data. */
  dataFloor: string | null;
  /** Per-project earliest activity month as "YYYY-MM". Key "" = account-level bucket. */
  floorByProject: Record<string, string>;
}

let cache: { at: number; result: ActivityTimelineResult } | null = null;
const TTL_MS = 5 * 60 * 1000;

interface RawRow {
  projectId: string;
  month: string;
  count: number;
}

interface FloorRaw {
  projectId: string | null;
  floorMonth: string;
}

/**
 * Pure transform: derive account-wide dataFloor and per-project floor map from raw
 * (projectId, floorMonth "YYYY-MM") pairs. No DB access — exported for Vitest.
 */
export function buildFloors(rawFloors: Array<{ projectId: string | null; floorMonth: string }>): {
  dataFloor: string | null;
  floorByProject: Record<string, string>;
} {
  if (rawFloors.length === 0) return { dataFloor: null, floorByProject: {} };

  const floorByProject: Record<string, string> = {};
  let dataFloor: string | null = null;

  for (const r of rawFloors) {
    const key = r.projectId ?? "";
    floorByProject[key] = r.floorMonth;
    // YYYY-MM lexicographic comparison is correct for month ordering.
    if (dataFloor === null || r.floorMonth < dataFloor) {
      dataFloor = r.floorMonth;
    }
  }

  return { dataFloor, floorByProject };
}

/**
 * Per-(project, month) activity counts for the Activity timeline (spec 2026-06-12).
 * Uses a merged accds+DC-backfill query: AccActivityAccds is primary for each project
 * ([earliest accds row → now]); AccActivity (DC) fills only months before a project's
 * first accds row. Account-level DC rows (null/empty projectId) are kept all-time and
 * fold into the "Account-level" synthetic project via COALESCE(NULLIF(...), '').
 *
 * Returns rows + TRUTH-02 floor data (dataFloor + floorByProject).
 */
export async function loadActivityTimeline(force = false): Promise<ActivityTimelineResult> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.result;

  const [pairs, liveProjects, dcProjects, rawFloors] = await Promise.all([
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
          -- DC backfill keep-predicate: account-level admin rows (no project) all-time;
          -- projects accds has not reached yet (a.s IS NULL); and each project's months
          -- that predate its first accds row (d.createdAt < a.s). The overlap accds
          -- already covers (createdAt >= a.s) is excluded here to avoid double-counting.
          WHERE d."projectId" IS NULL OR d."projectId" = ''
             OR a.s IS NULL
             OR d."createdAt" < a.s
          GROUP BY 1, 2
      ) u
      GROUP BY pid, month
    `,
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    // Small floor query: per-project earliest activity month for TRUTH-02 labels.
    db.$queryRaw<FloorRaw[]>`
      SELECT "projectId", to_char(date_trunc('month', MIN("createdAt")), 'YYYY-MM') AS "floorMonth"
      FROM "AccActivityAccds"
      GROUP BY "projectId"
    `,
  ]);

  // Merged AccProject (live superset, wins on conflict) + AccDcProject (DC subset)
  // name map — same buildProjectNameMap/resolveProjectName precedence used by
  // permissionLevelView.ts/folderActivityView.ts. A project id absent from BOTH
  // sources resolves to "Unknown project", never the raw GUID (was: `?? projectId`,
  // which leaked GUIDs into the global project picker — owner UAT gap-closure item 4).
  const nameById = buildProjectNameMap(liveProjects, dcProjects);

  const rows: ActivityTimelineRow[] = pairs.map((p) => {
    const projectId = p.projectId ?? "";
    const projectName = projectId === "" ? ACCOUNT_LEVEL : resolveProjectName(nameById, projectId);
    return { projectId, projectName, month: p.month, count: p.count };
  });

  const { dataFloor, floorByProject } = buildFloors(rawFloors);

  const result: ActivityTimelineResult = { rows, dataFloor, floorByProject };
  cache = { at: Date.now(), result };
  return result;
}
