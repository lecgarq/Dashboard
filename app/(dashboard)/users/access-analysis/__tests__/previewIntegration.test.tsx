// @vitest-environment jsdom
/**
 * B.2 — Integration tests for GraphCanvas's preview override wiring.
 *
 * We mock the child renderers (GraphCanvas2D / GraphCanvas3D) as trivial
 * pass-throughs so we can observe the wiring contract without GPU context:
 *   - Preview enter seeds the layer from physics.getPositions().
 *   - Preview exit (debounce + resetAll) hands the buffer back via syncPositions.
 *   - 3D mode: preview wiring is inert (no seed reads, no syncPositions).
 *   - Mode flip 2D→3D mid-preview commits the in-flight buffer.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import type { PhysicsLayer, TargetArrays } from "../physicsLayer";

// ---- Child renderer mocks (no GPU context, no cosmos.gl, no three.js) ------

vi.mock("../GraphCanvas2D", () => ({
  GraphCanvas2D: function MockGC2D(props: any): React.ReactElement | null {
    React.useEffect(() => {
      props.onHandleReady?.({
        pushPositions: vi.fn(),
        applyAlphaMask: vi.fn(),
        setColors: vi.fn(),
      });
    }, []);
    return null;
  },
}));

vi.mock("../GraphCanvas3D", () => ({
  GraphCanvas3D: function MockGC3D(props: any): React.ReactElement | null {
    React.useEffect(() => {
      props.onHandleReady?.({
        pushPositions: vi.fn(),
        applyAlphaMask: vi.fn(),
        setColors: vi.fn(),
        setBackground: vi.fn(),
        getCamera: () => null,
        fitView: vi.fn(),
      });
    }, []);
    return null;
  },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

import { GraphCanvas } from "../GraphCanvas";
import { SliderProvider, useSliders } from "../SliderContext";
import type { SliderProviderProps } from "../SliderContext";

type SliderCtx = ReturnType<typeof useSliders>;

// ---- physics fixture --------------------------------------------------------

function makePhysics(nodeCount = 2): PhysicsLayer & {
  getPositions: ReturnType<typeof vi.fn>;
  syncPositions: ReturnType<typeof vi.fn>;
  setActiveInput: ReturnType<typeof vi.fn>;
  updateSliders: ReturnType<typeof vi.fn>;
} {
  const xyz = new Float32Array(nodeCount * 3);
  for (let i = 0; i < xyz.length; i++) xyz[i] = 7; // distinctive seed value
  const targets: TargetArrays = {
    activity: {
      x: new Float32Array(nodeCount).fill(100),
      y: new Float32Array(nodeCount).fill(0),
      z: new Float32Array(nodeCount).fill(0),
    },
  };
  let sliders: Record<string, number> = {};
  const physics = {
    alphaMask: new Float32Array(nodeCount).fill(1),
    maskVersion: 0,
    positionsVersion: 0,
    frozen: false,
    getPositions: vi.fn(() => xyz.slice()),
    setMask: vi.fn(),
    setActiveInput: vi.fn(),
    updateSliders: vi.fn((v: Record<string, number>) => {
      sliders = { ...sliders, ...v };
    }),
    getTargets: () => targets,
    getDimWeights: () => ({}),
    getSliders: () => ({ ...sliders }),
    syncPositions: vi.fn(),
    dispose: vi.fn(),
  } as unknown as PhysicsLayer;
  return physics as any;
}

// Captures the live slider context so tests can drive setSliderValue / resetAll.
function CtxGrab({ sink }: { sink: { ctx: SliderCtx | null } }): null {
  sink.ctx = useSliders();
  return null;
}

function renderShell(
  physics: PhysicsLayer,
  mode: "2d" | "3d" = "2d",
): { sink: { ctx: SliderCtx | null }; rerender: (mode: "2d" | "3d") => void } {
  const sink: { ctx: SliderCtx | null } = { ctx: null };
  const Shell: React.FC<{ mode: "2d" | "3d" }> = ({ mode }) => (
    <SliderProvider physics={physics as SliderProviderProps["physics"]}>
      <CtxGrab sink={sink} />
      <GraphCanvas
        mode={mode}
        physics={physics}
        nodeColors={new Float32Array(8)}
        gpuSimulation={false}
      />
    </SliderProvider>
  );
  const result = render(<Shell mode={mode} />);
  return {
    sink,
    rerender: (m) => result.rerender(<Shell mode={m} />),
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

// ---- Tests ------------------------------------------------------------------

describe("B.2 — GraphCanvas preview integration", () => {
  it("2D: setSliderValue seeds previewLayer from physics.getPositions", () => {
    const physics = makePhysics(2);
    const { sink } = renderShell(physics, "2d");
    act(() => {
      // flush handle-ready effects
    });
    // Clear initial-mount calls (preview layer construction + rAF priming).
    physics.getPositions.mockClear();

    act(() => {
      sink.ctx!.setSliderValue("activity", 50);
    });

    // The preview-active listener fires synchronously inside enterPreview;
    // GraphCanvas's listener calls layer.seedFrom(physics.getPositions()).
    expect(physics.getPositions).toHaveBeenCalled();
  });

  it("2D: preview exit via debounce timer calls physics.syncPositions", () => {
    vi.useFakeTimers();
    try {
      const physics = makePhysics(2);
      const { sink } = renderShell(physics, "2d");
      act(() => {
        sink.ctx!.setSliderValue("activity", 50);
      });
      expect(physics.syncPositions).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(300); // > PREVIEW_IDLE_MS (250)
      });

      expect(physics.syncPositions).toHaveBeenCalledTimes(1);
      const [buf] = physics.syncPositions.mock.calls[0];
      expect(buf).toBeInstanceOf(Float32Array);
      expect(buf.length).toBe(6); // 2 nodes * 3
    } finally {
      vi.useRealTimers();
    }
  });

  it("2D: preview exit via resetAll calls physics.syncPositions synchronously", () => {
    const physics = makePhysics(2);
    const { sink } = renderShell(physics, "2d");
    act(() => {
      sink.ctx!.setSliderValue("activity", 50);
    });
    act(() => {
      sink.ctx!.resetAll();
    });
    expect(physics.syncPositions).toHaveBeenCalled();
  });

  it("3D: setSliderValue calls physics.syncPositions on exit", () => {
    vi.useFakeTimers();
    try {
      const physics = makePhysics(2);
      const { sink } = renderShell(physics, "3d");
      act(() => {
        sink.ctx!.setSliderValue("activity", 50);
      });
      expect(physics.syncPositions).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(physics.syncPositions).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mode flip 2D→3D mid-preview commits the in-flight buffer via syncPositions", () => {
    const physics = makePhysics(2);
    const { sink, rerender } = renderShell(physics, "2d");
    act(() => {
      sink.ctx!.setSliderValue("activity", 50);
    });
    // Preview is active in 2D; flip to 3D should commit the in-flight buffer.
    act(() => {
      rerender("3d");
    });
    expect(physics.syncPositions).toHaveBeenCalled();
  });
});
