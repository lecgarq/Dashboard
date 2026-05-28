"use client";

/**
 * GraphCanvas2D.tsx — cosmos.gl v3 frozen-mode WebGL 2D renderer.
 *
 * This component:
 * - Attaches a cosmos.gl Graph instance to the parent's container div.
 * - Returns null (owns no DOM of its own; the container div lives in GraphCanvas.tsx).
 * - Exposes a GraphCanvas2DHandle via onHandleReady for position + mask updates.
 *
 * REND-01: cosmos.gl v3 — frozen mode by default (enableSimulation:false); optional GPU cluster-anchor simulation via the `gpuSimulation` prop.
 * REND-05: transitionDuration:0 + dontRescale:true on tick calls = zero jitter.
 * REND-04: Imports only @cosmos.gl/graph, react, and ./physicsLayer (type only).
 *
 * Key RESEARCH patterns implemented:
 *   Pattern 1 — Frozen mode constructor flags
 *   Pattern 2 — stride-3→stride-2 downproject with persistent buffer
 *   Pattern 3 — highlightedPointIndices via setConfigPartial (never setConfig)
 *   Pattern 4 — setPointColors with RGBA Float32Array
 *   Pitfall 1 — setConfigPartial for ALL runtime updates; setConfig only at construct time
 *   Pitfall 2 — stride-2 buffer allocated ONCE and reused every tick
 *   Pitfall 3 — async-readiness guard via graph.ready Promise check
 */

import { useEffect, useRef, type RefObject } from "react";
// TS6 note: useRef<T | null> returns RefObject<T | null>; we accept both variants.
import { Graph } from "@cosmos.gl/graph";
import { computeAnchors, mapForceConfig, clusterStrengthFromWeights, identityClusters } from "./gpuLayout2D";
import type { PhysicsLayer } from "./physicsLayer";
import type { GraphEventHandlers } from "./interactionTypes";

// Noop handlers — installed at mount; replaced via setEventHandlers ref-indirection
// (Phase 4-01 Task 2 + RESEARCH Pitfall 5).
const NOOP_HANDLERS: GraphEventHandlers = {
  onPointClick: () => {},
  onPointHover: () => {},
  onPointHoverEnd: () => {},
};

// ---------------------------------------------------------------------------
// Public handle — exposed to GraphCanvas.tsx via onHandleReady
// ---------------------------------------------------------------------------

