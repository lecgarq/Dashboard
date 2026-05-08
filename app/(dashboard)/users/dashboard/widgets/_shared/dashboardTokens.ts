"use client";

/**
 * Phase 04.1 Plan 01 — Single source of truth for dashboard widget palette + motion.
 *
 * Cosmos-leaning palette duplicated from graphRenderers.ts (#F8F7F4 bg, #9CA3AF dim grey).
 * Future refactor may extract a single Cosmos token module — Open Question 2 in
 * 04.1-RESEARCH.md.
 *
 * All four Wave-2 widgets (BubbleCluster, Treemap, CalendarHeatmap, Constellation)
 * consume these tokens; no widget should hard-code a hex or a spring config.
 */

import { useTheme } from "next-themes";
import type { Transition } from "framer-motion";

/* ------------------------------------------------------------------ palette */

export const SEVERITY_COLOR_LIGHT = {
  HIGH: "#EF4444",
  MEDIUM: "#F59E0B",
  LOW: "#3B82F6",
} as const;

export const SEVERITY_COLOR_DARK = {
  HIGH: "#FF6B6B",
  MEDIUM: "#FFB454",
  LOW: "#5DADE2",
} as const;

export const NEUTRAL_LIGHT = "#9CA3AF";
export const NEUTRAL_DARK = "#6B7280";

/** Cosmos focus glow leans cool — used for keyboard focus rings + selection halos. */
export const HIGHLIGHT_LIGHT = "#1D3557";
export const HIGHLIGHT_DARK = "#5DADE2";

/* ------------------------------------------------------------------ motion */

export const BUBBLE_SPRING: Transition = {
  type: "spring",
  stiffness: 180,
  damping: 22,
  mass: 1,
};

export const CELL_SPRING: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 26,
  mass: 1,
};

export const ORBIT_SPRING: Transition = {
  type: "spring",
  stiffness: 90,
  damping: 14,
  mass: 1.4,
};

/* ------------------------------------------------------------------ opacity */

export const HOVER_OPACITY_DIM = 0.4;
export const HOVER_OPACITY_FOCUS = 1.0;

/* ------------------------------------------------------------------ hooks */

export type SeverityColorMap = Readonly<Record<"HIGH" | "MEDIUM" | "LOW", string>>;

/**
 * Returns the severity color map for the active theme.
 * Resolves "system" via `resolvedTheme`. Defaults to light during SSR / hydration.
 */
export function useSeverityColor(): SeverityColorMap {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? SEVERITY_COLOR_DARK : SEVERITY_COLOR_LIGHT;
}

/**
 * Returns { neutral, highlight } for the active theme.
 */
export function useDashboardAccent(): { neutral: string; highlight: string } {
  const { resolvedTheme } = useTheme();
  if (resolvedTheme === "dark") {
    return { neutral: NEUTRAL_DARK, highlight: HIGHLIGHT_DARK };
  }
  return { neutral: NEUTRAL_LIGHT, highlight: HIGHLIGHT_LIGHT };
}
