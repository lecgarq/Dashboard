"use client";

/**
 * ActivityUniverseShell.tsx — v2.7 Phase 39 (ACT-01).
 *
 * The activity universe: one node per extracted activity event (4,904,886
 * resident at rung L2), rendered by the production GraphCanvas2D in frozen
 * mode. Far zoom shows a deterministic uniform sample ≤ ~500k with an honest
 * label; zooming in flips to exact viewport detail via the setPointSet LOD
 * seam. First-paint color-by = module/serviceGroup (owner decision 3). Static
 * this phase — Phase 40 owns motion/sliders; Phase 41 owns the fps gate.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { GraphCanvas2D, type GraphCanvas2DHandle } from "../GraphCanvas2D";
import { GraphLoadingSkeleton } from "@/components/ui/GraphLoadingSkeleton";
import {
  useActivityUniversePayload,
  type ActivityUniverseData,
} from "./useActivityUniversePayload";
import { buildModuleColorBuffer, buildModuleLegend } from "./moduleColors";
import { buildActivitySizes } from "./activitySizes";
import {
  gatherPositions,
  gatherRgba,
  gatherScalar,
  lodLabel,
  sampleStride,
  uniformSampleIndices,
  viewportIndices,
  type LodMode,
} from "./lodSample";
import { createActivityPhysicsStub, toStride3 } from "./activityPhysicsStub";
import { installActivityTestBridge, setActivityTestState } from "./activityTestBridge";

const LOD_DEBOUNCE_MS = 250;

function monthFloorLabel(monthFloor: string): string {
  // "2024-12" → "Dec 2024" without Date parsing pitfalls.
  const [y, m] = monthFloor.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return Number.isFinite(y) && m >= 1 && m <= 12 ? `${names[m - 1]} ${y}` : monthFloor;
}

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
      positions: gatherPositions(positions, sampleIdx),
      colors: gatherRgba(fullColors, sampleIdx),
      sizes: gatherScalar(fullSizes, sampleIdx),
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

  // LOD state machine: after pan/zoom settles, flip between the uniform sample
  // (region over cap) and exact viewport detail (region fits the cap).
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
      if (region) {
        handle.setPointSet?.(
          gatherPositions(positions, region),
          gatherRgba(fullColors, region),
          gatherScalar(fullSizes, region),
        );
        renderedToFullRef.current = region;
        setLod({ mode: "region", renderedCount: region.length });
        setActivityTestState({ lodMode: "region", renderedCount: region.length });
      } else if (renderedToFullRef.current !== sampleIdx) {
        handle.setPointSet?.(sampled.positions, sampled.colors, sampled.sizes);
        renderedToFullRef.current = sampleIdx;
        setLod({ mode: "sample", renderedCount: sampleIdx.length });
        setActivityTestState({ lodMode: "sample", renderedCount: sampleIdx.length });
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

      {/* Caption stack — muted, honest (LOD state + data floor). */}
      <div className="pointer-events-none absolute left-4 top-3 z-10 space-y-0.5 font-mono text-[11px] text-muted-foreground">
        <div className="text-sm font-semibold text-foreground">Activity universe</div>
        <div>{lodLabel(lod.mode, lod.renderedCount, data.count)}</div>
        <div>
          {fmt(data.count)} events · data from {monthFloorLabel(monthFloor)}
        </div>
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
    </div>
  );
}
