import type { AccessInstance, FilterState } from "./types";

const anyOf = <T>(sel: T[], has: (v: T) => boolean) => sel.length === 0 || sel.some(has);

export function matchesFilters(i: AccessInstance, f: FilterState): boolean {
  if (f.internalExternal === "internal" && !i.isInternal) return false;
  if (f.internalExternal === "external" && i.isInternal) return false;
  if (f.adminMember === "admin" && !i.isAdmin) return false;
  if (f.adminMember === "member" && i.isAdmin) return false;
  if (!anyOf(f.projectId, (p) => p === i.projectId)) return false;
  if (!anyOf(f.company, (c) => c === i.company)) return false;
  if (!anyOf(f.role, (r) => i.roles.includes(r))) return false;
  if (!anyOf(f.module, (m) => i.modules.includes(m))) return false;
  if (f.dateFrom && (!i.addedOn || i.addedOn < f.dateFrom)) return false;
  if (f.dateTo && (!i.addedOn || i.addedOn > f.dateTo)) return false;
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = `${i.name} ${i.email} ${i.projectName} ${i.company ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function filterInstances(rows: AccessInstance[], f: FilterState): AccessInstance[] {
  return rows.filter((r) => matchesFilters(r, f));
}
