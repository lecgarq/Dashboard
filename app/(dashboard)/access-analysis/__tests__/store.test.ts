import { describe, it, expect, beforeEach } from "vitest";
import { useAccessFilters } from "../store";

const reset = () => useAccessFilters.getState().clearAll();

describe("useAccessFilters", () => {
  beforeEach(reset);
  it("toggles a multi-select value on and off", () => {
    useAccessFilters.getState().toggle("projectId", "p1");
    expect(useAccessFilters.getState().filters.projectId).toEqual(["p1"]);
    useAccessFilters.getState().toggle("projectId", "p1");
    expect(useAccessFilters.getState().filters.projectId).toEqual([]);
  });
  it("sets a single-select dimension", () => {
    useAccessFilters.getState().setSingle("internalExternal", "external");
    expect(useAccessFilters.getState().filters.internalExternal).toBe("external");
  });
  it("clearAll resets and activeCount reflects selections", () => {
    useAccessFilters.getState().toggle("module", "build");
    useAccessFilters.getState().setSingle("adminMember", "admin");
    expect(useAccessFilters.getState().activeCount()).toBe(2);
    useAccessFilters.getState().clearAll();
    expect(useAccessFilters.getState().activeCount()).toBe(0);
  });
});
