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
  /**
   * Link spring force coefficient. Optional. Set to 0 to make rendered links
   * render-ONLY (no layout force) — non-zero link springs pull edge-connected
   * nodes into filaments ("worm") and tie nodes across clusters toward the
   * centre, fighting cluster separation.
   */
  simulationLinkSpring?: number;
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

/**
 * Per-CLUSTER 2D anchor = mean of member nodes' slider-weighted target anchors.
 * Reuses computeAnchors for per-node anchors, then averages by cluster.
 * @param clusterIds  cluster index per node (contiguous 0..clusterCount-1; negative = unclustered, skipped)
 * @param clusterCount number of clusters
 * Returns Float32Array(clusterCount*2). A cluster with no members stays at origin (0,0).
 */
export function computeClusterAnchors(
  sliders: Record<string, number>,
  targets: Target2DArrays,
  dimWeights: Record<string, Float32Array>,
  clusterIds: Int32Array | ReadonlyArray<number>,
  clusterCount: number,
  nodeCount: number,
): Float32Array {
  const nodeAnchors = computeAnchors(sliders, targets, dimWeights, nodeCount); // n*2
  const sx = new Float64Array(clusterCount);
  const sy = new Float64Array(clusterCount);
  const cnt = new Int32Array(clusterCount);
  for (let i = 0; i < nodeCount; i++) {
    const c = clusterIds[i];
    if (c < 0 || c >= clusterCount) continue;
    sx[c] += nodeAnchors[i * 2];
    sy[c] += nodeAnchors[i * 2 + 1];
    cnt[c] += 1;
  }
  const out = new Float32Array(clusterCount * 2);
  for (let c = 0; c < clusterCount; c++) {
    if (cnt[c] === 0) continue;
    out[c * 2] = sx[c] / cnt[c];
    out[c * 2 + 1] = sy[c] / cnt[c];
  }
  return out;
}

/** Fixed GPU force config for cluster mode — strong cluster pull, moderate repulsion. */
export function mapClusterForceConfig(): GpuForceConfig {
  return {
    simulationRepulsion: 1.0,
    simulationCluster: 0.5,
    simulationGravity: 0.1,
    simulationDecay: 3000,
    simulationFriction: 0.85,
  };
}

// ---------------------------------------------------------------------------
// Dominant-attribute clustering (the grouped-blob layout)
//
// The user-chosen model: one labelable blob per distinct value of whichever
// attribute has the highest slider. The GPU graph groups nodes by `clusterId`
// and — when cluster positions are NOT pinned — places each cluster at its
// members' CENTERMASS, so repulsion + cluster-pull arrange the groups into
// well-separated organic blobs, NOT a pinned ring (the "radial" look).
//
// The slider then drives ONLY tightness: 0 = no cluster pull (pure repulsion →
// nodes spread "all over the place") → 100 = strong pull (tight blobs).
// ---------------------------------------------------------------------------

/** Number of distinct clusters in an id array (max id + 1; 0 when empty). */
export function clusterCountOf(ids: Int32Array | ReadonlyArray<number>): number {
  let m = -1;
  for (let i = 0; i < ids.length; i++) if (ids[i] > m) m = ids[i];
  return m + 1;
}

/**
 * Slider→force mapping for the dominant-attribute blob layout with PINNED cluster
 * anchors (cluster positions come from dominantClusters.clusterPositions2D and are
 * fixed via setClusterPositions, so separation is structural — see dominantClusters).
 *
 *   simulationCluster  0 → 0.8   the slider's ONLY job: tightness of pinned blobs
 *   simulationRepulsion 0.5 const gives each blob area without flinging nodes
 *   simulationGravity   0.05 const gentle containment for the slider-0 scatter
 *
 * At max=0 the cluster pull is 0 — with the caller leaving nodes unclustered, the
 * graph is a calm, contained scatter ("all sliders 0 → nothing happens"). At max=1
 * each node snaps tightly to its cluster's pinned, pre-separated anchor.
 *
 * Pinned anchors + calm repulsion (not a high-repulsion, moving-centermass target)
 * are what remove the "worm"/uncontrollable feel of the earlier layout.
 */
export function mapDominantForceConfig(sliderMax: number): GpuForceConfig {
  const max = Math.min(1, Math.max(0, sliderMax));
  return {
    simulationRepulsion: 0.5,
    simulationCluster: lerp(0, 0.8, max),
    simulationGravity: 0.05,
    simulationDecay: lerp(3000, 6000, max),
    simulationFriction: 0.85,
    // Render-only links: no spring force → no "worm" filaments, and same-user
    // edges never drag nodes across clusters back toward the centre.
    simulationLinkSpring: 0,
  };
}
