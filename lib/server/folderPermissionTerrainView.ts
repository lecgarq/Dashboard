// REF-02 extraction complete — the shared base AccFolderPermission join now lives in
// lib/server/folderPermQuery.ts. loadFolderPermissionTerrain calls
// loadFolderPermRows(projectId, { l2Only: true }) instead of inlining the $queryRaw.
// Pinned by TEST-02 boundary tests and TEST-03 shared-query contract.
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { loadFolderPermRows } from "@/lib/server/folderPermQuery";
import { officeCodeFor } from "@/lib/acc/projectGroups";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import {
  rankForTier,
  compareFolderNames,
  type FolderTerrainData,
  type TerrainCell,
  type TerrainProjectOption,
  type TerrainUser,
} from "@/lib/acc/folderTerrainModel";
import { resolveEffectiveTier } from "@/lib/acc/folderInheritance";

const TTL_MS = 5 * 60 * 1000;
const mtySet = new Set(mtyAllowlist as string[]);

// ---------------------------------------------------------------------------
// Project list — every project that has ≥1 permission on an L2 folder.
// ---------------------------------------------------------------------------

let projectsCache: { at: number; data: TerrainProjectOption[] } | null = null;

export async function loadTerrainProjects(force = false): Promise<TerrainProjectOption[]> {
  if (!force && projectsCache && Date.now() - projectsCache.at < TTL_MS) return projectsCache.data;

  // Per-project folder-permission density, plus a user-coverage signal so the
  // page can default to a project whose roles actually have people in them.
  const [rows, dcUsers, liveUsers] = await Promise.all([
    db.$queryRaw<Array<{ id: string; name: string; folder_count: number; perm_count: number }>>`
      SELECT p.id, p.name,
             COUNT(DISTINCT f.id)::int  AS folder_count,
             COUNT(DISTINCT fp.id)::int AS perm_count
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
      JOIN "AccProject" p ON p.id = f."projectId"
      LEFT JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
      WHERE p.type IS DISTINCT FROM 'template'
      GROUP BY p.id, p.name
      HAVING COUNT(DISTINCT fp.id) > 0
      ORDER BY perm_count DESC
    `,
    db.$queryRaw<Array<{ project_id: string; users: number }>>`
      SELECT "projectId" AS project_id, COUNT(DISTINCT "userId")::int AS users
      FROM "AccDcProjectUserRole" GROUP BY "projectId"
    `,
    db.$queryRaw<Array<{ project_id: string; users: number }>>`
      SELECT "projectId" AS project_id, COUNT(DISTINCT "memberId")::int AS users
      FROM "AccProjectRole" WHERE "memberId" IS NOT NULL GROUP BY "projectId"
    `,
  ]);

  // Two user sources live in different id spaces; the max is a good-enough
  // "is this project staffed?" signal for ranking the default.
  const dcMap = new Map(dcUsers.map((r) => [r.project_id, r.users]));
  const liveMap = new Map(liveUsers.map((r) => [r.project_id, r.users]));

  const data: TerrainProjectOption[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    office: officeCodeFor({ id: r.id, name: r.name }, mtySet),
    folderCount: r.folder_count,
    permCount: r.perm_count,
    userRoleCount: Math.max(dcMap.get(r.id) ?? 0, liveMap.get(r.id) ?? 0),
  }));
  projectsCache = { at: Date.now(), data };
  return data;
}

// ---------------------------------------------------------------------------
// Per-project terrain — folders × roles, with the tier per cell and the users
// holding each role. Cached per project id.
// ---------------------------------------------------------------------------

const terrainCache = new Map<string, { at: number; data: FolderTerrainData }>();

