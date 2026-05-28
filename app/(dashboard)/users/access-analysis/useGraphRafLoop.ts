/**
 * useGraphRafLoop.ts — Single rAF loop that pumps positions from physicsLayer
 * to the active renderer (2D or 3D) at ~60fps with zero per-frame allocation.
 *
 * Architecture (Pattern 7 from RESEARCH):
 * - One useEffect owns the loop; cancels on cleanup or dep change.
 * - physicsLayer.getPositions() called ONCE per frame; result routed to
 *   onTick2D or onTick3D based on mode.
 * - maskVersion change-detection guards onMaskChange — never called on every tick.
 * - enabled=false cancels and does not reschedule.
 */

import { useEffect, useRef } from "react";
import type { PhysicsLayer } from "./physicsLayer";

export interface UseGraphRafLoopOptions {
  physics: PhysicsLayer;
  mode: "2d" | "3d";
  enabled: boolean;
  /** Called each frame when mode === '2d'. Receives the stride-3 xyz array. */
  onTick2D: (xyz: Float32Array) => void;
  /** Called each frame when mode === '3d'. Receives the stride-3 xyz array. */
  onTick3D: (xyz: Float32Array) => void;
  /**
   * Called when physicsLayer.maskVersion increments.
   * NOT called every frame — only on change.
   */
  onMaskChange?: (alphaMask: Float32Array, version: number) => void;
  /**
   * Optional per-frame positions source. When supplied and the call returns a
   * non-null Float32Array, the loop routes THAT array to onTick2D instead of
   * calling physics.getPositions(). Returning null falls back to
   * physics.getPositions() for that frame. Ignored entirely in 3D mode.
   * Intended for 2D preview override (B.2).
   */
  getPositionsOverride?: () => Float32Array | null;
  /**
   * When true AND mode==='2d', skip the per-frame position read+route
   * (cosmos GPU sim drives 2D itself). Mask change-detection still runs.
   * In 3D mode this flag is ignored — the pump always runs.
   * Default false.
   */
  skipPositionPump?: boolean;
}

/**
 * Drives a single requestAnimationFrame loop that:
 * 1. Calls physics.getPositions() once per frame.
 * 2. Routes the xyz array to onTick2D or onTick3D based on mode.
 * 3. Fires onMaskChange only when physics.maskVersion changes.
 *
 * No Float32Arrays are allocated inside the loop beyond the one
 * returned by getPositions() on each call (physicsLayer owns that allocation).
 */
export function useGraphRafLoop(opts: UseGraphRafLoopOptions): void {
  const lastMaskVersionRef = useRef<number>(-1);

  // Stable refs for callbacks so the effect dep array stays minimal
  const onTick2DRef = useRef(opts.onTick2D);
  const onTick3DRef = useRef(opts.onTick3D);
  const onMaskChangeRef = useRef(opts.onMaskChange);

  const getPositionsOverrideRef = useRef(opts.getPositionsOverride);
  getPositionsOverrideRef.current = opts.getPositionsOverride;

  // Keep callback refs fresh without restarting the loop
  onTick2DRef.current = opts.onTick2D;
  onTick3DRef.current = opts.onTick3D;
  onMaskChangeRef.current = opts.onMaskChange;

  useEffect(() => {
    if (!opts.enabled) return;

    let rafId: number;
    // Initialize lastMaskVersion to the current physics version on loop start.
    // This prevents a spurious onMaskChange fire on the very first tick.
    lastMaskVersionRef.current = opts.physics.maskVersion;

    function tick(): void {
      rafId = requestAnimationFrame(tick);

      // When skipPositionPump is true in 2D mode, cosmos.gl GPU sim drives
      // positions itself — skip the costly physics.getPositions() read+route
      // (~204 KB Float32Array allocation per frame). Mask change-detection
      // always runs regardless of this flag. In 3D mode the pump runs
      // unconditionally (d3 engine requires it).
      const skipPump = !!opts.skipPositionPump && opts.mode === "2d";

      if (!skipPump) {
        let xyz: Float32Array;
        const override = getPositionsOverrideRef.current?.() ?? null;
        xyz = override ?? opts.physics.getPositions();

        if (opts.mode === "2d") {
          onTick2DRef.current(xyz);
        } else {
          onTick3DRef.current(xyz);
        }
      }

      // Change-detection guard: only fire onMaskChange when version increments.
      // ALWAYS runs — skipPositionPump does not suppress mask updates.
      const currentVersion = opts.physics.maskVersion;
      if (currentVersion !== lastMaskVersionRef.current) {
        lastMaskVersionRef.current = currentVersion;
        onMaskChangeRef.current?.(opts.physics.alphaMask, currentVersion);
      }
    }

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
    };
    // Re-run when physics instance, mode, enabled flag, or skipPositionPump changes.
    // Callback functions are accessed via stable refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.physics, opts.mode, opts.enabled, opts.skipPositionPump]);
}
