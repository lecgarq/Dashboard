/**
 * Pure helpers for the project search bar on the roles donut.
 *
 * The donut is built from per-(user, project) memberships. To let the chart
 * react to a project search without a server round-trip, the page hands the
 * client a slim row per membership; these helpers filter that list by project
 * name and the client re-runs `summarizeRoles` on the result.
 */
export interface ProjectRoleRow {
  projectId: string;
  projectName: string;
  roles: string[];
}

/**
 * Keep only memberships whose project name contains `query`
 * (case-insensitive, whitespace-trimmed). An empty/blank query keeps every row,
 * so the donut shows the whole account by default.
 */
export function filterRowsByProject<T extends { projectName: string }>(rows: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => r.projectName.toLowerCase().includes(needle));
}

/** Unique project names, sorted alphabetically — feeds the autocomplete datalist. */
export function distinctProjectNames(rows: ProjectRoleRow[]): string[] {
  return [...new Set(rows.map((r) => r.projectName))].sort((a, b) => a.localeCompare(b));
}

/** Number of distinct projects represented in a row list (not the row count). */
export function countMatchedProjects(rows: ProjectRoleRow[]): number {
  return new Set(rows.map((r) => r.projectId)).size;
}
