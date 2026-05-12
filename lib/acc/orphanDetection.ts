/**
 * orphanDetection.ts
 *
 * Pure module that detects 4 kinds of permission orphans across
 * AccFolder × AccFolderPermission × AccProjectRole snapshots.
 *
 * No Prisma, no I/O — fully unit-testable in isolation.
 *
 * Consumed by:
 *   - server/routers/acc-folders.ts (Plan 04-05): getMatrix + getOrphanRoles
 *
 * Key format:
 *   - `${folderId}::${roleId}` for (folder, role) orphans
 *   - `${folderId}::`          for folder-level orphans (no roleId)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrphanReason =
  | "role_zero_members" // role granted on folder but role has 0 members in that project
  | "permission_missing_folder" // permission row references a folder no longer in AccFolder
  | "root_only_zero_members" // role granted only at root and project has 0 members
  | "folder_no_permissions"; // folder exists but no role permissions defined

export interface OrphanInput {
  folders: Array<{
    id: string;
    projectId: string;
    parentId: string | null;
    fullPath: string | null;
  }>;
  permissions: Array<{
    folderId: string;
    roleId: string;
    permType: string;
    actions: string[];
  }>;
  /** Per-project per-role member counts (memberId NOT NULL count). */
  projectRoles: Array<{ projectId: string; roleId: string; memberCount: number }>;
  /** Per-project total member count. */
  projectMembers: Array<{ projectId: string; memberCount: number }>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Determine whether a folder is "root" for orphan-detection purposes:
 *   - parentId === null, OR
 *   - fullPath has at most one segment (e.g. "/Project Files" with no further "/")
 */
function isRootFolder(folder: { parentId: string | null; fullPath: string | null }): boolean {
  if (folder.parentId === null) return true;
  if (folder.fullPath) {
    const trimmed = folder.fullPath.replace(/^\/+/, "").replace(/\/+$/, "");
    // "Project Files" → 0 inner slashes → root.
    if (!trimmed.includes("/")) return true;
  }
  return false;
}

export function detectOrphans(input: OrphanInput): Map<string, OrphanReason[]> {
  const out = new Map<string, OrphanReason[]>();

  const folderById = new Map(input.folders.map((f) => [f.id, f]));
  const folderSet = new Set(input.folders.map((f) => f.id));

  const roleMemberCount = new Map<string, number>();
  for (const pr of input.projectRoles) {
    roleMemberCount.set(`${pr.projectId}::${pr.roleId}`, pr.memberCount);
  }

  const projectMemberCount = new Map<string, number>();
  for (const pm of input.projectMembers) {
    projectMemberCount.set(pm.projectId, pm.memberCount);
  }

  const folderHasAnyPermission = new Set<string>();
  for (const p of input.permissions) {
    folderHasAnyPermission.add(p.folderId);
  }

  const push = (key: string, reason: OrphanReason) => {
    const existing = out.get(key);
    if (existing) {
      if (!existing.includes(reason)) existing.push(reason);
    } else {
      out.set(key, [reason]);
    }
  };

  // ---- Per-permission checks -------------------------------------------
  for (const p of input.permissions) {
    const key = `${p.folderId}::${p.roleId}`;
    const folder = folderById.get(p.folderId);

    // permission_missing_folder
    if (!folderSet.has(p.folderId)) {
      push(key, "permission_missing_folder");
    }

    // role_zero_members — needs project context; if folder is missing we cannot
    // resolve projectId, so we fall back to scanning roleMemberCount for ANY
    // project that has this role with 0 members. The simpler contract: if no
    // project has this role with ≥1 member, flag it.
    if (folder) {
      const projectId = folder.projectId;
      const count = roleMemberCount.get(`${projectId}::${p.roleId}`) ?? 0;
      if (count === 0) push(key, "role_zero_members");
    } else {
      // Folder missing — check across all projects for this role.
      let anyMembers = false;
      for (const [k, v] of roleMemberCount) {
        if (k.endsWith(`::${p.roleId}`) && v > 0) {
          anyMembers = true;
          break;
        }
      }
      if (!anyMembers) push(key, "role_zero_members");
    }

    // root_only_zero_members
    if (folder && isRootFolder(folder)) {
      const pmc = projectMemberCount.get(folder.projectId) ?? 0;
      if (pmc === 0) push(key, "root_only_zero_members");
    }
  }

  // ---- Folder-level check ---------------------------------------------
  for (const f of input.folders) {
    if (!folderHasAnyPermission.has(f.id)) {
      out.set(`${f.id}::`, ["folder_no_permissions"]);
    }
  }

  return out;
}
