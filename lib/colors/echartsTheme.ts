/**
 * Canonical ECharts palette constants + pure merge helper.
 *
 * Pure module — no React, no DOM, no getComputedStyle.
 * Importable from both RSC and client components.
 */
import type { EChartsOption } from "echarts";

export interface EChartsPalette {
  /** Primary text color (legend labels, axis labels) */
  text: string;
  /** Secondary text color (subtitles, dimmed labels) */
  textDim: string;
  /** Faint text color (tooltips, annotations) */
  textFaint: string;
  /** Axis split-line color */
  axis: string;
  /** Tooltip background */
  tooltipBg: string;
  /** Tooltip border */
  tooltipBorder: string;
  /** Data-series chart colors (multi-color; callers may override) */
  chart: string[];
}

/** Dark theme palette — canonical values from RESEARCH.md §3 */
export const ECHARTS_DARK: EChartsPalette = {
  text: "#A1A1AA",         // zinc-400  — axis label / legend label
  textDim: "#E4E4E7",      // zinc-200  — tooltip title / chart title
  textFaint: "#FAFAFA",    // zinc-50   — strong heading
  axis: "#3F3F46",         // zinc-700  — split-line
  tooltipBg: "rgba(24,24,27,0.96)",   // zinc-900 96% — tooltip background
  tooltipBorder: "#3F3F46",           // zinc-700 — tooltip border
  chart: [
    "#6366f1", // indigo-500
    "#8b5cf6", // violet-500
    "#ec4899", // pink-500
    "#f59e0b", // amber-500
    "#10b981", // emerald-500
    "#06b6d4", // cyan-500
    "#f97316", // orange-500
    "#a78bfa", // violet-400
  ],
};

/** Light theme palette — canonical values from RESEARCH.md §3 */
export const ECHARTS_LIGHT: EChartsPalette = {
  text: "#374151",         // gray-700  — axis label / legend label
  textDim: "#111827",      // gray-900  — tooltip title / chart title
  textFaint: "#6B7280",    // gray-500  — annotations
  axis: "#E5E7EB",         // gray-200  — split-line
  tooltipBg: "rgba(255,255,255,0.98)",  // white 98% — tooltip background
  tooltipBorder: "#E5E7EB",             // gray-200 — tooltip border
  chart: [
    "#6366f1", // indigo-500
    "#8b5cf6", // violet-500
    "#ec4899", // pink-500
    "#f59e0b", // amber-500
    "#10b981", // emerald-500
    "#06b6d4", // cyan-500
    "#f97316", // orange-500
    "#a78bfa", // violet-400
  ],
};

/**
 * Pure function — injects ECharts axis/text/tooltip chrome colors from the
 * matching palette into `option`, WITHOUT overwriting any caller-provided
 * series `itemStyle` or `data` colors.
 *
 * Returns a new EChartsOption object (does not mutate the input).
 * Idempotent: calling it twice with the same args produces equivalent output.
 */
export function mergeEChartsTheme(option: EChartsOption, dark: boolean): EChartsOption {
  const p = dark ? ECHARTS_DARK : ECHARTS_LIGHT;

  // Shallow-copy the top level to avoid mutating the caller's object
  const base = { ...option };

  // -- textStyle (global text color) --
  base.textStyle = {
    color: p.text,
    ...base.textStyle,
  };

  // -- legend textStyle --
  if (base.legend !== undefined) {
    const legend = Array.isArray(base.legend) ? base.legend : [base.legend];
    base.legend = legend.map((l) => ({
      ...l,
      textStyle: { color: p.text, ...l?.textStyle },
    })) as EChartsOption["legend"];
  }

  // -- xAxis: inject axisLabel.color + splitLine color --
  // Always inject so charts without an explicit xAxis still get themed chrome.
  // axisLabel uses `axis` color (the dedicated axis/split-line palette entry).
  if (Array.isArray(base.xAxis)) {
    base.xAxis = base.xAxis.map((ax) => ({
      ...ax,
      axisLabel: { color: p.axis, ...ax?.axisLabel },
      splitLine: {
        ...ax?.splitLine,
        lineStyle: { color: p.axis, ...ax?.splitLine?.lineStyle },
      },
    })) as EChartsOption["xAxis"];
  } else {
    const ax = base.xAxis ?? {};
    base.xAxis = {
      ...ax,
      axisLabel: { color: p.axis, ...ax?.axisLabel },
      splitLine: {
        ...ax?.splitLine,
        lineStyle: { color: p.axis, ...ax?.splitLine?.lineStyle },
      },
    } as EChartsOption["xAxis"];
  }

  // -- yAxis: inject axisLabel.color + splitLine color --
  if (Array.isArray(base.yAxis)) {
    base.yAxis = base.yAxis.map((ax) => ({
      ...ax,
      axisLabel: { color: p.axis, ...ax?.axisLabel },
      splitLine: {
        ...ax?.splitLine,
        lineStyle: { color: p.axis, ...ax?.splitLine?.lineStyle },
      },
    })) as EChartsOption["yAxis"];
  } else {
    const ax = base.yAxis ?? {};
    base.yAxis = {
      ...ax,
      axisLabel: { color: p.axis, ...ax?.axisLabel },
      splitLine: {
        ...ax?.splitLine,
        lineStyle: { color: p.axis, ...ax?.splitLine?.lineStyle },
      },
    } as EChartsOption["yAxis"];
  }

  // -- tooltip: inject bg + border colors --
  if (base.tooltip !== undefined) {
    const tooltip = Array.isArray(base.tooltip) ? base.tooltip[0] : base.tooltip;
    base.tooltip = {
      backgroundColor: p.tooltipBg,
      borderColor: p.tooltipBorder,
      ...tooltip,
    } as EChartsOption["tooltip"];
  } else {
    base.tooltip = {
      backgroundColor: p.tooltipBg,
      borderColor: p.tooltipBorder,
    };
  }

  // NOTE: series[].itemStyle and series[].data are intentionally NOT touched.
  // Data-series color palettes remain caller-owned.

  return base;
}
