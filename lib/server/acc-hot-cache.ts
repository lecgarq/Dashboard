import "server-only";

import type { BulkAccProject, BulkAccUser } from "@/lib/acc/acc-types";
import { assembleDcUsers } from "@/lib/acc/dcUserAssembly";
import { foldActivityRows, foldAdminActionRows, type InstanceActivity } from "@/lib/acc/activityAggregate";
import {
  groupUnifiedActivityByUserProjectAction,
  groupUnifiedAdminActionsByActor,
  getAllLastUnifiedActivityByEmail,
} from "@/lib/server/unifiedActivitySource";
import { CATEGORY_TO_RAW_ACTIONS } from "@/lib/acc/activityCategories";

const ACC_HOT_CACHE_TTL_MS = 10 * 60_000;
// Sliding-TTL hard ceiling. A version-stable entry that keeps getting read (e.g.
// kept warm by the 8-min instrumentation prewarm) has its TTL pushed forward on
// every hit so it never lapses into a cold window. This caps how long that can
// continue without a fresh compute, so a change the version probe somehow missed
// still self-heals within the hour instead of being pinned warm forever.
const ACC_HOT_CACHE_MAX_AGE_MS = 60 * 60_000;

type CacheEntry<T> = {
  namespace: string;
  inputKey: string;
  version: string;
  createdAt: number;
  expiresAt: number;
  promise: Promise<T>;
};

type CacheStats = {
  hits: number;
  misses: number;
  invalidations: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const stats: CacheStats = {
  hits: 0,
  misses: 0,
  invalidations: 0,
};

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "null";
  return String(value);
}

function modelFor(db: any, modelName: string) {
  return db?.[modelName] as
    | {
        count?: (args?: unknown) => Promise<number>;
        aggregate?: (args: unknown) => Promise<{ _max?: Record<string, unknown> }>;
      }
    | undefined;
}

async function modelVersion(db: any, modelName: string, maxField: string): Promise<string | null> {
  const model = modelFor(db, modelName);
  if (!model?.count || !model.aggregate) return null;

  try {
    const [count, aggregate] = await Promise.all([
      model.count(),
      model.aggregate({ _max: { [maxField]: true } }),
    ]);
    return `${modelName}:${count}:${iso(aggregate._max?.[maxField])}`;
  } catch {
    return null;
  }
}

async function dbVersion(
  db: any,
  specs: Array<{ model: string; maxField: string }>,
): Promise<string | null> {
  const parts = await Promise.all(specs.map((spec) => modelVersion(db, spec.model, spec.maxField)));
  if (parts.some((part) => part === null)) return null;
  return parts.join("|");
}

function deleteExpired(now = Date.now()) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

async function cached<T>(
  namespace: string,
  inputKey: string,
  version: string | null,
  loader: () => Promise<T>,
): Promise<T> {
  if (!version) return loader();

  deleteExpired();
  const key = `${namespace}:${inputKey}:${version}`;
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing && existing.expiresAt > now && now - existing.createdAt < ACC_HOT_CACHE_MAX_AGE_MS) {
    // Sliding TTL: each hit pushes the expiry forward so a regularly-read (or
    // prewarmed) snapshot stays warm indefinitely while its data version is
    // unchanged — eliminating the cold-load window between prewarm cycles.
    existing.expiresAt = now + ACC_HOT_CACHE_TTL_MS;
    stats.hits++;
    return existing.promise;
  }

  stats.misses++;
  const promise = loader();
  cache.set(key, {
    namespace,
    inputKey,
    version,
    createdAt: now,
    expiresAt: now + ACC_HOT_CACHE_TTL_MS,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    const current = cache.get(key);
    if (current?.promise === promise) cache.delete(key);
    throw error;
  }
}

const DC_VERSION_SPECS = [
  { model: "accDcUser", maxField: "ingestedAt" },
  { model: "accDcProjectUser", maxField: "ingestedAt" },
  { model: "accDcProjectUserRole", maxField: "ingestedAt" },
  { model: "accDcProjectUserProduct", maxField: "ingestedAt" },
  { model: "accDcProjectUserCompany", maxField: "ingestedAt" },
  { model: "accDcCompany", maxField: "ingestedAt" },
  { model: "accDcProject", maxField: "ingestedAt" },
  { model: "accProject", maxField: "updatedAt" },
  { model: "accRole", maxField: "syncedAt" },
];

