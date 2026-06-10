/**
 * catalogTargets.ts — Catalog-driven layout targets (Phase D).
 *
 * Builds per-dimension anchor positions from the Phase C CatalogDimension
 * descriptors, dispatching by descriptor.kind:
 *   - categorical / binary → volumetric spherical-Fibonacci clumps (one anchor per
 *     distinct value), reusing volumetricAnchor from featureTargets.
 *   - multiHot            → centroid of per-key anchors (empty signature → origin).
 *   - ordinal             → an ORDERED RAMP: buckets placed along a per-dimension
 *     axis (none → … → high) so the cloud forms a readable gradient, not blobs.
 *
 * Pure: no React/DOM/IO. Deterministic.
 *
 * UNWIRED in Phase D (engine only). Phase E swaps the shell's buildFeatureTargets
 * call for buildCatalogTargets once the sidebar emits catalog ids.
 */
import type { TargetArrays } from "./physicsLayer";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { volumetricAnchor, ANCHOR_RADIUS } from "./featureTargets";
import {
  ACTION_BUCKET_COUNT,
  bucketForCount,
  computeActionThresholds,
  type ActionThresholds,
} from "./actionBuckets";

/** Ordered membership ladder for the tenure ordinal ramp (unknown = none pole). */
const MEMBERSHIP_ORDER: Record<string, number> = {
  unknown: 0,
  "<30d": 1,
  "<90d": 2,
  "<1y": 3,
  ">1y": 4,
};
const MEMBERSHIP_BUCKET_COUNT = 5;
const PERMISSION_BUCKET_COUNT = 6; // strength 0..5

/** A node's ordinal bucket placement: index in [0, bucketCount-1]. */
interface OrdinalBucket {
  index: number;
  bucketCount: number;
}

/** Stable per-dimension unit axis for the ordinal ramp (distinct dims → distinct axes). */
function rampDirection(dimId: string): [number, number, number] {
  let h = 0x811c9dc5;
  for (let i = 0; i < dimId.length; i++) {
    h ^= dimId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const u = (h >>> 0) / 0xffffffff; // [0,1)
  const yUnit = 1 - 2 * u; // [-1,1]
  const rxy = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
  const theta = (2 * Math.PI * ((Math.imul(h, 2654435761) >>> 0) / 0xffffffff));
  return [Math.cos(theta) * rxy, yUnit, Math.sin(theta) * rxy];
}

/** Coerce a descriptor value to a stable categorical bucket string. */
function catValue(f: NodeFeatureSnapshot, dim: CatalogDimension): string {
  const v = dim.extract(f);
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? [...v].sort().join("|") : "(none)";
  return "(none)";
}

/** Categorical/binary anchors — same as the legacy path but driven by dim.extract. */
function computeCatalogCategoricalTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;
  const set = new Set<string>();
  for (const f of features) set.add(catValue(f, dim));
  const cats = Array.from(set).sort();
  const indexOf = new Map<string, number>();
  cats.forEach((c, i) => indexOf.set(c, i));
  const anchors = cats.map((_, i) => volumetricAnchor(i, cats.length, radius));
  for (let n = 0; n < features.length; n++) {
    const a = anchors[indexOf.get(catValue(features[n], dim)) ?? 0];
    out[n * 3] = a[0];
    out[n * 3 + 1] = a[1];
    out[n * 3 + 2] = a[2];
  }
  return out;
}

/** MultiHot anchors — centroid of per-key anchors; empty signature → origin. */
function computeCatalogMultiHotTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;
  const keySet = new Set<string>();
  const sigs: string[][] = features.map((f) => {
    const v = dim.extract(f);
    const keys = Array.isArray(v) ? [...v].sort() : [];
    for (const k of keys) keySet.add(k);
    return keys;
  });
  const keys = Array.from(keySet).sort();
  const keyIndex = new Map<string, number>();
  keys.forEach((k, i) => keyIndex.set(k, i));
  const keyAnchors = keys.map((_, i) => volumetricAnchor(i, keys.length, radius));
  for (let n = 0; n < features.length; n++) {
    const sig = sigs[n];
    if (sig.length === 0) continue; // origin → no pull
    let x = 0, y = 0, z = 0;
    for (const k of sig) {
      const a = keyAnchors[keyIndex.get(k)!];
      x += a[0]; y += a[1]; z += a[2];
    }
    out[n * 3] = x / sig.length;
    out[n * 3 + 1] = y / sig.length;
    out[n * 3 + 2] = z / sig.length;
  }
  return out;
}

