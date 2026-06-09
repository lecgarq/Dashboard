// @vitest-environment jsdom
/**
 * SliderContext.test.tsx — Phase E (catalog-driven) coverage:
 *   - default state = every catalog slider id at 0 (spec decision #3)
 *   - setSliderValue dispatches rAF-coalesced physics.updateSliders with normalized value
 *   - multiple setSliderValue in one tick collapse to ONE updateSliders call
 *   - resetAll calls updateSliders with all zeros immediately
 *   - resetOne preserves other dims
 *   - localStorage round-trip restores values for KNOWN catalog ids only
 *   - migratePersistedSliders drops ids absent from knownIds
 *   - no SSR access during render (defaults render before effect runs)
 *   - preview-activation machinery (B.1/B.2) preserved
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import type { PhysicsLayer } from "../physicsLayer";
import {
  CONTROLS_STORAGE_KEY,
  SliderProvider,
  useSliders,
  migratePersistedSliders,
} from "../SliderContext";
import type { CatalogDimension } from "../dimensionCatalog.types";
import { GROUPING_DEFAULT } from "../catalogSliders";

// ---------------------------------------------------------------------------
// Tiny fake catalog. Three slider-surfaced + available dims, one slider dim with
// no data (greyed → listed by sliderDimensionIds but NOT defaulted), and one
// color-only dim (never a slider).
// ---------------------------------------------------------------------------

function mkDim(over: Partial<CatalogDimension> & { id: string }): CatalogDimension {
  return {
    label: over.id,
    family: "structure",
    kind: "categorical",
    source: "test",
    confidence: "high",
    available: true,
    surfaces: ["slider"],
    extract: () => null,
    ...over,
  };
}

const FAKE_CATALOG: CatalogDimension[] = [
  mkDim({ id: "activity" }),
  mkDim({ id: "signin" }),
  mkDim({ id: "role" }),
  // slider-surfaced but no data → appears in sliderDimensionIds, NOT in defaults
  mkDim({ id: "greyed", available: false }),
  // color-only → never a slider id
  mkDim({ id: "colorOnly", surfaces: ["color"] }),
];

/** Available slider ids — these get a 0 default. */
const DEFAULT_IDS = ["activity", "signin", "role"] as const;
/** All slider-surfaced ids (incl. greyed) — the known-id space for migration. */
const KNOWN_IDS = ["activity", "signin", "role", "greyed"] as const;

