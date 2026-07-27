"use client";
/**
 * Canonical theme-aware EChart wrapper.
 *
 * - Reads resolvedTheme ONCE via next-themes (single hook call).
 * - Injects axis/text/tooltip chrome via mergeEChartsTheme (pure fn — no DOM reads).
 * - Passes key={resolvedTheme} to force a clean canvas remount on theme switch.
 * - Preserves the existing prop surface: option, height, onEvents, notMerge.
 * - Accepts optional className for layout control.
 *
 * This is the only EChart wrapper. Every chart must route through it so the
 * theme merge is never bypassed.
 */
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useTheme } from "next-themes";
import { mergeEChartsTheme } from "@/lib/colors/echartsTheme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface EChartProps {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<
    string,
    (params: { name?: string; data?: unknown; seriesName?: string }) => void
  >;
  /** Pass false to let ECharts diff + animate option updates instead of re-initialising. */
  notMerge?: boolean;
  className?: string;
}

export function EChart({
  option,
  height = 280,
  onEvents,
  notMerge = true,
  className,
}: EChartProps) {
  const { resolvedTheme } = useTheme();
  const reducedMotion = useReducedMotion();

  // Default to dark before next-themes resolves (avoids dark→light flash for dark users;
  // Pitfall 4 from RESEARCH.md §7).
  const dark = resolvedTheme !== "light";

  const themed = mergeEChartsTheme(option, dark);
  // DESIGN.md §7: honor prefers-reduced-motion — charts render instantly.
  if (reducedMotion) themed.animation = false;

  return (
    <ReactECharts
      key={resolvedTheme}
      option={themed}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge={notMerge}
      lazyUpdate
      onEvents={onEvents}
      className={className}
    />
  );
}
