import { describe, it, expect } from "vitest";
import { buildEmbeddingBlobDescriptor } from "./embeddingBlobDescriptor";
import { descriptorTarget } from "./layoutDescriptor";
import { computeBBoxStride2 } from "./embeddingFit";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const DIM = {
  id: "grp", label: "Group", family: "structure", kind: "categorical",
  source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
  extract: (f) => (f as unknown as { grp: string }).grp,
} as unknown as CatalogDimension;

function fixture(): { features: NodeFeatureSnapshot[]; xy: Float32Array } {
  const n = 60;
  const features: NodeFeatureSnapshot[] = [];
  const xy = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    features.push({ grp: `g${i % 5}` } as unknown as NodeFeatureSnapshot);
    xy[i * 2] = 200 + (i * 17 % 600);
    xy[i * 2 + 1] = -100 + (i * 11 % 300);
  }
  return { features, xy };
}

// downproject the stride-3 morph output to stride-2 for bbox comparison.
function toXy(xyz: Float32Array): Float32Array {
  const n = xyz.length / 3;
  const xy = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { xy[i * 2] = xyz[i * 3]; xy[i * 2 + 1] = xyz[i * 3 + 1]; }
  return xy;
}

describe("Group-by morph — bounding box stability (coordinate-scale gate)", () => {
  it("never balloons beyond the embedding bbox across the whole strength range", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    const emb = computeBBoxStride2(xy);
    const out = new Float32Array(features.length * 3);
    const limit = emb.halfExtent * 1.05;
    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      const target = descriptorTarget(desc, { grp: s * 100 }, out);
      const box = computeBBoxStride2(toXy(target));
      expect(box.halfExtent).toBeLessThanOrEqual(limit);
    }
  });

  it("at strength 0 reproduces the embedding scatter exactly", () => {
    const { features, xy } = fixture();
    const desc = buildEmbeddingBlobDescriptor(features, DIM, xy);
    const out = new Float32Array(features.length * 3);
    const target = descriptorTarget(desc, { grp: 0 }, out);
    for (let i = 0; i < features.length; i++) {
      expect(target[i * 3]).toBeCloseTo(xy[i * 2], 5);
      expect(target[i * 3 + 1]).toBeCloseTo(xy[i * 2 + 1], 5);
    }
  });
});
