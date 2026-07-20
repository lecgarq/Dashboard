import type { BulkAccUser } from "./acc-types";

export type CompactGraphUser = [
  userId: string,
  name: string,
  activeCount: number,
  lastSignIn: string | null,
  firmName: string,
  accountStatus: string,
  permissionCoverage: "known" | "partial" | "unknown",
];

export type CompactGraphProject = [
  userIndex: number,
  projectId: string,
  projectName: string,
  projectStatus: string,
  isAdmin: boolean,
  role: string,
  modules: string,
  addedOn: string | null,
  lastSignIn: string | null,
  permissionStrength: number,
  folderBreadth: number,
  accessibleDataBytes: number,
  fullController: boolean,
  permissionMixed: boolean,
  activityMix: Partial<Record<string, number>>,
  actionCounts: Record<string, number>,
  activityTotal: number,
  lastActivity: string | null,
];

export interface CompactGraphPayload {
  users: CompactGraphUser[];
  projects: CompactGraphProject[];
}

export interface CompressedGraphSnapshot {
  gzipBase64: string;
}

/** Normalize the graph-critical subset without repeating user fields per project. */
export function buildCompactGraphPayload(users: readonly BulkAccUser[]): CompactGraphPayload {
  const compactUsers: CompactGraphUser[] = users.map((user) => [
    user.email.trim().toLowerCase(),
    user.name,
    user.activeCount,
    user.lastSignIn ?? null,
    user.firmName ?? "",
    user.accountStatus ?? "",
    user.permissionCoverage ?? "unknown",
  ]);

  const projectsByNodeId = new Map<string, CompactGraphProject>();
  users.forEach((user, userIndex) => {
    const userId = compactUsers[userIndex][0];
    for (const project of user.projects) {
      const nodeId = `${userId}::${project.id}`;
      if (projectsByNodeId.has(nodeId)) continue;
      projectsByNodeId.set(nodeId, [
        userIndex,
        project.id,
        project.name?.trim() || "Unknown",
        project.status,
        project.isAdmin,
        project.roles[0]?.trim() || "Unknown",
        project.modules.join("|"),
        project.addedOn ?? null,
        project.lastSignIn ?? null,
        project.permissionStrength ?? 0,
        project.folderBreadth ?? 0,
        project.accessibleDataBytes ?? 0,
        project.fullController ?? false,
        project.permMixedProfile ?? false,
        project.activityMix ?? {},
        project.actionCounts ?? {},
        project.activityTotal ?? 0,
        project.lastActivity ?? null,
      ]);
    }
  });

  return {
    users: compactUsers,
    projects: [...projectsByNodeId.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, project]) => project),
  };
}
