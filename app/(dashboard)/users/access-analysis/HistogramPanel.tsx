"use client";

import { useRef } from "react";
import { VgPlotChart, vg } from "@sqlrooms/mosaic";
import { useMosaicSelection } from "./MosaicCoordinatorContext";
import type { Selection } from "@uwdata/mosaic-core";

export interface HistogramPanelProps {
  title: string;
  /** DuckDB table/view to query. */
  table: string;
  /** Column to group by on the Y axis (bars grow left→right). */
  groupBy: string;
  /** Optional caption shown next to the title. */
  groupLabel?: string;
  /**
   * Aggregation mode.
   * - "countDistinctUser" (default): COUNT(DISTINCT user_id) — users per group
   * - "count": COUNT(*) — rows per group
   */
  aggregator?: "countDistinctUser" | "count";
  /** Max bars to render (default 20). */
  topN?: number;
  /** Optional override for the shared crossfilter selection. */
  selection?: Selection;
}

export function HistogramPanel({
  title,
  table,
  groupBy,
  groupLabel,
  aggregator = "countDistinctUser",
  topN = 20,
  selection,
}: HistogramPanelProps) {
  const sharedSelection = useMosaicSelection();
  const sel = selection ?? sharedSelection;

  // Build the vgplot HTMLElement once per mount.
  // vg.plot() returns an HTMLElement that Mosaic registers as a client with
  // the Coordinator — it must NOT be recreated on every render.
  //
  // Count expression:
  //   vg.count("user_id").distinct()  →  COUNT(DISTINCT user_id)
  //   vg.count()                      →  COUNT(*)
  const plotRef = useRef<HTMLElement | null>(null);
  if (plotRef.current === null) {
    const xExpr =
      aggregator === "count"
        ? vg.count()
        : vg.count("user_id").distinct();

    plotRef.current = vg.plot(
      vg.barX(
        vg.from(table, { filterBy: sel }),
        {
          x: xExpr,
          y: groupBy,
          fill: "steelblue",
          sort: { y: "-x", limit: topN },
        },
      ),
      vg.toggleY({ as: sel }),
      vg.marginLeft(120),
      vg.height(Math.min(40 + topN * 18, 460)),
      vg.style({ fontSize: "11px" }),
    );
  }

  return (
    <section className="min-h-[160px] rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {groupLabel && (
          <span className="text-[10px] text-muted-foreground">{groupLabel}</span>
        )}
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </section>
  );
}
