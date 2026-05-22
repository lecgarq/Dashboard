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
  });

  it("detectActivePreset matches a known profile and returns null for a custom mix", () => {
    expect(detectActivePreset(applyPreset("organic"))).toBe("organic");
    expect(detectActivePreset(applyPreset("free"))).toBe("free");
    const custom = { ...applyPreset("organic"), role: 99 };
    expect(detectActivePreset(custom)).toBeNull();
  });
});
