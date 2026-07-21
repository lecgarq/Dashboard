"use client";

/**
 * ActivityUniverseShell.tsx — v2.7 Phase 39 (ACT-01 + ACT-04).
 *
 * The activity universe: one node per extracted activity event (4,904,886
 * resident at rung L2), rendered by the production GraphCanvas2D in frozen
 * mode. Far zoom shows a deterministic uniform sample ≤ ~500k with an honest
 * label; zooming in flips to exact viewport detail via the setPointSet LOD
 * seam. First-paint color-by = module/serviceGroup (owner decision 3).
 *
 * Interaction (ACT-04): hover tooltip from resident ints + meta dicts (zero
 * fetches), click → ActivityDetailRail (on-demand event story + author
 * profile), lasso over the RENDERED subset with an honest selected count.
 * Static this phase — Phase 40 owns motion/sliders; Phase 41 owns the fps gate.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { trpc } from "@/lib/core/trpc";
import { GraphCanvas2D, type GraphCanvas2DHandle } from "../GraphCanvas2D";
import { LassoOverlay } from "../LassoOverlay";
import { GraphLoadingSkeleton } from "@/components/ui/GraphLoadingSkeleton";
import {
  useActivityUniversePayload,
  type ActivityUniverseData,
} from "./useActivityUniversePayload";
import { buildModuleColorBuffer, buildModuleLegend } from "./moduleColors";
import { buildActivitySizes } from "./activitySizes";
import {
  gather,
  lodLabel,
  sampleStride,
  uniformSampleIndices,
  viewportIndices,
  type LodMode,
} from "./lodSample";
import { createActivityPhysicsStub, toStride3 } from "./activityMotion";
import { installActivityTestBridge, setActivityTestState } from "./activityTestBridge";
import { monthLabel, resolveActivityHoverLabels, type ActivityHoverLabels } from "./activityEventLabels";
import { ActivityTooltip } from "./ActivityTooltip";
import { ActivityDetailRail } from "./ActivityDetailRail";

const LOD_DEBOUNCE_MS = 250;

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

function ActivityUniverseCanvas({ data }: { data: ActivityUniverseData }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<GraphCanvas2DHandle | null>(null);
  const { resolvedTheme } = useTheme();
  const bg = resolvedTheme === "dark" ? "#09090B" : "#FFFFFF";

  const positions = data.columns.positions as Float32Array;
  const moduleId = data.columns.moduleId as Uint16Array;
  const monthId = data.columns.monthId as Uint16Array;
  const moduleLabels = (data.meta.dicts.module as string[]) ?? [];
  const monthCount = (data.meta.dicts.monthCount as number) ?? 1;
  const monthFloor = (data.meta.dicts.monthFloor as string) ?? "";
  const coverage = data.meta.coverage;

  // Project GUID → display name for tooltips (957 rows, cached indefinitely).
  const projectNames = trpc.activityUniverse.projectNames.useQuery(undefined, {
    staleTime: Infinity,
  }).data;

  // Full-set derived buffers — built once per payload (4.9M table lookups, ~tens of ms).
  const fullColors = useMemo(
    () => buildModuleColorBuffer(moduleId, moduleLabels),
    [moduleId, moduleLabels],
  );
  const fullSizes = useMemo(() => buildActivitySizes(monthId, monthCount), [monthId, monthCount]);
  const legend = useMemo(() => buildModuleLegend(moduleId, moduleLabels), [moduleId, moduleLabels]);

  // Rung-L2 far-zoom set: deterministic uniform sample (owner decision 4).
  const sampleIdx = useMemo(() => uniformSampleIndices(data.count), [data.count]);
  const sampled = useMemo(
    () => ({
      positions: gather(positions, sampleIdx, 2),
      colors: gather(fullColors, sampleIdx, 4),
      sizes: gather(fullSizes, sampleIdx, 1),
    }),
    [positions, fullColors, fullSizes, sampleIdx],
  );
  // GraphCanvas2D init reads stride-3 positions from a PhysicsLayer; frozen stub.
  const physics = useMemo(
    () => createActivityPhysicsStub(toStride3(sampled.positions)),
    [sampled.positions],
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
    setActivityTestState({
      residentCount: data.count,
      renderedCount: sampleIdx.length,
      lodMode: "sample",
      sampleStride: sampleStride(data.count),
    });
    return uninstall;
  }, [data.count, sampleIdx.length]);

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
  useEffect(() => {
    const div = containerRef.current;
    if (!div) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const applyLod = (): void => {
      const handle = handleRef.current;
      const el = containerRef.current;
      if (!handle || !el || disposed) return;
      const a = handle.screenToSpace([0, 0]);
      const b = handle.screenToSpace([el.clientWidth, el.clientHeight]);
      const bounds = {
        minX: Math.min(a[0], b[0]),
        maxX: Math.max(a[0], b[0]),
        minY: Math.min(a[1], b[1]),
        maxY: Math.max(a[1], b[1]),
      };
      const region = viewportIndices(positions, bounds);
      const switchTo = (indices: Uint32Array, mode: LodMode, p: Float32Array, c: Float32Array, s: Float32Array): void => {
        handle.setPointSet?.(p, c, s);
        renderedToFullRef.current = indices;
        setHover(null);
        setSelectedRendered([]);
        handle.setSelectedIndices?.([]);
        setLod({ mode, renderedCount: indices.length });
        setActivityTestState({ lodMode: mode, renderedCount: indices.length, selectedCount: 0 });
      };
      if (region) {
        switchTo(
          region,
          "region",
          gather(positions, region, 2),
          gather(fullColors, region, 4),
          gather(fullSizes, region, 1),
        );
      } else if (renderedToFullRef.current !== sampleIdx) {
        switchTo(sampleIdx, "sample", sampled.positions, sampled.colors, sampled.sizes);
      }
    };

    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(applyLod, LOD_DEBOUNCE_MS);
    };
    div.addEventListener("wheel", schedule, { passive: true });
    div.addEventListener("pointerup", schedule);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      div.removeEventListener("wheel", schedule);
      div.removeEventListener("pointerup", schedule);
    };
  }, [positions, fullColors, fullSizes, sampleIdx, sampled]);

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
    <div className="relative h-full min-h-0">
      <div
        ref={containerRef}
        className="absolute inset-0"
        data-testid="activity-universe-canvas"
      >
        <GraphCanvas2D
          containerRef={containerRef}
          physics={physics}
          nodeColors={sampled.colors}
          nodeSizes={sampled.sizes}
          backgroundColor={bg}
          onHandleReady={(h) => {
            handleRef.current = h;
            setActivityTestState({ ready: true });
          }}
        />
      </div>
      <LassoOverlay active={lassoActive} hitTest={lassoHitTest} onComplete={onLassoComplete} />

      {/* Caption stack — muted, honest (LOD state, data floor, author coverage). */}
      <div className="pointer-events-none absolute left-4 top-3 z-10 space-y-0.5 font-mono text-[11px] text-muted-foreground">
        <div className="text-sm font-semibold text-foreground">Activity universe</div>
        <div>{lodLabel(lod.mode, lod.renderedCount, data.count)}</div>
        <div>
          {fmt(data.count)} events · data from {monthLabel(monthFloor, 0)}
        </div>
        <div>
          author resolution {(coverage.resolvedEmailRate * 100).toFixed(2)}% · unknown authors{" "}
          {(coverage.unknownAuthorRate * 100).toFixed(2)}%
        </div>
      </div>

      {/* Lasso toggle + honest selected count (visible = selectable at L2). */}
      <div className="absolute bottom-3 left-4 z-10 flex items-center gap-2">
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

      {/* Module legend — the first-paint color language (owner decision 3). */}
      <div className="absolute right-4 top-3 z-10 rounded-md border bg-card/80 px-3 py-2 backdrop-blur-sm">
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Module
        </div>
        <ul className="space-y-0.5">
          {legend.map((e) => (
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
  );
}
