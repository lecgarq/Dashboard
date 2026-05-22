// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PresetBar } from "../PresetBar";

describe("PresetBar", () => {
  it("renders a button per preset and marks the active one pressed", () => {
    render(
      React.createElement(PresetBar, { activePreset: "organic", onApply: () => {} }),
    );
    const organic = screen.getByRole("button", { name: /organic/i });
    expect(organic.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a preset calls onApply with its id", () => {
    const onApply = vi.fn();
    render(
      React.createElement(PresetBar, { activePreset: null, onApply }),
    );
    fireEvent.click(screen.getByRole("button", { name: /structural/i }));
    expect(onApply).toHaveBeenCalledWith("structural");
  });

  it("shows a 'Custom' indicator when activePreset is null", () => {
    render(React.createElement(PresetBar, { activePreset: null, onApply: () => {} }));
    expect(screen.getByText(/custom/i)).toBeTruthy();
  });
});