function mkPhysics(): {
  physics: PhysicsLayer;
  updateSliders: ReturnType<typeof vi.fn>;
  setActiveInput: ReturnType<typeof vi.fn>;
} {
  const updateSliders = vi.fn();
  const setActiveInput = vi.fn();
  const physics: Partial<PhysicsLayer> = {
    updateSliders,
    setActiveInput,
    setMask: vi.fn(),
    getPositions: () => new Float32Array(),
    dispose: vi.fn(),
    alphaMask: new Float32Array(),
    maskVersion: 0,
  };
  return { physics: physics as PhysicsLayer, updateSliders, setActiveInput };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

function makeWrapper(physics: PhysicsLayer): React.FC<{ children: React.ReactNode }> {
  return function Wrapper({ children }) {
    return (
      <SliderProvider physics={physics} catalog={FAKE_CATALOG}>
        {children}
      </SliderProvider>
    );
  };
}

describe("SliderContext — catalog-driven defaults (primary dim pre-engaged)", () => {
  it("initial values = primary dim at GROUPING_DEFAULT, every other AVAILABLE slider at 0 (greyed/color-only excluded)", () => {
    const { physics } = mkPhysics();
    let firstValues: Record<string, number> | null = null;
    function Reader(): null {
      const s = useSliders();
      if (firstValues === null) firstValues = { ...s.values };
      return null;
    }
    render(
      <SliderProvider physics={physics} catalog={FAKE_CATALOG}>
        <Reader />
      </SliderProvider>,
    );
    // FAKE_CATALOG has 'role' as an available slider → it becomes the primary dim.
    // In the test environment NEXT_PUBLIC_ACC_3D_GRAPH is unset (flag OFF), so the
    // projector loads as a free scatter: primaryStrength = 0, all sliders start at 0.
    expect(firstValues).toEqual({ activity: 0, signin: 0, role: 0 });
    // greyed (no data) and colorOnly are NOT seeded as defaults
    expect(firstValues!).not.toHaveProperty("greyed");
    expect(firstValues!).not.toHaveProperty("colorOnly");
  });
});

describe("SliderContext — rAF coalescing + reset + persistence", () => {
  it("setSliderValue(50) on 'activity' pushes physics.updateSliders with activity = 0.5", async () => {
    const { physics, updateSliders } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      result.current.setSliderValue("activity", 50);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    expect(updateSliders).toHaveBeenCalled();
    const lastCall = updateSliders.mock.calls.at(-1)![0] as Record<string, number>;
    expect(lastCall.activity).toBeCloseTo(0.5, 6);
  });

  it("multiple setSliderValue in same tick collapse to ONE updateSliders call", async () => {
    const { physics, updateSliders } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      result.current.setSliderValue("activity", 25);
      result.current.setSliderValue("signin", 50);
      result.current.setSliderValue("role", 75);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    const last = updateSliders.mock.calls.at(-1)![0] as Record<string, number>;
    expect(last.activity).toBeCloseTo(0.25, 6);
    expect(last.signin).toBeCloseTo(0.5, 6);
    expect(last.role).toBeCloseTo(0.75, 6);
  });

  it("resetAll restores the catalog default immediately (primary dim=GROUPING_DEFAULT, others=0)", async () => {
    const { physics, updateSliders } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      result.current.setSliderValue("activity", 80);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    updateSliders.mockClear();

    await act(async () => {
      result.current.resetAll();
    });

    expect(updateSliders).toHaveBeenCalledTimes(1);
    const args = updateSliders.mock.calls[0][0] as Record<string, number>;
    // In the test environment NEXT_PUBLIC_ACC_3D_GRAPH is unset (flag OFF), so the
    // projector defaults every slider to 0 (free scatter). resetAll restores those zeros.
    expect(args["role"]).toBe(0);
    // all non-primary available dims reset to 0
    expect(args["activity"]).toBe(0);
    expect(args["signin"]).toBe(0);
  });

  it("resetOne(dim) preserves other dims", async () => {
    const { physics, updateSliders } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      result.current.setSliderValue("activity", 40);
      result.current.setSliderValue("signin", 60);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    updateSliders.mockClear();

    await act(async () => {
      result.current.resetOne("activity");
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    const last = updateSliders.mock.calls.at(-1)![0] as Record<string, number>;
    expect(last.activity).toBe(0);
    expect(last.signin).toBeCloseTo(0.6, 6);
    expect(result.current.values.activity).toBe(0);
    expect(result.current.values.signin).toBe(60);
  });

  it("localStorage round-trip restores stored values for known ids on mount", async () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({ sliders: { activity: 42, signin: 11 } }),
    );

    const { physics } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    expect(result.current.values.activity).toBe(42);
    expect(result.current.values.signin).toBe(11);
  });

  it("localStorage hydration drops persisted ids that are not in the catalog", async () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({ sliders: { activity: 30, staleDim: 90 } }),
    );

    const { physics } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    });

    expect(result.current.values.activity).toBe(30);
    // unknown id never enters the value map
    expect(result.current.values).not.toHaveProperty("staleDim");
  });

  it("SSR safety — renders all-0 defaults without reading localStorage during initial render", () => {
    window.localStorage.setItem(
      CONTROLS_STORAGE_KEY,
      JSON.stringify({ sliders: { activity: 99 } }),
    );

    const { physics } = mkPhysics();

    let firstValues: Record<string, number> | null = null;
    function Reader(): null {
      const s = useSliders();
      if (firstValues === null) firstValues = { ...s.values };
      useEffect(() => {
        /* no-op */
      }, []);
      return null;
    }

    render(
      <SliderProvider physics={physics} catalog={FAKE_CATALOG}>
        <Reader />
      </SliderProvider>,
    );

    expect(firstValues).not.toBeNull();
    // First committed render shows the default (0) — NOT the persisted 99 —
    // confirming hydration only happens via useEffect (client-only) on pass two.
    expect(firstValues!.activity).toBe(0);
    expect(firstValues!.activity).not.toBe(99);
  });
});

