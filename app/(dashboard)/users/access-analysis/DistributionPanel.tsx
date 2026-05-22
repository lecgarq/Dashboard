"use client";

import { useRef } from "react";
import * as vg from "@uwdata/vgplot";
import { VgPlotChart } from "./VgPlotChart";
import { useMosaicSelection } from "./MosaicCoordinatorContext";
import type { Selection } from "@uwdata/mosaic-core";
import { ChartPanel } from "./ChartPanel";
import { chartColor } from "./chartColors";

export interface DistributionPanelProps {
  title: string;
  subtitle?: string;
  /** DuckDB table/view to query. */
  table: string;
  /** Numeric column to bin. */
  column: string;
  /** Accent color used for both bars and the header dot. */
  accent?: string;
  /** Bin step in source-column units (e.g., 1 for integer counts). */
  binStep?: number;
  /** Optional override for the shared crossfilter selection. */
  selection?: Selection;
  /** Plot height in px. Defaults to 260. */
  height?: number;
}

/**
 * Binned histogram (vg.rectY + vg.bin). Use for numeric distributions like
 * "projects per user" or "admin grants per user" — reveals the long-tail
 * shape of access patterns that horizontal bar charts can't show.
 *
 * Brushing along the X axis crossfilters every other panel sharing the
 * MosaicCoordinator selection.
 */
export function DistributionPanel({
  title,
  subtitle,
  table,
  column,
  accent = chartColor("seq4"),
  binStep,
  selection,
  height = 260,
}: DistributionPanelProps) {
  const sharedSelection = useMosaicSelection();
  const sel = selection ?? sharedSelection;

  const plotRef = useRef<HTMLElement | null>(null);
  if (plotRef.current === null) {
    plotRef.current = vg.plot(
      vg.rectY(
        vg.from(table, { filterBy: sel }),
        {
          x: binStep ? vg.bin(column, { step: binStep }) : vg.bin(column),
          y: vg.count(),
          fill: accent,
          inset: 1,
          tip: true,
        },
      ),
      vg.intervalX({ as: sel }),
      vg.height(height),
      vg.marginLeft(48),
      vg.marginBottom(36),
      vg.marginTop(8),
      vg.xLabel(column),
      vg.yLabel("users"),
      vg.style({
        fontSize: "12px",
        fontFamily: "inherit",
        color: "currentColor",
        background: "transparent",
      }),
    );
  }

  return (
    <ChartPanel title={title} subtitle={subtitle} affordance="drag-to-filter">
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </ChartPanel>
  );
}
