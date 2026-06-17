// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { mergeEChartsTheme, ECHARTS_DARK, ECHARTS_LIGHT } from "@/lib/colors/echartsTheme";

describe("mergeEChartsTheme", () => {
  it("injects dark text and axis colors when dark=true", () => {
    const option = { series: [{ type: "bar", data: [1, 2, 3] }] };
    const result = mergeEChartsTheme(option, true);
    expect(result.textStyle?.color).toBe(ECHARTS_DARK.text);
    expect((result.xAxis as Record<string, unknown> | undefined)?.axisLabel?.color).toBe(ECHARTS_DARK.axis);
    expect((result.yAxis as Record<string, unknown> | undefined)?.axisLabel?.color).toBe(ECHARTS_DARK.axis);
    expect(result.tooltip?.backgroundColor).toBe(ECHARTS_DARK.tooltipBg);
    expect(result.tooltip?.borderColor).toBe(ECHARTS_DARK.tooltipBorder);
  });

  it("injects light text and axis colors when dark=false", () => {
    const option = { series: [{ type: "bar", data: [1, 2, 3] }] };
    const result = mergeEChartsTheme(option, false);
    expect(result.textStyle?.color).toBe(ECHARTS_LIGHT.text);
    expect((result.xAxis as Record<string, unknown> | undefined)?.axisLabel?.color).toBe(ECHARTS_LIGHT.axis);
    expect((result.yAxis as Record<string, unknown> | undefined)?.axisLabel?.color).toBe(ECHARTS_LIGHT.axis);
    expect(result.tooltip?.backgroundColor).toBe(ECHARTS_LIGHT.tooltipBg);
    expect(result.tooltip?.borderColor).toBe(ECHARTS_LIGHT.tooltipBorder);
  });

  it("leaves caller-provided series itemStyle color untouched", () => {
    const option = {
      series: [{ type: "pie", itemStyle: { color: "#ff6b6b" }, data: [{ value: 5 }] }],
    };
    const result = mergeEChartsTheme(option, true);
    expect(result.series?.[0]?.itemStyle?.color).toBe("#ff6b6b");
  });

  it("is idempotent — calling twice returns equivalent output shape", () => {
    const option = { series: [{ type: "line", data: [1, 2, 3] }] };
    const once = mergeEChartsTheme(option, true);
    const twice = mergeEChartsTheme(once, true);
    expect(twice.textStyle?.color).toBe(ECHARTS_DARK.text);
    expect(twice.tooltip?.backgroundColor).toBe(ECHARTS_DARK.tooltipBg);
  });

  it("does not mutate the original option object", () => {
    const option = { series: [{ type: "bar", data: [1] }] };
    const original = JSON.stringify(option);
    mergeEChartsTheme(option, true);
    expect(JSON.stringify(option)).toBe(original);
  });
});
