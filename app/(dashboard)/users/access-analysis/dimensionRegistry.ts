/**
 * dimensionRegistry.ts — Pure, data-backed registry of analysis/layout dimensions.
 *
 * No React, no DOM, no I/O (mirrors featureTargets.ts / mathLayer.ts purity).
 *
 * FOUNDATION ONLY (P2). It registers ONLY dimensions whose source field is present
 * in the client snapshot/feed today, and describes each one + how to read a node's
 * value. The 50+ slider UI and the layout-weighting wiring are later phases — this
 * module does NOT touch physics, edges, the renderer, or any UI.
 *
 * Design intent + source-field citations:
 *   docs/superpowers/specs/2026-05-21-access-analysis-dimension-taxonomy.md
 */

import type { NodeFeatureSnapshot } from "./interactionTypes";

export type DimensionId =
  | "project"
  | "role"
  | "tier"
  | "internalExternal"
  | "company"
  | "activity"
  | "signin"
  | "isAdmin";

export type DimensionFamily =
  | "structure"
  | "access"
  | "affiliation"
  | "behavior"
  | "tenure"
  | "risk";

export type DimensionType =
  | "categorical"
  | "binary"
  | "scalar"
  | "temporal"
  | "multi-hot"
  | "derived";

/** Availability codes from the taxonomy: A1 in-snapshot … A5 unavailable. */
export type Availability = "A1" | "A2" | "A3" | "A4" | "A5";

export type Confidence = "high" | "medium" | "low";

/** Confidence → weighting factor (taxonomy §14 universal weighting model). */
export const CONFIDENCE_FACTOR: Readonly<Record<Confidence, number>> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

/** Near-universal products excluded from the module signature (discovery §3). */
export const BASELINE_MODULES: readonly string[] = ["insight", "docs"];

/** A node's value for a dimension. `null`/`[]` mean "no value" (availability 0). */
export type DimensionValue = string | string[] | number | null;

export interface DimensionDescriptor {
  id: DimensionId;
  label: string;
  family: DimensionFamily;
  type: DimensionType;
  /** Human-readable source field, traceable to the discovery package. */
  source: string;
  availability: Availability;
  /** Base layout weight from the taxonomy, in [0,1]. */
  defaultWeight: number;
  confidence: Confidence;
  /** Pure read of the node's categorical/scalar/multi-hot value (or null). */
  extract(f: NodeFeatureSnapshot): DimensionValue;
  /**
   * True when the node has a usable value — the per-node availability gate from
   * the weighting model (§14): sparse/unknown values return false so they never
   * drag a node into a pole. NOTE: this is a weighting concern, not a filter —
   * "unknown"/"(none)" are still valid categories returned by `extract`.
   */
  isAvailable(f: NodeFeatureSnapshot): boolean;
}

export const DIMENSION_REGISTRY: readonly DimensionDescriptor[] = [
  {
    id: "project",
    label: "Project",
    family: "structure",
    type: "categorical",
    source: "AccDcProjectUser.projectId (graph_user_projects.project_name)",
    availability: "A1",
    defaultWeight: 0.35,
    confidence: "high",
    extract: (f) => f.project,
    isAvailable: (f) => f.project !== "" && f.project !== "(unknown)",
  },
  {
    id: "role",
    label: "Role",
    family: "structure",
    type: "categorical",
    source: "AccDcProjectUserRole.roleId ⋈ AccRole.name (graph_user_projects.role_id)",
    availability: "A1",
    defaultWeight: 0.25,
    confidence: "high",
    extract: (f) => f.role,
    isAvailable: (f) => f.role !== "" && f.role !== "(no role)",
  },
  {
    id: "tier",
    label: "Permission tier",
    family: "access",
    type: "categorical",
    source: "AccFolderPermission.permType via role (NodeFeatureSnapshot.permTier)",
    availability: "A1",
    defaultWeight: 0.15,
    confidence: "medium",
    // Matches featureTargets.categoryValue('tier') for the drift guard.
    extract: (f) => f.permTier ?? "(none)",
    isAvailable: (f) => f.permissionCoverage !== "unknown" && f.permTier != null,
  },
  {
    id: "internalExternal",
    label: "Internal / external",
    family: "affiliation",
    type: "categorical",
    source: "AccDcUser.email vs internalDomains (NodeFeatureSnapshot.affiliation)",
    availability: "A1",
    defaultWeight: 0.1,
    confidence: "high",
    // 3-way affiliation; fall back to the 2-way isExternal if affiliation absent.
    extract: (f) => f.affiliation ?? (f.isExternal ? "external" : "internal"),
    isAvailable: (f) => (f.affiliation ?? "unknown") !== "unknown",
  },
  {
    id: "company",
    label: "Company / firm",
    family: "affiliation",
    type: "categorical",
    source: "AccDcProjectUserCompany ⋈ AccDcCompany.name (NodeFeatureSnapshot.firmName)",
    availability: "A1",
    defaultWeight: 0.1,
    confidence: "high",
    extract: (f) => (f.firmName !== "" ? f.firmName : null),
    isAvailable: (f) => f.firmName !== "",
  },
  {
    id: "activity",
    label: "Activity volume",
    family: "behavior",
    type: "categorical",
    source: "AccActivity rollup, bucketed (NodeFeatureSnapshot.activityBucket)",
    availability: "A1",
    defaultWeight: 0.05,
    confidence: "medium",
    extract: (f) => f.activityBucket,
    isAvailable: (f) => f.activityBucket !== "None",
  },
  {
    id: "signin",
    label: "Sign-in recency",
    family: "behavior",
    type: "temporal",
    source: "AccDcUser.lastSignIn bucketed (NodeFeatureSnapshot.signinBucket)",
    availability: "A1",
    defaultWeight: 0.05,
    confidence: "low",
    extract: (f) => f.signinBucket,
    // Every node has a bucket, so the value is always present. Distinguishing
    // genuine ">90d" from never/unknown needs a bucket refinement (future); until
    // then signin is always "available" and confidence:low down-weights it.
    isAvailable: () => true,
  },
  {
    id: "isAdmin",
    label: "Admin / member",
    family: "access",
    type: "binary",
    source: "graph_user_projects.is_project_admin (AccDcProjectUser project_admin)",
    availability: "A1",
    defaultWeight: 0.1,
    confidence: "high",
    extract: (f) => (f.isAdmin ? "admin" : "member"),
    // Binary axis: admin ↔ member are both real poles, so always available.
    isAvailable: () => true,
  },
];

export function getDimension(id: DimensionId): DimensionDescriptor | undefined {
  return DIMENSION_REGISTRY.find((d) => d.id === id);
}

export const DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.map((d) => d.id);
