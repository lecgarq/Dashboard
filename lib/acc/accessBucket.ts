/**
 * accessBucket.ts — the admin/member axis of one (user, project) membership.
 *
 * Separate from roleCounts.ts on purpose: role is what a person is CALLED on a
 * project (free-text ACC metadata, often absent), access level is what they can
 * DO (derived from provisioned module access levels). They answer different
 * questions and a seat can be high on one and empty on the other.
 *
 * Three buckets, not two: 8,892 of 22,279 memberships (measured 2026-07-24) carry
 * no provisioned module at all. Folding those into "Member" would report ~80% of
 * seats as members when nearly half of that group cannot open a single module —
 * the empty-access population is the interesting one, so it gets its own name.
 *
 * Pure — no React/DOM/IO.
 */

/** Admin access level on at least one provisioned module. */
export const PROJECT_ADMIN = "Project admin";
/** Provisioned on at least one module, admin on none. */
export const PROJECT_MEMBER = "Member";
/** A membership row with zero provisioned modules — a seat that opens nothing. */
export const NO_MODULE_ACCESS = "No module access";

export function accessBucketLabel(row: {
  modules: readonly string[];
  adminModules: readonly string[];
}): string {
  if (row.adminModules.length > 0) return PROJECT_ADMIN;
  return row.modules.length > 0 ? PROJECT_MEMBER : NO_MODULE_ACCESS;
}
