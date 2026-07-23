import { describe, expect, it } from "vitest";
import {
  weekFloorFromMonthFloor,
  weekFloorMs,
  weekIdFor,
  weekLabel,
  weekMonthLabel,
} from "./activityWeeks";

describe("activityWeeks", () => {
  it("anchors the floor to the Monday on/before the corpus month start", () => {
    // 2024-12-01 is a Sunday → walks back 6 days.
    expect(weekFloorFromMonthFloor("2024-12")).toBe("2024-11-25");
    // 2025-09-01 is already a Monday → stays put.
    expect(weekFloorFromMonthFloor("2025-09")).toBe("2025-09-01");
  });

  it("returns an empty floor for an unparseable month floor", () => {
    expect(weekFloorFromMonthFloor("")).toBe("");
    expect(weekFloorFromMonthFloor("nope")).toBe("");
  });

  it("buckets timestamps into whole weeks from the floor", () => {
    const base = weekFloorMs("2024-11-25");
    expect(weekIdFor(base, new Date("2024-11-25T00:00:00Z"))).toBe(0);
    expect(weekIdFor(base, new Date("2024-12-01T23:59:59Z"))).toBe(0);
    expect(weekIdFor(base, new Date("2024-12-02T00:00:00Z"))).toBe(1);
    expect(weekIdFor(base, new Date("2024-12-11T19:26:30Z"))).toBe(2);
  });

  it("clamps pre-floor timestamps to week 0 instead of going negative", () => {
    const base = weekFloorMs("2024-11-25");
    expect(weekIdFor(base, new Date("2024-01-01T00:00:00Z"))).toBe(0);
  });

  it("labels a week by its Monday, and its month for the track ticks", () => {
    expect(weekLabel("2024-11-25", 1)).toBe("Dec 2, 2024");
    expect(weekMonthLabel("2024-11-25", 1)).toBe("Dec 2024");
    expect(weekMonthLabel("2024-11-25", 0)).toBe("Nov 2024");
  });
});
