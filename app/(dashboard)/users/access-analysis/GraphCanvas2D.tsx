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
import { mapDominantForceConfig } from "./gpuLayout2D";
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
   * GPU cluster mode only: re-assign each node's cluster (e.g. when the color
   * mode switches and the color-group assignment changes) and reheat. No-op in
   * frozen mode. Takes fresh ids as an arg to avoid a stale-closure read of
   * props.clusterIds.
   */
  /**
   * GPU cluster mode (primary): seed nodes at their dominant-attribute cluster's
   * pinned anchor + group + pin in one call, so blobs appear separated instantly.
   * Pass (null, null) to clear clusters → calm scatter. No-op in frozen mode.
   */
  setClustering?(clusterIds: Int32Array | null, anchors: Float32Array | null): void;
  setClusters?(clusterIds: (number | undefined)[]): void;
  /**
   * GPU cluster mode only: reposition the cluster anchors (e.g. when slider-
   * weighted cluster centroids change) and reheat. No-op in frozen mode. Takes
   * fresh anchors as an arg to avoid a stale-closure read of props.clusterAnchors.
   */
  setClusterPositions?(anchors: number[]): void;
  /**
   * Cluster-deterministic mode: pause the GPU sim so pushed positions are the sole
   * source of truth (no force movement), or resume it. No-op when gpuSimulation is off.
   */
  pauseSimulation?(): void;
  resumeSimulation?(): void;
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
  /** Atomically replace native similarity links, colors, and widths with one render. */
  setSimilarityLinks(links: Float32Array, rgba: Float32Array, widths: Float32Array): void;
  /** Test/diagnostic: effective cosmos link-render config + number of links set. */
  getRenderState(): { renderLinks: boolean; linkCount: number };
  /**
   * Test/diagnostic: cosmos's CURRENT point positions in its own space, as a
   * flat `[x0,y0,x1,y1,...]` array. After a `dontRescale=false` push cosmos may
   * rescale internally, so this - NOT the physics buffer - is the source of
   * truth for what `spaceToScreen` and rendered hit-testing operate on.
   */
  getPointPositions?(): number[];
  /** Test/diagnostic: cosmos's current zoom level (camera scale). */
  getZoomLevel?(): number;
  /** Capture the exact 2D camera center + zoom for a reversible focus session. */
  captureView?(): GraphCanvas2DView;
  /** Center the camera on one point without reheating the frozen simulation. */
  focusPoint?(index: number, durationMs: number): void;
  /** Restore a previously captured 2D camera view without simulation. */
  restoreView?(view: GraphCanvas2DView, durationMs: number): void;
  /**
   * LOD: atomically switch the rendered point SET to a new count — positions (stride-2),
   * colors (RGBA, len = count*4), and optional sizes (len = count). Keeps the camera
   * (no refit). Used when the level-of-detail mode flips between full nodes and the
   * smaller aggregate-clump set so cosmos updates far fewer points per frame.
   */
  setPointSet?(positions2: Float32Array, colors: Float32Array, sizes?: Float32Array): void;
  /** LOD: position-only update for the CURRENT set (any count), with the no-op skip. */
  pushPointSet?(positions2: Float32Array): void;
  /**
   * PERF-07: GPU-animated morph of the CURRENT set to new positions. One CPU
   * upload; cosmos v3's built-in position transition (source→target FBOs +
   * interpolatePosition shader, easing from config.transitionEasing) animates
   * every frame GPU-side — no per-frame CPU writes. durationMs 0 snaps.
   */
  morphPointSet?(positions2: Float32Array, durationMs: number): void;
  /**
   * Install click/hover handlers via ref-indirection (Phase 4-01 Pitfall 5).
   * Safe to call any number of times — cosmos.gl config is NEVER re-issued.
   */
  setEventHandlers(h: GraphEventHandlers): void;
  /**
   * Polygon hit-test against current node positions. Path MUST be in canvas-local
   * screen pixels, matching cosmos.gl's Graph.findPointsInPolygon API.
   * Returns [] if the graph isn't ready yet (logs a single warn).
   */
  findPointsInPolygon(screenPath: [number, number][]): number[];
  /** Canvas-local screen pixels → cosmos.gl space coords. */
  screenToSpace(screenXY: [number, number]): [number, number];
  /** Cosmos.gl space coords → canvas-local screen pixels. */
  spaceToScreen(spaceXY: [number, number]): [number, number];
  /** Highlight selected nodes via outlines and isolated node via focus ring. */
  setSelectedIndices?(indices: number[]): void;
  /** Focus a point with a blue ring when hovered. */
  setHoveredIndex?(index: number | null): void;
}

