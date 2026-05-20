"use client";

/**
 * GraphCanvas2D.tsx — cosmos.gl v3 frozen-mode WebGL 2D renderer.
 *
 * This component:
 * - Attaches a cosmos.gl Graph instance to the parent's container div.
 * - Returns null (owns no DOM of its own; the container div lives in GraphCanvas.tsx).
 * - Exposes a GraphCanvas2DHandle via onHandleReady for position + mask updates.
 *
 * REND-01: cosmos.gl v3 with enableSimulation:false (frozen), pointGreyoutOpacity:0.15.
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
  /** Theme-driven canvas background color (e.g. '#09090B' for dark zinc). */
  backgroundColor: string;
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
  // Warn-once guard for early findPointsInPolygon calls (Pitfall 7).
  const warnedNotReadyRef = useRef(false);
  // One-shot guard: rescale + fit the view once the layout settles. The seed
  // range (~[-1,1]) is tiny vs the settled spread (can be thousands of units),
  // so the init-time fit is stale until we re-fit to the frozen positions.
  const fittedRef = useRef(false);

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
      // - renderLinks: false       → zero edges (CONTEXT.md locked decision)
      // - pointGreyoutOpacity: 0.15 → matches DIM_ALPHA from CosmosCanvasClient.ts
      g = new Graph(div, {
        enableSimulation: false,
        transitionDuration: 0,
        renderLinks: false,
        backgroundColor: props.backgroundColor,
        pointGreyoutOpacity: 0.15,
        spaceSize: 4096,
        fitViewOnInit: true,
        fitViewDelay: 250,
        fitViewPadding: 0.1,
        pixelRatio: window.devicePixelRatio,
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
      g.render();

      // Expose the handle to the parent (GraphCanvas.tsx via onHandleReady) ----------
      props.onHandleReady({
        pushPositions(xyz: Float32Array): void {
          const count = xyz.length / 3;
          // Write into the pre-allocated buffer — ZERO new allocation (Pitfall 2)
          for (let i = 0; i < count; i++) {
            xy2[i * 2] = xyz[i * 3];
            xy2[i * 2 + 1] = xyz[i * 3 + 1];
          }
          if (props.physics.frozen) {
            // Layout settled. Rescale cosmos to the settled spread (which can far
            // exceed spaceSize) and frame it ONCE. Positions are static now, so we
            // must NOT keep pushing — a dontRescale=true push would re-apply the
            // raw out-of-space coordinates and undo the fit.
            if (!fittedRef.current) {
              fittedRef.current = true;
              g!.setPointPositions(xy2, false);
              (g as unknown as { fitView?: (d?: number, p?: number) => void }).fitView?.(0);
              g!.render();
            }
            return;
          }
          // Still animating: arm a fresh fit for the next settle (e.g. after a
          // slider change reheats the simulation).
          fittedRef.current = false;
          // dontRescale=true on tick calls — prevents per-frame coordinate jitter (Pitfall 2)
          g!.setPointPositions(xy2, true);
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
