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
