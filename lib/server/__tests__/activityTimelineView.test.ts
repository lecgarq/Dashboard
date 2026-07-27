/**
 * Pure unit tests for buildFloors — no DB, no mocks.
 * Tests the floor aggregation that drives TRUTH-02 labels.
 */
import { describe, it, expect } from "vitest";
import { buildFloors } from "../activityTimelineView";

describe("buildFloors", () => {
  it("returns null dataFloor and empty map for empty input", () => {
    const result = buildFloors([]);
    expect(result.dataFloor).toBeNull();
    expect(result.floorByProject).toEqual({});
  });

  it("returns the single project's floor as both dataFloor and map entry", () => {
    const result = buildFloors([{ projectId: "p1", floorMonth: "2025-06" }]);
    expect(result.dataFloor).toBe("2025-06");
    expect(result.floorByProject).toEqual({ p1: "2025-06" });
  });

  it("picks the earliest YYYY-MM as account-wide dataFloor across multiple projects", () => {
    const result = buildFloors([
      { projectId: "p1", floorMonth: "2025-06" },
      { projectId: "p2", floorMonth: "2024-11" },
      { projectId: "p3", floorMonth: "2025-01" },
    ]);
    expect(result.dataFloor).toBe("2024-11");
    expect(result.floorByProject).toEqual({
      p1: "2025-06",
      p2: "2024-11",
      p3: "2025-01",
    });
  });

  it("handles the account-level synthetic bucket (empty projectId) without crashing", () => {
    const result = buildFloors([
      { projectId: "", floorMonth: "2025-03" },
      { projectId: "p1", floorMonth: "2025-06" },
    ]);
    expect(result.dataFloor).toBe("2025-03");
    expect(result.floorByProject[""]).toBe("2025-03");
    expect(result.floorByProject["p1"]).toBe("2025-06");
  });

  it("formats floors as YYYY-MM (month granularity, no day component)", () => {
    const result = buildFloors([{ projectId: "p1", floorMonth: "2025-09" }]);
    expect(result.dataFloor).toMatch(/^\d{4}-\d{2}$/);
    const floorVal = result.floorByProject["p1"];
    expect(floorVal).toMatch(/^\d{4}-\d{2}$/);
  });

  it("handles a single project where projectId may be null (coerced to empty string)", () => {
    const result = buildFloors([{ projectId: null as unknown as string, floorMonth: "2025-05" }]);
    expect(result.dataFloor).toBe("2025-05");
    expect(result.floorByProject[""]).toBe("2025-05");
  });
});
