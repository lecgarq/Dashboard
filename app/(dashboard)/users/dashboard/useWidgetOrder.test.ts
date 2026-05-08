// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useWidgetOrder } from "./useWidgetOrder";
import { DEFAULT_ORDER, WIDGET_ORDER_STORAGE_KEY } from "./widgetRegistry";

describe("useWidgetOrder", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns DEFAULT_ORDER when localStorage is empty (after mount effect)", async () => {
    const { result } = renderHook(() => useWidgetOrder());
    // Effect already ran by the time renderHook returns.
    await waitFor(() =>
      expect(result.current[0]).toEqual([...DEFAULT_ORDER])
    );
  });

  it("returns the stored order when localStorage holds a valid full-coverage array", async () => {
    const stored = [
      "admins", "recent", "flow", "outliers", "heatmap",
      "recommendations", "kpi", "tiers", "coverage",
    ];
    window.localStorage.setItem(WIDGET_ORDER_STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useWidgetOrder());
    await waitFor(() => expect(result.current[0]).toEqual(stored));
  });

  it("falls back to DEFAULT_ORDER when stored array is missing a known id", async () => {
    // Drop "admins" — stored set no longer covers DEFAULT_ORDER.
    const stored = [
      "coverage", "tiers", "kpi", "recommendations", "heatmap",
      "outliers", "flow", "recent",
    ];
    window.localStorage.setItem(WIDGET_ORDER_STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useWidgetOrder());
    await waitFor(() => expect(result.current[0]).toEqual([...DEFAULT_ORDER]));
  });

  it("falls back to DEFAULT_ORDER when stored array contains an unknown id", async () => {
    const stored = [
      "coverage", "tiers", "kpi", "recommendations", "heatmap",
      "outliers", "flow", "recent", "admins", "ghost",
    ];
    window.localStorage.setItem(WIDGET_ORDER_STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useWidgetOrder());
    await waitFor(() => expect(result.current[0]).toEqual([...DEFAULT_ORDER]));
  });

  it("falls back to DEFAULT_ORDER when localStorage holds non-JSON garbage (does not throw)", async () => {
    window.localStorage.setItem(WIDGET_ORDER_STORAGE_KEY, "{not json[");
    const { result } = renderHook(() => useWidgetOrder());
    await waitFor(() => expect(result.current[0]).toEqual([...DEFAULT_ORDER]));
  });

  it("setOrder writes JSON to localStorage and updates state", async () => {
    const { result } = renderHook(() => useWidgetOrder());
    await waitFor(() => expect(result.current[0]).toEqual([...DEFAULT_ORDER]));
    const next = [
      "admins", "recent", "flow", "outliers", "heatmap",
      "recommendations", "kpi", "tiers", "coverage",
    ];
    act(() => result.current[1](next));
    expect(result.current[0]).toEqual(next);
    expect(window.localStorage.getItem(WIDGET_ORDER_STORAGE_KEY)).toBe(
      JSON.stringify(next)
    );
  });
});
