import { EMPTY_FILTERS, type FilterState } from "./types";

export function serializeFilters(f: FilterState): string {
  return JSON.stringify(f);
}

export function parseFilters(raw: string | null): FilterState {
  if (!raw) return { ...EMPTY_FILTERS };
  try {
    const o = JSON.parse(raw) as Partial<FilterState>;
    return {
      projectId: Array.isArray(o.projectId) ? o.projectId.map(String) : [],
      company: Array.isArray(o.company) ? o.company.map(String) : [],
      role: Array.isArray(o.role) ? o.role.map(String) : [],
      module: Array.isArray(o.module) ? (o.module as FilterState["module"]) : [],
      internalExternal: o.internalExternal === "internal" || o.internalExternal === "external" ? o.internalExternal : null,
      adminMember: o.adminMember === "admin" || o.adminMember === "member" ? o.adminMember : null,
      dateFrom: typeof o.dateFrom === "string" ? o.dateFrom : null,
      dateTo: typeof o.dateTo === "string" ? o.dateTo : null,
      search: typeof o.search === "string" ? o.search : "",
    };
  } catch {
    return { ...EMPTY_FILTERS };
  }
}
