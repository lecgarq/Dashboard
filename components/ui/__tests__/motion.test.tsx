// @vitest-environment jsdom
/**
 * Tests for components/ui/motion.ts
 * - Preset shape + budget assertions (pure object checks, no render needed)
 * - useSafeVariants: mocks useReducedMotion to assert zeroed / passthrough behavior
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Framer-motion mock — allows controlling useReducedMotion return value
// ---------------------------------------------------------------------------
let mockReducedMotion = false;

vi.mock("framer-motion", () => ({
  motion: {},
  AnimatePresence: () => null,
  useReducedMotion: () => mockReducedMotion,
}));

// Import AFTER mock is registered so vi.mock hoisting takes effect
import {
  fadeUp,
  fadeIn,
  stagger,
  slideFromRight,
  useSafeVariants,
} from "../motion";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Walk a variants object and collect every transition.duration found. */
function collectDurations(variants: Record<string, unknown>): number[] {
  const durations: number[] = [];
  for (const state of Object.values(variants)) {
    const s = state as Record<string, unknown>;
    if (s && typeof s === "object" && "transition" in s) {
      const t = s.transition as Record<string, unknown>;
      if (typeof t.duration === "number") durations.push(t.duration);
    }
  }
  return durations;
}

// ---------------------------------------------------------------------------
// Preset shape tests (budget ≤ 400 ms = 0.4 s)
// ---------------------------------------------------------------------------
describe("fadeUp preset", () => {
  it("has hidden initial state (opacity 0, y offset)", () => {
    const initial = fadeUp.hidden as Record<string, unknown>;
    expect(initial.opacity).toBe(0);
    expect(typeof initial.y).toBe("number");
  });

  it("has visible state with opacity 1", () => {
    const visible = fadeUp.visible as Record<string, unknown>;
    expect(visible.opacity).toBe(1);
  });

  it("visible transition duration is within the <400ms budget", () => {
    const visible = fadeUp.visible as Record<string, unknown>;
    const t = visible.transition as Record<string, unknown>;
    expect(typeof t.duration).toBe("number");
    expect(t.duration as number).toBeLessThanOrEqual(0.4);
  });
});

describe("fadeIn preset", () => {
  it("has hidden initial state with opacity 0", () => {
    const initial = fadeIn.hidden as Record<string, unknown>;
    expect(initial.opacity).toBe(0);
  });

  it("has visible state with opacity 1", () => {
    const visible = fadeIn.visible as Record<string, unknown>;
    expect(visible.opacity).toBe(1);
  });

  it("visible transition duration is within the <400ms budget", () => {
    const visible = fadeIn.visible as Record<string, unknown>;
    const t = visible.transition as Record<string, unknown>;
    expect(t.duration as number).toBeLessThanOrEqual(0.4);
  });
});

describe("stagger preset", () => {
  it("visible state has staggerChildren transition", () => {
    const visible = stagger.visible as Record<string, unknown>;
    const t = visible.transition as Record<string, unknown>;
    expect(typeof t.staggerChildren).toBe("number");
  });

  it("stagger total for 6 items is under the <400ms entrance budget", () => {
    const visible = stagger.visible as Record<string, unknown>;
    const t = visible.transition as Record<string, unknown>;
    const staggerChildren = t.staggerChildren as number;
    const delayChildren = (t.delayChildren as number) ?? 0;
    // 6 items × stagger + initial delay must be under 0.4s
    expect(staggerChildren * 6 + delayChildren).toBeLessThan(0.4);
  });
});

describe("slideFromRight preset", () => {
  it("has hidden initial state with x offset", () => {
    const initial = slideFromRight.hidden as Record<string, unknown>;
    expect(initial.opacity).toBe(0);
    expect(typeof initial.x).toBe("number");
    expect(initial.x as number).toBeGreaterThan(0); // comes from the right
  });

  it("has visible state with opacity 1 and x 0", () => {
    const visible = slideFromRight.visible as Record<string, unknown>;
    expect(visible.opacity).toBe(1);
    expect(visible.x).toBe(0);
  });

  it("visible transition duration is within the <400ms budget", () => {
    const visible = slideFromRight.visible as Record<string, unknown>;
    const t = visible.transition as Record<string, unknown>;
    expect(t.duration as number).toBeLessThanOrEqual(0.4);
  });
});

// ---------------------------------------------------------------------------
// useSafeVariants — reduced-motion = true → zero out all durations
// ---------------------------------------------------------------------------
describe("useSafeVariants — reduced motion active", () => {
  beforeEach(() => {
    mockReducedMotion = true;
  });

  it("zeroes transition duration on all variant states", () => {
    const { result } = renderHook(() =>
      useSafeVariants({
        hidden: { opacity: 0, y: 8, transition: { duration: 0.35 } },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
      })
    );
    const durations = collectDurations(result.current as Record<string, unknown>);
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) {
      expect(d).toBe(0);
    }
  });

  it("zeroes staggerChildren and delayChildren", () => {
    const { result } = renderHook(() =>
      useSafeVariants({
        visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
      })
    );
    const visible = (result.current as Record<string, unknown>).visible as Record<string, unknown>;
    const t = visible.transition as Record<string, unknown>;
    expect(t.staggerChildren).toBe(0);
    expect(t.delayChildren).toBe(0);
  });

  it("preserves opacity end-states so content remains visible", () => {
    const { result } = renderHook(() =>
      useSafeVariants({
        hidden: { opacity: 0, y: 8, transition: { duration: 0.35 } },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
      })
    );
    const visible = (result.current as Record<string, unknown>).visible as Record<string, unknown>;
    expect(visible.opacity).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// useSafeVariants — reduced-motion = false → passthrough
// ---------------------------------------------------------------------------
describe("useSafeVariants — no reduced motion (standard)", () => {
  beforeEach(() => {
    mockReducedMotion = false;
  });

  it("returns variants unchanged when no reduced-motion preference", () => {
    const variants = {
      hidden: { opacity: 0, y: 8, transition: { duration: 0.35 } },
      visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
    };
    const { result } = renderHook(() => useSafeVariants(variants));
    expect(result.current).toBe(variants); // same reference
  });
});
