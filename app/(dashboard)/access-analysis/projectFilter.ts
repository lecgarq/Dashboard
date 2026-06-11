/**
 * Pure helpers for the project multi-select on the roles donut.
 *
 * The donut is built from per-(user, project) memberships. The project picker is
 * a checkbox dropdown: the user keeps a *set* of selected project ids, and the
 * client re-runs `summarizeRoles` on the memberships of the selected projects.
 * The search string only narrows which project options are shown in the list —
 * it does not filter the donut directly.
 */
export interface ProjectRoleRow {
  projectId: string;
  projectName: string;
  roles: string[];
}

/** Anything carrying a project id + name — the only fields the picker needs. */
export interface ProjectNamed {
  projectId: string;
  projectName: string;
}

export interface ProjectOption {
  id: string;
  name: string;
}

/** Distinct projects as {id, name}, sorted alphabetically by name. */
export function projectOptions(rows: ReadonlyArray<ProjectNamed>): ProjectOption[] {
  const byId = new Map<string, string>();
  for (const r of rows) if (!byId.has(r.projectId)) byId.set(r.projectId, r.projectName);
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Narrow the option list to those whose name contains `query`
 * (case-insensitive, whitespace-trimmed). An empty/blank query keeps every
 * option, so the full list shows by default.
 */
export function filterProjectOptions(options: ProjectOption[], query: string): ProjectOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((o) => o.name.toLowerCase().includes(needle));
}

/** Keep only rows whose project id is in the selected set. */
export function filterRowsBySelection<T extends { projectId: string }>(
  rows: ReadonlyArray<T>,
  selected: ReadonlySet<string>,
): T[] {
  return rows.filter((r) => selected.has(r.projectId));
}
