"use client";

/**
 * ActivityUniverseShell.tsx — v2.7 Phase 39 (ACT-01 + ACT-04) + Phase 40
 * (DIM-07 + PERF-07).
 *
 * The activity universe: one node per extracted activity event (4,904,886
 * resident at rung L2), rendered by the production GraphCanvas2D in frozen
 * mode. Far zoom shows a deterministic uniform sample ≤ ~200k with an honest
 * label; zooming in flips to exact viewport detail via the setPointSet LOD
 * seam.
 *
 * Interaction (ACT-04): hover tooltip from resident ints + meta dicts (zero
 * fetches), click → ActivityDetailRail (on-demand event story + author
 * profile), user search, bounded same-author links, and lasso over the
 * RENDERED subset with an honest selected count.
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

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
  LOD_CAP,
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
import { sampleFullIndices } from "./activityTime";
import {
  buildActivityAuthorLinks,
  buildAuthorMatch,
  buildProjectSelectionMask,
  filterActivityIndices,
  scanMagnetPhase,
  snapshotRenderedSelection,
} from "./activityGraphData";
import { ProjectPicker } from "@/app/(dashboard)/access-analysis/components/ProjectPicker";
import type { ProjectOption } from "@/lib/acc/projectFilter";
import { groupProjectOptions } from "@/lib/acc/projectGroups";
import mtyAllowlist from "@/lib/acc/mty-allowlist.json";
import { useOrgDirectoryPeople } from "@/app/(dashboard)/users/useMergedAccUsers";
import {
  ActivityDimensionsPanel,
  GROUP_BY_NONE,
  type ActivityDimensionOption,
  type ActivityFilterGroup,
} from "./ActivityDimensionsPanel";
import { MONTH_ABBR, weekDate, weekLabel } from "@/lib/acc/activityWeeks";
import { installActivityTestBridge, setActivityTestState } from "./activityTestBridge";
import { monthLabel, resolveActivityHoverLabels, type ActivityHoverLabels } from "./activityEventLabels";
import { ActivityUniverse3D, type ActivityUniverse3DHandle } from "./ActivityUniverse3D";
import { buildActivityDepth } from "./activityDepth";
import { dequantizePosition3 } from "@/lib/acc/positions3Quant";
import { ActivityTooltip } from "./ActivityTooltip";
import { ActivityDetailRail } from "./ActivityDetailRail";
import { ActivitySelectionPanel } from "./ActivitySelectionPanel";
import { buildSelectionBreakdown } from "./activitySelectionBreakdown";

const LOD_DEBOUNCE_MS = 250;
/** Morph durations (ms): coalesced drag steps, final settle, group-by switch. */
const MORPH_DRAG_MS = 120;
const MORPH_COMMIT_MS = 250;
const MORPH_GROUP_SWITCH_MS = 600;
/**
 * Full-corpus morphs: each commit mixes ~10M floats and uploads ~39MB, so
 * rAF-coalescing alone still chugs. Above this point count, slider-drag
 * commits fire on a trailing throttle instead of every frame.
 */
const MORPH_BIG_SET_POINTS = 1_000_000;
const MORPH_BIG_SET_THROTTLE_MS = 250;
/** Magnetic hover: snap to the nearest rendered node within this screen radius. */
const MAGNET_RADIUS_PX = 32;
/** Temporal set swaps fade through instead of hard-cutting (reduced motion snaps). */
const TEMPORAL_FADE_MS = 650;
/** Camera flight to a picked node (2D zoom tween / 3D orbit flight). */
const FOCUS_MS = 700;
const MTY_PROJECT_IDS = new Set<string>(mtyAllowlist);

/**
 * Magnetic preselect halo — an animated DOM ring anchored to the snapped node.
 * cosmos's hovered-point ring is a static shader with no tween seam, so the
 * cinematic "ping" on snap-to-new-node is a keyed overlay element that replays
 * this keyframe each time `hover.fullIndex` changes (reduced motion suppresses
 * the overlay; the cosmos ring still marks focus).
 */
const HOVER_RING_CSS = `
@keyframes auHoverPing {
  from { transform: translate(-50%, -50%) scale(1.75); opacity: 0; }
  55%  { opacity: 0.95; }
  to   { transform: translate(-50%, -50%) scale(1); opacity: 0.95; }
}
.au-hover-ring {
  width: 26px; height: 26px; border-radius: 9999px;
  border: 1.5px solid #3b82f6;
  box-shadow: 0 0 10px 1px rgba(59, 130, 246, 0.45);
  animation: auHoverPing 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
}
.activity-universe-root:has([data-testid="activity-dimensions-hover-zone"]:is(:hover, :focus-within))
  [data-testid="activity-color-legend"] {
  right: 276px;
}
`;

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

/**
 * Per-dict-slot event counts over a resident id column, keyed by display label.
 * Labels are NOT unique across slots — the role dict carries "Unknown" twice
 * (the slot-0 sentinel plus a real role of that name) — so same-label slots SUM
 * instead of overwriting, which would report one slot's count for both.
 */
function countBySlot(
  column: ArrayLike<number>,
  dict: readonly string[],
): Map<string, number> {
  const perSlot = new Uint32Array(Math.max(1, dict.length));
  for (let i = 0; i < column.length; i++) {
    const slot = column[i];
    if (slot < perSlot.length) perSlot[slot] += 1;
  }
  const map = new Map<string, number>();
  dict.forEach((label, i) => map.set(label, (map.get(label) ?? 0) + perSlot[i]));
  return map;
}

/**
 * Filter options are the DISTINCT labels: the selection Set is label-keyed, so
 * a duplicated dict label would render twice and make `selected.size` never
 * reach `options.length` — permanently defeating the all-selected fast path
 * that keeps the 4.9M-row filter on its null branch. The MASK still walks the
 * full dict, so every slot sharing a selected label is kept.
 */
