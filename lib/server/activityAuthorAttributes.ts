/**
 * activityAuthorAttributes.ts — v2.7 Phase 38 (ACT-02 / EMB-07 input).
 *
 * Pure mapping from the established per-(user,project) graph feature snapshots
 * (buildGraphNodesFromUsers output — role via the mergeRoleNames-backed bulk-user
 * path, DC firm name, provisioned module signature) to the author-attribute
 * sidecar rows the offline activity-embedding pipeline joins on
 * (emailLower, projectId). Null/empty emails are dropped — those activity rows
 * resolve to the explicit "Unknown author" grouping instead.
 */

export interface AuthorAttributeRow {
  emailLower: string;
  projectId: string;
  role: string;
  company: string;
  modules: string[];
  /**
   * Membership buckets for the universe's role and access dimensions, resolved
   * offline from AccDcProjectUser via the SAME helpers the /access-analysis
   * donuts use (roleBucketLabel / accessBucketLabel). Optional so the Python
   * pipeline — which reads only `role`/`company` — keeps consuming older
   * sidecars unchanged, and so a sidecar written before this field still loads.
   */
  roleBucket?: string;
  accessBucket?: string;
}

/** One (user, project) membership as the DC snapshot sees it. */
export interface MembershipLike {
  email: string;
  projectId: string;
  roles: string[];
  status: string | null;
  modules: string[];
  adminModules: string[];
}

interface SnapshotLike {
  nodeId: string; // "userId::projectId"
  emailLower: string;
  role: string;
  firmName: string;
  moduleSignature?: readonly string[];
}

/**
 * One row per distinct (emailLower, projectId); first snapshot wins (input is
 * nodeId-sorted, so this is deterministic). Output sorted by email then project.
 */
export function buildAuthorAttributeMap(
  features: readonly SnapshotLike[],
): AuthorAttributeRow[] {
  const byKey = new Map<string, AuthorAttributeRow>();
  for (const f of features) {
    const emailLower = f.emailLower.trim().toLowerCase();
    if (!emailLower) continue;
    const sep = f.nodeId.indexOf("::");
    if (sep < 0) continue;
    const projectId = f.nodeId.slice(sep + 2);
    if (!projectId) continue;
    const key = `${emailLower}::${projectId}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      emailLower,
      projectId,
      role: f.role || "(no role)",
      company: f.firmName || "",
      modules: [...(f.moduleSignature ?? [])],
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.emailLower.localeCompare(b.emailLower) || a.projectId.localeCompare(b.projectId),
  );
}

/**
 * Collapse memberships to one row per (email, project) — the only key an
 * activity row can be joined on, since events carry an author email and a
 * project, never a userId.
 *
 * The same person can hold two membership rows on one project (a re-invite
 * leaves the removed row behind), so the merge is deliberate rather than
 * first-wins: roles union, admin wins, and any live row beats a deleted one.
 * Collapsing the other way would report an active member as removed.
 */
export function mergeMembershipsByEmailProject(
  memberships: readonly MembershipLike[],
): Map<string, MembershipLike> {
  const byKey = new Map<string, MembershipLike>();
  for (const m of memberships) {
    const email = m.email.trim().toLowerCase();
    if (!email || !m.projectId) continue;
    const key = `${email}::${m.projectId}`;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, { ...m, email });
      continue;
    }
    byKey.set(key, {
      email,
      projectId: m.projectId,
      roles: [...new Set([...cur.roles, ...m.roles])],
      status: cur.status === "deleted" ? m.status : cur.status,
      modules: [...new Set([...cur.modules, ...m.modules])],
      adminModules: [...new Set([...cur.adminModules, ...m.adminModules])],
    });
  }
  return byKey;
}
