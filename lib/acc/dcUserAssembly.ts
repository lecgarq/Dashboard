import type { BulkAccUser, PermissionContext } from "./acc-types";
import { classifyAffiliation } from "@/app/(dashboard)/users/access-analysis/internalDomains";
import type { InstanceActivity } from "./activityAggregate";

export interface DcAssemblyInput {
  users: { id: string; email: string | null; name: string | null; status: string | null; companyId: string | null; lastSignIn?: string | null }[];
  projectUsers: { projectId: string; userId: string; addedOn?: string | null; lastSignIn?: string | null }[];
  projectUserRoles: { projectId: string; userId: string; roleId: string }[];
  projectUserProducts: { projectId: string; userId: string; productKey: string; accessLevel: string }[];
  companies: { id: string; name: string }[];
  roleNames: Record<string, string>;
  projectMeta: Record<string, { name: string; status: string; crawlStatus: string }>;
  folderPermissions?: { folderId: string; roleId: string; permType: string; actions: string[]; projectId: string; folderPath: string }[];
  /**
   * Per-(project,user) company affiliation. Used as a fallback firm source when
   * the AccDcUser record has no companyId (common for external collaborators).
   */
  projectUserCompanies?: { projectId: string; userId: string; companyId: string }[];
  /**
   * When false (default), `permissionContexts` is left empty for every user. The
   * per-user fan-out (user × role × folder grant) is large enough to exceed V8's
   * max JSON string length, so it's excluded from the default lean node feed.
   * Only the role-scoped edge feed (WS2) should request it.
   */
  includePermissionContexts?: boolean;
  includePermissionSummary?: boolean;
  /** [P5-C] Per-(user,project) activity aggregate, keyed `lowercasedEmail::projectId`. */
  activityByInstance?: Map<string, InstanceActivity>;
  /** [Phase B] Account-level admin action counts per actor (lowercased email -> {actionId: count}). */
  adminActionsByActor?: Map<string, Record<string, number>>;
}

export function normalizePermTier(permType: string): string {
  const p = permType.toLowerCase();
  if (p.includes("full") || p.includes("control")) return "control";
  if (p.includes("edit")) return "edit";
  if (p.includes("upload")) return "upload";
  if (p.includes("download")) return "download";
  return "view";
}

const TIER_RANK: Record<string, number> = { view: 1, download: 2, upload: 3, edit: 4, control: 5 };
export function permTierStrength(permType: string): number {
  return TIER_RANK[normalizePermTier(permType)] ?? 0;
}

