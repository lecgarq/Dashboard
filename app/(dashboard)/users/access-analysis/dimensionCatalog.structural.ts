/**
 * Structural / access / affiliation / tenure dimensions — the non-activity-tree
 * catalog dims, written fresh from the excel taxonomy (complete rewrite; does NOT
 * reuse the legacy dimensionRegistry). Pure: reads only a NodeFeatureSnapshot.
 *
 * The original 9 are slider+color dims. The Phase-25 aperture dims appended below
 * are COLOR-ONLY (`surfaces:["color"]`): they widen Group-by/Color-by/filter
 * without adding physics sliders or changing the Phase-26 slider wall.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { ENTITLEMENT_TO_MODULE } from "./accTaxonomyStatic";
import { inferActivityService } from "@/lib/acc/activityCategories";
import { dominantActivityCategory } from "./dimensionRegistry";

/** Map a node's productKey signature to the set of excel module ids it has access to. */
function moduleAccessOf(moduleSignature: string[] | undefined): string[] {
  const ids = new Set<string>();
  for (const key of moduleSignature ?? []) {
    const moduleId = ENTITLEMENT_TO_MODULE[key];
    if (moduleId) ids.add(moduleId);
  }
  return [...ids].sort();
}

export function buildStructuralDimensions(): CatalogDimension[] {
  return [
    {
      id: "user", label: "Users", family: "structure", kind: "categorical",
      source: "AccDcProjectUser.user_id ⋈ name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.userName ? f.userName : null),
    },
    {
      id: "role", label: "Role", family: "structure", kind: "categorical",
      source: "AccDcProjectUserRole ⋈ AccRole.name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.role && f.role !== "(no role)" ? f.role : null),
    },
    {
      id: "project", label: "Project", family: "structure", kind: "categorical",
      source: "AccDcProjectUser.projectId", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.project && f.project !== "(unknown)" ? f.project : null),
    },
    {
      id: "company", label: "Company", family: "structure", kind: "categorical",
      source: "AccDcProjectUserCompany ⋈ AccDcCompany.name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.firmName ? f.firmName : null),
    },
    {
      id: "moduleAccess", label: "Module access", family: "access", kind: "multiHot",
      source: "AccDcProjectUserProduct.productKey → excel module", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => moduleAccessOf(f.moduleSignature),
    },
    {
      id: "folderAccessPermissions", label: "Folder access permissions", family: "access", kind: "ordinal",
      source: "MAX folder-grant strength 0..5 (access ladder)", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.permissionStrength ?? 0,
    },
    {
      id: "activityVolume", label: "Activity volume", family: "structure", kind: "ordinal",
      source: "Sum of activity events for this instance", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.activityTotal ?? 0,
    },
    {
      id: "activityByModule", label: "Activity by module", family: "structure", kind: "multiHot",
      source: "Active modules inferred from action counts", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => {
        const activeModules = new Set<string>();
        if (f.actionCounts) {
          for (const [action, count] of Object.entries(f.actionCounts)) {
            if (count > 0) {
              const domain = inferActivityService(action);
              if (domain) activeModules.add(domain);
            }
          }
        }
        return [...activeModules].sort();
      },
    },
    {
      id: "typeOfActivity", label: "Type of activity", family: "structure", kind: "multiHot",
      source: "Active categories from activity mix", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => {
        const activeTypes = new Set<string>();
        if (f.activityMix) {
          for (const [cat, count] of Object.entries(f.activityMix)) {
            if (count > 0) activeTypes.add(cat);
          }
        }
        return [...activeTypes].sort();
      },
    },
    // ---- Phase 25 aperture dims (color-only; no physics sliders) ----------
    {
      id: "internalExternal", label: "Internal / External", family: "affiliation", kind: "binary",
      source: "email domain vs INTERNAL_DOMAINS (snapshot.affiliation)", confidence: "high", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => (f.affiliation && f.affiliation !== "unknown" ? f.affiliation : null),
    },
    {
      id: "adminMember", label: "Admin / Member", family: "access", kind: "binary",
      source: "graph_user_projects.is_project_admin", confidence: "high", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => (f.isAdmin == null ? null : f.isAdmin ? "Admin" : "Member"),
    },
    {
      id: "permissionTier", label: "Permission tier", family: "access", kind: "categorical",
      source: "MAX folder-grant tier (snapshot.permTier)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => f.permTier ?? null,
    },
    {
      id: "activityRecency", label: "Activity recency", family: "structure", kind: "categorical",
      source: "Days since last activity event (activityRecencyBucket)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => f.activityRecencyBucket ?? null,
    },
    {
      id: "signinRecency", label: "Sign-in recency", family: "structure", kind: "categorical",
      source: "AccUser last sign-in bucket (signinBucket)", confidence: "high", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => f.signinBucket ?? null,
    },
    {
      id: "membershipTenure", label: "Membership tenure", family: "tenure", kind: "categorical",
      source: "AccDcProjectUser.addedOn age bucket (membershipBucket)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => (f.membershipBucket && f.membershipBucket !== "unknown" ? f.membershipBucket : null),
    },
    {
      id: "dominantActivity", label: "Dominant activity", family: "structure", kind: "categorical",
      source: "Largest activityMix category", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => {
        const c = dominantActivityCategory(f.activityMix);
        return c === "(none)" ? null : c;
      },
    },
    {
      id: "riskScore", label: "Risk score", family: "access", kind: "ordinal",
      source: "Count of true riskFlags 0..5 (snapshot.riskScore)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => f.riskScore ?? null,
    },
    {
      id: "folderBreadth", label: "Folder breadth", family: "access", kind: "ordinal",
      source: "Distinct folders granted (permissionTypeSummary.folderBreadth)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => f.permissionTypeSummary?.folderBreadth ?? null,
    },
    {
      id: "accessibleDataTB", label: "Accessible data", family: "access", kind: "ordinal",
      source: "Sum of reachable folder bytes (accessibleDataBytes; 0 until crawled)", confidence: "low", available: true,
      surfaces: ["color"], colorScale: "categorical",
      extract: (f) => f.accessibleDataBytes ?? null,
    },
  ];
}
