// @vitest-environment jsdom
/**
 * LassoOverlay.test.tsx — Phase 4-01 Task 3 coverage:
 *   - inactive → pointerEvents none, cursor default
 *   - active   → pointerEvents auto, cursor crosshair
 *   - drag of 5+ moves completes → onComplete called with indices
 *   - drag of <3 points → onComplete NOT called
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent, screen, act } from "@testing-library/react";
import { LassoOverlay } from "../LassoOverlay";
import type { GraphCanvas2DHandle } from "../GraphCanvas2D";

// jsdom doesn't implement <canvas>.getContext — stub it so LassoOverlay's
// useEffect doesn't bail early on `if (!ctx) return`.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
  })) as unknown as HTMLCanvasElement["getContext"];
});

function mkGraphHandle(matched: number[]): GraphCanvas2DHandle {
  return {
    pushPositions: vi.fn(),
    applyAlphaMask: vi.fn(),
    setColors: vi.fn(),
    setEventHandlers: vi.fn(),
    findPointsInPolygon: vi.fn(() => matched),
    screenToSpace: vi.fn(([x, y]: [number, number]) => [x * 2, y * 2] as [number, number]),
    spaceToScreen: vi.fn(([x, y]: [number, number]) => [x, y] as [number, number]),
    setLinks: vi.fn(),
    setLinkColors: vi.fn(),
  };
}

function pointerEvt(type: string, init: { offsetX: number; offsetY: number; pointerId?: number }): Event {
  // jsdom: offsetX/Y on Event are read-only inherited getters; define them as
  // own properties so the LassoOverlay handler reads our injected values.
  const e = new Event(type, { bubbles: true });
  Object.defineProperty(e, "offsetX", { value: init.offsetX, configurable: true });
  Object.defineProperty(e, "offsetY", { value: init.offsetY, configurable: true });
  Object.defineProperty(e, "pointerId", { value: init.pointerId ?? 1, configurable: true });
  return e;
}

describe("LassoOverlay — Phase 4-01 Task 3", () => {
  it("inactive: pointerEvents=none, cursor=default", () => {
    render(
      <LassoOverlay active={false} graphHandle={mkGraphHandle([])} onComplete={() => {}} />,
    );
    const cv = screen.getByTestId("lasso-overlay") as HTMLCanvasElement;
    expect(cv.style.pointerEvents).toBe("none");
    expect(cv.style.cursor).toBe("default");
    expect(cv.dataset.active).toBe("false");
  });

  it("active: pointerEvents=auto, cursor=crosshair", () => {
    render(
      <LassoOverlay active={true} graphHandle={mkGraphHandle([])} onComplete={() => {}} />,
    );
    const cv = screen.getByTestId("lasso-overlay") as HTMLCanvasElement;
    expect(cv.style.pointerEvents).toBe("auto");
    expect(cv.style.cursor).toBe("crosshair");
    expect(cv.dataset.active).toBe("true");
  });

  it("drag of 5 points → onComplete called with indices from findPointsInPolygon", async () => {
    const onComplete = vi.fn();
    const handle = mkGraphHandle([1, 3, 7]);
    render(
      <LassoOverlay active={true} graphHandle={handle} onComplete={onComplete} />,
    );
    // Allow LassoOverlay's useEffect (which attaches listeners) to flush.
    await act(async () => {
      await Promise.resolve();
    });
    const cv = screen.getByTestId("lasso-overlay") as HTMLCanvasElement;
    cv.dispatchEvent(pointerEvt("pointerdown", { offsetX: 10, offsetY: 10 }));
    cv.dispatchEvent(pointerEvt("pointermove", { offsetX: 20, offsetY: 15 }));
    cv.dispatchEvent(pointerEvt("pointermove", { offsetX: 30, offsetY: 25 }));
    cv.dispatchEvent(pointerEvt("pointermove", { offsetX: 20, offsetY: 40 }));
    cv.dispatchEvent(pointerEvt("pointermove", { offsetX: 10, offsetY: 30 }));
    cv.dispatchEvent(pointerEvt("pointerup", { offsetX: 10, offsetY: 30 }));
    expect(handle.findPointsInPolygon).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith([1, 3, 7]);
  });

  it("path of just down+up (< 3 points) does NOT call onComplete", async () => {
    const onComplete = vi.fn();
    const handle = mkGraphHandle([1]);
    render(
      <LassoOverlay active={true} graphHandle={handle} onComplete={onComplete} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const cv = screen.getByTestId("lasso-overlay") as HTMLCanvasElement;
    cv.dispatchEvent(pointerEvt("pointerdown", { offsetX: 5, offsetY: 5 }));
    cv.dispatchEvent(pointerEvt("pointerup", { offsetX: 5, offsetY: 5 }));
    expect(handle.findPointsInPolygon).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
  // unused-symbol guard — silences fireEvent unused-import lint when this block evolves.
  void fireEvent;
});
