import { describe, expect, it } from "vitest";
import { buildActivityDepth } from "./activityDepth";

describe("buildActivityDepth", () => {
  it("centers the time axis: first month -span/2, last month +span/2", () => {
    const z = buildActivityDepth(new Uint16Array([0, 5, 10]), 11, 200);
    expect(z[0]).toBeCloseTo(-100);
    expect(z[1]).toBeCloseTo(0);
    expect(z[2]).toBeCloseTo(100);
  });

  it("clamps out-of-range month ids to the last month", () => {
    const z = buildActivityDepth(new Uint16Array([999]), 4, 100);
    expect(z[0]).toBeCloseTo(50);
  });

  it("degenerates to a flat plane with a single month or zero span", () => {
    expect(Array.from(buildActivityDepth(new Uint16Array([0, 0]), 1, 200))).toEqual([0, 0]);
    expect(Array.from(buildActivityDepth(new Uint16Array([3]), 10, 0))).toEqual([0]);
  });
});
