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
  SliderProvider,
  migratePersistedSliders,
  useSliders,
} from "./SliderContext";
import { ClusterLabels } from "./ClusterLabels";
import {
  dominantCatalogDim,
  buildDominantClusters,
} from "./dominantClusters";
import { packClusterFootprints, packMemberPositions } from "./clusterPacking";
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
import { sliderDimensions, sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
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
  const { values: sliderValues } = useSliders();

  // DOMINANT-ATTRIBUTE CLUSTERING (the "with-labels" blobs). The attribute with the
  // highest slider defines the clusters; each cluster gets a distinct, pinned 2D
  // anchor (sunflower fill) so blobs always separate, and a readable label. These
  // memos only recompute when the DOMINANT dim changes (not on every slider tick),
  // since dominantCatalogDim returns the same dim object while it stays on top.
  const sliderDims = useMemo(() => sliderDimensions(catalog), [catalog]);
  const dominant = useMemo(
    () => dominantCatalogDim(sliderDims, sliderValues),
    [sliderDims, sliderValues],
  );
  const clustering = useMemo(
    () => (dominant ? buildDominantClusters(features, dominant) : null),
    [features, dominant],
  );
  // Deterministic blob footprints (non-overlapping circle pack) for the dominant dim.
  const footprints = useMemo(
    () => (clustering ? packClusterFootprints(clustering.counts) : null),
    [clustering],
  );

  // Tightness = the dominant slider's value, normalized 0..1.
  const tightness = useMemo(() => {
    if (!dominant) return 0;
    return Math.min(1, Math.max(0, (sliderValues[dominant.id] ?? 0) / 100));
  }, [dominant, sliderValues]);

  // Per-node packed positions (stride-3, z=0) — recompute on regroup OR tightness change.
  const clusterPackedPositions = useMemo(() => {
    if (!clustering || !footprints) return undefined;
    const n = clustering.ids.length;
    const xy = packMemberPositions(clustering.ids, footprints, tightness, n);
    const xyz = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { xyz[i * 3] = xy[i * 2]; xyz[i * 3 + 1] = xy[i * 2 + 1]; xyz[i * 3 + 2] = 0; }
    return xyz;
  }, [clustering, footprints, tightness]);

  // Bumped when the cosmos.gl/three.js handle finishes async init so the
  // interaction layer can (re)wire hover/click/lasso against a live handle.
  const [rendererReady, setRendererReady] = useState(0);

  // Phase 4: semantic node coloring. Default "role" — it yields many distinct
  // colors so the graph looks meaningfully encoded at first load ("external" is
  // monochrome when every user is the same internal/external class). Dimming
  // stays a MASK concern, so the color buffer keeps alpha=1 and never encodes
  // selection/filter state.
  const [colorMode, setColorMode] = useState<ColorMode>("role");
  const nodeColors = useMemo<Float32Array>(
    () =>
      clustering
        ? clusterColorBuffer(clustering.ids, clustering.labels.length)
        : buildNodeColors(features, colorMode),
    [clustering, features, colorMode],
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
              clusterPackedPositions={clusterPackedPositions}
            />
          </GraphInteractions>

          {/* Dominant-attribute cluster labels (2D, "with-labels"). Renders nothing
              when no attribute is dominant (all sliders 0) or in 3D. */}
          <ClusterLabels
            graphRef={graphRef}
            centersX={footprints?.cx ?? null}
            centersY={footprints?.cy ?? null}
            radii={footprints?.r ?? null}
            labels={clustering?.labels ?? []}
            counts={clustering?.counts ?? []}
            mode={mode}
          />
          
          {/* Active grouping indicator — makes the "strongest slider wins" rule visible. */}
          {dominant && mode === "2d" && (
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border border-border/80 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-md backdrop-blur-md">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Grouping by: {dominant.label}
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
        const sliderDims = sliderDimensions(catalog);
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
