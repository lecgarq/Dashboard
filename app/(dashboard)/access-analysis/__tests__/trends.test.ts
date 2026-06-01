import { describe, it, expect } from "vitest";
import { bucketByWeek, bucketByMonth } from "../trends";

describe("trend bucketers", () => {
  it("buckets ISO timestamps by week (YYYY-Www) and counts", () => {
    const out = bucketByWeek(["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "2026-01-20T00:00:00Z"]);
    const total = out.reduce((s, p) => s + p.value, 0);
    expect(total).toBe(3);
    expect(out).toEqual([...out].sort((a, b) => a.label.localeCompare(b.label)));
  });
  it("buckets by month (YYYY-MM)", () => {
    const out = bucketByMonth(["2024-01-15", "2024-01-20", "2024-03-01"]);
    expect(out).toEqual([{ label: "2024-01", value: 2 }, { label: "2024-03", value: 1 }]);
  });
});
