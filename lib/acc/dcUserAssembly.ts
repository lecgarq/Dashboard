import type { BulkAccUser, PermissionContext } from "./acc-types";

export interface DcAssemblyInput {
  users: { id: string; email: string | null; name: string | null; status: string | null; companyId: string | null; lastSignIn?: string | null }[];
  projectUsers: { projectId: string; userId: string }[];
  projectUserRoles: { projectId: string; userId: string; roleId: string }[];
  projectUserProducts: { projectId: string; userId: string; productKey: string; accessLevel: string }[];
  companies: { id: string; name: string }[];
  roleNames: Record<string, string>;
  projectMeta: Record<string, { name: string; status: string; crawlStatus: string }>;
  folderPermissions?: { folderId: string; roleId: string; permType: string; actions: string[]; projectId: string; folderPath: string }[];
}

export function normalizePermTier(permType: string): string {
  const p = permType.toLowerCase();
  if (p.includes("full") || p.includes("control")) return "control";
  if (p.includes("edit")) return "edit";
  if (p.includes("upload")) return "upload";
  if (p.includes("download")) return "download";
  return "view";
}

/** BulkAccUser extended with DC-only derived fields not yet on the shared type. */
export type DcBulkAccUser = BulkAccUser & {
  /** True when the user's email domain is not @lecg.com. */
  isExternal: boolean;
};

function coverageFor(statuses: string[]): "known" | "partial" | "unknown" {
  if (statuses.length === 0) return "unknown";
  const crawled = statuses.filter((s) => s === "ok" || s === "partial").length;
  if (crawled === 0) return "unknown";
  if (crawled === statuses.length) return "known";
  return "partial";
}

export function assembleDcUsers(input: DcAssemblyInput): DcBulkAccUser[] {
  const companyName = new Map(input.companies.map((c) => [c.id, c.name]));

  // Build user → set of project IDs
  const membersByUser = new Map<string, Set<string>>();
  for (const pu of input.projectUsers) {
    const set = membersByUser.get(pu.userId) ?? new Set<string>();
    set.add(pu.projectId);
    membersByUser.set(pu.userId, set);
  }

  // Build "userId::projectId" → set of resolved role names (display names)
  const rolesByUserProject = new Map<string, Set<string>>();
  // Build "userId::projectId" → set of RAW roleIds (for joining folder permissions)
  const rawRolesByUserProject = new Map<string, Set<string>>();
  for (const r of input.projectUserRoles) {
    const k = `${r.userId}::${r.projectId}`;
    const set = rolesByUserProject.get(k) ?? new Set<string>();
    set.add(input.roleNames[r.roleId] ?? r.roleId);
    rolesByUserProject.set(k, set);
    const rawSet = rawRolesByUserProject.get(k) ?? new Set<string>();
    rawSet.add(r.roleId);
    rawRolesByUserProject.set(k, rawSet);
  }

  // Index folder permissions by "projectId::roleId" for fast lookup
  const folderPermsByProjectRole = new Map<string, { folderId: string; roleId: string; permType: string; actions: string[]; projectId: string; folderPath: string }[]>();
  for (const fp of input.folderPermissions ?? []) {
    const k = `${fp.projectId}::${fp.roleId}`;
    const arr = folderPermsByProjectRole.get(k) ?? [];
    arr.push(fp);
    folderPermsByProjectRole.set(k, arr);
  }

  // Build "userId::projectId" → product entries
  const prodByUserProject = new Map<string, { key: string; admin: boolean }[]>();
  for (const p of input.projectUserProducts) {
    const k = `${p.userId}::${p.projectId}`;
    const arr = prodByUserProject.get(k) ?? [];
    arr.push({ key: p.productKey, admin: p.accessLevel === "project_admin" });
    prodByUserProject.set(k, arr);
  }

  const out: DcBulkAccUser[] = [];

  for (const u of input.users) {
    const projectIds = membersByUser.get(u.id);
    if (!projectIds || projectIds.size === 0) continue; // exclude orphans

    const email = (u.email ?? "").toLowerCase();

    const projects = [...projectIds].map((pid) => {
      const meta = input.projectMeta[pid] ?? { name: pid, status: "unknown", crawlStatus: "never" };
      const prods = prodByUserProject.get(`${u.id}::${pid}`) ?? [];
      const roles = [...(rolesByUserProject.get(`${u.id}::${pid}`) ?? [])];
      const isAdmin = prods.some((p) => p.admin);
      return {
        id: pid,
        name: meta.name,
        status: meta.status,
        isAdmin,
        roles,
        modules: prods.map((p) => p.key),
        crawlStatus: meta.crawlStatus,
      };
    });

    const allModules = [...new Set(projects.flatMap((p) => p.modules))];
    const allRoles = [...new Set(projects.flatMap((p) => p.roles))];
    const adminCount = projects.filter((p) => p.isAdmin).length;
    const activeCount = projects.filter((p) => p.status?.toLowerCase() === "active").length;

    // Build permission contexts: only for projects with crawlStatus "ok" or "partial"
    const permissionContexts: PermissionContext[] = [];
    for (const pid of projectIds) {
      const meta = input.projectMeta[pid] ?? { name: pid, status: "unknown", crawlStatus: "never" };
      if (meta.crawlStatus !== "ok" && meta.crawlStatus !== "partial") continue;
      const rawRoleIds = rawRolesByUserProject.get(`${u.id}::${pid}`) ?? new Set<string>();
      for (const rawRoleId of rawRoleIds) {
        const grants = folderPermsByProjectRole.get(`${pid}::${rawRoleId}`) ?? [];
        for (const fp of grants) {
          permissionContexts.push({
            projectId: fp.projectId,
            folderId: fp.folderId,
            folderPath: fp.folderPath,
            permType: fp.permType,
            permissionTier: normalizePermTier(fp.permType),
            actions: fp.actions,
            crawlStatus: meta.crawlStatus,
            roleId: rawRoleId,
          });
        }
      }
    }

    out.push({
      // ── Required BulkAccUser fields ──────────────────────────────────────
      email: u.email ?? email,
      name: u.name ?? "",
      found: true,
      projectCount: projects.length,
      activeCount,
      adminCount,
      hasNoProjects: false,
      syncedAt: "",
      allRoles,
      allModules,
      projects,
      isAccountAdmin: adminCount > 0,
      addedOn: null,
      // ── Optional BulkAccUser access-graph fields ─────────────────────────
      firmId: u.companyId ?? null,
      firmName: u.companyId ? (companyName.get(u.companyId) ?? null) : null,
      accountStatus:
        u.status === "active" ? "active" : u.status === "inactive" ? "inactive" : null,
      permissionCoverage: coverageFor(projects.map((p) => p.crawlStatus ?? "never")),
      lastSignIn: u.lastSignIn ?? null,
      // ── DC-only extension ────────────────────────────────────────────────
      isExternal: email.length > 0 ? !email.endsWith("@lecg.com") : true,
      permissionContexts,
    });
  }

  return out;
}
