/**
 * moduleFlags.ts — Pure derivation of per-known-module presence flags from a
 * node's moduleSignature. No React/DOM/IO (mirrors dimensionRegistry purity).
 *
 * P5: this only ENRICHES the snapshot. It does NOT register a dimension descriptor
 * (that would create a layout target — see plan Hard Constraints). P6 wires these
 * flags into module-specific sliders.
 */

/**
 * Curated set of non-baseline ACC products we expose as individual flags. Baselines
 * (docs/insight) are excluded upstream by parseModuleSignature, so they never appear.
 * Keep in sync with productKeys observed in graph_user_projects.module_ids.
 */
export const KNOWN_ADVANCED_MODULES = [
  "build",
  "cost",
  "takeoff",
  "modelcoordination",
  "designcollaboration",
  "autospecs",
  "assets",
] as const;

export type KnownModule = (typeof KNOWN_ADVANCED_MODULES)[number];

/** Derive a complete (all keys present) flag map from a module signature. */
export function deriveModuleFlags(moduleSignature: readonly string[]): Record<string, boolean> {
  const present = new Set(moduleSignature);
  const out: Record<string, boolean> = {};
  for (const key of KNOWN_ADVANCED_MODULES) out[key] = present.has(key);
  return out;
}
