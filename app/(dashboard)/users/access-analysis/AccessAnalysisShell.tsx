"use client";

/**
 * AccessAnalysisShell.tsx — Phase 4-02 Task 3
 *
 * Final composition for the redesigned access-analysis page:
 *
 *   <SliderProvider physics={physics}>
 *     <FilterProvider>
 *       <SelectionProvider>
 *         <Toolbar />
 *         <GraphInteractions(GraphCanvas)>
 *         <RightPanelStack />
 *
 * Owns local React state for `mode` and `lassoActive`, async-loads features +
 * physics on mount, and computes the still-visible subset of any lasso selection
 * via `filterSelectionByPredicate` so SelectionPanel always reflects the right
 * post-filter members (CONTEXT.md visible-subset rule).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { GraphInteractions } from "./GraphInteractions";
import { Toolbar } from "./Toolbar";
import { RightPanelStack } from "./RightPanelStack";
import {
  CONTROLS_STORAGE_KEY,
  DIMENSIONS,
  SliderProvider,
  type DimensionId,
} from "./SliderContext";
import { FilterProvider, useFilters } from "./FilterContext";
import { SelectionProvider, useSelection } from "./SelectionContext";
import { buildFeatureSnapshot } from "./featureSnapshot";
import { filterSelectionByPredicate } from "./usePredicateEngine";
import { createPhysicsLayer, type PhysicsLayer, type SimNode, type TargetArrays } from "./physicsLayer";
import { getDuckDbClient } from "./duckdbClient";
import { GRAPH_ANALYTICS_SOURCE_TABLES } from "./graphSql";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// ---------------------------------------------------------------------------
// Loader — pulls node IDs from DuckDB in deterministic order
// ---------------------------------------------------------------------------

async function loadNodeIds(): Promise<string[]> {
  const { connection } = await getDuckDbClient();
  const view = GRAPH_ANALYTICS_SOURCE_TABLES.userProjects;
  const sql = `
    SELECT DISTINCT concat(user_id, '::', project_id) AS node_id
    FROM ${view}
    ORDER BY 1
  `;
  const table = await connection.query(sql);
  const rows = table.toArray() as Array<{ node_id: string }>;
  return rows.map((r) => String(r.node_id));
}

/** Build empty per-dim target arrays (all zeros). Physics layer drives forces
 * via slider strengths only — chrome can introduce real per-dim targets later. */
