"use client";

/**
 * GraphInteractions.tsx — Phase 4-01 Task 3.
 *
 * Wraps GraphCanvas with the interaction layer:
 *   - Subscribes click/hover events on the active mode's handle (2D = cosmos.gl,
 *     3D = three.js raycaster) via setEventHandlers.
 *   - Owns local state: hoveredIndex, tooltipAnchor.
 *   - Routes click → onIsolate prop. Routes background click + Esc → onIsolate(null).
 *   - Renders the LassoOverlay whenever lassoActive (3D screen-space lasso; 2D dormant).
 *   - Renders the NodeTooltip portal anchored to the hovered node's screen pos.
 *   - Calls usePredicateEngine — the single physics.setMask channel for all of
 *     filter/search/lasso/drill/isolate.
 *
 * Search debounce: 100ms via a useDebounce hook (RESEARCH Pitfall 4 — avoid
 * remasking 10k nodes on every keystroke).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { PhysicsLayer } from "./physicsLayer";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { GraphCanvasHandle } from "./GraphCanvas";
import type { GraphCanvas2DView } from "./GraphCanvas2D";
import { usePredicateEngine } from "./usePredicateEngine";
import { findPointsIn3DLasso } from "./lasso3d";
import { LassoOverlay } from "./LassoOverlay";
import { NodeTooltip } from "./NodeTooltip";
import { setInteractionTestState, setEdgeTestState } from "./graphTestBridge";
import { parseNodeId, type SameUserEdge } from "./sameUserEdges";
import { computeLinkEmphasisColors, countBrightEdges } from "./linkEmphasis";

export interface GraphInteractionsProps {
  physics: PhysicsLayer;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  mode: "2d" | "3d";
  /** Reference to the underlying GraphCanvas forwardRef target. */
  graphRef: RefObject<GraphCanvasHandle | null>;

  // ---- Filter / search inputs (provided by 04-02 chrome) -------------------
  activeFilters: Record<string, ReadonlySet<string>>;
  searchQuery: string;

  // ---- Lasso -------------------------------------------------------------
  lassoActive: boolean;
  onLassoComplete: (selectedIndices: number[]) => void;

  // ---- Click-isolate -----------------------------------------------------
  isolatedNodeIndex: number | null;
  onIsolate: (i: number | null) => void;

  /**
   * Similarity neighbors of the isolated node (cosmos node indices). Fed into the
   * predicate engine so the embedding map lights the closest matches alongside the
   * clicked node. Empty/undefined on the flag-ON physics graph (no embedding).
   */
  neighborIndices?: ReadonlySet<number> | null;
  /** Immediate hover notification for the Canvas2D similarity-edge layer. */
  onHoverChange?: (index: number | null) => void;

  /**
   * Increments when the underlying renderer handle becomes available. Used to
   * re-run the event-handler wiring effect once cosmos.gl/three.js finish their
   * async init (the handle is null at mount).
   */
  rendererReady: number;
  /** Same-user edges (cosmos index space) for link emphasis. */
  edges: SameUserEdge[];

  // ---- Lasso selection set (mirrored from 04-02 SelectionPanel) ---------
  lassoSelection: ReadonlySet<number> | null;
  drillDown: Record<string, string> | null;

  /** Aperture banded-label resolvers (Phase 25 DIM-04) — see PredicateInputs. */
  valueResolvers?: Readonly<Record<string, (f: NodeFeatureSnapshot) => string>>;

  /** GraphCanvas instance — rendered as a child. */
  children: ReactNode;
}

