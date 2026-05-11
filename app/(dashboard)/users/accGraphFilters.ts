/**
 * Pure filter logic for AccUsersGraph.
 * Extracted into its own module so it can be imported by Vitest tests
 * without pulling in React, Next.js, or "use client" boundaries.
 *
 * Plan 02.5-02: FILT-01 / FILT-02 / FILT-03
 */

export interface GraphFilters {
  roles: string[];
  lastAddedBuckets: string[];
  adminAccess: "all" | "admin" | "non-admin";
  /** Exclude-list: modules toggled OFF. Users with no modules always pass. */
  disabledModules: string[];
  /** Multi-select company role buckets. Empty = all pass. */
  companyRoles: string[];
  /** Inclusive lower bound — YYYY-MM-DD or "". When set, null lastSignIn is excluded. */
  dateFrom: string;
  /** Inclusive upper bound — YYYY-MM-DD or "". When set, null lastSignIn is excluded. */
  dateTo: string;
  /**
   * GRAPH-01: Per-project role include-list. Empty = all pass.
   * Source: BulkAccUser.perProjectRoleNames (from accMembers.enrichedUsers).
   * A node passes if its perProjectRoleNames contains at least one selected role.
   * Graceful degradation: undefined perProjectRoleNames = treated as empty (no roles).
   */
  perProjectRoles: string[];
}

export const DEFAULT_FILTERS: GraphFilters = {
  roles: [],
  lastAddedBuckets: [],
  adminAccess: "all",
  disabledModules: [],
  companyRoles: [],
  dateFrom: "",
  dateTo: "",
  perProjectRoles: [],
};

/** Minimal shape required by nodeMatchesFilters — matches the SimNode/UserNode fields it reads. */
export interface FilterableNode {
  roles: string[];
  lastAddedBucket: string;
  isAdmin: boolean;
  modules: string[];
  companyRole: string | null;
  lastSignIn: string | null;
  /** GRAPH-01: per-project role names from accMembers.enrichedUsers. Optional — undefined = no roles. */
  perProjectRoleNames?: string[];
}

/**
 * Returns true when `node` should be visible given the current `filters`.
 *
 * Dimensions:
 *  - roles: include-list — node must share at least one role (empty = all pass)
 *  - lastAddedBuckets: include-list — node's bucket must be in the list (empty = all pass)
 *  - adminAccess: enum — "all" | "admin" | "non-admin"
 *  - disabledModules (FILT-03): exclude-list — node excluded only when ALL its modules are off;
 *      nodes with no modules always pass
 *  - companyRoles (DATA-01): include-list — empty = all pass; null companyRole -> "Unspecified"
 *  - dateFrom / dateTo (FILT-02): inclusive ISO date range; null lastSignIn excluded when range active
 *  - perProjectRoles (GRAPH-01): include-list — empty = all pass; AND-intersects with all other dimensions
 */
export function nodeMatchesFilters(node: FilterableNode, filters: GraphFilters): boolean {
  // Existing dimensions — unchanged semantics
  if (filters.roles.length > 0 && !node.roles.some((role) => filters.roles.includes(role))) return false;
  if (
    filters.lastAddedBuckets.length > 0 &&
    !filters.lastAddedBuckets.includes(node.lastAddedBucket || "Unknown")
  )
    return false;
  if (filters.adminAccess === "admin" && !node.isAdmin) return false;
  if (filters.adminAccess === "non-admin" && node.isAdmin) return false;

  // FILT-03: Module exclude-list.
  // Exclude only when ALL of the user's modules are disabled.
  // Users with no modules always pass (no modules = nothing to disable).
  if (filters.disabledModules.length > 0 && node.modules.length > 0) {
    if (node.modules.every((m) => filters.disabledModules.includes(m))) return false;
  }

  // DATA-01: companyRole multi-select. Empty = all pass.
  // null companyRole maps to "Unspecified" bucket.
  if (filters.companyRoles.length > 0) {
    const bucket = node.companyRole ?? "Unspecified";
    if (!filters.companyRoles.includes(bucket)) return false;
  }

  // FILT-02: Date range — inclusive both ends (ISO YYYY-MM-DD lexicographic compare).
  // When range is active, users with null lastSignIn are excluded.
  if (filters.dateFrom || filters.dateTo) {
    if (!node.lastSignIn) return false;
    const d = node.lastSignIn.slice(0, 10);
    if (filters.dateFrom && d < filters.dateFrom) return false;
    if (filters.dateTo && d > filters.dateTo) return false;
  }

  // GRAPH-01: perProjectRoles AND-intersection with all other dimensions.
  // Empty filter = no constraint. Undefined perProjectRoleNames gracefully treated as no roles.
  if (filters.perProjectRoles.length > 0) {
    const nodeRoles = node.perProjectRoleNames ?? [];
    if (!filters.perProjectRoles.some((r) => nodeRoles.includes(r))) return false;
  }

  return true;
}
