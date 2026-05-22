"use client";

import { useRef } from "react";
import * as vg from "@uwdata/vgplot";
import { VgPlotChart } from "./VgPlotChart";
import { useMosaicSelection } from "./MosaicCoordinatorContext";
import type { Selection } from "@uwdata/mosaic-core";
import { ChartPanel } from "./ChartPanel";

export interface HeatmapPanelProps {
  title: string;
  subtitle?: string;
  /** DuckDB table/view to query. */
  table: string;
  /** Column for the X axis (categorical). */
  xColumn: string;
  /** Column for the Y axis (categorical). */
  yColumn: string;
  /** Accent color used for the header dot. */
  accent?: string;
  /**
   * Observable Plot color scheme name for the sequential scale.
   * Good picks: "blues", "viridis", "magma", "ylgnbu".
   */
  scheme?: string;
  /** Plot height in px. Defaults to 320. */
  height?: number;
  /** Optional override for the shared crossfilter selection. */
  selection?: Selection;
}

/**
 * Categorical heatmap (vg.cell) — shows COUNT(*) across a two-dimensional
 * grid of categories. Use for relationship questions like
 * "which roles get which permission tiers".
 *
 * Color = count intensity. Hover any cell for the exact number.
 */
export function HeatmapPanel({
  title,
  subtitle,
  table,
  xColumn,
  yColumn,
  scheme = "blues",
  height = 320,
  selection,
}: HeatmapPanelProps) {
  const sharedSelection = useMosaicSelection();
  const sel = selection ?? sharedSelection;

  const plotRef = useRef<HTMLElement | null>(null);
  if (plotRef.current === null) {
    plotRef.current = vg.plot(
      vg.cell(
        vg.from(table, { filterBy: sel }),
        {
          x: xColumn,
          y: yColumn,
          fill: vg.count(),
          tip: true,
          inset: 0.5,
        },
      ),
      vg.colorScheme(scheme),
      vg.height(height),
      vg.marginLeft(160),
      vg.marginBottom(60),
      vg.marginTop(8),
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
      <div className="mb-2 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
        darker = more
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </ChartPanel>
  );
}
