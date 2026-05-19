/**
 * mathLayer.ts — Pure deterministic semantic-seed math layer.
 *
 * PURITY CONTRACT (MATH-05): This file has ZERO import lines.
 * All types are declared inline. No UI framework, no DOM, no engine, no I/O.
 *
 * Formula (MATH-03):
 *   finalTarget(node) = Σ_d (u_d × f_d(node) × s_d) / Σ_d (s_d)
 *
 * Where:
 *   u_d = (cos θ_d, sin θ_d, 0)
 *   θ_d = (d / D) × 2π                   (MATH-02 evenly distributed axes)
 *   f_d(node) ∈ [0, 1]                   (pre-normalized in dataLayer)
 *   s_d ∈ [0, 1]                          (slider value for dimension d)
 *
 * Zero state (all s_d = 0) → (0, 0, 0)   (MATH-04 organic fallback)
 * Deterministic: same input → same output, no I/O, no clock, no random (MATH-01)
 */

// ---------------------------------------------------------------------------
// Public types (SOURCE of truth — NOT imported from anywhere else)
// ---------------------------------------------------------------------------

export interface NodeFeatureVector {
  /** Stable id used to key the position cache, e.g. "email|projectId" */
  id: string;
  /** Normalized [0,1] activity count (log1p + min-max applied in dataLayer) */
  activity: number;
  /** Normalized [0,1] recency (1 - min(ageDays/90, 1)) */
  recency: number;
  /** 1.0 if isAdmin, else 0.0 */
  isAdmin: number;
  /** 1.0 if isExternal, else 0.0 */
  isExternal: number;
  /** Per-role weights summing to ~1.0; key = roleId, value = weight */
  roleWeights: ReadonlyMap<string, number>;
  /** Per-module weights = activity_in_module / total_activity */
  moduleWeights: ReadonlyMap<string, number>;
  /** Per-permission-tier weights (typically a single key = 1.0) */
  permTierWeights: ReadonlyMap<string, number>;
}

export interface DimensionDescriptor {
  /**
   * Stable id, e.g. "activity", "recency", "isAdmin", "isExternal".
   * For categorical kinds the id matches the slider key.
   */
  id: string;
  /** Kind discriminator drives how slider × feature multiply */
  kind: "scalar" | "boolean" | "role" | "module" | "permTier";
  /**
   * Category key for kind "role" | "module" | "permTier".
   * Must be defined when kind is not "scalar" or "boolean".
   */
  category?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const R_DEFAULT = 300; // World units — matches force-graph engine defaults (CONTEXT decision)

// ---------------------------------------------------------------------------
// Public function
// ---------------------------------------------------------------------------

/**
 * Computes deterministic seed positions for a set of nodes.
 *
 * Formula (MATH-03): finalTarget(node) = Σ_d (u_d × f_d(node) × s_d) / Σ_d (s_d)
 *
 * References: MATH-01 (determinism), MATH-02 (axis distribution),
 *             MATH-03 (slider composition), MATH-04 (zero state),
 *             MATH-05 (purity — zero imports)
 *
 * @param features - Array of pre-normalized node feature vectors
 * @param dims     - Ordered dimension descriptors (order defines axis angles)
 * @param sliders  - Map of dimension id → slider value in [0, 1]
 * @param options  - Optional overrides (radius in world units, default 300)
 * @returns Float32Array of length features.length × 3 (xyz triples, row-major)
 */
export function computeTargetPositions(
  features: readonly NodeFeatureVector[],
  dims: readonly DimensionDescriptor[],
  sliders: Readonly<Record<string, number>>,
  options: { radius?: number } = {},
): Float32Array {
  const R = options.radius ?? R_DEFAULT;
  const D = dims.length;
  const out = new Float32Array(features.length * 3);
  // Float32Array is zero-initialized by default — zero state (MATH-04) is automatic.

  if (D === 0 || features.length === 0) return out;

  // Precompute unit vectors (cos θ_d, sin θ_d) per dim (MATH-02).
  // θ_d = (d / D) × 2π — evenly distributes D axes around the unit circle.
  const ux = new Float64Array(D);
  const uy = new Float64Array(D);
  for (let d = 0; d < D; d++) {
    const theta = (d / D) * 2 * Math.PI;
    ux[d] = Math.cos(theta);
    uy[d] = Math.sin(theta);
  }

  for (let i = 0; i < features.length; i++) {
    const node = features[i];
    let sx = 0;
    let sy = 0;
    let sSum = 0;

    for (let d = 0; d < D; d++) {
      const dim = dims[d];
      const s = sliders[dim.id] ?? 0;
      if (s === 0) continue; // Zero slider: skip (optimization — math is identical, sSum stays 0)

      sSum += s;
      const f = featureValueFor(node, dim);
      if (f === 0) continue; // Zero feature: contributes 0 to numerator; sSum already updated

      const contrib = R * f * s;
      sx += ux[d] * contrib;
      sy += uy[d] * contrib;
    }

    // Pitfall 8 guard: sSum === 0 means all sliders were 0 — leave (0,0,0).
    if (sSum > 0) {
      out[i * 3 + 0] = sx / sSum;
      out[i * 3 + 1] = sy / sSum;
      out[i * 3 + 2] = 0; // z seeded at 0; physics nudges z in 3D mode (CONTEXT decision)
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

function featureValueFor(node: NodeFeatureVector, dim: DimensionDescriptor): number {
  switch (dim.kind) {
    case "scalar":
      return dim.id === "activity" ? node.activity : node.recency;
    case "boolean":
      return dim.id === "isAdmin" ? node.isAdmin : node.isExternal;
    case "role":
      return node.roleWeights.get(dim.category!) ?? 0;
    case "module":
      return node.moduleWeights.get(dim.category!) ?? 0;
    case "permTier":
      return node.permTierWeights.get(dim.category!) ?? 0;
  }
}
