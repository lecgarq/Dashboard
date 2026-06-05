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
 * Owns local React state for `lassoActive` (mode is fixed to 3D), async-loads features +
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
  SliderProvider,
  migratePersistedSliders,
} from "./SliderContext";
import { FilterProvider, useFilters } from "./FilterContext";
import { SelectionProvider, useSelection } from "./SelectionContext";
import { buildFeatureSnapshot } from "./featureSnapshot";
import { buildNodeColors, type ColorMode } from "./nodeColors";
import { filterSelectionByPredicate } from "./usePredicateEngine";
import { deriveSameUserEdges, toCosmosLinks, type SameUserEdge } from "./sameUserEdges";
import { computeLinkEmphasisColors, assertLinkArrays } from "./linkEmphasis";
import { installGraphTestBridge, setShellTestState, setEdgeTestState } from "./graphTestBridge";
import { type PhysicsLayer, type SimNode } from "./physicsLayer";
import { createPhysicsLayerWorker } from "./physicsLayerWorker";
import { buildCatalogTargets } from "./catalogTargets";
import { buildCatalogWeights } from "./catalogWeights";
import { buildDimensionCatalog } from "./dimensionCatalog";
import { sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
import { curatedSliderDimensions } from "./curatedSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { getDuckDbClient } from "./duckdbClient";
import { GraphLoadingSkeleton } from "@/components/ui/GraphLoadingSkeleton";
import { buildGraphArrowTables } from "./graphTables";
import { buildGraphNodesFromUsers } from "./graphNodesFromUsers";
import { GRAPH_ANALYTICS_SOURCE_TABLES, registerGraphArrowTables } from "./graphSql";
import { ensurePositionsSchema } from "./positionsCache";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// Light-speed graph load: build node ids + features in pure JS from the hydrated
// bulk users, so the graph never boots DuckDB-WASM (~1-2s) on its critical path.
// ON by default; set NEXT_PUBLIC_ACC_JS_SNAPSHOT="0" to revert to the legacy
// in-browser-DuckDB path. DuckDB still lazy-loads for the deferred analytics.
const USE_JS_SNAPSHOT = process.env.NEXT_PUBLIC_ACC_JS_SNAPSHOT !== "0";

// ---------------------------------------------------------------------------
// Loader — pulls node IDs from DuckDB in deterministic order (legacy path)
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
  catalog: readonly CatalogDimension[];
  mode: "2d" | "3d";
  setMode: (m: "2d" | "3d") => void;
  lassoActive: boolean;
  setLassoActive: (b: boolean) => void;
  graphRef: React.RefObject<GraphCanvasHandle | null>;
}