// NOTE: AccFolderPermission (~5M rows) is intentionally NOT versioned here. count()
// + max(syncedAt) on it (an unindexed seq scan ×2) ran on EVERY bulkUsers call,
// including cache hits. Folder permissions are (re)written by the same folder crawl
// that updates AccFolder.syncedAt, so AccFolder is a sufficient change signal — at a
// fraction of the cost (400k vs 5M). Worst case (perms edited with no folder touch)
// is bounded by the 10-min cache TTL.
const PERMISSION_VERSION_SPECS = [{ model: "accFolder", maxField: "syncedAt" }];

const ACTIVITY_VERSION_SPECS = [
  { model: "accActivity", maxField: "createdAt" },
  { model: "accActivityAccds", maxField: "createdAt" },
];

const ENRICHED_VERSION_SPECS = [
  ...DC_VERSION_SPECS,
  { model: "accProjectMember", maxField: "syncedAt" },
];

const BULK_SUMMARY_VERSION_SPECS = [
  { model: "user", maxField: "createdAt" },
  { model: "accMemberCache", maxField: "syncedAt" },
];

export function invalidateAccHotCache() {
  cache.clear();
  stats.invalidations++;
}

function getAccHotCacheStats() {
  deleteExpired();
  return {
    entries: cache.size,
    hits: stats.hits,
    misses: stats.misses,
    invalidations: stats.invalidations,
    keys: [...cache.values()].map((entry) => ({
      namespace: entry.namespace,
      inputKey: entry.inputKey,
      expiresAt: entry.expiresAt,
    })),
  };
}

