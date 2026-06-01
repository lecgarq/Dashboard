import { describe, it, expect } from "vitest";
import { parseFilters, serializeFilters } from "../filterParams";
import { EMPTY_FILTERS } from "../types";

describe("filter params", () => {
  it("round-trips", () => {
    const f = { ...EMPTY_FILTERS, projectId: ["p1"], internalExternal: "external" as const, search: "x" };
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });
  it("returns EMPTY_FILTERS for null/garbage", () => {
    expect(parseFilters(null)).toEqual(EMPTY_FILTERS);
    expect(parseFilters("not json")).toEqual(EMPTY_FILTERS);
  });
  it("ignores unknown keys", () => {
    expect(parseFilters(JSON.stringify({ projectId: ["p1"], hacker: 1 }))).toMatchObject({ projectId: ["p1"] });
  });
});
