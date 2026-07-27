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
  // LECG brand categorical (validated: lightness band, chroma floor, CVD, 3:1 on #18181B)
  chart: [
    "#4E8CCB", // azul oscuro (lightened for dark)
    "#E2683A", // naranja
    "#0E98A8", // seaweed
    "#BA8A0E", // goldenrod
    "#B4679C", // wine (lightened)
    "#849C4C", // palm
    "#3A9DBF", // pale/state blue → sky step
    "#E05B55", // warm red (lightened)
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
  // LECG brand categorical (validated: lightness band, chroma floor, CVD, 3:1 on #FFFFFF)
  chart: [
    "#2E5F95", // azul oscuro
    "#E65A28", // naranja (brand exact)
    "#0089A3", // seaweed
    "#B0810A", // goldenrod (darkened for light)
    "#7E3567", // wine
    "#68803A", // palm
    "#1B80B3", // pale/state blue → sky step
    "#C42021", // warm red (brand exact)
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

  // -- aria: screen readers get a generated chart description --
  // (aria.decal stays OFF — it would repaint every series with pattern fills.)
  base.aria = { enabled: true, ...base.aria };

  // -- motion clamp (DESIGN.md §7/§9: ≤200ms, ease-out, no bounces) --
  // Charts kept shipping 550–800ms elasticOut entrances; clamping here fixes
  // every chart at the one shared boundary instead of per-option edits.
  clampMotion(base as unknown as Record<string, unknown>);
  if (Array.isArray(base.series)) {
    base.series = base.series.map((s) => {
      const copy = { ...(s as Record<string, unknown>) };
      clampMotion(copy);
      return copy;
    }) as EChartsOption["series"];
  } else if (base.series) {
    const copy = { ...(base.series as Record<string, unknown>) };
    clampMotion(copy);
    base.series = copy as EChartsOption["series"];
  }

  // NOTE: series[].itemStyle and series[].data are intentionally NOT touched.
  // Data-series color palettes remain caller-owned.

  return base;
}

const MOTION_MS_CAP = 200;
const BANNED_EASING = /elastic|bounce|back/i;

/** Mutates a freshly-copied option/series object: caps numeric animation
 *  durations at 200ms and swaps banned easings for cubicOut. Function-valued
 *  durations (per-datum staggers) are left alone. */
function clampMotion(obj: Record<string, unknown>): void {
  for (const key of ["animationDuration", "animationDurationUpdate"]) {
    const v = obj[key];
    if (typeof v === "number" && v > MOTION_MS_CAP) obj[key] = MOTION_MS_CAP;
  }
  for (const key of ["animationEasing", "animationEasingUpdate"]) {
    const v = obj[key];
    if (typeof v === "string" && BANNED_EASING.test(v)) obj[key] = "cubicOut";
  }
}