export async function getCachedAccDcBulkUsers(
  db: any,
  input: { includePermissionContexts?: boolean; includePermissionSummary?: boolean; includeActivityMix?: boolean; leanProjects?: boolean } = {},
): Promise<BulkAccUser[]> {
  const includePermissionContexts = input.includePermissionContexts === true;
  const includePermissionSummary = input.includePermissionSummary === true;
  const needsFolderPerms = includePermissionContexts || includePermissionSummary;
  const includeActivityMix = input.includeActivityMix === true;
  // leanProjects: empty each project's roles[]/modules[] (≈77% of the projects
  // payload, ~15MB at hub scale). The /users directory never reads per-project
  // roles/modules — its role/module filters use the top-level allRoles/allModules
  // aggregates — so this trims the dehydrated page payload without losing any
  // field /users actually consumes. Other surfaces keep the full variant.
  const leanProjects = input.leanProjects === true;
  const versionSpecs = needsFolderPerms
    ? [...DC_VERSION_SPECS, ...PERMISSION_VERSION_SPECS]
    : [...DC_VERSION_SPECS];
  if (includeActivityMix) versionSpecs.push(...ACTIVITY_VERSION_SPECS);
  const version = await dbVersion(db, versionSpecs);

  const cacheId =
    [
      includePermissionContexts ? "ctx" : null,
      includePermissionSummary ? "sum" : null,
      includeActivityMix ? "act2" : null, // bumped: payload now includes per-action counts (Phase B)
      leanProjects ? "leanproj" : null,
    ]
      .filter(Boolean)
      .join("+") || "lean";

  return cached(
    "accDcGraph.bulkUsers",
    cacheId,
    version,
    async () => {
      const [
        users,
        projectUsers,
        projectUserRoles,
        projectUserProducts,
        projectUserCompanies,
        companies,
        roles,
        projects,
      ] = await Promise.all([
        db.accDcUser.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
            companyId: true,
            lastSignIn: true,
          },
        }),
        db.accDcProjectUser.findMany({
          select: { projectId: true, userId: true, addedOn: true, lastSignIn: true },
        }),
        db.accDcProjectUserRole.findMany({
          select: { projectId: true, userId: true, roleId: true },
        }),
        db.accDcProjectUserProduct.findMany({
          select: { projectId: true, userId: true, productKey: true, accessLevel: true },
        }),
        db.accDcProjectUserCompany.findMany({
          select: { projectId: true, userId: true, companyId: true },
        }),
        db.accDcCompany.findMany({
          select: { id: true, name: true },
        }),
        db.accRole.findMany({
          select: { id: true, name: true },
        }),
        db.accProject.findMany({
          select: { id: true, name: true, status: true, folderCrawlStatus: true },
        }),
      ]);

      // [Perf 2026-06, switched 2026-07 PROJ-02] Folder-permission data. AccFolderPermission
      // is ~6M rows; loading them all into Node (the old findMany) was the dominant cause of
      // the 60-90s access-analysis load + heap OOM. The graph only needs the SUMMARY
      // (includePermissionSummary, NOT contexts). The summary path now reads the materialised
      // `AccFolderPermissionSummary` projection (Phase 18) — refreshed post-ingest by
      // `dc-daily-ingest.cjs`, PROJ-03 — instead of running the live GROUP BY aggregate. The
      // projection is a proven byte-identical mirror of that aggregate (Phase 18 reconciliation:
      // 22,082 == 22,082 rows, 0 mismatches). The contexts path (WS2 edge feed) still needs raw
      // folder-level grants and keeps the row scan, now hard-guarded below.
      let rawFolderPermissions: Array<{
        folderId: string;
        roleId: string;
        permType: string;
        actions: string[];
        folder: { projectId: string; fullPath: string | null };
      }> = [];
      let rawFolderRollups: Array<{ id: string; totalSizeBytes: number | null }> = [];
      let folderSummaryByProjectRole:
        | Map<string, { folderCount: number; totalBytes: number; permTypes: string[] }>
        | undefined;
      if (needsFolderPerms) {
        // Hard-guard (PROJ-02): the includePermissionContexts:true branch below materialises
        // the FULL AccFolderPermission table (~6M+ rows) into Node heap via a findMany scan —
        // the exact OOM window the summary-projection switch above was added to close. No
        // production caller enables it (grep confirms only test files reference this flag).
        // It throws by default; set ACC_ALLOW_RAW_PERMISSION_SCAN=1 to deliberately re-enable
        // it for the WS2 edge-feed / per-folder-ACL path.
        if (includePermissionContexts) {
          if (process.env.ACC_ALLOW_RAW_PERMISSION_SCAN !== "1") {
            throw new Error(
              "includePermissionContexts:true is hard-guarded (PROJ-02): it materialises the full " +
              "AccFolderPermission table (~6M rows) into Node heap and re-opens the OOM window TEST-01 guards. " +
              "No production caller enables it. To deliberately re-enable the WS2 edge-feed / per-folder-ACL " +
              "path, set ACC_ALLOW_RAW_PERMISSION_SCAN=1.",
            );
          }
          rawFolderPermissions = await db.accFolderPermission.findMany({
            where: { folder: { project: { folderCrawlStatus: { in: ["ok", "partial"] } } } },
            select: {
              folderId: true,
              roleId: true,
              permType: true,
              actions: true,
              folder: { select: { projectId: true, fullPath: true } },
            },
          });
          rawFolderRollups = await db.accFolder.findMany({
            where: { project: { folderCrawlStatus: { in: ["ok", "partial"] } } },
            select: { id: true, totalSizeBytes: true },
          });
        } else {
          const summaryRows = await db.accFolderPermissionSummary.findMany({
            select: { projectId: true, roleId: true, folderCount: true, totalBytes: true, permTypes: true },
          });
          folderSummaryByProjectRole = new Map(
            summaryRows.map((r: any) => [
              `${r.projectId}::${r.roleId}`,
              {
                folderCount: Number(r.folderCount),
                totalBytes: Number(r.totalBytes), // BigInt → number, mirrors the old Number(r.totalBytes)
                permTypes: r.permTypes ?? [],
              },
            ]),
          );
        }
      }

      let activityByInstance: Map<string, InstanceActivity> | undefined;
      let adminActionsByActor: Map<string, Record<string, number>> | undefined;
      if (includeActivityMix) {
        const [groups, adminGroups] = await Promise.all([
          groupUnifiedActivityByUserProjectAction(db),
          groupUnifiedAdminActionsByActor(db),
        ]);
        activityByInstance = foldActivityRows(groups);
        adminActionsByActor = foldAdminActionRows(adminGroups);
      }

      const assembled = assembleDcUsers({
        includePermissionContexts,
        includePermissionSummary,
        folderSummaryByProjectRole,
        activityByInstance,
        adminActionsByActor,
        users: users.map((u: any) => ({
          ...u,
          lastSignIn: u.lastSignIn ? u.lastSignIn.toISOString() : null,
        })),
        projectUsers: projectUsers.map((pu: any) => ({
          projectId: pu.projectId,
          userId: pu.userId,
          addedOn: pu.addedOn ? pu.addedOn.toISOString() : null,
          lastSignIn: pu.lastSignIn ? pu.lastSignIn.toISOString() : null,
        })),
        projectUserRoles,
        projectUserProducts,
        projectUserCompanies,
        companies,
        roleNames: Object.fromEntries(roles.map((r: any) => [r.id, r.name])),
        projectMeta: Object.fromEntries(
          projects.map((p: any) => [
            p.id,
            { name: p.name, status: p.status, crawlStatus: p.folderCrawlStatus },
          ]),
        ),
        folderPermissions: rawFolderPermissions.map((r: any) => ({
          folderId: r.folderId,
          roleId: r.roleId,
          permType: r.permType,
          actions: r.actions,
          projectId: r.folder.projectId,
          folderPath: r.folder.fullPath ?? "",
        })),
        folderRollups: rawFolderRollups.map((r: any) => ({
          folderId: r.id,
          totalSizeBytes: r.totalSizeBytes,
        })),
      });

      // leanProjects: reduce each project to the fields the /users directory
      // actually reads (id for the side-panel name map, name for the project
      // filter, status for the status fallback). Dropping the per-(project,user)
      // optional fields — addedOn, lastSignIn, crawlStatus, actionCounts, the
      // P5 metrics — is where the bytes are (~15 MB across 22.8k project rows).
      // roles/modules are emptied too; the filters use the top-level
      // allRoles/allModules aggregates, which assembly already computed above.
      // Done post-assembly so those aggregates see the full data first.
      if (!leanProjects) return assembled;
      // TYPE-01: narrow the lean-return variant so per-project roles/modules are
      // typed never[] at the construction site. never[] is assignable to string[]
      // (BulkAccProject), so callers using the full BulkAccUser type are unaffected.
      // The shared BulkAccUser / BulkAccProject interfaces in acc-types.ts are UNCHANGED.
      type LeanBulkAccProject = Omit<BulkAccProject, "roles" | "modules"> & {
        roles: never[];
        modules: never[];
      };
      type LeanBulkAccUser = Omit<BulkAccUser, "projects"> & {
        projects: LeanBulkAccProject[];
      };
      return assembled.map((u): LeanBulkAccUser => ({
        ...u,
        projects: u.projects.map((p): LeanBulkAccProject => ({
          id: p.id,
          name: p.name,
          status: p.status,
          isAdmin: p.isAdmin,
          // lean payload — always empty; use bulkUser / hover-prefetch for per-project data
          roles: [] as never[],
          modules: [] as never[],
        })),
      }));
    },
  );
}

