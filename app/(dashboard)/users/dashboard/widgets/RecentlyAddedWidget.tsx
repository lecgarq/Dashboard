"use client";

/**
 * Phase 04.1 Plan 03 — RecentlyAddedWidget rewrite (DASH-06).
 *
 * GitHub-style 90-day calendar heatmap. Replaces the prior table.
 *
 *   - 13 cols × 7 rows = 91 cells; first cell is a half-cell pad so the
 *     trailing column lands on `today`.
 *   - Color = scaleSequential(interpolateBlues) over per-day join count.
 *   - Window selector (7d / 30d / 90d, default 30d) dims out-of-band cells.
 *   - Click → SelectionContext setSelected({ kind: "day", dateIso, emails }).
 *   - Hover tooltip = aggregate count only (no member names — CONTEXT lock).
 *   - Local TZ bucketing via date-fns format("yyyy-MM-dd") (Pitfall 5).
 *   - Reduced-motion: entrance fade collapses to instant via useTransition.
 *   - Keyboard nav: arrow keys traverse, Enter dispatches setSelected.
 */

import { useCallback, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { motion } from "framer-motion";
import { timeDays } from "d3-time";
import { scaleSequential } from "d3-scale";
import { interpolateBlues } from "d3-scale-chromatic";
import {
  format,
  parseISO,
  startOfDay,
  subDays,
  differenceInCalendarDays,
} from "date-fns";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/acc/csvExport";
import type { BulkAccUser } from "@/lib/acc/acc-types";

import { useSelection } from "../selectionContext";
import {
  CELL_SPRING,
  HOVER_OPACITY_DIM,
  HOVER_OPACITY_FOCUS,
  useDashboardAccent,
} from "./_shared/dashboardTokens";
import { useTransition } from "./_shared/useTransition";
import { CalendarSkeleton } from "./_shared/WidgetSkeleton";

const WINDOWS = [7, 30, 90] as const;
type WindowDays = (typeof WINDOWS)[number];

const COLS = 13;
const ROWS = 7;
const CELL = 14;
const GAP = 2;
const PAD_LEFT = 8;
const PAD_TOP = 8;
const TOTAL_DAYS = 90;
const SVG_W = PAD_LEFT * 2 + COLS * (CELL + GAP) - GAP;
const SVG_H = PAD_TOP * 2 + ROWS * (CELL + GAP) - GAP;

interface DayCell {
  date: Date;
  dateIso: string;       // yyyy-MM-dd, local TZ
  emails: string[];
  count: number;
  col: number;
  row: number;
  cellIdx: number;       // 0..(COLS*ROWS)-1
}

export function RecentlyAddedWidget({ users }: { users: BulkAccUser[] }) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const { setSelected } = useSelection();
  const { neutral } = useDashboardAccent();
  const transition = useTransition(CELL_SPRING);

  // ----- bucket users by local-date string (Pitfall 5) ---------------------
  const countsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const u of users) {
      if (!u.addedOn) continue;
      let key: string;
      try {
        key = format(parseISO(u.addedOn), "yyyy-MM-dd");
      } catch {
        continue;
      }
      const arr = map.get(key);
      if (arr) arr.push(u.email);
      else map.set(key, [u.email]);
    }
    return map;
  }, [users]);

  // ----- 90-day grid -------------------------------------------------------
  const cells: DayCell[] = useMemo(() => {
    const today = startOfDay(new Date());
    const start = subDays(today, TOTAL_DAYS - 1);
    const days = timeDays(start, subDays(today, -1)); // inclusive of today
    // Layout 13×7 = 91 cells; offset days so the LAST cell lands on today.
    // First slot (idx 0) is a phantom pad cell.
    const padCount = COLS * ROWS - days.length; // typically 1
    const out: DayCell[] = [];
    for (let i = 0; i < days.length; i++) {
      const idx = i + padCount;
      const d = days[i]!;
      const dateIso = format(d, "yyyy-MM-dd");
      const emails = countsByDay.get(dateIso) ?? [];
      out.push({
        date: d,
        dateIso,
        emails,
        count: emails.length,
        col: Math.floor(idx / ROWS),
        row: idx % ROWS,
        cellIdx: idx,
      });
    }
    return out;
  }, [countsByDay]);

  const maxCount = useMemo(() => {
    let m = 0;
    for (const c of cells) if (c.count > m) m = c.count;
    return Math.max(1, m);
  }, [cells]);

  const colorScale = useMemo(
    () => scaleSequential(interpolateBlues).domain([0, maxCount]),
    [maxCount],
  );

  const today = useMemo(() => startOfDay(new Date()), []);

  // ----- empty state -------------------------------------------------------
  const totalAddedAnyTime = countsByDay.size;
  const totalInWindow = useMemo(
    () =>
      cells.reduce(
        (acc, c) =>
          differenceInCalendarDays(today, c.date) < windowDays
            ? acc + c.count
            : acc,
        0,
      ),
    [cells, windowDays, today],
  );

  // ----- CSV ---------------------------------------------------------------
  const handleDownload = useCallback(() => {
    const rows: Array<Record<string, string>> = [];
    for (const c of cells) {
      const inWindow = differenceInCalendarDays(today, c.date) < windowDays;
      if (!inWindow) continue;
      for (const email of c.emails) {
        const u = users.find((x) => x.email === email);
        rows.push({
          Date: c.dateIso,
          Email: email,
          Name: u?.name ?? "",
          CompanyRole: u?.companyRole ?? "",
        });
      }
    }
    downloadCsv(`recently-added-${windowDays}d.csv`, rows);
  }, [cells, today, users, windowDays]);

  // ----- keyboard nav ------------------------------------------------------
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (focusedIdx === null) return;
      const dx =
        e.key === "ArrowRight" ? ROWS : e.key === "ArrowLeft" ? -ROWS : 0;
      const dy =
        e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (dx === 0 && dy === 0 && e.key !== "Enter") return;
      e.stopPropagation();
      e.preventDefault();
      if (e.key === "Enter") {
        const c = cells.find((x) => x.cellIdx === focusedIdx);
        if (c && c.count > 0) {
          setSelected({ kind: "day", dateIso: c.dateIso, emails: c.emails });
        }
        return;
      }
      const next = focusedIdx + dx + dy;
      if (next >= 0 && next < COLS * ROWS) {
        setFocusedIdx(next);
      }
    },
    [cells, focusedIdx, setSelected],
  );

  // ----- loading / empty ---------------------------------------------------
  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <CalendarSkeleton width={SVG_W + 40} height={SVG_H + 20} />
      </div>
    );
  }

  if (totalAddedAnyTime === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled
          >
            <Download className="mr-2 size-4" />
            Download CSV
          </Button>
        </div>
        <p className="text-sm text-muted-foreground py-12 text-center">
          No recently-added members in last 90 days.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header: window selector + CSV button */}
      <div className="flex items-center justify-between gap-2">
        <span className="sr-only">
          {totalInWindow} members added in last {windowDays} days
        </span>
        <div
          className="inline-flex rounded-md border"
          role="group"
          aria-label="Window"
        >
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={windowDays === w}
              onClick={() => setWindowDays(w)}
              className={
                "px-3 py-1 text-xs first:rounded-l-md last:rounded-r-md " +
                (windowDays === w
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted")
              }
            >
              {w}d
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="mr-2 size-4" />
          Download CSV
        </Button>
      </div>

      {/* Heatmap */}
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-roledescription="90 day join calendar"
        aria-label={`${totalInWindow} members added in last ${windowDays} days`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => setFocusedIdx((p) => p ?? cells[cells.length - 1]?.cellIdx ?? 0)}
        style={{ outline: "none" }}
      >
        {cells.map((c) => {
          const x = PAD_LEFT + c.col * (CELL + GAP);
          const y = PAD_TOP + c.row * (CELL + GAP);
          const daysFromToday = differenceInCalendarDays(today, c.date);
          const inWindow = daysFromToday >= 0 && daysFromToday < windowDays;
          const targetOpacity = inWindow
            ? HOVER_OPACITY_FOCUS
            : HOVER_OPACITY_DIM;
          const fill = c.count === 0 ? neutral : colorScale(c.count);
          const isInteractive = c.count > 0;
          const focused = focusedIdx === c.cellIdx;

          return (
            <motion.rect
              key={c.cellIdx}
              x={x}
              y={y}
              width={CELL}
              height={CELL}
              rx={2}
              fill={fill}
              fillOpacity={c.count === 0 ? 0.35 : 1}
              stroke={focused ? "currentColor" : "none"}
              strokeWidth={focused ? 1.5 : 0}
              initial={{ opacity: 0 }}
              animate={{ opacity: targetOpacity }}
              transition={{
                ...transition,
                delay: c.col * 0.005,
              }}
              onClick={
                isInteractive
                  ? () =>
                      setSelected({
                        kind: "day",
                        dateIso: c.dateIso,
                        emails: c.emails,
                      })
                  : undefined
              }
              style={{
                cursor: isInteractive ? "pointer" : "default",
              }}
              aria-label={`${format(c.date, "PPP")}: ${c.count} member${
                c.count === 1 ? "" : "s"
              } added`}
            >
              <title>
                {`${format(c.date, "EEE MMM d")}: ${c.count} member${
                  c.count === 1 ? "" : "s"
                }`}
              </title>
            </motion.rect>
          );
        })}
      </svg>
    </div>
  );
}
