/**
 * dominantClusters.ts — Dominant-attribute clustering for the 2D "with-labels" view.
 *
 * The user model: ONE labelable blob per distinct value of whichever attribute has
 * the highest slider. This module is the single source of truth for:
 *   - which attribute is dominant (dominantCatalogDim),
 *   - each node's cluster + each cluster's human-readable label (buildDominantClusters),
 *   - a distinct, EVENLY-SPREAD 2D anchor per cluster (clusterPositions2D).
 *
 * The 2D renderer PINS clusters at these anchors (cosmos setClusterPositions), so
 * separation is guaranteed for any cluster count — fixing the "everything together"
 * pile that a centermass layout produces when every cluster shares the same random
 * seed centroid. The anchors fill a DISC uniformly (Vogel sunflower), NOT a sphere
 * projection, so the layout reads as scattered labeled blobs, never a radial ring.
 *
 * Pure: no React/DOM/IO. Deterministic (no random, no clock).
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import {
  computeActionThresholds,
  bucketForCount,
  type ActionThresholds,
} from "./actionBuckets";
import {
  bandRiskScore,
  bandPermissionStrength,
  bandActivityVolume,
  bandFolderBreadth,
  bandAccessibleData,
} from "./dimensionBands";

/**
 * Continuous aperture dims (Phase 25) band into fixed labeled tiers instead of
 * the activity-count quantile fallthrough (which would collapse them into one
 * "None" bucket — they have no actionCounts entry).
 */
const APERTURE_BAND_BY_ID: Record<string, (v: number | null | undefined) => string> = {
  riskScore: bandRiskScore,
  folderBreadth: bandFolderBreadth,
  accessibleDataTB: bandAccessibleData,
  activityVolume: bandActivityVolume,
  folderAccessPermissions: bandPermissionStrength,
};

/** Readable bucket names for activity-family ordinal dims (none/low/med/high). */
const ACTIVITY_BUCKET_LABELS = ["None", "Low", "Med", "High"] as const;
/** Readable names for the tenure ordinal buckets. */
const MEMBERSHIP_LABELS: Record<string, string> = {
  unknown: "Unknown",
  "<30d": "< 30 days",
  "<90d": "< 90 days",
  "<1y": "< 1 year",
  ">1y": "> 1 year",
};

export interface DominantClustering {
  /** cluster index per node, 0..k-1 (aligned to the features array order). */
  ids: Int32Array;
  /** human-readable label per cluster index. */
  labels: string[];
  /** member count per cluster index (used to label only the largest blobs). */
  counts: number[];
}

/**
 * The dominant dimension = the slider-engaged dim with the highest value; ties
 * broken by smallest id (deterministic). Returns null when nothing is engaged so
 * the caller leaves the graph unclustered ("all sliders 0 → nothing happens").
 */
export function dominantCatalogDim(
  dims: readonly CatalogDimension[],
  sliderValues: Record<string, number>,
): CatalogDimension | null {
  let best: CatalogDimension | null = null;
  let bestV = 0;
  for (const d of dims) {
    const v = sliderValues[d.id] ?? 0;
    if (!(v > 0)) continue;
    if (v > bestV || (v === bestV && best !== null && d.id < best.id)) {
      bestV = v;
      best = d;
    }
  }
  return best;
}

/** The (key, label) a node carries for a dim. Key groups; label displays. Exported
 *  for reuse by buildCompositeClusters (multi-slider tuple grouping). */