type RawMember = {
  email: string;
  status: string;
  projectAdmin: boolean;
  executive: boolean;
  companyName: string | null;
  project: { id: string; name: string };
  roles: { role: { name: string } }[];
};

type DcEnrichedUserRow = {
  id: string;
  email: string | null;
  status: string | null;
  companyId: string | null;
};

type DcEnrichedProjectRow = {
  id: string;
  name: string;
  status: string | null;
};

export interface EnrichedAccUser {
  email: string;
  aggregatedStatus: "active" | "pending" | "deleted";
  projectAdmin: boolean;
  executive: boolean;
  companyName: string | null;
  perProjectRoleNames: string[];
  perProjectStatuses: {
    projectId: string;
    projectName: string;
    status: string;
    projectAdmin: boolean;
  }[];
}

function aggregateStatus(statuses: string[]): "active" | "pending" | "deleted" {
  if (statuses.includes("active")) return "active";
  if (statuses.includes("pending")) return "pending";
  return "deleted";
}

function normalizeMemberStatus(status: string | null | undefined): "active" | "pending" | "deleted" {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "active" || normalized === "pending" || normalized === "deleted") return normalized;
  return "deleted";
}

function isActiveProjectStatus(status: string | null | undefined): boolean {
  return !status || status.toLowerCase() === "active";
}

