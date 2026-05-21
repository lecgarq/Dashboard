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
import { trpc } from "@/lib/core/trpc";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { GraphInteractions } from "./GraphInteractions";
import { Toolbar } from "./Toolbar";
import { RightPanelStack } from "./RightPanelStack";
import {
  CONTROLS_STORAGE_KEY,
  DEFAULT_VALUES,
  DIMENSIONS,
  SliderProvider,
  type DimensionId,
} from "./SliderContext";
import { FilterProvider, useFilters } from "./FilterContext";
import { SelectionProvider, useSelection } from "./SelectionContext";
import { buildFeatureSnapshot } from "./featureSnapshot";
import { buildNodeColors, type ColorMode } from "./nodeColors";
import { filterSelectionByPredicate } from "./usePredicateEngine";
import { deriveSameUserEdges, toCosmosLinks, type SameUserEdge } from "./sameUserEdges";
import { computeLinkEmphasisColors, assertLinkArrays } from "./linkEmphasis";
import { installGraphTestBridge, setShellTestState, setEdgeTestState } from "./graphTestBridge";
import { createPhysicsLayer, type PhysicsLayer, type SimNode } from "./physicsLayer";
import { buildFeatureTargets } from "./featureTargets";
import { getDuckDbClient } from "./duckdbClient";
import { buildGraphArrowTables } from "./graphTables";
import { GRAPH_ANALYTICS_SOURCE_TABLES, registerGraphArrowTables } from "./graphSql";
import { ensurePositionsSchema } from "./positionsCache";
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

  // Bumped when the cosmos.gl/three.js handle finishes async init so the
  // interaction layer can (re)wire hover/click/lasso against a live handle.
  const [rendererReady, setRendererReady] = useState(0);

  // Phase 4: semantic node coloring. Default "external" (internal vs external) —
  // the clearest at-a-glance security signal. Dimming stays a MASK concern, so
  // the color buffer keeps alpha=1 and never encodes selection/filter state.
  const [colorMode, setColorMode] = useState<ColorMode>("external");
  const nodeColors = useMemo<Float32Array>(
    () => buildNodeColors(features, colorMode),
    [features, colorMode],
  );

  // Test-only: install + feed the observation bridge (no-op unless the flag is set).
  useEffect(() => {
    installGraphTestBridge();
  }, []);
  useEffect(() => {
    setShellTestState({
      physics,
      features,
      graphRef,
      mode,
      selection: lassoSelection,
      isolated: isolatedNodeIndex,
      colorMode,
      nodeColors,
    });
  }, [physics, features, graphRef, mode, lassoSelection, isolatedNodeIndex, colorMode, nodeColors]);

  const visibleSubset = useMemo<ReadonlySet<number> | null>(
    () => filterSelectionByPredicate(lassoSelection, features, activeFilters, searchQuery),
    [lassoSelection, features, activeFilters, searchQuery],
  );

  const edgeData = useMemo(() => deriveSameUserEdges(features.map((f) => f.nodeId)), [features]);
  const edges: SameUserEdge[] = edgeData.edges;
  const links = useMemo(() => toCosmosLinks(edges), [edges]);
  const baseLinkColors = useMemo(() => {
    const colors = computeLinkEmphasisColors(edges, new Set());
    assertLinkArrays(edges.length, links, colors);
    return colors;
  }, [edges, links]);
  useEffect(() => {
    setEdgeTestState({ derive: edgeData, nodeCount: features.length });
  }, [edgeData, features.length]);

  return (
    <div className="flex h-full flex-col">
      <Toolbar
        features={features}
        mode={mode}
        onModeChange={setMode}
        lassoActive={lassoActive}
        onLassoToggle={() => setLassoActive(!lassoActive)}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
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
            rendererReady={rendererReady}
            edges={edges}
          >
            <GraphCanvas
              ref={graphRef}
              physics={physics}
              nodeColors={nodeColors}
              mode={mode}
              onRendererReady={() => setRendererReady((v) => v + 1)}
              links={links}
              linkColors={baseLinkColors}
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
  const bulkUsersQuery = trpc.accDcGraph.bulkUsers.useQuery(undefined, {
    staleTime: 600_000,
  });
  const users = bulkUsersQuery.data;

  const [features, setFeatures] = useState<NodeFeatureSnapshot[] | null>(null);
  const [physics, setPhysics] = useState<PhysicsLayer | null>(null);
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [lassoActive, setLassoActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const graphRef = useRef<GraphCanvasHandle | null>(null);

  useEffect(() => {
    if (!users) return;
    let cancelled = false;
    let createdPhysics: PhysicsLayer | null = null;
    (async () => {
      try {
        // WS2: the redesigned graph owns its own data lifecycle. Register the
        // graph_* DuckDB tables from the DC snapshot (accDcGraph.bulkUsers)
        // before any reader query runs. Similarity/folder tables stay empty
        // here; the WS2 edge-computation step populates them next.
        const { connection } = await getDuckDbClient();
        if (cancelled) return;
        const tables = await buildGraphArrowTables({
          users,
          similarityInput: null,
          topology: null,
          folderRows: [],
        });
        if (cancelled) return;
        await registerGraphArrowTables(connection, tables);
        if (cancelled) return;

        // The positions cache table must exist before createPhysicsLayer reads
        // it (loadCachedPositions/savePositions assume the schema). As the render
        // integrator, the shell owns this init — idempotent CREATE IF NOT EXISTS.
        await ensurePositionsSchema(connection);
        if (cancelled) return;

        const nodeIds = await loadNodeIds();
        if (cancelled) return;
        const snapshot = await buildFeatureSnapshot({ nodeIds });
        if (cancelled) return;

        // Seed initial sliders from persisted controls so physics resumes the
        // user's last view immediately on reload (mirrors SliderContext hydration).
        // P1.1: default to the organic profile (normalized 0..1) so the first
        // settle is structural. localStorage (if present) overrides per-dim below,
        // mirroring SliderContext hydration so UI and physics stay in lockstep.
        let initialSliders: Record<string, number> = Object.fromEntries(
          DIMENSIONS.map((d) => [d.id, (DEFAULT_VALUES[d.id] ?? 0) / 100]),
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
        // Volumetric feature-anchored targets (P1) replace the former all-zero
        // targets that produced the globe. `snapshot` is aligned to `nodeIds`,
        // so target index === physics node index.
        const targets = buildFeatureTargets(snapshot);
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
  }, [users]);

  if (bulkUsersQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Failed to load access data: {bulkUsersQuery.error.message}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Failed to load graph data: {error}
      </div>
    );
  }

  if (!users || !features || !physics) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {!users ? "Loading access data…" : "Loading graph data…"}
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
