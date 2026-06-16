/**
 * Pure aggregation for the "Activity by role" donut. Mirrors `roleCounts.ts`, but
 * the entity is ACTIVITY VOLUME instead of membership count: each input row is a
 * (project, actor) activity total, and slices are roles sized by how much activity
 * the people in that role performed, summed across projects.
 *
 * Role is a per-project concept in ACC, so each activity row is attributed to the
 * role the actor held *on that project* (looked up by `email::projectId`). The
 * bucketing mirrors the Role distribution donut exactly — no role -> "Unknown",
 * one role -> that role, several roles -> "Multiple roles" — so the two role
 * donuts stay directly comparable. No React/DOM/IO; safe on server and client.
 */
import { UNKNOWN_ROLE, MULTIPLE_ROLES, type RoleSlice } from "./roleCounts";

/** One contributing person within a role slice (the drill-down "from whom"). */
export interface RoleActivityUser {
  email: string;
  name: string;
  count: number;
}

export interface RoleActivitySummary {
  /** Role -> total activity, sorted by volume desc; includes Unknown + Multiple roles. */
  slices: RoleSlice[];
  /** Sum of all slice values (= total attributed activity in scope). */
  total: number;
  /** Count of distinct single-role names credited to a slice. */
  distinctRoles: number;
  /** Slice label -> contributing users (merged across projects), sorted by count desc. */
  usersByRole: Map<string, RoleActivityUser[]>;
}

/** One shipped row: total activity for a (project, actor) pair. */
export interface ActivityActorInput {
  projectId: string;
  userEmail: string;
  userName: string;
  count: number;
}

/** One shipped membership: the roles an actor holds on a project (and their company). */
export interface MembershipRolesInput {
  projectId: string;
  email: string;
  roles: string[];
  /** The actor's company on this project; feeds the Activity-by-company donut. */
  company?: string | null;
}

const key = (email: string, projectId: string) => `${email}::${projectId}`;

/**
 * Bucket each (project, actor) activity total by the actor's role on that project,
 * then roll up to role slices plus a per-role list of contributing users.
 *
 * A user active in several projects under the same role is merged into one
 * drill-down row (counts summed). Slice values sum to `total`, so donut
 * percentages add to 100%.
 */
export function summarizeActivityByRole(
  activity: ReadonlyArray<ActivityActorInput>,
  memberships: ReadonlyArray<MembershipRolesInput>,
): RoleActivitySummary {
  const rolesByActor = new Map<string, string[]>();
  for (const m of memberships) rolesByActor.set(key(m.email, m.projectId), m.roles);

  const volume = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged user row), so one person spanning projects collapses.
  const usersAgg = new Map<string, Map<string, RoleActivityUser>>();

  for (const a of activity) {
    const uniqueRoles = [...new Set(rolesByActor.get(key(a.userEmail, a.projectId)) ?? [])];
    const label =
      uniqueRoles.length === 0 ? UNKNOWN_ROLE
        : uniqueRoles.length === 1 ? uniqueRoles[0]
          : MULTIPLE_ROLES;
    if (uniqueRoles.length === 1) distinct.add(uniqueRoles[0]);

    volume.set(label, (volume.get(label) ?? 0) + a.count);

    const byEmail = usersAgg.get(label) ?? usersAgg.set(label, new Map()).get(label)!;
    const cur = byEmail.get(a.userEmail);
    if (cur) cur.count += a.count;
    else byEmail.set(a.userEmail, { email: a.userEmail, name: a.userName, count: a.count });
  }

  const slices: RoleSlice[] = [...volume.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((x, y) => y.value - x.value || x.name.localeCompare(y.name));

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const usersByRole = new Map<string, RoleActivityUser[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByRole.set(
      label,
      [...byEmail.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
    );
  }

  return { slices, total, distinctRoles: distinct.size, usersByRole };
}
