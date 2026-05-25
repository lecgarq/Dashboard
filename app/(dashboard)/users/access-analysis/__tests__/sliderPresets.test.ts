import { describe, it, expect } from "vitest";
import { SLIDER_PRESETS, applyPreset, detectActivePreset } from "../sliderPresets";
import { runtimeDefaultSliders } from "../dimensionRegistry";
import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";

describe("sliderPresets", () => {
  it("every preset has an id, a label, and a weights map", () => {
    for (const p of SLIDER_PRESETS) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.label).toBe("string");
      expect(p.weights).toBeTypeOf("object");
    }
  });

  it("applyPreset returns a value for EVERY slider dim, clamped 0..100, baseline 0", () => {
    // `free` = no semantic attraction → every slider 0 (organic base layout, NOT a globe).
    const free = applyPreset("free");
    for (const id of SLIDER_DIMENSION_IDS) {
      expect(free[id]).toBe(0);
    }
    const organic = applyPreset("organic");
    for (const id of SLIDER_DIMENSION_IDS) {
      expect(organic[id]).toBeGreaterThanOrEqual(0);
      expect(organic[id]).toBeLessThanOrEqual(100);
    }
  });

  it("the organic preset reproduces the P3 default layout for the primary dims", () => {
    const organic = applyPreset("organic");
    const defaults = runtimeDefaultSliders(); // {project:35, role:25, tier:15, internalExternal:10, activity:5, signin:5}
    for (const [id, v] of Object.entries(defaults)) {
      expect(organic[id]).toBe(v);
    }
    expect(organic.module).toBe(15); // promoted module keeps its 0.15 contribution (decision 4)
    // decision 2: advanced dims are OFF in organic; module is the ONLY active advanced dim.
    // (Guards the P3 layout-parity guarantee — organic must not turn on company/isAdmin.)
    expect(organic.company).toBe(0);
    expect(organic.isAdmin).toBe(0);
  });

  it("detectActivePreset matches a known profile and returns null for a custom mix", () => {
    expect(detectActivePreset(applyPreset("organic"))).toBe("organic");
    expect(detectActivePreset(applyPreset("free"))).toBe("free");
    const custom = { ...applyPreset("organic"), role: 99 };
    expect(detectActivePreset(custom)).toBeNull();
  });

  // ---- P6: new presets ----------------------------------------------------

  /** Assert a preset sets EXACTLY `expected` non-zero and 0 for every other slider dim. */
  function expectExactPreset(presetId: string, expected: Record<string, number>): void {
    const values = applyPreset(presetId);
    for (const id of SLIDER_DIMENSION_IDS) {
      expect(values[id]).toBe(expected[id] ?? 0);
    }
  }

  it("governance preset sets exactly {riskScore,internalExternal,isAdmin,tier} and 0 elsewhere", () => {
    expectExactPreset("governance", {
      riskScore: 45,
      internalExternal: 25,
      isAdmin: 20,
      tier: 15,
    });
  });

  it("tenure preset sets exactly {membershipBucket,project,role} and 0 elsewhere", () => {
    expectExactPreset("tenure", {
      membershipBucket: 45,
      project: 20,
      role: 15,
    });
  });

  it("engagement preset sets exactly {activityRecency,activity,signin} and 0 elsewhere", () => {
    expectExactPreset("engagement", {
      activityRecency: 40,
      activity: 25,
      signin: 15,
    });
  });

  it("detectActivePreset round-trips the three new presets", () => {
    expect(detectActivePreset(applyPreset("governance"))).toBe("governance");
    expect(detectActivePreset(applyPreset("tenure"))).toBe("tenure");
    expect(detectActivePreset(applyPreset("engagement"))).toBe("engagement");
  });

  it("REGRESSION: organic preset is unchanged and round-trips", () => {
    expect(detectActivePreset(applyPreset("organic"))).toBe("organic");
    const organic = applyPreset("organic");
    expect(organic.module).toBe(15); // P4 module behavior preserved
    const defaults = runtimeDefaultSliders();
    for (const [id, v] of Object.entries(defaults)) {
      expect(organic[id]).toBe(v);
    }
  });

  it("flat preset maps EVERY slider dim (incl. the 3 new sliders) to 20", () => {
    const flat = applyPreset("flat");
    for (const id of SLIDER_DIMENSION_IDS) {
      expect(flat[id]).toBe(20);
    }
    // Explicitly assert the new sliders are covered.
    expect(flat.membershipBucket).toBe(20);
    expect(flat.activityRecency).toBe(20);
    expect(flat.riskScore).toBe(20);
  });
});
