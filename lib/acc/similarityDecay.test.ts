import { describe, it, expect } from "vitest";
import { temporalDecay, DEFAULT_DECAY_TAU_DAYS } from "./similarityDecay";

describe("temporalDecay", () => {
  it("returns 1.0 when both timestamps are equal", () => {
    const t = new Date("2026-05-01").getTime();
    expect(temporalDecay(t, t)).toBeCloseTo(1.0, 5);
  });

  it("returns ~0.37 (1/e) at exactly tau days apart", () => {
    const a = new Date("2026-05-01").getTime();
    const b = a + DEFAULT_DECAY_TAU_DAYS * 86_400_000;
    expect(temporalDecay(a, b)).toBeCloseTo(Math.exp(-1), 3);
  });

  it("returns ~0 past 3*tau days", () => {
    const a = new Date("2026-01-01").getTime();
    const b = a + 3 * DEFAULT_DECAY_TAU_DAYS * 86_400_000;
    expect(temporalDecay(a, b)).toBeLessThan(0.05);
  });

  it("returns 0 if either timestamp is null", () => {
    expect(temporalDecay(null, Date.now())).toBe(0);
    expect(temporalDecay(Date.now(), null)).toBe(0);
    expect(temporalDecay(null, null)).toBe(0);
  });

  it("is symmetric in a and b", () => {
    const a = new Date("2026-05-01").getTime();
    const b = new Date("2026-05-15").getTime();
    expect(temporalDecay(a, b)).toBe(temporalDecay(b, a));
  });
});
