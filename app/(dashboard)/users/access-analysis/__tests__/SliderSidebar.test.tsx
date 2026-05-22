// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { SliderProvider } from "../SliderContext";
import { SliderSidebar } from "../SliderSidebar";

// Radix Slider uses ResizeObserver, absent in jsdom.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function mount() {
  return render(
    React.createElement(
      SliderProvider,
      { physics: null, children: React.createElement(SliderSidebar, null) },
    ),
  );
}

describe("SliderSidebar — grouped + presets + search", () => {
  it("shows the primary group expanded with its 6 sliders", () => {
    mount();
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("Sign-in recency")).toBeTruthy();
  });

  it("advanced groups start collapsed; clicking a header reveals its sliders", () => {
    mount();
    expect(screen.queryByText("Company / firm")).toBeNull();
    fireEvent.click(screen.getByText(/affiliation/i));
    expect(screen.getByText("Company / firm")).toBeTruthy();
  });

  it("does NOT render a flat list of all sliders at once (advanced hidden by default)", () => {
    mount();
    expect(screen.queryByText("Module signature")).toBeNull();
  });

  it("a collapsed advanced group with an active dim shows an active-count badge", () => {
    mount();
    // module defaults to 15 (>0) and lives in a collapsed advanced group → "1 active".
    expect(screen.getByText(/1 active/i)).toBeTruthy();
    expect(screen.queryByText("Module signature")).toBeNull();
  });

  it("applying the Free preset zeroes a primary slider's displayed value", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /free \/ no semantic clustering/i }));
    const project = screen.getByText("Project").closest("div")!;
    expect(within(project).getByText("0")).toBeTruthy();
  });

  it("search filters dimension rows and auto-expands matching advanced groups", () => {
    mount();
    fireEvent.change(screen.getByTestId("dimension-search"), { target: { value: "company" } });
    expect(screen.getByText("Company / firm")).toBeTruthy();
    expect(screen.queryByText("Project")).toBeNull();
  });
});
