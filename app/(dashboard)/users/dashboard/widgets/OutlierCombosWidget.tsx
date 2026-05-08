"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy,
  treemap,
  treemapSquarify,
  type HierarchyRectangularNode,
} from "d3-hierarchy";
import { scaleSequential } from "d3-scale";
import { interpolateOranges } from "d3-scale-chromatic";
import { motion, AnimatePresence } from "framer-motion";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { OutlierFinding } from "@/lib/acc/dashboardAnalytics";
import { useFindings } from "../findingsContext";
import { useSelection } from "../selectionContext";
import { CELL_SPRING, useDashboardAccent } from "./_shared/dashboardTokens";
import { useTransition } from "./_shared/useTransition";
import { useHoverSpotlight } from "./_shared/HoverSpotlight";
import { FocusRing } from "./_shared/FocusRing";
import { TreemapSkeleton } from "./_shared/WidgetSkeleton";

/**
 * Phase 04.1 Plan 02 — OutlierCombos as a squarified treemap (DASH-05 / DASH-09).
 *
 * Cell area = affected-member count; color intensity = rarity (lower pct → deeper orange).
 * No member names in the canvas — click opens existing DashboardSidePanel via
 * `selectionContext`.
 */

const W = 360;
const H = 320;

type LeafData = {
  _id: string;
  _data: OutlierFinding;
  _value: number;
  _children?: never;
};

type RootNode = { _children?: LeafData[]; _value?: number };

