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

/** The (key, label) a node carries for the dominant dim. Key groups; label displays. */
function valueKeyLabel(
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
      // every other ordinal is an activity-count dim → per-action quantile bucket.
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