export interface GraphCanvas2DHandle {
  /**
   * Push new positions from physicsLayer into cosmos.gl.
   * @param xyz - stride-3 Float32Array(n*3) from physicsLayer.getPositions()
   */
  pushPositions(xyz: Float32Array): void;
  /**
   * GPU mode only: recompute per-node cluster anchors + force coefficients from
   * the given normalized (0..1) slider values and reheat the GPU simulation.
   * No-op in frozen mode. Optional so flag-off handle literals (e.g. interaction
   * test fixtures) need not provide it; the real handle always implements it.
   */
  applySliders?(sliders: Record<string, number>): void;
  /**
   * Apply an alpha mask from physicsLayer to cosmos.gl's greyout system.
   * Uses highlightedPointIndices + pointGreyoutOpacity: 0.15 (REND-01).
   * @param mask    - per-node opacity from physicsLayer.alphaMask (1.0=lit, <0.99=dimmed)
   * @param version - maskVersion (unused here; version tracking lives in the rAF loop)
   */
  applyAlphaMask(mask: Float32Array, version: number): void;
  /**
   * Replace node colors at runtime (e.g. color-by selector change in Phase 4).
   * @param rgba - RGBA Float32Array(n*4) with values in [0,1]
   */
  setColors(rgba: Float32Array): void;
  /** Replace the link set (flat [s,t,...] index pairs). */
  setLinks(links: Float32Array): void;
  /** Replace per-link RGBA colors (0–1). Length must equal (links.length/2)*4. */
  setLinkColors(rgba: Float32Array): void;
  /** Test/diagnostic: effective cosmos link-render config + number of links set. */
  getRenderState(): { renderLinks: boolean; linkCount: number };
  /**
   * Test/diagnostic: cosmos's CURRENT point positions in its own space, as a
   * flat `[x0,y0,x1,y1,...]` array. After a `dontRescale=false` push cosmos may
   * rescale internally, so this — NOT the physics buffer — is the source of
   * truth for what `spaceToScreen`/`findPointsInPolygon` operate on.
   */
  getPointPositions?(): number[];
  /** Test/diagnostic: cosmos's current zoom level (camera scale). */
  getZoomLevel?(): number;
  /**
   * Install click/hover handlers via ref-indirection (Phase 4-01 Pitfall 5).
   * Safe to call any number of times — cosmos.gl config is NEVER re-issued.
   */
  setEventHandlers(h: GraphEventHandlers): void;
  /**
   * Polygon hit-test against current node positions. Path MUST be in cosmos.gl
   * SPACE coordinates — callers convert from screen via screenToSpace per point.
   * Returns [] if the graph isn't ready yet (logs a single warn).
   */
  findPointsInPolygon(spacePath: [number, number][]): number[];
  /** Canvas-local screen pixels → cosmos.gl space coords. */
  screenToSpace(screenXY: [number, number]): [number, number];
  /** Cosmos.gl space coords → canvas-local screen pixels. */
  spaceToScreen(spaceXY: [number, number]): [number, number];
  /** Highlight selected nodes via outlines and isolated node via focus ring. */
  setSelectedIndices?(indices: number[]): void;
  /** Focus a point with a blue ring when hovered. */
  setHoveredIndex?(index: number | null): void;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GraphCanvas2DProps {
  /** The div that cosmos.gl attaches its canvas to. Lives in GraphCanvas.tsx. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Source of initial node count (via getPositions()) — type only; no feature data. */
  physics: PhysicsLayer;
  /** RGBA Float32Array(n*4) with values in [0,1]. */
  nodeColors: Float32Array;
  /** Per-node size in world units. Optional. */
  nodeSizes?: Float32Array;
  /** Flat cosmos link buffer [s0,t0,s1,t1,...]; same point-index space as positions. */
  links?: Float32Array;
  /** Per-link RGBA (0–1) buffer, length = links.length/2*4. */
  linkColors?: Float32Array;
  /** Theme-driven canvas background color (e.g. '#09090B' for dark zinc). */
  backgroundColor: string;
  /** When true, run cosmos.gl's GPU force simulation (cluster-anchor layout) instead of frozen mode. */
  gpuSimulation?: boolean;
  /** Called once when the cosmos.gl graph is initialized and ready to receive data. */
  onHandleReady: (h: GraphCanvas2DHandle) => void;
}

// ---------------------------------------------------------------------------
// Component — returns null (no DOM; cosmos.gl owns the canvas inside containerRef)
// ---------------------------------------------------------------------------

export function GraphCanvas2D(props: GraphCanvas2DProps): null {
  // Persistent stride-2 buffer — allocated ONCE on mount, reused every tick (Pitfall 2)
  const xy2Ref = useRef<Float32Array | null>(null);
  // Stable ref to the cosmos.gl graph instance for reactive effects
  const graphRef = useRef<Graph | null>(null);
  // Phase 4-01 — ref-indirect event handlers (Pitfall 5: never re-issue config).
  const handlersRef = useRef<GraphEventHandlers>(NOOP_HANDLERS);
  // Number of links last handed to cosmos (links.length / 2). Read by the test
  // bridge's render guard to assert edges are actually set + rendered.
  const linkCountRef = useRef(0);
  // Warn-once guard for early findPointsInPolygon calls (Pitfall 7).
  const warnedNotReadyRef = useRef(false);
  // Stored selection indices to coordinate hover rings correctly
  const selectedIndicesRef = useRef<number[]>([]);
  // Last spread (max |coord|) we rescaled+fit cosmos to, or null while animating.
  // A ONE-SHOT fit on the first frozen frame is not enough: the layout flips
  // `frozen` true and is THEN normalized to ≈±350 a beat later, so a one-shot fit
  // frames the pre-normalization spread (~16k) and leaves the settled cloud an
  // unzoomable speck. We instead re-fit whenever the spread changes materially —
  // which tracks normalization but stays inert under user pan/zoom (those move
  // the camera, not the node positions, so the measured spread is unchanged).
  const fittedScaleRef = useRef<number | null>(null);
  // Frames to wait before fitView after a frozen position push. fitView reads
  // cosmos's COMMITTED point bbox, but setPointPositions uploads asynchronously,
  // so a same-tick fitView frames the stale (pre-upload) positions and no-ops.
  // Deferring a few rAF frames lets the new bbox land before we frame it.
  const fitPendingRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Mount effect: initialize cosmos.gl Graph in frozen mode (REND-01, Pattern 1)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const div = props.containerRef.current;
    if (!div) return;

    let cancelled = false;
    let g: Graph | null = null;

    // Async-readiness guard (Pitfall 3): wrap all init in async IIFE so we can
    // await graph.ready if cosmos.gl exposes it as a Promise.
    void (async () => {
      // CRITICAL config flags (Pattern 1 from RESEARCH):
      // - enableSimulation: false  → frozen mode; cosmos.gl never drives physics
      // - transitionDuration: 0   → no GPU tweens; rAF drives all animation (REND-05)
      // - renderLinks: true        → draws same-user footprint edges (WS2; link colors precomputed)
      // - pointGreyoutOpacity: 0.15 → matches DIM_ALPHA from CosmosCanvasClient.ts
      g = new Graph(div, {
        enableSimulation: props.gpuSimulation === true,
        transitionDuration: 0,
        ...(props.gpuSimulation ? mapForceConfig(props.physics.getSliders()) : {}),
        renderLinks: true,
        backgroundColor: props.backgroundColor,
        pointGreyoutOpacity: 0.15,
        spaceSize: 4096,
        fitViewOnInit: true,
        fitViewDelay: 250,
        fitViewPadding: 0.1,
        pixelRatio: window.devicePixelRatio,
        renderHoveredPointRing: true,
        hoveredPointRingColor: "#3b82f6",
        // -- Phase 4-01 event wiring (ref-indirect — Pitfall 5) --------------
        // cosmos.gl reads config once at construction; we route through handlersRef
        // so React closure updates take effect without setConfigPartial calls.
        onClick: (
          index: number | undefined,
          _pointPosition?: [number, number],
          _event?: MouseEvent,
        ) => {
          handlersRef.current.onPointClick(index);
        },
        onPointMouseOver: (
          index: number,
          pointPosition: [number, number],
          _event?: MouseEvent,
          _isHighlighted?: boolean,
          _isOutlined?: boolean,
        ) => {
          // cosmos returns space coords; convert to screen for tooltip placement
          const screen = (
            g as unknown as {
              spaceToScreenPosition: (xy: [number, number]) => [number, number];
            }
          ).spaceToScreenPosition(pointPosition);
          handlersRef.current.onPointHover(index, screen);
        },
        onPointMouseOut: () => {
          handlersRef.current.onPointHoverEnd();
        },
      } as any);

      // If cosmos.gl v3 exposes graph.ready as a Promise, await it before
      // pushing data (Pitfall 3 — queue limit reached on early calls).
      if ((g as unknown as { ready?: Promise<unknown> }).ready instanceof Promise) {
        await (g as unknown as { ready: Promise<unknown> }).ready;
      }

      // Guard: if the component unmounted while awaiting, destroy and bail.
      if (cancelled) {
        g.destroy?.();
        return;
      }

      // Store in stable ref for reactive effects
      graphRef.current = g;

      // Initial data load -------------------------------------------------------

      // Get initial positions (stride-3) and allocate the persistent stride-2 buffer.
      const xyz0 = props.physics.getPositions();
      const n = xyz0.length / 3;
      const xy2 = new Float32Array(n * 2); // allocated ONCE (Pitfall 2)
      xy2Ref.current = xy2;

      // Downproject xyz → xy2 (drop z — cosmos.gl is 2D only)
      for (let i = 0; i < n; i++) {
        xy2[i * 2] = xyz0[i * 3];
        xy2[i * 2 + 1] = xyz0[i * 3 + 1];
      }

      // Initial setPointPositions: dontRescale=false so fitView works on first frame.
      g.setPointPositions(xy2, false);
      g.setPointColors(props.nodeColors);
      if (props.nodeSizes) {
        g.setPointSizes(props.nodeSizes);
      }
      if (props.links && props.links.length > 0) {
        (g as unknown as { setLinks: (l: Float32Array) => void }).setLinks(props.links);
        linkCountRef.current = props.links.length / 2;
        if (props.linkColors) {
          if (
            process.env.NODE_ENV !== "production" &&
            props.linkColors.length !== (props.links.length / 2) * 4
          ) {
            throw new Error("GraphCanvas2D: linkColors length must equal (links/2)*4");
          }
          (g as unknown as { setLinkColors: (c: Float32Array) => void }).setLinkColors(props.linkColors);
        }
      }
      g.render();

      // GPU mode init (cluster-anchor simulation) -------------------------------
      // Wire cosmos.gl's cluster force as a per-node anchor: one cluster per node,
      // cluster positions = slider-weighted dimension targets, per-node strength =
      // availability-gated dim weights. Seed positions AT the anchors so the sim
      // starts near targets (not random) then reheat with start(alpha).
      if (props.gpuSimulation) {
        const targets = props.physics.getTargets();
        const dimW = props.physics.getDimWeights();
        const sliders0 = props.physics.getSliders();
        const anchors0 = computeAnchors(sliders0, targets, dimW, n);
        (g as unknown as { setPointClusters: (c: (number | undefined)[]) => void }).setPointClusters(
          identityClusters(n),
        );
        // cosmos setClusterPositions wants a plain (number|undefined)[] (undefined = unanchored); Array.from converts the typed buffer. ~n*2 numbers per slider event — negligible at human cadence.
        (g as unknown as { setClusterPositions: (p: (number | undefined)[]) => void }).setClusterPositions(
          Array.from(anchors0),
        );
        (g as unknown as { setPointClusterStrength: (s: Float32Array) => void }).setPointClusterStrength(
          clusterStrengthFromWeights(dimW, sliders0, n),
        );
        g.setPointPositions(anchors0, false); // seed near targets, not random
        (g as unknown as { start: (a?: number) => void }).start(0.5);
        g.render();
      }

      // Expose the handle to the parent (GraphCanvas.tsx via onHandleReady) ----------
      props.onHandleReady({
        pushPositions(xyz: Float32Array): void {
          if (props.gpuSimulation) return; // GPU mode: cosmos owns positions
          const count = xyz.length / 3;
          // Write into the pre-allocated buffer — ZERO new allocation (Pitfall 2)
          for (let i = 0; i < count; i++) {
            xy2[i * 2] = xyz[i * 3];
            xy2[i * 2 + 1] = xyz[i * 3 + 1];
          }
          if (props.physics.frozen) {
            // Always hand the latest xy2 to cosmos every rAF, even when the
            // overall spread is stable. B.2 preview interpolation produces fresh
            // per-frame coordinates while physics stays frozen, and a stable-
            // spread early-return would silently drop that motion. The rescale
            // detection and deferred fitView below are a SEPARATE concern from
            // the per-frame upload — they govern when to re-frame the camera,
            // not whether to upload positions.
            // dontRescale=TRUE keeps cosmos's space identical to the physics
            // ≈±350 coords: no internal rescale, and spaceToScreen stays correct.
            g!.setPointPositions(xy2, true);
            g!.render();

            // Re-fit only when the spread changes materially: this catches the
            // post-`frozen` normalization to ≈±350 (a one-shot fit would frame
            // the pre-normalization ~16k spread and leave the cloud a speck),
            // yet does NOT fire on user pan/zoom (which leave the node
            // positions, hence the spread, unchanged).
            let maxAbs = 0;
            for (let i = 0; i < count * 2; i++) {
              const v = Math.abs(xy2[i]);
              if (v > maxAbs) maxAbs = v;
            }
            const prev = fittedScaleRef.current;
            const scaleChanged =
              prev === null || Math.abs(maxAbs - prev) > Math.max(1, prev * 0.02);
            if (scaleChanged) {
              fittedScaleRef.current = maxAbs;
              // Defer the fit — see fitPendingRef. A same-tick fitView would frame
              // the not-yet-uploaded bbox and leave the cloud an unzoomable speck.
              fitPendingRef.current = 4;
              return;
            }
            if (fitPendingRef.current > 0) {
              fitPendingRef.current -= 1;
              if (fitPendingRef.current === 0) {
                // enableSimulation:false explicitly — cosmos must not run physics
                // during the fit (the graph is in frozen/external-positions mode).
                (
                  g as unknown as {
                    fitView?: (d?: number, p?: number, s?: boolean) => void;
                  }
                ).fitView?.(0, 0.1, false);
                g!.render();
              }
            }
            return;
          }
          // Still animating: arm a fresh fit for the next settle (e.g. after a
          // slider change reheats the simulation).
          fittedScaleRef.current = null;
          fitPendingRef.current = 0;
          // dontRescale=true on tick calls — prevents per-frame coordinate jitter (Pitfall 2)
          g!.setPointPositions(xy2, true);
          g!.render();
        },

        applySliders(sliders: Record<string, number>): void {
          if (!props.gpuSimulation) return;
          const n2 = xy2.length / 2;
          const targets = props.physics.getTargets();
          const dimW = props.physics.getDimWeights();
          const anchors = computeAnchors(sliders, targets, dimW, n2);
          const cfg = mapForceConfig(sliders);
          (g as unknown as { setClusterPositions: (p: (number | undefined)[]) => void }).setClusterPositions(
            Array.from(anchors),
          );
          (g as unknown as { setPointClusterStrength: (s: Float32Array) => void }).setPointClusterStrength(
            clusterStrengthFromWeights(dimW, sliders, n2),
          );
          g!.setConfigPartial(cfg as unknown as Record<string, unknown>);
          (g as unknown as { start: (a?: number) => void }).start(0.5);
          g!.render();
        },

        applyAlphaMask(mask: Float32Array, _version: number): void {
          // Build the lit-indices array (Pattern 3 from RESEARCH)
          const lit: number[] = [];
          for (let i = 0; i < mask.length; i++) {
            if (mask[i] >= 0.99) lit.push(i);
          }
          const allLit = lit.length === mask.length;
          // Use setConfigPartial only — Pitfall 1: bare setConfig resets all defaults
          g!.setConfigPartial({
            highlightedPointIndices: allLit
              ? undefined
              : (lit as unknown as number[]),
          });
          g!.render();
        },

        setColors(rgba: Float32Array): void {
          g!.setPointColors(rgba);
          g!.render();
        },

        setLinks(links: Float32Array): void {
          (g as unknown as { setLinks: (l: Float32Array) => void })!.setLinks(links);
          linkCountRef.current = links.length / 2;
          g!.render();
        },

        setLinkColors(rgba: Float32Array): void {
          if (process.env.NODE_ENV !== "production") {
            for (let i = 0; i < rgba.length; i++) {
              const v = rgba[i];
              if (!Number.isFinite(v) || v < 0 || v > 1) {
                throw new Error(`GraphCanvas2D.setLinkColors: value out of [0,1]: ${v}`);
              }
            }
          }
          (g as unknown as { setLinkColors: (c: Float32Array) => void })!.setLinkColors(rgba);
          g!.render();
        },

        getRenderState(): { renderLinks: boolean; linkCount: number } {
          // Read the EFFECTIVE cosmos config so a renderLinks regression is caught.
          const cfg = (g as unknown as { config?: { renderLinks?: boolean } }).config;
          return {
            renderLinks: cfg?.renderLinks === true,
            linkCount: linkCountRef.current,
          };
        },

        getPointPositions(): number[] {
          return (
            (g as unknown as { getPointPositions?: () => number[] }).getPointPositions?.() ?? []
          );
        },

        getZoomLevel(): number {
          return (g as unknown as { getZoomLevel?: () => number }).getZoomLevel?.() ?? NaN;
        },

        // ---- Phase 4-01 Task 2 primitives ---------------------------------

        setEventHandlers(h: GraphEventHandlers): void {
          // Ref-indirection (Pitfall 5): replace the closure target only.
          // Never call setConfig / setConfigPartial for handler updates.
          handlersRef.current = h;
        },

        findPointsInPolygon(spacePath: [number, number][]): number[] {
          const gAny = g as unknown as {
            findPointsInPolygon?: (path: [number, number][]) => number[];
            isReady?: boolean;
          };
          // Pitfall 7 — cosmos init queue limit: bail with [] if not ready yet.
          if (!gAny.findPointsInPolygon || gAny.isReady === false) {
            if (!warnedNotReadyRef.current) {
              warnedNotReadyRef.current = true;
              // eslint-disable-next-line no-console
              console.warn(
                "GraphCanvas2D.findPointsInPolygon called before graph.ready — returning []",
              );
            }
            return [];
          }
          return gAny.findPointsInPolygon(spacePath) ?? [];
        },

        screenToSpace(screenXY: [number, number]): [number, number] {
          return (
            g as unknown as {
              screenToSpacePosition: (xy: [number, number]) => [number, number];
            }
          ).screenToSpacePosition(screenXY);
        },

        spaceToScreen(spaceXY: [number, number]): [number, number] {
          return (
            g as unknown as {
              spaceToScreenPosition: (xy: [number, number]) => [number, number];
            }
          ).spaceToScreenPosition(spaceXY);
        },

        setSelectedIndices(indices: number[]): void {
          selectedIndicesRef.current = indices;
          g!.setConfigPartial({
            outlinedPointIndices: indices.length > 0 ? indices : undefined,
            focusedPointIndex: indices.length === 1 ? indices[0] : undefined,
          });
          g!.render();
        },

        setHoveredIndex(index: number | null): void {
          const activeFocus = index !== null 
            ? index 
            : (selectedIndicesRef.current.length === 1 ? selectedIndicesRef.current[0] : undefined);
          g!.setConfigPartial({
            focusedPointIndex: activeFocus,
          });
          g!.render();
        },
      });
    })();

    // Cleanup: cancel in-flight init, destroy cosmos.gl graph on unmount
    return () => {
      cancelled = true;
      g?.destroy?.();
      graphRef.current = null;
      xy2Ref.current = null;
    };
    // Mount-only effect — dependencies intentionally empty.
    // Color/size/backgroundColor changes are handled by separate effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Background color reactivity — setConfigPartial only (never setConfig, Pitfall 1)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.setConfigPartial({ backgroundColor: props.backgroundColor });
    graphRef.current.render();
  }, [props.backgroundColor]);

  // ---------------------------------------------------------------------------
  // Color prop updates — push new colors when nodeColors Float32Array reference changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current.setPointColors(props.nodeColors);
    graphRef.current.render();
  }, [props.nodeColors]);

  // ---------------------------------------------------------------------------
  // Size prop updates
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!graphRef.current || !props.nodeSizes) return;
    graphRef.current.setPointSizes(props.nodeSizes);
    graphRef.current.render();
  }, [props.nodeSizes]);

  return null;
}
