import { describe, it, expect } from "vitest";
import { buildEmbeddingBlobDescriptor } from "./embeddingBlobDescriptor";
import { computeBBoxStride2 } from "./embeddingFit";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// Minimal categorical dim that groups on a synthetic `grp` field. buildDominantClusters
// only touches dim.kind / dim.family / dim.extract / dim.id for a non-activity dim.
const DIM = {
  id: "grp", label: "Group", family: "structure", kind: "categorical",
  source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
  extract: (f) => (f as unknown as { grp: string }).grp,
} as unknown as CatalogDimension;

// 40 nodes in 4 groups; embedding spread over a known, off-origin, non-square box.
function fixture(): { features: NodeFeatureSnapshot[]; xy: Float32Array } {
  const n = 40;
  const features: NodeFeatureSnapshot[] = [];
  const xy = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    features.push({ grp: `g${i % 4}` } as unknown as NodeFeatureSnapshot);
    xy[i * 2] = 100 + (i * 13 % 400);       // x in [100, ~500]
    xy[i * 2 + 1] = -50 + (i * 7 % 200);    // y in [-50, ~150]
  }
  return { features, xy };
}

describe("buildEmbeddingBlobDescriptor", () => {
  it("uses the embedding coords as the s=0 (loose) endpoint, by node index", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    expect(desc.kind).toBe("blob");
    expect(desc.dimId).toBe("grp");
    expect(desc.loose.length).toBe(features.length * 2);
    for (let i = 0; i < xy.length; i++) expect(desc.loose[i]).toBe(xy[i]);
  });

  it("normalizes the packed (s=1) clump to the embedding bounding square (no balloon)", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    const emb = computeBBoxStride2(xy);
    const packed = computeBBoxStride2(desc.packed);
    // half-extent within 5% and center within 5% of the embedding span.
    const tol = emb.halfExtent * 0.05;
    expect(Math.abs(packed.halfExtent - emb.halfExtent)).toBeLessThanOrEqual(tol);
    expect(Math.abs(packed.cx - emb.cx)).toBeLessThanOrEqual(tol);
    expect(Math.abs(packed.cy - emb.cy)).toBeLessThanOrEqual(tol);
  });

  it("emits one footprint center per cluster, aligned to clustering.labels", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    expect(desc.footprints.cx.length).toBe(desc.clustering.labels.length);
    expect(desc.footprints.cy.length).toBe(desc.clustering.labels.length);
    expect(desc.clustering.labels.length).toBe(4); // g0..g3
  });
});
