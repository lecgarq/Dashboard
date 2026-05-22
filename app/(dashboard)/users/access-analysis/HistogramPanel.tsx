"use client";

import { useRef } from "react";
import * as vg from "@uwdata/vgplot";
import { VgPlotChart } from "./VgPlotChart";
import { useMosaicSelection } from "./MosaicCoordinatorContext";
import type { Selection } from "@uwdata/mosaic-core";
import { ChartPanel } from "./ChartPanel";

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
  /** Accent color used in the header dot. */
  accent?: string;
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
          // Per-bar categorical color — Plot's default tableau10 palette gives
          // each Y-category its own hue, making rows much easier to track than
          // a single steelblue bar.
          fill: groupBy,
          sort: { y: "-x", limit: topN },
          tip: true,
        },
      ),
      vg.toggleY({ as: sel }),
      vg.colorScheme("tableau10"),
      vg.marginLeft(140),
      vg.marginTop(6),
      vg.marginBottom(28),
      vg.height(Math.min(60 + topN * 24, 540)),
      vg.style({
        fontSize: "12px",
        fontFamily: "inherit",
        color: "currentColor",
        background: "transparent",
      }),
    );
  }

  return (
    <ChartPanel title={title} subtitle={groupLabel} affordance="click-to-filter">
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </ChartPanel>
  );
}
