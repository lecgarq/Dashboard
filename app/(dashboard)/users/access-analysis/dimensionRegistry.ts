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
  | "isAdmin"
  | "module"
  | "membershipBucket"
  | "activityRecency"
  | "riskScore";

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

/** Runtime surfaces a dimension can feed. */
export type DimensionSurface = "slider" | "color";

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
  /**
   * Runtime surfaces this dimension feeds. When OMITTED, defaults are derived from `type`
   * (slider-capable types → "slider"; categorical|binary → "color") so the 9 P1–P4 dims are
   * unchanged. Set explicitly to add a data-backed dimension WITHOUT auto-promoting it to a
   * slider/target (e.g. color-only). A "slider" surface always implies a layout target.
   */
  surfaces?: ReadonlyArray<DimensionSurface>;
  /** Color ramp style when surfaced as color: "categorical" (hashed hue) | "ordered" (sequential). */
  colorScale?: "categorical" | "ordered";
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
  {
    id: "module",
    label: "Module signature",
    family: "access",
    type: "multi-hot",
    source: "AccDcProjectUserProduct.productKey (graph_user_projects.module_ids; baselines excluded)",
    availability: "A2",
    defaultWeight: 0.15,
    confidence: "high",
    extract: (f) => f.moduleSignature ?? [],
    isAvailable: (f) => (f.moduleSignature ?? []).length > 0,
  },
  {
    id: "membershipBucket",
    label: "Membership tenure",
    family: "tenure",
    type: "categorical",
    source: "AccDcProjectUser.addedOn bucketed (NodeFeatureSnapshot.membershipBucket)",
    availability: "A1",
    defaultWeight: 0, // advanced dim: default OFF (organic preset never lists it → slider 0)
    confidence: "medium",
    surfaces: ["slider", "color"],
    extract: (f) => f.membershipBucket ?? "unknown",
    isAvailable: (f) => (f.membershipBucket ?? "unknown") !== "unknown",
  },
  {
    id: "activityRecency",
    label: "Activity recency",
    family: "behavior",
    type: "categorical",
    source: "AccActivity true last-activity bucketed (NodeFeatureSnapshot.activityRecencyBucket)",
    availability: "A1",
    defaultWeight: 0, // advanced dim: default OFF
    confidence: "medium",
    surfaces: ["slider", "color"],
    extract: (f) => f.activityRecencyBucket ?? "none",
    isAvailable: (f) => (f.activityRecencyBucket ?? "none") !== "none",
  },
  {
    id: "riskScore",
    label: "Risk score",
    family: "risk",
    type: "scalar",
    source: "Count of true risk primitives 0..5 (NodeFeatureSnapshot.riskScore; riskFlags.ts)",
    availability: "A1",
    defaultWeight: 0, // advanced dim: default OFF
    confidence: "low", // derived + coverage-dependent → down-weighted
    surfaces: ["slider", "color"],
    colorScale: "ordered", // consumed by nodeColors in Task 5; dormant until then
    extract: (f) => f.riskScore ?? 0, // returns a NUMBER (categoryValue coerces to "0".."5")
    isAvailable: (f) => (f.riskScore ?? 0) > 0, // zero-risk → no pull (calm layout)
  },
];

export function getDimension(id: DimensionId): DimensionDescriptor | undefined {
  return DIMENSION_REGISTRY.find((d) => d.id === id);
}

export const DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.map((d) => d.id);

/**
 * The dimensions wired into the LIVE runtime today (slider state + layout targets
 * + force weighting), in display order. This is the subset of the registry the
 * current 6-slider UI exposes — NOT the full taxonomy. The advanced UI phase widens
 * this list; until then it is the single source of truth for "what the runtime uses".
 *
 * `internalExternal` replaces the legacy `isExternal` slider id (P3 reconciliation).
 * `company`, `isAdmin`, `module` are registered but intentionally NOT in this list:
 * they are available to color/filter/target code but have no visible slider yet.
 */
export const RUNTIME_DIMENSION_IDS: readonly DimensionId[] = [
  "project",
  "role",
  "tier",
  "internalExternal",
  "activity",
  "signin",
];

/** Dimension types that receive a runtime layout weight (slider). */
const SLIDER_CAPABLE_TYPES: ReadonlySet<DimensionType> = new Set([
  "categorical",
  "binary",
  "scalar",
  "temporal",
  "multi-hot",
]);

/**
 * Resolve the runtime surfaces for a descriptor. Explicit `surfaces` wins; otherwise the
 * legacy type-derived fallback (slider-capable types → "slider"; categorical|binary → "color")
 * reproduces the pre-P6 behavior exactly so the 9 existing dims are unchanged.
 */
export function dimensionSurfaces(d: DimensionDescriptor): ReadonlyArray<DimensionSurface> {
  if (d.surfaces) return d.surfaces; // explicit wins
  const out: DimensionSurface[] = [];
  if (SLIDER_CAPABLE_TYPES.has(d.type)) out.push("slider"); // legacy fallback
  if (d.type === "categorical" || d.type === "binary") out.push("color");
  return out;
}

export const dimensionHasSurface = (d: DimensionDescriptor, s: DimensionSurface): boolean =>
  dimensionSurfaces(d).includes(s);

/**
 * Dimensions that participate in LAYOUT TARGETS + weighting at runtime. Keyed off the
 * "slider" surface capability (not raw type), so later phases can add color-only dims
 * without auto-promoting them to targets. For the 9 P1–P4 dims this is identical to the
 * old slider-capable-type filter — the full slider-capable set in registry order.
 */
export const RUNTIME_TARGET_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter(
  (d) => dimensionHasSurface(d, "slider"),
).map((d) => d.id);

/** Multi-hot dimensions need a centroid-of-active-keys anchor (not a single category anchor). */
export const MULTI_HOT_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter(
  (d) => d.type === "multi-hot",
).map((d) => d.id);

/** Runtime descriptors, resolved + ordered by RUNTIME_DIMENSION_IDS. */
export function getRuntimeDimensions(): DimensionDescriptor[] {
  return RUNTIME_DIMENSION_IDS.map((id) => {
    const d = getDimension(id);
    if (!d) throw new Error(`RUNTIME_DIMENSION_IDS references unregistered dimension: ${id}`);
    return d;
  });
}

/**
 * Default slider positions (0..100) for the runtime dims, derived from each
 * descriptor's defaultWeight (×100). This REPLACES the previously-hardcoded
 * DEFAULT_VALUES so the organic profile lives in one place (the registry).
 */
export function runtimeDefaultSliders(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of getRuntimeDimensions()) out[d.id] = Math.round(d.defaultWeight * 100);
  return out;
}
