// gpuLayout2D.ts — Pure slider→GPU-layout mapping for the 2D graph simulation.
//
// PURITY: zero imports. Defines its own input types so the module is fully
// standalone (no coupling to any engine). Deterministic — no random, no clock.

/** Per-dimension target arrays (structurally compatible with the engine's TargetArrays shape). */
export type Target2DArrays = Record<
  string,
  { x: Float32Array; y: Float32Array; z?: Float32Array }
>;

/**
 * Per-node 2D anchor = Σ_d (sliderᵈ · weightᵈᵢ · targetᵈᵢ) / Σ_d (sliderᵈ · weightᵢᵈ).
 * Mirrors previewLayer's blend (and mathLayer's formula) but emits stride-2.
 * Zero state (no active slider, or a node with zero weight everywhere) → origin (0,0).
 */
export function computeAnchors(
  sliders: Record<string, number>,
  targets: Target2DArrays,
  dimWeights: Record<string, Float32Array>,
  nodeCount: number,
): Float32Array {
  const dimIds = Object.keys(targets);
  for (const id of dimIds) {
    const t = targets[id];
    if (t.x.length !== nodeCount || t.y.length !== nodeCount) {
      throw new Error(
        `computeAnchors: target '${id}' x/y lengths (${t.x.length}/${t.y.length}) != nodeCount ${nodeCount}`,
      );
    }
  }
  const out = new Float32Array(nodeCount * 2); // zero-initialized → origin fallback
  const ax = new Float32Array(nodeCount);
  const ay = new Float32Array(nodeCount);
  const wSum = new Float32Array(nodeCount);

  for (const id of dimIds) {
    const sv = sliders[id] ?? 0;
    if (sv <= 0) continue;
    const t = targets[id];
    const w = dimWeights[id];
    for (let i = 0; i < nodeCount; i++) {
      const wi = sv * (w ? w[i] : 1);
      if (wi === 0) continue;
      ax[i] += wi * t.x[i];
      ay[i] += wi * t.y[i];
      wSum[i] += wi;
    }
  }
  for (let i = 0; i < nodeCount; i++) {
    const s = wSum[i];
    if (s === 0) continue; // leave origin
    out[i * 2] = ax[i] / s;
    out[i * 2 + 1] = ay[i] / s;
  }
  return out;
}

export interface GpuForceConfig {
  simulationRepulsion: number;
  simulationCluster: number;
  simulationGravity: number;
  simulationDecay: number;
  simulationFriction: number;
}

/** Linear interpolation clamped to [0,1] on t. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * Slider intensity (max over all sliders, 0..1) → GPU force coefficients.
 * Tunable constants below; the unit tests assert monotonicity / zero-state,
 * not exact values, so tuning is safe.
 */
export function mapForceConfig(sliders: Record<string, number>): GpuForceConfig {
  const max = Math.max(0, ...Object.values(sliders));
  return {
    // tight blob at rest → spread for cluster legibility when engaged
    simulationRepulsion: lerp(0.3, 1.5, max),
    // no targets at rest → strong per-node anchor pull when engaged
    simulationCluster: lerp(0, 0.4, max),
    // gentle constant cohesion toward center
    simulationGravity: 0.1,
    // cool fast when idle; slower (more visible motion) while separating
    simulationDecay: lerp(1000, 5000, max),
    // standard default friction
    simulationFriction: 0.85,
  };
}

/**
 * Per-node cluster-pull strength = max active-dim weight for that node, in [0,1].
 * A node availability-gated to weight 0 on all active dims gets strength 0, so the
 * GPU cluster force never drags it toward a pole it has no value for. Zero active
 * sliders → all-zero (no pull). Uses max (not product) so a node engaged on any
 * active dim is pulled at that dim's confidence.
 */
export function clusterStrengthFromWeights(
  dimWeights: Record<string, Float32Array>,
  sliders: Record<string, number>,
  nodeCount: number,
): Float32Array {
  const out = new Float32Array(nodeCount);
  for (const [id, sv] of Object.entries(sliders)) {
    if (sv <= 0) continue;
    const w = dimWeights[id];
    for (let i = 0; i < nodeCount; i++) {
      const v = Math.min(1, w ? w[i] : 1);
      if (v > out[i]) out[i] = v;
    }
  }
  return out;
}

/** Cluster assignment that puts every point in its own cluster: [0,1,…,n-1]. */
export function identityClusters(nodeCount: number): number[] {
  const out = new Array<number>(nodeCount);
  for (let i = 0; i < nodeCount; i++) out[i] = i;
  return out;
}
