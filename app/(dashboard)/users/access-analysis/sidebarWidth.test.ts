// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  clampSidebarWidth,
  loadSidebarWidth,
  saveSidebarWidth,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from "./sidebarWidth";

describe("clampSidebarWidth", () => {
  it("returns the value unchanged when within range", () => {
    expect(clampSidebarWidth(420)).toBe(420);
  });

  it("clamps below the minimum", () => {
    expect(clampSidebarWidth(SIDEBAR_MIN_WIDTH - 100)).toBe(SIDEBAR_MIN_WIDTH);
  });

  it("clamps above the maximum", () => {
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH + 100)).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("rounds fractional pixels", () => {
    expect(clampSidebarWidth(420.7)).toBe(421);
  });

  it("falls back to the default for non-finite input", () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_DEFAULT_WIDTH);
    expect(clampSidebarWidth(Number.POSITIVE_INFINITY)).toBe(SIDEBAR_MAX_WIDTH);
  });
});

describe("loadSidebarWidth / saveSidebarWidth", () => {
  beforeEach(() => window.localStorage.clear());

  it("returns the default when nothing is stored", () => {
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("round-trips a clamped width through localStorage", () => {
    saveSidebarWidth(500);
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("500");
    expect(loadSidebarWidth()).toBe(500);
  });

  it("clamps an out-of-range stored value on read", () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(SIDEBAR_MAX_WIDTH + 999));
    expect(loadSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("returns the default for a corrupt stored value", () => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, "not-a-number");
    expect(loadSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });
});
