import "server-only";
import { db } from "@/server/db";
import {
  rankForTier,
  type FolderTerrainData,
  type TerrainCell,
  type TerrainUser,
} from "@/app/(dashboard)/access-analysis/folderTerrain";
import { resolveEffectiveTier } from "@/app/(dashboard)/access-analysis/folderInheritance";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import { TEMPLATE_MTY_ROSTER } from "@/lib/acc/template-mty-roster";

export interface ChangedTerrainInput {
  projectId: string;
  projectName: string;
  office?: string;
  folders: Array<{ id: string; parentId: string | null; name: string; fullPath: string | null }>;
  perms: Array<{ folderId: string; roleId: string; roleName: string; permType: string; actionCount: number }>;
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
 * Tiers are resolved through ACC inheritance first: a folder with empty actions
 * for a role adopts its nearest explicit ancestor's level (so a folder under a
 * Full-Controller "Project Files" reads as Full Controller, not the stored
 * "View Only" floor). A folder is then `inherited` when its EFFECTIVE grants equal
 * its parent's (no deliberate override). Bar height = number of the given roster
 * members holding each role (roles without roster members render at the floor
 * height). Pure — no I/O — so it is unit-tested.
 */
export function buildFolderTerrain(input: ChangedTerrainInput): FolderTerrainData | null {
  const { folders, perms, roster } = input;
  const byId = new Map(folders.map((f) => [f.id, f]));

  // roleId → {roleName, permType, actionCount} per folder. actionCount 0 ⇒ the
  // grant is INHERITED (ACC stores actions only where a permission is explicitly set).
  const permsByFolder = new Map<string, Map<string, { roleName: string; permType: string; actionCount: number }>>();
  for (const p of perms) {
    let m = permsByFolder.get(p.folderId);
    if (!m) { m = new Map(); permsByFolder.set(p.folderId, m); }
    m.set(p.roleId, { roleName: p.roleName, permType: p.permType, actionCount: p.actionCount });
  }

  const projectFiles = folders.find((f) => f.name === "Project Files");
  if (!projectFiles) return null;

  const childrenOf = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const arr = childrenOf.get(f.parentId);
    if (arr) arr.push(f); else childrenOf.set(f.parentId, [f]);
  }

  // BFS from Project Files (level 1) — parent before child — resolving each
  // folder's EFFECTIVE grants: it inherits the parent's already-resolved set, then
  // its own explicit (non-empty) grants override; an empty-actions grant keeps the
  // inherited level (or the View-Only floor when nothing is inherited). A folder is
  // `inherited` when its effective grants equal its parent's (no deliberate
  // override), so the panel can mute pure inheritors while still showing their true
  // (inherited) tier. Keep every level ≥2 folder that carries a permission, with
  // its nesting `depth` (level − 2).
  const effByFolder = new Map<string, Map<string, { permType: string; rank: number }>>();
  const effSig = (id: string): string => {
    const m = effByFolder.get(id);
    if (!m) return "";
    return [...m.entries()].map(([rid, v]) => `${rid}|${v.permType}`).sort().join(",");
  };
  type FolderRow = { id: string; name: string; fullPath: string | null; inherited: boolean; depth: number };
  const all: FolderRow[] = [];
  const queue: Array<{ f: (typeof folders)[number]; level: number }> = [{ f: projectFiles, level: 1 }];
  while (queue.length > 0) {
    const { f, level } = queue.shift()!;
    const parentEff = f.parentId ? effByFolder.get(f.parentId) : undefined;
    const eff = new Map(parentEff ?? []);
    for (const [rid, v] of permsByFolder.get(f.id) ?? []) {
      const pe = parentEff?.get(rid);
      const r = resolveEffectiveTier(
        { permType: v.permType, actionCount: v.actionCount },
        pe ? { permType: pe.permType, actionCount: 1 } : undefined,
      );
      eff.set(rid, { permType: r.tier, rank: r.rank });
    }
    effByFolder.set(f.id, eff);
    if (level >= 2 && permsByFolder.has(f.id)) {
      const inherited = effSig(f.id) === (f.parentId ? effSig(f.parentId) : "");
      all.push({ id: f.id, name: f.name, fullPath: f.fullPath, inherited, depth: level - 2 });
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
    const eff = effByFolder.get(cf.id);
    for (const [rid, v] of permsByFolder.get(cf.id) ?? []) {
      const e = eff?.get(rid);
      cells.push({
        folderId: cf.id,
        folderName: cf.name,
        roleId: rid,
        roleName: v.roleName,
        tier: e?.permType ?? v.permType,
        rank: e?.rank ?? rankForTier(v.permType),
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
    db.$queryRaw<Array<{ folder_id: string; role_id: string; role_name: string; perm_type: string; n_actions: number }>>`
      SELECT fp."folderId" AS folder_id, fp."roleId" AS role_id, r.name AS role_name, fp."permType" AS perm_type,
             COALESCE(cardinality(fp.actions), 0)::int AS n_actions
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
    perms: perms.map((p) => ({ folderId: p.folder_id, roleId: p.role_id, roleName: p.role_name, permType: p.perm_type, actionCount: p.n_actions })),
    roster: TEMPLATE_MTY_ROSTER.map((r) => ({ name: r.name, email: r.email, role: r.role })),
    generatedAt: new Date().toISOString(),
  });
}
