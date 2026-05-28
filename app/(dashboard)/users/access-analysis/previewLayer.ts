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

  const TAU_MS = 80;
  const EPSILON = 1e-4;
  const { targets, dimWeights } = opts;
  const dimIds = Object.keys(targets);
  const tx = new Float32Array(nodeCount);
  const ty = new Float32Array(nodeCount);
  const tz = new Float32Array(nodeCount);
  const wSum = new Float32Array(nodeCount);

  function seedFrom(xyz: Float32Array): void {
    if (xyz.length !== displayed.length) {
      throw new Error(
        `previewLayer.seedFrom: length mismatch (got ${xyz.length}, expected ${displayed.length})`,
      );
    }
    displayed.set(xyz);
  }

  function step(sliders: Record<string, number>, dtMs: number): boolean {
    tx.fill(0); ty.fill(0); tz.fill(0); wSum.fill(0);
    let anyActive = false;
    for (const dimId of dimIds) {
      const sv = sliders[dimId] ?? 0;
      if (sv <= 0) continue;
      const t = targets[dimId];
      const w = dimWeights[dimId];
      anyActive = true;
      for (let i = 0; i < nodeCount; i++) {
        const wi = sv * (w ? w[i] : 1);
        if (wi === 0) continue;
        tx[i] += wi * t.x[i];
        ty[i] += wi * t.y[i];
        tz[i] += wi * t.z[i];
        wSum[i] += wi;
      }
    }
    if (!anyActive) return false;
    const alpha = 1 - Math.exp(-dtMs / TAU_MS);
    let moved = false;
    for (let i = 0; i < nodeCount; i++) {
      const sw = wSum[i];
      if (sw === 0) continue;
      const txi = tx[i] / sw;
      const tyi = ty[i] / sw;
      const tzi = tz[i] / sw;
      const j = i * 3;
      const dx = (txi - displayed[j]) * alpha;
      const dy = (tyi - displayed[j + 1]) * alpha;
      const dz = (tzi - displayed[j + 2]) * alpha;
      if (Math.abs(dx) > EPSILON || Math.abs(dy) > EPSILON || Math.abs(dz) > EPSILON) {
        displayed[j] += dx;
        displayed[j + 1] += dy;
        displayed[j + 2] += dz;
        moved = true;
      }
    }
    return moved;
  }

  function snapshot(): Float32Array {
    return displayed;
  }

  return { displayed, seedFrom, step, snapshot };
}
