/**
 * lib/server/folderPermQuery.ts
 *
 * Owns the shared base AccFolderPermission join for QUERY-01 / REF-02.
 * Both terrain loaders (templateFolderTerrain.ts / folderPermissionTerrainView.ts)
 * import loadFolderPermRows instead of inlining the SQL.
 *
 * Both scope branches MUST remain plain tagged-template db.$queryRaw — no
 * Prisma.sql / Prisma.raw / Prisma.join — so TEST-02 and TEST-03 stay
 * byte-identical (the mock inspects call args, not a composed Sql object).
 *
 * Do NOT add single-use queries here (parentPerms, density, overview CTE,
 * Project-Files parent-grants). Base join only.
 */
import "server-only";
import { db } from "@/server/db";

export interface FolderPermRow {
  folder_id: string;
  role_id: string;
  role_name: string;
  perm_type: string;
  n_actions: number;
}

/**
 * Load the base per-project AccFolderPermission rows.
 *
 * Default branch (all folders): selects every folder in the project that
 * carries a permission, at any nesting depth. Used by /template-mty.
 *
 * l2Only branch: restricts to L2 folders only (direct children of the
 * "Project Files" root) via an extra JOIN to the parent folder. Used by
 * /access-analysis. The scope difference is intentional and must be preserved.
 *
 * The only interpolated value in each branch is `projectId`; `l2Only`
 * selects a static SQL branch — it never contributes SQL text.
 */
export async function loadFolderPermRows(
  projectId: string,
  opts?: { l2Only?: boolean },
): Promise<FolderPermRow[]> {
  if (opts?.l2Only) {
    return db.$queryRaw<FolderPermRow[]>`
      SELECT fp."folderId" AS folder_id, fp."roleId" AS role_id,
             r.name AS role_name, fp."permType" AS perm_type,
             COALESCE(cardinality(fp.actions), 0)::int AS n_actions
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
      WHERE f."projectId" = ${projectId}
    `;
  }
  return db.$queryRaw<FolderPermRow[]>`
    SELECT fp."folderId" AS folder_id, fp."roleId" AS role_id, r.name AS role_name, fp."permType" AS perm_type,
           COALESCE(cardinality(fp.actions), 0)::int AS n_actions
    FROM "AccFolderPermission" fp
    JOIN "AccRole" r ON r.id = fp."roleId"
    JOIN "AccFolder" f ON f.id = fp."folderId"
    WHERE f."projectId" = ${projectId}
  `;
}
