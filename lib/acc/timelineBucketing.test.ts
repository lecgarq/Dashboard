import { describe, it, expect } from "vitest";
import { pickBinSize, bucketStart, generateBuckets, computeActivityHeatmap } from "./timelineBucketing";

describe("pickBinSize", () => {
  it("returns 'day' for 30d window", () => {
    expect(pickBinSize("30d")).toBe("day");
  });
  it("returns 'week' for 90d window", () => {
    expect(pickBinSize("90d")).toBe("week");
  });
  it("returns 'week' for 1y window", () => {
    expect(pickBinSize("1y")).toBe("week");
  });
  it("returns 'month' for 'all' window", () => {
    expect(pickBinSize("all")).toBe("month");
  });
});

describe("bucketStart", () => {
  it("truncates a date to day start UTC", () => {
    const d = new Date("2026-05-13T17:42:00.000Z");
    expect(bucketStart(d, "day").toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });
  it("truncates a date to ISO week start (Monday UTC)", () => {
    // 2026-05-13 is a Wednesday; ISO week starts Monday 2026-05-11
    const d = new Date("2026-05-13T17:42:00.000Z");
    expect(bucketStart(d, "week").toISOString()).toBe("2026-05-11T00:00:00.000Z");
  });
  it("truncates a date to month start UTC", () => {
    const d = new Date("2026-05-13T17:42:00.000Z");
    expect(bucketStart(d, "month").toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("generateBuckets", () => {
  it("generates daily buckets for a 7-day window", () => {
    const start = new Date("2026-05-07T00:00:00.000Z");
    const end = new Date("2026-05-13T23:59:59.999Z");
    const out = generateBuckets(start, end, "day");
    expect(out).toHaveLength(7);
    expect(out[0].toISOString()).toBe("2026-05-07T00:00:00.000Z");
    expect(out[6].toISOString()).toBe("2026-05-13T00:00:00.000Z");
  });
});

describe("computeActivityHeatmap", () => {
  it("bins dates correctly by day of week and hour of day in UTC", () => {
    // 2026-05-20T10:30:00Z is a Wednesday (getUTCDay() = 3 -> "Wed") at 10h (getUTCHours() = 10 -> "10:00")
    // 2026-05-18T15:15:00Z is a Monday (getUTCDay() = 1 -> "Mon") at 15h (getUTCHours() = 15 -> "15:00")
    const dates = [
      new Date("2026-05-20T10:30:00.000Z"),
      new Date("2026-05-20T10:45:00.000Z"),
      new Date("2026-05-18T15:15:00.000Z"),
    ];

    const heatmap = computeActivityHeatmap(dates);

    // We expect 7 rows: Sun, Mon, Tue, Wed, Thu, Fri, Sat
    expect(heatmap).toHaveLength(7);
    expect(heatmap.map((r) => r.id)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);

    // Check Monday at 15:00 has count 1
    const mon = heatmap.find((r) => r.id === "Mon")!;
    const bin15 = mon.data.find((d) => d.x === "15:00")!;
    expect(bin15.y).toBe(1);

    // Check Wednesday at 10:00 has count 2
    const wed = heatmap.find((r) => r.id === "Wed")!;
    const bin10 = wed.data.find((d) => d.x === "10:00")!;
    expect(bin10.y).toBe(2);

    // Check other bins are 0
    const bin00 = wed.data.find((d) => d.x === "00:00")!;
    expect(bin00.y).toBe(0);
  });
});
