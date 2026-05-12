export type SpatialPermissionKey = "view" | "upload" | "edit" | "control";
export type SpatialAdminTier = "hub" | "project" | "executive" | "member";

export interface SpatialBulkAccProject {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
}

export interface SpatialBulkAccUser {
  email: string;
  name: string;
  found: boolean;
  projectCount: number;
  activeCount: number;
  adminCount: number;
  hasNoProjects: boolean;
  syncedAt: string;
  allRoles: string[];
  allModules: string[];
  projects: SpatialBulkAccProject[];
  companyRole?: string | null;
  lastSignIn?: string | null;
  isAccountAdmin: boolean;
  addedOn: string | null;
  aggregatedStatus?: "active" | "pending" | "deleted";
  projectAdmin?: boolean;
  executive?: boolean;
  companyName?: string | null;
  perProjectRoleNames?: string[];
}

export interface SpatialFolderPermissionRow {
  folderId: string;
  folderPath: string;
  projectId: string;
  projectName: string;
  roleId: string;
  roleName: string;
  permType: string;
  actions: string[];
  orphanReasons: string[];
}

export interface InferredUserFolderPermission extends SpatialFolderPermissionRow {
  permissionKey: SpatialPermissionKey;
  grantedByProjectRole: string;
}

export interface AccUserSpatialProfile {
  email: string;
  dimensions: {
    roles: string[];
    perProjectRoles: string[];
    projects: string[];
    modules: string[];
    adminTier: SpatialAdminTier;
    company: string | null;
    companyRole: string | null;
    addedBucket: string;
    activityBucket: "active-7d" | "active-30d" | "active-90d" | "stale-90d" | "never";
    folderIds: string[];
    permissionKeys: SpatialPermissionKey[];
  };
  weights: {
    admin: number;
    projects: number;
    modules: number;
    roles: number;
    permission: number;
    activityRecency: number;
  };
  clusterKey: string;
  colorKey: string;
}

const PERMISSION_RANK: Record<SpatialPermissionKey, number> = {
  view: 1,
  upload: 2,
  edit: 3,
  control: 4,
};

function normalizeToken(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function uniqueSorted(values: Iterable<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      Array.from(values)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function monthBucket(raw: string | Date | null | undefined): string {
  if (!raw) return "";
  const value = raw instanceof Date ? raw.toISOString() : raw;
  return value.match(/^(\d{4}-\d{2})/)?.[1] ?? "";
}

export function permissionKeyFromPermType(permType: string | null | undefined): SpatialPermissionKey {
  const normalized = normalizeToken(permType);
  if (normalized.includes("full controller") || normalized.includes("control")) return "control";
  if (normalized.includes("edit")) return "edit";
  if (normalized.includes("upload")) return "upload";
  return "view";
}

export function inferUserFolderPermissions(
  user: SpatialBulkAccUser,
  folderRows: readonly SpatialFolderPermissionRow[],
): InferredUserFolderPermission[] {
  const projectById = new Map(user.projects.map((project) => [project.id, project]));
  const out: InferredUserFolderPermission[] = [];
  const seen = new Set<string>();

  for (const row of folderRows) {
    const project = projectById.get(row.projectId);
    if (!project) continue;

    const roleTokens = new Map<string, string>();
    for (const role of project.roles ?? []) {
      const token = normalizeToken(role);
      if (token) roleTokens.set(token, role);
    }

    const matchedRole =
      roleTokens.get(normalizeToken(row.roleName)) ??
      roleTokens.get(normalizeToken(row.roleId));
    if (!matchedRole) continue;

    const key = `${row.projectId}::${row.folderId}::${row.roleId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      ...row,
      permissionKey: permissionKeyFromPermType(row.permType),
      grantedByProjectRole: matchedRole,
    });
  }

  return out.sort((a, b) =>
    a.projectName.localeCompare(b.projectName) ||
    a.folderPath.localeCompare(b.folderPath) ||
    a.roleName.localeCompare(b.roleName),
  );
}

function adminTierForUser(user: SpatialBulkAccUser): SpatialAdminTier {
  if (user.isAccountAdmin) return "hub";
  if (user.projectAdmin || user.adminCount > 0 || user.projects.some((project) => project.isAdmin)) return "project";
  if (user.executive) return "executive";
  return "member";
}

function activityBucket(lastSignIn: string | null | undefined, now: Date): AccUserSpatialProfile["dimensions"]["activityBucket"] {
  if (!lastSignIn) return "never";
  const ts = new Date(lastSignIn).getTime();
  if (!Number.isFinite(ts)) return "never";
  const days = Math.max(0, Math.floor((now.getTime() - ts) / 86_400_000));
  if (days <= 7) return "active-7d";
  if (days <= 30) return "active-30d";
  if (days <= 90) return "active-90d";
  return "stale-90d";
}

function recencyWeight(bucket: AccUserSpatialProfile["dimensions"]["activityBucket"]): number {
  if (bucket === "active-7d") return 1;
  if (bucket === "active-30d") return 0.75;
  if (bucket === "active-90d") return 0.4;
  if (bucket === "stale-90d") return 0.1;
  return 0;
}

export function buildAccUserSpatialProfile(
  user: SpatialBulkAccUser,
  folderRows: readonly SpatialFolderPermissionRow[] = [],
  now: Date = new Date(),
): AccUserSpatialProfile {
  const inferredFolders = inferUserFolderPermissions(user, folderRows);
  const permissionKeys = uniqueSorted(inferredFolders.map((row) => row.permissionKey)) as SpatialPermissionKey[];
  const strongestPermission = permissionKeys
    .slice()
    .sort((a, b) => PERMISSION_RANK[b] - PERMISSION_RANK[a])[0] ?? "view";
  const roles = uniqueSorted(user.allRoles);
  const perProjectRoles = uniqueSorted(user.perProjectRoleNames ?? user.projects.flatMap((project) => project.roles ?? []));
  const projects = uniqueSorted(user.projects.map((project) => project.id));
  const modules = uniqueSorted(user.allModules);
  const adminTier = adminTierForUser(user);
  const actBucket = activityBucket(user.lastSignIn, now);

  const weights = {
    admin: adminTier === "hub" ? 4 : adminTier === "project" ? 3 : adminTier === "executive" ? 2 : 1,
    projects: Math.min(4, Math.sqrt(Math.max(0, user.projectCount || projects.length))),
    modules: Math.min(4, Math.sqrt(modules.length)),
    roles: Math.min(4, Math.sqrt(roles.length)),
    permission: permissionKeys.reduce((max, key) => Math.max(max, PERMISSION_RANK[key]), 0),
    activityRecency: recencyWeight(actBucket),
  };

  const primaryRole = perProjectRoles[0] ?? roles[0] ?? "no-role";
  const company = user.companyName ?? null;
  const companyRole = user.companyRole ?? null;

  return {
    email: user.email.toLowerCase(),
    dimensions: {
      roles,
      perProjectRoles,
      projects,
      modules,
      adminTier,
      company,
      companyRole,
      addedBucket: monthBucket(user.addedOn),
      activityBucket: actBucket,
      folderIds: uniqueSorted(inferredFolders.map((row) => row.folderId)),
      permissionKeys,
    },
    weights,
    clusterKey: [adminTier, strongestPermission, primaryRole, actBucket].join("|"),
    colorKey: [strongestPermission, primaryRole].join("|"),
  };
}
