import { describe, it, expect } from "vitest";
import { calibrateSliderResponse, SLIDER_RESPONSE_GAMMA } from "./sliderCalibration";

describe("sliderCalibration", () => {
  it("is monotonic non-decreasing across 0..1", () => {
    let prev = -1;
    for (let i = 0; i <= 10; i++) {
      const v = calibrateSliderResponse(i / 10);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("fixes the endpoints: 0→0 and 1→1 (no dead zone at the top, full at max)", () => {
    expect(calibrateSliderResponse(0)).toBe(0);
    expect(calibrateSliderResponse(1)).toBe(1);
  });

  it("clamps out-of-range input", () => {
    expect(calibrateSliderResponse(-0.5)).toBe(0);
    expect(calibrateSliderResponse(2)).toBe(1);
  });

  it("default gamma is identity (no behavior change until tuned)", () => {
    expect(SLIDER_RESPONSE_GAMMA).toBe(1);
    expect(calibrateSliderResponse(0.5)).toBeCloseTo(0.5, 6);
  });
});
