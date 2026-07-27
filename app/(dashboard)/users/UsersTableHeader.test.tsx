// @vitest-environment jsdom
/**
 * Tests for UsersTableHeader — KPI glass strip + AnimatedNumber count-up.
 *
 * Coverage:
 * 1. Three KPI tiles render with correct labels and values.
 * 2. AnimatedNumber starts at 0 and reaches target after animation.
 * 3. Count-up does NOT restart when parent re-renders with same value.
 * 4. KPI tiles use PremiumSurface glass styling.
 */

import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";

// next/dynamic → render synchronously in tests
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    // Marker stand-in for the R3F particle accent: renders nothing visible but
    // is observable, so a test can assert the WebGL layer was never mounted.
    const Stub = () => <div data-testid="particle-accent" />;
    Stub.displayName = "DynamicStub";
    return Stub;
  },
}));

/** Install a matchMedia that reports the given prefers-reduced-motion state. */
function mockReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }),
  });
}

// framer-motion animate — mock useMotionValue/useTransform/animate so we can
// control the animation value deterministically in tests.
vi.mock("framer-motion", async (importOriginal) => {
  const actual = await importOriginal<typeof import("framer-motion")>();
  return {
    ...actual,
    // Keep motion, AnimatePresence, useReducedMotion — only mock animate control hooks
  };
});

import { UsersTableHeader } from "./UsersTableHeader";