export function valueKeyLabel(
  f: NodeFeatureSnapshot,
  dim: CatalogDimension,
  thresholds: Map<string, ActionThresholds>,
): { key: string; label: string } {
  switch (dim.kind) {
    case "categorical":
    case "binary": {
      const v = dim.extract(f);
      const s =
        v == null
          ? "(none)"
          : Array.isArray(v)
            ? v.length
              ? [...v].sort().join(" + ")
              : "(none)"
            : String(v);
      return { key: s, label: s };
    }
    case "multiHot": {
      const v = dim.extract(f);
      const keys = Array.isArray(v) ? [...v].sort() : [];
      if (keys.length === 0) return { key: "(none)", label: "(none)" };
      const key = keys.join("|");
      const label = keys.length <= 2 ? keys.join(" + ") : `${keys.length} items`;
      return { key, label };
    }
    case "ordinal": {
      // permission / tenure carry their bucket on dedicated snapshot fields;
      // aperture continuous dims band into fixed labeled tiers (Phase 25);
      // every other ordinal is an activity-count dim → per-action quantile bucket.
      const band = APERTURE_BAND_BY_ID[dim.id];
      if (band) {
        const v = dim.extract(f);
        const label = band(typeof v === "number" ? v : null);
        return { key: label, label };
      }
      if (dim.id === "permission") {
        const idx = Math.max(0, Math.min(5, Math.round(f.permissionStrength ?? 0)));
        return { key: `p${idx}`, label: `Permission ${idx}` };
      }
      if (dim.id === "tenure") {
        const b = f.membershipBucket ?? "unknown";
        return { key: b, label: MEMBERSHIP_LABELS[b] ?? b };
      }
      const th = thresholds.get(dim.id) ?? ([Infinity, Infinity] as ActionThresholds);
      const b = bucketForCount(f.actionCounts?.[dim.id] ?? 0, th);
      return { key: `b${b}`, label: `${dim.label}: ${ACTIVITY_BUCKET_LABELS[b]}` };
    }
  }
}

/**
 * Assign each node to a cluster by its dominant-dim value, collecting a label and
 * member count per cluster. Cluster indices are contiguous 0..k-1 in first-seen
 * order (deterministic for a fixed feature order).
 */
export function buildDominantClusters(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
): DominantClustering {
  const thresholds =
    dim.family === "activity"
      ? computeActionThresholds(features, [dim.id])
      : new Map<string, ActionThresholds>();
  const keyToIdx = new Map<string, number>();
  const labels: string[] = [];
  const counts: number[] = [];
  const ids = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const { key, label } = valueKeyLabel(features[i], dim, thresholds);
    let idx = keyToIdx.get(key);
    if (idx === undefined) {
      idx = labels.length;
      keyToIdx.set(key, idx);
      labels.push(label);
      counts.push(0);
    }
    ids[i] = idx;
    counts[idx] += 1;
  }
  return { ids, labels, counts };
}

/**
 * All slider-engaged dims (value > 0), strongest first then stable by id — the set
 * of attributes that jointly key the composite blobs. Empty when nothing is engaged.
 */
export function activeCatalogDims(
  dims: readonly CatalogDimension[],
  sliderValues: Record<string, number>,
): CatalogDimension[] {
  return dims
    .filter((d) => (sliderValues[d.id] ?? 0) > 0)
    .sort((a, b) => {
      const va = sliderValues[a.id] ?? 0;
      const vb = sliderValues[b.id] ?? 0;
      return vb - va || (a.id < b.id ? -1 : 1);
    });
}

/**
 * Group nodes by the TUPLE of the given dims' values (composite blobs). A single dim
 * reproduces buildDominantClusters. Tuples with fewer than minCount members fold into
 * one trailing "Other" cluster so 2+ broad attributes can't shatter the view into
 * specks; minCount <= 1 disables the merge. Pure & deterministic (first-seen order).
 */
export function buildCompositeClusters(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
  minCount = 1,
): DominantClustering {
  if (dims.length === 0) {
    return { ids: new Int32Array(features.length), labels: [], counts: [] };
  }
  const activityIds = dims.filter((d) => d.family === "activity").map((d) => d.id);
  const thresholds = activityIds.length
    ? computeActionThresholds(features, activityIds)
    : new Map<string, ActionThresholds>();

  const keyToIdx = new Map<string, number>();
  const labels: string[] = [];
  const counts: number[] = [];
  const rawIds = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const parts = dims.map((d) => valueKeyLabel(features[i], d, thresholds));
    const key = parts.map((p) => p.key).join("¦"); // ¦ tuple separator
    const label = parts.map((p) => p.label).join(" · "); // · join
    let idx = keyToIdx.get(key);
    if (idx === undefined) {
      idx = labels.length;
      keyToIdx.set(key, idx);
      labels.push(label);
      counts.push(0);
    }
    rawIds[i] = idx;
    counts[idx] += 1;
  }
  if (minCount <= 1) return { ids: rawIds, labels, counts };

  // Fold clusters below minCount into one trailing "Other".
  const keep = counts.map((c) => c >= minCount);
  if (keep.every(Boolean)) return { ids: rawIds, labels, counts };
  const remap = new Int32Array(labels.length);
  const newLabels: string[] = [];
  const newCounts: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (keep[i]) {
      remap[i] = newLabels.length;
      newLabels.push(labels[i]);
      newCounts.push(counts[i]);
    } else {
      remap[i] = -1; // → Other
    }
  }
  const otherIdx = newLabels.length;
  newLabels.push("Other");
  newCounts.push(0);
  const ids = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) {
    const m = remap[rawIds[i]];
    ids[i] = m >= 0 ? m : otherIdx;
  }
  for (let i = 0; i < counts.length; i++) if (!keep[i]) newCounts[otherIdx] += counts[i];
  return { ids, labels: newLabels, counts: newCounts };
}

