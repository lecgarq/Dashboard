// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import type { EChartsOption } from "echarts";
import { mergeEChartsTheme, ECHARTS_DARK, ECHARTS_LIGHT } from "@/lib/colors/echartsTheme";

// ------------------------------------------------------------------
// Mocks for EChart wrapper tests
// ------------------------------------------------------------------

/** Capture the props passed to the ReactECharts stub */
const lastProps: Record<string, unknown>[] = [];

vi.mock("echarts-for-react", () => ({
  default: (props: Record<string, unknown>) => {
    lastProps.push(props);
    return React.createElement("div", { "data-testid": "echart" });
  },
}));

let _resolvedTheme: string | undefined = "dark";
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: _resolvedTheme }),
}));

// Helper to cast the result tooltip to a plain object for assertions
function tooltipBg(opt: EChartsOption): string | undefined {
  const t = opt.tooltip;
  if (!t || Array.isArray(t)) return undefined;
  return t.backgroundColor as string | undefined;
}

function tooltipBorder(opt: EChartsOption): string | undefined {
  const t = opt.tooltip;
  if (!t || Array.isArray(t)) return undefined;
  return t.borderColor as string | undefined;
}

// ------------------------------------------------------------------
// mergeEChartsTheme tests
// ------------------------------------------------------------------

describe("mergeEChartsTheme", () => {
  // Helper to read a nested axis label color without triggering strict TS errors
  function axisLabelColor(axis: unknown): unknown {
    return (axis as { axisLabel?: { color?: unknown } } | undefined)?.axisLabel?.color;
  }

  it("injects dark text and axis colors when dark=true", () => {
    const option: EChartsOption = {};
    const result = mergeEChartsTheme(option, true);
    expect(result.textStyle?.color).toBe(ECHARTS_DARK.text);
    expect(axisLabelColor(result.xAxis)).toBe(ECHARTS_DARK.axis);
    expect(axisLabelColor(result.yAxis)).toBe(ECHARTS_DARK.axis);
    expect(tooltipBg(result)).toBe(ECHARTS_DARK.tooltipBg);
    expect(tooltipBorder(result)).toBe(ECHARTS_DARK.tooltipBorder);
  });

  it("injects light text and axis colors when dark=false", () => {
    const option: EChartsOption = {};
    const result = mergeEChartsTheme(option, false);
    expect(result.textStyle?.color).toBe(ECHARTS_LIGHT.text);
    expect(axisLabelColor(result.xAxis)).toBe(ECHARTS_LIGHT.axis);
    expect(axisLabelColor(result.yAxis)).toBe(ECHARTS_LIGHT.axis);
    expect(tooltipBg(result)).toBe(ECHARTS_LIGHT.tooltipBg);
    expect(tooltipBorder(result)).toBe(ECHARTS_LIGHT.tooltipBorder);
  });

  it("leaves caller-provided series itemStyle color untouched", () => {
    // Use a plain object cast to avoid strict series discriminated-union checks
    const callerColor = "#ff6b6b";
    const option = {
      series: [{ type: "pie" as const, itemStyle: { color: callerColor }, data: [{ value: 5 }] }],
    } satisfies EChartsOption;
    const result = mergeEChartsTheme(option, true);
    // Access via cast to avoid echarts' narrow itemStyle type
    const series = result.series as { itemStyle?: { color?: string } }[] | undefined;
    expect(series?.[0]?.itemStyle?.color).toBe(callerColor);
  });

  it("is idempotent — calling twice returns equivalent output shape", () => {
    const option: EChartsOption = {};
    const once = mergeEChartsTheme(option, true);
    const twice = mergeEChartsTheme(once, true);
    expect(twice.textStyle?.color).toBe(ECHARTS_DARK.text);
    expect(tooltipBg(twice)).toBe(ECHARTS_DARK.tooltipBg);
  });

  it("does not mutate the original option object", () => {
    const option: EChartsOption = {};
    const original = JSON.stringify(option);
    mergeEChartsTheme(option, true);
    expect(JSON.stringify(option)).toBe(original);
  });

  it("enables the aria description component (decal stays off)", () => {
    const result = mergeEChartsTheme({}, true);
    expect(result.aria).toMatchObject({ enabled: true });
    expect((result.aria as { decal?: unknown })?.decal).toBeUndefined();
  });

  it("clamps series motion to the 200ms budget and swaps banned easings (no input mutation)", () => {
    const option = {
      animationDuration: 700,
      series: [
        {
          type: "pie" as const,
          animationEasing: "elasticOut" as const,
          animationDuration: 800,
          animationDurationUpdate: 550,
          data: [{ value: 5 }],
        },
      ],
    } satisfies EChartsOption;
    const before = JSON.stringify(option);
    const result = mergeEChartsTheme(option, true);
    const series = result.series as Record<string, unknown>[];
    expect(result.animationDuration).toBe(200);
    expect(series[0].animationDuration).toBe(200);
    expect(series[0].animationDurationUpdate).toBe(200);
    expect(series[0].animationEasing).toBe("cubicOut");
    // Caller's option object untouched — clamping copies, never mutates.
    expect(JSON.stringify(option)).toBe(before);
  });
});