function pickDominantCompanyName(
  companyCounts: Map<string, number>,
  companyById: Map<string, string>,
): string | null {
  const ranked = [...companyCounts.entries()]
    .filter(([companyId]) => companyById.has(companyId))
    .sort((a, b) => {
      const countDelta = b[1] - a[1];
      if (countDelta !== 0) return countDelta;
      return (companyById.get(a[0]) ?? a[0]).localeCompare(companyById.get(b[0]) ?? b[0]);
    });
  const companyId = ranked[0]?.[0];
  return companyId ? companyById.get(companyId) ?? null : null;
}

function aggregateByEmail(members: RawMember[]): EnrichedAccUser[] {
  const map = new Map<
    string,
    {
      statuses: string[];
      projectAdmin: boolean;
      executive: boolean;
      companyName: string | null;
      roleNames: Set<string>;
      perProject: { projectId: string; projectName: string; status: string; projectAdmin: boolean }[];
    }
  >();

  for (const member of members) {
    const key = member.email.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        statuses: [],
        projectAdmin: false,
        executive: false,
        companyName: member.companyName,
        roleNames: new Set(),
        perProject: [],
      };
      map.set(key, entry);
    }
    entry.statuses.push(member.status);
    if (member.projectAdmin) entry.projectAdmin = true;
    if (member.executive) entry.executive = true;
    if (!entry.companyName && member.companyName) entry.companyName = member.companyName;
    for (const role of member.roles) entry.roleNames.add(role.role.name);
    entry.perProject.push({
      projectId: member.project.id,
      projectName: member.project.name,
      status: member.status,
      projectAdmin: member.projectAdmin,
    });
  }

  return [...map.entries()].map(([email, entry]) => ({
    email,
    aggregatedStatus: aggregateStatus(entry.statuses),
    projectAdmin: entry.projectAdmin,
    executive: entry.executive,
    companyName: entry.companyName,
    perProjectRoleNames: [...entry.roleNames].sort(),
    perProjectStatuses: entry.perProject,
  }));
}

