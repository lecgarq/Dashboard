import "server-only";
import { db } from "@/server/db";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

/** Per-(project, month) issue-creation count for the ISSUE-02 timeline. */
interface IssueFunnelMonthRow {
  projectId: string;
  projectName: string;
  month: string; // "YYYY-MM"
  count: number;
}

/** Per-(project, status) issue count for the ISSUE-03 status donut. */
export interface IssueFunnelStatusRow {
  projectId: string;
  projectName: string;
  status: string; // one of the 8 live statuses, any unexpected raw string, or "unknown" for null
  count: number;
}

/** Per-(project, issueTypeId) issue count for the ISSUE-05 type chart. */
export interface IssueFunnelTypeRow {
  projectId: string;
  projectName: string;
  issueTypeId: string | null; // null = issue has no type set
  typeName: string | null; // null with a non-null issueTypeId = GUID not in the lookup table ("Unknown type")
  count: number;
}

export interface IssueFunnelData {
  monthRows: IssueFunnelMonthRow[];
  statusRows: IssueFunnelStatusRow[];
  typeRows: IssueFunnelTypeRow[];
}

interface RawMonthRow {
  projectId: string;
  month: string;
  count: number;
}

let cache: { at: number; data: IssueFunnelData } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Server-side aggregate loader for the Phase 21 issue funnel (ISSUE-02/ISSUE-03).
 * Reads the FULL AccIssue set (17,360 issues — no isCoordination filter, unlike
 * coordinationByProjectView.ts's Model Coordination widget). Both cuts are bounded
 * GROUP BY aggregates (TEST-01-class OOM-guard rule) — never findMany + JS reduce.
 */
export async function loadIssueFunnel(force = false): Promise<IssueFunnelData> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [monthRaw, statusGroups, typeGroups, issueTypes, projects, dcProjects] = await Promise.all([
    // Month cut: createdAt is nullable — a null would produce a corrupt month key,
    // so those rows are excluded here (still counted in the status cut below).
    db.$queryRaw<RawMonthRow[]>`
      SELECT "projectId",
             to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*)::int AS count
      FROM "AccIssue"
      WHERE "createdAt" IS NOT NULL
      GROUP BY "projectId", month
    `,
    // Status cut: full set, no createdAt filter — a null-createdAt issue still has
    // a valid status and must count in the donut. No isCoordination filter either.
    db.accIssue.groupBy({
      by: ["projectId", "status"],
      _count: { id: true },
    }),
    // Type cut (ISSUE-05): full set, same population as the status cut. Name
    // resolution happens in JS below via the AccIssueType lookup table.
    db.accIssue.groupBy({
      by: ["projectId", "issueTypeId"],
      _count: { id: true },
    }),
    db.accIssueType.findMany({ select: { id: true, name: true } }),
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);

  // AccProject (authoritative live superset) over AccDcProject (DC subset) — any id
  // absent from both resolves to "Unknown project", never the raw GUID.
  const nameById = buildProjectNameMap(projects, dcProjects);

  const monthRows: IssueFunnelMonthRow[] = monthRaw.map((r) => ({
    projectId: r.projectId,
    projectName: resolveProjectName(nameById, r.projectId),
    month: r.month,
    count: r.count,
  }));

  const statusRows: IssueFunnelStatusRow[] = statusGroups.map((g) => ({
    projectId: g.projectId,
    projectName: resolveProjectName(nameById, g.projectId),
    // A null status is coalesced to "unknown", never dropped (coordinationByProjectView.ts convention).
    status: g.status ?? "unknown",
    count: g._count.id,
  }));

  const nameByTypeId = new Map(issueTypes.map((t) => [t.id, t.name]));
  const typeRows: IssueFunnelTypeRow[] = typeGroups.map((g) => ({
    projectId: g.projectId,
    projectName: resolveProjectName(nameById, g.projectId),
    issueTypeId: g.issueTypeId,
    // Three-state, kept distinct (never coalesced here — the transform labels them):
    // resolved name / non-null GUID absent from the lookup ("Unknown type") / null id ("No type set").
    typeName: g.issueTypeId == null ? null : (nameByTypeId.get(g.issueTypeId) ?? null),
    count: g._count.id,
  }));

  const data: IssueFunnelData = { monthRows, statusRows, typeRows };
  cache = { at: Date.now(), data };
  return data;
}
