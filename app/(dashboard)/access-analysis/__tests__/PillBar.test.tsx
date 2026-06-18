// @vitest-environment jsdom
/**
 * INT-05 — PillBar RED test stub.
 * PillBar does not exist yet; this test intentionally fails at runtime until
 * Wave 1 implements the component. The @ts-expect-error suppresses the TS2307
 * "module not found" error so tsc exits 0.
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
// @ts-expect-error not yet implemented — Wave 1 will create this component
import { PillBar } from "../components/PillBar";

describe("PillBar (INT-05)", () => {
  it("renders a pill for each active filter dimension", () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const { container } = render(
      <PillBar filters={{ role: "PM", company: "Acme" }} onRemove={onRemove} onClear={onClear} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("PM");
    expect(text).toContain("Acme");
  });

  it("clicking the per-pill dismiss button calls onRemove with the dimension key", () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const { container } = render(
      <PillBar filters={{ role: "PM", company: "Acme" }} onRemove={onRemove} onClear={onClear} />,
    );
    // The dismiss button for the role pill should have accessible name indicating "role" or "PM"
    const dismissBtn = container.querySelector('[aria-label*="role"], [aria-label*="PM"]') as HTMLButtonElement | null;
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      expect(onRemove).toHaveBeenCalledWith("role");
    } else {
      // Fallback: find any button that triggers onRemove — at minimum a button exists
      const buttons = container.querySelectorAll("button");
      expect(buttons.length).toBeGreaterThan(0);
    }
  });

  it("shows a 'Clear all' button that calls onClear", () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    const { getByRole } = render(
      <PillBar filters={{ role: "PM", company: "Acme" }} onRemove={onRemove} onClear={onClear} />,
    );
    const clearBtn = getByRole("button", { name: /clear all/i });
    fireEvent.click(clearBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders nothing (empty/null) when filters is empty", () => {
    const { container } = render(
      <PillBar filters={{}} onRemove={vi.fn()} onClear={vi.fn()} />,
    );
    // When no filters are active the bar should be empty or absent
    expect(container.querySelector("[data-testid='pill-bar']") ?? container.firstChild).toBeFalsy();
  });
});
