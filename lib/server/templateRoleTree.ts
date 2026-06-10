import "server-only";
import { db } from "@/server/db";
import { rankForTier, TIER_LEGEND } from "@/app/(dashboard)/access-analysis/folderTerrain";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

export interface RoleTreeFolder {
  id: string;
  name: string;
  path: string | null;
}

export interface RoleTreeTier {
  rank: number; // 1..5
  label: string; // from TIER_LEGEND
  folders: RoleTreeFolder[];
}

export interface RoleTreeNode {
  roleId: string;
  roleName: string;
  folderCount: number;
  /** Tiers this role holds, ordered by rank desc (Full control → View only). */
  tiers: RoleTreeTier[];
}

const RANK_LABEL = new Map(TIER_LEGEND.map((t) => [t.rank, t.label]));

/**
 * Group every folder permission by role, then by permission tier — the data for
 * the "what can each role reach?" tree. A (folder, role) pair carries exactly one
 * tier (DB unique on folderId+roleId), so a folder appears once per role. Pure —
 * no I/O — so it is unit-tested.
 */
export function buildRolePermissionTree(
  perms: ReadonlyArray<{ folderId: string; roleId: string; roleName: string; permType: string }>,
  folders: ReadonlyArray<{ id: string; name: string; fullPath: string | null }>,
): RoleTreeNode[] {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const roles = new Map<string, { name: string; byRank: Map<number, RoleTreeFolder[]> }>();

  for (const p of perms) {
    const f = folderById.get(p.folderId);
    if (!f) continue;
    let r = roles.get(p.roleId);
    if (!r) { r = { name: p.roleName, byRank: new Map() }; roles.set(p.roleId, r); }
    const rank = rankForTier(p.permType);
    const arr = r.byRank.get(rank) ?? [];
    arr.push({ id: f.id, name: f.name, path: f.fullPath });
    r.byRank.set(rank, arr);
  }

  const nodes: RoleTreeNode[] = [...roles.entries()].map(([roleId, r]) => {
    const tiers: RoleTreeTier[] = [...r.byRank.entries()]
      .map(([rank, fs]) => ({
        rank,
        label: RANK_LABEL.get(rank) ?? `Tier ${rank}`,
        folders: [...fs].sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name)),
      }))
      .sort((a, b) => b.rank - a.rank);
    const folderCount = tiers.reduce((s, t) => s + t.folders.length, 0);
    return { roleId, roleName: r.name, folderCount, tiers };
  });

  return nodes.sort((a, b) => b.folderCount - a.folderCount || a.roleName.localeCompare(b.roleName));
}

/**
 * Load the Template MTY role→folder-permission tree: every folder that has
 * permissions (no changed-only filter), grouped by role then tier.
 */
export async function loadTemplateRoleTree(): Promise<RoleTreeNode[]> {
  const [folders, perms] = await Promise.all([
    db.accFolder.findMany({
      where: { projectId: TEMPLATE_MTY_ID },
      select: { id: true, name: true, fullPath: true },
    }),
    db.$queryRaw<Array<{ folder_id: string; role_id: string; role_name: string; perm_type: string }>>`
      SELECT fp."folderId" AS folder_id, fp."roleId" AS role_id, r.name AS role_name, fp."permType" AS perm_type
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      WHERE f."projectId" = ${TEMPLATE_MTY_ID}
    `,
  ]);

  return buildRolePermissionTree(
    perms.map((p) => ({ folderId: p.folder_id, roleId: p.role_id, roleName: p.role_name, permType: p.perm_type })),
    folders,
  );
}
