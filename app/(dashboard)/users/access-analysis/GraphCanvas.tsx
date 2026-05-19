"use client";

/**
 * GraphCanvas.tsx — Public entry component for the Access Analysis spatial graph.
 *
 * REND-04 PURITY CONTRACT:
 * - This component imports NOTHING from math/data/dimension-control layers.
 * - All visual encoding (color, size) arrives as precomputed typed arrays.
 * - The physics handle is the only source of positions and alpha masks.
 *
 * ARCHITECTURE (Pattern 6 — CSS visibility swap):
 * - Both 2D and 3D canvas containers are always mounted (never remounted on mode change).
 * - Switching mode uses CSS visibility to avoid WebGL context destruction (Pitfall 5 in RESEARCH).
 * - Plan 03-02 fills the 3D slot by mounting GraphCanvas3D in container3DRef.
 */

import React, { useRef } from "react";
import { useTheme } from "next-themes";
import type { PhysicsLayer } from "./physicsLayer";
import { GraphCanvas2D, type GraphCanvas2DHandle } from "./GraphCanvas2D";
import { useGraphRafLoop } from "./useGraphRafLoop";

// ---------------------------------------------------------------------------
// Public props interface (REND-04 locked contract — from CONTEXT.md)
// ---------------------------------------------------------------------------

export interface GraphCanvasProps {
  /** Source of positions + alphaMask. Must NOT be replaced with feature data. */
  physics: PhysicsLayer;
  /** RGBA Float32Array(n*4) with values in [0,1]. Pre-computed by caller. */
  nodeColors: Float32Array;
  /** Per-node size in world units. Optional. */
  nodeSizes?: Float32Array;
  /** Render mode. Does NOT trigger remount or WebGL context loss on change. */
  mode: "2d" | "3d";
  /** Active dimension names for 3D axis labels. Used by Plan 03-02 (GraphCanvas3D). */
  activeDimNames?: readonly string[];
  /** Visual-only hovered node index. Interaction wiring is Phase 4. */
  hoveredIndex?: number;
  /** Visual-only selected node indices. Interaction wiring is Phase 4. */
  selectedIndices?: readonly number[];
  /**
   * Theme-driven background color.
   * Defaults to '#09090B' (dark zinc) in dark mode; '#FFFFFF' in light mode.
   */
  backgroundColor?: string;
  /** Optional explicit width. Defaults to container clientWidth. */
  width?: number;
  /** Optional explicit height. Defaults to container clientHeight. */
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GraphCanvas(props: GraphCanvasProps): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const bg =
    props.backgroundColor ??
    (resolvedTheme === "dark" ? "#09090B" : "#FFFFFF");

  // Handle refs for each renderer — Plan 03-02 adds handle3D
  const handle2D = useRef<GraphCanvas2DHandle | null>(null);

  // Container refs for the two canvas slots (always mounted — visibility swap pattern)
  const container2DRef = useRef<HTMLDivElement | null>(null);
  const container3DRef = useRef<HTMLDivElement | null>(null);

  // rAF loop — one loop drives whichever renderer is currently visible
  useGraphRafLoop({
    physics: props.physics,
    mode: props.mode,
    enabled: true,
    onTick2D: (xyz) => {
      handle2D.current?.pushPositions(xyz);
    },
    onTick3D: () => {
      // Plan 03-02 wires this to GraphCanvas3D handle
    },
    onMaskChange: (mask, version) => {
      handle2D.current?.applyAlphaMask(mask, version);
    },
  });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* 2D cosmos.gl canvas slot — always mounted, hidden in 3D mode */}
      <div
        ref={container2DRef}
        style={{
          position: "absolute",
          inset: 0,
          // visibility:hidden preserves WebGL context; display:none destroys it (Pitfall 5)
          visibility: props.mode === "2d" ? "visible" : "hidden",
        }}
      >
        <GraphCanvas2D
          containerRef={container2DRef}
          physics={props.physics}
          nodeColors={props.nodeColors}
          nodeSizes={props.nodeSizes}
          backgroundColor={bg}
          onHandleReady={(h) => {
            handle2D.current = h;
          }}
        />
      </div>

      {/* 3D slot — Plan 03-02 mounts GraphCanvas3D here */}
      {/* container3DRef is exported pattern: Plan 03-02 uses the same slot */}
      <div
        ref={container3DRef}
        style={{
          position: "absolute",
          inset: 0,
          visibility: props.mode === "3d" ? "visible" : "hidden",
        }}
      >
        {/* GraphCanvas3D will be mounted here by Plan 03-02 */}
        {/* Pattern: <GraphCanvas3D containerRef={container3DRef} physics={props.physics} ... /> */}
      </div>
    </div>
  );
}
