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
 * - GraphCanvas3D is always mounted inside container3DRef — no conditional render.
 *
 * MODE TRANSITIONS (CONTEXT.md locked decisions):
 * - 2D → 3D: 600ms camera tilt animation via requestAnimationFrame
 * - 3D → 2D: 400ms z-flatten animation via requestAnimationFrame
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import type { PhysicsLayer } from "./physicsLayer";
import { GraphCanvas2D, type GraphCanvas2DHandle } from "./GraphCanvas2D";
import { GraphCanvas3D, type GraphCanvas3DHandle } from "./GraphCanvas3D";
import { useGraphRafLoop } from "./useGraphRafLoop";
import { useSliders } from "./SliderContext";
// previewLayer (B.2 fallback) is used only when ENABLE_PREVIEW_INTERPOLATION && !gpu2d
import { createPreviewLayer, type PreviewLayer } from "./previewLayer";
import { computeClusterAnchors } from "./gpuLayout2D";

// ---------------------------------------------------------------------------
// Phase 4-01 Task 2 — discriminated-union handle exposed to GraphInteractions
// ---------------------------------------------------------------------------

/**
 * Discriminated handle: GraphInteractions reads `mode` to pick the active
 * underlying renderer (2D = cosmos.gl, 3D = three.js). Lasso primitives are
 * only valid on the 2D variant.
 */
export type GraphCanvasHandle =
  | { mode: "2d"; handle: GraphCanvas2DHandle | null }
  | { mode: "3d"; handle: GraphCanvas3DHandle | null };

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
  /** Active dimension names for 3D axis labels. Used by GraphCanvas3D. */
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
  /** Flat cosmos link buffer for the 2D renderer. */
  links?: Float32Array;
  /** Initial per-link RGBA colors for the 2D renderer. */
  linkColors?: Float32Array;
  /**
   * Fired when an underlying renderer's imperative handle becomes available
   * (cosmos.gl 2D / three.js 3D init is async). Lets the interaction layer
   * (re)install event handlers once the handle exists — without this the parent
   * captures a null handle and hover/click/lasso never wire up.
   */
  onRendererReady?: () => void;
  /** Test/override: force 2D GPU sim on/off. Defaults to ENABLE_GPU_2D_SIM. */
  gpuSimulation?: boolean;
  /**
   * Per-node cluster index (color-group assignment). When present, the 2D GPU
   * graph groups nodes into discrete clumps by cluster instead of the per-node
   * anchor layout. Absent → backward-compatible per-node behavior.
   */
  clusterIds?: Int32Array;
}

// ---------------------------------------------------------------------------
// Feature flag
// ---------------------------------------------------------------------------

/**
 * B.2 — 2D real-time preview interpolation rollout switch.
 *
 * Setting this to `false` disables B.2 preview interpolation: the preview
 * layer is not constructed or used, the per-frame `getPositionsOverride` is
 * never installed, and 2D reverts to the B.1 tick-bound path (positions come
 * straight from `physics.getPositions()` every rAF). 3D is unaffected either way.
 *
 * This is the single-flip rollback if a regression surfaces; no other code
 * change is needed to revert B.2.
 */
const ENABLE_PREVIEW_INTERPOLATION = true;

/**
 * Master switch for the 2D GPU cluster-anchor simulation (this milestone).
 * ON by default; set NEXT_PUBLIC_ACC_GPU_2D="0" to revert 2D to the frozen +
 * B.2-preview path. Rollback is this single env flip — no other change needed.
 *
 * Forced OFF under the e2e test bridge (NEXT_PUBLIC_ACC_GRAPH_TEST="1"): the
 * lasso/selection e2e suite was authored against frozen, deterministic 2D
 * positions. GPU mode is covered by unit tests; GPU-mode e2e is a follow-up.
 */