/**
 * Ordinal ramp: place each node's bucket along the dimension's axis from -radius
 * (none) to +radius (high). `none` is a real pole (spec §10), not the origin, so
 * every node is positioned and the cloud forms a gradient.
 */
export function computeOrdinalRampTarget(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  bucketOf: (f: NodeFeatureSnapshot) => OrdinalBucket,
  radius: number = ANCHOR_RADIUS,
): Float32Array {
  const out = new Float32Array(features.length * 3);
  if (features.length === 0) return out;
  const dir = rampDirection(dim.id);
  for (let n = 0; n < features.length; n++) {
    const { index, bucketCount } = bucketOf(features[n]);
    const denom = Math.max(1, bucketCount - 1);
    const t = (index / denom) * 2 - 1; // -1 (none) … +1 (high)
    const r = radius * t;
    out[n * 3] = dir[0] * r;
    out[n * 3 + 1] = dir[1] * r;
    out[n * 3 + 2] = dir[2] * r;
  }
  return out;
}

/** Per-ordinal-dim bucketer. permission/tenure are by id; activity dims use quantiles. */
function bucketerFor(
  dim: CatalogDimension,
  thresholds: Map<string, ActionThresholds>,
): (f: NodeFeatureSnapshot) => OrdinalBucket {
  if (dim.id === "permission") {
    return (f) => ({
      index: Math.max(0, Math.min(5, Math.round(f.permissionStrength ?? 0))),
      bucketCount: PERMISSION_BUCKET_COUNT,
    });
  }
  if (dim.id === "tenure") {
    return (f) => ({
      index: MEMBERSHIP_ORDER[f.membershipBucket ?? "unknown"] ?? 0,
      bucketCount: MEMBERSHIP_BUCKET_COUNT,
    });
  }
  // Only activity-family dims are in `thresholds`; any other ordinal dim that reaches
  // here gets th=[Inf,Inf] → binary-effective bucketing (none vs present). Catalog
  // discipline keeps permission/tenure handled above, so this path is action dims.
  // Activity-family action dims: per-action quantile bucket of the raw count.
  const th = thresholds.get(dim.id) ?? ([Infinity, Infinity] as ActionThresholds);
  return (f) => ({
    index: bucketForCount(f.actionCounts?.[dim.id] ?? 0, th),
    bucketCount: ACTION_BUCKET_COUNT,
  });
}

function splitXYZ(xyz: Float32Array, n: number): { x: Float32Array; y: Float32Array; z: Float32Array } {
  const x = new Float32Array(n);
  const y = new Float32Array(n);
  const z = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = xyz[i * 3];
    y[i] = xyz[i * 3 + 1];
    z[i] = xyz[i * 3 + 2];
  }
  return { x, y, z };
}

/**
 * Build per-dimension TargetArrays for the given catalog dimensions. Action
 * thresholds are precomputed once over the feature set (spec §8: one pass).
 */
export function buildCatalogTargets(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dims: ReadonlyArray<CatalogDimension>,
  radius: number = ANCHOR_RADIUS,
): TargetArrays {
  const n = features.length;
  const actionIds = dims.filter((d) => d.family === "activity").map((d) => d.id);
  const thresholds = computeActionThresholds(features, actionIds);
  const out: TargetArrays = {};
  for (const dim of dims) {
    let xyz: Float32Array;
    if (dim.kind === "ordinal") {
      xyz = computeOrdinalRampTarget(features, dim, bucketerFor(dim, thresholds), radius);
    } else if (dim.kind === "multiHot") {
      xyz = computeCatalogMultiHotTarget(features, dim, radius);
    } else {
      xyz = computeCatalogCategoricalTarget(features, dim, radius); // categorical | binary
    }
    out[dim.id] = splitXYZ(xyz, n);
  }
  return out;
}
