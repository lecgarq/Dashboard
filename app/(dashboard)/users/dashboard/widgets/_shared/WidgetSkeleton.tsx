"use client";

/**
 * Phase 04.1 Plan 01 — Per-widget shape-matched skeletons.
 *
 * Replaces the generic shadcn `Skeleton` blocks for the four Wave-2 widgets
 * with ghost shapes that match each widget's final layout (bubble cluster,
 * treemap, calendar, orbit constellation). Pulse animation respects
 * `prefers-reduced-motion` via `useTransition`.
 *
 * Skeletons are zero-cost: positions are static (no d3 layout, no data).
 */

import { motion } from "framer-motion";
import { NEUTRAL_LIGHT } from "./dashboardTokens";
import { useTransition } from "./useTransition";

const PULSE_SPRING = { duration: 1.6, repeat: Infinity, ease: "easeInOut" } as const;

interface SizeProps {
  width?: number;
  height?: number;
}

function usePulse() {
  // useTransition collapses to { duration: 0 } when reduce is requested,
  // which disables the repeat semantically — animate prop becomes a no-op
  // because opacity stays at the first keyframe.
  return useTransition(PULSE_SPRING);
}

/* ------------------------------------------------------------------ Bubble */

const BUBBLE_GHOSTS: { cx: number; cy: number; r: number }[] = [
  { cx: 120, cy: 120, r: 32 },
  { cx: 200, cy: 90, r: 22 },
  { cx: 260, cy: 160, r: 40 },
  { cx: 180, cy: 200, r: 28 },
  { cx: 100, cy: 220, r: 24 },
  { cx: 320, cy: 100, r: 18 },
  { cx: 380, cy: 200, r: 30 },
  { cx: 460, cy: 140, r: 26 },
  { cx: 520, cy: 230, r: 34 },
  { cx: 410, cy: 290, r: 22 },
];

export function BubbleSkeleton({ width = 600, height = 360 }: SizeProps) {
  const transition = usePulse();
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Loading bubble cluster"
    >
      {BUBBLE_GHOSTS.map((g, i) => (
        <motion.circle
          key={i}
          cx={g.cx}
          cy={g.cy}
          r={g.r}
          fill={NEUTRAL_LIGHT}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={transition}
        />
      ))}
    </svg>
  );
}

/* ----------------------------------------------------------------- Treemap */

const TREEMAP_GHOSTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 8, y: 8, w: 200, h: 200 },
  { x: 216, y: 8, w: 136, h: 96 },
  { x: 216, y: 112, w: 64, h: 96 },
  { x: 288, y: 112, w: 64, h: 96 },
  { x: 8, y: 216, w: 96, h: 136 },
  { x: 112, y: 216, w: 96, h: 80 },
  { x: 216, y: 216, w: 136, h: 64 },
  { x: 112, y: 304, w: 240, h: 48 },
];

export function TreemapSkeleton({ width = 360, height = 360 }: SizeProps) {
  const transition = usePulse();
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Loading treemap"
    >
      {TREEMAP_GHOSTS.map((g, i) => (
        <motion.rect
          key={i}
          x={g.x}
          y={g.y}
          width={g.w}
          height={g.h}
          rx={4}
          fill={NEUTRAL_LIGHT}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={transition}
        />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- Calendar */

const CAL_ROWS = 7;
const CAL_COLS = 13;

export function CalendarSkeleton({
  width = 360,
  height = 200,
}: SizeProps) {
  const transition = usePulse();
  const cellW = (width - 16) / CAL_COLS;
  const cellH = (height - 16) / CAL_ROWS;
  const gap = 2;
  const cells: { x: number; y: number; idx: number }[] = [];
  for (let r = 0; r < CAL_ROWS; r++) {
    for (let c = 0; c < CAL_COLS; c++) {
      cells.push({
        x: 8 + c * cellW + gap / 2,
        y: 8 + r * cellH + gap / 2,
        idx: r * CAL_COLS + c,
      });
    }
  }
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Loading calendar heatmap"
    >
      {cells.map((c) => (
        <motion.rect
          key={c.idx}
          x={c.x}
          y={c.y}
          width={Math.max(0, cellW - gap)}
          height={Math.max(0, cellH - gap)}
          rx={2}
          fill={NEUTRAL_LIGHT}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={transition}
        />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------- Orbit */

export function OrbitSkeleton({ width = 320, height = 320 }: SizeProps) {
  const transition = usePulse();
  const cx = width / 2;
  const cy = height / 2;
  const orbitR = Math.min(width, height) / 2 - 30;
  const dots = Array.from({ length: 5 }, (_, i) => {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    return {
      cx: cx + Math.cos(angle) * orbitR,
      cy: cy + Math.sin(angle) * orbitR,
    };
  });
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Loading admin constellation"
    >
      <circle
        cx={cx}
        cy={cy}
        r={orbitR}
        fill="none"
        stroke={NEUTRAL_LIGHT}
        strokeOpacity={0.25}
        strokeDasharray="3 4"
      />
      <motion.circle
        cx={cx}
        cy={cy}
        r={18}
        fill={NEUTRAL_LIGHT}
        initial={{ opacity: 0.3 }}
        animate={{ opacity: [0.3, 0.6, 0.3] }}
        transition={transition}
      />
      {dots.map((d, i) => (
        <motion.circle
          key={i}
          cx={d.cx}
          cy={d.cy}
          r={10}
          fill={NEUTRAL_LIGHT}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={transition}
        />
      ))}
    </svg>
  );
}
