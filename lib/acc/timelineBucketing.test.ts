import { describe, it, expect } from "vitest";
import { pickBinSize, bucketStart, generateBuckets } from "./timelineBucketing";

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