// ------------------------------------------------------------------
// EChart wrapper tests
// ------------------------------------------------------------------
describe("EChart", () => {
  beforeEach(() => {
    lastProps.length = 0;
    _resolvedTheme = "dark";
  });

  it("renders the echarts-for-react stub", async () => {
    _resolvedTheme = "dark";
    const { EChart } = await import("@/components/ui/EChart");
    const { getByTestId } = render(
      React.createElement(EChart, { option: {} })
    );
    expect(getByTestId("echart")).toBeTruthy();
  });

  it("applies different palette on theme switch (key-remount observable via option change)", async () => {
    // React strips 'key' from props, so we verify by observing that the themed
    // option changes when resolvedTheme changes — which is the visible effect of
    // the key-based remount strategy (each theme produces a distinct option).
    _resolvedTheme = "dark";
    const { EChart } = await import("@/components/ui/EChart");
    render(React.createElement(EChart, { option: {} }));
    const darkOption = lastProps[lastProps.length - 1]?.option as EChartsOption;

    _resolvedTheme = "light";
    vi.resetModules();
    const { EChart: EChartLight } = await import("@/components/ui/EChart");
    render(React.createElement(EChartLight, { option: {} }));
    const lightOption = lastProps[lastProps.length - 1]?.option as EChartsOption;

    // Dark and light palettes must produce different tooltip backgrounds
    expect(tooltipBg(darkOption)).toBe(ECHARTS_DARK.tooltipBg);
    expect(tooltipBg(lightOption)).toBe(ECHARTS_LIGHT.tooltipBg);
    expect(tooltipBg(darkOption)).not.toBe(tooltipBg(lightOption));
  });

  it("applies dark chrome colors in the option when resolvedTheme=dark", async () => {
    _resolvedTheme = "dark";
    const { EChart } = await import("@/components/ui/EChart");
    render(React.createElement(EChart, { option: {} }));
    const passedOption = lastProps[lastProps.length - 1]?.option as EChartsOption;
    expect(tooltipBg(passedOption)).toBe(ECHARTS_DARK.tooltipBg);
  });

  it("applies light chrome colors in the option when resolvedTheme=light", async () => {
    _resolvedTheme = "light";
    const { EChart } = await import("@/components/ui/EChart");
    render(React.createElement(EChart, { option: {} }));
    const passedOption = lastProps[lastProps.length - 1]?.option as EChartsOption;
    expect(tooltipBg(passedOption)).toBe(ECHARTS_LIGHT.tooltipBg);
  });

  it("defaults to dark palette when resolvedTheme is undefined", async () => {
    _resolvedTheme = undefined;
    const { EChart } = await import("@/components/ui/EChart");
    render(React.createElement(EChart, { option: {} }));
    const passedOption = lastProps[lastProps.length - 1]?.option as EChartsOption;
    expect(tooltipBg(passedOption)).toBe(ECHARTS_DARK.tooltipBg);
  });
});
