import "server-only";
import { db } from "@/server/db";
import { mergeRoleNames } from "./accessInstanceView";

/**
 * Per-project activity recency (ENG-01 semantic pivot, 20.1-01): how long ago each
 * (project, user) DC membership's account was last SEEN ACTIVE on that project,
 * sourced from `AccActivityAccds` — NOT sign-in recency (`signInRecencyView.ts`,
 * which this panel semantically replaces once 20.1-06 mounts it). The owner
 * verbatim-rejected sign-in recency as the engagement signal; activity recency is
 * the truthful one.
 *
 * Population = every `AccDcProjectUser` row (same 22,835-row, DC-covered-projects
 * population signInRecencyView uses — same DC-coverage class, same "Unknown
 * user"/"Unknown company" fallback honesty). Roles are RESOLVED NAMES (0..n); the
 * 0/1/2+ attribution (UNKNOWN_ROLE / MULTIPLE_ROLES) happens client-side in
 * `activityRecencyCounts.ts` — this file must not import from `app/` (Phase 10
 * lib->app boundary rule).
 *
 * Source is `AccActivityAccds` ONLY (never the accds+DC-backfill union
 * `activityByActorView.ts` uses) — 20.1-CONTEXT.md locks this: accds-only keeps
 * the "activity" concept single-sourced and avoids re-deriving the backfill-union
 * shape for a panel whose only job is a recency date, not a volume total.
 */
export interface ActivityRecencyRow {
  projectId: string;
  email: string;
  name: string;
  company: string;
  roles: string[];
  lastActivityAt: string | null;
}

interface ProjectUserInput {
  projectId: string;
  userId: string;
}

interface UserInput {
  id: string;
  name: string | null;
  email: string | null;
  companyId: string | null;
}

interface CompanyInput {
  id: string;
  name: string;
}

interface UserRoleInput {
  projectId: string;
  userId: string;
  roleId: string;
}

interface RoleNameInput {
  id: string;
  name: string;
}

/** `${projectId}::${loweredEmail}` -> last activity ISO timestamp. */
type LastActivityByKey = Map<string, string>;

const activityKey = (projectId: string, email: string) => `${projectId}::${email.toLowerCase()}`;

/**
 * Pure assembly — exported for unit testing without a DB connection.
 *
 * Rows whose userId has no matching AccDcUser are kept (honest, not dropped):
 * name falls back to "Unknown user", company to "Unknown company". A membership
 * whose email has no entry in `lastActivityByKey` (no accds-recorded activity for
 * that project+email pair) gets `lastActivityAt: null` — never dropped — which the
 * caller's bucketing treats as "Never active".
 */
export function assembleActivityRecency(
  projectUsers: ProjectUserInput[],
  users: UserInput[],
  companies: CompanyInput[],
  userRoles: UserRoleInput[],
  roleNames: RoleNameInput[],
  lastActivityByKey: LastActivityByKey,
): ActivityRecencyRow[] {
  const userById = new Map(users.map((u) => [u.id, u]));
  const companyById = new Map(companies.map((c) => [c.id, c.name]));
  const roleNameById = new Map(roleNames.map((r) => [r.id, r.name]));

  const rolesByKey = new Map<string, string[]>();
  for (const r of userRoles) {
    const name = roleNameById.get(r.roleId);
    if (!name) continue; // unresolved roleId dropped from roles[] — empty array is legitimate
    const k = `${r.projectId}::${r.userId}`;
    (rolesByKey.get(k) ?? rolesByKey.set(k, []).get(k)!).push(name);
  }

  return projectUsers.map((pu) => {
    const user = userById.get(pu.userId);
    const email = user?.email ?? "";
    const company = user?.companyId ? (companyById.get(user.companyId) ?? "Unknown company") : "Unknown company";
    const lastActivityAt = email ? (lastActivityByKey.get(activityKey(pu.projectId, email)) ?? null) : null;
    return {
      projectId: pu.projectId,
      email,
      name: user?.name ?? user?.email ?? "Unknown user",
      company,
      roles: rolesByKey.get(`${pu.projectId}::${pu.userId}`) ?? [],
      lastActivityAt,
    };
  });
}

interface RawActivityRow {
  projectId: string;
  userEmail: string;
  lastActivityAt: Date;
}

let cache: { at: number; data: ActivityRecencyRow[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * Returns per-project activity recency rows with a 5-minute in-process cache.
 * No Prisma access in client components — DB queries live here only. The
 * per-(projectId,userEmail) MAX(createdAt) is computed server-side via raw SQL
 * GROUP BY (never `findMany` + JS reduce over AccActivityAccds — that table is
 * multi-million-row scale).
 */
export async function loadActivityRecency(force = false): Promise<ActivityRecencyRow[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const [lastActivity, projectUsers, users, companies, userRoles, dcRoleNames, liveRoleNames] = await Promise.all([
    db.$queryRaw<RawActivityRow[]>`
      SELECT "projectId", "userEmail", MAX("createdAt") AS "lastActivityAt"
      FROM "AccActivityAccds"
      WHERE "userEmail" IS NOT NULL AND "projectId" IS NOT NULL AND "projectId" <> ''
      GROUP BY "projectId", "userEmail"
    `,
    db.accDcProjectUser.findMany({ select: { projectId: true, userId: true } }),
    db.accDcUser.findMany({ select: { id: true, name: true, email: true, companyId: true } }),
    db.accDcCompany.findMany({ select: { id: true, name: true } }),
    db.accDcProjectUserRole.findMany({ select: { projectId: true, userId: true, roleId: true } }),
    db.accDcRole.findMany({ select: { id: true, name: true } }),
    db.accRole.findMany({ select: { id: true, name: true } }),
  ]);

  const lastActivityByKey: LastActivityByKey = new Map();
  for (const r of lastActivity) {
    lastActivityByKey.set(activityKey(r.projectId, r.userEmail), r.lastActivityAt.toISOString());
  }
  const roleNames = [...mergeRoleNames(dcRoleNames, liveRoleNames)].map(([id, name]) => ({ id, name }));

  const data = assembleActivityRecency(projectUsers, users, companies, userRoles, roleNames, lastActivityByKey);
  cache = { at: Date.now(), data };
  return data;
}
