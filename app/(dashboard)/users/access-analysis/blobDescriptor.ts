/**
 * blobDescriptor.ts — Pure builder for the default "blob" layout descriptor. The graph
 * groups every node into one organic blob per the given dimension's value (here: user
 * name), with a loose endpoint (organic, fills footprints) and a packed endpoint (tight
 * cores). descriptorTarget lerps loose→packed off the live slider. No React/DOM/IO.
 */
import { buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprints } from "./clusterForceLayout";
import { packMemberPositions, LOOSE_TIGHTNESS } from "./clusterPacking";
import type { LayoutDescriptor } from "./layoutDescriptor";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

export function buildUserBlobDescriptor(
  features: ReadonlyArray<NodeFeatureSnapshot>,
  dim: CatalogDimension,
): Extract<LayoutDescriptor, { kind: "blob" }> {
  const clustering = buildDominantClusters(features, dim);
  const footprints = layoutClusterFootprints(clustering.counts);
  const loose = packMemberPositions(clustering.ids, footprints, LOOSE_TIGHTNESS, features.length);
  const packed = packMemberPositions(clustering.ids, footprints, 1, features.length);
  return { kind: "blob", dimId: dim.id, clustering, footprints, loose, packed };
}
