export interface BulkAccProject {
  id: string;
  name: string;
  status: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
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
}