function ShellBody({
  physics,
  features,
  catalog,
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

  // Phase 4: semantic node coloring (used at rest). Default "role".
  const [colorMode, setColorMode] = useState<ColorMode>("role");

  // 3D-only restore: color follows the toolbar color-mode (color-by-dimension),
  // never cluster-id. (The blob colorIds path is 2D-cluster-era and retired here.)
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
    // min-h-0 + overflow-hidden so the graph row fills the viewport instead of
    // growing to the (tall) RightPanelStack content height, which pushed the
    // cosmos canvas off-screen (nodes invisible below the fold).
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <Toolbar
        features={features}
        mode={mode}
        onModeChange={setMode}
        lassoActive={lassoActive}
        onLassoToggle={() => setLassoActive(!lassoActive)}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
      />
      <div className="relative flex flex-1 min-h-0">
        <div className="relative flex-1 min-h-0 min-w-0">
          <GraphInteractions
            physics={physics}
            features={features}
            mode={mode}
            graphRef={graphRef}
            activeFilters={activeFilters}
            searchQuery={searchQuery}
            lassoActive={lassoActive}
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
          catalog={catalog}
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
  const bulkUsersQuery = trpc.accDcGraph.bulkUsers.useQuery(
    { includePermissionSummary: true, includeActivityMix: true },
    { staleTime: 600_000 },
  );
  const users = bulkUsersQuery.data;

  const [features, setFeatures] = useState<NodeFeatureSnapshot[] | null>(null);
  const [physics, setPhysics] = useState<PhysicsLayer | null>(null);
  const [catalog, setCatalog] = useState<CatalogDimension[] | null>(null);
  // 3D-only: the 2D cosmos path stays in the repo but is never mounted here.
  const mode = "3d" as const;
  const setMode = (_m: "2d" | "3d"): void => { /* 3D-only: mode is fixed */ };
  const [lassoActive, setLassoActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const graphRef = useRef<GraphCanvasHandle | null>(null);

  useEffect(() => {
    if (!users) return;
    let cancelled = false;
    let createdPhysics: PhysicsLayer | null = null;
    (async () => {
      try {
        // Build the graph node set + aligned feature snapshots. Two paths:
        //  - JS (default): pure in-memory build from the hydrated `users` — no
        //    DuckDB-WASM boot on the critical path (the light-speed win).
        //  - legacy: register graph_* Arrow tables into DuckDB and read back.
        let nodeIds: string[];
        let snapshot: NodeFeatureSnapshot[];
        if (USE_JS_SNAPSHOT) {
          const built = buildGraphNodesFromUsers(users);
          nodeIds = built.nodeIds;
          snapshot = built.features;
        } else {
          // DuckDB-WASM init (~1-2s) and the Arrow-table build are independent —
          // buildGraphArrowTables needs only `users`, not the connection — so run
          // them concurrently to overlap WASM startup with table construction.
          const [{ connection }, tables] = await Promise.all([
            getDuckDbClient(),
            buildGraphArrowTables({
              users,
              similarityInput: null,
              topology: null,
              folderRows: [],
            }),
          ]);
          if (cancelled) return;
          await registerGraphArrowTables(connection, tables);
          if (cancelled) return;
          // Positions-cache schema must exist before the physics layer reads it.
          await ensurePositionsSchema(connection);
          if (cancelled) return;
          nodeIds = await loadNodeIds();
          if (cancelled) return;
          snapshot = await buildFeatureSnapshot({ nodeIds });
          if (cancelled) return;
        }

        const nodes: SimNode[] = nodeIds.map((id, index) => ({ id, index }));
        // Phase E: the catalog drives positioning. Targets/weights are built only
        // for the slider-surfaced + AVAILABLE catalog dims (no data → no force).
        // `snapshot` is aligned to `nodeIds`, so target index === physics node index.
        const catalog = buildDimensionCatalog(snapshot);
        const sliderDims = curatedSliderDimensions(catalog);
        const targetDimIds = sliderDims.map((d) => d.id);
        const targets = buildCatalogTargets(snapshot, sliderDims);
        const dimWeights = buildCatalogWeights(snapshot, sliderDims);
        // Default = all sliders 0 (spec decision #3); localStorage overrides per
        // known catalog id, mirroring SliderContext hydration so UI + physics stay
        // in lockstep. initialSliders values are normalized 0..1 (0 already is).
        const knownIds = sliderDimensionIds(catalog);
        const initialSliders: Record<string, number> = { ...catalogDefaultSliders(catalog) };
        try {
          if (typeof window !== "undefined") {
            const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as { sliders?: Record<string, number> };
              if (parsed.sliders) {
                const migrated = migratePersistedSliders(parsed.sliders, knownIds);
                for (const [id, v] of Object.entries(migrated)) {
                  if (id in initialSliders) initialSliders[id] = Math.max(0, Math.min(1, v / 100));
                }
              }
            }
          }
        } catch {
          /* ignore */
        }

        const layer = await createPhysicsLayerWorker(
          nodeIds,
          nodes,
          targets,
          targetDimIds,
          initialSliders,
          dimWeights,
          // JS path: skip the DuckDB-backed positions cache so the graph never
          // boots DuckDB-WASM on its critical path (layout settles fresh).
          !USE_JS_SNAPSHOT,
        );
        if (cancelled) {
          layer.dispose();
          return;
        }
        createdPhysics = layer;
        setFeatures(snapshot);
        setCatalog(catalog);
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

  if (!users || !features || !physics || !catalog) {
    return (
      <GraphLoadingSkeleton
        message={!users ? "Loading access data…" : "Building graph…"}
      />
    );
  }

  return (
    <SliderProvider physics={physics} catalog={catalog}>
      <FilterProvider>
        <SelectionProvider>
          <ShellBody
            physics={physics}
            features={features}
            catalog={catalog}
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
