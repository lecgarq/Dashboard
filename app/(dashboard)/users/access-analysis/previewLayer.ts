// previewLayer.ts
import type { TargetArrays } from "./physicsLayer";

export interface PreviewLayer {
  readonly displayed: Float32Array;
  seedFrom(xyz: Float32Array): void;
  step(sliders: Record<string, number>, dtMs: number): boolean;
  snapshot(): Float32Array;
}

export function createPreviewLayer(opts: {
  targets: TargetArrays;
  dimWeights: Record<string, Float32Array>;
  nodeCount: number;
}): PreviewLayer {
  const { nodeCount } = opts;
  const displayed = new Float32Array(nodeCount * 3);

  function seedFrom(xyz: Float32Array): void {
    if (xyz.length !== displayed.length) {
      throw new Error(
        `previewLayer.seedFrom: length mismatch (got ${xyz.length}, expected ${displayed.length})`,
      );
    }
    displayed.set(xyz);
  }

  function step(_sliders: Record<string, number>, _dtMs: number): boolean {
    // Implemented in Task 2.
    return false;
  }

  function snapshot(): Float32Array {
    return displayed;
  }

  return { displayed, seedFrom, step, snapshot };
}
