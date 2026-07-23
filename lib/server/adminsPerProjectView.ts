import "server-only";
import { db } from "@/server/db";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

/**
 * Admins per project (owner ask 2026-07-23: "how many admins do I have per
 * project"). Two verified sources, deduped per project by lowercased email:
 *
 *  - `AccProjectMember.projectAdmin = true` (ACC member sync; active members
 *    only) — covers 301 of 1,153 projects (measured 2026-07-23).
 *  - `AccDcProjectUserProduct.accessLevel = 'project_admin'` joined through
 *    `AccDcUser` for the email — covers 408 projects. The two id spaces do NOT
 *    overlap (autodeskId vs DC userId, INTERSECT = 0 measured 2026-07-23), so
 *    email is the only safe dedupe key; DC admin users with no resolvable
 *    email are surfaced per project as `unresolvedDcAdmins`, never silently
 *    dropped or double-counted.
 *
 * Coverage is disclosed, not hidden: projects with NO rows in either source
 * are absent from `rows` and counted via `totalProjects` vs `coveredProjects`;
 * covered projects with zero flagged admins ship in `zeroAdminProjects` (an
 * operational red flag, not missing data).
 */

export interface ProjectAdminPerson {
  email: string;
  name: string;
  fromMember: boolean;
  fromDc: boolean;
}

export interface ProjectAdminsRow {
  projectId: string;
  projectName: string;
  admins: ProjectAdminPerson[];
  adminCount: number;
  /** DC project_admin users whose AccDcUser row has no email — shown, not dropped. */
  unresolvedDcAdmins: number;
}

export interface AdminsPerProjectData {
  /** Covered projects with ≥1 admin, sorted by adminCount desc. */
  rows: ProjectAdminsRow[];
  totalProjects: number;
  /** Projects with membership data in either source (admin or not). */
  coveredProjects: number;
  memberCoveredProjects: number;
  dcCoveredProjects: number;
  /** Covered projects where neither source flags a single admin. */
  zeroAdminProjects: Array<{ projectId: string; projectName: string }>;
}

interface RawAdminPair {
  projectId: string;
  email: string;
  name: string;
  fromMember: boolean;
  fromDc: boolean;
}

interface RawUnresolvedRow {
  projectId: string;
  missing: number;
}

/** Pure assembly — exported for the sibling `.test.ts` (no DB). */
export function assembleAdminsPerProject(args: {
  pairs: RawAdminPair[];
  unresolved: RawUnresolvedRow[];
  memberCoveredIds: string[];
  dcCoveredIds: string[];
  totalProjects: number;
  projectNames: Map<string, string>;
}): AdminsPerProjectData {
  const { pairs, unresolved, memberCoveredIds, dcCoveredIds, totalProjects, projectNames } = args;
  const unresolvedByProject = new Map(unresolved.map((u) => [u.projectId, u.missing]));
  const byProject = new Map<string, ProjectAdminPerson[]>();
  for (const p of pairs) {
    let list = byProject.get(p.projectId);
    if (!list) {
      list = [];
      byProject.set(p.projectId, list);
    }
    list.push({ email: p.email, name: p.name, fromMember: p.fromMember, fromDc: p.fromDc });
  }
  // A project with ONLY unresolved DC admins still deserves a row.
  for (const projectId of unresolvedByProject.keys()) {
    if (!byProject.has(projectId)) byProject.set(projectId, []);
  }

  const name = (projectId: string): string => resolveProjectName(projectNames, projectId);

  const rows: ProjectAdminsRow[] = [...byProject.entries()]
    .map(([projectId, admins]) => ({
      projectId,
      projectName: name(projectId),
      admins: admins.sort((a, b) => a.email.localeCompare(b.email)),
      adminCount: admins.length,
      unresolvedDcAdmins: unresolvedByProject.get(projectId) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.adminCount + b.unresolvedDcAdmins - (a.adminCount + a.unresolvedDcAdmins) ||
        a.projectName.localeCompare(b.projectName),
    );

  const covered = new Set([...memberCoveredIds, ...dcCoveredIds]);
  const zeroAdminProjects = [...covered]
    .filter((id) => !byProject.has(id))
    .map((projectId) => ({ projectId, projectName: name(projectId) }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  return {
    rows,
    totalProjects,
    coveredProjects: covered.size,
    memberCoveredProjects: memberCoveredIds.length,
    dcCoveredProjects: dcCoveredIds.length,
    zeroAdminProjects,
  };
}

let cache: { at: number; data: AdminsPerProjectData } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadAdminsPerProject(): Promise<AdminsPerProjectData> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [pairs, unresolved, memberCovered, dcCovered, totalProjects, projectNames] =
    await Promise.all([
      // Bounded union: ~8.2k (project, email) admin pairs measured 2026-07-23.
      db.$queryRawUnsafe<RawAdminPair[]>(`
        SELECT "projectId",
               em AS email,
               MAX(nm) AS name,
               bool_or(src = 'member') AS "fromMember",
               bool_or(src = 'dc') AS "fromDc"
        FROM (
          SELECT m."projectId", lower(m.email) AS em, m.name AS nm, 'member' AS src
          FROM "AccProjectMember" m
          WHERE m."projectAdmin" = true AND lower(m.status) = 'active' AND m.email <> ''
          UNION
          SELECT DISTINCT p."projectId", lower(u.email), COALESCE(u.name, ''), 'dc'
          FROM "AccDcProjectUserProduct" p
          JOIN "AccDcUser" u ON u.id = p."userId"
          WHERE p."accessLevel" = 'project_admin' AND u.email IS NOT NULL AND u.email <> ''
        ) s
        GROUP BY "projectId", em`),
      db.$queryRawUnsafe<RawUnresolvedRow[]>(`
        SELECT p."projectId", COUNT(DISTINCT p."userId")::int AS missing
        FROM "AccDcProjectUserProduct" p
        LEFT JOIN "AccDcUser" u ON u.id = p."userId"
        WHERE p."accessLevel" = 'project_admin' AND (u.email IS NULL OR u.email = '')
        GROUP BY p."projectId"`),
      db.$queryRawUnsafe<Array<{ projectId: string }>>(
        'SELECT DISTINCT "projectId" FROM "AccProjectMember"',
      ),
      db.$queryRawUnsafe<Array<{ projectId: string }>>(
        'SELECT DISTINCT "projectId" FROM "AccDcProjectUserProduct"',
      ),
      db.accProject.count(),
      Promise.all([
        db.accProject.findMany({ select: { id: true, name: true } }),
        db.accDcProject.findMany({ select: { id: true, name: true } }),
      ]),
    ]);

  const data = assembleAdminsPerProject({
    pairs,
    unresolved,
    memberCoveredIds: memberCovered.map((r) => r.projectId),
    dcCoveredIds: dcCovered.map((r) => r.projectId),
    totalProjects,
    projectNames: buildProjectNameMap(projectNames[0], projectNames[1]),
  });
  cache = { at: Date.now(), data };
  return data;
}
