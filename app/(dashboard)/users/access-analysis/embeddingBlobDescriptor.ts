/**
 * embeddingBlobDescriptor.ts — Builds the projector-map "blob" descriptor whose
 * morph runs FROM the embedding scatter (s=0) TO a grouped clump (s=1). The clump is
 * scale-normalized to the embedding's bounding box so the cloud never rescales during
 * the morph (the coordinate-scale risk). descriptorTarget's "blob" branch lerps
 * loose→packed off the live slider, unchanged. Pure: no React/DOM/IO.
 */
import { buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprints } from "./clusterForceLayout";
import { packMemberPositions, type ClusterFootprints } from "./clusterPacking";
import { computeBBoxStride2 } from "./embeddingFit";
import type { LayoutDescriptor } from "./layoutDescriptor";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function buildEmbeddingBlobDescriptor(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
  embeddingXy: Float32Array,
): Extract<LayoutDescriptor, { kind: "blob" }> {
  const n = features.length;
  const clustering = buildDominantClusters(features, dim);
  const footprintsRaw = layoutClusterFootprints(clustering.counts);
  const packedRaw = packMemberPositions(clustering.ids, footprintsRaw, 1, n);

  // Affine-fit the packed cloud onto the embedding's bounding square (uniform scale,
  // matched centers). Apply the SAME transform to the footprint centers so labels
  // sit on the morphed clumps.
  const emb = computeBBoxStride2(embeddingXy);
  const pack = computeBBoxStride2(packedRaw);
  const scale = pack.halfExtent > 0 ? emb.halfExtent / pack.halfExtent : 1;

  const packed = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    packed[i * 2] = emb.cx + (packedRaw[i * 2] - pack.cx) * scale;
    packed[i * 2 + 1] = emb.cy + (packedRaw[i * 2 + 1] - pack.cy) * scale;
  }

  const k = footprintsRaw.r.length;
  const cx = new Float32Array(k);
  const cy = new Float32Array(k);
  const r = new Float32Array(k);
  for (let c = 0; c < k; c++) {
    cx[c] = emb.cx + (footprintsRaw.cx[c] - pack.cx) * scale;
    cy[c] = emb.cy + (footprintsRaw.cy[c] - pack.cy) * scale;
    r[c] = footprintsRaw.r[c] * scale;
  }
  const footprints: ClusterFootprints = { cx, cy, r };

  return { kind: "blob", dimId: dim.id, clustering, footprints, loose: embeddingXy, packed };
}
