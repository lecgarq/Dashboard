import { describe, it, expect } from "vitest";

/**
 * Unit tests for the pure dcCoverageView assembly helper.
 * These test the exported `assembleDcCoverage` function without a DB connection.
 * DB-backed `loadDcCoverage` is not unit-tested here (integration concern).
 */
import { assembleDcCoverage } from "../dcCoverageView";

describe("assembleDcCoverage", () => {
  it("returns { covered, total } verbatim for representative inputs", () => {
    const result = assembleDcCoverage(550, 1153);
    expect(result.covered).toBe(550);
    expect(result.total).toBe(1153);
  });

  it("covered is always <= total (DC is a subset of the live project universe)", () => {
    const result = assembleDcCoverage(550, 1153);
    expect(result.covered).toBeLessThanOrEqual(result.total);
  });

  it("returns { covered: 0, total: 0 } for zero inputs — no hard-coded fallback constants", () => {
    const result = assembleDcCoverage(0, 0);
    expect(result.covered).toBe(0);
    expect(result.total).toBe(0);
  });
});
