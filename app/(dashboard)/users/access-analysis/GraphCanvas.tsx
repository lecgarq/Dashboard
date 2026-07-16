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
import { createClusterTransitionLayer, type ClusterTransitionLayer } from "./clusterTransitionLayer";
import { resolveLodMode } from "./lodState";
import { is3dGraphEnabled } from "./graphModeFlag";
import type { AmbientMotionLayer } from "./ambientMotion";

// ---------------------------------------------------------------------------
// Phase 4-01 Task 2 — discriminated-union handle exposed to GraphInteractions
// ---------------------------------------------------------------------------

/**
 * Discriminated handle: GraphInteractions reads `mode` to pick the active
 * underlying renderer (2D = cosmos.gl, 3D = three.js). The lasso works in both:
 * the 2D variant hit-tests via the cosmos handle; the 3D variant projects node
 * positions through `getCamera()` (see findPointsIn3DLasso).
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
   * Per-frame 2D layout target source (stride-3, z=0). The shell closes the layout
   * descriptor + the live slider value into this callback (the renderer stays pure —
   * it never imports layout math). When present, the 2D view eases toward this target
   * via the cluster transition layer with the GPU sim PAUSED, so separation is
   * structural. Absent → physics positions drive (bare/legacy path, e.g. unit tests).
   */
  layoutTarget?: () => Float32Array;
  /**
   * LOD — per-frame AGGREGATE positions (one stride-2 dot per cluster), or null when no
   * aggregate is available (e.g. the rest view). When present, the 2D renderer draws the
   * ~K aggregate dots instead of all N nodes while DRAGGING or zoomed-OUT (≈5× fewer points
   * cosmos updates per frame → 60fps), and swaps back to the full N nodes when zoomed-in AND
   * settled. Absent → the legacy full-detail path drives every frame.
   */
  aggregateTarget?: () => Float32Array | null;
  /** LOD: aggregate RGBA colors, length = clusterCount*4. */
  aggregateColors?: Float32Array;
  /** LOD: aggregate point sizes, length = clusterCount. */
  aggregateSizes?: Float32Array;
  /** Optional frozen-projector ambient compositor; receives only aligned buffers. */
  ambientLayer?: AmbientMotionLayer;
  /** One byte per node; 1 freezes selected/matched/hovered foreground nodes. */
  ambientFreezeMask?: Uint8Array;
  /** Softens non-frozen background offsets while a click focus is active. */
  ambientFocusActive?: boolean;
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

  const previewRef = useRef<PreviewLayer | null>(null);
  const previewActiveLocalRef = useRef<boolean>(false);
  const lastFrameTsRef = useRef<number>(0);
  const reducedMotionRef = useRef(
    typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const documentHiddenRef = useRef(
    typeof document !== "undefined" && document.hidden,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => {
      reducedMotionRef.current = media.matches;
      props.ambientLayer?.resetSampling(performance.now());
    };
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [props.ambientLayer]);

  useEffect(() => {
    const update = (): void => {
      documentHiddenRef.current = document.hidden;
      props.ambientLayer?.resetSampling(performance.now());
    };
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [props.ambientLayer]);

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
  const { subscribePreviewActive, isPreviewActive } = sliders;
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

  // CLUSTER-DETERMINISTIC VIEW — when the shell supplies a layoutTarget, it is the
  // source of positions for the 2D view; the GPU force sim stays paused, so separation
  // is structural, never force-discovered. layoutTarget() returns the per-frame target
  // (the shell writes it into a reused buffer from the descriptor + LIVE slider value),
  // eased through the transition layer so a regroup glides and a value drag flows.
  // Because the live value is read off a ref inside the shell's callback, a value drag
  // NEVER re-renders the shell or re-packs every node — that decoupling is the lag fix.
  const clusterActive = !!props.layoutTarget;
  const clusterLayerRef = useRef<ClusterTransitionLayer | null>(null);
  const clusterLastTsRef = useRef<number>(0);

  // LOD: which point set cosmos is currently showing, + a reused stride-2 buffer to
  // downproject the full xyz when (re)establishing the full set.
  const lodModeRef = useRef<"full" | "aggregate">("full");
  const fullXy2Ref = useRef<Float32Array | null>(null);

  const getPositionsOverride = useCallback((): Float32Array | null => {
    // 2D only: the target is a flat (z=0) layout. In 3D the renderer takes the
    // physics worker's 3D positions (which still react to slider forces) instead.
    if (props.mode !== "2d") return null;
    const layer = clusterLayerRef.current;
    if (!layer || !props.layoutTarget) return null;
    const target = props.layoutTarget();
    const now = performance.now();
    if (reducedMotionRef.current || documentHiddenRef.current) {
      return props.ambientLayer?.frame({
        anchors: target,
        nowMs: now,
        paused: isPreviewActive(),
        reducedMotion: true,
        freezeMask: props.ambientFreezeMask,
        focusActive: props.ambientFocusActive,
      }) ?? target;
    }
    try {
      layer.setTarget(target);
    } catch {
      // node count changed mid-flight (layer not yet re-created) — hold last frame
      return layer.snapshot();
    }
    const dt = clusterLastTsRef.current ? now - clusterLastTsRef.current : 16;
    clusterLastTsRef.current = now;
    const settled = layer.step(dt);
    const anchors = layer.snapshot();
    return props.ambientLayer?.frame({
      anchors,
      nowMs: now,
      paused: isPreviewActive() || !settled,
      reducedMotion: false,
      freezeMask: props.ambientFreezeMask,
      focusActive: props.ambientFocusActive,
    }) ?? anchors;
  }, [
    isPreviewActive,
    props.ambientFocusActive,
    props.ambientFreezeMask,
    props.ambientLayer,
    props.layoutTarget,
    props.mode,
  ]);

  // (Re)create the layer when node count changes; seed from current visible positions.
  useEffect(() => {
    const xyz = props.physics.getPositions();
    const layer = createClusterTransitionLayer({ nodeCount: xyz.length / 3, durationMs: 600 });
    layer.seedFrom(xyz);
    clusterLayerRef.current = layer;
    return () => { clusterLayerRef.current = null; };
  }, [props.physics]);

  // Pause/resume the GPU sim as we enter/leave cluster mode. On ENGAGE, re-seed the
  // transition layer from cosmos's CURRENT on-screen positions (stride-2 → stride-3)
  // so the ease starts from what's visible — not the stale d3-physics seed, which
  // would jump on the first frame. Defensive: skip if positions aren't available yet.
  useEffect(() => {
    if (!gpu2d || props.mode !== "2d") return;
    const h = handle2D.current;
    if (!h) return;
    if (clusterActive) {
      const layer = clusterLayerRef.current;
      const pts = h.getPointPositions?.();
      if (layer && pts && pts.length >= 2) {
        const n = pts.length / 2;
        const xyz = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          xyz[i * 3] = pts[i * 2];
          xyz[i * 3 + 1] = pts[i * 2 + 1];
        }
        try {
          layer.seedFrom(xyz);
        } catch {
          // length mismatch (node count changed mid-flight) — keep prior seed
        }
      }
      h.pauseSimulation?.();
    } else {
      h.resumeSimulation?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clusterActive, gpu2d, props.mode, readyTick]);

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
    skipPositionPump: gpu2d && !clusterActive,
    onTick2D: (xyz) => {
      const h = handle2D.current;
      if (!h) return;

      // LOD is available when the shell supplies aggregate data, the descriptor is driving
      // (blob view), AND the renderer exposes the point-set primitives. Else: legacy full path.
      const agg = props.aggregateTarget?.() ?? null;
      const lodCapable =
        !!agg && !!props.aggregateColors && clusterActive && !!h.setPointSet && !!h.pushPointSet;

      // Desired set: aggregate while dragging (when capable), else full. Settled = full so
      // interactions hit real nodes (see lodState — zoom-out aggregation is deferred).
      const desired: "full" | "aggregate" =
        lodCapable && resolveLodMode({ dragging: isPreviewActive() }) === "aggregate"
          ? "aggregate"
          : "full";

      // Downproject the full xyz (stride-3) into the reused stride-2 buffer.
      const toFullXy2 = (): Float32Array => {
        const count = xyz.length / 3;
        let buf = fullXy2Ref.current;
        if (!buf || buf.length !== count * 2) {
          buf = new Float32Array(count * 2);
          fullXy2Ref.current = buf;
        }
        for (let i = 0; i < count; i++) {
          buf[i * 2] = xyz[i * 3];
          buf[i * 2 + 1] = xyz[i * 3 + 1];
        }
        return buf;
      };

      // SET SWITCH — atomically swap positions + matching-count colors/sizes, then bail.
      if (desired !== lodModeRef.current) {
        if (desired === "aggregate") {
          h.setPointSet!(agg!, props.aggregateColors!, props.aggregateSizes);
          lodModeRef.current = "aggregate";
          return;
        }
        // desired full — restore the full set (positions + full colors) when the renderer
        // supports it; otherwise fall through to the legacy push.
        if (h.setPointSet) {
          h.setPointSet(toFullXy2(), props.nodeColors, props.nodeSizes);
          lodModeRef.current = "full";
          return;
        }
        lodModeRef.current = "full";
      }

      // STEADY FRAME — position-only push of the active set.
      if (desired === "aggregate") {
        h.pushPointSet!(agg!);
      } else if (lodCapable) {
        h.pushPointSet!(toFullXy2()); // LOD full (zoomed-in): no camera reframe
      } else {
        h.pushPositions(xyz); // legacy full (rest view): keeps the load-time fit
      }
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

  // (The old GPU applySliders / setClustering effects are gone: positions are now
  // always descriptor-driven with the GPU sim paused, so the slider value flows
  // through descriptorTarget in the rAF loop above — not through a GPU reheat.)

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

  const show3D = is3dGraphEnabled(process.env.NEXT_PUBLIC_ACC_3D_GRAPH);

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
          clusterMode={clusterActive}
          onHandleReady={(h) => {
            handle2D.current = h;
            setReadyTick((t) => t + 1);
            props.onRendererReady?.();
          }}
        />
      </div>

      {/* 3D three.js canvas slot — mounted only when NEXT_PUBLIC_ACC_3D_GRAPH=1 */}
      {show3D && (
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
      )}
    </div>
  );
  },
);
