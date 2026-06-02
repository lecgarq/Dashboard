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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { ClusterLabels } from "./ClusterLabels";
import { GridAxisLabels } from "./GridAxisLabels";
import { activeCatalogDims, buildDominantClusters } from "./dominantClusters";
import { layoutClusterFootprintsOrganic } from "./clusterForceLayout";
import { buildRestLayout } from "./restLayout";
import { buildGridStructure } from "./gridLayout";
import { descriptorTarget, descriptorNodeCount, type LayoutDescriptor } from "./layoutDescriptor";
import { clusterColorBuffer } from "./clusterColors";
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
  const { values: sliderValues, getLiveValues } = useSliders();

  // LAYOUT DESCRIPTOR — the grouping STRUCTURE, computed once per active-SET change
  // (gated on activeKey), NOT per value drag. The renderer turns this + the live
  // slider value into per-frame positions (descriptorTarget) off the React path —
  // that decoupling is the lag fix. 0 active → organic rest cloud; 1 → packed blobs;
  // 2+ → cross-tab grid (strongest dim = columns, next = rows).
  const sliderDims = useMemo(() => curatedSliderDimensions(catalog), [catalog]);
  const activeDims = useMemo(
    () => activeCatalogDims(sliderDims, sliderValues),
    [sliderDims, sliderValues],
  );
  const activeKey = activeDims.map((d) => d.id).join(",");

  // Static organic resting cloud (soft shared-project clumps). Computed once per data set.
  const restXyz = useMemo(() => buildRestLayout(features), [features]);

  const layoutDescriptor = useMemo<LayoutDescriptor>(() => {
    if (activeDims.length === 0) return { kind: "rest", xyz: restXyz };
    if (activeDims.length === 1) {
      const clustering = buildDominantClusters(features, activeDims[0]);
      const footprints = layoutClusterFootprintsOrganic(clustering.counts);
      return { kind: "blob", dimId: activeDims[0].id, clustering, footprints };
    }
    const structure = buildGridStructure(features, activeDims[0], activeDims[1], {
      maxCols: 12,
      maxRows: 8,
    });
    return { kind: "grid", xId: activeDims[0].id, yId: activeDims[1].id, structure };
    // activeKey (stable string) gates recompute; activeDims identity changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, activeKey, restXyz]);

  // Per-frame layout target source handed to the renderer (keeps GraphCanvas pure —
  // it never imports layout math). Reads the LIVE slider value off a ref, so a value
  // drag flows through here in the rAF loop WITHOUT re-rendering this shell. The buffer
  // is reused across frames (descriptorTarget writes into it) — no per-frame allocation.
  const targetBufRef = useRef<Float32Array | null>(null);
  const layoutTarget = useCallback((): Float32Array => {
    const n = descriptorNodeCount(layoutDescriptor);
    if (!targetBufRef.current || targetBufRef.current.length !== n * 3) {
      targetBufRef.current = new Float32Array(n * 3);
    }
    return descriptorTarget(layoutDescriptor, getLiveValues(), targetBufRef.current);
  }, [layoutDescriptor, getLiveValues]);

  // Bumped when the cosmos.gl/three.js handle finishes async init so the
  // interaction layer can (re)wire hover/click/lasso against a live handle.
  const [rendererReady, setRendererReady] = useState(0);

  // Phase 4: semantic node coloring (used at rest). Default "role".
  const [colorMode, setColorMode] = useState<ColorMode>("role");

  // Per-node color ids derived from the grouping:
  //   blob          → color by the blob's attribute value
  //   grid (2 dims) → color by CELL so the grid reads as distinct tiles
  //   grid (3 active)→ color by the 3rd-strongest dim (the one NOT on an axis)
  //   rest          → null → semantic color-by-mode
  const colorIds = useMemo<{ ids: Int32Array; count: number } | null>(() => {
    if (layoutDescriptor.kind === "blob") {
      return { ids: layoutDescriptor.clustering.ids, count: layoutDescriptor.clustering.labels.length };
    }
    if (layoutDescriptor.kind === "grid") {
      if (activeDims.length >= 3) {
        const third = buildDominantClusters(features, activeDims[2]);
        return { ids: third.ids, count: third.labels.length };
      }
      const s = layoutDescriptor.structure;
      const ncols = s.cols.length;
      const ids = new Int32Array(s.colOf.length);
      for (let i = 0; i < ids.length; i++) ids[i] = s.rowOf[i] * ncols + s.colOf[i];
      return { ids, count: Math.max(1, s.cols.length * s.rows.length) };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutDescriptor, features, activeKey]);

  const nodeColors = useMemo<Float32Array>(
    () =>
      colorIds
        ? clusterColorBuffer(colorIds.ids, colorIds.count)
        : buildNodeColors(features, colorMode),
    [colorIds, features, colorMode],
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
              layoutTarget={layoutTarget}
            />
          </GraphInteractions>

          {/* 1-slider blob labels: pinned to each packed footprint center (2D only). */}
          {layoutDescriptor.kind === "blob" && (
            <ClusterLabels
              graphRef={graphRef}
              centersX={layoutDescriptor.footprints.cx}
              centersY={layoutDescriptor.footprints.cy}
              radii={layoutDescriptor.footprints.r}
              labels={layoutDescriptor.clustering.labels}
              counts={layoutDescriptor.clustering.counts}
              mode={mode}
            />
          )}

          {/* 2-slider grid: column headers (top) + row headers (left), tracking pitch. */}
          {layoutDescriptor.kind === "grid" && (
            <GridAxisLabels
              graphRef={graphRef}
              structure={layoutDescriptor.structure}
              getLiveValues={getLiveValues}
              xId={layoutDescriptor.xId}
              yId={layoutDescriptor.yId}
              mode={mode}
            />
          )}

          {/* Active grouping indicator. 1 slider = blobs by that attribute; 2+ =
              cross-tab grid (strongest = columns, next = rows; a 3rd dim → color). */}
          {layoutDescriptor.kind !== "rest" && mode === "2d" && (
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {layoutDescriptor.kind === "grid" ? (
                <span>
                  Grid: {activeDims[0]?.label} × {activeDims[1]?.label}
                  {activeDims.length >= 3 ? ` · color: ${activeDims[2]?.label}` : ""}
                  {layoutDescriptor.structure.foldedCols + layoutDescriptor.structure.foldedRows > 0
                    ? ` · +${layoutDescriptor.structure.foldedCols + layoutDescriptor.structure.foldedRows} folded into “Other”`
                    : ""}
                </span>
              ) : (
                <span>Grouping by: {activeDims[0]?.label ?? ""}</span>
              )}
            </div>
          )}

          {/* Floating premium glassmorphic mode switcher overlay */}
          <div className="absolute right-4 top-4 z-10">
            <button
              type="button"
              onClick={() => setMode(mode === "2d" ? "3d" : "2d")}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-foreground bg-background/60 hover:bg-background/95 backdrop-blur-md border border-border/80 shadow-md active:scale-95 transition-all duration-200"
              title={mode === "2d" ? "Switch to 3D spatial layout" : "Switch to 2D flat layout"}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span>{mode === "2d" ? "Go 3D" : "Go 2D"}</span>
            </button>
          </div>
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
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {!users ? "Loading access data…" : "Loading graph data…"}
      </div>
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