/** Lightweight debounce hook — no setInterval, no react-hook-form dependency. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function GraphInteractions(props: GraphInteractionsProps): React.JSX.Element {
  const {
    physics,
    features,
    mode,
    graphRef,
    activeFilters,
    searchQuery,
    lassoActive,
    onLassoComplete,
    isolatedNodeIndex,
    onIsolate,
    neighborIndices,
    onHoverChange,
    lassoSelection,
    drillDown,
    valueResolvers,
    rendererReady,
    edges,
    children,
  } = props;

  // ---- Local UI state ---------------------------------------------------
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipIndex, setTooltipIndex] = useState<number | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<[number, number] | null>(null);
  const [tooltipOrigin, setTooltipOrigin] = useState<[number, number] | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusViewRef = useRef<GraphCanvas2DView | null>(null);
  const focusedIndexRef = useRef<number | null>(null);

  // Stable handler refs so we install once per mode change, never per render.
  const onIsolateRef = useRef(onIsolate);
  const onHoverChangeRef = useRef(onHoverChange);
  useEffect(() => {
    onIsolateRef.current = onIsolate;
  }, [onIsolate]);
  useEffect(() => {
    onHoverChangeRef.current = onHoverChange;
  }, [onHoverChange]);

  const clearTooltipTimer = useCallback((): void => {
    if (tooltipTimerRef.current !== null) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  // ---- Wire click/hover into the active mode's handle ----------------
  useEffect(() => {
    const root = graphRef.current;
    if (!root || !root.handle) return;
    const handle = root.handle;

    const handlers = {
      onPointClick: (index: number | undefined): void => {
        if (index === undefined) {
          onIsolateRef.current(null);
        } else {
          onIsolateRef.current(index);
        }
      },
      onPointHover: (index: number, screenPos: [number, number]): void => {
        setHoveredIndex(index);
        onHoverChangeRef.current?.(index);
        handle.setHoveredIndex?.(index);
        clearTooltipTimer();
        setTooltipIndex(null);
        setTooltipAnchor(null);
        setTooltipOrigin(null);
        tooltipTimerRef.current = setTimeout(() => {
          const rect = wrapperRef.current?.getBoundingClientRect();
          setTooltipIndex(index);
          setTooltipAnchor(screenPos);
          setTooltipOrigin(rect ? [rect.left, rect.top] : [0, 0]);
          tooltipTimerRef.current = null;
        }, 80);
      },
      onPointHoverEnd: (): void => {
        clearTooltipTimer();
        setHoveredIndex(null);
        setTooltipIndex(null);
        setTooltipAnchor(null);
        setTooltipOrigin(null);
        onHoverChangeRef.current?.(null);
        handle.setHoveredIndex?.(null);
      },
    };
    handle.setEventHandlers(handlers);
    // Test-only: expose the SAME production handlers so the bridge's fallback
    // hover/click path invokes them directly (no separate fake path).
    setInteractionTestState({ handlers });
    // rendererReady: re-run once the async renderer handle exists.
    return clearTooltipTimer;
  }, [graphRef, mode, rendererReady, clearTooltipTimer]);

  // Test-only: mirror hover/tooltip state into the observation bridge.
  useEffect(() => {
    setInteractionTestState({ hoveredIndex, tooltipAnchor });
  }, [hoveredIndex, tooltipAnchor]);

  // ---- Reversible native 2D focus session -----------------------------
  useEffect(() => {
    if (mode !== "2d") {
      if (isolatedNodeIndex === null) {
        focusViewRef.current = null;
        focusedIndexRef.current = null;
      }
      return;
    }
    const root = graphRef.current;
    const handle = root?.mode === "2d" ? root.handle : null;
    if (!handle?.captureView || !handle.focusPoint || !handle.restoreView) return;
    const duration =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : 180;

    if (isolatedNodeIndex === null) {
      if (focusViewRef.current) {
        handle.restoreView(focusViewRef.current, duration);
      }
      focusViewRef.current = null;
      focusedIndexRef.current = null;
      return;
    }

    if (!focusViewRef.current) {
      focusViewRef.current = handle.captureView();
    }
    if (focusedIndexRef.current !== isolatedNodeIndex) {
      handle.focusPoint(isolatedNodeIndex, duration);
      focusedIndexRef.current = isolatedNodeIndex;
    }
  }, [graphRef, isolatedNodeIndex, mode, rendererReady]);

  // Derive selection array and push to active handle
  const selectedIndices = useMemo(() => {
    const arr: number[] = [];
    if (isolatedNodeIndex !== null) {
      arr.push(isolatedNodeIndex);
    }
    if (lassoSelection) {
      arr.push(...lassoSelection);
    }
    return arr;
  }, [isolatedNodeIndex, lassoSelection]);

  useEffect(() => {
    const handle = graphRef.current?.handle ?? null;
    if (handle) {
      (handle as any).setSelectedIndices?.(selectedIndices);
    }
  }, [selectedIndices, graphRef, rendererReady]);

  // ---- Escape closes isolate ---------------------------------------
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onIsolateRef.current(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Predicate engine (single physics.setMask consumer) -----------
  const debouncedSearch = useDebounced(searchQuery.toLowerCase(), 100);
  usePredicateEngine({
    physics,
    features,
    activeFilters,
    searchQuery: debouncedSearch,
    lassoSelection,
    drillDown,
    isolatedNodeIndex,
    neighborIndices,
    valueResolvers,
  });

  // Union of users in focus: hovered ∪ isolated ∪ lasso selection.
  const activeUserIds = useMemo(() => {
    const s = new Set<string>();
    const add = (idx: number | null): void => {
      if (idx == null) return;
      const f = features[idx];
      if (!f) return;
      const p = parseNodeId(f.nodeId);
      if (p) s.add(p.userId);
    };
    add(hoveredIndex);
    add(isolatedNodeIndex);
    if (lassoSelection) for (const i of lassoSelection) add(i);
    return s;
  }, [hoveredIndex, isolatedNodeIndex, lassoSelection, features]);

  // Push per-link emphasis colors to the active renderer (2D or 3D) on focus change.
  // Both handles accept the same per-link RGBA buffer; the 3D handle premultiplies
  // alpha into vertex RGB internally. brightCount is mirrored to the bridge in all modes.
  useEffect(() => {
    const handle = graphRef.current?.handle ?? null;
    const rgba = computeLinkEmphasisColors(edges, activeUserIds);
    if (handle) handle.setLinkColors(rgba);
    setEdgeTestState({ brightCount: countBrightEdges(edges, activeUserIds) });
    // rendererReady: re-apply once the async handle exists.
  }, [edges, activeUserIds, graphRef, mode, rendererReady]);

  // ---- Lasso overlay (3D screen-space projection; dormant 2D path kept) ----
  const hitTest = useCallback(
    (path: [number, number][], width: number, height: number): number[] => {
      const root = graphRef.current;
      if (!root || !root.handle) return [];
      if (root.mode === "3d") {
        const cam = root.handle.getCamera();
        return [...findPointsIn3DLasso(physics.getPositions(), cam, path, width, height)];
      }
      // Dormant 2D path retained for completeness.
      return root.handle.findPointsInPolygon(path);
    },
    [graphRef, physics],
  );

  const onLassoDragStart = useCallback((): void => {
    const root = graphRef.current;
    if (root?.mode === "3d") root.handle?.setControlsEnabled(false);
  }, [graphRef]);

  const onLassoDragEnd = useCallback((): void => {
    const root = graphRef.current;
    if (root?.mode === "3d") root.handle?.setControlsEnabled(true);
  }, [graphRef]);

  const hoveredFeature = tooltipIndex !== null ? features[tooltipIndex] ?? null : null;

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}
      {lassoActive ? (
        <LassoOverlay
          active={true}
          hitTest={hitTest}
          onComplete={onLassoComplete}
          onDragStart={onLassoDragStart}
          onDragEnd={onLassoDragEnd}
        />
      ) : null}
      <NodeTooltip
        anchorScreenXY={tooltipAnchor}
        feature={hoveredFeature}
        canvasOriginXY={tooltipOrigin ?? undefined}
      />
    </div>
  );
}
