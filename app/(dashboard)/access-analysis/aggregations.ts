import type { AccessInstance, Category, SummaryDTO } from "./types";
import { MODULES } from "./modules";

function topN(map: Map<string, { value: number; key?: string; label?: string }>, n = 15): Category[] {
  return [...map.entries()]
    .map(([mapKey, v]) => ({ label: v.label ?? mapKey, value: v.value, key: v.key }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function buildSummary(rows: AccessInstance[]): SummaryDTO {
  const users = new Set<string>();
  const projects = new Set<string>();
  const companies = new Set<string>();
  const roles = new Set<string>();
  let internal = 0, external = 0, admin = 0, member = 0;
  let externalMembers = 0, externalAdmins = 0, projectAdmins = 0, pending = 0;

  const moduleAcc = new Map(MODULES.map((m) => [m.id, { admin: 0, member: 0 }]));
  const projectCount = new Map<string, { value: number; key?: string; label?: string }>();
  const roleCount = new Map<string, { value: number; key?: string; label?: string }>();
  const companyCount = new Map<string, { value: number; key?: string; label?: string }>();

  for (const r of rows) {
    users.add(r.userId);
    projects.add(r.projectId);
    if (r.company) { companies.add(r.company); }
    for (const role of r.roles) roles.add(role);

    if (r.isInternal) internal++; else { external++; externalMembers++; }
    if (r.isAdmin) { admin++; projectAdmins++; if (!r.isInternal) externalAdmins++; } else member++;
    if ((r.status ?? "").toLowerCase() === "pending") pending++;

    for (const id of r.modules) {
      const acc = moduleAcc.get(id)!;
      if (r.adminModules.includes(id)) acc.admin++; else acc.member++;
    }

    if (!projectCount.has(r.projectId)) projectCount.set(r.projectId, { value: 0, key: r.projectId, label: r.projectName });
    projectCount.get(r.projectId)!.value++;
    for (const role of r.roles) {
      const rc = roleCount.get(role) ?? { value: 0 };
      rc.value++; roleCount.set(role, rc);
    }
    if (r.company) {
      const cc = companyCount.get(r.company) ?? { value: 0 };
      cc.value++; companyCount.set(r.company, cc);
    }
  }

  const modules = MODULES.map((m) => {
    const a = moduleAcc.get(m.id)!;
    return { id: m.id, label: m.label, admin: a.admin, member: a.member, total: a.admin + a.member };
  }).sort((x, y) => y.total - x.total);

  return {
    counts: { users: users.size, projects: projects.size, access: rows.length, roles: roles.size, companies: companies.size },
    composition: { internalExternal: { internal, external }, permission: { admin, member } },
    modules,
    rankings: { topProjects: topN(projectCount), membersPerRole: topN(roleCount), topCompanies: topN(companyCount) },
    risk: { externalMembers, externalAdmins, projectAdmins, pending },
  };
}
