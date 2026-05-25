import "server-only";

import type { BulkAccUser } from "@/lib/acc/acc-types";
import { assembleDcUsers } from "@/lib/acc/dcUserAssembly";

export const ACC_HOT_CACHE_TTL_MS = 10 * 60_000;

type CacheEntry<T> = {
  namespace: string;
  inputKey: string;
  version: string;
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
  if (existing && existing.expiresAt > now) {
    stats.hits++;
    return existing.promise;
  }

  stats.misses++;
  const promise = loader();
  cache.set(key, {
    namespace,
    inputKey,
    version,
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

const PERMISSION_VERSION_SPECS = [
  { model: "accFolder", maxField: "syncedAt" },
  { model: "accFolderPermission", maxField: "syncedAt" },
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

export function getAccHotCacheStats() {
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
  input: { includePermissionContexts?: boolean } = {},
): Promise<BulkAccUser[]> {
  const includePermissionContexts = input.includePermissionContexts === true;
  const version = await dbVersion(
    db,
    includePermissionContexts ? [...DC_VERSION_SPECS, ...PERMISSION_VERSION_SPECS] : DC_VERSION_SPECS,
  );

  return cached(
    "accDcGraph.bulkUsers",
    includePermissionContexts ? "with-permission-contexts" : "lean",
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

      const rawFolderPermissions = includePermissionContexts
        ? await db.accFolderPermission.findMany({
            where: { folder: { project: { folderCrawlStatus: { in: ["ok", "partial"] } } } },
            select: {
              folderId: true,
              roleId: true,
              permType: true,
              actions: true,
              folder: { select: { projectId: true, fullPath: true } },
            },
          })
        : [];

      return assembleDcUsers({
        includePermissionContexts,
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
      });
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

export async function prewarmAccHotCache(db: any) {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const tasks = [
    await timeTask("accDcGraph.bulkUsers", () => getCachedAccDcBulkUsers(db)),
    await timeTask("accMembers.enrichedUsers", () => getCachedAccMembersEnrichedUsers(db)),
    await timeTask("users.bulkAccSummary", () => getCachedBulkAccSummary(db)),
  ];

  return {
    startedAt,
    totalMs: Date.now() - start,
    tasks,
    cache: getAccHotCacheStats(),
  };
}
