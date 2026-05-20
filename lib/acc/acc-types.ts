export interface BulkAccProject {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
  /** AccProject.folderCrawlStatus for this project: "ok" | "never" | "partial" | "failed" | "inaccessible". */
  crawlStatus?: string;
}

export interface PermissionContext {
  projectId: string;
  folderId: string;
  folderPath: string;
  /** Raw APS value, e.g. "View Only" | "View+Download+Upload+Edit" | "Full Controller". */
  permType: string;
  /** Normalized rank: "view" | "download" | "upload" | "edit" | "control". */
  permissionTier: string;
  /** Raw APS actions array if available. */
  actions: string[];
  /** Folder-crawl status for the owning project. */
  crawlStatus: string;
  /** The role that granted this permission (permissions attach to roles, not users directly). */
  roleId: string;
}

export interface BulkAccUser {
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
  projects: BulkAccProject[];
  /** Company role from the ACC HQ user record. Null when not set in ACC; undefined when not yet surfaced by the API. */
  companyRole?: string | null;
  /** Last sign-in / activity ISO string from the ACC HQ user record. Null when ACC reports no activity. */
  lastSignIn?: string | null;
  /**
   * True iff the user has ACC account-level admin access (HQ v1 `role === "account_admin"`).
   * Distinct from per-project admin (BulkAccProject.isAdmin / accessLevels.projectAdmin).
   * Non-optional: legacy cache rows without the field default to false in bulkAccSummary.
   */
  isAccountAdmin: boolean;
  /**
   * ACC member-creation date as an ISO 8601 string, OR null when ACC reported no value
   * (or when the cache row is legacy and predates this field being plumbed). Source: HQ v1
   * `created_at`. Used by the DASH-06 Recently-Added widget — consumers MUST handle null
   * gracefully (legacy rows surface as null until the next bulkAccSync run; these users
   * will not appear in the 7d/30d/90d windows). Non-optional so consumers branch on
   * `addedOn === null` deterministically rather than guessing between null vs undefined.
   */
  addedOn: string | null;

  // ─── Phase 5 v2.0 enriched fields ─────────────────────────────────────────
  // Populated by `accMembers.enrichedUsers` merged in DashboardClient. All
  // optional (?) to avoid breaking existing consumers that don't call the new
  // procedure. Graceful degradation: undefined → feature absent for that user.

  /** Aggregated status from AccProjectMember (any "active" project → "active"). */
  aggregatedStatus?: "active" | "pending" | "deleted";
  /** True if projectAdmin on ANY project (from AccProjectMember). */
  projectAdmin?: boolean;
  /** True if executive on ANY project (from AccProjectMember). */
  executive?: boolean;
  /** Company display name from AccProjectMember (first non-null across projects). */
  companyName?: string | null;
  /** Distinct ACC per-project role names across all active projects. */
  perProjectRoleNames?: string[];

  // ─── Phase access-graph enriched fields ───────────────────────────────────
  /** DC company affiliation (firm), not the free-text job title. */
  firmId?: string | null;
  firmName?: string | null;
  /** AccDcUser.status — account status, NOT recent activity. */
  accountStatus?: "active" | "inactive" | null;
  /**
   * Folder-permission crawl coverage for THIS user, aggregated across their projects:
   * "known"   = all their projects are folder-crawled
   * "partial" = some crawled, some not
   * "unknown" = none crawled
   */
  permissionCoverage?: "known" | "partial" | "unknown";
  /** Raw contextual permission facts (one per user-role-folder grant). Empty when uncrawled. */
  permissionContexts?: PermissionContext[];
}
