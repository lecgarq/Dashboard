/**
 * Pure transform for the "Provisioned modules" panel (Overview tab, item 1,
 * UAT-21.1-01). Aggregates `ProvisionedModuleRow[]` (from
 * `lib/server/provisionedModulesView.ts`) per module into horizontal-bar
 * values + a per-module project drill payload. No React/DOM/IO -- safe on
 * both server and client.
 *
 * Uses the full modules.ts 10-module vocabulary (unlike the activity donut's
 * 9-excel + Admin Actions set) -- this chart legitimately includes
 * modelCoordination if grants exist, since it measures provisioning, not
 * activity attribution.
 */
import type { ProvisionedModuleRow } from "@/lib/server/provisionedModulesView";
import { MODULES, moduleLabelById } from "./modules";
import type { ModuleId } from "./types";

/** One module's total grant count -- a horizontal-bar value. */
interface ProvisionedModuleBar {
  id: string;
  name: string;
  value: number; // total grants
}

/** One project's grant count within a module's drill-down. */
interface ProvisionedModuleProjectRow {
  projectId: string;
  projectName: string;
  count: number;
}

export interface ProvisionedModuleSummary {
  /** Modules with >0 grants, sorted desc (tiebreak name). */
  bars: ProvisionedModuleBar[];
  /** Sum of all grants in scope. */
  total: number;
  /** Canonical modules with 0 grants, in canonical MODULES order -- labeled, never hidden. */
  zeroModules: Array<{ id: string; name: string }>;
  /** moduleId -> its per-project grant rows, sorted count desc then project name. */
  projectsByModule: Map<string, ProvisionedModuleProjectRow[]>;
}

/**
 * Aggregates provisioned-module rows (already project-filtered by the caller)
 * per module: total grant count and a per-project drill breakdown. Sorted by
 * total desc (tiebreak module name). Defensively merges duplicate
 * (module, project) rows -- mirrors `summarizePermissionLevel`'s project
 * merge. `zeroModules` guarantees all 10 canonical modules are accounted for
 * (present in `bars` or `zeroModules`), never silently dropped.
 */
export function summarizeProvisionedModules(
  rows: ReadonlyArray<ProvisionedModuleRow>,
): ProvisionedModuleSummary {
  const byModule = new Map<
    string,
    { moduleId: string; total: number; projects: Map<string, ProvisionedModuleProjectRow> }
  >();

  for (const r of rows) {
    const entry = byModule.get(r.moduleId) ?? {
      moduleId: r.moduleId,
      total: 0,
      projects: new Map<string, ProvisionedModuleProjectRow>(),
    };
    entry.total += r.count;
    const existing = entry.projects.get(r.projectId);
    if (existing) existing.count += r.count;
    else entry.projects.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, count: r.count });
    byModule.set(r.moduleId, entry);
  }

  const bars: ProvisionedModuleBar[] = [...byModule.values()]
    .filter((entry) => entry.total > 0)
    .map((entry) => ({ id: entry.moduleId, name: moduleLabelById(entry.moduleId as ModuleId), value: entry.total }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const total = bars.reduce((sum, b) => sum + b.value, 0);

  const zeroModules = MODULES.filter((m) => (byModule.get(m.id)?.total ?? 0) === 0).map((m) => ({
    id: m.id,
    name: m.label,
  }));

  const projectsByModule = new Map<string, ProvisionedModuleProjectRow[]>();
  for (const entry of byModule.values()) {
    if (entry.total === 0) continue;
    projectsByModule.set(
      entry.moduleId,
      [...entry.projects.values()].sort((a, b) => b.count - a.count || a.projectName.localeCompare(b.projectName)),
    );
  }

  return { bars, total, zeroModules, projectsByModule };
}