function makeEmptyTargets(n: number, dimNames: readonly string[]): TargetArrays {
  const out: TargetArrays = {};
  for (const d of dimNames) {
    out[d] = {
      x: new Float32Array(n),
      y: new Float32Array(n),
      z: new Float32Array(n),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inner body — consumes contexts, renders graph + interactions + right panel
// ---------------------------------------------------------------------------

interface ShellBodyProps {
  physics: PhysicsLayer;
  features: ReadonlyArray<NodeFeatureSnapshot>;
  mode: "2d" | "3d";
  setMode: (m: "2d" | "3d") => void;
  lassoActive: boolean;
  setLassoActive: (b: boolean) => void;
  graphRef: React.RefObject<GraphCanvasHandle | null>;
}

function ShellBody({
  physics,
  features,
  mode,
  setMode,
  lassoActive,
  setLassoActive,
  graphRef,
}: ShellBodyProps): React.JSX.Element {
  const { activeFilters, searchQuery, drillDown } = useFilters();
  const { isolatedNodeIndex, lassoSelection, setLasso, setIsolated } = useSelection();

  const visibleSubset = useMemo<ReadonlySet<number> | null>(
    () => filterSelectionByPredicate(lassoSelection, features, activeFilters, searchQuery),
    [lassoSelection, features, activeFilters, searchQuery],
  );

  // Constant white colors as a safe default — render layer accepts any RGBA buffer.
  const nodeColors = useMemo<Float32Array>(() => {
    const arr = new Float32Array(features.length * 4);
    for (let i = 0; i < features.length; i++) {
      arr[i * 4 + 0] = 0.62;
      arr[i * 4 + 1] = 0.72;
      arr[i * 4 + 2] = 0.93;
      arr[i * 4 + 3] = 1;
    }
    return arr;
  }, [features.length]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        features={features}
        mode={mode}
        onModeChange={setMode}
        lassoActive={lassoActive}
        onLassoToggle={() => setLassoActive(!lassoActive)}
      />
      <div className="relative flex flex-1">
        <div className="relative flex-1">
          <GraphInteractions
            physics={physics}
            features={features}
            mode={mode}
            graphRef={graphRef}
            activeFilters={activeFilters}
            searchQuery={searchQuery}
            lassoActive={lassoActive && mode === "2d"}
            onLassoComplete={(indices) => {
              setLasso(indices);
              setLassoActive(false);
            }}
            isolatedNodeIndex={isolatedNodeIndex}
            onIsolate={setIsolated}
            lassoSelection={lassoSelection}
            drillDown={drillDown}
          >
            <GraphCanvas
              ref={graphRef}
              physics={physics}
              nodeColors={nodeColors}
              mode={mode}
            />
          </GraphInteractions>
        </div>
        <RightPanelStack
          features={features}
          visibleSelectedIndices={visibleSubset}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outer shell — handles async load + provider composition
// ---------------------------------------------------------------------------

export function AccessAnalysisShell(): React.JSX.Element {
  const [features, setFeatures] = useState<NodeFeatureSnapshot[] | null>(null);
  const [physics, setPhysics] = useState<PhysicsLayer | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [lassoActive, setLassoActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const graphRef = useRef<GraphCanvasHandle | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdPhysics: PhysicsLayer | null = null;
    (async () => {
      try {
        const nodeIds = await loadNodeIds();
        if (cancelled) return;
        const snapshot = await buildFeatureSnapshot({ nodeIds });
        if (cancelled) return;

        // Seed initial sliders from persisted controls so physics resumes the
        // user's last view immediately on reload (mirrors SliderContext hydration).
        let initialSliders: Record<string, number> = Object.fromEntries(
          DIMENSIONS.map((d) => [d.id, 0]),
        );
        try {
          if (typeof window !== "undefined") {
            const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as {
                sliders?: Partial<Record<DimensionId, number>>;
              };
              if (parsed.sliders) {
                for (const d of DIMENSIONS) {
                  const v = parsed.sliders[d.id];
                  if (typeof v === "number" && Number.isFinite(v)) {
                    initialSliders[d.id] = Math.max(0, Math.min(1, v / 100));
                  }
                }
              }
            }
          }
        } catch {
          /* ignore */
        }

        const nodes: SimNode[] = nodeIds.map((id, index) => ({ id, index }));
        const dimNames = DIMENSIONS.map((d) => d.id);
        const targets = makeEmptyTargets(nodeIds.length, dimNames);
        const layer = await createPhysicsLayer(
          nodeIds,
          nodes,
          targets,
          dimNames,
          initialSliders,
        );
        if (cancelled) {
          layer.dispose();
          return;
        }
        createdPhysics = layer;
        setFeatures(snapshot);
        setPhysics(layer);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || "Failed to load graph data");
        }
      }
    })();
    return () => {
      cancelled = true;
      createdPhysics?.dispose();
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Failed to load graph data: {error}
      </div>
    );
  }

  if (!features || !physics) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading graph data…
      </div>
    );
  }

  return (
    <SliderProvider physics={physics}>
      <FilterProvider>
        <SelectionProvider>
          <ShellBody
            physics={physics}
            features={features}
            mode={mode}
            setMode={setMode}
            lassoActive={lassoActive}
            setLassoActive={setLassoActive}
            graphRef={graphRef}
          />
        </SelectionProvider>
      </FilterProvider>
    </SliderProvider>
  );
}