export interface GraphCanvas2DView {
  center: [number, number];
  zoom: number;
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
  /**
   * True while the deterministic packed-cluster positions are the authoritative
   * source (the shell supplies clusterPackedPositions). The pushed positions then
   * own the layout and must drive the framing/fit path — even when the d3 physics
   * layer hasn't frozen (GPU-off test mode) and the GPU sim isn't paused. Without
   * this, the fit branch only runs via `physics.frozen` (false under test) or
   * `clusterPushActive` (GPU-on only), so the cluster cloud never gets framed.
   */
  clusterMode?: boolean;
  /**
   * Bounding-box corners of the FINAL packed cluster cloud, flat `[x0,y0,...]`
   * (4 corners) in cosmos space. The camera fit frames THESE rather than the live
   * eased buffer: the ease can pass through a much larger/asymmetric bbox mid-flight
   * (e.g. seeded from a wide physics scatter), so framing the live buffer mis-zooms
   * and off-centers. Framing the known final extent is correct regardless of ease
   * progress or seed. Undefined → fall back to the live positions.
   */
  clusterCorners?: Float32Array;
  /**
   * GPU cluster mode: per-node cluster index (color-group assignment). When
   * present (and length === node count), nodes are grouped into discrete clumps
   * by cluster via cosmos's cluster force — instead of the per-node anchor path.
   * Absent → backward-compatible per-node behavior.
   */
  clusterIds?: Int32Array;
  /** GPU cluster mode: slider-weighted per-cluster 2D anchors (stride-2, clusterCount*2). */
  clusterAnchors?: Float32Array;
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
  // Live mirror of props.clusterMode, read inside the mount-only pushPositions
  // closure (props captured at mount would be stale). Kept current by the effect
  // below. Gates the deterministic-cluster framing path independent of frozen.
  const clusterModeRef = useRef<boolean>(!!props.clusterMode);
  // Live mirror of the final cluster-cloud corners (see props.clusterCorners),
  // read inside the mount-only pushPositions closure for the camera fit.
  const clusterCornersRef = useRef<Float32Array | undefined>(props.clusterCorners);
  // LOD: number of points cosmos is CURRENTLY rendering (full N or the smaller aggregate
  // count). The color/size prop effects skip when their length doesn't match this, so a
  // full-length color buffer is never pushed onto the aggregate set (a count mismatch).
  const currentCountRef = useRef<number>(0);

  // ---------------------------------------------------------------------------
  // Mount effect: initialize cosmos.gl Graph in frozen mode (REND-01, Pattern 1)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const div = props.containerRef.current;
    if (!div) return;

    let cancelled = false;
    let g: Graph | null = null;
    // Cluster-deterministic mode: when true the GPU sim is paused and pushed
    // positions (eased packed blob layout) are uploaded as the sole source of
    // truth. Set by pauseSimulation / cleared by resumeSimulation; read by
    // pushPositions to open its GPU-mode upload gate.
    let clusterPushActive = false;
    // Last stride-2 positions actually uploaded to cosmos. Used to skip redundant
    // re-uploads once the cluster ease settles: the rAF pump keeps calling
    // pushPositions every frame, and re-running setPointPositions+render (which
    // makes cosmos re-sync every texture, ~33 texSubImage2D/frame) on IDENTICAL
    // positions pins the page at ~5fps forever. Skipping no-op uploads recovers
    // to full fps once the blobs stop moving.
    let prevUploaded: Float32Array | null = null;

