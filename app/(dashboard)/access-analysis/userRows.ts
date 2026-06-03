import type { AccessInstance, ModuleId } from "./types";
import { MODULES } from "./modules";

// Stable module ordering for the unioned chip lists (matches the catalog order).
const MODULE_ORDER = new Map<ModuleId, number>(MODULES.map((m, i) => [m.id, i]));
const byModuleOrder = (a: ModuleId, b: ModuleId) =>
  (MODULE_ORDER.get(a) ?? 99) - (MODULE_ORDER.get(b) ?? 99);

/** One project a user belongs to — the expand-row detail under a user. */
export interface UserProjectRow {
  projectId: string;
  project: string;
  modules: ModuleId[];
  adminModules: ModuleId[];
  role: string;                 // all roles in this project, joined
  company: string;
  access: "Admin" | "Member";
}

/** One person — the collapsed top-level row. Unions roll up across their projects. */
export interface UserRow {
  userId: string;
  name: string;
  email: string;
  type: "Internal" | "External";
  isAdminAnywhere: boolean;
  projectCount: number;
  modules: ModuleId[];          // union across all projects
  roles: string[];              // union across all projects
  companies: string[];          // union across all projects
  projects: UserProjectRow[];
}

/**
 * Collapse per-(user, project) instances into one row per user. The same person
 * appears in many projects in the instance view; here their modules/roles/
 * companies are unioned so "who has access to what" reads at a glance, with the
 * per-project breakdown preserved in `projects` for the expand view.
 */
export function buildUserRows(instances: AccessInstance[]): UserRow[] {
  const byUser = new Map<string, AccessInstance[]>();
  for (const i of instances) {
    (byUser.get(i.userId) ?? byUser.set(i.userId, []).get(i.userId)!).push(i);
  }

  const rows: UserRow[] = [];
  for (const [userId, insts] of byUser) {
    const modules = new Set<ModuleId>();
    const roles = new Set<string>();
    const companies = new Set<string>();
    let isAdminAnywhere = false;

    const projects: UserProjectRow[] = insts
      .map((i) => {
        for (const m of i.modules) modules.add(m);
        for (const r of i.roles) roles.add(r);
        if (i.company) companies.add(i.company);
        if (i.isAdmin) isAdminAnywhere = true;
        return {
          projectId: i.projectId,
          project: i.projectName,
          modules: [...i.modules].sort(byModuleOrder),
          adminModules: [...i.adminModules].sort(byModuleOrder),
          role: i.roles.join("; "),
          company: i.company ?? "",
          access: (i.isAdmin ? "Admin" : "Member") as "Admin" | "Member",
        };
      })
      .sort((a, b) => a.project.localeCompare(b.project));

    const u = insts[0]; // name/email/isInternal are constant per userId
    rows.push({
      userId,
      name: u.name,
      email: u.email,
      type: u.isInternal ? "Internal" : "External",
      isAdminAnywhere,
      projectCount: insts.length,
      modules: [...modules].sort(byModuleOrder),
      roles: [...roles].sort((a, b) => a.localeCompare(b)),
      companies: [...companies].sort((a, b) => a.localeCompare(b)),
      projects,
    });
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