describe("SliderContext — drag-preview activation (B.1)", () => {
  it("setSliderValue marks preview active on the physics layer", async () => {
    const { physics, setActiveInput } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

    await act(async () => {
      result.current.setSliderValue("activity", 50);
    });

    expect(setActiveInput).toHaveBeenCalledWith(true);
  });

  it("preview exits after the idle window (debounced) with no further changes", async () => {
    vi.useFakeTimers();
    try {
      const { physics, setActiveInput } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

      act(() => {
        result.current.setSliderValue("activity", 50);
      });
      expect(setActiveInput).toHaveBeenLastCalledWith(true);

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(setActiveInput).not.toHaveBeenCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(setActiveInput).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rapid back-to-back changes keep preview active and only one entry call fires", async () => {
    vi.useFakeTimers();
    try {
      const { physics, setActiveInput } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

      act(() => {
        result.current.setSliderValue("activity", 10);
      });
      act(() => {
        vi.advanceTimersByTime(100);
        result.current.setSliderValue("activity", 20);
      });
      act(() => {
        vi.advanceTimersByTime(100);
        result.current.setSliderValue("activity", 30);
      });

      const trueCalls = setActiveInput.mock.calls.filter((c) => c[0] === true).length;
      expect(trueCalls).toBe(1);
      expect(setActiveInput).not.toHaveBeenCalledWith(false);

      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(setActiveInput).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resetAll immediately exits preview (settle-now intent)", async () => {
    vi.useFakeTimers();
    try {
      const { physics, setActiveInput } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });

      act(() => {
        result.current.setSliderValue("activity", 50);
      });
      expect(setActiveInput).toHaveBeenLastCalledWith(true);

      act(() => {
        result.current.resetAll();
      });
      expect(setActiveInput).toHaveBeenLastCalledWith(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("SliderContext — migratePersistedSliders (catalog id-space)", () => {
  it("keeps only known finite-numeric ids", () => {
    expect(
      migratePersistedSliders({ activity: 42, role: 25, unknown: 7 }, KNOWN_IDS),
    ).toEqual({ activity: 42, role: 25 });
  });
  it("drops a greyed id ONLY if it is not in knownIds (greyed IS known)", () => {
    // greyed is slider-surfaced (in KNOWN_IDS) even though it has no data, so a
    // persisted value survives migration (the provider just won't seed it as a default).
    expect(migratePersistedSliders({ greyed: 60, gone: 1 }, KNOWN_IDS)).toEqual({
      greyed: 60,
    });
  });
  it("drops non-finite / non-number values", () => {
    expect(
      migratePersistedSliders(
        { activity: Number.NaN, signin: Infinity, role: 5 } as Record<string, number>,
        KNOWN_IDS,
      ),
    ).toEqual({ role: 5 });
  });
});

describe("SliderContext — preview subscription (B.2)", () => {
  it("subscribePreviewActive fires true synchronously on first slider change", () => {
    const { physics } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });
    const seen: boolean[] = [];
    act(() => {
      result.current.subscribePreviewActive((a) => seen.push(a));
      result.current.setSliderValue("activity", 50);
    });
    expect(seen[0]).toBe(true);
  });

  it("isPreviewActive reflects current state", () => {
    vi.useFakeTimers();
    try {
      const { physics } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });
      expect(result.current.isPreviewActive()).toBe(false);
      act(() => {
        result.current.setSliderValue("activity", 50);
      });
      expect(result.current.isPreviewActive()).toBe(true);
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current.isPreviewActive()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("subscribePreviewActive fires false synchronously when the debounce timer exits", () => {
    vi.useFakeTimers();
    try {
      const { physics } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });
      const seen: boolean[] = [];
      act(() => {
        result.current.subscribePreviewActive((a) => seen.push(a));
        result.current.setSliderValue("activity", 50);
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(seen).toEqual([true, false]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("subscribePreviewActive fires false synchronously on resetAll exit", () => {
    const { physics } = mkPhysics();
    const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });
    const seen: boolean[] = [];
    act(() => {
      result.current.subscribePreviewActive((a) => seen.push(a));
      result.current.setSliderValue("activity", 50);
    });
    act(() => {
      result.current.resetAll();
    });
    expect(seen).toEqual([true, false]);
  });

  it("repeated entry while already active does NOT re-emit true", () => {
    vi.useFakeTimers();
    try {
      const { physics } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });
      const seen: boolean[] = [];
      act(() => {
        result.current.subscribePreviewActive((a) => seen.push(a));
        result.current.setSliderValue("activity", 10);
      });
      act(() => {
        vi.advanceTimersByTime(50);
        result.current.setSliderValue("activity", 20);
      });
      act(() => {
        vi.advanceTimersByTime(50);
        result.current.setSliderValue("activity", 30);
      });
      const trueCount = seen.filter((v) => v === true).length;
      expect(trueCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("unsubscribe removes the listener", () => {
    vi.useFakeTimers();
    try {
      const { physics } = mkPhysics();
      const { result } = renderHook(() => useSliders(), { wrapper: makeWrapper(physics) });
      const seen: boolean[] = [];
      let unsub: () => void = () => {};
      act(() => {
        unsub = result.current.subscribePreviewActive((a) => seen.push(a));
      });
      act(() => {
        unsub();
        result.current.setSliderValue("activity", 50);
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(seen).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
