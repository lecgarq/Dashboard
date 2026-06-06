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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/core/trpc";
import { GraphCanvas, type GraphCanvasHandle } from "./GraphCanvas";
import { GraphInteractions } from "./GraphInteractions";
import { Toolbar } from "./Toolbar";
import { RightPanelStack } from "./RightPanelStack";
import {
  CONTROLS_STORAGE_KEY,
  SliderProvider,
  migratePersistedSliders,
  useSliders,
} from "./SliderContext";
import { FilterProvider, useFilters } from "./FilterContext";
import { SelectionProvider, useSelection } from "./SelectionContext";
import { buildFeatureSnapshot } from "./featureSnapshot";
import { COLOR_MODE_LABELS, type ColorMode } from "./nodeColors";
import { filterSelectionByPredicate } from "./usePredicateEngine";
import { deriveSameUserEdges, toCosmosLinks, type SameUserEdge } from "./sameUserEdges";
import { computeLinkEmphasisColors, assertLinkArrays, GOSSAMER_LIGHT, GOSSAMER_DARK } from "./linkEmphasis";
import { activeGroupingDimension } from "./activeGrouping";
import { buildBucketedColors } from "./bucketedColors";
import { buildUserBlobDescriptor } from "./blobDescriptor";
import { descriptorTarget } from "./layoutDescriptor";
import { buildNodeSizes } from "./nodeSizes";
import { Legend } from "./Legend";
import { MapClusterLabels } from "./MapClusterLabels";
import { getDimension, type DimensionId } from "./dimensionRegistry";
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

  const { resolvedTheme } = useTheme();
  const { values: sliderValues, getLiveValues } = useSliders();

  // Active grouping dim = dominant slider (Role default). Catalog order gives a
  // stable tie-break.
  const groupingOrder = useMemo(() => catalog.map((d) => d.id), [catalog]);
  const groupingDim = useMemo(
    () => activeGroupingDimension(sliderValues, groupingOrder, "role"),
    [sliderValues, groupingOrder],
  );

  // The catalog dimension we cluster + position by. Falls back to role, then the
  // first catalog dim, so this is always defined.
  const groupDim = useMemo(
    () => catalog.find((d) => d.id === groupingDim) ?? catalog.find((d) => d.id === "role") ?? catalog[0],
    [catalog, groupingDim],
  );

  // LAYOUT: a "blob" descriptor that pins each value's members into a packed,
  // NON-OVERLAPPING footprint (sunflower disc). This is the project's proven way to
  // get separated clusters — the bare d3 per-dim force just piles everything into one
  // central disc. descriptorTarget() runs every frame off a ref (no React re-render);
  // the live slider value drives loose→tight, the GROUPING dim only changes on regroup.
  const blobDesc = useMemo(
    () => (groupDim ? buildUserBlobDescriptor(features, groupDim) : null),
    [features, groupDim],
  );
  const layoutOutRef = useRef<Float32Array>(new Float32Array(features.length * 3));
  const layoutTarget = useCallback((): Float32Array => {
    if (!blobDesc) return layoutOutRef.current;
    return descriptorTarget(blobDesc, getLiveValues(), layoutOutRef.current);
  }, [blobDesc, getLiveValues]);

  // Color follows the grouping dim unless the user overrides it via the toolbar.
  // The override is STICKY: once set it persists across grouping changes (drag a
  // different slider and color stays put) until the toolbar "Reset" clears it.
  const [colorOverride, setColorOverride] = useState<ColorMode | null>(null);
  const colorIsAuto = colorOverride === null;
  const autoColorMode: ColorMode = useMemo(() => {
    const d = getDimension(groupingDim as DimensionId);
    // If the dominant grouping dim isn't a registry (colorable) dim, color + labels
    // fall back to "role" while layout still groups by that dim — so chips may name
    // role clusters. Curated sliders (project/role/user) are all colorable, so this
    // path is effectively unreached today; widen the slider set with care.
    return d ? (groupingDim as ColorMode) : "role";
  }, [groupingDim]);
  const colorMode: ColorMode = colorOverride ?? autoColorMode;
  const setColorMode = (m: ColorMode): void => setColorOverride(m);
  const resetColor = (): void => setColorOverride(null);
  const groupedByLabel = COLOR_MODE_LABELS[autoColorMode] ?? autoColorMode;

  // Color-by-dimension with top-12 categorical buckets + a grey "Other"; the
  // legend model is derived from the same pass so chips/labels match exactly.
  const bucketed = useMemo(
    () => buildBucketedColors(features, colorMode, 12),
    [features, colorMode],
  );
  const nodeColors = bucketed.colors;
  const nodeSizes = useMemo<Float32Array>(() => buildNodeSizes(features), [features]);
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
    const opts = resolvedTheme === "dark" ? GOSSAMER_DARK : GOSSAMER_LIGHT;
    const colors = computeLinkEmphasisColors(edges, new Set(), opts);
    assertLinkArrays(edges.length, links, colors);
    return colors;
  }, [edges, links, resolvedTheme]);
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
        groupedByLabel={groupedByLabel}
        colorIsAuto={colorIsAuto}
        onColorReset={resetColor}
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
              nodeSizes={nodeSizes}
              mode={mode}
              // Infographic map: a per-frame layout target pins each value's members
              // into a packed, non-overlapping footprint (descriptor seam). The renderer
              // eases toward it with the GPU sim paused, so clusters are STRUCTURALLY
              // separated — not left to the d3 force (which piles everything centrally).
              layoutTarget={layoutTarget}
              onRendererReady={() => setRendererReady((v) => v + 1)}
              links={links}
              linkColors={baseLinkColors}
            />
          </GraphInteractions>
          <Legend entries={bucketed.legend} />
          <MapClusterLabels
            graphRef={graphRef}
            mode={mode}
            centersX={blobDesc ? blobDesc.footprints.cx : null}
            centersY={blobDesc ? blobDesc.footprints.cy : null}
            labels={blobDesc ? blobDesc.clustering.labels : []}
            legend={bucketed.legend}
          />
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
  // 2D-default infographic map; 3D remains reachable via the toolbar toggle.
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
        // catalogDefaultSliders is in 0..100 (SliderContext scale); physics wants 0..1.
        // localStorage overrides per known catalog id, mirroring SliderContext hydration
        // so UI + physics stay in lockstep. The override loop also divides by 100.
        const knownIds = sliderDimensionIds(catalog);
        const initialSliders: Record<string, number> = Object.fromEntries(
          Object.entries(catalogDefaultSliders(catalog)).map(([k, v]) => [k, v / 100]),
        );
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