    // Async-readiness guard (Pitfall 3): wrap all init in async IIFE so we can
    // await graph.ready if cosmos.gl exposes it as a Promise.
    void (async () => {
      // CRITICAL config flags (Pattern 1 from RESEARCH):
      // - enableSimulation: false  → frozen mode; cosmos.gl never drives physics
      // - transitionDuration: 0   → no GPU tweens; rAF drives all animation (REND-05)
      // - renderLinks: true        → draws same-user or native similarity links
      // - pointGreyoutOpacity: 0.15 → matches DIM_ALPHA from CosmosCanvasClient.ts
      g = new Graph(div, {
        enableSimulation: props.gpuSimulation === true,
        transitionDuration: 0,
        // PERF-07 morph seam: the config default stays 0 (every existing call
        // path still snaps); morphPointSet alone passes a per-call duration via
        // render(undefined, durationMs). Easing applies only to those cycles.
        transitionEasing: "quad-in-out",
        ...(props.gpuSimulation
          ? mapDominantForceConfig(
              Math.max(0, ...Object.values(props.physics.getSliders())),
            )
          : {}),
        renderLinks: true,
        linkWidth: 0.5,
        curvedLinks: true,
        curvedLinkControlPointDistance: 0.14,
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

      // Luma's canvas ResizeObserver can miss the first non-zero size when this
      // absolute slot settles during hydration. Sync the drawing buffer once at
      // readiness; the observer continues to own subsequent responsive resizes.
      const pixelRatio = window.devicePixelRatio || 1;
      const canvasContext = (
        g as unknown as {
          device?: {
            canvasContext?: {
              resize?: (size: { width: number; height: number }) => void;
              getCurrentFramebuffer?: () => unknown;
            };
          };
        }
      ).device?.canvasContext;
      canvasContext?.resize?.({
        width: Math.max(1, Math.round(div.clientWidth * pixelRatio)),
        height: Math.max(1, Math.round(div.clientHeight * pixelRatio)),
      });
      // Luma applies resize() lazily. Materialize the backing framebuffer before
      // Cosmos creates point/link GPU resources or the browser default 300×150
      // surface can remain bound and render transparent.
      canvasContext?.getCurrentFramebuffer?.();
      (g as unknown as { resizeCanvas?: (force?: boolean) => void }).resizeCanvas?.(true);

      // Initial data load -------------------------------------------------------

      // Get initial positions (stride-3) and allocate the persistent stride-2 buffer.
      const xyz0 = props.physics.getPositions();
      const n = xyz0.length / 3;
      currentCountRef.current = n; // full set on init
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
      // The first Cosmos rAF can retain its pre-resize transparent target even
      // after Luma materializes the correct framebuffer. Draw the initialized
      // point/link state once synchronously; Cosmos owns continuous frames after.
      (g as unknown as { renderFrame?: (timestamp?: number) => void }).renderFrame?.(
        performance.now(),
      );

      // DOMINANT-ATTRIBUTE CLUSTERING (the "with-labels" blobs) -----------------
      // The shell computes, from the highest slider: per-node clusterIds + a
      // distinct PINNED 2D anchor per cluster (an even sunflower fill, never a
      // sphere/ring). We SEED each node AT its cluster's anchor (+ tiny jitter) so
      // the blobs appear separated INSTANTLY — separation is structural, not left
      // to the force to discover (which failed: nodes piled centrally). The pinned
      // anchors + cluster force then HOLD each blob; repulsion gives it area; the
      // slider drives ONLY tightness (simulationCluster), via applySliders.
      const seedAtAnchors = (ids: Int32Array, anchors: Float32Array): void => {
        for (let i = 0; i < n; i++) {
          const c = ids[i];
          xy2[i * 2] = (anchors[c * 2] ?? 0) + (Math.random() - 0.5) * 24;
          xy2[i * 2 + 1] = (anchors[c * 2 + 1] ?? 0) + (Math.random() - 0.5) * 24;
        }
        g!.setPointPositions(xy2, false); // false → fitView frames the full spread
        (g as unknown as { setPointClusters: (c: (number | undefined)[]) => void }).setPointClusters(
          Array.from(ids),
        );
        (g as unknown as { setPointClusterStrength: (s: Float32Array) => void }).setPointClusterStrength(
          new Float32Array(n).fill(1),
        );
        // PINNED, pre-separated anchors → blobs stay put and separated.
        (g as unknown as { setClusterPositions: (p: (number | undefined)[]) => void }).setClusterPositions(
          Array.from(anchors),
        );
      };

      if (props.gpuSimulation) {
        if (props.clusterIds && props.clusterAnchors && props.clusterIds.length === n) {
          seedAtAnchors(props.clusterIds, props.clusterAnchors);
        } else {
          // No dominant attribute → neutral random disc, no clusters (calm scatter).
          for (let i = 0; i < n; i++) {
            const ang = Math.random() * 2 * Math.PI;
            const rad = Math.sqrt(Math.random()) * 800;
            xy2[i * 2] = Math.cos(ang) * rad;
            xy2[i * 2 + 1] = Math.sin(ang) * rad;
          }
          g.setPointPositions(xy2, false);
        }
        (g as unknown as { start: (a?: number) => void }).start(0.5);
        g.render();
      }

      // Expose the handle to the parent (GraphCanvas.tsx via onHandleReady) ----------
      props.onHandleReady({
        pushPositions(xyz: Float32Array): void {
          // GPU mode: cosmos owns positions — EXCEPT in cluster-deterministic mode
          // (sim paused), where these eased packed positions ARE the source of truth.
          if (props.gpuSimulation && !clusterPushActive) return;
          const count = xyz.length / 3;
          // Write into the pre-allocated buffer — ZERO new allocation (Pitfall 2)
          for (let i = 0; i < count; i++) {
            xy2[i * 2] = xyz[i * 3];
            xy2[i * 2 + 1] = xyz[i * 3 + 1];
          }
          if (props.physics.frozen || clusterPushActive || clusterModeRef.current) {
            // No-op skip: if these positions are byte-for-byte identical to what we
            // last uploaded, cosmos would render the exact same frame — skip the
            // upload+render entirely. Guarded by fitPendingRef so a DEFERRED fitView
            // (armed on a scale change below) still gets its countdown frames. This
            // only ever skips genuinely static frames, so B.2 preview motion (which
            // changes coordinates every frame) is never dropped.
            if (
              prevUploaded &&
              prevUploaded.length === count * 2 &&
              fitPendingRef.current === 0
            ) {
              let changed = false;
              for (let i = 0; i < count * 2; i++) {
                if (prevUploaded[i] !== xy2[i]) { changed = true; break; }
              }
              if (!changed) return;
            }
            if (!prevUploaded || prevUploaded.length !== count * 2) {
              prevUploaded = new Float32Array(count * 2);
            }
            prevUploaded.set(xy2.subarray(0, count * 2));
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
                // Frame the camera to the ACTUAL uploaded cloud, not cosmos's committed
                // bbox. Plain fitView() reads getFitViewPositions() (the GPU position
                // FBO), which under our dontRescale=true uploads lags/mismatches the CPU
                // buffer — so it framed a stale pre-cluster bbox and the packed cloud
                // spilled off-screen (the labels, pinned to the same space, went with
                // it). fitViewByPointPositions takes our exact xy2 buffer and only sets
                // the zoom/pan transform (no rescale of stored coords), so spaceToScreen
                // — which shares the same scaleX/scaleY basis — keeps labels locked to
                // their blobs. 4th arg false = don't run the sim during the fit tween.
                (
                  g as unknown as {
                    fitViewByPointPositions?: (
                      p: Float32Array,
                      d?: number,
                      pad?: number,
                      enableSim?: boolean,
                    ) => void;
                  }
                ).fitViewByPointPositions?.(
                  clusterCornersRef.current ?? xy2.subarray(0, count * 2),
                  0,
                  0.12,
                  false,
                );
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

        setClustering(clusterIds: Int32Array | null, anchors: Float32Array | null): void {
          if (!props.gpuSimulation) return;
          if (clusterIds && anchors && clusterIds.length === n) {
            // Re-seed every node AT its cluster's pinned anchor → instant, guaranteed
            // separation into one blob per attribute value (no force-discovery pile).
            seedAtAnchors(clusterIds, anchors);
          } else {
            // No dominant attribute → clear clusters; nodes keep their positions and
            // repulsion gently disperses them (calm scatter, "all sliders 0 = nothing").
            (g as unknown as { setPointClusters: (c: (number | undefined)[]) => void }).setPointClusters(
              new Array(n).fill(undefined),
            );
            (g as unknown as { setPointClusterStrength: (s: Float32Array) => void }).setPointClusterStrength(
              new Float32Array(n),
            );
          }
          (g as unknown as { start: (a?: number) => void }).start(0.4);
          g!.render();
        },

        applySliders(sliders: Record<string, number>): void {
          if (!props.gpuSimulation) return;
          // Tightness only: ramp the global cluster-pull coefficient with the
          // dominant slider. Cluster membership + pinned anchors are owned by
          // setClustering, so a slider drag never re-groups — it just tightens/
          // loosens the existing blobs. Gentle reheat = controlled.
          const max = Math.max(0, ...Object.values(sliders));
          g!.setConfigPartial(mapDominantForceConfig(max) as unknown as Record<string, unknown>);
          (g as unknown as { start: (a?: number) => void }).start(0.3);
          g!.render();
        },

        setClusters(clusterIds: (number | undefined)[]): void {
          if (!props.gpuSimulation) return;
          (g! as unknown as { setPointClusters: (c: (number | undefined)[]) => void }).setPointClusters(
            clusterIds,
          );
          // Unclustered entries (undefined) get zero pull so they scatter; members
          // get full pull toward their pinned anchor (global coeff scales tightness).
          const strength = new Float32Array(clusterIds.length);
          for (let i = 0; i < clusterIds.length; i++) strength[i] = clusterIds[i] == null ? 0 : 1;
          (g! as unknown as { setPointClusterStrength: (s: Float32Array) => void }).setPointClusterStrength(
            strength,
          );
          (g! as unknown as { start: (a?: number) => void }).start(0.5);
          g!.render();
        },

        setClusterPositions(anchors: number[]): void {
          if (!props.gpuSimulation) return;
          // PINNED anchors (pre-separated 2D sunflower) — never centermass.
          (g! as unknown as { setClusterPositions: (p: (number | undefined)[]) => void }).setClusterPositions(
            anchors,
          );
          (g! as unknown as { start: (a?: number) => void }).start(0.5);
          g!.render();
        },

        pauseSimulation(): void {
          if (!props.gpuSimulation) return;
          clusterPushActive = true; // open pushPositions' GPU-mode upload gate
          (g as unknown as { pause?: () => void }).pause?.();
        },
        resumeSimulation(): void {
          if (!props.gpuSimulation) return;
          clusterPushActive = false;
          (g as unknown as { start?: (a?: number) => void }).start?.();
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

        setSimilarityLinks(links: Float32Array, rgba: Float32Array, widths: Float32Array): void {
          if (process.env.NODE_ENV !== "production") {
            const linkCount = links.length / 2;
            if (
              links.length % 2 !== 0 ||
              rgba.length !== linkCount * 4 ||
              widths.length !== linkCount
            ) {
              throw new Error("GraphCanvas2D.setSimilarityLinks: links/colors/widths length mismatch");
            }
            for (let i = 0; i < rgba.length; i++) {
              const value = rgba[i];
              if (!Number.isFinite(value) || value < 0 || value > 1) {
                throw new Error(`GraphCanvas2D.setSimilarityLinks: color out of [0,1]: ${value}`);
              }
            }
          }
          g!.setLinks(links);
          g!.setLinkColors(rgba);
          g!.setLinkWidths(widths);
          linkCountRef.current = links.length / 2;
          g!.render();
          // Keep native-link updates visually atomic with their buffers. Cosmos's
          // scheduled frame can retain the prior target after a Luma resize.
          (g as unknown as { renderFrame?: (timestamp?: number) => void }).renderFrame?.(
            performance.now(),
          );
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

        captureView(): GraphCanvas2DView {
          const center = (
            g as unknown as {
              screenToSpacePosition: (xy: [number, number]) => [number, number];
            }
          ).screenToSpacePosition([div.clientWidth / 2, div.clientHeight / 2]);
          return {
            center,
            zoom: (g as unknown as { getZoomLevel: () => number }).getZoomLevel(),
          };
        },

        focusPoint(index: number, durationMs: number): void {
          (
            g as unknown as {
              zoomToPointByIndex: (
                index: number,
                duration: number,
                scale: number,
                canZoomOut: boolean,
                enableSimulation: boolean,
              ) => void;
            }
          ).zoomToPointByIndex(index, durationMs, 2.25, false, false);
        },

        restoreView(view: GraphCanvas2DView, durationMs: number): void {
          (
            g as unknown as {
              setZoomTransformByPointPositions: (
                positions: Float32Array,
                duration: number,
                scale: number,
                padding: number,
                enableSimulation: boolean,
              ) => void;
            }
          ).setZoomTransformByPointPositions(
            new Float32Array(view.center),
            durationMs,
            view.zoom,
            0,
            false,
          );
        },

        // LOD — atomic point-SET switch (different count). Keep the camera (dontRescale=
        // true): the aggregate clump-dots live in the same space as the full nodes (both
        // from the same layout), so the current framing still fits. Reset prevUploaded so
        // the per-frame no-op skip doesn't compare across a count change.
        setPointSet(positions2: Float32Array, colors: Float32Array, sizes?: Float32Array): void {
          g!.setPointPositions(positions2, true);
          g!.setPointColors(colors);
          if (sizes) g!.setPointSizes(sizes);
          g!.render();
          prevUploaded = null;
          currentCountRef.current = positions2.length / 2;
        },

        // LOD — position-only update for the CURRENT set (any count). Mirrors the frozen
        // pushPositions no-op skip so a settled view parks the GPU pump, but is count-
        // agnostic and free of the full-set fit/scale bookkeeping.
        pushPointSet(positions2: Float32Array): void {
          const len = positions2.length;
          if (prevUploaded && prevUploaded.length === len) {
            let changed = false;
            for (let i = 0; i < len; i++) {
              if (prevUploaded[i] !== positions2[i]) { changed = true; break; }
            }
            if (!changed) return;
          }
          if (!prevUploaded || prevUploaded.length !== len) {
            prevUploaded = new Float32Array(len);
          }
          prevUploaded.set(positions2);
          g!.setPointPositions(positions2, true);
          g!.render();
        },

        // PERF-07 — GPU-animated morph for the CURRENT set. setPointPositions
        // queues the Positions transition property; render's second arg
        // overrides the transition duration for THIS cycle only (public seam,
        // index.d.ts:375), so cosmos interpolates source→target GPU-side.
        // prevUploaded resets so the next ambient push isn't no-op-skipped
        // against pre-morph coordinates.
        morphPointSet(positions2: Float32Array, durationMs: number): void {
          g!.setPointPositions(positions2, true);
          g!.render(undefined, durationMs);
          prevUploaded = null;
        },

        // ---- Phase 4-01 Task 2 primitives ---------------------------------

        setEventHandlers(h: GraphEventHandlers): void {
          // Ref-indirection (Pitfall 5): replace the closure target only.
          // Never call setConfig / setConfigPartial for handler updates.
          handlersRef.current = h;
        },

        findPointsInPolygon(screenPath: [number, number][]): number[] {
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
          return gAny.findPointsInPolygon(screenPath) ?? [];
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
    // Skip while the aggregate (smaller) set is live — these full-length colors would
    // mismatch the rendered count. They re-apply when the full set is restored (setPointSet).
    if (currentCountRef.current !== props.nodeColors.length / 4) return;
    graphRef.current.setPointColors(props.nodeColors);
    graphRef.current.render();
  }, [props.nodeColors]);

  // ---------------------------------------------------------------------------
  // Size prop updates
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!graphRef.current || !props.nodeSizes) return;
    if (currentCountRef.current !== props.nodeSizes.length) return; // skip on the aggregate set
    graphRef.current.setPointSizes(props.nodeSizes);
    graphRef.current.render();
  }, [props.nodeSizes]);

  // Keep the live cluster-mode mirror current for the mount-only pushPositions closure.
  useEffect(() => {
    clusterModeRef.current = !!props.clusterMode;
  }, [props.clusterMode]);
  useEffect(() => {
    clusterCornersRef.current = props.clusterCorners;
  }, [props.clusterCorners]);

  return null;
}
