import "server-only";
import { db } from "@/server/db";
import { buildRolePermissionTree } from "@/lib/server/templateRoleTree";
import { buildRoleSimilarityGraph, type RoleSimilarityGraph } from "@/lib/acc/roleSimilarity";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

/**
 * Folder ids whose permission set is EXPLICIT — i.e. differs from their parent's
 * — within the "Project Files" subtree, INCLUDING Project Files itself. Inherited
 * folders (identical set to the parent) are dropped. This is the changed-folder
 * set the terrain uses PLUS the top-level Project Files folder, so the role
 * similarity keeps the top-level decision (which separates Full-Control roles from
 * View+Download roles) while dropping inherited noise. Pure — unit-tested.
 */
export function explicitFolderIds(
  folders: ReadonlyArray<{ id: string; parentId: string | null; name: string }>,
  perms: ReadonlyArray<{ folderId: string; roleId: string; permType: string }>,
): Set<string> {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const permsByFolder = new Map<string, Map<string, string>>();
  for (const p of perms) {
    let m = permsByFolder.get(p.folderId);
    if (!m) { m = new Map(); permsByFolder.set(p.folderId, m); }
    m.set(p.roleId, p.permType);
  }
  const sig = (id: string): string => {
    const m = permsByFolder.get(id);
    if (!m) return "";
    return [...m.entries()].map(([rid, pt]) => `${rid}|${pt}`).sort().join(",");
  };

  const projectFiles = folders.find((f) => f.name === "Project Files");
  if (!projectFiles) return new Set<string>();

  const childrenOf = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const arr = childrenOf.get(f.parentId);
    if (arr) (arr as Array<(typeof folders)[number]>).push(f);
    else childrenOf.set(f.parentId, [f]);
  }

  // BFS from Project Files (inclusive). Keep folders with permissions whose
  // signature differs from their parent's.
  const explicit = new Set<string>();
  const queue: Array<(typeof folders)[number]> = [projectFiles];
  while (queue.length > 0) {
    const f = queue.shift()!;
    if (permsByFolder.has(f.id)) {
      const parentSig = f.parentId && byId.has(f.parentId) ? sig(f.parentId) : "";
      if (sig(f.id) !== parentSig) explicit.add(f.id);
    }
    for (const ch of childrenOf.get(f.id) ?? []) queue.push(ch);
  }
  return explicit;
}

/**
 * Load the Template MTY role-similarity graph computed over EXPLICIT permissions
 * only (inherited folders excluded, Project Files included).
 */
export async function loadTemplateRoleSimilarity(): Promise<RoleSimilarityGraph> {
  const [folders, perms] = await Promise.all([
    db.accFolder.findMany({
      where: { projectId: TEMPLATE_MTY_ID },
      select: { id: true, parentId: true, name: true },
    }),
    db.$queryRaw<Array<{ folder_id: string; role_id: string; role_name: string; perm_type: string }>>`
      SELECT fp."folderId" AS folder_id, fp."roleId" AS role_id, r.name AS role_name, fp."permType" AS perm_type
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      WHERE f."projectId" = ${TEMPLATE_MTY_ID}
    `,
  ]);

  const mapped = perms.map((p) => ({ folderId: p.folder_id, roleId: p.role_id, roleName: p.role_name, permType: p.perm_type }));
  const explicit = explicitFolderIds(folders, mapped);

  const tree = buildRolePermissionTree(
    mapped.filter((p) => explicit.has(p.folderId)),
    folders.filter((f) => explicit.has(f.id)).map((f) => ({ id: f.id, name: f.name, fullPath: null })),
  );
  return buildRoleSimilarityGraph(tree);
}