const distinctLabels = (dict: readonly string[]): string[] => Array.from(new Set(dict));

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
  /** 3D imperative handle (projection lasso + controls freeze), null in 2D. */
  const handle3Ref = useRef<ActivityUniverse3DHandle | null>(null);
  /**
   * The 3D overlay div. SIBLING of containerRef (stacked above it, z-10), so
   * pointer events over the 3D canvas never bubble through containerRef — the
   * 3D magnet/click listeners must attach HERE, not on the 2D container.
   */
  const overlay3Ref = useRef<HTMLDivElement | null>(null);
  /** MapClusterLabels adapter — the retired GraphCanvas union's "2d" arm. */
  const labelsGraphRef = useRef<GraphCanvasHandle | null>(null);
  const { resolvedTheme } = useTheme();
  const bg = resolvedTheme === "dark" ? "#09090B" : "#FFFFFF";

  const positions = data.columns.positions as Float32Array;
  const monthId = data.columns.monthId as Uint16Array;
  const authorId = data.columns.authorId as Uint32Array;
  const dicts = data.meta.dicts as Record<string, unknown>;
  const monthCount = (dicts.monthCount as number) ?? 1;
  const monthFloor = (dicts.monthFloor as string) ?? "";
  const coverage = data.meta.coverage;

  // ── Scrubber granularity: weeks when the payload carries the weekId column
  // (builder joins the source event timestamps), months on older artifacts.
  const weekIdCol = data.columns.weekId as Uint16Array | undefined;
  const weekFloor = typeof dicts.weekFloor === "string" ? dicts.weekFloor : "";
  const weekCount = typeof dicts.weekCount === "number" ? dicts.weekCount : 0;
  const weekUnknownCount =
    typeof dicts.weekUnknownCount === "number" ? dicts.weekUnknownCount : 0;
  const byWeek = Boolean(weekIdCol && weekFloor && weekCount > 0);
  const timeId = byWeek ? (weekIdCol as Uint16Array) : monthId;
  const timeCount = byWeek ? weekCount : monthCount;
  const timeUnit = byWeek ? "week" : "month";
  const bucketLabel = useCallback(
    (i: number): string => (byWeek ? weekLabel(weekFloor, i) : monthLabel(monthFloor, i)),
    [byWeek, weekFloor, monthFloor],
  );

  // Month anchors for the week track: the first week that opens each new month.
  // Year shown only where it changes (and on the first tick) — ~20 labels have
  // to share one track without colliding.
  const monthTicks = useMemo(() => {
    if (!byWeek) return [] as Array<{ week: number; label: string }>;
    const out: Array<{ week: number; label: string }> = [];
    let prevMonth = -1;
    for (let w = 0; w < timeCount; w++) {
      const d = weekDate(weekFloor, w);
      if (!d || d.getUTCMonth() === prevMonth) continue;
      prevMonth = d.getUTCMonth();
      const mon = MONTH_ABBR[prevMonth];
      const newYear = prevMonth === 0 || out.length === 0;
      out.push({ week: w, label: newYear ? `${mon} ’${String(d.getUTCFullYear()).slice(2)}` : mon });
    }
    return out;
  }, [byWeek, weekFloor, timeCount]);

  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  // The slider/label/play controls read `selectedBucket` immediately; the heavy
  // filter→sample→point-set-swap chain reads the DEFERRED value so a fast scrub
  // renders one settle-time swap (and one fade) instead of a full universe
  // rebuild per integer tick.
  const deferredBucket = useDeferredValue(selectedBucket);
  const [playing, setPlaying] = useState(false);
  const [authorQuery, setAuthorQuery] = useState("");
  const deferredAuthorQuery = useDeferredValue(authorQuery);
  const [appliedAuthorQuery, setAppliedAuthorQuery] = useState("");
  const authorFilterPending =
    authorQuery !== deferredAuthorQuery || appliedAuthorQuery !== deferredAuthorQuery;
  const authorLabels = useMemo(
    () => (Array.isArray(dicts.author) ? dicts.author.map(String) : []),
    [dicts],
  );
  const authorMatch = useMemo(
    () => buildAuthorMatch(authorLabels, deferredAuthorQuery),
    [authorLabels, deferredAuthorQuery],
  );

  // Google-directory photos for the user-search suggestion avatars, keyed by
  // lowercase email. Deduped/cached via React Query — no extra network when the
  // directory is already resident from another surface.
  const orgPeople = useOrgDirectoryPeople();
  const authorPhotoByEmail = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of orgPeople) if (p.photoUrl) map.set(p.email.toLowerCase(), p.photoUrl);
    return map;
  }, [orgPeople]);

  // Project GUID → display name for tooltips + project dim labels (957 rows).
  const projectNamesQuery = trpc.activityUniverse.projectNames.useQuery(undefined, {
    staleTime: Infinity,
  });
  const projectNames = projectNamesQuery.data;

  // ── Project filter (the /access-analysis picker, driving the resident set) ──
  const projectIdCol = data.columns.projectId as Uint32Array;
  const projectDict = useMemo(
    () => (Array.isArray(dicts.project) ? dicts.project.map(String) : []),
    [dicts],
  );
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    () => new Set(Array.isArray(dicts.project) ? dicts.project.map(String) : []),
  );
  const projectMask = useMemo(
    () => buildProjectSelectionMask(projectDict, selectedProjects),
    [projectDict, selectedProjects],
  );
  const projectDim = activityDimensionById("project");
  const projectOptions: ProjectOption[] = useMemo(() => {
    if (!projectDim) return [];
    const labels = dimensionLabels(projectDim, dicts, projectNames);
    return projectDict
      .map((guid, i) => ({ id: guid, name: labels[i] ?? guid }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectDim, projectDict, dicts, projectNames]);
  const projectCounts = useMemo(
    () => countBySlot(projectIdCol, projectDict),
    [projectDict, projectIdCol],
  );
  const projectGroups = useMemo(
    () => groupProjectOptions(projectOptions, MTY_PROJECT_IDS),
    [projectOptions],
  );

  // ── Categorical narrowing filters (role, activity type, month) ────────────
  // All three ride the same slot-mask machinery as projects: the dict IS the
  // slot→label mapping, an all-selected set yields a null mask (fast path).
  const roleIdCol = data.columns.roleId as Uint16Array;
  const verbIdCol = data.columns.verbId as Uint16Array;
  const roleDict = useMemo(
    () => (Array.isArray(dicts.role) ? dicts.role.map(String) : []),
    [dicts],
  );
  const verbDict = useMemo(
    () => (Array.isArray(dicts.verb) ? dicts.verb.map(String) : []),
    [dicts],
  );
  // Month labels are generated (no dict array) but are unique and index-aligned
  // to monthId, so they key the same label-based mask builder.
  const monthDict = useMemo(
    () => Array.from({ length: monthCount }, (_, i) => monthLabel(monthFloor, i)),
    [monthCount, monthFloor],
  );

  const roleLabels = useMemo(() => distinctLabels(roleDict), [roleDict]);
  const verbLabels = useMemo(() => distinctLabels(verbDict), [verbDict]);

  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(() => new Set(roleDict));
  const [selectedVerbs, setSelectedVerbs] = useState<Set<string>>(() => new Set(verbDict));
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(() => new Set(monthDict));

  const roleMask = useMemo(
    () => buildProjectSelectionMask(roleDict, selectedRoles),
    [roleDict, selectedRoles],
  );
  const verbMask = useMemo(
    () => buildProjectSelectionMask(verbDict, selectedVerbs),
    [verbDict, selectedVerbs],
  );
  const monthMask = useMemo(
    () => buildProjectSelectionMask(monthDict, selectedMonths),
    [monthDict, selectedMonths],
  );

  const roleCounts = useMemo(() => countBySlot(roleIdCol, roleDict), [roleDict, roleIdCol]);
  const verbCounts = useMemo(() => countBySlot(verbIdCol, verbDict), [verbDict, verbIdCol]);
  const monthCounts = useMemo(() => countBySlot(monthId, monthDict), [monthDict, monthId]);

  // ── Experimental 2D/3D view toggle ───────────────────────────────────────
  // 3D is a static space-time cube OVERLAY (x/y = embedding, z = month) fed by
  // the same sampled buffers as the 2D canvas; the 2D graph stays mounted
  // underneath so flipping back is instant and no state is lost.
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  // Ref mirror for long-lived listeners (the LOD seam) that must not re-attach
  // on every view flip.
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  // ── DIM-07 state ──────────────────────────────────────────────────────────
  const [groupBy, setGroupBy] = useState<string>(GROUP_BY_NONE);
  const [colorBy, setColorBy] = useState<string>("module");
  const [legendFilter, setLegendFilter] = useState<{ dimId: string; label: string } | null>(null);
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
    setSelectedBucket((current) =>
      current === null || current >= timeCount - 1 ? 0 : current,
    );
    setPlaying(true);
  }, [timeCount, playing, reducedMotion]);

  useEffect(() => {
    if (!playing || selectedBucket === null) return;
    if (selectedBucket >= timeCount - 1) {
      setPlaying(false);
      return;
    }
    // ~4x more buckets at week granularity → a faster step keeps a full
    // playthrough watchable instead of a 90-second crawl.
    const timer = setTimeout(
      () => setSelectedBucket((current) => (current === null ? 0 : current + 1)),
      byWeek ? 450 : 1_000,
    );
    return () => clearTimeout(timer);
  }, [byWeek, timeCount, playing, selectedBucket]);

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
  const colorLabels = useMemo(
    () => dimensionLabels(colorDim, dicts, projectNames),
    [colorDim, dicts, projectNames],
  );

  // Exact-bucket selection keeps the payload resident and changes only the
  // current full-index set. All stays explicit (null), never a fake bucket id.
  const baseActiveFullIdx = useMemo(
    () => filterActivityIndices({
      authorId,
      timeId,
      selectedTime: deferredBucket,
      authorMask: authorMatch.mask,
      projectId: projectIdCol,
      projectMask,
      roleId: roleIdCol,
      roleMask,
      verbId: verbIdCol,
      verbMask,
      monthId,
      monthMask,
    }),
    [
      authorId,
      authorMatch.mask,
      timeId,
      deferredBucket,
      projectIdCol,
      projectMask,
      roleIdCol,
      roleMask,
      verbIdCol,
      verbMask,
      monthId,
      monthMask,
    ],
  );
  const selectedLegendLabel = legendFilter?.dimId === colorBy ? legendFilter.label : null;
  const legendMask = useMemo(
    () =>
      selectedLegendLabel === null
        ? null
        : buildProjectSelectionMask(colorLabels, new Set([selectedLegendLabel])),
    [colorLabels, selectedLegendLabel],
  );
  const activeFullIdx = useMemo(
    () =>
      legendMask === null
        ? baseActiveFullIdx
        : filterActivityIndices({
            authorId,
            timeId,
            selectedTime: null,
            authorMask: null,
            candidates: baseActiveFullIdx ?? undefined,
            categoryId: data.columns[colorDim.column] as Uint16Array | Uint32Array,
            categoryMask: legendMask,
          }),
    [authorId, baseActiveFullIdx, colorDim, data.columns, legendMask, timeId],
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
  const dimColors = useMemo(
    () => buildDimColors(data.columns[colorDim.column] as Uint16Array, colorDim, colorLabels),
    [data.columns, colorDim, colorLabels],
  );
  const activeColorIds = useMemo(
    () =>
      baseActiveFullIdx === null
        ? (data.columns[colorDim.column] as Uint16Array)
        : gatherIds(data.columns[colorDim.column] as Uint16Array, baseActiveFullIdx),
    [baseActiveFullIdx, data.columns, colorDim],
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
  const sampledLinks = useMemo(
    () => buildActivityAuthorLinks(authorId, sampleIdx, authorLabels.length),
    [authorId, authorLabels.length, sampleIdx],
  );
  // GraphCanvas2D init reads stride-3 positions from a PhysicsLayer; frozen stub.
  const physics = useMemo(
    () => createActivityPhysicsStub(toStride3(sampledPositions)),
    [sampledPositions],
  );
  // 3D positions for the sampled set — only built while the 3D view is up.
  // True 3D PaCMAP embedding when the payload carries positions3 (u16-quantized,
  // --components 3 run); disclosed month-depth cube otherwise.
  const positions3q = data.columns.positions3 as Uint16Array | undefined;
  const positions3HalfExtent =
    typeof dicts.positions3HalfExtent === "number" ? dicts.positions3HalfExtent : 0;
  const has3dEmbedding = Boolean(positions3q && positions3HalfExtent > 0);
  const sampled3 = useMemo(() => {
    if (viewMode !== "3d") return null;
    const n = sampleIdx.length;
    const out = new Float32Array(n * 3);
    if (positions3q && positions3HalfExtent > 0) {
      for (let i = 0; i < n; i++) {
        const src = sampleIdx[i] * 3;
        out[i * 3] = dequantizePosition3(positions3q[src], positions3HalfExtent);
        out[i * 3 + 1] = dequantizePosition3(positions3q[src + 1], positions3HalfExtent);
        out[i * 3 + 2] = dequantizePosition3(positions3q[src + 2], positions3HalfExtent);
      }
      return out;
    }
    let maxAbs = 1;
    for (let i = 0; i < sampledPositions.length; i++)
      maxAbs = Math.max(maxAbs, Math.abs(sampledPositions[i]));
    const depth = buildActivityDepth(gatherIds(monthId, sampleIdx), monthCount, maxAbs * 1.2);
    for (let i = 0; i < n; i++) {
      out[i * 3] = sampledPositions[i * 2];
      out[i * 3 + 1] = sampledPositions[i * 2 + 1];
      out[i * 3 + 2] = depth[i];
    }
    return out;
  }, [viewMode, positions3q, positions3HalfExtent, monthId, sampleIdx, monthCount, sampledPositions]);

  // Group-by categories for the 3D clump morph (aligned to the sample).
  const sampledGroupCatIds = useMemo(
    () =>
      viewMode === "3d" && groupDim
        ? gatherIds(data.columns[groupDim.column] as Uint16Array, sampleIdx)
        : null,
    [viewMode, groupDim, data.columns, sampleIdx],
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
  const [lod, setLod] = useState<{ mode: LodMode; renderedCount: number; linkCount: number }>({
    mode: "sample",
    renderedCount: sampleIdx.length,
    linkCount: sampledLinks.length / 2,
  });

  // ACT-04 interaction state. Hover/selection hold FULL-set indices.
  const [hover, setHover] = useState<{
    fullIndex: number;
    screenXY: [number, number];
  } | null>(null);
  // Magnetic hover: nearest rendered node within MAGNET_RADIUS_PX of the
  // pointer, in RENDERED index space. Cleared on every set swap (mapping dies).
  const magnetRef = useRef<{ renderedIndex: number; fullIndex: number } | null>(null);
  const nativeMagnetRef = useRef<{
    renderedIndex: number;
    fullIndex: number;
    screenXY: [number, number];
  } | null>(null);
  // Stride-2 positions of the CURRENT rendered set (the magnet's search space).
  const currentPositionsRef = useRef<Float32Array>(sampledPositions);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [lassoActive, setLassoActive] = useState(false);
  const [selectedFull, setSelectedFull] = useState<Uint32Array>(
    () => new Uint32Array(0),
  );

  const clearSelection = useCallback((): void => {
    setSelectedFull(new Uint32Array(0));
    handleRef.current?.setSelectedIndices?.([]);
    handle3Ref.current?.setSelectedIndices([]);
    setActivityTestState({ selectedCount: 0 });
  }, []);

  // The text field updates before its deferred 4.9M-row filter and canvas swap.
  // Cancel any lasso immediately so a visible new author can never select from
  // the previous rendered author set.
  useEffect(() => {
    if (!authorFilterPending) return;
    setLassoActive(false);
    clearSelection();
  }, [authorFilterPending, clearSelection]);

  /**
   * Picking a node centers the camera on it and dims the rest — 2D via cosmos's
   * zoomToPointByIndex + the highlightedPointIndices greyout, 3D via the orbit
   * flight + the shader's uHasSelection dim. The isolation rides the canvas
   * selection ONLY (never `selectedFull`), so the lasso breakdown panel
   * doesn't pop up alongside the detail rail for a one-node pick.
   */
  const openDetail = useCallback(
    (renderedIndex: number, fullIndex: number): void => {
      setDetailIndex(fullIndex);
      const ms = reducedMotion ? 0 : FOCUS_MS;
      if (viewModeRef.current === "3d") {
        handle3Ref.current?.setSelectedIndices([renderedIndex]);
        handle3Ref.current?.focusPoint(renderedIndex, ms);
      } else {
        handleRef.current?.setSelectedIndices?.([renderedIndex]);
        handleRef.current?.focusPoint?.(renderedIndex, ms);
      }
    },
    [reducedMotion],
  );

  const closeDetail = useCallback((): void => {
    setDetailIndex(null);
    clearSelection();
  }, [clearSelection]);

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
      linkCount: sampledLinks.length / 2,
      lodMode: "sample",
      sampleStride: sampleStride(activeCount),
      temporalMode: selectedBucket === null ? "all" : "bucket",
      timeGranularity: timeUnit,
      selectedBucket,
      searchQuery: deferredAuthorQuery,
      matchedAuthorCount: authorMatch.matchedAuthorCount,
      bucketCount: timeCount,
      activeCount,
      playing,
      reducedMotion,
      positionsFinite: sampledPositionStats.finite,
      positionMaxAbs: sampledPositionStats.maxAbs,
    });
  }, [
    activeCount,
    data.count,
    timeCount,
    timeUnit,
    playing,
    reducedMotion,
    sampleIdx.length,
    sampledPositionStats,
    sampledLinks.length,
    selectedBucket,
    deferredAuthorQuery,
    authorMatch.matchedAuthorCount,
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
    if (sampleIdx.length > 0 && renderedToFullRef.current === sampleIdx) {
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
    handle.setLinks(sampledLinks);
    renderedToFullRef.current = sampleIdx;
    setAppliedAuthorQuery(deferredAuthorQuery);
    currentPositionsRef.current = sampledPositions;
    magnetRef.current = null;
    handle.setHoveredIndex?.(null); // drop stale focus/greyout — indices remap on swap
    // Cinematic temporal seam: fade the swapped set in instead of a hard cut.
    if (!reducedMotion) {
      containerRef.current?.animate?.(
        [{ opacity: 0.3 }, { opacity: 1 }],
        { duration: TEMPORAL_FADE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
    setHover(null);
    setDetailIndex(null);
    setLassoActive(false);
    setSelectedFull(new Uint32Array(0));
    handle.setSelectedIndices?.([]);
    setLod({ mode: "sample", renderedCount: sampleIdx.length, linkCount: sampledLinks.length / 2 });
    motionRef.current?.setBase(sampledPositions);
    if (sampleIdx.length > 0) motionRef.current?.startAmbient();
    setActivityTestState({
      renderedCount: sampleIdx.length,
      linkCount: sampledLinks.length / 2,
      lodMode: "sample",
      sampleStride: sampleStride(activeCount),
      selectedCount: 0,
      activeCount,
      ambientActive: motionRef.current?.isAmbientRunning() ?? false,
    });
  }, [
    activeCount,
    deferredAuthorQuery,
    handleReady,
    reducedMotion,
    sampleIdx,
    sampledPositions,
    sampledSizes,
    sampledLinks,
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
      // 3D owns its morph on the GPU (uMix + target attribute) — do not burn
      // ~39MB uploads on the hidden 2D canvas; the view-flip effect resyncs.
      if (viewModeRef.current === "3d") return;
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
      // Coalesced: many slider steps → one target recompute. Small sets fire
      // next frame; big sets fire on a trailing throttle (reads the LATEST
      // strengthRef when it lands, so the final value always applies).
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      const fire = (): void => {
        rafPendingRef.current = false;
        commitMorph(strengthRef.current === 0 ? MORPH_COMMIT_MS : MORPH_DRAG_MS);
      };
      if (sampleIdx.length > MORPH_BIG_SET_POINTS) {
        setTimeout(fire, MORPH_BIG_SET_THROTTLE_MS);
      } else {
        requestAnimationFrame(fire);
      }
    },
    [commitMorph, sampleIdx.length],
  );

  const onGroupByChange = useCallback((id: string): void => {
    setGroupBy(id);
    setActivityTestState({ groupBy: id });
  }, []);
  const onColorByChange = useCallback((id: string): void => {
    setColorBy(id);
    setActivityTestState({ colorBy: id });
  }, []);
  const onLegendEntryClick = useCallback(
    (label: string): void => {
      setLegendFilter((current) =>
        current?.dimId === colorBy && current.label === label
          ? null
          : { dimId: colorBy, label },
      );
    },
    [colorBy],
  );

  // Group-by switch at active strength → recompute targets, one longer morph.
  useEffect(() => {
    groupLayoutRef.current = groupLayout;
    if (strengthRef.current > 0) commitMorph(MORPH_GROUP_SWITCH_MS);
  }, [groupLayout, commitMorph]);

  // 3D overlay up → the hidden 2D canvas should not burn GPU on ambient drift,
  // and any frozen hover chrome is dropped. Back to 2D resumes ambient (sample
  // set only — region detail has its own lifecycle).
  useEffect(() => {
    if (viewMode === "3d") {
      motionRef.current?.stopAmbient();
      setHover(null);
      // The 3D view always renders the sample in sampleIdx order, so the
      // rendered→full map IS sampleIdx — pin it so the lasso breakdown resolves
      // correctly even if a 2D region flip had left it pointing elsewhere.
      renderedToFullRef.current = sampleIdx;
    } else if (renderedToFullRef.current === sampleIdx && sampleIdx.length > 0) {
      motionRef.current?.startAmbient();
      // Morph commits were suspended while 3D was up — resync the 2D canvas
      // to the CURRENT group/strength state once on return.
      commitMorph(MORPH_COMMIT_MS);
    }
    // Selection mapping differs between the 2D region set and the 3D sample —
    // clear it (and exit lasso) on every view switch so nothing goes stale.
    setSelectedFull(new Uint32Array(0));
    handleRef.current?.setSelectedIndices?.([]);
    handle3Ref.current?.setSelectedIndices([]);
    setLassoActive(false);
    setActivityTestState({
      selectedCount: 0,
      ambientActive: motionRef.current?.isAmbientRunning() ?? false,
    });
  }, [viewMode, sampleIdx, commitMorph]);

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
        // Magnetic click: an off-point click still opens the snapped node.
        if (renderedIndex === undefined) {
          const magnet = magnetRef.current;
          if (magnet) openDetail(magnet.renderedIndex, magnet.fullIndex);
          else closeDetail();
          return;
        }
        const full = renderedToFullRef.current[renderedIndex];
        if (full !== undefined) openDetail(renderedIndex, full);
      },
      onPointHover: (renderedIndex, screenXY) => {
        const fullIndex = renderedToFullRef.current[renderedIndex];
        if (fullIndex === undefined) return;
        nativeMagnetRef.current = { renderedIndex, fullIndex, screenXY };
        magnetRef.current = { renderedIndex, fullIndex };
        handle.setHoveredIndex?.(renderedIndex);
        setHover({ fullIndex, screenXY });
      },
      onPointHoverEnd: () => {
        nativeMagnetRef.current = null;
      },
    });
    // Handler install is idempotent (ref-indirection) — safe on every render pass.
  });

  // Escape: close the detail rail, then clear the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      if (detailIndex !== null) closeDetail();
      else clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailIndex, clearSelection, closeDetail]);

  // Magnetic hover: a continuous rAF loop (while the pointer is inside) that
  // snaps to the nearest rendered node within MAGNET_RADIUS_PX and re-projects
  // it EVERY frame, so the ring + tooltip ride ambient drift and morphs instead
  // of freezing at the coord where the pointer last moved. Position truth is
  // the motion layer's working buffer — base at rest, drifted mid-ambient, and
  // the morph target while strength > 0 — so the magnet stays live across
  // slider changes (the old strength>0 suspension predates that buffer).
  useEffect(() => {
    const div = containerRef.current;
    if (!div || !handleReady || viewMode !== "2d") return;
    let raf = 0;
    let pending: [number, number] | null = null;
    let lastEmit: [number, number] | null = null;
    let scanPhase = 0;
    let scanStep = 1;
    let scanRadiusSq = 0;
    let scanPositions: Float32Array | null = null;
    let scanResult = { index: -1, distanceSq: Number.POSITIVE_INFINITY };

    const clearMagnet = (): void => {
      nativeMagnetRef.current = null;
      if (magnetRef.current !== null) {
        magnetRef.current = null;
        handleRef.current?.setHoveredIndex?.(null);
      }
      lastEmit = null;
      setHover(null);
    };

    const runMagnet = (): void => {
      const handle = handleRef.current;
      const point = pending;
      if (!handle || !point) return;
      if (lassoActive) return;
      // The working buffer only matches the CURRENT rendered set at sample
      // LOD (region flips keep it sample-length) — the length guard falls
      // back to the static positions of whatever set is actually up.
      const live = motionRef.current?.getLivePositions() ?? null;
      const positions2 =
        live && live.length === currentPositionsRef.current.length
          ? live
          : currentPositionsRef.current;
      const n = positions2.length / 2;
      if (n === 0) {
        clearMagnet();
        return;
      }
      const native = nativeMagnetRef.current;
      if (native) {
        const screenXY = handle.spaceToScreen([
          positions2[native.renderedIndex * 2],
          positions2[native.renderedIndex * 2 + 1],
        ]);
        magnetRef.current = {
          renderedIndex: native.renderedIndex,
          fullIndex: native.fullIndex,
        };
        if (
          lastEmit &&
          Math.abs(screenXY[0] - lastEmit[0]) < 0.5 &&
          Math.abs(screenXY[1] - lastEmit[1]) < 0.5
        ) {
          return;
        }
        lastEmit = screenXY;
        setHover({ fullIndex: native.fullIndex, screenXY });
        return;
      }
      const [sx, sy] = point;
      // Screen-radius → space-radius via a 1-probe conversion at the pointer.
      const a = handle.screenToSpace([sx, sy]);
      const b = handle.screenToSpace([sx + MAGNET_RADIUS_PX, sy]);
      const radiusSq = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      const nextStep = Math.max(1, Math.ceil(n / LOD_CAP));
      if (
        scanPositions !== positions2 ||
        scanStep !== nextStep ||
        Math.abs(scanRadiusSq - radiusSq) > Math.max(1e-9, radiusSq * 1e-6)
      ) {
        scanPhase = 0;
        scanStep = nextStep;
        scanRadiusSq = radiusSq;
        scanPositions = positions2;
        scanResult = { index: -1, distanceSq: radiusSq };
      }
      if (scanPhase < scanStep) {
        scanResult = scanMagnetPhase(
          positions2,
          a,
          radiusSq,
          scanStep,
          scanPhase,
          scanResult,
        );
        scanPhase += 1;
      }
      const best = scanResult.index;
      if (best < 0) {
        clearMagnet();
        return;
      }
      const full = renderedToFullRef.current[best];
      if (full === undefined) {
        clearMagnet();
        return;
      }
      if (magnetRef.current?.renderedIndex !== best) {
        magnetRef.current = { renderedIndex: best, fullIndex: full };
        handle.setHoveredIndex?.(best);
      }
      // Tooltip anchors to the NODE (not the pointer) — the snap is visible.
      // Sub-half-pixel frames are skipped so a still field doesn't re-render.
      const screenXY = handle.spaceToScreen([positions2[best * 2], positions2[best * 2 + 1]]);
      if (
        lastEmit &&
        magnetRef.current?.fullIndex === full &&
        Math.abs(screenXY[0] - lastEmit[0]) < 0.5 &&
        Math.abs(screenXY[1] - lastEmit[1]) < 0.5
      ) {
        return;
      }
      lastEmit = screenXY;
      setHover({ fullIndex: full, screenXY });
    };

    const tick = (): void => {
      raf = pending !== null ? requestAnimationFrame(tick) : 0;
      runMagnet();
    };

    const onMove = (event: PointerEvent): void => {
      const rect = div.getBoundingClientRect();
      pending = [event.clientX - rect.left, event.clientY - rect.top];
      scanPhase = 0;
      scanPositions = null;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = (): void => {
      pending = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      clearMagnet();
    };
    div.addEventListener("pointermove", onMove);
    div.addEventListener("pointerleave", onLeave);
    return () => {
      div.removeEventListener("pointermove", onMove);
      div.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [handleReady, lassoActive, viewMode]);

  // 3D magnetic hover: same 32px snap, but through the live camera projection —
  // the continuous rAF loop re-projects every frame so the ring + tooltip ride
  // the auto-orbit and the group morph. A sub-6px-travel click on the canvas
  // opens the snapped node's detail rail (OrbitControls owns real drags).
  // Listeners live on the OVERLAY (see overlay3Ref) — containerRef never sees
  // these events while the 3D view covers it.
  useEffect(() => {
    const div = overlay3Ref.current;
    if (!div || viewMode !== "3d") return;
    let raf = 0;
    let pending: [number, number] | null = null;
    let lastEmit: [number, number] | null = null;
    let downXY: [number, number] | null = null;

    const clearMagnet = (): void => {
      magnetRef.current = null;
      lastEmit = null;
      setHover(null);
    };

    const runMagnet = (): void => {
      const handle = handle3Ref.current;
      const point = pending;
      if (!handle || !point) return;
      if (lassoActive) return;
      const hit = handle.findNearestPoint(
        point[0],
        point[1],
        div.clientWidth,
        div.clientHeight,
        MAGNET_RADIUS_PX,
      );
      if (!hit) {
        clearMagnet();
        return;
      }
      const full = renderedToFullRef.current[hit.index];
      if (full === undefined) {
        clearMagnet();
        return;
      }
      magnetRef.current = { renderedIndex: hit.index, fullIndex: full };
      if (
        lastEmit &&
        Math.abs(hit.screenXY[0] - lastEmit[0]) < 0.5 &&
        Math.abs(hit.screenXY[1] - lastEmit[1]) < 0.5
      ) {
        return;
      }
      lastEmit = hit.screenXY;
      setHover({ fullIndex: full, screenXY: hit.screenXY });
    };

    const tick = (): void => {
      raf = pending !== null ? requestAnimationFrame(tick) : 0;
      runMagnet();
    };

    const onMove = (event: PointerEvent): void => {
      const rect = div.getBoundingClientRect();
      pending = [event.clientX - rect.left, event.clientY - rect.top];
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = (): void => {
      pending = null;
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      clearMagnet();
    };
    const onDown = (event: PointerEvent): void => {
      downXY = [event.clientX, event.clientY];
    };
    const onClick = (event: MouseEvent): void => {
      // Canvas-only: UI buttons inside the container bubble their clicks here.
      if ((event.target as HTMLElement).tagName !== "CANVAS") return;
      if (lassoActive || !downXY) return;
      const travel = Math.hypot(event.clientX - downXY[0], event.clientY - downXY[1]);
      if (travel > 6) return; // an orbit drag, not a click
      const magnet = magnetRef.current;
      if (magnet) openDetail(magnet.renderedIndex, magnet.fullIndex);
      else closeDetail();
    };
    div.addEventListener("pointermove", onMove);
    div.addEventListener("pointerleave", onLeave);
    div.addEventListener("pointerdown", onDown);
    div.addEventListener("click", onClick);
    return () => {
      div.removeEventListener("pointermove", onMove);
      div.removeEventListener("pointerleave", onLeave);
      div.removeEventListener("pointerdown", onDown);
      div.removeEventListener("click", onClick);
      if (raf) cancelAnimationFrame(raf);
      clearMagnet();
    };
  }, [viewMode, lassoActive, openDetail, closeDetail]);

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
      const links = buildActivityAuthorLinks(authorId, indices, authorLabels.length);
      handle.setLinks(links);
      renderedToFullRef.current = indices;
      currentPositionsRef.current = p;
      magnetRef.current = null;
      handle.setHoveredIndex?.(null); // drop stale focus/greyout — indices remap on swap
      setHover(null);
      setSelectedFull(new Uint32Array(0));
      handle.setSelectedIndices?.([]);
      setLod({ mode, renderedCount: indices.length, linkCount: links.length / 2 });
      if (mode === "sample" && indices.length > 0) {
        motionRef.current?.setBase(p);
        motionRef.current?.startAmbient();
      }
      setActivityTestState({
        lodMode: mode,
        renderedCount: indices.length,
        linkCount: links.length / 2,
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
      // 3D overlay up → the seam is for the hidden 2D canvas only. Running it
      // here scans 4.9M positions per zoom settle (visible jank) and clobbers
      // renderedToFullRef, which 3D pins to sampleIdx for hover/lasso mapping.
      if (viewModeRef.current !== "2d") return;
      // A fast zoom can leave cosmos's drawing buffer degraded (cloud clipped to
      // a rectangle); re-sync it once the wheel/pointer interaction settles.
      handle.resize?.();
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
    authorId,
    authorLabels.length,
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
    const selected = snapshotRenderedSelection(
      matched,
      renderedToFullRef.current,
      activeFullIdx ?? undefined,
    );
    setSelectedFull(selected);
    handleRef.current?.setSelectedIndices?.(matched);
    setActivityTestState({ selectedCount: selected.length });
    setLassoActive(false);
  }, [activeFullIdx]);

  // 3D lasso: the projector hit-test needs the overlay's own CSS size (world→
  // screen against the same viewport), so it takes width/height. Selection maps
  // through sampleIdx (pinned into renderedToFullRef on 3D entry).
  const lassoHitTest3 = useCallback(
    (path: [number, number][], width: number, height: number): number[] =>
      handle3Ref.current?.findPointsInPolygon(path, width, height) ?? [],
    [],
  );
  const onLassoComplete3 = useCallback((matched: number[]): void => {
    const selected = snapshotRenderedSelection(
      matched,
      renderedToFullRef.current,
      activeFullIdx ?? undefined,
    );
    setSelectedFull(selected);
    handle3Ref.current?.setSelectedIndices(matched);
    setActivityTestState({ selectedCount: selected.length });
    setLassoActive(false);
  }, [activeFullIdx]);

  // Lasso selection → live per-attribute breakdown (author role, author, verb,
  // module, object type, company, project, month) straight off the resident
  // columns — zero fetches. Full indices are snapshotted when the lasso closes,
  // before a filter or LOD swap can mutate renderedToFullRef.
  const selectionBreakdown = useMemo(() => {
    if (selectedFull.length === 0) return [];
    return buildSelectionBreakdown(
      selectedFull,
      data.columns as unknown as Record<string, ArrayLike<number> | undefined>,
      dicts,
      projectNames,
    );
  }, [selectedFull, data.columns, dicts, projectNames]);

  const filterGroups: ActivityFilterGroup[] = useMemo(
    () => [
      {
        id: "role",
        title: "Filter by role",
        options: roleLabels,
        counts: roleCounts,
        selected: selectedRoles,
        onChange: setSelectedRoles,
      },
      {
        id: "verb",
        title: "Filter by activity type",
        options: verbLabels,
        counts: verbCounts,
        selected: selectedVerbs,
        onChange: setSelectedVerbs,
      },
      {
        id: "month",
        title: "Filter by month",
        options: monthDict,
        counts: monthCounts,
        selected: selectedMonths,
        // Chronological, not count-ranked — a month list is a series.
        preserveOrder: true,
        onChange: setSelectedMonths,
      },
    ],
    [
      roleLabels,
      roleCounts,
      selectedRoles,
      verbLabels,
      verbCounts,
      selectedVerbs,
      monthDict,
      monthCounts,
      selectedMonths,
    ],
  );

  const fmt = (n: number): string => n.toLocaleString("en-US");

  return (
    <div className="activity-universe-root relative flex h-full min-h-0 overflow-hidden">
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
            links={sampledLinks}
            curvedLinks
            linkGradient
            backgroundColor={bg}
            onHandleReady={(h) => {
              handleRef.current = h;
              labelsGraphRef.current = { mode: "2d", handle: h };
              setHandleReady(true);
              setActivityTestState({
                ready: true,
                linkCount: h.getRenderState().linkCount,
                renderer: webGlRenderer(containerRef.current),
              });
            }}
          />
        </div>
        <LassoOverlay
          active={viewMode === "2d" && lassoActive && !authorFilterPending}
          hitTest={lassoHitTest}
          onComplete={onLassoComplete}
        />

        {/* 3D overlay — true 3D embedding (or disclosed month-depth fallback),
            same sampled buffers + links, GPU morph for group-by/strength. The
            2D canvas stays mounted (hidden) underneath for an instant flip back. */}
        {viewMode === "3d" && sampled3 ? (
          <div ref={overlay3Ref} className="absolute inset-0 z-10">
            <ActivityUniverse3D
              positions3={sampled3}
              colors4={sampledColors}
              sizes={sampledSizes}
              links={sampledLinks}
              groupCatIds={sampledGroupCatIds}
              strength={strength}
              backgroundColor={bg}
              reducedMotion={reducedMotion}
              onHandleReady={(h) => {
                handle3Ref.current = h;
              }}
            />
            {/* 3D lasso: projects the cloud to screen; the drag freezes
                OrbitControls (onDragStart/End) so it selects, not rotates. */}
            <LassoOverlay
              active={lassoActive && !authorFilterPending}
              hitTest={lassoHitTest3}
              onComplete={onLassoComplete3}
              onDragStart={() => handle3Ref.current?.setControlsEnabled(false)}
              onDragEnd={() => handle3Ref.current?.setControlsEnabled(true)}
            />
            {!has3dEmbedding ? (
              <div className="pointer-events-none absolute bottom-16 right-4 rounded-md border bg-card/80 px-2 py-1 font-mono text-[11px] text-muted-foreground backdrop-blur-sm">
                3D embedding not built — showing depth = month fallback
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Magnetic preselect halo — replays a subtle ping on each snap-to-node. */}
        <style>{HOVER_RING_CSS}</style>
        {!reducedMotion && hover ? (
          <div
            key={hover.fullIndex}
            aria-hidden
            data-testid="activity-hover-ring"
            className="au-hover-ring pointer-events-none absolute z-10"
            style={{ left: hover.screenXY[0], top: hover.screenXY[1] }}
          />
        ) : null}

        {/* Project filter — the same search-driven picker as /access-analysis. */}
        <div className="absolute left-1/2 top-3 z-20 w-[380px] -translate-x-1/2">
          <ProjectPicker
            options={projectOptions}
            counts={projectCounts}
            countNoun="events"
            selected={selectedProjects}
            onChange={setSelectedProjects}
            testIdPrefix="activity-project"
            groups={projectGroups}
          />
        </div>

        {/* Top-N category labels ride the morph (rest→footprint lerp on live strength). */}
        {viewMode === "2d" && groupLayout && groupDim ? (
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
          <div>{fmt(lod.linkCount)} same-author links</div>
          <div>
            {fmt(activeCount)} events · data from {monthLabel(monthFloor, 0)}
          </div>
          <div>
            author resolution {(coverage.resolvedEmailRate * 100).toFixed(2)}% · unknown authors{" "}
            {(coverage.unknownAuthorRate * 100).toFixed(2)}%
          </div>
        </div>

        {/* Lasso toggle + honest selected count (visible = selectable at L2).
            Works in both views: 2D hit-tests the canvas, 3D projects the
            cloud to screen. z-20 so it sits above the 3D overlay. */}
        <div
          className="absolute bottom-16 left-4 z-20 flex items-center gap-2"
        >
          <button
            type="button"
            disabled={authorFilterPending}
            title={
              authorFilterPending
                ? "Wait for the author filter to finish"
                : "Select rendered activity nodes"
            }
            onClick={() => {
              if (authorFilterPending) return;
              if (lassoActive) setLassoActive(false);
              else {
                clearSelection();
                setLassoActive(true);
              }
            }}
            aria-pressed={lassoActive}
            className={`rounded-md border px-2.5 py-1 text-xs transition-colors disabled:cursor-wait disabled:opacity-50 ${
              lassoActive && !authorFilterPending
                ? "border-primary bg-primary/10 text-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            Lasso
          </button>
          {selectedFull.length > 0 && (
            <span className="font-mono text-[11px] text-muted-foreground">
              {fmt(selectedFull.length)} of rendered {fmt(lod.renderedCount)} selected
              <button
                type="button"
                onClick={clearSelection}
                className="ml-2 rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent"
              >
                Clear
              </button>
            </span>
          )}
        </div>

        {/* Experimental 2D/3D view toggle — 3D lifts the embedding into a
            space-time cube (z = month). */}
        <div
          data-testid="activity-view-toggle"
          className="absolute right-4 top-3 z-20 flex overflow-hidden rounded-md border bg-card/90 text-xs shadow-sm backdrop-blur-sm"
        >
          {(["2d", "3d"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`activity-view-${mode}`}
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
              title={
                mode === "3d"
                  ? "Experimental: embedding as a space-time cube (depth = month)"
                  : "Flat activity embedding"
              }
              className={`px-2.5 py-1 transition-colors ${
                viewMode === mode
                  ? "bg-primary/10 font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {mode.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Active color-by legend — honest counts over the selected period. */}
        <div
          data-testid="activity-color-legend"
          className="absolute right-4 top-14 z-10 rounded-md border bg-card/80 px-3 py-2 backdrop-blur-sm transition-[right] duration-150 ease-out motion-reduce:transition-none"
        >
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {colorDim.label}
            </span>
            {selectedLegendLabel !== null ? (
              <button
                type="button"
                onClick={() => setLegendFilter(null)}
                className="rounded px-1 text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                All
              </button>
            ) : null}
          </div>
          <ul className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
            {activeLegend.map((e) => (
              <li key={e.label}>
                <button
                  type="button"
                  aria-pressed={selectedLegendLabel === e.label}
                  onClick={() => onLegendEntryClick(e.label)}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[11px] transition-colors duration-150 ${
                    selectedLegendLabel === e.label
                      ? "bg-primary/10 text-foreground"
                      : selectedLegendLabel !== null
                        ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                        : "text-foreground hover:bg-accent"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: e.colorHex }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{e.label}</span>
                  <span className="font-mono text-muted-foreground">{fmt(e.count)}</span>
                </button>
              </li>
            ))}
          </ul>
          {activeLegend.length > 24 ? (
            <p className="mt-1 border-t pt-1 text-[11px] text-muted-foreground">
              {fmt(activeLegend.length)} categories · scroll for all
            </p>
          ) : null}
        </div>

        {activeCount === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
              No activity found for this user search, project selection, and month.
            </div>
          </div>
        ) : null}

        <div
          data-testid="activity-time-scrubber"
          className="absolute bottom-3 left-4 right-4 z-10 flex items-center gap-3 rounded-md border bg-card/90 px-3 py-2 shadow-sm backdrop-blur-sm"
        >
          <button
            type="button"
            data-testid="activity-time-all"
            aria-pressed={selectedBucket === null}
            onClick={() => {
              setPlaying(false);
              setSelectedBucket(null);
            }}
            className={`rounded-md border px-2 py-1 text-xs transition-colors ${
              selectedBucket === null
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
            className="w-28 shrink-0 text-xs font-medium tabular-nums text-foreground"
          >
            {selectedBucket === null
              ? `All ${timeUnit}s`
              : `${byWeek ? "Week of " : ""}${bucketLabel(selectedBucket)}`}
          </span>
          <div className="flex min-w-24 flex-1 flex-col gap-0.5">
            <input
              type="range"
              data-testid="activity-time-range"
              aria-label={`Activity ${timeUnit}`}
              aria-valuetext={bucketLabel(selectedBucket ?? 0)}
              min={0}
              max={Math.max(0, timeCount - 1)}
              step={1}
              value={selectedBucket ?? 0}
              onChange={(event) => {
                setPlaying(false);
                setSelectedBucket(Number(event.target.value));
              }}
              className="w-full accent-primary"
            />
            {/* Month ticks under the week track — 87 weeks read as noise without
                an anchor, so every bucket that opens a new month gets a label. */}
            {byWeek ? (
              <div
                aria-hidden
                className="relative h-3 select-none font-mono text-[11px] leading-3 text-muted-foreground"
              >
                {monthTicks.map((t, i) => (
                  <span
                    key={t.week}
                    // The first tick anchors left instead of centering, so it
                    // isn't half-clipped off the track.
                    className={`absolute whitespace-nowrap ${i === 0 ? "" : "-translate-x-1/2"}`}
                    style={{ left: `${(t.week / Math.max(1, timeCount - 1)) * 100}%` }}
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <span
            data-testid="activity-time-count"
            className="shrink-0 font-mono text-[11px] text-muted-foreground"
          >
            {fmt(activeCount)} / {fmt(data.count)} events
            {byWeek && weekUnknownCount > 0 ? (
              <span title="Rows whose source event timestamp could not be resolved — excluded from every week bucket.">
                {" "}
                · {fmt(weekUnknownCount)} undated
              </span>
            ) : null}
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
            onClose={closeDetail}
          />
        )}

        {selectionBreakdown.length > 0 && (
          <ActivitySelectionPanel
            selectedCount={selectedFull.length}
            renderedCount={lod.renderedCount}
            breakdown={selectionBreakdown}
            authorPhotoByEmail={authorPhotoByEmail}
            onClear={clearSelection}
          />
        )}
      </div>

      <div
        data-testid="activity-dimensions-hover-zone"
        className="group/dimensions absolute inset-y-0 right-0 z-30 w-6"
      >
        <button
          type="button"
          aria-label="Open dimensions"
          className="absolute right-0 top-1/2 grid h-12 w-4 -translate-y-1/2 place-items-center rounded-l-md border border-r-0 bg-card/90 text-muted-foreground shadow-sm backdrop-blur-sm transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="h-3 w-3 fill-none stroke-current" strokeWidth="1.5">
            <path d="m10 4-4 4 4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="absolute inset-y-0 right-0 translate-x-full shadow-xl transition-transform duration-150 ease-out group-hover/dimensions:translate-x-0 group-focus-within/dimensions:translate-x-0 motion-reduce:transition-none">
          <ActivityDimensionsPanel
            groupByOptions={groupByOptions}
            colorByOptions={colorByOptions}
            groupBy={groupBy}
            colorBy={colorBy}
            strength={strength}
            onGroupByChange={onGroupByChange}
            onColorByChange={onColorByChange}
            onStrengthChange={onStrengthChange}
            authorQuery={authorQuery}
            onAuthorQueryChange={setAuthorQuery}
            authorSuggestions={authorLabels}
            authorPhotoByEmail={authorPhotoByEmail}
            filters={filterGroups}
            matchedAuthorCount={authorMatch.matchedAuthorCount}
            searchPending={authorFilterPending}
            groupCoverageText={groupCoverageText}
            groupByLabel={groupDim?.label ?? null}
            colorCoverageText={colorCoverageText}
            colorByLabel={colorDim.label}
          />
        </div>
      </div>
    </div>
  );
}
