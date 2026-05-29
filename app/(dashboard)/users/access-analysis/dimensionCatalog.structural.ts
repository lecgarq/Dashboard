/**
 * Structural / access / affiliation / tenure dimensions — the 9 non-activity sliders,
 * written fresh from the excel taxonomy (complete rewrite; does NOT reuse the legacy
 * dimensionRegistry). Pure: reads only a NodeFeatureSnapshot.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { getModuleForEntitlement } from "./accTaxonomy";
import { ACCESS_LEVELS } from "./accTaxonomyStatic";

/** Map a node's productKey signature to the set of excel module ids it has access to. */
function moduleAccessOf(moduleSignature: string[] | undefined): string[] {
  const ids = new Set<string>();
  for (const key of moduleSignature ?? []) {
    const m = getModuleForEntitlement(key);
    if (m) ids.add(m.id);
  }
  return [...ids].sort();
}

export function buildStructuralDimensions(): CatalogDimension[] {
  return [
    {
      id: "project", label: "Project", family: "structure", kind: "categorical",
      source: "AccDcProjectUser.projectId", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.project && f.project !== "(unknown)" ? f.project : null),
    },
    {
      id: "role", label: "Role", family: "structure", kind: "categorical",
      source: "AccDcProjectUserRole ⋈ AccRole.name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.role && f.role !== "(no role)" ? f.role : null),
    },
    {
      id: "company", label: "Company", family: "affiliation", kind: "categorical",
      source: "AccDcProjectUserCompany ⋈ AccDcCompany.name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.firmName ? f.firmName : null),
    },
    {
      id: "status", label: "Status", family: "structure", kind: "categorical",
      source: "AccDcUser.accountStatus", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.accountStatus ? f.accountStatus : null),
    },
    {
      id: "permission", label: "Permission level", family: "access", kind: "ordinal",
      source: "MAX folder-grant strength 0..5 (access ladder)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "ordered",
      extract: (f) => f.permissionStrength ?? 0, // color mode only; per-tier sliders below
    },
    // Per-tier permission sliders — "single sliders, not a packaged slider". Each is a
    // one-hot on the node's MAX folder-grant tier (permissionStrength). View+ = strength 1..5.
    ...ACCESS_LEVELS.filter((lvl) => lvl.strength >= 1).map((lvl): CatalogDimension => ({
      id: `permission:${lvl.id}`,
      label: lvl.label,
      family: "access",
      kind: "ordinal",
      source: `permissionStrength === ${lvl.strength} (one-hot, ${lvl.permType})`,
      confidence: "medium",
      available: true,
      surfaces: ["slider"],
      extract: (f) => ((f.permissionStrength ?? 0) === lvl.strength ? 1 : 0),
    })),
    {
      id: "tenure", label: "Membership tenure", family: "tenure", kind: "ordinal",
      source: "AccDcProjectUser.addedOn (days since)", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.membershipAgeDays ?? null, // raw days; Phase D maps via ordinal ramp
    },
    {
      id: "moduleAccess", label: "Module access", family: "access", kind: "multiHot",
      source: "AccDcProjectUserProduct.productKey → excel module", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => moduleAccessOf(f.moduleSignature),
    },
    {
      id: "admin", label: "Admin / member", family: "access", kind: "binary",
      source: "AccDcProjectUser.is_project_admin", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.isAdmin ? "admin" : "member"),
    },
    {
      id: "internalExternal", label: "Internal / external", family: "affiliation", kind: "categorical",
      source: "AccDcUser.email vs internalDomains", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => f.affiliation ?? (f.isExternal ? "external" : "internal"),
    },
  ];
}