export interface SignatureResult {
  /** per-node signature key (joined value-keys across the active dims). */
  signatures: string[];
  /** signature key → human label (e.g. "Architect · P0"). */
  labelMap: Record<string, string>;
  /** per-node signature index 0..k-1 (first-seen order) for colour buffers. */
  ids: Int32Array;
  /** distinct signature count. */
  signatureCount: number;
}

/**
 * Per-node signature across the active dims — feeds the emergent similarity-blob
 * layout (emergentBlobs.ts) so labels reflect WHERE similar nodes settle, without
 * pre-packing them into tuple clusters or a fixed circle. Reuses valueKeyLabel so
 * labels match the rest of the UI. Pure & deterministic (first-seen index order).
 */
export function signatureLabels(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
): SignatureResult {
  const signatures: string[] = new Array(features.length).fill("");
  const labelMap: Record<string, string> = {};
  const ids = new Int32Array(features.length);
  if (dims.length === 0) return { signatures, labelMap, ids, signatureCount: 0 };

  const activityIds = dims.filter((d) => d.family === "activity").map((d) => d.id);
  const thresholds = activityIds.length
    ? computeActionThresholds(features, activityIds)
    : new Map<string, ActionThresholds>();

  const keyToIdx = new Map<string, number>();
  for (let i = 0; i < features.length; i++) {
    const parts = dims.map((d) => valueKeyLabel(features[i], d, thresholds));
    const key = parts.map((p) => p.key).join("¦");
    signatures[i] = key;
    if (!(key in labelMap)) labelMap[key] = parts.map((p) => p.label).join(" · ");
    let idx = keyToIdx.get(key);
    if (idx === undefined) {
      idx = keyToIdx.size;
      keyToIdx.set(key, idx);
    }
    ids[i] = idx;
  }
  return { signatures, labelMap, ids, signatureCount: keyToIdx.size };
}

/**
 * Similarity clustering for the GPU graph. Instead of one blob per value TUPLE
 * (which explodes combinatorially and is unreadable), nodes that are ALIKE across
 * the active attributes are merged into a few similarity groups.
 *
 * KEY INVARIANT (jump-free live drag): grouping uses the active SET only — every
 * active dim is one-hot with EQUAL weight, NOT the slider value. So dragging a
 * slider's value never re-groups (no membership flips → no teleport); the value
 * drives tightness elsewhere (GPU applySliders). Re-grouping happens only when the
 * SET of engaged sliders changes.
 *
 * - 0 dims → empty. 1 dim → buildDominantClusters (group by that attribute).
 * - distinct signatures ≤ maxGroups → use signatures directly.
 * - else → deterministic k-means (largest-count seeding, no RNG/clock) on one-hot
 *   value vectors, capped at maxGroups, each group labelled by its largest signature.
 */
