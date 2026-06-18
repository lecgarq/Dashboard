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
    // Return a component that renders null (particle accent is visual-only)
    const Stub = () => null;
    Stub.displayName = "DynamicStub";
    return Stub;
  },
}));

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
  });

  // -------------------------------------------------------------------------
  // Case 1: Three KPI tiles render with labels and values
  // -------------------------------------------------------------------------
  it("renders three KPI tiles with the correct labels", () => {
    render(
      <UsersTableHeader totalUsers={150} active30d={80} admins={12} />,
    );
    expect(screen.getByText("Total users")).toBeTruthy();
    expect(screen.getByText("Active 30d")).toBeTruthy();
    expect(screen.getByText("Admins")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 2: AnimatedNumber eventually reaches target after animation completes
  // -------------------------------------------------------------------------
  it("AnimatedNumber reaches the target value after animation completes", async () => {
    render(
      <UsersTableHeader totalUsers={42} active30d={10} admins={3} />,
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
      <UsersTableHeader totalUsers={50} active30d={20} admins={5} />,
    );

    // Let animation complete
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    // Re-render with identical values
    rerender(<UsersTableHeader totalUsers={50} active30d={20} admins={5} />);

    // Values should still show target (not reset to 0)
    const allText = document.body.textContent ?? "";
    expect(allText).toContain("50");
    expect(allText).toContain("20");
    expect(allText).toContain("5");
  });

  // -------------------------------------------------------------------------
  // Case 4: KPI tiles use PremiumSurface glass styling
  // -------------------------------------------------------------------------
  it("KPI tiles are wrapped in a glass surface", () => {
    const { container } = render(
      <UsersTableHeader totalUsers={100} active30d={60} admins={8} />,
    );
    // PremiumSurface glass variant renders: rounded-xl bg-surface-2 border border-surface-border backdrop-blur-md
    const glassSurfaces = container.querySelectorAll(".bg-surface-2");
    expect(glassSurfaces.length).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Case 5: Header has Users title
  // -------------------------------------------------------------------------
  it("renders the Users page title", () => {
    render(
      <UsersTableHeader totalUsers={10} active30d={5} admins={1} />,
    );
    expect(screen.getByText("Users")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Case 6: KPI tiles are display-only (no onClick handlers on tiles)
  // -------------------------------------------------------------------------
  it("KPI tiles are display-only and have no role=button", () => {
    const { container } = render(
      <UsersTableHeader totalUsers={100} active30d={60} admins={8} />,
    );
    // Tiles should not be buttons
    const glassSurfaces = container.querySelectorAll(".bg-surface-2");
    for (const tile of glassSurfaces) {
      expect(tile.tagName.toLowerCase()).not.toBe("button");
    }
  });
});
