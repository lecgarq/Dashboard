import { tableFromArrays, type Table } from "apache-arrow";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { computeSimilarityEdges, SIMILARITY_DIMS, type SimilarityInput } from "@/lib/acc/userSimilarity";
import type { AccTopologyGraph } from "../accGraphOrganicLayout";

export interface GraphArrowTables {
  users: Table;
  userProjects: Table;
  similarityEdges: Table;
  folderPermissions: Table;
}

export interface GraphFolderPermissionRow {
  folderId: string;
  folderPath: string;
  projectId: string;
  roleId: string;
  permType: string;
}

export interface BuildGraphArrowTablesInput {
  users: BulkAccUser[];
  similarityInput: SimilarityInput | null;
  topology: AccTopologyGraph | null;
  folderRows?: readonly GraphFolderPermissionRow[];
}

function userIdFor(email: string): string {
  return email.trim().toLowerCase();
}

function timestampMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
}

function stripHubPrefix(id: string, kind: string): string {
  const prefix = `${kind}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function labelByHiddenNode(topology: AccTopologyGraph | null): Map<string, string> {
  const labels = new Map<string, string>();
  for (const node of topology?.hiddenNodes ?? []) labels.set(node.id, node.label);
  return labels;
}

function folderProjectMap(topology: AccTopologyGraph | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const link of topology?.links ?? []) {
    if (link.kind !== "folder-project") continue;
    const folderId = link.source.startsWith("folder:") ? link.source : link.target;
    const projectId = link.source.startsWith("project:") ? link.source : link.target;
    out.set(folderId, stripHubPrefix(projectId, "project"));
  }
  return out;
}

export function buildSimilarityInputFromUsers(
  users: readonly BulkAccUser[],
  folderRows: readonly GraphFolderPermissionRow[] = [],
): SimilarityInput {
  const folderIdsByRole = new Map<string, Set<string>>();
  for (const row of folderRows) {
    const set = folderIdsByRole.get(row.roleId) ?? new Set<string>();
    set.add(row.folderId);
    folderIdsByRole.set(row.roleId, set);
  }

  return {
    users: users.map((user) => {
      const roleIds = new Set([...(user.allRoles ?? []), ...(user.perProjectRoleNames ?? [])].filter(Boolean));
      for (const project of user.projects ?? []) for (const role of project.roles ?? []) if (role) roleIds.add(role);
      const folderIds = new Set<string>();
      for (const roleId of roleIds) for (const folderId of folderIdsByRole.get(roleId) ?? []) folderIds.add(folderId);
      const BASELINE = new Set(["docs", "insight"]);
      const moduleIds = [...new Set((user.projects ?? []).flatMap((p) => p.modules ?? []))]
        .filter((m) => !BASELINE.has(m));
      return {
        id: userIdFor(user.email),
        projectIds: user.projects.map((project) => project.id).filter(Boolean),
        roleIds: [...roleIds],
        folderIds: [...folderIds],
        activityFileIds: [],
        coverageFlags: [
          user.found ? "acc-found" : "",
          user.projects.length > 0 ? "has-projects" : "",
          user.lastSignIn ? "has-last-sign-in" : "",
          user.addedOn ? "has-added-on" : "",
        ].filter(Boolean),
        lastSignIn: timestampMillis(user.lastSignIn),
        addedAt: timestampMillis(user.addedOn),
        isAdmin: user.isAccountAdmin === true || (user.adminCount ?? 0) > 0,
        isExternal: user.isExternal === true,
        companyRole: null,
        moduleIds,
        firmId: user.firmId ?? null,
      };
    }),
  };
}

export async function buildGraphArrowTables(input: BuildGraphArrowTablesInput): Promise<GraphArrowTables> {
  const labels = labelByHiddenNode(input.topology);
  const folderProjects = folderProjectMap(input.topology);

  const usersRows = input.users.map((user) => ({
    user_id: userIdFor(user.email),
    email: user.email,
    name: user.name,
    found: user.found,
    project_count: user.projectCount,
    active_count: user.activeCount,
    admin_count: user.adminCount,
    is_account_admin: user.isAccountAdmin,
    company_role: user.companyRole ?? "",
    last_sign_in: timestampMillis(user.lastSignIn),
    added_on: timestampMillis(user.addedOn),
    aggregated_status: user.aggregatedStatus ?? "",
    company_name: user.companyName?.trim() || "Unknown",
    firm_name: user.firmName ?? "",
    account_status: user.accountStatus ?? "",
    permission_coverage: user.permissionCoverage ?? "unknown",
  }));

  const projectRows = input.users.flatMap((user) => {
    const uid = userIdFor(user.email);
    return user.projects.flatMap((project) => {
      const roles = project.roles.length ? project.roles : [""];
      return roles.map((role) => ({
        user_id: uid,
        email: user.email,
        project_id: project.id,
        project_name: project.name?.trim() || "Unknown",
        project_status: project.status,
        is_project_admin: project.isAdmin,
        role_id: role?.trim() || "Unknown",
        module_ids: project.modules.join("|"),
        added_on: timestampMillis(project.addedOn),
        last_sign_in_instance: timestampMillis(project.lastSignIn),
        perm_strength: project.permissionStrength ?? 0,
        folder_breadth: project.folderBreadth ?? 0,
        full_controller: project.fullController ?? false,
        perm_mixed: project.permMixedProfile ?? false,
      }));
    });
  });

  const similarityRows = input.similarityInput
    ? computeSimilarityEdges(input.similarityInput, new Set(SIMILARITY_DIMS), 0.01).map((edge) => ({
        source_user_id: edge.userA,
        target_user_id: edge.userB,
        dimension: edge.dimension,
        score: edge.score,
      }))
    : [];

  const topologyFolderRows = (input.topology?.links ?? [])
    .filter((link) => link.kind === "role-folder")
    .map((link) => {
      const roleHubId = link.source.startsWith("role:") ? link.source : link.target;
      const folderHubId = link.source.startsWith("folder:") ? link.source : link.target;
      return {
        role_id: stripHubPrefix(roleHubId, "role"),
        folder_id: stripHubPrefix(folderHubId, "folder"),
        folder_label: labels.get(folderHubId) ?? stripHubPrefix(folderHubId, "folder"),
        project_id: folderProjects.get(folderHubId) ?? "",
        perm_tier: link.permTier ?? "view",
      };
    });
  const matrixFolderRows = (input.folderRows ?? []).map((row) => ({
    role_id: row.roleId,
    folder_id: row.folderId,
    folder_label: row.folderPath.split("/").filter(Boolean).at(-1) ?? row.folderPath,
    project_id: row.projectId,
    perm_tier: row.permType,
  }));
  const folderRows = [...topologyFolderRows, ...matrixFolderRows];

  return {
    users: tableFromArrays({
      user_id: usersRows.map((row) => row.user_id),
      email: usersRows.map((row) => row.email),
      name: usersRows.map((row) => row.name),
      found: usersRows.map((row) => row.found),
      project_count: Int32Array.from(usersRows.map((row) => row.project_count)),
      active_count: Int32Array.from(usersRows.map((row) => row.active_count)),
      admin_count: Int32Array.from(usersRows.map((row) => row.admin_count)),
      is_account_admin: usersRows.map((row) => row.is_account_admin),
      company_role: usersRows.map((row) => row.company_role),
      last_sign_in: usersRows.map((row) => row.last_sign_in),
      added_on: usersRows.map((row) => row.added_on),
      aggregated_status: usersRows.map((row) => row.aggregated_status),
      company_name: usersRows.map((row) => row.company_name),
      firm_name: usersRows.map((row) => row.firm_name),
      account_status: usersRows.map((row) => row.account_status),
      permission_coverage: usersRows.map((row) => row.permission_coverage),
    }),
    userProjects: tableFromArrays({
      user_id: projectRows.map((row) => row.user_id),
      email: projectRows.map((row) => row.email),
      project_id: projectRows.map((row) => row.project_id),
      project_name: projectRows.map((row) => row.project_name),
      project_status: projectRows.map((row) => row.project_status),
      is_project_admin: projectRows.map((row) => row.is_project_admin),
      role_id: projectRows.map((row) => row.role_id),
      module_ids: projectRows.map((row) => row.module_ids),
      added_on: projectRows.map((row) => row.added_on),
      last_sign_in_instance: projectRows.map((row) => row.last_sign_in_instance),
      perm_strength: Int32Array.from(projectRows.map((row) => row.perm_strength)),
      folder_breadth: Int32Array.from(projectRows.map((row) => row.folder_breadth)),
      full_controller: projectRows.map((row) => row.full_controller),
      perm_mixed: projectRows.map((row) => row.perm_mixed),
    }),
    similarityEdges: tableFromArrays({
      source_user_id: similarityRows.map((row) => row.source_user_id),
      target_user_id: similarityRows.map((row) => row.target_user_id),
      dimension: similarityRows.map((row) => row.dimension),
      score: Float64Array.from(similarityRows.map((row) => row.score)),
    }),
    folderPermissions: tableFromArrays({
      role_id: folderRows.map((row) => row.role_id),
      folder_id: folderRows.map((row) => row.folder_id),
      folder_label: folderRows.map((row) => row.folder_label),
      project_id: folderRows.map((row) => row.project_id),
      perm_tier: folderRows.map((row) => row.perm_tier),
    }),
  };
}