const ENABLE_GPU_2D_SIM =
  process.env.NEXT_PUBLIC_ACC_GPU_2D !== "0" &&
  process.env.NEXT_PUBLIC_ACC_GRAPH_TEST !== "1";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas(props, ref): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const bg =
    props.backgroundColor ??
    (resolvedTheme === "dark" ? "#09090B" : "#FFFFFF");

  // GPU 2D sim flag — lets tests force it off deterministically via the prop
  const gpu2d = props.gpuSimulation ?? ENABLE_GPU_2D_SIM;

  // B.2 preview interpolation state
  const sliders = useSliders();
  const sliderValues = sliders.values;

  // Cluster mode (this milestone): number of color-group clusters, derived from
  // the per-node cluster ids. 0 when no clusterIds → per-node path stays active.
  const clusterCount = useMemo(() => {
    const ids = props.clusterIds;
    if (!ids || ids.length === 0) return 0;
    let m = 0;
    for (let i = 0; i < ids.length; i++) if (ids[i] + 1 > m) m = ids[i] + 1;
    return m;
  }, [props.clusterIds]);

  // Slider-weighted per-cluster anchors (centroid of each cluster's member
  // targets). Recomputed on slider drag so clumps stay alive. null in per-node
  // mode or before the GPU sim is active.
  const clusterAnchors = useMemo(() => {
    if (!gpu2d || !props.clusterIds || clusterCount === 0) return null;
    const n = props.clusterIds.length;
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(sliderValues)) normalized[k] = (v as number) / 100;
    return computeClusterAnchors(
      normalized,
      props.physics.getTargets(),
      props.physics.getDimWeights(),
      props.clusterIds,
      clusterCount,
      n,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpu2d, props.clusterIds, clusterCount, sliderValues, props.physics]);
  const previewRef = useRef<PreviewLayer | null>(null);
  const previewActiveLocalRef = useRef<boolean>(false);
  const lastFrameTsRef = useRef<number>(0);

  // Handle refs for each renderer
  const handle2D = useRef<GraphCanvas2DHandle | null>(null);
  const handle3D = useRef<GraphCanvas3DHandle | null>(null);

  // Bumped when an async renderer handle is assigned so the imperative handle
  // below recomputes with the live handle (not the null captured at mount).
  const [readyTick, setReadyTick] = useState(0);

  // Phase 4-01 Task 2 — expose discriminated handle to GraphInteractions
  useImperativeHandle(
    ref,
    (): GraphCanvasHandle =>
      props.mode === "2d"
        ? { mode: "2d", handle: handle2D.current }
        : { mode: "3d", handle: handle3D.current },
    // readyTick: recompute once the async cosmos.gl/three.js handle lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.mode, readyTick],
  );

  // B.2 — Construct the preview layer once per physics instance
  useEffect(() => {
    if (!ENABLE_PREVIEW_INTERPOLATION || gpu2d) {
      previewRef.current = null;
      return;
    }
    const xyz = props.physics.getPositions();
    previewRef.current = createPreviewLayer({
      targets: props.physics.getTargets(),
      dimWeights: props.physics.getDimWeights(),
      nodeCount: xyz.length / 3,
    });
    return () => {
      previewRef.current = null;
    };
  }, [props.physics, gpu2d]);

  // B.2 — Subscribe to preview-active transitions (both 2D and 3D).
  // Depend only on the stable subscribePreviewActive function ([] deps in
  // SliderContext) and props.physics — NOT on the full sliders
  // context value (which changes identity on every slider move and would
  // cause the cleanup to fire syncPositions mid-drag).
  const { subscribePreviewActive } = sliders;
  useEffect(() => {
    if (!ENABLE_PREVIEW_INTERPOLATION || gpu2d) return;
    const unsub = subscribePreviewActive((active) => {
      const layer = previewRef.current;
      if (!layer) return;
      if (active) {
        layer.seedFrom(props.physics.getPositions());
        lastFrameTsRef.current = performance.now();
        previewActiveLocalRef.current = true;
      } else if (previewActiveLocalRef.current) {
        props.physics.syncPositions(layer.snapshot());
        previewActiveLocalRef.current = false;
      }
    });
    return () => {
      unsub();
      // If we're tearing down while preview is still active (mode flip
      // mid-drag), commit the in-flight buffer back to physics so
      // the next session starts from the visible state, not stale d3.
      if (previewActiveLocalRef.current && previewRef.current) {
        props.physics.syncPositions(previewRef.current.snapshot());
        previewActiveLocalRef.current = false;
      }
    };
  }, [subscribePreviewActive, props.physics, props.mode]);

  // B.2 — Override callback: returns the interpolated positions during preview
  const getPositionsOverride = useCallback((): Float32Array | null => {
    if (!ENABLE_PREVIEW_INTERPOLATION || gpu2d) return null;
    if (!previewActiveLocalRef.current) return null;
    const layer = previewRef.current;
    if (!layer) return null;
    const now = performance.now();
    // Cap dt after pauses (tab backgrounded, breakpoint, etc.) — without this
    // the lerp would jump a huge chunk on the first resume frame.
    const dt = Math.min(50, now - lastFrameTsRef.current);
    lastFrameTsRef.current = now;
    layer.step(props.physics.getSliders(), dt);
    return layer.snapshot();
  }, [props.physics]);

  // Container refs for the two canvas slots (always mounted — visibility swap pattern)
  const container2DRef = useRef<HTMLDivElement | null>(null);
  const container3DRef = useRef<HTMLDivElement | null>(null);

  // Track previous mode for transition animation detection
  const prevMode = useRef<"2d" | "3d">(props.mode);
  // Track in-flight transition animation frame ID
  const animFrame = useRef<number | null>(null);

  // rAF loop — one loop drives whichever renderer is currently visible
  // onMaskChange fires to BOTH handles so each renderer stays in sync while hidden
  useGraphRafLoop({
    physics: props.physics,
    mode: props.mode,
    enabled: true,
    skipPositionPump: gpu2d,
    onTick2D: (xyz) => {
      handle2D.current?.pushPositions(xyz);
    },
    onTick3D: (xyz) => {
      handle3D.current?.pushPositions(xyz);
    },
    onMaskChange: (mask, version) => {
      handle2D.current?.applyAlphaMask(mask, version);
      handle3D.current?.applyAlphaMask(mask, version);
    },
    getPositionsOverride,
  });

  // GPU 2D (per-node path only): push slider changes straight to the cosmos GPU
  // simulation. Gated OFF in cluster mode (props.clusterIds present) so it does
  // not fight the cluster-anchor effects below.
  useEffect(() => {
    if (!gpu2d || props.mode !== "2d" || props.clusterIds) return;
    const h = handle2D.current;
    if (!h) return;
    const normalized: Record<string, number> = {};
    for (const [k, v] of Object.entries(sliderValues)) normalized[k] = v / 100;
    h.applySliders?.(normalized);   // applySliders is OPTIONAL on the handle — use ?.
  }, [sliderValues, props.mode, gpu2d, props.clusterIds]);

  // Cluster mode: re-group when the cluster ids change (color-mode switch).
  useEffect(() => {
    if (!gpu2d || props.mode !== "2d" || !props.clusterIds) return;
    handle2D.current?.setClusters?.(Array.from(props.clusterIds));
    // readyTick: re-run once the async cosmos handle lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.clusterIds, props.mode, gpu2d, readyTick]);

  // Cluster mode: reposition clumps when slider-weighted anchors change (alive).
  useEffect(() => {
    if (!gpu2d || props.mode !== "2d" || !clusterAnchors) return;
    handle2D.current?.setClusterPositions?.(Array.from(clusterAnchors));
    // readyTick: re-run once the async cosmos handle lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterAnchors, props.mode, gpu2d, readyTick]);

  // Sync nodeColors to both renderers when the buffer changes
  useEffect(() => {
    handle2D.current?.setColors(props.nodeColors);
    handle3D.current?.setColors(props.nodeColors);
  }, [props.nodeColors]);

  // Sync backgroundColor to 3D renderer (2D has its own useEffect in GraphCanvas2D)
  useEffect(() => {
    handle3D.current?.setBackground(bg);
  }, [bg]);

  // -------------------------------------------------------------------------
  // Mode-transition animations (CONTEXT.md locked decisions)
  // Both directions are required; easing curve is Claude's discretion.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const cam = handle3D.current?.getCamera();
    if (!cam) {
      prevMode.current = props.mode;
      return;
    }

    // Cancel any in-flight animation so a rapid toggle does not stack frames
    if (animFrame.current != null) {
      cancelAnimationFrame(animFrame.current);
      animFrame.current = null;
    }

    // 2D → 3D: 600ms camera tilt entry (CONTEXT.md locked)
    // fitView first so the bounding-box-derived end pose is correct,
    // then tween from a top-down-ish start toward the fitted pose.
    if (prevMode.current === "2d" && props.mode === "3d") {
      handle3D.current?.fitView();
      const endPos = cam.position.clone();
      const startPos = endPos.clone();
      // Tilt origin: elevate above the fitted end position
      startPos.y += Math.max(Math.abs(endPos.z), 1) * 0.75;
      const DURATION = 600; // ms — LOCKED in CONTEXT.md
      const t0 = performance.now();

      const easeInOutCubic = (t: number): number =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = (now: number): void => {
        const p = Math.min(1, (now - t0) / DURATION);
        const e = easeInOutCubic(p);
        cam.position.lerpVectors(startPos, endPos, e);
        if (p < 1) {
          animFrame.current = requestAnimationFrame(step);
        } else {
          animFrame.current = null;
        }
      };
      animFrame.current = requestAnimationFrame(step);
    }

    // 3D → 2D: 400ms z → 0 flatten (CONTEXT.md locked)
    // Tween camera.position.z toward 0 over 400ms.
    if (prevMode.current === "3d" && props.mode === "2d") {
      const startZ = cam.position.z;
      const DURATION = 400; // ms — LOCKED in CONTEXT.md
      const t0 = performance.now();

      const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

      const step = (now: number): void => {
        const p = Math.min(1, (now - t0) / DURATION);
        const e = easeOutCubic(p);
        cam.position.z = startZ * (1 - e); // → 0
        if (p < 1) {
          animFrame.current = requestAnimationFrame(step);
        } else {
          animFrame.current = null;
        }
      };
      animFrame.current = requestAnimationFrame(step);
    }

    prevMode.current = props.mode;

    return () => {
      if (animFrame.current != null) {
        cancelAnimationFrame(animFrame.current);
        animFrame.current = null;
      }
    };
  }, [props.mode]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

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
          links={props.links}
          linkColors={props.linkColors}
          gpuSimulation={gpu2d}
          clusterIds={props.clusterIds}
          clusterAnchors={clusterAnchors ?? undefined}
          clusterCount={clusterCount}
          onHandleReady={(h) => {
            handle2D.current = h;
            setReadyTick((t) => t + 1);
            props.onRendererReady?.();
          }}
        />
      </div>

      {/* 3D three.js canvas slot — always mounted, hidden in 2D mode */}
      {/* CRITICAL: GraphCanvas3D is unconditionally rendered — no {mode === '3d' && ...} */}
      {/* Conditional rendering would destroy the WebGL context on every mode switch (Pitfall 5) */}
      <div
        ref={container3DRef}
        style={{
          position: "absolute",
          inset: 0,
          visibility: props.mode === "3d" ? "visible" : "hidden",
        }}
      >
        <GraphCanvas3D
          containerRef={container3DRef}
          physics={props.physics}
          nodeColors={props.nodeColors}
          nodeSizes={props.nodeSizes}
          backgroundColor={bg}
          links={props.links}
          linkColors={props.linkColors}
          onHandleReady={(h) => {
            handle3D.current = h;
            setReadyTick((t) => t + 1);
            props.onRendererReady?.();
          }}
        />
      </div>
    </div>
  );
  },
);
