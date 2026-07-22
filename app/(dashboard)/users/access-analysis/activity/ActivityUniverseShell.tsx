"use client";

/**
 * ActivityUniverseShell.tsx — v2.7 Phase 39 (ACT-01 + ACT-04) + Phase 40
 * (DIM-07 + PERF-07).
 *
 * The activity universe: one node per extracted activity event (4,904,886
 * resident at rung L2), rendered by the production GraphCanvas2D in frozen
 * mode. Far zoom shows a deterministic uniform sample ≤ ~500k with an honest
 * label; zooming in flips to exact viewport detail via the setPointSet LOD
 * seam.
 *
 * Interaction (ACT-04): hover tooltip from resident ints + meta dicts (zero
 * fetches), click → ActivityDetailRail (on-demand event story + author
 * profile), lasso over the RENDERED subset with an honest selected count.
 *
 * Dimensions (DIM-07, Phase 40): the ActivityDimensionsPanel drives
 * group-by / color-by / strength over the rendered set. Strength morphs the
 * sample toward per-category organic centroids via the GPU transition seam
 * (activityMotion.morphTo — one CPU target upload per commit); MapClusterLabels
 * chips ride the morph. The region-LOD detail seam SUSPENDS while strength > 0
 * (morphed positions are not the embedding) and resumes at strength 0.
 * Ambient life (PERF-07): a decimated ~100k subset drifts via activityMotion;
 * prefers-reduced-motion → fully static, morphs snap.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/core/trpc";
import { GraphCanvas2D, type GraphCanvas2DHandle } from "../GraphCanvas2D";
import { LassoOverlay } from "../LassoOverlay";
import { MapClusterLabels, type GraphCanvasHandle } from "../MapClusterLabels";
import { OTHER_GREY, type LegendEntry } from "../bucketedColors";
import { GraphLoadingSkeleton } from "@/components/ui/GraphLoadingSkeleton";
import {
  useActivityUniversePayload,
  type ActivityUniverseData,
} from "./useActivityUniversePayload";
import { buildActivitySizes } from "./activitySizes";
import {
  gather,
  lodLabel,
  sampleStride,
  uniformSampleIndices,
  viewportIndices,
  type LodMode,
} from "./lodSample";
import {
  createActivityMotion,
  createActivityPhysicsStub,
  toStride3,
  type ActivityMotion,
} from "./activityMotion";
import {
  ACTIVITY_DIMENSIONS,
  activityDimensionById,
  activityDimensionCoverage,
  activityCoverageText,
  dimensionCardinality,
  dimensionLabels,
  type ActivityDimension,
} from "./activityDimensions";
import { buildGroupLayout, mixPositions, type GroupLayout } from "./activityGroupLayout";
import { buildDimColors, buildDimLegend } from "./activityColorBy";
import { indicesForMonth, sampleFullIndices } from "./activityTime";
import {
  ActivityDimensionsPanel,
  GROUP_BY_NONE,
  type ActivityDimensionOption,
} from "./ActivityDimensionsPanel";
import { installActivityTestBridge, setActivityTestState } from "./activityTestBridge";
import { monthLabel, resolveActivityHoverLabels, type ActivityHoverLabels } from "./activityEventLabels";
import { ActivityTooltip } from "./ActivityTooltip";
import { ActivityDetailRail } from "./ActivityDetailRail";

const LOD_DEBOUNCE_MS = 250;
/** Morph durations (ms): coalesced drag steps, final settle, group-by switch. */
const MORPH_DRAG_MS = 120;
const MORPH_COMMIT_MS = 250;
const MORPH_GROUP_SWITCH_MS = 600;

export function ActivityUniverseShell(): React.JSX.Element {
  const payload = useActivityUniversePayload();

  if (payload.status === "loading") {
    return <GraphLoadingSkeleton message="Loading activity universe…" estimateSeconds={8} />;
  }
  if (payload.status === "error") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-md border bg-card p-6 text-sm">
          <div className="mb-2 font-semibold text-foreground">Activity universe unavailable</div>
          <p className="text-muted-foreground">{payload.message}</p>
        </div>
      </div>
    );
  }
  return <ActivityUniverseCanvas data={payload.data} />;
}

