"use client";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/components/ui/EChart";
import type { EChartsOption } from "echarts";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { summarizeFolderActionMatrix, type FolderActionCell } from "../folderActionTypes";

/**
 * "Activity types by folder" heatmap (owner-requested, 2026-07-07): which
 * folders carry what KIND of activity — views, downloads & exports, uploads,
 * edits & moves, deletions, sharing & links, reviews & approvals. Rows are the
 * top folders by volume (same-name folders merged across the selected
 * projects, matching the Folder Activity by Role panel); the color scale is
 * log10 so the "Project Files views" giant doesn't wash out every other cell.
 * Lazy expand-to-load, mirroring FolderActivityReveal.
 */
/** Default folder rows; "Show all" expands to the server's ranking cap (250). */
const DEFAULT_FOLDERS = 50;
const ALL_FOLDERS = 250;

export function FolderActionHeatmap({
  selectedProjectIds,
  loadMatrix,
}: {
  selectedProjectIds: string[];
  loadMatrix: (ids: string[], limit?: number) => Promise<FolderActionCell[]>;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [rows, setRows] = useState<FolderActionCell[] | null>(null);
  const [loading, setLoading] = useState(false);

  const idsKey = useMemo(() => [...selectedProjectIds].sort().join(","), [selectedProjectIds]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadMatrix(selectedProjectIds, showAll ? ALL_FOLDERS : DEFAULT_FOLDERS)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // idsKey captures selection identity; loadMatrix is a stable server-action ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey, showAll]);

  // A fresh selection restarts from the default row count.
  useEffect(() => {
    setShowAll(false);
    setRows(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const matrix = useMemo(() => (rows ? summarizeFolderActionMatrix(rows) : null), [rows]);

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#52525b";
  const cAxis = dark ? "#71717a" : "#6b7280";
  const cSplit = dark ? "#27272a" : "#e4e4e7";
  // zinc floor → azul mid → naranja peak (brand ramp; readable on both themes).
  const ramp = dark
    ? ["#27272a", "#1f4258", "#4e8ccb", "#e8763f"]
    : ["#f4f4f5", "#c5d9ec", "#4e8ccb", "#e8763f"];

  const option: EChartsOption | null = useMemo(() => {
    if (!matrix || matrix.folders.length === 0) return null;
    const logMax = Math.log10(1 + matrix.maxCount);
    return {
      tooltip: {
        position: "top",
        padding: [10, 12],
        extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
        formatter: (p: unknown) => {
          const { value } = p as { value: [number, number, number, number] };
          const [ti, fi, , raw] = value;
          const folder = matrix.folders[fi];
          const folderTotal = matrix.totalByFolder.get(folder) ?? 0;
          const pct = folderTotal > 0 ? ((raw / folderTotal) * 100).toFixed(1) : "0";
          return (
            `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>${folder}</div>` +
            `<div style='color:${cSub}'>${matrix.types[ti]} · <b style='color:${cTitle}'>${raw.toLocaleString()}</b> (${pct}% of folder)</div>`
          );
        },
      },
      grid: { left: 190, right: 16, top: 8, bottom: 64 },
      xAxis: {
        type: "category",
        data: [...matrix.types],
        position: "bottom",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: cAxis, fontSize: 11, interval: 0, rotate: 24 },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        // Row 0 (busiest folder) at the TOP: ECharts category y-axis draws
        // index 0 at the bottom, so the axis is inverted.
        data: [...matrix.folders],
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: cAxis,
          fontSize: 11,
          formatter: (name: string) => (name.length > 26 ? `${name.slice(0, 25)}…` : name),
        },
      },
      visualMap: {
        show: false,
        min: 0,
        max: logMax,
        dimension: 2,
        inRange: { color: ramp },
      },
      series: [
        {
          type: "heatmap",
          // [typeIdx, folderIdx, log10(1+count) for the color scale, raw count for the tooltip]
          data: matrix.cells.map(([ti, fi, v]) => [ti, fi, Math.log10(1 + v), v]),
          itemStyle: { borderColor: dark ? "#18181b" : "#ffffff", borderWidth: 2, borderRadius: 4 },
          emphasis: { itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.4)" } },
          animationDurationUpdate: 300,
        },
      ],
    };
  }, [matrix, cTitle, cSub, cAxis, cSplit, ramp, dark]);

  const chartHeight = matrix ? Math.max(220, matrix.folders.length * 26 + 90) : 220;

  return (
    <PremiumSurface variant="base" className="flex flex-col gap-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Activity types by folder</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            What people actually do in the busiest folders — views, downloads, uploads, edits,
            deletions, sharing, reviews. Color is log-scaled so smaller folders stay readable.
            Folder-scoped, user-attributed activity; same-name folders merge across projects.
          </p>
        </div>
        <button
          type="button"
          data-testid="folder-heatmap-expand"
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div data-testid="folder-heatmap-panel" className="px-5 pb-5">
          {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading folder activity…</p>}

          {!loading && matrix && matrix.folders.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No folder activity for the selected projects.</p>
          )}

          {!loading && matrix && matrix.folders.length > 0 && option && (
            <>
              {/* Expanded mode scrolls INSIDE the panel so the page keeps its own
                  scroll (dashboard scroll-ownership rule); the chart canvas grows
                  with the row count either way. */}
              <div className={showAll ? "max-h-[720px] overflow-y-auto pr-1" : undefined}>
                <EChart option={option} height={chartHeight} notMerge />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Top {matrix.folders.length.toLocaleString()} folders by activity ·{" "}
                  {matrix.total.toLocaleString()} activities in view.
                </p>
                <button
                  type="button"
                  data-testid="folder-heatmap-showall"
                  onClick={() => setShowAll((p) => !p)}
                  className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  {showAll ? `Show top ${DEFAULT_FOLDERS}` : `Show all folders (up to ${ALL_FOLDERS})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </PremiumSurface>
  );
}
