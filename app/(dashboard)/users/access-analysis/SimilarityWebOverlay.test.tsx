// @vitest-environment jsdom
import React, { createRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SimilarityWebOverlay } from "./SimilarityWebOverlay";
import type { GraphCanvasHandle } from "./GraphCanvas";

let frames: FrameRequestCallback[] = [];
let reducedMotion = false;

beforeEach(() => {
  frames = [];
  reducedMotion = false;
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: reducedMotion,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => vi.unstubAllGlobals());

function runFrame(time = 33): void {
  const frame = frames.shift();
  if (!frame) throw new Error("expected a queued animation frame");
  act(() => frame(time));
}

const edgeData = {
  src: Int32Array.from([0]),
  dst: Int32Array.from([1]),
  bucket: Uint16Array.from([0]),
  strength: Float32Array.from([1]),
  band: Uint8Array.from([2]),
  palette: Float32Array.from([1, 0, 0, 0.5]),
};

describe("SimilarityWebOverlay", () => {
  it("renders nothing and schedules no controller work in 3D mode", () => {
    const ref = createRef<GraphCanvasHandle | null>();
    const { queryByTestId } = render(
      <SimilarityWebOverlay
        graphRef={ref}
        mode="3d"
        {...edgeData}
        opacity={1}
        isMorphing={() => false}
      />,
    );
    expect(queryByTestId("similarity-web")).toBeNull();
    expect(frames).toHaveLength(0);
  });

  it("drives the native link seam and keeps only a hidden test marker", () => {
    const setSimilarityLinks = vi.fn();
    const ref = createRef<GraphCanvasHandle | null>();
    ref.current = {
      mode: "2d",
      handle: { setSimilarityLinks } as never,
    };
    const { getByTestId, container } = render(
      <SimilarityWebOverlay
        graphRef={ref}
        mode="2d"
        {...edgeData}
        opacity={1}
        isMorphing={() => false}
      />,
    );
    runFrame();

    expect(getByTestId("similarity-web").hidden).toBe(true);
    expect(container.querySelector("canvas")).toBeNull();
    expect(setSimilarityLinks).toHaveBeenCalledTimes(1);
    const [links, colors, widths] = setSimilarityLinks.mock.calls[0] as Float32Array[];
    expect(Array.from(links)).toEqual([0, 1]);
    expect(widths[0]).toBeCloseTo(1.55);
    expect(colors[3]).toBeGreaterThan(0);
    expect(colors[3]).toBeLessThan(0.5); // eased first frame, not a snap
  });

  it("snaps directly to the 25% morph floor under reduced motion", () => {
    reducedMotion = true;
    const setSimilarityLinks = vi.fn();
    const ref = createRef<GraphCanvasHandle | null>();
    ref.current = { mode: "2d", handle: { setSimilarityLinks } as never };
    render(
      <SimilarityWebOverlay
        graphRef={ref}
        mode="2d"
        {...edgeData}
        opacity={0.8}
        isMorphing={() => true}
      />,
    );
    runFrame();

    const colors = setSimilarityLinks.mock.calls[0][1] as Float32Array;
    expect(colors[3]).toBeCloseTo(0.1); // palette .5 × (.8 × .25)
  });
});
