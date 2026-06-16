/**
 * Pure aggregation for the "Activity by company" donut. Mirrors
 * `roleActivityCounts.ts`, bucketing activity volume by the actor's COMPANY on
 * each project instead of their role. Company is per-(project, user), looked up
 * by `email::projectId`; activity with no membership, or a membership with no
 * company, falls into "Unknown company". No React/DOM/IO; safe on server + client.
 */
import { UNKNOWN_COMPANY } from "./companyCounts";
import type { RoleSlice } from "./roleCounts";

/** One contributing person within a company slice (the drill-down "from whom"). */
export interface CompanyActivityUser {
  email: string;
  name: string;
  count: number;
}

export interface CompanyActivitySummary {
  /** Company -> total activity, desc; includes "Unknown company". */
  slices: RoleSlice[];
  /** Sum of all slice values (= total attributed activity in scope). */
  total: number;
  /** Count of distinct real company names credited to a slice. */
  distinctCompanies: number;
  /** Slice label -> contributing users (merged across projects), sorted by count desc. */
  usersByCompany: Map<string, CompanyActivityUser[]>;
}

/** One shipped row: total activity for a (project, actor) pair. */
export interface ActivityActorInput {
  projectId: string;
  userEmail: string;
  userName: string;
  count: number;
}

/** One shipped membership: the actor's company on a project. */
export interface MembershipCompanyInput {
  projectId: string;
  email: string;
  company?: string | null;
}

const key = (email: string, projectId: string) => `${email}::${projectId}`;
const labelFor = (company?: string | null): string => {
  const name = (company ?? "").trim();
  return name.length > 0 ? name : UNKNOWN_COMPANY;
};

/**
 * Bucket each (project, actor) activity total by the actor's company on that
 * project, then roll up to company slices plus a per-company list of
 * contributing users. A user active in several projects under the same company
 * is merged into one drill-down row (counts summed). Slice values sum to `total`.
 */
export function summarizeActivityByCompany(
  activity: ReadonlyArray<ActivityActorInput>,
  memberships: ReadonlyArray<MembershipCompanyInput>,
): CompanyActivitySummary {
  const companyByActor = new Map<string, string | null | undefined>();
  for (const m of memberships) companyByActor.set(key(m.email, m.projectId), m.company);

  const volume = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged user row), so one person spanning projects collapses.
  const usersAgg = new Map<string, Map<string, CompanyActivityUser>>();

  for (const a of activity) {
    // Absent key -> get() returns undefined -> labelFor -> "Unknown company".
    const label = labelFor(companyByActor.get(key(a.userEmail, a.projectId)));
    if (label !== UNKNOWN_COMPANY) distinct.add(label);

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

  const usersByCompany = new Map<string, CompanyActivityUser[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByCompany.set(
      label,
      [...byEmail.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
    );
  }

  return { slices, total, distinctCompanies: distinct.size, usersByCompany };
}
