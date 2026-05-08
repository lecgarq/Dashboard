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
}
