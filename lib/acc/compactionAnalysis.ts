import type { BulkAccUser } from "./acc-types";

export type CompactionFlag = "junk-role" | "module-discrepancy" | "duplicate-role" | "inactive";

export interface CompactionCandidate {
  user: BulkAccUser;
  flags: CompactionFlag[];
  junkRoles: Array<{ role: string; project: string; globalCount: number }>;
  moduleDiscrepancies: Array<{
    project: string;
    role: string;
    unexpectedModules: string[];
    missingModules: string[];
  }>;
  duplicateRoles: Array<{ role: string; projects: string[] }>;
}

export interface CompactionResult {
  candidates: CompactionCandidate[];
  byFlag: Record<CompactionFlag, CompactionCandidate[]>;
  totalCandidates: number;
}

// A role held by <= this many users across the hub is considered anomalous/junk
const JUNK_ROLE_THRESHOLD = 2;
// Minimum users with the same role in the same project before establishing a module baseline
const BASELINE_MIN_USERS = 3;

export function analyzeCompactionCandidates(users: BulkAccUser[]): CompactionResult {
  const found = users.filter((u) => u.found);

  // Build global role → user-email map for frequency counting
  const roleEmailMap = new Map<string, Set<string>>();
  for (const user of found) {
    for (const role of user.allRoles) {
      if (!roleEmailMap.has(role)) roleEmailMap.set(role, new Set());
      roleEmailMap.get(role)!.add(user.email);
    }
  }

  // Collect module arrays per (projectId, role) key for baseline computation
  const projectRoleModules = new Map<string, string[][]>();
  for (const user of found) {
    for (const project of user.projects) {
      for (const role of project.roles) {
        const key = `${project.id}:${role}`;
        if (!projectRoleModules.has(key)) projectRoleModules.set(key, []);
        projectRoleModules.get(key)!.push(project.modules);
      }
    }
  }

  // Compute modal module set per (project, role): modules present in >=50% of instances
  const projectRoleBaseline = new Map<string, Set<string>>();
  for (const [key, allModuleSets] of projectRoleModules.entries()) {
    if (allModuleSets.length < BASELINE_MIN_USERS) continue;
    const counts = new Map<string, number>();
    for (const mods of allModuleSets) {
      for (const mod of mods) counts.set(mod, (counts.get(mod) ?? 0) + 1);
    }
    const baseline = new Set<string>();
    const threshold = allModuleSets.length * 0.5;
    for (const [mod, count] of counts.entries()) {
      if (count >= threshold) baseline.add(mod);
    }
    if (baseline.size > 0) projectRoleBaseline.set(key, baseline);
  }

  const candidates: CompactionCandidate[] = [];

  for (const user of found) {
    const flags: CompactionFlag[] = [];
    const junkRoles: CompactionCandidate["junkRoles"] = [];
    const moduleDiscrepancies: CompactionCandidate["moduleDiscrepancies"] = [];
    const duplicateRoles: CompactionCandidate["duplicateRoles"] = [];

    if (user.activeCount === 0) flags.push("inactive");

    for (const project of user.projects) {
      for (const role of project.roles) {
        const globalCount = roleEmailMap.get(role)?.size ?? 0;
        if (globalCount <= JUNK_ROLE_THRESHOLD) {
          junkRoles.push({ role, project: project.name, globalCount });
        }

        const baseline = projectRoleBaseline.get(`${project.id}:${role}`);
        if (baseline) {
          const userMods = new Set(project.modules);
          const unexpectedModules = project.modules.filter((m) => !baseline.has(m));
          const missingModules = [...baseline].filter((m) => !userMods.has(m));
          if (unexpectedModules.length > 0 || missingModules.length > 0) {
            moduleDiscrepancies.push({ project: project.name, role, unexpectedModules, missingModules });
          }
        }
      }
    }

    if (junkRoles.length > 0) flags.push("junk-role");
    if (moduleDiscrepancies.length > 0) flags.push("module-discrepancy");

    const roleToProjNames = new Map<string, string[]>();
    for (const project of user.projects) {
      for (const role of project.roles) {
        if (!roleToProjNames.has(role)) roleToProjNames.set(role, []);
        roleToProjNames.get(role)!.push(project.name);
      }
    }
    for (const [role, projNames] of roleToProjNames.entries()) {
      if (projNames.length >= 2) duplicateRoles.push({ role, projects: projNames });
    }
    if (duplicateRoles.length > 0) flags.push("duplicate-role");

    if (flags.length > 0) {
      candidates.push({ user, flags, junkRoles, moduleDiscrepancies, duplicateRoles });
    }
  }

  return {
    candidates,
    byFlag: {
      "junk-role": candidates.filter((c) => c.flags.includes("junk-role")),
      "module-discrepancy": candidates.filter((c) => c.flags.includes("module-discrepancy")),
      "duplicate-role": candidates.filter((c) => c.flags.includes("duplicate-role")),
      inactive: candidates.filter((c) => c.flags.includes("inactive")),
    },
    totalCandidates: candidates.length,
  };
}
