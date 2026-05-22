// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SliderGroup } from "../SliderGroup";

// Radix UI Slider (used inside DimensionSlider) calls ResizeObserver internally.
// jsdom does not implement it, so we stub it here.
beforeAll(() => {
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function rows() {
  return [
    { id: "company", label: "Company / firm", value: 0 },
    { id: "isAdmin", label: "Admin / member", value: 0 },
  ];
}

const base = {
  onToggleOpen: () => {}, onChange: () => {}, onReset: () => {}, activeCount: 0,
};

describe("SliderGroup", () => {
  it("renders a header and, when open, one slider row per dim", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: true, collapsible: true,
      }),
    );
    expect(screen.getByText("Affiliation")).toBeTruthy();
    expect(screen.getByText("Company / firm")).toBeTruthy();
  });

  it("when collapsed, hides the slider rows but keeps the header", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: false, collapsible: true,
      }),
    );
    expect(screen.getByText("Affiliation")).toBeTruthy();
    expect(screen.queryByText("Company / firm")).toBeNull();
  });

  it("clicking the header calls onToggleOpen (collapsible groups only)", () => {
    const onToggleOpen = vi.fn();
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: false, collapsible: true, onToggleOpen,
      }),
    );
    fireEvent.click(screen.getByText("Affiliation"));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
  });

  it("shows an active-count badge on a COLLAPSED group when activeCount > 0", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Access & permissions", rows: rows(), open: false, collapsible: true,
        activeCount: 1,
      }),
    );
    expect(screen.getByText(/1 active/i)).toBeTruthy();
    expect(screen.queryByText("Company / firm")).toBeNull(); // still collapsed
  });

  it("shows NO active badge when activeCount is 0", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: false, collapsible: true, activeCount: 0,
      }),
    );
    expect(screen.queryByText(/active/i)).toBeNull();
  });
});
