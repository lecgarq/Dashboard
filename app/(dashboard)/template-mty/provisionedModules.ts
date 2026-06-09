import { reduceModules, moduleLabelById } from "@/app/(dashboard)/access-analysis/modules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

export interface ProvisionedModuleSlice {
  id: ModuleId;
  name: string;
  value: number; // number of members provisioned for this module
}

export interface ProvisionedModuleSummary {
  /** One slice per module that ≥1 member can access, sorted by member count desc. */
  slices: ProvisionedModuleSlice[];
  /** Sum of slice values (module-grants across all members) — donut percentage base. */
  total: number;
  /** Distinct members considered (the donut's centre figure). */
  memberCount: number;
}

/**
 * Summarise which ACC modules the template's members are provisioned for.
 *
 * `products` is the per-member tier map (e.g. `{ docs:"member", build:"administrator" }`)
 * stored on AccProjectMember. A product counts as "provisioned" when its tier is
 * anything other than none/empty (delegated to reduceModules). Each member is
 * counted once per module, so slice values are member counts.
 */
export function summarizeProvisionedModules(
  members: ReadonlyArray<{ products: Record<string, string> }>,
): ProvisionedModuleSummary {
  const counts = new Map<ModuleId, number>();
  for (const m of members) {
    const productRows = Object.entries(m.products ?? {}).map(([productKey, accessLevel]) => ({
      productKey,
      accessLevel: String(accessLevel ?? ""),
    }));
    const { modules } = reduceModules(productRows);
    for (const id of modules) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const slices = [...counts.entries()]
    .map(([id, value]) => ({ id, name: moduleLabelById(id), value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return { slices, total, memberCount: members.length };
}
