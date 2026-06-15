import "server-only";
import { db } from "@/server/db";
import {
  rankForTier,
  type FolderTerrainData,
  type TerrainCell,
  type TerrainUser,
} from "@/app/(dashboard)/access-analysis/folderTerrain";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import { TEMPLATE_MTY_ROSTER } from "@/lib/acc/template-mty-roster";

export interface ChangedTerrainInput {
  projectId: string;
  projectName: string;
  office?: string;
  folders: Array<{ id: string; parentId: string | null; name: string; fullPath: string | null }>;
  perms: Array<{ folderId: string; roleId: string; roleName: string; permType: string }>;
  /** Roster members — supply role names so bar height = members in that role. */
  roster: Array<{ name: string; email: string; role: string }>;
  generatedAt: string;
}

/**
 * Build a folder-permission terrain over EVERY folder (level ≥ 2 under "Project
 * Files") that carries a permission, at any nesting depth. Each folder is tagged
 * `inherited` when its role→tier permission set is identical to its parent's (a
 * pure inheritor) and `depth` (0 = top-level under Project Files, increasing with
 * nesting). The panel renders inheritors muted so the *explicitly changed*
 * folders — where someone made a deliberate access decision — stand out.
 *
 * Inheritance is detected by comparing each folder's permission signature
 * (sorted "roleId|permType" pairs) to its parent's. Bar height = number of the
 * given roster members holding each role (roles without roster members render at
 * the floor height). Pure — no I/O — so it is unit-tested.
 */
export function buildFolderTerrain(input: ChangedTerrainInput): FolderTerrainData | null {
  const { folders, perms, roster } = input;
  const byId = new Map(folders.map((f) => [f.id, f]));

  // roleId → {roleName, permType} per folder, plus a signature for inheritance.
  const permsByFolder = new Map<string, Map<string, { roleName: string; permType: string }>>();
  for (const p of perms) {
    let m = permsByFolder.get(p.folderId);
    if (!m) { m = new Map(); permsByFolder.set(p.folderId, m); }
    m.set(p.roleId, { roleName: p.roleName, permType: p.permType });
  }
  const sig = (id: string): string => {
    const m = permsByFolder.get(id);
    if (!m) return "";
    return [...m.entries()].map(([rid, v]) => `${rid}|${v.permType}`).sort().join(",");
  };

  const projectFiles = folders.find((f) => f.name === "Project Files");
  if (!projectFiles) return null;

  const childrenOf = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const arr = childrenOf.get(f.parentId);
    if (arr) arr.push(f); else childrenOf.set(f.parentId, [f]);
  }

  // BFS from Project Files (level 1). Keep every level ≥2 folder that carries a
  // permission, tagging each as `inherited` (perm signature identical to its
  // parent's — no explicit override) and with its nesting `depth` (level − 2).
  type FolderRow = { id: string; name: string; fullPath: string | null; inherited: boolean; depth: number };
  const all: FolderRow[] = [];
  const queue: Array<{ f: (typeof folders)[number]; level: number }> = [{ f: projectFiles, level: 1 }];
  while (queue.length > 0) {
    const { f, level } = queue.shift()!;
    if (level >= 2 && permsByFolder.has(f.id)) {
      const parentSig = f.parentId ? sig(f.parentId) : "";
      all.push({ id: f.id, name: f.name, fullPath: f.fullPath, inherited: sig(f.id) === parentSig, depth: level - 2 });
    }
    for (const ch of childrenOf.get(f.id) ?? []) queue.push({ f: ch, level: level + 1 });
  }
  if (all.length === 0) return null;

  // Order by full path so each folder sits next to its descendants (a depth-first
  // walk down the folder axis), keeping the hierarchy legible.
  all.sort((a, b) => (a.fullPath ?? a.name).localeCompare(b.fullPath ?? b.name));

  // Roles present on any folder, ordered by how many folders use the role.
  const roleUse = new Map<string, { name: string; folders: number }>();
  for (const cf of all) {
    for (const [rid, v] of permsByFolder.get(cf.id) ?? []) {
      const e = roleUse.get(rid) ?? { name: v.roleName, folders: 0 };
      e.folders += 1;
      roleUse.set(rid, e);
    }
  }
  const roles = [...roleUse.entries()]
    .sort((a, b) => b[1].folders - a[1].folders || a[1].name.localeCompare(b[1].name))
    .map(([id, v]) => ({ id, name: v.name }));

  // Roster members per role name → users behind each role's bar height.
  const rosterByRole = new Map<string, TerrainUser[]>();
  for (const r of roster) {
    const arr = rosterByRole.get(r.role);
    if (arr) arr.push({ name: r.name, email: r.email });
    else rosterByRole.set(r.role, [{ name: r.name, email: r.email }]);
  }
  const usersByRole: Record<string, TerrainUser[]> = {};
  for (const role of roles) usersByRole[role.id] = rosterByRole.get(role.name) ?? [];

  const cells: TerrainCell[] = [];
  for (const cf of all) {
    for (const [rid, v] of permsByFolder.get(cf.id) ?? []) {
      cells.push({
        folderId: cf.id,
        folderName: cf.name,
        roleId: rid,
        roleName: v.roleName,
        tier: v.permType,
        rank: rankForTier(v.permType),
        userCount: usersByRole[rid]?.length ?? 0,
        inherited: cf.inherited,
      });
    }
  }

  const maxUserCount = Math.max(0, ...Object.values(usersByRole).map((u) => u.length));

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    office: input.office ?? "",
    folders: all.map((c) => ({ id: c.id, name: c.name, inherited: c.inherited, depth: c.depth })),
    roles,
    cells,
    usersByRole,
    maxUserCount,
    heightMetric: "users",
    generatedAt: input.generatedAt,
  };
}

/**
 * Load the Template MTY terrain of all explicitly-changed folders. Reads the
 * crawled folders + role permissions for the template, then builds the
 * changed-only terrain with roster-derived bar heights.
 */
export async function loadTemplateFolderTerrain(): Promise<FolderTerrainData | null> {
  const [project, folders, perms] = await Promise.all([
    db.accProject.findUnique({ where: { id: TEMPLATE_MTY_ID }, select: { name: true } }),
    db.accFolder.findMany({
      where: { projectId: TEMPLATE_MTY_ID },
      select: { id: true, parentId: true, name: true, fullPath: true },
    }),
    db.$queryRaw<Array<{ folder_id: string; role_id: string; role_name: string; perm_type: string }>>`
      SELECT fp."folderId" AS folder_id, fp."roleId" AS role_id, r.name AS role_name, fp."permType" AS perm_type
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      WHERE f."projectId" = ${TEMPLATE_MTY_ID}
    `,
  ]);
  if (!project) return null;

  return buildFolderTerrain({
    projectId: TEMPLATE_MTY_ID,
    projectName: project.name ?? TEMPLATE_MTY_NAME,
    folders,
    perms: perms.map((p) => ({ folderId: p.folder_id, roleId: p.role_id, roleName: p.role_name, permType: p.perm_type })),
    roster: TEMPLATE_MTY_ROSTER.map((r) => ({ name: r.name, email: r.email, role: r.role })),
    generatedAt: new Date().toISOString(),
  });
}
