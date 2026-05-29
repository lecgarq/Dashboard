// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DimensionSlider } from "./DimensionSlider";

// Radix Slider uses ResizeObserver, which is absent in jsdom.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

describe("DimensionSlider", () => {
  it("shows the current value in a readout", () => {
    render(<DimensionSlider dimId="d" label="Reach" value={42} onChange={() => {}} onReset={() => {}} />);
    expect(screen.getByTestId("slider-value-d").textContent).toContain("42");
  });
  it("calls onReset on thumb double-click", () => {
    const onReset = vi.fn();
    render(<DimensionSlider dimId="d" label="Reach" value={10} onChange={() => {}} onReset={onReset} />);
    fireEvent.doubleClick(screen.getByLabelText("Reach thumb"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