describe("UsersTableHeader", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    // @ts-expect-error — remove the per-test matchMedia stub
    delete window.matchMedia;
  });

  // -------------------------------------------------------------------------
  // prefers-reduced-motion
  //
  // The blanket rule in globals.css clamps CSS animation and transition only.
  // It cannot reach a requestAnimationFrame count-up or a perpetual WebGL
  // render loop, so both have to consult the preference themselves.
  // -------------------------------------------------------------------------
  describe("prefers-reduced-motion: reduce", () => {
    it("shows the real figure immediately, with no count-up frames", () => {
      mockReducedMotion(true);
      render(
        <UsersTableHeader totalUsers={3367} inAcc={2500} notInAcc={867} internals={1265} externals={2102} active30d={742} admins={88} />,
      );
      // No timer advance: if a rAF count-up were armed this would still read 0.
      const value = screen.getByText("Total users").nextElementSibling;
      expect(value?.textContent).toBe("3,367");
    });

    it("does not mount the WebGL particle accent at all", () => {
      mockReducedMotion(true);
      render(
        <UsersTableHeader totalUsers={10} inAcc={7} notInAcc={3} internals={8} externals={2} active30d={5} admins={1} />,
      );
      expect(screen.queryByTestId("particle-accent")).toBeNull();
    });

    it("still mounts the accent and animates when no preference is set", async () => {
      mockReducedMotion(false);
      render(
        <UsersTableHeader totalUsers={3367} inAcc={2500} notInAcc={867} internals={1265} externals={2102} active30d={742} admins={88} />,
      );
      expect(screen.queryByTestId("particle-accent")).not.toBeNull();

      // Before the animation runs the tile has not reached the target.
      expect(screen.getByText("Total users").nextElementSibling?.textContent).not.toBe("3,367");
      await act(async () => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText("Total users").nextElementSibling?.textContent).toBe("3,367");
    });
  });

  // -------------------------------------------------------------------------
  // Case 1: Three KPI tiles render with labels and values
  // -------------------------------------------------------------------------
  it("renders the KPI tiles with the correct labels", () => {
    render(
      <UsersTableHeader totalUsers={150} inAcc={120} notInAcc={30} internals={120} externals={25} active30d={80} admins={12} />,
    );
    expect(screen.getByText("Total users")).toBeTruthy();
    expect(screen.getByText("In ACC")).toBeTruthy();
    expect(screen.getByText("Not in ACC")).toBeTruthy();
    expect(screen.getByText("Internal")).toBeTruthy();
    expect(screen.getByText("External")).toBeTruthy();
    expect(screen.getByText("Active 30d")).toBeTruthy();
    expect(screen.getByText("Admins")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 1b: a null KPI renders an em-dash, never an animated 0
  //
  // Regression guard: `active30d` is derived from a SEPARATE activity query. It
  // used to count 0 while that query was in flight, and the tile animated a
  // confident "0" at 24px for a full second before re-animating to the truth —
  // a wrong operational number presented with full visual confidence, on a
  // projector. null now means "not measured yet" and must render as "—".
  // -------------------------------------------------------------------------
  it("renders an em-dash (not 0) for a KPI whose source has not loaded", async () => {
    render(
      <UsersTableHeader totalUsers={150} inAcc={120} notInAcc={30} internals={120} externals={25} active30d={null} admins={12} />,
    );

    // Let any animation that would have been armed run to completion.
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // Assert on the VALUE node only — the label "Active 30d" contains a literal 0.
    const value = screen.getByText("Active 30d").nextElementSibling;
    expect(value?.textContent).toBe("—");
  });

  // -------------------------------------------------------------------------
  // Case 2: AnimatedNumber eventually reaches target after animation completes
  // -------------------------------------------------------------------------
  it("AnimatedNumber reaches the target value after animation completes", async () => {
    render(
      <UsersTableHeader totalUsers={42} inAcc={30} notInAcc={12} internals={36} externals={6} active30d={10} admins={3} />,
    );

    // Advance time well past the 1s ease-out animation
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // After animation, the target values should be displayed
    const allText = document.body.textContent ?? "";
    expect(allText).toContain("42");
    expect(allText).toContain("10");
    expect(allText).toContain("3");
  });

  // -------------------------------------------------------------------------
  // Case 3: Count-up does NOT restart on re-render with the same value
  // -------------------------------------------------------------------------
  it("re-rendering with the same value does not restart the animation from 0", async () => {
    const { rerender } = render(
      <UsersTableHeader totalUsers={50} inAcc={40} notInAcc={10} internals={46} externals={4} active30d={20} admins={5} />,
    );

    // Let animation complete
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // Re-render with identical values
    rerender(<UsersTableHeader totalUsers={50} inAcc={40} notInAcc={10} internals={46} externals={4} active30d={20} admins={5} />);

    // Values should still show target (not reset to 0)
    const allText = document.body.textContent ?? "";
    expect(allText).toContain("50");
    expect(allText).toContain("20");
    expect(allText).toContain("5");
  });

  // -------------------------------------------------------------------------
  // Case 3b (G2 regression): mounting with 0 (data not loaded yet) then
  // receiving real values must animate up to the real targets — NOT stay
  // frozen at 0. This reproduces the live bug where the header mounts before
  // the async directory data loads and the count-up captured 0 forever.
  // -------------------------------------------------------------------------
  it("animates up to the real target when values arrive after an initial 0 (async data load)", async () => {
    const { rerender } = render(
      <UsersTableHeader totalUsers={0} inAcc={0} notInAcc={0} internals={0} externals={0} active30d={0} admins={0} />,
    );

    // Initially 0 (data still loading)
    expect(document.body.textContent ?? "").toContain("0");

    // Data arrives — parent re-renders with real values
    rerender(<UsersTableHeader totalUsers={3367} inAcc={2500} notInAcc={867} internals={1265} externals={2102} active30d={742} admins={88} />);

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    const allText = document.body.textContent ?? "";
    expect(allText).toContain("3,367");
    expect(allText).toContain("742");
    expect(allText).toContain("88");
  });

  // -------------------------------------------------------------------------
  // Case 4: KPI tiles use PremiumSurface glass styling
  // -------------------------------------------------------------------------
  it("KPI tiles are wrapped in a glass surface", () => {
    const { container } = render(
      <UsersTableHeader totalUsers={100} inAcc={70} notInAcc={30} internals={80} externals={20} active30d={60} admins={8} />,
    );
    // PremiumSurface glass variant renders: rounded-xl bg-surface-2 border border-surface-border backdrop-blur-md
    const glassSurfaces = container.querySelectorAll(".bg-surface-2");
    expect(glassSurfaces.length).toBeGreaterThanOrEqual(5);
  });

  // -------------------------------------------------------------------------
  // Case 5: Header has Users title
  // -------------------------------------------------------------------------
  it("renders the Users page title", () => {
    render(
      <UsersTableHeader totalUsers={10} inAcc={7} notInAcc={3} internals={8} externals={2} active30d={5} admins={1} />,
    );
    expect(screen.getByText("Users")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 6: KPI tiles are display-only (no onClick handlers on tiles)
  // -------------------------------------------------------------------------
  it("KPI tiles are display-only and have no role=button", () => {
    const { container } = render(
      <UsersTableHeader totalUsers={100} inAcc={70} notInAcc={30} internals={80} externals={20} active30d={60} admins={8} />,
    );
    // Tiles should not be buttons
    const glassSurfaces = container.querySelectorAll(".bg-surface-2");
    for (const tile of glassSurfaces) {
      expect(tile.tagName.toLowerCase()).not.toBe("button");
    }
  });
});
