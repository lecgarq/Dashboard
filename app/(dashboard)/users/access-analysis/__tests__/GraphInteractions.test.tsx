// @vitest-environment jsdom
/**
 * GraphInteractions.test.tsx — Phase 4-01 Task 3 coverage:
 *   - setEventHandlers called once the wrapper mounts with a ready handle.
 *   - click invokes onIsolate(index); background click invokes onIsolate(null).
 *   - Escape key invokes onIsolate(null).
 *   - usePredicateEngine routes through to physics.setMask.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { render, fireEvent, act, screen } from "@testing-library/react";
import { useRef } from "react";
import { GraphInteractions } from "../GraphInteractions";
import type { NodeFeatureSnapshot } from "../interactionTypes";
import type { PhysicsLayer } from "../physicsLayer";
import type { GraphCanvasHandle } from "../GraphCanvas";
import type { GraphCanvas2DHandle } from "../GraphCanvas2D";

function mkFeatures(n: number): NodeFeatureSnapshot[] {
  return Array.from({ length: n }, (_, i) => ({
    nodeId: String(i),
    nameLower: `n${i}`,
    emailLower: `n${i}@x.com`,
    project: "P",
    role: "member",
    permTier: null,
    isExternal: false,
    activityBucket: "Low",
    signinBucket: "<30d",
    activityCountRaw: 1,
    lastSignInRel: "today",
    permissionCoverage: "unknown",
    firmName: "",
    accountStatus: "",
  }));
}

function mkPhysics(): PhysicsLayer {
  return {
    setMask: vi.fn(),
    updateSliders: vi.fn(),
    getPositions: () => new Float32Array(),
    dispose: vi.fn(),
    alphaMask: new Float32Array(),
    maskVersion: 0,
  } as unknown as PhysicsLayer;
}

interface Captured {
  set2D: any;
  capturedHandlers: { current: ReturnType<typeof makeHandlers> | null };
  captureView?: NonNullable<GraphCanvas2DHandle["captureView"]>;
  focusPoint?: NonNullable<GraphCanvas2DHandle["focusPoint"]>;
  restoreView?: NonNullable<GraphCanvas2DHandle["restoreView"]>;
}

function makeHandlers(): {
  onPointClick: (i: number | undefined) => void;
  onPointHover: (i: number, p: [number, number]) => void;
  onPointHoverEnd: () => void;
} {
  return {
    onPointClick: vi.fn(),
    onPointHover: vi.fn(),
    onPointHoverEnd: vi.fn(),
  };
}

function Harness(props: {
  onIsolate: (i: number | null) => void;
  isolatedNodeIndex: number | null;
  captured: Captured;
  onHoverChange?: (index: number | null) => void;
}): React.JSX.Element {
  // Initialize the ref EAGERLY (lazy initializer) so GraphInteractions sees
  // graphRef.current populated on the very first mount-effect pass.
  const graphRef = useRef<GraphCanvasHandle | null>(null);
  if (graphRef.current === null) {
    const fakeHandle2D: GraphCanvas2DHandle = {
      pushPositions: vi.fn(),
      applyAlphaMask: vi.fn(),
      setColors: vi.fn(),
      setEventHandlers: ((h) => {
        props.captured.set2D(h);
        props.captured.capturedHandlers.current =
          h as unknown as ReturnType<typeof makeHandlers>;
      }) as GraphCanvas2DHandle["setEventHandlers"],
      findPointsInPolygon: vi.fn(() => []),
      screenToSpace: vi.fn((xy) => xy),
      spaceToScreen: vi.fn((xy) => xy),
      setLinks: vi.fn(),
      setLinkColors: vi.fn(),
      setSimilarityLinks: vi.fn(),
      getRenderState: vi.fn(() => ({ renderLinks: true, linkCount: 0 })),
      captureView:
        props.captured.captureView ??
        vi.fn(() => ({ center: [5, 6] as [number, number], zoom: 3 })),
      focusPoint: props.captured.focusPoint ?? vi.fn(),
      restoreView: props.captured.restoreView ?? vi.fn(),
    };
    graphRef.current = { mode: "2d", handle: fakeHandle2D };
  }

  return (
    <GraphInteractions
      physics={mkPhysics()}
      features={mkFeatures(5)}
      mode="2d"
      graphRef={graphRef}
      activeFilters={{}}
      searchQuery=""
      lassoActive={false}
      onLassoComplete={() => {}}
      isolatedNodeIndex={props.isolatedNodeIndex}
      onIsolate={props.onIsolate}
      onHoverChange={props.onHoverChange}
      lassoSelection={null}
      drillDown={null}
      rendererReady={1}
      edges={[]}
    >
      <div data-testid="graph-children" />
    </GraphInteractions>
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GraphInteractions — Phase 4-01 Task 3 wiring", () => {
  it("installs setEventHandlers on the active handle", async () => {
    const set2D = vi.fn();
    const captured: Captured = {
      set2D,
      capturedHandlers: { current: null },
    };
    render(
      <Harness onIsolate={() => {}} isolatedNodeIndex={null} captured={captured} />,
    );
    // GraphInteractions' useEffect depends on graphRef + mode. The ref starts null
    // (assigned inside the harness effect) — we need a microtask flush so the
    // GraphInteractions effect re-runs. The simplest reliable trick is to force
    // an act() flush followed by a manual re-render trigger:
    await act(async () => {
      await Promise.resolve();
    });
    // Because both effects depend on [graphRef, mode] only on mount, we manually
    // invoke the captured handlers AFTER ensuring at least the noop noop set was
    // attempted on initial mount. We don't strictly need to verify setEventHandlers
    // was called here; the contract test below uses the captured handlers ref
    // populated by the same mount.
    expect(set2D).toHaveBeenCalled();
  });

  it("click on a node calls onIsolate(index); background click calls onIsolate(null)", async () => {
    const onIsolate = vi.fn();
    const captured: Captured = {
      set2D: vi.fn(),
      capturedHandlers: { current: null },
    };
    render(
      <Harness onIsolate={onIsolate} isolatedNodeIndex={null} captured={captured} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const handlers = captured.capturedHandlers.current;
    expect(handlers).not.toBeNull();
    handlers!.onPointClick(3);
    expect(onIsolate).toHaveBeenLastCalledWith(3);
    handlers!.onPointClick(undefined);
    expect(onIsolate).toHaveBeenLastCalledWith(null);
  });

  it("Escape key triggers onIsolate(null)", async () => {
    const onIsolate = vi.fn();
    const captured: Captured = {
      set2D: vi.fn(),
      capturedHandlers: { current: null },
    };
    render(
      <Harness onIsolate={onIsolate} isolatedNodeIndex={7} captured={captured} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onIsolate).toHaveBeenCalledWith(null);
  });

  it("snapshots once, focuses each selected node, then restores the original view", async () => {
    const captureView = vi.fn(() => ({ center: [5, 6] as [number, number], zoom: 3 }));
    const focusPoint = vi.fn();
    const restoreView = vi.fn();
    const captured: Captured = {
      set2D: vi.fn(),
      capturedHandlers: { current: null },
      captureView,
      focusPoint,
      restoreView,
    };
    const { rerender } = render(
      <Harness onIsolate={() => {}} isolatedNodeIndex={null} captured={captured} />,
    );

    rerender(<Harness onIsolate={() => {}} isolatedNodeIndex={2} captured={captured} />);
    expect(captureView).toHaveBeenCalledTimes(1);
    expect(focusPoint).toHaveBeenLastCalledWith(2, 180);

    rerender(<Harness onIsolate={() => {}} isolatedNodeIndex={3} captured={captured} />);
    expect(captureView).toHaveBeenCalledTimes(1);
    expect(focusPoint).toHaveBeenLastCalledWith(3, 180);

    rerender(<Harness onIsolate={() => {}} isolatedNodeIndex={null} captured={captured} />);
    expect(restoreView).toHaveBeenCalledWith({ center: [5, 6], zoom: 3 }, 180);
  });

  it("snaps camera focus under reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const focusPoint = vi.fn();
    const captured: Captured = {
      set2D: vi.fn(),
      capturedHandlers: { current: null },
      focusPoint,
    };
    render(<Harness onIsolate={() => {}} isolatedNodeIndex={2} captured={captured} />);
    expect(focusPoint).toHaveBeenCalledWith(2, 0);
  });

  it("raises hover immediately but delays and cancels the tooltip", async () => {
    vi.useFakeTimers();
    const onHoverChange = vi.fn();
    const captured: Captured = {
      set2D: vi.fn(),
      capturedHandlers: { current: null },
    };
    render(
      <Harness
        onIsolate={() => {}}
        isolatedNodeIndex={null}
        captured={captured}
        onHoverChange={onHoverChange}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const handlers = captured.capturedHandlers.current!;

    act(() => handlers.onPointHover(1, [10, 20]));
    expect(onHoverChange).toHaveBeenLastCalledWith(1);
    expect(screen.queryByTestId("node-tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(79));
    expect(screen.queryByTestId("node-tooltip")).toBeNull();

    act(() => handlers.onPointHover(2, [30, 40]));
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByTestId("node-tooltip").textContent).toContain("N2");

    act(() => handlers.onPointHoverEnd());
    expect(onHoverChange).toHaveBeenLastCalledWith(null);
    expect(screen.queryByTestId("node-tooltip")).toBeNull();
  });
});
