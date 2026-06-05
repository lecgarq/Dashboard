// lib/acc/reconcileClashes.test.ts
import { describe, it, expect } from "vitest";
import { reconcileClashes } from "./reconcileClashes";

describe("reconcileClashes", () => {
  const stored = [
    { id: "a", isCoordination: true },  // matched, heuristic correct
    { id: "b", isCoordination: false }, // matched, heuristic missed → false neg
    { id: "c", isCoordination: true },  // not a clash → false pos
    { id: "d", isCoordination: false }, // not a clash, not flagged → ignored
  ];
  const clashIds = new Set(["a", "b", "e"]); // "e" not among stored

  it("partitions matched / false-neg / false-pos / missing", () => {
    expect(reconcileClashes(stored, clashIds)).toEqual({
      validatedIds: ["a", "b"],
      falseNegIds: ["b"],
      falsePosIds: ["c"],
      missingIds: ["e"],
    });
  });

  it("is empty-safe", () => {
    expect(reconcileClashes([], new Set())).toEqual({
      validatedIds: [], falseNegIds: [], falsePosIds: [], missingIds: [],
    });
  });
});
