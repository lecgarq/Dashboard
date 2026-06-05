import { describe, it, expect } from "vitest";
import { classifyCoordination } from "./coordinationClassifier";

describe("classifyCoordination", () => {
  it("flags a real clash by trailing [clashId] in the title (high)", () => {
    expect(classifyCoordination({ title: "Security Devices, AXIS P3267-LVE and Basic Wall [7256324]" }))
      .toEqual({ isCoordination: true, source: "title", clashId: "7256324", confidence: "high" });
  });

  it("flags a real clash by the auto-filled description (high)", () => {
    const description =
      "1 clash between Security Devices, AXIS P3267-LVE in VYD_PREPATEC_R24_V3.rvt - {3D - luis.cortesWXLY7} " +
      "and ARCH-A-PREPATEC-2024_V3.rvt - {3D - luis.cortesWXLY7}";
    expect(classifyCoordination({ title: "no bracket here", description }))
      .toEqual({ isCoordination: true, source: "description", clashId: null, confidence: "high" });
  });

  it("handles plural 'clashes between'", () => {
    expect(classifyCoordination({ description: "3 clashes between A and B" }).isCoordination).toBe(true);
  });

  it("flags short room-number brackets but tags them low (audit bucket)", () => {
    expect(classifyCoordination({ title: "Door schedule [204]" }))
      .toEqual({ isCoordination: true, source: "title", clashId: "204", confidence: "low" });
  });

  it("does NOT flag hand-typed text containing 'and'", () => {
    expect(classifyCoordination({ title: "Fix door", description: "replace the slab and beam" }).isCoordination).toBe(false);
  });

  it("does NOT flag Spanish auto-text (left to Pass 2)", () => {
    expect(classifyCoordination({ title: "sin corchete", description: "1 conflicto entre A y B" }).isCoordination).toBe(false);
  });

  it("returns all-null on empty input", () => {
    expect(classifyCoordination({}))
      .toEqual({ isCoordination: false, source: null, clashId: null, confidence: null });
  });

  it("requires two {3D - user} markers for the corroborated description rule", () => {
    expect(classifyCoordination({ description: "discuss the clash between teams and vendors" }).isCoordination).toBe(false);
  });

  it("flags a corroborated description (no lead phrase, clash between … and … + 2 markers) as medium", () => {
    const description =
      "Coordination clash between Pipe in MEP.rvt - {3D - userA} and Beam in STR.rvt - {3D - userB}";
    expect(classifyCoordination({ description }))
      .toEqual({ isCoordination: true, source: "description", clashId: null, confidence: "medium" });
  });
});
