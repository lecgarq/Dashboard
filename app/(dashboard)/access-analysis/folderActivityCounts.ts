/**
 * Pure aggregation for the "Folder Activity by Role" tree. Each input row is a
 * (folder, actor) activity total within ONE project. Rows fold into folders
 * (same-name folders merged within the project), each folder's activity is
 * attributed to the role the actor holds on that project, and each role lists
 * the users behind it. Role bucketing mirrors roleActivityCounts exactly so the
 * panel and the "Activity by role" donut agree. No React/DOM/IO.
 */
import { UNKNOWN_ROLE, MULTIPLE_ROLES, type RoleSlice, type DrillPerson } from "./roleCounts";
import type { MembershipRolesInput } from "./roleActivityCounts";

/** One shipped row: total folder-scoped activity for a (folder, actor) pair. */
export interface FolderActivityRow {
  folderName: string;
  userEmail: string;
  userName: string;
  count: number;
}

export interface FolderActivityNode {
  /** Folder leaf name (same-name folders merged within the project). */
  name: string;
  /** Total activity in this folder across all roles. */
  total: number;
  /** Role → activity in this folder, sorted desc; includes Unknown / Multiple roles. */
  roleSlices: RoleSlice[];
  /** Role label → contributing users, sorted by count desc. */
  usersByRole: Map<string, DrillPerson[]>;
}

export interface FolderActivitySummary {
  /** Folders sorted by total activity desc. */
  folders: FolderActivityNode[];
  /** Sum of all folder totals (= folder-scoped activity in scope). */
  total: number;
  /** Distinct single-role names credited anywhere in this project. */
  distinctRoles: number;
}

/** Build an email → roles lookup for one project from the in-memory memberships. */
export function rolesByEmailForProject(
  memberships: ReadonlyArray<MembershipRolesInput>,
  projectId: string,
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const mem of memberships) {
    if (mem.projectId === projectId) m.set(mem.email, mem.roles);
  }
  return m;
}

/** Bucket a person's roles into a single slice label (Unknown / role / Multiple). */
function labelFor(roles: string[] | undefined): { label: string; single: string | null } {
  const unique = [...new Set(roles ?? [])];
  if (unique.length === 0) return { label: UNKNOWN_ROLE, single: null };
  if (unique.length === 1) return { label: unique[0], single: unique[0] };
  return { label: MULTIPLE_ROLES, single: null };
}

export function summarizeFolderActivity(
  rows: ReadonlyArray<FolderActivityRow>,
  rolesByEmail: ReadonlyMap<string, string[]>,
): FolderActivitySummary {
  // folderName -> { total, role -> value, role -> (email -> person) }
  const folders = new Map<
    string,
    { total: number; roleValue: Map<string, number>; usersAgg: Map<string, Map<string, DrillPerson>> }
  >();
  const distinct = new Set<string>();

  for (const r of rows) {
    const { label, single } = labelFor(rolesByEmail.get(r.userEmail));
    if (single) distinct.add(single);

    const f =
      folders.get(r.folderName) ??
      folders.set(r.folderName, { total: 0, roleValue: new Map(), usersAgg: new Map() }).get(r.folderName)!;
    f.total += r.count;
    f.roleValue.set(label, (f.roleValue.get(label) ?? 0) + r.count);

    const byEmail = f.usersAgg.get(label) ?? f.usersAgg.set(label, new Map()).get(label)!;
    const cur = byEmail.get(r.userEmail);
    if (cur) cur.count += r.count;
    else byEmail.set(r.userEmail, { email: r.userEmail, name: r.userName || r.userEmail, count: r.count });
  }

  const nodes: FolderActivityNode[] = [...folders.entries()].map(([name, f]) => {
    const roleSlices = [...f.roleValue.entries()]
      .map(([rn, value]) => ({ name: rn, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const usersByRole = new Map<string, DrillPerson[]>();
    for (const [rn, byEmail] of f.usersAgg) {
      usersByRole.set(
        rn,
        [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      );
    }
    return { name, total: f.total, roleSlices, usersByRole };
  });

  nodes.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const total = nodes.reduce((s, n) => s + n.total, 0);
  return { folders: nodes, total, distinctRoles: distinct.size };
}
