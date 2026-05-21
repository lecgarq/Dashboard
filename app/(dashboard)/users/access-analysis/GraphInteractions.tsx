"use client";

/**
 * GraphInteractions.tsx — Phase 4-01 Task 3.
 *
 * Wraps GraphCanvas with the interaction layer:
 *   - Subscribes click/hover events on the active mode's handle (2D = cosmos.gl,
 *     3D = three.js raycaster) via setEventHandlers.
 *   - Owns local state: hoveredIndex, tooltipAnchor.
 *   - Routes click → onIsolate prop. Routes background click + Esc → onIsolate(null).
 *   - Renders the LassoOverlay (only when mode==='2d' AND lassoActive).
 *   - Renders the NodeTooltip portal anchored to the hovered node's screen pos.
 *   - Calls usePredicateEngine — the single physics.setMask channel for all of
 *     filter/search/lasso/drill/isolate.
 *
 * Search debounce: 100ms via a useDebounce hook (RESEARCH Pitfall 4 — avoid
 * remasking 10k nodes on every keystroke).
 */

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { PhysicsLayer } from "./physicsLayer";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { GraphCanvasHandle } from "./GraphCanvas";
import type { GraphCanvas2DHandle } from "./GraphCanvas2D";
import { usePredicateEngine } from "./usePredicateEngine";
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
    lassoSelection,
    drillDown,
    rendererReady,
    edges,
    children,
  } = props;

  // ---- Local UI state ---------------------------------------------------
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipAnchor, setTooltipAnchor] = useState<[number, number] | null>(null);

  // Stable handler refs so we install once per mode change, never per render.
  const onIsolateRef = useRef(onIsolate);
  useEffect(() => {
    onIsolateRef.current = onIsolate;
  }, [onIsolate]);

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
        setTooltipAnchor(screenPos);
      },
      onPointHoverEnd: (): void => {
        setHoveredIndex(null);
        setTooltipAnchor(null);
      },
    };
    handle.setEventHandlers(handlers);
    // Test-only: expose the SAME production handlers so the bridge's fallback
    // hover/click path invokes them directly (no separate fake path).
    setInteractionTestState({ handlers });
    // No cleanup needed — handlersRef inside the handle simply gets replaced on
    // the next mount or remains noop on unmount.
    // rendererReady: re-run once the async renderer handle exists.
  }, [graphRef, mode, rendererReady]);

  // Test-only: mirror hover/tooltip state into the observation bridge.
  useEffect(() => {
    setInteractionTestState({ hoveredIndex, tooltipAnchor });
  }, [hoveredIndex, tooltipAnchor]);

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

  // ---- 2D-only lasso overlay ---------------------------------------
  const graph2DHandle: GraphCanvas2DHandle | null =
    graphRef.current && graphRef.current.mode === "2d"
      ? graphRef.current.handle
      : null;

  const lassoEnabled = lassoActive && mode === "2d";
  const hoveredFeature = hoveredIndex !== null ? features[hoveredIndex] ?? null : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {children}
      {lassoEnabled ? (
        <LassoOverlay
          active={true}
          graphHandle={graph2DHandle}
          onComplete={onLassoComplete}
        />
      ) : null}
      <NodeTooltip anchorScreenXY={tooltipAnchor} feature={hoveredFeature} />
    </div>
  );
}