export function buildSimilarityClusters(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
  maxGroups = 8,
): DominantClustering {
  if (dims.length === 0) return { ids: new Int32Array(features.length), labels: [], counts: [] };
  if (dims.length === 1) return buildDominantClusters(features, dims[0]);

  const { signatures, labelMap, ids: sigIds, signatureCount } = signatureLabels(features, dims);
  const sigCount = new Array<number>(signatureCount).fill(0);
  const sigKey = new Array<string>(signatureCount);
  for (let i = 0; i < features.length; i++) {
    sigCount[sigIds[i]] += 1;
    sigKey[sigIds[i]] = signatures[i];
  }
  if (signatureCount <= maxGroups) {
    return { ids: sigIds, labels: sigKey.map((k) => labelMap[k] ?? k), counts: sigCount };
  }

  // One-hot value columns (equal weight per active dim) for each signature.
  const colOf = new Map<string, number>();
  const sigVals = sigKey.map((k) => k.split("¦"));
  for (const vals of sigVals) {
    for (let d = 0; d < vals.length; d++) {
      const ck = `${d}|${vals[d]}`;
      if (!colOf.has(ck)) colOf.set(ck, colOf.size);
    }
  }
  const width = colOf.size;
  const vecs: Float32Array[] = sigVals.map((vals) => {
    const v = new Float32Array(width);
    for (let d = 0; d < vals.length; d++) v[colOf.get(`${d}|${vals[d]}`)!] = 1;
    return v;
  });

  // Deterministic seeding: the maxGroups largest-count signatures (tie → key asc).
  const order = [...Array(signatureCount).keys()].sort(
    (a, b) => sigCount[b] - sigCount[a] || (sigKey[a] < sigKey[b] ? -1 : 1),
  );
  const k = Math.min(maxGroups, signatureCount);
  let centroids: Float32Array[] = order.slice(0, k).map((idx) => Float32Array.from(vecs[idx]));

  const assign = new Int32Array(signatureCount);
  for (let iter = 0; iter < 12; iter++) {
    let moved = false;
    for (let s = 0; s < signatureCount; s++) {
      let best = 0;
      let bestD = Infinity;
      const ve = vecs[s];
      for (let c = 0; c < k; c++) {
        const cen = centroids[c];
        let dd = 0;
        for (let j = 0; j < width; j++) {
          const diff = ve[j] - cen[j];
          dd += diff * diff;
        }
        if (dd < bestD - 1e-9) { bestD = dd; best = c; }
      }
      if (assign[s] !== best) { assign[s] = best; moved = true; }
    }
    const sums = Array.from({ length: k }, () => new Float32Array(width));
    const wsum = new Float32Array(k);
    for (let s = 0; s < signatureCount; s++) {
      const c = assign[s];
      const w = sigCount[s];
      wsum[c] += w;
      const ve = vecs[s];
      const su = sums[c];
      for (let j = 0; j < width; j++) su[j] += ve[j] * w;
    }
    for (let c = 0; c < k; c++) {
      if (wsum[c] > 0) for (let j = 0; j < width; j++) sums[c][j] /= wsum[c];
    }
    centroids = sums;
    if (!moved && iter > 0) break;
  }

  // Drop empty centroids → contiguous group indices; label by largest signature.
  const groupCount = new Array<number>(k).fill(0);
  const groupTopSig = new Array<number>(k).fill(-1);
  for (let s = 0; s < signatureCount; s++) {
    const c = assign[s];
    groupCount[c] += sigCount[s];
    if (groupTopSig[c] < 0 || sigCount[s] > sigCount[groupTopSig[c]]) groupTopSig[c] = s;
  }
  const remap = new Int32Array(k).fill(-1);
  const labels: string[] = [];
  const counts: number[] = [];
  for (let c = 0; c < k; c++) {
    if (groupCount[c] === 0) continue;
    remap[c] = labels.length;
    labels.push(labelMap[sigKey[groupTopSig[c]]] ?? sigKey[groupTopSig[c]]);
    counts.push(groupCount[c]);
  }
  const ids = new Int32Array(features.length);
  for (let i = 0; i < features.length; i++) ids[i] = remap[assign[sigIds[i]]];
  return { ids, labels, counts };
}

/** Golden angle — the spacing that makes a 2D sunflower (Vogel) set even. */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/**
 * Fixed disc radius (cosmos space units, centred on the origin). Kept within the
 * engine's spaceSize (4096) so anchors never fall out of bounds. The disc is FIXED,
 * not scaled by count: with the node total fixed, more clusters ⇒ fewer nodes each
 * ⇒ smaller blobs, so a constant disc self-balances (5 huge role blobs OR ~1,000
 * tiny project blobs both fit and stay separated).
 */
const DISC_RADIUS = 1700;

/**
 * Distinct 2D anchor per cluster on a Vogel sunflower (uniform areal density disc).
 * Returns Float32Array(count*2) as [x0,y0,x1,y1,...] in cosmos space coords. A single
 * cluster sits at the origin. These anchors are PINNED, so cluster separation is
 * structural, not emergent — fixing the centermass "everything together" pile.
 */
export function clusterPositions2D(count: number): Float32Array {
  const out = new Float32Array(Math.max(0, count) * 2);
  if (count <= 0) return out;
  if (count === 1) return out; // single blob at origin
  for (let i = 0; i < count; i++) {
    const r = DISC_RADIUS * Math.sqrt((i + 0.5) / count);
    const t = i * GOLDEN_ANGLE;
    out[i * 2] = Math.cos(t) * r;
    out[i * 2 + 1] = Math.sin(t) * r;
  }
  return out;
}