type PositionedCell = {
  id: string;
  data: OutlierFinding;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

export function OutlierCombosWidget(_props: {
  users?: unknown;
  workspaceEmails?: unknown;
}) {
  const findings = useFindings();
  const { selected, setSelected } = useSelection();
  const accent = useDashboardAccent();
  const transition = useTransition(CELL_SPRING);
  const { getOpacity, bind, hoveredId } = useHoverSpotlight();
  const [focusIndex, setFocusIndex] = useState<number>(-1);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const rows = findings.outlierCombos;

  // Domain reversed so rarer (smaller pct) → deeper orange. <5% → near-black-orange.
  const colorScale = useMemo(
    () => scaleSequential(interpolateOranges).domain([0.05, 0]),
    [],
  );

  const positioned = useMemo<PositionedCell[]>(() => {
    if (rows.length === 0) return [];
    const leaves: LeafData[] = rows.map((r) => ({
      _id: r.moduleSet.join(",") || "(empty)",
      _data: r,
      _value: r.affectedMembers.length || 1,
    }));
    const rootData: RootNode = { _children: leaves };
    const root = hierarchy<RootNode | LeafData>(
      rootData,
      (n) => (n as RootNode)._children,
    ).sum((d) => (d as LeafData)._value ?? 0);

    const layout = treemap<RootNode | LeafData>()
      .size([W, H])
      .tile(treemapSquarify)
      .padding(2);

    const packed = layout(root);
    const out: PositionedCell[] = [];
    for (const node of packed.leaves() as HierarchyRectangularNode<
      RootNode | LeafData
    >[]) {
      const leaf = node.data as LeafData;
      out.push({
        id: leaf._id,
        data: leaf._data,
        x0: node.x0,
        y0: node.y0,
        x1: node.x1,
        y1: node.y1,
      });
    }
    return out;
  }, [rows]);

  useEffect(() => {
    if (focusIndex >= positioned.length) {
      setFocusIndex(positioned.length === 0 ? -1 : positioned.length - 1);
    }
  }, [positioned.length, focusIndex]);

  function handleSelect(cell: PositionedCell) {
    setSelected({ kind: "outlier", finding: cell.data });
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (positioned.length === 0) return;
    const k = event.key;
    if (
      k === "ArrowRight" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowUp" ||
      k === "Enter" ||
      k === " "
    ) {
      event.stopPropagation();
      event.preventDefault();
    }
    if (k === "ArrowRight" || k === "ArrowDown") {
      setFocusIndex((i) => (i + 1) % positioned.length);
    } else if (k === "ArrowLeft" || k === "ArrowUp") {
      setFocusIndex((i) => (i <= 0 ? positioned.length - 1 : i - 1));
    } else if (k === "Enter" || k === " ") {
      const target = positioned[focusIndex >= 0 ? focusIndex : 0];
      if (target) handleSelect(target);
    }
  }

  function isSelectedCell(cell: PositionedCell): boolean {
    if (!selected || selected.kind !== "outlier") return false;
    return selected.finding.moduleSet.join(",") === cell.data.moduleSet.join(",");
  }

  function cellOpacity(cell: PositionedCell): number {
    if (isSelectedCell(cell)) return 1;
    return getOpacity(`outliers:${cell.id}`);
  }

  function handleDownload() {
    downloadCsv(
      "outlier-combos.csv",
      rows.map((r) => ({
        ModuleSet: r.moduleSet.join(", "),
        Members: r.affectedMembers.length,
        MemberCount: r.memberCount,
        TotalMembers: r.totalMembers,
        Percent: (r.pct * 100).toFixed(2),
      })),
    );
  }

  const isLoading = rows.length === 0 && findings.junkRoles.length === 0 &&
    findings.duplicateRoles.length === 0 && findings.roleSeverityIndex.size === 0;

  const header = (
    <div className="flex items-center justify-end">
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={rows.length === 0}
      >
        <Download className="mr-2 size-4" />
        Download CSV
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <TreemapSkeleton width={W} height={H} />
      </div>
    );
  }

  if (positioned.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {header}
        <div
          className="flex items-center justify-center text-sm text-muted-foreground text-center px-4"
          style={{ height: H }}
        >
          No outlier combinations (all module sets held by ≥5%)
        </div>
      </div>
    );
  }

  const focusedCell =
    focusIndex >= 0 && focusIndex < positioned.length
      ? positioned[focusIndex]
      : null;
  const selectedCell = positioned.find(isSelectedCell) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {header}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto outline-none"
        role="img"
        aria-roledescription="module-set treemap"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (focusIndex < 0 && positioned.length > 0) setFocusIndex(0);
        }}
      >
        <title>{positioned.length} outlier module combinations</title>
        <AnimatePresence>
          {positioned.map((cell, i) => {
            const id = `outliers:${cell.id}`;
            const w = cell.x1 - cell.x0;
            const h = cell.y1 - cell.y0;
            const fill = colorScale(cell.data.pct) ?? accent.neutral;
            const opacity = cellOpacity(cell);
            const isFocused = focusIndex === i;
            const showLabel = w > 60 && h > 24;
            const labelText =
              cell.data.moduleSet.length === 0
                ? "(none)"
                : cell.data.moduleSet[0];
            return (
              <motion.g
                key={id}
                role="button"
                tabIndex={-1}
                aria-label={`Module set ${cell.data.moduleSet.join(", ") || "(none)"}, ${cell.data.affectedMembers.length} members, ${(cell.data.pct * 100).toFixed(1)}%`}
                style={{ cursor: "pointer", outline: "none" }}
                {...bind(id)}
                onClick={() => handleSelect(cell)}
                initial={{ opacity: 0 }}
                animate={{ opacity, x: cell.x0, y: cell.y0 }}
                exit={{ opacity: 0 }}
                transition={transition}
                layoutId={`outliers:${cell.id || "empty"}`}
              >
                <title>
                  {cell.data.moduleSet.join(", ") || "(no modules)"} —{" "}
                  {cell.data.affectedMembers.length} members (
                  {(cell.data.pct * 100).toFixed(1)}%)
                </title>
                <motion.rect
                  width={w}
                  height={h}
                  rx={2}
                  fill={fill}
                  stroke="rgba(0,0,0,0.15)"
                  strokeWidth={1}
                  initial={{ width: w, height: h }}
                  animate={{ width: w, height: h }}
                  transition={transition}
                />
                {showLabel && (
                  <text
                    x={6}
                    y={16}
                    fontSize={11}
                    fontWeight={500}
                    fill="rgba(0,0,0,0.85)"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {labelText.length > Math.max(2, Math.floor(w / 7))
                      ? labelText.slice(0, Math.max(2, Math.floor(w / 7))) + "…"
                      : labelText}
                  </text>
                )}
              </motion.g>
            );
          })}
        </AnimatePresence>
        {focusedCell && (
          <FocusRing
            shape="rect"
            x={focusedCell.x0 - 1}
            y={focusedCell.y0 - 1}
            width={focusedCell.x1 - focusedCell.x0 + 2}
            height={focusedCell.y1 - focusedCell.y0 + 2}
            rx={3}
            visible
          />
        )}
        {selectedCell && selectedCell !== focusedCell && (
          <FocusRing
            shape="rect"
            x={selectedCell.x0 - 1}
            y={selectedCell.y0 - 1}
            width={selectedCell.x1 - selectedCell.x0 + 2}
            height={selectedCell.y1 - selectedCell.y0 + 2}
            rx={3}
            visible
          />
        )}
        {hoveredId && (() => {
          const hovered = positioned.find((c) => `outliers:${c.id}` === hoveredId);
          if (!hovered) return null;
          if (hovered === focusedCell || hovered === selectedCell) return null;
          return (
            <rect
              x={hovered.x0 - 0.5}
              y={hovered.y0 - 0.5}
              width={hovered.x1 - hovered.x0 + 1}
              height={hovered.y1 - hovered.y0 + 1}
              rx={2.5}
              fill="none"
              stroke={accent.highlight}
              strokeOpacity={0.45}
              strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
          );
        })()}
      </svg>
    </div>
  );
}