export async function loadFolderPermissionTerrain(
  projectId: string,
  force = false,
): Promise<FolderTerrainData | null> {
  const hit = terrainCache.get(projectId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [project, folders, perms, parentPerms, dcRoleUsers, liveRoleUsers] = await Promise.all([
    db.accProject.findUnique({ where: { id: projectId }, select: { id: true, name: true } }),
    db.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT f.id, f.name
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
      WHERE f."projectId" = ${projectId}
    `,
    loadFolderPermRows(projectId, { l2Only: true }),
    // Parent ("Project Files") own grants per role — the source an inherited
    // (empty-actions) child folder defers to instead of the "View Only" floor.
    db.$queryRaw<Array<{ role_id: string; perm_type: string; n_actions: number }>>`
      SELECT fp."roleId" AS role_id, fp."permType" AS perm_type,
             COALESCE(cardinality(fp.actions), 0)::int AS n_actions
      FROM "AccFolderPermission" fp
      JOIN "AccFolder" f ON f.id = fp."folderId"
      WHERE f."projectId" = ${projectId} AND f.name = 'Project Files'
    `,
    // DC snapshot user→role (broadest coverage; roleId is the same APS id space).
    db.$queryRaw<Array<{ role_id: string; name: string | null; email: string | null }>>`
      SELECT ur."roleId" AS role_id, u.name, u.email
      FROM "AccDcProjectUserRole" ur
      JOIN "AccDcUser" u ON u.id = ur."userId"
      WHERE ur."projectId" = ${projectId}
    `,
    // Live sync member→role (fills projects the DC snapshot missed).
    db.$queryRaw<Array<{ role_id: string; name: string | null; email: string | null }>>`
      SELECT pr."roleId" AS role_id, m.name, m.email
      FROM "AccProjectRole" pr
      JOIN "AccProjectMember" m ON m.id = pr."memberId"
      WHERE pr."projectId" = ${projectId}
        AND pr."memberId" IS NOT NULL
        AND m.status <> 'deleted'
    `,
  ]);

  if (!project || folders.length === 0) return null;

  // roleId → distinct users holding that role, unioned across both sources and
  // deduped by email (falling back to name when a source has no email).
  const usersByRole: Record<string, TerrainUser[]> = {};
  const seen = new Map<string, Set<string>>();
  const addUser = (roleId: string, name: string | null, email: string | null) => {
    const key = (email || name || "").toLowerCase();
    if (!key) return;
    let dedupe = seen.get(roleId);
    if (!dedupe) {
      dedupe = new Set();
      seen.set(roleId, dedupe);
      usersByRole[roleId] = [];
    }
    if (!dedupe.has(key)) {
      dedupe.add(key);
      usersByRole[roleId].push({ name: name || email || "Unknown", email: email || "" });
    }
  };
  for (const r of dcRoleUsers) addUser(r.role_id, r.name, r.email);
  for (const r of liveRoleUsers) addUser(r.role_id, r.name, r.email);
  for (const list of Object.values(usersByRole)) list.sort((a, b) => a.name.localeCompare(b.name));
  const userCountFor = (roleId: string) => usersByRole[roleId]?.length ?? 0;

  // Folders in display order.
  const orderedFolders = [...folders].sort((a, b) => compareFolderNames(a.name, b.name));

  // Roles present on ≥1 folder, ordered by staffing (desc) then name.
  const roleNameById = new Map<string, string>();
  for (const p of perms) roleNameById.set(p.role_id, p.role_name);
  const orderedRoles = [...roleNameById.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => userCountFor(b.id) - userCountFor(a.id) || a.name.localeCompare(b.name));

  // Strongest explicit "Project Files" grant per role — what an inherited
  // (empty-actions) child folder adopts instead of the "View Only" floor.
  const parentByRole = new Map<string, { permType: string; actionCount: number }>();
  for (const pp of parentPerms) {
    const cur = parentByRole.get(pp.role_id);
    if (!cur || pp.n_actions > cur.actionCount) {
      parentByRole.set(pp.role_id, { permType: pp.perm_type, actionCount: pp.n_actions });
    }
  }

  const cells: TerrainCell[] = perms.map((p) => {
    const eff = resolveEffectiveTier(
      { permType: p.perm_type, actionCount: p.n_actions },
      parentByRole.get(p.role_id),
    );
    return {
      folderId: p.folder_id,
      folderName: folders.find((f) => f.id === p.folder_id)?.name ?? p.folder_id,
      roleId: p.role_id,
      roleName: p.role_name,
      tier: eff.tier,
      rank: eff.rank,
      userCount: userCountFor(p.role_id),
    };
  });

  const maxUserCount = orderedRoles.reduce((mx, r) => Math.max(mx, userCountFor(r.id)), 0);

  const data: FolderTerrainData = {
    projectId: project.id,
    projectName: project.name,
    office: officeCodeFor({ id: project.id, name: project.name }, mtySet),
    folders: orderedFolders,
    roles: orderedRoles,
    cells,
    usersByRole,
    maxUserCount,
    generatedAt: new Date().toISOString(),
  };
  terrainCache.set(projectId, { at: Date.now(), data });
  return data;
}

// ---------------------------------------------------------------------------
// Account-wide overview — every canonical L2 folder × role across ALL projects,
// coloured by the MODAL tier and raised by how many projects configure it.
// Heavy (GROUP BY over millions of perms), so it is loaded lazily and cached.
// ---------------------------------------------------------------------------

let overviewCache: { at: number; data: FolderTerrainData } | null = null;
const TOP_FOLDERS = 14;
const TOP_ROLES = 14;

export async function loadFolderPermissionOverview(force = false): Promise<FolderTerrainData> {
  if (!force && overviewCache && Date.now() - overviewCache.at < TTL_MS) return overviewCache.data;

  // Rank folders and roles by how many distinct projects use them. The most
  // frequent folder names are the canonical bare ones ("Design Documents"),
  // so the numbered one-offs ("01_…") naturally fall outside the top-N.
  const [folderRank, roleRank] = await Promise.all([
    db.$queryRaw<Array<{ folder_name: string; projects: number }>>`
      SELECT f.name AS folder_name, COUNT(DISTINCT f."projectId")::int AS projects
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
      GROUP BY f.name ORDER BY projects DESC LIMIT ${TOP_FOLDERS}
    `,
    db.$queryRaw<Array<{ role_id: string; role_name: string; projects: number }>>`
      SELECT r.id AS role_id, r.name AS role_name, COUNT(DISTINCT f."projectId")::int AS projects
      FROM "AccFolderPermission" fp
      JOIN "AccRole" r ON r.id = fp."roleId"
      JOIN "AccFolder" f ON f.id = fp."folderId"
      JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
      GROUP BY r.id, r.name ORDER BY projects DESC LIMIT ${TOP_ROLES}
    `,
  ]);

  const folderNames = folderRank.map((f) => f.folder_name);
  const roleIds = roleRank.map((r) => r.role_id);
  const roleNameById = new Map(roleRank.map((r) => [r.role_id, r.role_name]));

  // Per (folder, role, EFFECTIVE tier): how many distinct projects configure it.
  // Each project's inherited L2 folders (empty actions) are resolved to their
  // "Project Files" parent grant FIRST — the same rule as
  // folderInheritance.resolveEffectiveTier — so the cross-project modal tier
  // reflects real (inherited) access instead of the empty-actions "View Only" floor.
  const agg = folderNames.length && roleIds.length
    ? await db.$queryRaw<Array<{ folder_name: string; role_id: string; tier: string; projects: number }>>`
        WITH parent_grants AS (
          -- Strongest explicit "Project Files" grant per (project, role).
          SELECT f."projectId" AS project_id, fp."roleId" AS role_id,
                 (ARRAY_AGG(fp."permType" ORDER BY cardinality(fp.actions) DESC NULLS LAST))[1] AS parent_tier,
                 MAX(COALESCE(cardinality(fp.actions), 0)) AS parent_n
          FROM "AccFolderPermission" fp
          JOIN "AccFolder" f ON f.id = fp."folderId"
          WHERE f.name = 'Project Files'
          GROUP BY f."projectId", fp."roleId"
        ),
        eff AS (
          -- Each L2 cell's effective tier: own explicit grant, else the inherited
          -- parent grant, else the View-Only floor.
          SELECT f."projectId" AS project_id, f.name AS folder_name, fp."roleId" AS role_id,
                 CASE WHEN COALESCE(cardinality(fp.actions), 0) > 0 THEN fp."permType"
                      WHEN pg.parent_n > 0 THEN pg.parent_tier
                      ELSE fp."permType" END AS tier
          FROM "AccFolderPermission" fp
          JOIN "AccFolder" f ON f.id = fp."folderId"
          JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
          LEFT JOIN parent_grants pg ON pg.project_id = f."projectId" AND pg.role_id = fp."roleId"
          WHERE f.name IN (${Prisma.join(folderNames)}) AND fp."roleId" IN (${Prisma.join(roleIds)})
        )
        SELECT folder_name, role_id, tier, COUNT(DISTINCT project_id)::int AS projects
        FROM eff
        GROUP BY folder_name, role_id, tier
      `
    : [];

  // Fold tier rows into one cell per (folder, role): modal tier + project total.
  // The accumulator carries the ids (folder names contain spaces, so a delimited
  // string key would be fragile — a JSON-encoded key is unambiguous).
  type Acc = { folderName: string; roleId: string; tierProjects: Map<string, number>; total: number; breakdown: Record<number, number> };
  const byCell = new Map<string, Acc>();
  for (const row of agg) {
    const key = JSON.stringify([row.folder_name, row.role_id]);
    const a = byCell.get(key) ?? { folderName: row.folder_name, roleId: row.role_id, tierProjects: new Map(), total: 0, breakdown: {} };
    a.tierProjects.set(row.tier, (a.tierProjects.get(row.tier) ?? 0) + row.projects);
    a.total += row.projects;
    const rank = rankForTier(row.tier);
    a.breakdown[rank] = (a.breakdown[rank] ?? 0) + row.projects;
    byCell.set(key, a);
  }

  const cells: TerrainCell[] = [];
  let maxUserCount = 0;
  for (const a of byCell.values()) {
    let modalTier = "View Only";
    let best = -1;
    for (const [tier, n] of a.tierProjects) if (n > best) { best = n; modalTier = tier; }
    cells.push({
      folderId: a.folderName,
      folderName: a.folderName,
      roleId: a.roleId,
      roleName: roleNameById.get(a.roleId) ?? a.roleId,
      tier: modalTier,
      rank: rankForTier(modalTier),
      userCount: a.total,
      tierBreakdown: a.breakdown,
    });
    maxUserCount = Math.max(maxUserCount, a.total);
  }

  const data: FolderTerrainData = {
    projectId: "__overview__",
    projectName: "All projects",
    office: "",
    folders: [...folderNames].sort(compareFolderNames).map((n) => ({ id: n, name: n })),
    roles: roleRank.map((r) => ({ id: r.role_id, name: r.role_name })),
    cells,
    usersByRole: {},
    maxUserCount,
    heightMetric: "projects",
    generatedAt: new Date().toISOString(),
  };
  overviewCache = { at: Date.now(), data };
  return data;
}
