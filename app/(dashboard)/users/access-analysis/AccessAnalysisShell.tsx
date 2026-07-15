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
import type { ColorMode } from "./nodeColors";
import { filterSelectionByPredicate, buildApertureValueResolvers } from "./usePredicateEngine";
import { deriveSameUserEdges, toCosmosLinks, type SameUserEdge } from "./sameUserEdges";
import { computeLinkEmphasisColors, assertLinkArrays, GOSSAMER_LIGHT, GOSSAMER_DARK } from "./linkEmphasis";
import { activeGroupingDimension } from "./activeGrouping";
import { buildBucketedColors, bucketedColorsFromClustering } from "./bucketedColors";
import { buildDominantClusters } from "./dominantClusters";
import { buildUserBlobDescriptor } from "./blobDescriptor";
import { descriptorTarget } from "./layoutDescriptor";
import { clusterMemberCentroids } from "./clusterPacking";
import { buildNodeSizes } from "./nodeSizes";
import { Legend } from "./Legend";
import { MapClusterLabels } from "./MapClusterLabels";
import { SimilarityWebOverlay } from "./SimilarityWebOverlay";
import { mapEdgesToIndices, computeEdgeColors } from "./similarityWeb";
import { NeighborMatchesPanel } from "./NeighborMatchesPanel";
import { getDimension, type DimensionId } from "./dimensionRegistry";
import {
  defaultGroupBy,
  GENERAL_GROUP_ID,
  groupByDimensions,
  primaryGroupLabel,
} from "./groupByDimensions";
import { resolveMapGrouping } from "./mapGrouping";
import { installGraphTestBridge, setShellTestState, setEdgeTestState } from "./graphTestBridge";
import { type PhysicsLayer, type SimNode } from "./physicsLayer";
import { createPhysicsLayerWorker } from "./physicsLayerWorker";
import { catalogAnchorTarget, createStaticLayer } from "./staticLayer";
import { ACC_3D_GRAPH_ENABLED } from "./graphModeFlag";
import { buildCatalogTargets } from "./catalogTargets";
import { buildCatalogWeights } from "./catalogWeights";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";
import { GROUPING_DEFAULT, sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
import { curatedSliderDimensions } from "./curatedSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";
import { getDuckDbClient } from "./duckdbClient";
import { GraphLoadingSkeleton } from "@/components/ui/GraphLoadingSkeleton";
import { buildGraphArrowTables } from "./graphTables";
import { buildGraphNodesFromUsers } from "./graphNodesFromUsers";
import { GRAPH_ANALYTICS_SOURCE_TABLES, registerGraphArrowTables } from "./graphSql";
import { ensurePositionsSchema } from "./positionsCache";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// Single-flip rollback for the similarity web. OFF (=0) → overlay never mounts and
// the query never fires. Flag-OFF projector map only (the 3D physics graph keeps its
// same-user lines). Default ON.
const SIM_WEB_ENABLED = process.env.NEXT_PUBLIC_ACC_SIM_WEB !== "0" && !ACC_3D_GRAPH_ENABLED;

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

// Exported for unit tests that assert the flag-gated renderer seam (the
// embedding-map vs blob-layout wiring) without booting the full async shell.
export function ShellBody({
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
  const {
    values: sliderValues,
    getLiveValues,
    setSliderValue,
    resetAll,
    isPreviewActive,
  } = useSliders();

  // The common path starts at the synthetic General baseline. Group into and Color both
  // establish one primary anchor; advanced Dimensions strengths remain intentional extras.
  const [groupBy, setGroupBy] = useState<string>(() => defaultGroupBy(catalog));
  const primaryLayoutIdRef = useRef<string>(GENERAL_GROUP_ID);
  const [layoutCatalog, setLayoutCatalog] = useState<readonly CatalogDimension[]>(catalog);
  useEffect(() => setLayoutCatalog(catalog), [catalog]);
  const onCatalogReady = useCallback((fullCatalog: readonly CatalogDimension[]): void => {
    setLayoutCatalog(fullCatalog);
  }, []);
  // `strength` reads the COMMITTED (rAF-throttled ~60ms) slider value on purpose — it
  // only drives the color-mode/labels switch, which shouldn't strobe mid-drag. The
  // MOTION reads the live value via getLiveValues() inside layoutTarget (every frame),
  // so the morph itself is immediate; do NOT switch this to a live read (it would put
  // per-frame React churn back on the critical path).
  const strength = sliderValues[groupBy] ?? 0;
  const activatePrimary = useCallback(
    (next: string): void => {
      if (next === GENERAL_GROUP_ID) {
        resetAll();
        primaryLayoutIdRef.current = GENERAL_GROUP_ID;
        return;
      }
      const previous = primaryLayoutIdRef.current;
      if (previous === next) return;
      const live = getLiveValues();
      const carry = previous === GENERAL_GROUP_ID
        ? GROUPING_DEFAULT
        : (live[previous] ?? 0);
      if (previous !== GENERAL_GROUP_ID) setSliderValue(previous, 0);
      setSliderValue(next, carry);
      primaryLayoutIdRef.current = next;
    },
    [getLiveValues, resetAll, setSliderValue],
  );
  const onGroupByChange = useCallback(
    (next: string): void => {
      activatePrimary(next);
      setGroupBy(next);
    },
    [activatePrimary],
  );

  // Flag-ON: dominant slider dim (unchanged). Flag-OFF: the picker selection.
  const groupingOrder = useMemo(() => layoutCatalog.map((d) => d.id), [layoutCatalog]);
  const groupingDim = useMemo(
    () => activeGroupingDimension(sliderValues, groupingOrder, "role"),
    [sliderValues, groupingOrder],
  );
  const activeLayoutId = useMemo(
    () => activeGroupingDimension(sliderValues, groupingOrder, GENERAL_GROUP_ID),
    [sliderValues, groupingOrder],
  );
  const activeLayoutDimension = useMemo(
    () => layoutCatalog.find((dimension) => dimension.id === activeLayoutId),
    [activeLayoutId, layoutCatalog],
  );
  const activeLayoutLabel = primaryGroupLabel(
    activeLayoutId,
    activeLayoutDimension?.label ?? activeLayoutId,
  );
  const grouping = useMemo(
    () =>
      resolveMapGrouping({
        flagOn: ACC_3D_GRAPH_ENABLED,
        groupBy,
        groupingDim,
        strength,
        hasDim: (id) => getDimension(id as DimensionId) != null,
      }),
    [groupBy, groupingDim, strength],
  );

  // The catalog dimension we cluster + position by (always defined: falls back to role).
  const groupDim = useMemo(
    () =>
      catalog.find((d) => d.id === grouping.groupDimId) ??
      catalog.find((d) => d.id === "role") ??
      catalog[0],
    [catalog, grouping.groupDimId],
  );

  const embeddingXyz = useMemo(() => physics.getPositions(), [physics]);

  // The parked flag-ON path keeps its packed descriptor. The default frozen map
  // now reads catalog targets/weights directly below.
  const blobDesc = useMemo(() => {
    if (!ACC_3D_GRAPH_ENABLED || !groupDim) return null;
    return buildUserBlobDescriptor(features, groupDim);
  }, [features, groupDim]);

  const layoutOutRef = useRef<Float32Array>(new Float32Array(features.length * 3));
  const layoutTarget = useCallback((): Float32Array => {
    if (!ACC_3D_GRAPH_ENABLED) {
      return catalogAnchorTarget({
        baseline: embeddingXyz,
        targets: physics.getTargets(),
        dimWeights: physics.getDimWeights(),
        live: getLiveValues(),
        order: groupingOrder,
        out: layoutOutRef.current,
      });
    }
    if (!blobDesc) return embeddingXyz;
    return descriptorTarget(blobDesc, getLiveValues(), layoutOutRef.current);
  }, [blobDesc, embeddingXyz, getLiveValues, groupingOrder, physics]);

  // Per-cluster REST centroids — the centroid of each cluster's members at the morph's
  // s=0 (scatter) endpoint. The cluster chips lerp these → footprint centers by the live
  // strength (MapClusterLabels) so a chip rides its cluster through the whole morph
  // instead of pinning to the empty clump destination until full strength. Recomputed
  // only on a regroup (descriptor change), never per frame.
  const blobRestCenters = useMemo(
    () =>
      blobDesc
        ? clusterMemberCentroids(blobDesc.clustering.ids, blobDesc.loose, blobDesc.footprints)
        : null,
    [blobDesc],
  );
  // Live morph progress for the chips: read the SAME slider value the node morph reads
  // (descriptorTarget keys off blobDesc.dimId), live every frame, so chip and dots stay
  // locked. Raw 0..1 — liveLabelCenter applies the easeMorph curve.
  const labelProgress = useCallback(
    () => (blobDesc ? (getLiveValues()[blobDesc.dimId] ?? 0) / 100 : 0),
    [blobDesc, getLiveValues],
  );

  // Color is an independent picker over the full catalog aperture (Phase 25,
  // dimensionIdSpace id-space), defaulting to Role; it is never "auto" — the
  // dropdown always drives color.
  const [colorOverride, setColorOverride] = useState<string | null>("role");
  const colorIsAuto = colorOverride === null;
  const autoColorMode: ColorMode = grouping.colorMode;
  const colorMode: string = colorOverride ?? autoColorMode;
  const setColorMode = useCallback((next: string): void => {
    activatePrimary(next);
    setColorOverride(next);
  }, [activatePrimary]);
  const resetColor = useCallback((): void => {
    activatePrimary("role");
    setColorOverride("role");
  }, [activatePrimary]);

  // Node colors + legend. Sources, in priority order:
  //  1. The color picker (catalog id) resolves to a CatalogDimension and colors by
  //     the SAME banded clustering Group-by uses (valueKeyLabel + dimensionBands via
  //     buildDominantClusters) → BANDED categorical swatches + one shared legend for
  //     EVERY aperture dim. The sequential-ramp path is never taken (DIM-02).
  //  2. Actively grouping on the projector map (flag-OFF, strength > 0): color by the
  //     dominant clustering that drives the blobs + footprint labels.
  //  3. Otherwise (rest scatter → cluster galaxy, or the flag-ON graph): the auto mode.
  // NOTE: colorOverride is never null now (inits to "role", resets to "role"), so
  // branch 1 always wins — branches 2–3 (auto-follow / cluster galaxy) are currently
  // unreachable. Kept for the parked flag-ON 3D route; prune in a future cleanup.
  const colorDim = useMemo(
    () => (colorOverride ? (catalog.find((d) => d.id === colorOverride) ?? null) : null),
    [catalog, colorOverride],
  );
  const colorLabel = primaryGroupLabel(colorMode, colorDim?.label ?? colorMode);
  const bucketed = useMemo(() => {
    if (colorDim) {
      return bucketedColorsFromClustering(buildDominantClusters(features, colorDim), 12);
    }
    // Unknown/stale picker id (no catalog dim): legacy registry path, safe fallback.
    if (colorOverride) return buildBucketedColors(features, colorOverride as ColorMode, 12);
    if (!ACC_3D_GRAPH_ENABLED && grouping.showLabels && blobDesc) {
      return bucketedColorsFromClustering(blobDesc.clustering, 12);
    }
    return buildBucketedColors(features, autoColorMode, 12);
  }, [features, colorDim, colorOverride, autoColorMode, blobDesc, grouping.showLabels]);
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
      // Projector grouping so an e2e can verify each name chip rides its cluster's
      // live on-screen centroid (only set when actively grouping with labels shown).
      projectorIds: grouping.showLabels && blobDesc ? blobDesc.clustering.ids : null,
      projectorLabels: grouping.showLabels && blobDesc ? blobDesc.clustering.labels : null,
    });
  }, [physics, features, graphRef, mode, lassoSelection, isolatedNodeIndex, colorMode, nodeColors, grouping.showLabels, blobDesc]);

  // Banded aperture labels for the filter (Phase 25 DIM-04): one resolver per
  // aperture dim, shared by the mask predicate, the visible-subset rule, and
  // the Toolbar's value chips so a filter tier always matches its blob/swatch.
  const valueResolvers = useMemo(
    () => buildApertureValueResolvers(catalog, features),
    [catalog, features],
  );

  const visibleSubset = useMemo<ReadonlySet<number> | null>(
    () => filterSelectionByPredicate(lassoSelection, features, activeFilters, searchQuery, valueResolvers),
    [lassoSelection, features, activeFilters, searchQuery, valueResolvers],
  );

  // Similarity neighbors of the clicked node — fetched on-demand (flag-OFF embedding
  // map only). The clicked nodeId drives the admin-gated query; results are joined
  // back to cosmos indices so the predicate engine can light the closest matches and
  // the panel can list them. Disabled (and never rendered) on the flag-ON 3D graph.
  const clickedNodeId = isolatedNodeIndex !== null ? features[isolatedNodeIndex]?.nodeId : null;
  const neighborsQuery = trpc.accDcGraph.instanceNeighbors.useQuery(
    { nodeId: clickedNodeId ?? "" },
    { enabled: !!clickedNodeId && !ACC_3D_GRAPH_ENABLED, staleTime: 600_000 },
  );
  const indexByNodeId = useMemo(() => {
    const m = new Map<string, number>();
    features.forEach((f, i) => m.set(f.nodeId, i));
    return m;
  }, [features]);

  // Similarity web (flag-OFF projector map): the always-on curved edge mesh. The
  // server returns the capped, strongest edge set keyed by nodeId; we map to cosmos
  // indices once, then color by community (endpoint blend) × similarity strength.
  const simEdgesQuery = trpc.accDcGraph.similarityEdges.useQuery(undefined, {
    enabled: SIM_WEB_ENABLED,
    staleTime: 600_000,
  });
  const simWeb = useMemo(
    () => mapEdgesToIndices(simEdgesQuery.data?.edges ?? [], indexByNodeId),
    [simEdgesQuery.data, indexByNodeId],
  );
  const simPaint = useMemo(
    () => computeEdgeColors(simWeb, nodeColors, resolvedTheme === "dark" ? "dark" : "light"),
    [simWeb, nodeColors, resolvedTheme],
  );

  const neighborIndices = useMemo(() => {
    const s = new Set<number>();
    for (const nb of neighborsQuery.data ?? []) {
      const idx = indexByNodeId.get(nb.nodeId);
      if (idx !== undefined) s.add(idx);
    }
    return s;
  }, [neighborsQuery.data, indexByNodeId]);

  // Same-user edges are a physics-graph (flag-ON) affordance only. On the flag-OFF
  // embedding map we render NO edges: edges/links/baseLinkColors stay EMPTY so
  // neither GraphCanvas (setLinks is guarded by length>0) nor GraphInteractions
  // (computeLinkEmphasisColors([]) → empty, setLinkColors([]) is a link no-op)
  // ever draws a link.
  const edgeData = useMemo(
    () =>
      ACC_3D_GRAPH_ENABLED
        ? deriveSameUserEdges(features.map((f) => f.nodeId))
        : {
            edges: [] as SameUserEdge[],
            malformedCount: 0,
            duplicateCount: 0,
            distinctValidUsers: 0,
            distinctUsersWithEdges: 0,
          },
    [features],
  );
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
        catalog={catalog}
        groupedByLabel={activeLayoutLabel}
        groupedByDimId={activeLayoutId === GENERAL_GROUP_ID ? "" : activeLayoutId}
        colorIsAuto={colorIsAuto}
        onColorReset={resetColor}
        show3DToggle={ACC_3D_GRAPH_ENABLED}
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
            neighborIndices={ACC_3D_GRAPH_ENABLED ? null : neighborIndices}
            lassoSelection={lassoSelection}
            drillDown={drillDown}
            valueResolvers={valueResolvers}
            rendererReady={rendererReady}
            edges={edges}
          >
            <GraphCanvas
              ref={graphRef}
              physics={physics}
              nodeColors={nodeColors}
              nodeSizes={nodeSizes}
              mode={mode}
              // Flag-ON (3D physics graph): a per-frame layout target pins each value's
              // members into a packed, non-overlapping footprint (descriptor seam). The
              // renderer eases toward it with the GPU sim paused, so clusters are
              // STRUCTURALLY separated — not left to the d3 force (which piles centrally).
              //
              // Flag-OFF (similarity projector): the static layer owns the exact embedding
              // plus catalog targets/weights. layoutTarget selects one strongest anchor field
              // and the renderer eases toward it while Cosmos remains frozen.
              layoutTarget={layoutTarget}
              gpuSimulation={ACC_3D_GRAPH_ENABLED ? undefined : false}
              onRendererReady={() => setRendererReady((v) => v + 1)}
              links={links}
              linkColors={baseLinkColors}
            />
          </GraphInteractions>
          <Legend entries={bucketed.legend} />
          {/* Cluster chips name the packed-blob footprints. Shown whenever we're grouping
              (flag-ON always; flag-OFF once Grouping strength > 0) and faded in with
              strength so they appear as the blobs form. At rest (strength 0) showLabels is
              false → null centers / empty labels → MapClusterLabels renders nothing. */}
          <MapClusterLabels
            graphRef={graphRef}
            mode={mode}
            centersX={grouping.showLabels && blobDesc ? blobDesc.footprints.cx : null}
            centersY={grouping.showLabels && blobDesc ? blobDesc.footprints.cy : null}
            restCentersX={grouping.showLabels && blobRestCenters ? blobRestCenters.cx : null}
            restCentersY={grouping.showLabels && blobRestCenters ? blobRestCenters.cy : null}
            radii={grouping.showLabels && blobDesc ? blobDesc.footprints.r : null}
            counts={grouping.showLabels && blobDesc ? blobDesc.clustering.counts : undefined}
            progress={labelProgress}
            labels={grouping.showLabels && blobDesc ? blobDesc.clustering.labels : []}
            legend={bucketed.legend}
            opacity={ACC_3D_GRAPH_ENABLED ? 1 : Math.min(1, strength / 50)}
          />
          {SIM_WEB_ENABLED && (
            <SimilarityWebOverlay
              graphRef={graphRef}
              mode={mode}
              src={simWeb.src}
              dst={simWeb.dst}
              bucket={simPaint.bucket}
              palette={simPaint.palette}
              // Faint when scattered, clearer as the grouping tightens — same lever
              // that fades in the cluster labels. Fades fully out during the morph.
              opacity={Math.min(1, 0.5 + (strength / 100) * 0.5)}
              isMorphing={isPreviewActive}
            />
          )}
          {!ACC_3D_GRAPH_ENABLED && isolatedNodeIndex !== null && (
            <NeighborMatchesPanel
              centerName={
                features[isolatedNodeIndex]?.userName ??
                features[isolatedNodeIndex]?.nodeId ??
                "Selected"
              }
              matches={neighborsQuery.data ?? []}
              indexByNodeId={indexByNodeId}
              features={features}
              // Profile for the centre node is already the top RightPanelStack
              // layer whenever isolatedNodeIndex !== null. Re-assert isolate on the
              // same node (the click setter) to ensure that profile is shown — and
              // to restore it if a different overlay was raised in the interim.
              onOpenProfile={() => setIsolated(isolatedNodeIndex)}
              // Re-isolate to the chosen match: opens its profile + relights its
              // own neighbors (query re-fires on the new clickedNodeId).
              onSelectMatch={(idx) => setIsolated(idx)}
            />
          )}
        </div>
        <RightPanelStack
          features={features}
          physics={physics}
          catalog={catalog}
          visibleSelectedIndices={visibleSubset}
          groupBy={groupBy}
          onGroupByChange={onGroupByChange}
          activeLayoutId={activeLayoutId}
          activeLayoutLabel={activeLayoutLabel}
          colorLabel={colorLabel}
          onCatalogReady={onCatalogReady}
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

  // Precomputed 2D similarity-embedding coords (admin-gated). Only fetched on the
  // flag-OFF path, where they feed a STATIC PhysicsLayer instead of the d3-force
  // worker; harmless (disabled) when the 3D physics graph is enabled.
  const embeddingQuery = trpc.accDcGraph.instanceEmbedding.useQuery(undefined, {
    staleTime: 600_000,
    enabled: !ACC_3D_GRAPH_ENABLED,
  });

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
        // Phase 26: first paint and SliderProvider own only the 19-dimension aperture.
        // The 176 generated actions are built inside the lazy Catalog preview instead.
        const catalog = buildStructuralDimensions();
        const sliderDims = curatedSliderDimensions(catalog);
        const targetDims = [...sliderDims];
        const targetIds = new Set(targetDims.map((dim) => dim.id));
        for (const dim of groupByDimensions(catalog)) {
          if (!targetIds.has(dim.id)) targetDims.push(dim);
        }
        const targetDimIds = targetDims.map((d) => d.id);
        const targets = buildCatalogTargets(snapshot, targetDims);
        const dimWeights = buildCatalogWeights(snapshot, targetDims);
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

        // EMBEDDING MAP (flag-OFF default): feed the precomputed 2D coords through
        // a frozen PhysicsLayer so the renderer/rAF/mask/color pipeline runs unchanged
        // without constructing the d3 worker. It retains catalog targets/weights for the
        // strongest-wins layoutTarget above; updateSliders remains simulation-inert.
        // Joins embedding coords to nodeIds by nodeId.
        if (!ACC_3D_GRAPH_ENABLED) {
          const emb = embeddingQuery.data;
          if (!emb) return; // wait for embedding to load (effect re-runs on data)
          const byId = new Map(emb.map((e) => [e.nodeId, e]));
          const xy = new Float32Array(nodeIds.length * 2);
          let missing = 0;
          for (let i = 0; i < nodeIds.length; i++) {
            const e = byId.get(nodeIds[i]);
            if (e) { xy[i * 2] = e.x; xy[i * 2 + 1] = e.y; }
            else { xy[i * 2] = 0; xy[i * 2 + 1] = 0; missing++; }
            // Stamp the embedding cluster so the "Cluster" color mode (color ==
            // spatial group, the projector look) can read it off the snapshot.
            if (snapshot[i]) snapshot[i].cluster = e && e.cluster != null ? e.cluster : null;
          }
          if (missing > 0) console.warn(`[embedding] ${missing} nodes missing coords (origin fallback)`);
          const layer = createStaticLayer(nodeIds, xy, targets, dimWeights);
          createdPhysics = layer;
          if (cancelled) return;
          setFeatures(snapshot);
          setCatalog(catalog);
          setPhysics(layer);
          return;
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
  }, [users, embeddingQuery.data]);

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
