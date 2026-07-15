/**
 * clusterTransitionLayer.ts — Exp-smoothing of node positions toward a settable
 * target (stride-3, z held at 0 for the 2D view). Mirrors previewLayer so the
 * displayed buffer always eases FROM its current value: re-targeting mid-flight
 * never restarts or teleports, which is exactly what the 0<->1 engage/disengage
 * and regroup transitions require. Pure: no React/DOM/IO, no clock (dt is passed in).
 */
export interface ClusterTransitionLayer {
  seedFrom(xyz: Float32Array): void;
  setTarget(xyz: Float32Array): void;
  /** Advance toward target by dtMs. Returns true when settled (no material motion). */
  step(dtMs: number): boolean;
  snapshot(): Float32Array;
}

// TAU_MS / EPSILON tuned for FAST settle: each ease frame forces a full cosmos
// re-upload (~250ms on 16,942 nodes), so the fewer frames the transition takes,
// the shorter the low-fps window before pushPositions' dirty-check parks the pump.
// The default preserves the legacy quick settle; callers can request the workshop
// transition window while the per-frame dt clamp still absorbs background-tab gaps.
const MAX_DT_MS = 50;     // clamp after tab-background pauses (matches previewLayer)
const DEFAULT_DURATION_MS = 105; // preserves the prior 35ms time constant

export function createClusterTransitionLayer(opts: {
  nodeCount: number;
  /** Perceptual settle window; exponential time constant is one third of this. */
  durationMs?: number;
}): ClusterTransitionLayer {
  const n = opts.nodeCount;
  const durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
  const tauMs = Math.max(1, durationMs / 3);
  const epsilon = opts.durationMs == null ? 0.75 : 0.25;
  const displayed = new Float32Array(n * 3);
  const target = new Float32Array(n * 3);

  return {
    seedFrom(xyz: Float32Array): void {
      if (xyz.length !== displayed.length)
        throw new Error(`clusterTransitionLayer.seedFrom: length ${xyz.length} != ${displayed.length}`);
      displayed.set(xyz);
    },
    setTarget(xyz: Float32Array): void {
      if (xyz.length !== target.length)
        throw new Error(`clusterTransitionLayer.setTarget: length ${xyz.length} != ${target.length}`);
      target.set(xyz);
    },
    step(dtMs: number): boolean {
      const dt = Math.min(MAX_DT_MS, Math.max(0, dtMs));
      const alpha = 1 - Math.exp(-dt / tauMs);
      let moved = false;
      for (let i = 0; i < displayed.length; i++) {
        const d = (target[i] - displayed[i]) * alpha;
        if (Math.abs(d) > epsilon) { displayed[i] += d; moved = true; }
        else displayed[i] = target[i];
      }
      return !moved;
    },
    snapshot(): Float32Array {
      return displayed;
    },
  };
}