/** BulkAccUser extended with DC-only derived fields not yet on the shared type. */
export type DcBulkAccUser = BulkAccUser & {
  /**
   * True only when the email resolves to an external domain (canonical rule in
   * internalDomains.classifyAffiliation). Internal (hermosillo.com) and unknown
   * (null/empty/malformed email) are both `false` — unknown is never auto-external.
   */
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
  const includeContexts = input.includePermissionContexts === true;
  const includeSummary = input.includePermissionSummary === true;
  const companyName = new Map(input.companies.map((c) => [c.id, c.name]));

  // Fallback firm source: the user's dominant company across their project
  // memberships, used when the AccDcUser record itself has no companyId.
  const companyVotesByUser = new Map<string, Map<string, number>>();
  for (const pc of input.projectUserCompanies ?? []) {
    if (!pc.companyId) continue;
    const votes = companyVotesByUser.get(pc.userId) ?? new Map<string, number>();
    votes.set(pc.companyId, (votes.get(pc.companyId) ?? 0) + 1);
    companyVotesByUser.set(pc.userId, votes);
  }
  const dominantCompanyFor = (userId: string): string | null => {
    const votes = companyVotesByUser.get(userId);
    if (!votes) return null;
    let best: string | null = null;
    let bestCount = 0;
    for (const [companyId, count] of votes) {
      if (count > bestCount) {
        best = companyId;
        bestCount = count;
      }
    }
    return best;
  };

  // Build user → set of project IDs
  const membersByUser = new Map<string, Set<string>>();
  for (const pu of input.projectUsers) {
    const set = membersByUser.get(pu.userId) ?? new Set<string>();
    set.add(pu.projectId);
    membersByUser.set(pu.userId, set);
  }

  // Per-(user,project) membership dates from AccDcProjectUser.
  const membershipDates = new Map<string, { addedOn: string | null; lastSignIn: string | null }>();
  for (const pu of input.projectUsers) {
    membershipDates.set(`${pu.userId}::${pu.projectId}`, {
      addedOn: pu.addedOn ?? null,
      lastSignIn: pu.lastSignIn ?? null,
    });
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
      let permissionStrength: number | undefined;
      let folderBreadth: number | undefined;
      let permMixedProfile: boolean | undefined;
      let fullController: boolean | undefined;
      if (includeSummary) {
        const rawRoleIds = rawRolesByUserProject.get(`${u.id}::${pid}`) ?? new Set<string>();
        const folders = new Set<string>();
        const tiers = new Set<string>();
        let maxStrength = 0;
        for (const rid of rawRoleIds) {
          for (const fp of folderPermsByProjectRole.get(`${pid}::${rid}`) ?? []) {
            folders.add(fp.folderId);
            const tier = normalizePermTier(fp.permType);
            tiers.add(tier);
            maxStrength = Math.max(maxStrength, permTierStrength(fp.permType));
          }
        }
        permissionStrength = maxStrength;
        folderBreadth = folders.size;
        permMixedProfile = tiers.size > 1;
        fullController = tiers.has("control");
      }
      const activity = input.activityByInstance?.get(`${email}::${pid}`);
      // [Phase B] per-instance action counts, then fold in the actor's account-level
      // admin action counts (same for every one of this user's instances — decision 9).
      const actionCounts: Record<string, number> = { ...(activity?.actionCounts ?? {}) };
      const adminCounts = input.adminActionsByActor?.get(email);
      if (adminCounts) {
        for (const [k, v] of Object.entries(adminCounts)) {
          actionCounts[k] = (actionCounts[k] ?? 0) + v;
        }
      }
      return {
        id: pid,
        name: meta.name,
        status: meta.status,
        isAdmin,
        roles,
        modules: prods.map((p) => p.key),
        crawlStatus: meta.crawlStatus,
        addedOn: membershipDates.get(`${u.id}::${pid}`)?.addedOn ?? null,
        lastSignIn: membershipDates.get(`${u.id}::${pid}`)?.lastSignIn ?? null,
        permissionStrength,
        folderBreadth,
        permMixedProfile,
        fullController,
        activityMix: activity?.mix,
        activityTotal: activity?.total,
        lastActivity: activity?.lastActivity,
        actionCounts,
      };
    });

    const allModules = [...new Set(projects.flatMap((p) => p.modules))];
    const allRoles = [...new Set(projects.flatMap((p) => p.roles))];
    const adminCount = projects.filter((p) => p.isAdmin).length;
    const activeCount = projects.filter((p) => p.status?.toLowerCase() === "active").length;

    // Build permission contexts: only for projects with crawlStatus "ok" or "partial"
    const permissionContexts: PermissionContext[] = [];
    if (includeContexts) for (const pid of projectIds) {
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
      isAccountAdmin: false,
      addedOn: null,
      // ── Optional BulkAccUser access-graph fields ─────────────────────────
      projectAdmin: adminCount > 0,
      firmId: u.companyId ?? dominantCompanyFor(u.id),
      firmName: (() => {
        const cid = u.companyId ?? dominantCompanyFor(u.id);
        return cid ? (companyName.get(cid) ?? null) : null;
      })(),
      accountStatus:
        u.status === "active" ? "active" : u.status === "inactive" ? "inactive" : null,
      permissionCoverage: coverageFor(projects.map((p) => p.crawlStatus ?? "never")),
      lastSignIn: u.lastSignIn ?? null,
      // ── DC-only extension ────────────────────────────────────────────────
      isExternal: classifyAffiliation(email) === "external",
      permissionContexts,
    });
  }

  return out;
}