/** Gather a Uint16 id column through a sample-index map (typed, no Float32 detour). */
function gatherIds(column: Uint16Array, indices: Uint32Array): Uint16Array {
  const out = new Uint16Array(indices.length);
  for (let i = 0; i < indices.length; i++) out[i] = column[indices[i]];
  return out;
}

function webGlRenderer(container: HTMLDivElement | null): string {
  const canvas = container?.querySelector("canvas");
  const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
  if (!gl) return "";
  const ext = gl.getExtension("WEBGL_debug_renderer_info") as
    | { UNMASKED_RENDERER_WEBGL: number }
    | null;
  return String(gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? "");
}

function ActivityUniverseCanvas({ data }: { data: ActivityUniverseData }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GraphCanvas2DHandle | null>(null);
  /** MapClusterLabels adapter — the retired GraphCanvas union's "2d" arm. */
  const labelsGraphRef = useRef<GraphCanvasHandle | null>(null);
  const { resolvedTheme } = useTheme();
  const bg = resolvedTheme === "dark" ? "#09090B" : "#FFFFFF";

  const positions = data.columns.positions as Float32Array;
  const monthId = data.columns.monthId as Uint16Array;
  const dicts = data.meta.dicts as Record<string, unknown>;
  const monthCount = (dicts.monthCount as number) ?? 1;
  const monthFloor = (dicts.monthFloor as string) ?? "";
  const coverage = data.meta.coverage;
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // Project GUID → display name for tooltips + project dim labels (957 rows).
  const projectNames = trpc.activityUniverse.projectNames.useQuery(undefined, {
    staleTime: Infinity,
  }).data;

  // ── DIM-07 state ──────────────────────────────────────────────────────────
  const [groupBy, setGroupBy] = useState<string>(GROUP_BY_NONE);
  const [colorBy, setColorBy] = useState<string>("module");
  const [strength, setStrength] = useState(0);
  const strengthRef = useRef(0);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const onPlayToggle = useCallback((): void => {
    if (reducedMotion) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    setSelectedMonth((current) =>
      current === null || current >= monthCount - 1 ? 0 : current,
    );
    setPlaying(true);
  }, [monthCount, playing, reducedMotion]);

  useEffect(() => {
    if (!playing || selectedMonth === null) return;
    if (selectedMonth >= monthCount - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setSelectedMonth((current) => (current === null ? 0 : current + 1)),
      1_000,
    );
    return () => clearTimeout(timer);
  }, [monthCount, playing, selectedMonth]);

  useEffect(() => {
    const pauseWhenHidden = (): void => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  const dimOption = useCallback(
    (d: ActivityDimension): ActivityDimensionOption => ({
      id: d.id,
      label: d.label,
      disabled: dimensionCardinality(d, dicts) === 0,
    }),
    [dicts],
  );
  const groupByOptions = useMemo(
    () => ACTIVITY_DIMENSIONS.filter((d) => d.groupBy).map(dimOption),
    [dimOption],
  );
  const colorByOptions = useMemo(() => ACTIVITY_DIMENSIONS.map(dimOption), [dimOption]);

  const groupDim = groupBy === GROUP_BY_NONE ? undefined : activityDimensionById(groupBy);
  const colorDim = activityDimensionById(colorBy) ?? ACTIVITY_DIMENSIONS[1];

  // Exact-month selection keeps the payload resident and changes only the
  // current full-index set. All stays explicit (null), never a fake month id.
  const activeFullIdx = useMemo(
    () => (selectedMonth === null ? null : indicesForMonth(monthId, selectedMonth)),
    [monthId, selectedMonth],
  );
  const activeCount = activeFullIdx?.length ?? data.count;

  // Rung-L2 far-zoom set composed with the active period.
  const sampleIdx = useMemo(
    () =>
      activeFullIdx === null
        ? uniformSampleIndices(data.count)
        : sampleFullIndices(activeFullIdx),
    [activeFullIdx, data.count],
  );

  // ── Corpus-stable colors + active-period legend ─────────────────────────
  const colorLabels = useMemo(
    () => dimensionLabels(colorDim, dicts, projectNames),
    [colorDim, dicts, projectNames],
  );
  const dimColors = useMemo(
    () => buildDimColors(data.columns[colorDim.column] as Uint16Array, colorDim, colorLabels),
    [data.columns, colorDim, colorLabels],
  );
  const activeColorIds = useMemo(
    () =>
      activeFullIdx === null
        ? (data.columns[colorDim.column] as Uint16Array)
        : gatherIds(data.columns[colorDim.column] as Uint16Array, activeFullIdx),
    [activeFullIdx, data.columns, colorDim],
  );
  const activeLegend = useMemo(
    () => buildDimLegend(activeColorIds, colorDim, colorLabels, dimColors.categoryColors),
    [activeColorIds, colorDim, colorLabels, dimColors.categoryColors],
  );
  const fullSizes = useMemo(() => buildActivitySizes(monthId, monthCount), [monthId, monthCount]);

  const sampledPositions = useMemo(() => gather(positions, sampleIdx, 2), [positions, sampleIdx]);
  const sampledColors = useMemo(
    () => gather(dimColors.colors, sampleIdx, 4),
    [dimColors, sampleIdx],
  );
  const sampledSizes = useMemo(() => gather(fullSizes, sampleIdx, 1), [fullSizes, sampleIdx]);
  // GraphCanvas2D init reads stride-3 positions from a PhysicsLayer; frozen stub.
  const physics = useMemo(
    () => createActivityPhysicsStub(toStride3(sampledPositions)),
    [sampledPositions],
  );
  const sampledPositionStats = useMemo(() => {
    let finite = sampledPositions.length > 0;
    let maxAbs = 0;
    for (let i = 0; i < sampledPositions.length; i++) {
      const value = sampledPositions[i];
      if (!Number.isFinite(value)) finite = false;
      maxAbs = Math.max(maxAbs, Math.abs(value));
    }
    return { finite, maxAbs };
  }, [sampledPositions]);

  // ── Group-by layout over the SAMPLE (morphs only run on the sample set) ───
  const groupLayout: GroupLayout | null = useMemo(() => {
    if (!groupDim) return null;
    const catIds = gatherIds(data.columns[groupDim.column] as Uint16Array, sampleIdx);
    return buildGroupLayout(sampledPositions, catIds, dimensionCardinality(groupDim, dicts));
  }, [groupDim, data.columns, sampleIdx, sampledPositions, dicts]);
  const groupLabels = useMemo(
    () => (groupDim ? dimensionLabels(groupDim, dicts, projectNames) : []),
    [groupDim, dicts, projectNames],
  );
  const groupCounts = useMemo(
    () => (groupLayout ? Array.from(groupLayout.counts) : []),
    [groupLayout],
  );
  // Chip dot colors match the dots only when the dots are colored by the same
  // dim; otherwise chips fall back to neutral grey (honest, not misleading).
  const chipLegend: LegendEntry[] = useMemo(() => {
    if (!groupDim || groupBy !== colorBy) return [];
    return groupLabels.map((label, c) => ({
      label,
      color: dimColors.categoryColors[c] ?? OTHER_GREY,
      count: 0,
    }));
  }, [groupDim, groupBy, colorBy, groupLabels, dimColors]);

  // Honest per-dim coverage (full column, sentinel-aware).
  const groupCoverageText = useMemo(
    () =>
      groupDim
        ? activityCoverageText(
            activityDimensionCoverage(data.columns[groupDim.column] as Uint16Array, groupDim),
          )
        : null,
    [groupDim, data.columns],
  );
  const colorCoverageText = useMemo(
    () =>
      activityCoverageText(
        activityDimensionCoverage(data.columns[colorDim.column] as Uint16Array, colorDim),
      ),
    [colorDim, data.columns],
  );

  // renderedIndex → fullIndex mapping for the CURRENT point set (hover/click/lasso seam).
  const renderedToFullRef = useRef<Uint32Array>(sampleIdx);
  const [lod, setLod] = useState<{ mode: LodMode; renderedCount: number }>({
    mode: "sample",
    renderedCount: sampleIdx.length,
  });

  // ACT-04 interaction state. Hover/selection hold FULL-set indices.
  const [hover, setHover] = useState<{
    fullIndex: number;
    screenXY: [number, number];
  } | null>(null);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [lassoActive, setLassoActive] = useState(false);
  const [selectedRendered, setSelectedRendered] = useState<number[]>([]);

  const clearSelection = useCallback((): void => {
    setSelectedRendered([]);
    handleRef.current?.setSelectedIndices?.([]);
    setActivityTestState({ selectedCount: 0 });
  }, []);

  const hoverLabels: ActivityHoverLabels | null = useMemo(
    () =>
      hover
        ? resolveActivityHoverLabels({
            index: hover.fullIndex,
            columns: data.columns,
            dicts: data.meta.dicts,
            projectNames,
          })
        : null,
    [hover, data.columns, data.meta.dicts, projectNames],
  );
  const detailLabels: ActivityHoverLabels | null = useMemo(
    () =>
      detailIndex !== null
        ? resolveActivityHoverLabels({
            index: detailIndex,
            columns: data.columns,
            dicts: data.meta.dicts,
            projectNames,
          })
        : null,
    [detailIndex, data.columns, data.meta.dicts, projectNames],
  );

  // Test bridge (Phase-41 re-baseline seam).
  useEffect(() => {
    const uninstall = installActivityTestBridge();
    return uninstall;
  }, []);
  useEffect(() => {
    setActivityTestState({
      residentCount: data.count,
      renderedCount: sampleIdx.length,
      lodMode: "sample",
      sampleStride: sampleStride(activeCount),
      temporalMode: selectedMonth === null ? "all" : "month",
      selectedMonth,
      monthCount,
      activeCount,
      playing,
      reducedMotion,
      positionsFinite: sampledPositionStats.finite,
      positionMaxAbs: sampledPositionStats.maxAbs,
    });
  }, [
    activeCount,
    data.count,
    monthCount,
    playing,
    reducedMotion,
    sampleIdx.length,
    sampledPositionStats,
    selectedMonth,
  ]);

  // ── PERF-07 motion layer (ambient + GPU morph seam) ───────────────────────
  const [handleReady, setHandleReady] = useState(false);
  const motionRef = useRef<ActivityMotion | null>(null);
  useEffect(() => {
    if (!handleReady) return;
    const handle = handleRef.current;
    if (!handle) return;
    const motion = createActivityMotion({
      handle,
      base2: sampledPositions,
      reducedMotion,
    });
    motionRef.current = motion;
    // Ambient runs only while the SAMPLE set is rendered (the layer is
    // per-rendered-set; the LOD effect stops/starts it across set flips).
    if (renderedToFullRef.current === sampleIdx) {
      motion.startAmbient();
      setActivityTestState({ ambientActive: motion.isAmbientRunning() });
    }
    return () => {
      motion.dispose();
      motionRef.current = null;
      setActivityTestState({ ambientActive: false });
    };
  }, [handleReady, sampledPositions, reducedMotion, sampleIdx]);

  // The temporal seam is an atomic point-set swap. The old per-set motion
  // layer has already been disposed/recreated by the effect above.
  useEffect(() => {
    if (!handleReady) return;
    const handle = handleRef.current;
    if (!handle) return;
    if (motionRef.current?.isAmbientRunning()) motionRef.current.stopAmbient();
    handle.setPointSet?.(sampledPositions, sampledColors, sampledSizes);
    renderedToFullRef.current = sampleIdx;
    setHover(null);
    setDetailIndex(null);
    setLassoActive(false);
    setSelectedRendered([]);
    handle.setSelectedIndices?.([]);
    setLod({ mode: "sample", renderedCount: sampleIdx.length });
    motionRef.current?.setBase(sampledPositions);
    motionRef.current?.startAmbient();
    setActivityTestState({
      renderedCount: sampleIdx.length,
      lodMode: "sample",
      sampleStride: sampleStride(activeCount),
      selectedCount: 0,
      activeCount,
      ambientActive: motionRef.current?.isAmbientRunning() ?? false,
    });
  }, [
    activeCount,
    handleReady,
    sampleIdx,
    sampledPositions,
    sampledSizes,
  ]);

  useEffect(() => {
    if (!handleReady) return;
    const update = (): void => {
      const stats = motionRef.current?.getStats();
      setActivityTestState({
        ambientTier: stats?.tier ?? 0,
        lastWindowFps: stats?.lastWindowFps ?? null,
        ambientActive: motionRef.current?.isAmbientRunning() ?? false,
      });
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [handleReady, sampledPositions]);

  // Morph commit: mix(rest, clump, s) into a reused buffer, ONE upload via
  // morphTo (GPU transition interpolates) — never per-rAF full-buffer writes.
  const morphBufRef = useRef<Float32Array | null>(null);
  const morphCountRef = useRef(0);
  const rafPendingRef = useRef(false);
  const groupLayoutRef = useRef<GroupLayout | null>(groupLayout);
  const restoreSampleRef = useRef<() => void>(() => {});
  const scheduleLodRef = useRef<() => void>(() => {});

  const commitMorph = useCallback(
    (durationMs: number): void => {
      const motion = motionRef.current;
      if (!motion) return;
      // Morphs are defined over the sample; restore it first if zoom-detail is up.
      if (renderedToFullRef.current !== sampleIdx) restoreSampleRef.current();
      const layout = groupLayoutRef.current;
      let buf = morphBufRef.current;
      if (!buf || buf.length !== sampledPositions.length) {
        buf = new Float32Array(sampledPositions.length);
        morphBufRef.current = buf;
      }
      const s = strengthRef.current / 100;
      if (layout && s > 0) mixPositions(buf, sampledPositions, layout.targets, s);
      else buf.set(sampledPositions);
      setHover(null);
      motion.morphTo(buf, durationMs);
      morphCountRef.current += 1;
      setActivityTestState({ morphCount: morphCountRef.current });
    },
    [sampledPositions, sampleIdx],
  );

  const onStrengthChange = useCallback(
    (v: number): void => {
      setStrength(v);
      strengthRef.current = v;
      setActivityTestState({ strength: v });
      // rAF-coalesced: many slider steps per frame → one target recompute.
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        commitMorph(strengthRef.current === 0 ? MORPH_COMMIT_MS : MORPH_DRAG_MS);
      });
    },
    [commitMorph],
  );

  const onGroupByChange = useCallback((id: string): void => {
    setGroupBy(id);
    setActivityTestState({ groupBy: id });
  }, []);
  const onColorByChange = useCallback((id: string): void => {
    setColorBy(id);
    setActivityTestState({ colorBy: id });
  }, []);

  // Group-by switch at active strength → recompute targets, one longer morph.
  useEffect(() => {
    groupLayoutRef.current = groupLayout;
    if (strengthRef.current > 0) commitMorph(MORPH_GROUP_SWITCH_MS);
  }, [groupLayout, commitMorph]);

  // Strength back at 0 → the LOD seam may resume (re-run once so region mode
  // can re-engage where the viewport already qualifies).
  useEffect(() => {
    if (strength === 0) scheduleLodRef.current();
  }, [strength]);

  // Color-by swap: recolor the CURRENT rendered set through the live mapping.
  useEffect(() => {
    if (!handleReady) return;
    handleRef.current?.setColors(gather(dimColors.colors, renderedToFullRef.current, 4));
  }, [dimColors, handleReady]);

  // Hover/click handlers via the canvas's ref-indirect seam. Rendered index →
  // full index through the CURRENT mapping.
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.setEventHandlers({
      onPointClick: (renderedIndex) => {
        if (renderedIndex === undefined) {
          setDetailIndex(null);
          return;
        }
        const full = renderedToFullRef.current[renderedIndex];
        if (full !== undefined) setDetailIndex(full);
      },
      onPointHover: (renderedIndex, screenXY) => {
        const full = renderedToFullRef.current[renderedIndex];
        if (full !== undefined) setHover({ fullIndex: full, screenXY });
      },
      onPointHoverEnd: () => setHover(null),
    });
    // Handler install is idempotent (ref-indirection) — safe on every render pass.
  });

  // Escape: close the detail rail, then clear the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (detailIndex !== null) setDetailIndex(null);
      else clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailIndex, clearSelection]);

  // LOD state machine: after pan/zoom settles, flip between the uniform sample
  // (region over cap) and exact viewport detail (region fits the cap). A set
  // switch invalidates rendered-index meaning → hover/selection are cleared.
  // SUSPENDED while strength > 0: on-screen positions are the morph, not the
  // embedding, so re-deriving a viewport subset would teleport points.
  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const switchTo = (
      indices: Uint32Array,
      mode: LodMode,
      p: Float32Array,
      c: Float32Array,
      s: Float32Array,
    ): void => {
      const handle = handleRef.current;
      if (!handle) return;
      // Stop ambient BEFORE the set flip — its working buffer is sample-length.
      motionRef.current?.stopAmbient();
      handle.setPointSet?.(p, c, s);
      renderedToFullRef.current = indices;
      setHover(null);
      setSelectedRendered([]);
      handle.setSelectedIndices?.([]);
      setLod({ mode, renderedCount: indices.length });
      if (mode === "sample") {
        motionRef.current?.setBase(p);
        motionRef.current?.startAmbient();
      }
      setActivityTestState({
        lodMode: mode,
        renderedCount: indices.length,
        selectedCount: 0,
        ambientActive: motionRef.current?.isAmbientRunning() ?? false,
      });
    };

    restoreSampleRef.current = (): void => {
      if (renderedToFullRef.current !== sampleIdx) {
        switchTo(sampleIdx, "sample", sampledPositions, sampledColors, sampledSizes);
      }
    };

    const applyLod = (): void => {
      const handle = handleRef.current;
      const el = containerRef.current;
      if (!handle || !el || disposed) return;
      if (strengthRef.current > 0) return; // morph owns positions — seam suspended
      const a = handle.screenToSpace([0, 0]);
      const b = handle.screenToSpace([el.clientWidth, el.clientHeight]);
      const bounds = {
        minX: Math.min(a[0], b[0]),
        maxX: Math.max(a[0], b[0]),
        minY: Math.min(a[1], b[1]),
        maxY: Math.max(a[1], b[1]),
      };
      const region = viewportIndices(positions, bounds, undefined, activeFullIdx ?? undefined);
      if (region) {
        switchTo(
          region,
          "region",
          gather(positions, region, 2),
          gather(dimColors.colors, region, 4),
          gather(fullSizes, region, 1),
        );
      } else if (renderedToFullRef.current !== sampleIdx) {
        restoreSampleRef.current();
      }
    };

    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyLod, LOD_DEBOUNCE_MS);
    };
    scheduleLodRef.current = schedule;
    div.addEventListener("wheel", schedule, { passive: true });
    div.addEventListener("pointerup", schedule);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      div.removeEventListener("wheel", schedule);
      div.removeEventListener("pointerup", schedule);
    };
  }, [
    activeFullIdx,
    positions,
    dimColors,
    fullSizes,
    sampleIdx,
    sampledPositions,
    sampledColors,
    sampledSizes,
  ]);

  // Lasso hit-test over the RENDERED subset (visible = selectable at L2).
  const lassoHitTest = useCallback((path: [number, number][]): number[] => {
    return handleRef.current?.findPointsInPolygon(path) ?? [];
  }, []);
  const onLassoComplete = useCallback((matched: number[]): void => {
    setSelectedRendered(matched);
    handleRef.current?.setSelectedIndices?.(matched);
    setActivityTestState({ selectedCount: matched.length });
    setLassoActive(false);
  }, []);

  const fmt = (n: number): string => n.toLocaleString("en-US");

  return (
    <div className="flex h-full min-h-0">
      <div className="relative min-w-0 flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0"
          data-testid="activity-universe-canvas"
        >
          <GraphCanvas2D
            containerRef={containerRef}
            physics={physics}
            nodeColors={sampledColors}
            nodeSizes={sampledSizes}
            backgroundColor={bg}
            onHandleReady={(h) => {
              handleRef.current = h;
              labelsGraphRef.current = { mode: "2d", handle: h };
              setHandleReady(true);
              setActivityTestState({ ready: true, renderer: webGlRenderer(containerRef.current) });
            }}
          />
        </div>
        <LassoOverlay active={lassoActive} hitTest={lassoHitTest} onComplete={onLassoComplete} />

        {/* Top-N category labels ride the morph (rest→footprint lerp on live strength). */}
        {groupLayout && groupDim ? (
          <MapClusterLabels
            graphRef={labelsGraphRef}
            mode="2d"
            centersX={groupLayout.centersX}
            centersY={groupLayout.centersY}
            restCentersX={groupLayout.restCentersX}
            restCentersY={groupLayout.restCentersY}
            radii={groupLayout.radii}
            counts={groupCounts}
            progress={() => strengthRef.current / 100}
            labels={groupLabels}
            legend={chipLegend}
            opacity={strength / 100}
          />
        ) : null}

        {/* Caption stack — muted, honest (LOD state, data floor, author coverage). */}
        <div className="pointer-events-none absolute left-4 top-3 z-10 space-y-0.5 font-mono text-[11px] text-muted-foreground">
          <div className="text-sm font-semibold text-foreground">Activity universe</div>
          <div>{lodLabel(lod.mode, lod.renderedCount, activeCount)}</div>
          <div>
            {fmt(activeCount)} events · data from {monthLabel(monthFloor, 0)}
          </div>
          <div>
            author resolution {(coverage.resolvedEmailRate * 100).toFixed(2)}% · unknown authors{" "}
            {(coverage.unknownAuthorRate * 100).toFixed(2)}%
          </div>
        </div>

        {/* Lasso toggle + honest selected count (visible = selectable at L2). */}
        <div className="absolute bottom-16 left-4 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (lassoActive) setLassoActive(false);
              else {
                clearSelection();
                setLassoActive(true);
              }
            }}
            aria-pressed={lassoActive}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
              lassoActive
                ? "border-primary bg-primary/10 text-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Lasso
          </button>
          {selectedRendered.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {fmt(selectedRendered.length)} of rendered {fmt(lod.renderedCount)} selected
              <button
                type="button"
                onClick={clearSelection}
                className="ml-2 rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent"
              >
                Clear
              </button>
            </span>
          )}
        </div>

        {/* Active color-by legend — honest counts over the selected period. */}
        <div
          data-testid="activity-color-legend"
          className="absolute right-4 top-3 z-10 rounded-md border bg-card/80 px-3 py-2 backdrop-blur-sm"
        >
          <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {colorDim.label}
          </div>
          <ul className="space-y-0.5">
            {activeLegend.map((e) => (
              <li key={e.label} className="flex items-center gap-2 text-[11px] text-foreground">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: e.colorHex }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{e.label}</span>
                <span className="font-mono text-muted-foreground">{fmt(e.count)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div
          data-testid="activity-time-scrubber"
          className="absolute bottom-3 left-4 right-4 z-10 flex items-center gap-3 rounded-md border bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm"
        >
          <button
            type="button"
            data-testid="activity-time-all"
            aria-pressed={selectedMonth === null}
            onClick={() => {
              setPlaying(false);
              setSelectedMonth(null);
            }}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              selectedMonth === null
                ? "border-primary bg-primary/10 text-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            All
          </button>
          <button
            type="button"
            data-testid="activity-time-play"
            onClick={onPlayToggle}
            disabled={reducedMotion}
            title={reducedMotion ? "Playback disabled by reduced motion" : undefined}
            className="rounded-md border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {playing ? "Pause" : "Play"}
          </button>
          <span
            data-testid="activity-time-label"
            className="w-20 shrink-0 text-xs font-medium text-foreground"
          >
            {selectedMonth === null ? "All months" : monthLabel(monthFloor, selectedMonth)}
          </span>
          <input
            type="range"
            data-testid="activity-time-range"
            aria-label="Activity month"
            aria-valuetext={monthLabel(monthFloor, selectedMonth ?? 0)}
            min={0}
            max={Math.max(0, monthCount - 1)}
            step={1}
            value={selectedMonth ?? 0}
            onChange={(event) => {
              setPlaying(false);
              setSelectedMonth(Number(event.target.value));
            }}
            className="min-w-24 flex-1 accent-primary"
          />
          <span
            data-testid="activity-time-count"
            className="shrink-0 font-mono text-[11px] text-muted-foreground"
          >
            {fmt(activeCount)} / {fmt(data.count)} events
          </span>
        </div>

        <ActivityTooltip
          anchorScreenXY={hover?.screenXY ?? null}
          labels={hoverLabels}
          canvasOriginXY={
            containerRef.current
              ? [
                  containerRef.current.getBoundingClientRect().left,
                  containerRef.current.getBoundingClientRect().top,
                ]
              : undefined
          }
        />

        {detailIndex !== null && detailLabels && (
          <ActivityDetailRail
            index={detailIndex}
            labels={detailLabels}
            unknownAuthorRate={coverage.unknownAuthorRate}
            onClose={() => setDetailIndex(null)}
          />
        )}
      </div>

      <ActivityDimensionsPanel
        groupByOptions={groupByOptions}
        colorByOptions={colorByOptions}
        groupBy={groupBy}
        colorBy={colorBy}
        strength={strength}
        onGroupByChange={onGroupByChange}
        onColorByChange={onColorByChange}
        onStrengthChange={onStrengthChange}
        groupCoverageText={groupCoverageText}
        groupByLabel={groupDim?.label ?? null}
        colorCoverageText={colorCoverageText}
        colorByLabel={colorDim.label}
        residentCount={activeCount}
        renderedCount={lod.renderedCount}
      />
    </div>
  );
}