async function aggregateDcEnrichedUsers(db: any): Promise<EnrichedAccUser[]> {
  const [
    users,
    projectUsers,
    projectUserRoles,
    projectUserProducts,
    projectUserCompanies,
    companies,
    roles,
    projects,
  ] = await Promise.all([
    db.accDcUser.findMany({
      select: { id: true, email: true, status: true, companyId: true },
    }),
    db.accDcProjectUser.findMany({
      select: { projectId: true, userId: true, status: true },
    }),
    db.accDcProjectUserRole.findMany({
      select: { projectId: true, userId: true, roleId: true },
    }),
    db.accDcProjectUserProduct.findMany({
      select: { projectId: true, userId: true, productKey: true, accessLevel: true },
    }),
    db.accDcProjectUserCompany.findMany({
      select: { projectId: true, userId: true, companyId: true },
    }),
    db.accDcCompany.findMany({
      select: { id: true, name: true },
    }),
    db.accRole.findMany({
      select: { id: true, name: true },
    }),
    db.accDcProject.findMany({
      select: { id: true, name: true, status: true },
    }),
  ]);

  const userById = new Map<string, DcEnrichedUserRow>(
    (users as DcEnrichedUserRow[]).map((user) => [user.id, user]),
  );
  const companyById = new Map<string, string>(
    (companies as Array<{ id: string; name: string }>).map((company) => [company.id, company.name]),
  );
  const roleNameById = new Map<string, string>(
    (roles as Array<{ id: string; name: string }>).map((role) => [role.id, role.name]),
  );
  const projectById = new Map<string, DcEnrichedProjectRow>(
    (projects as DcEnrichedProjectRow[]).map((project) => [project.id, project]),
  );

  const rolesByUserProject = new Map<string, Set<string>>();
  for (const role of projectUserRoles as any[]) {
    const key = `${role.userId}::${role.projectId}`;
    const set = rolesByUserProject.get(key) ?? new Set<string>();
    set.add(roleNameById.get(role.roleId) ?? role.roleId);
    rolesByUserProject.set(key, set);
  }

  const adminByUserProject = new Set<string>();
  for (const product of projectUserProducts as any[]) {
    if (product.accessLevel === "project_admin") {
      adminByUserProject.add(`${product.userId}::${product.projectId}`);
    }
  }

  const companyIdByUserProject = new Map<string, string>();
  for (const company of projectUserCompanies as any[]) {
    companyIdByUserProject.set(`${company.userId}::${company.projectId}`, company.companyId);
  }

  const map = new Map<
    string,
    {
      statuses: string[];
      projectAdmin: boolean;
      companyName: string | null;
      companyCounts: Map<string, number>;
      roleNames: Set<string>;
      perProject: { projectId: string; projectName: string; status: string; projectAdmin: boolean }[];
    }
  >();

  for (const membership of projectUsers as any[]) {
    const user = userById.get(membership.userId);
    if (!user) continue;
    const email = user.email?.toLowerCase();
    if (!email) continue;

    const project = projectById.get(membership.projectId);
    if (project && !isActiveProjectStatus(project.status)) continue;

    let entry = map.get(email);
    if (!entry) {
      entry = {
        statuses: [],
        projectAdmin: false,
        companyName: user.companyId ? (companyById.get(user.companyId) ?? null) : null,
        companyCounts: new Map(),
        roleNames: new Set(),
        perProject: [],
      };
      map.set(email, entry);
    }

    if (!entry.companyName && user.companyId) {
      entry.companyName = companyById.get(user.companyId) ?? null;
    }

    const projectKey = `${membership.userId}::${membership.projectId}`;
    const companyId = user.companyId ?? companyIdByUserProject.get(projectKey);
    if (companyId) {
      entry.companyCounts.set(companyId, (entry.companyCounts.get(companyId) ?? 0) + 1);
    }

    const status = normalizeMemberStatus(membership.status ?? user.status ?? project?.status);
    const projectAdmin = adminByUserProject.has(projectKey);
    entry.statuses.push(status);
    if (projectAdmin) entry.projectAdmin = true;

    for (const roleName of rolesByUserProject.get(projectKey) ?? []) {
      entry.roleNames.add(roleName);
    }

    entry.perProject.push({
      projectId: membership.projectId,
      projectName: project?.name ?? membership.projectId,
      status,
      projectAdmin,
    });
  }

  return [...map.entries()]
    .map(([email, entry]) => ({
      email,
      aggregatedStatus: aggregateStatus(entry.statuses),
      projectAdmin: entry.projectAdmin,
      executive: false,
      companyName: entry.companyName ?? pickDominantCompanyName(entry.companyCounts, companyById),
      perProjectRoleNames: [...entry.roleNames].sort(),
      perProjectStatuses: entry.perProject.sort((a, b) =>
        a.projectName.localeCompare(b.projectName) || a.projectId.localeCompare(b.projectId),
      ),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function getCachedAccMembersEnrichedUsers(db: any): Promise<EnrichedAccUser[]> {
  const version = await dbVersion(db, ENRICHED_VERSION_SPECS);
  return cached("accMembers.enrichedUsers", "default", version, async () => {
    const members = await db.accProjectMember.findMany({
      where: { project: { status: "active" } },
      select: {
        email: true,
        status: true,
        projectAdmin: true,
        executive: true,
        companyName: true,
        project: { select: { id: true, name: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (members.length > 0) return aggregateByEmail(members);
    return aggregateDcEnrichedUsers(db);
  });
}

type CachedProject = {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
};

type CachedData = {
  found: boolean;
  name?: string;
  syncedAt?: string;
  projects?: CachedProject[];
  companyRole?: string | null;
  lastSignIn?: string | null;
  isAccountAdmin?: boolean;
  addedOn?: string | null;
};

type BulkSummaryUserRow = {
  email: string;
  name: string | null;
};

type BulkSummaryCacheRow = {
  email: string;
  data: unknown;
  syncedAt: Date;
};

export async function getCachedBulkAccSummary(db: any): Promise<BulkAccUser[]> {
  const version = await dbVersion(db, BULK_SUMMARY_VERSION_SPECS);
  return cached("users.bulkAccSummary", "default", version, async () => {
    const [rawUsers, rawCaches] = await Promise.all([
      db.user.findMany({ select: { email: true, name: true } }),
      db.accMemberCache.findMany(),
    ]);
    const users = rawUsers as BulkSummaryUserRow[];
    const caches = rawCaches as BulkSummaryCacheRow[];

    const userMap = new Map<string, string | null>(users.map((user) => [user.email.toLowerCase(), user.name]));
    const userEmailMap = new Map<string, string>(users.map((user) => [user.email.toLowerCase(), user.email]));
    const cacheMap = new Map<string, BulkSummaryCacheRow>(caches.map((row) => [row.email.toLowerCase(), row]));

    const allEmails = new Set<string>([
      ...users.map((user) => user.email.toLowerCase()),
      ...caches.map((row) => row.email.toLowerCase()),
    ]);

    return [...allEmails].map((emailLower): BulkAccUser => {
      const cachedRow = cacheMap.get(emailLower);
      const registeredName = userMap.get(emailLower);
      const email = cachedRow?.email || userEmailMap.get(emailLower) || emailLower;

      if (!cachedRow) {
        return {
          email,
          name: registeredName ?? "",
          found: false,
          projectCount: 0,
          activeCount: 0,
          adminCount: 0,
          hasNoProjects: true,
          syncedAt: "",
          allRoles: [],
          allModules: [],
          projects: [],
          isAccountAdmin: false,
          addedOn: null,
        };
      }

      let data: CachedData = { found: false };
      const raw = cachedRow.data as unknown;
      if (typeof raw === "string") {
        try {
          data = JSON.parse(raw) as CachedData;
        } catch {
          data = { found: false };
        }
      } else if (raw && typeof raw === "object") {
        data = raw as CachedData;
      }

      if (!data.found) {
        return {
          email,
          name: registeredName ?? data.name ?? "",
          found: false,
          projectCount: 0,
          activeCount: 0,
          adminCount: 0,
          hasNoProjects: true,
          syncedAt: data.syncedAt ?? cachedRow.syncedAt.toISOString(),
          allRoles: [],
          allModules: [],
          projects: [],
          isAccountAdmin: false,
          addedOn: null,
        };
      }

      const projects: CachedProject[] = data.projects ?? [];
      const activeCount = projects.filter((project) => project.status?.toLowerCase() === "active").length;
      const adminCount = projects.filter((project) => project.isAdmin).length;
      const allRoles = [...new Set(projects.flatMap((project) => project.roles ?? []))];
      const allModules = [...new Set(projects.flatMap((project) => project.modules ?? []))];

      return {
        email,
        name: registeredName ?? data.name ?? "",
        found: true,
        projectCount: projects.length,
        activeCount,
        adminCount,
        hasNoProjects: projects.length === 0,
        syncedAt: data.syncedAt ?? cachedRow.syncedAt.toISOString(),
        allRoles,
        allModules,
        projects,
        companyRole: data.companyRole ?? null,
        lastSignIn: data.lastSignIn ?? null,
        isAccountAdmin: data.isAccountAdmin === true,
        addedOn: typeof data.addedOn === "string" && data.addedOn.length > 0 ? data.addedOn : null,
      };
    });
  });
}

export type AccPrewarmTaskResult = {
  name: string;
  ok: boolean;
  ms: number;
  rows?: number;
  error?: string;
};

async function timeTask<T extends unknown[]>(
  name: string,
  run: () => Promise<T>,
): Promise<AccPrewarmTaskResult> {
  const start = Date.now();
  try {
    const rows = await run();
    return { name, ok: true, ms: Date.now() - start, rows: rows.length };
  } catch (error) {
    return {
      name,
      ok: false,
      ms: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// File-activity aggregate cache (G2 fix: heavy GROUP BY runs once per ingest)
// ---------------------------------------------------------------------------

/**
 * File-action raw strings (mirrors the FILE_RAW_ACTIONS constant in
 * server/routers/acc-activity.ts — kept in sync via CATEGORY_TO_RAW_ACTIONS).
 * Defined here so acc-hot-cache.ts does not depend on the tRPC router.
 */
const HOT_CACHE_FILE_RAW_ACTIONS: readonly string[] = [
  ...CATEGORY_TO_RAW_ACTIONS.view,
  ...CATEGORY_TO_RAW_ACTIONS.upload,
  ...CATEGORY_TO_RAW_ACTIONS.edit,
  ...CATEGORY_TO_RAW_ACTIONS.delete,
];

/**
 * Cached wrapper around `getAllLastUnifiedActivityByEmail`.
 *
 * The underlying query is a GROUP BY over ~623k rows of the unified_activity
 * CTE (AccActivity + AccActivityAccds union). Without caching it runs on every
 * SSR prefetch, blocking the /users page render. This wrapper memoises the
 * result using the ACTIVITY_VERSION_SPECS fingerprint (same signal used by the
 * activity-mix variant of bulkUsers) so the cache invalidates whenever new
 * activity is ingested.
 *
 * Returns the same `Array<{ email: string; lastActivity: string }>` shape that
 * `getAllLastUnifiedActivityByEmail` returns; the router procedure continues to
 * do the Record<email, ISO> shaping.
 */
export async function getCachedLastFileActivityByEmailAll(
  db: any,
): Promise<Array<{ email: string; lastActivity: string }>> {
  const version = await dbVersion(db, ACTIVITY_VERSION_SPECS);
  return cached("accActivity.lastFileActivityByEmailAll", "all", version, () =>
    getAllLastUnifiedActivityByEmail(db, { rawActionIn: HOT_CACHE_FILE_RAW_ACTIONS }),
  );
}

export async function prewarmAccHotCache(db: any) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const tasks = [
    await timeTask("accDcGraph.bulkUsers", () => getCachedAccDcBulkUsers(db)),
    // The /users directory uses this trimmed variant (no per-project
    // roles/modules) — warm it so the route's SSR prefetch is a hit.
    await timeTask("accDcGraph.bulkUsers(leanProjects)", () =>
      getCachedAccDcBulkUsers(db, { leanProjects: true }),
    ),
    // /users/spatial-graph requests this HEAVY variant (folder-perm SQL aggregate
    // over ~6M rows + activity grouping ≈ 15s cold). It's a SEPARATE cache key
    // from the lean snapshot above, so it must be warmed explicitly or the first
    // visitor after each idle gap eats the full cold cost. Combined with the
    // sliding TTL, this 8-min prewarm keeps it permanently warm.
    await timeTask("accDcGraph.bulkUsers(summary+activity)", () =>
      getCachedAccDcBulkUsers(db, {
        includePermissionSummary: true,
        includeActivityMix: true,
      }),
    ),
    await timeTask("accMembers.enrichedUsers", () => getCachedAccMembersEnrichedUsers(db)),
    await timeTask("users.bulkAccSummary", () => getCachedBulkAccSummary(db)),
    // /users "Last active" column — GROUP BY over ~623k activity rows. Stays warm
    // so the SSR prefetch on every page load is a cache hit (not a cold query).
    await timeTask("accActivity.lastFileActivityByEmailAll", () => getCachedLastFileActivityByEmailAll(db)),
  ];

  return {
    startedAt,
    totalMs: Date.now() - start,
    tasks,
    cache: getAccHotCacheStats(),
  };
}
