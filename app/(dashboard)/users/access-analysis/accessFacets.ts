/**
 * accessFacets.ts — Pure, mask-only facet catalog + matchers for P7.
 *
 * No React, no DOM, NO physics/math symbols (PHYS-04 boundary — facets are a MASK
 * concern). Consumes already-emitted snapshot fields (riskFlags, permissionTypeSummary,
 * moduleSignature/moduleFlags). Adds NO DIMENSION_REGISTRY descriptor.
 *
 * Composition: within a facet key the selected members compose by OR; facet keys
 * compose by AND with each other (the predicate engine's existing across-key loop).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { BROAD_FOLDER_THRESHOLD } from "./riskFlags";

export type RiskFlagId =
  | "externalHighPerm"
  | "staleButActive"
  | "externalProjectAdmin"
  | "broadFolderAccess"
  | "highActivityHighPerm";

export type PermProfileId =
  | "fullController"
  | "mixedProfile"
  | "broadFolders"
  | "coverageKnown"
  | "coveragePartial"
  | "coverageUnknown";

export const RISK_FLAG_IDS: readonly RiskFlagId[] = [
  "externalHighPerm",
  "staleButActive",
  "externalProjectAdmin",
  "broadFolderAccess",
  "highActivityHighPerm",
];

export const PERM_PROFILE_IDS: readonly PermProfileId[] = [
  "fullController",
  "mixedProfile",
  "broadFolders",
  "coverageKnown",
  "coveragePartial",
  "coverageUnknown",
];

/** Keys used inside FilterContext.activeFilters. `module` reuses the registry dim id. */
export const FACET_KEY_RISK = "riskFlag";
export const FACET_KEY_PERM = "permProfile";
export const FACET_KEY_MODULE = "module";
const FACET_KEYS: readonly string[] = [FACET_KEY_RISK, FACET_KEY_PERM, FACET_KEY_MODULE];

export function isFacetKey(key: string): boolean {
  return FACET_KEYS.includes(key);
}

export function nodeHasRiskFlag(f: NodeFeatureSnapshot, id: RiskFlagId): boolean {
  return f.riskFlags?.[id] === true;
}

export function nodeHasPermProfile(f: NodeFeatureSnapshot, id: PermProfileId): boolean {
  const p = f.permissionTypeSummary;
  if (!p) return false;
  switch (id) {
    case "fullController":
      return p.fullController;
    case "mixedProfile":
      return p.mixedProfile;
    case "broadFolders":
      return p.folderBreadth >= BROAD_FOLDER_THRESHOLD;
    case "coverageKnown":
      return p.coverage === "known";
    case "coveragePartial":
      return p.coverage === "partial";
    case "coverageUnknown":
      return p.coverage === "unknown";
    default:
      return false;
  }
}

export function nodeInModule(f: NodeFeatureSnapshot, moduleKey: string): boolean {
  if (f.moduleFlags) return f.moduleFlags[moduleKey] === true;
  return (f.moduleSignature ?? []).includes(moduleKey);
}

export interface FacetSummary {
  risk: Record<RiskFlagId, number>;
  perm: Record<PermProfileId, number>;
  /** Module keys present in the data, sorted by count desc then key asc. */
  modules: { key: string; count: number }[];
}

export function summarizeFacets(
  features: ReadonlyArray<NodeFeatureSnapshot>,
): FacetSummary {
  const risk = Object.fromEntries(RISK_FLAG_IDS.map((id) => [id, 0])) as Record<RiskFlagId, number>;
  const perm = Object.fromEntries(PERM_PROFILE_IDS.map((id) => [id, 0])) as Record<PermProfileId, number>;
  const moduleCounts = new Map<string, number>();

  for (const f of features) {
    for (const id of RISK_FLAG_IDS) if (nodeHasRiskFlag(f, id)) risk[id]++;
    for (const id of PERM_PROFILE_IDS) if (nodeHasPermProfile(f, id)) perm[id]++;
    const keys = f.moduleFlags
      ? Object.keys(f.moduleFlags).filter((k) => f.moduleFlags![k])
      : (f.moduleSignature ?? []);
    for (const k of keys) moduleCounts.set(k, (moduleCounts.get(k) ?? 0) + 1);
  }

  const modules = [...moduleCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return { risk, perm, modules };
}

/** OR-within-family match for one facet key. Empty set = pass. Unknown key = pass. */
export function nodeMatchesFacet(
  f: NodeFeatureSnapshot,
  key: string,
  allowed: ReadonlySet<string>,
): boolean {
  if (allowed.size === 0) return true;
  if (key === FACET_KEY_RISK) {
    for (const id of allowed) if (nodeHasRiskFlag(f, id as RiskFlagId)) return true;
    return false;
  }
  if (key === FACET_KEY_PERM) {
    for (const id of allowed) if (nodeHasPermProfile(f, id as PermProfileId)) return true;
    return false;
  }
  if (key === FACET_KEY_MODULE) {
    for (const moduleKey of allowed) if (nodeInModule(f, moduleKey)) return true;
    return false;
  }
  return true;
}
