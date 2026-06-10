/**
 * Canonical ACC taxonomy — the single source of truth for the dimension redesign.
 * Unifies the hand-curated static constants with the generated action catalog and
 * exposes pure lookup helpers. No React/DOM/IO. Excel acc.xlsx is the authority;
 * see spec docs/superpowers/specs/2026-05-28-access-analysis-dimension-redesign-design.md.
 */
import { normalizeActionId } from "./accNormalize";
import {
  MODULES, GROUPS,
  ENTITLEMENT_TO_MODULE, ACTION_ALIASES, ADMIN_SOURCE_ACTION_IDS,
} from "./accTaxonomyStatic";
import { GENERATED_ACTIONS } from "./accTaxonomyActions.generated";
import type { TaxonomyAction, TaxonomyModule } from "./accTaxonomy.types";

export * from "./accTaxonomy.types";

const ACTION_BY_ID = new Map<string, TaxonomyAction>(GENERATED_ACTIONS.map((a) => [a.id, a]));
const MODULE_BY_ID = new Map<string, TaxonomyModule>(MODULES.map((m) => [m.id, m]));

export const getModules = () => MODULES;
export const getGroups = () => GROUPS;
export const getActions = () => GENERATED_ACTIONS;

export const getAction = (id: string): TaxonomyAction | undefined => ACTION_BY_ID.get(id);
export const getModuleById = (id: string): TaxonomyModule | undefined => MODULE_BY_ID.get(id);

/** Normalize a raw label/action, then apply the alias table. */
export function resolveActionId(rawAction: string): string {
  const norm = normalizeActionId(rawAction);
  return ACTION_ALIASES[norm] ?? norm;
}

export function getModuleForEntitlement(productKey: string): TaxonomyModule | undefined {
  const moduleId = ENTITLEMENT_TO_MODULE[productKey];
  return moduleId ? MODULE_BY_ID.get(moduleId) : undefined;
}

export const getActionsByModule = (moduleId: string): TaxonomyAction[] =>
  GENERATED_ACTIONS.filter((a) => a.moduleId === moduleId);

export const isAdminSourceAction = (id: string): boolean => ADMIN_SOURCE_ACTION_IDS.has(id);
