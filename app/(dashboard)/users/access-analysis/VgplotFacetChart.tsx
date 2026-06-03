"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/core/utils";
import type { ChartDatum } from "./analyticsQueries";
import { selectionFromFacet, type GraphAnalyticsSelection } from "./mosaicSelections";

interface VgplotFacetChartProps {
  rows: ChartDatum[];
  selection?: GraphAnalyticsSelection | null;
  onSelect: (row: ChartDatum) => void;
}

function selectionKey(selection: GraphAnalyticsSelection | null | undefined): string {
  return JSON.stringify(selection ?? {});
}

function isSelected(row: ChartDatum, selection: GraphAnalyticsSelection | null | undefined): boolean {
  return selectionKey(selectionFromFacet(row.field, row.values)) === selectionKey(selection);
}

export function VgplotFacetChart({ rows, selection, onSelect }: VgplotFacetChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const selectedKey = selectionKey(selection);
  const plotRows = useMemo(
    () => rows.map((row) => ({ ...row, selected: isSelected(row, selection) })),
    [rows, selectedKey],
  );

  useEffect(() => {
    let cancelled = false;
    const container = chartRef.current;
    if (!container) return;

    container.replaceChildren();
    if (!plotRows.length) return;

    async function renderPlot() {
      const vg = await import("@uwdata/vgplot");
      if (cancelled || !container) return;

      const chart = vg.plot(
        vg.width(320),
        vg.height(Math.max(128, plotRows.length * 30 + 34)),
        vg.marginLeft(116),
        vg.marginRight(16),
        vg.marginTop(8),
        vg.marginBottom(24),
        vg.xLabel(null),
        vg.yLabel(null),
        vg.xGrid(true),
        vg.barX(plotRows, {
          x: "value",
          y: "label",
          fill: (row: { selected?: boolean }) => (row.selected ? "#2563eb" : "#94a3b8"),
          title: (row: ChartDatum) => `${row.label}: ${row.value.toLocaleString()}`,
        }),
      );

      container.replaceChildren(chart);
    }

    renderPlot().catch((error: unknown) => {
      console.error("[vgplot] chart render failed:", error);
      if (!cancelled && container) {
        container.textContent = "Chart unavailable";
      }
    });

    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [plotRows]);

  if (!rows.length) {
    return <div className="py-8 text-center text-xs text-muted-foreground">No rows</div>;
  }

  return (
    <div className="space-y-2">
      <div ref={chartRef} className="min-h-[128px] overflow-hidden rounded-sm" aria-hidden="true" />
      <div className="grid gap-1" aria-label="Chart selections">
        {rows.map((row) => {
          const active = isSelected(row, selection);
          return (
            <button
              key={`${row.field}:${row.label}`}
              type="button"
              aria-label={`${row.label} ${row.value.toLocaleString()}`}
              aria-pressed={active}
              onClick={() => onSelect(row)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors hover:bg-muted",
                active && "bg-primary/10 text-primary",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{row.label}</span>
                {row.detail && <span className="block truncate text-[10px] text-muted-foreground">{row.detail}</span>}
              </span>
              <span className="font-semibold tabular-nums">{row.value.toLocaleString()}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
