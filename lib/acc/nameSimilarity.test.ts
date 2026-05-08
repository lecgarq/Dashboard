/**
 * Unit tests for nameSimilarity — Jaccard token-overlap for role-name matching.
 *
 * Plan 04-03 Feature 1 (DASH-04 building block).
 * Pitfall 5: Single-token names must NOT yield false-positive matches.
 */

import { describe, it, expect } from "vitest";
import {
  tokenize,
  nameTokenOverlap,
  DUPLICATE_ROLE_NAME_THRESHOLD,
} from "./nameSimilarity";

describe("tokenize", () => {
  it("splits on whitespace and lowercases", () => {
    expect(tokenize("BIM Coordinator")).toEqual(new Set(["bim", "coordinator"]));
  });

  it("splits on dash as separator", () => {
    expect(tokenize("BIM-Coordinator")).toEqual(new Set(["bim", "coordinator"]));
  });

  it("strips punctuation", () => {
    expect(tokenize("Architect, Senior!")).toEqual(new Set(["architect", "senior"]));
  });

  it("returns empty set for empty input", () => {
    expect(tokenize("")).toEqual(new Set());
  });

  it("returns empty set for whitespace-only input", () => {
    expect(tokenize("   ")).toEqual(new Set());
  });
});

describe("nameTokenOverlap", () => {
  it("returns 1.0 when names are reorderings of the same tokens", () => {
    expect(nameTokenOverlap("BIM Coordinator", "Coordinator BIM")).toBe(1.0);
  });

  it("returns 1.0 for identical single-token names", () => {
    expect(nameTokenOverlap("Architect", "Architect")).toBe(1.0);
  });

  it("returns 0.0 for disjoint single-token names (Pitfall 5)", () => {
    expect(nameTokenOverlap("Architect", "Admin")).toBe(0.0);
  });

  it("returns Jaccard for partial overlap: {bim} ∩ / {bim,coordinator,lead} ∪ = 1/3", () => {
    expect(nameTokenOverlap("BIM Coordinator", "BIM Lead")).toBeCloseTo(1 / 3, 10);
  });

  it("returns 1.0 when both inputs are empty (degenerate)", () => {
    expect(nameTokenOverlap("", "")).toBe(1.0);
  });

  it("returns 0.0 when one side is empty", () => {
    expect(nameTokenOverlap("Architect", "")).toBe(0.0);
    expect(nameTokenOverlap("", "Architect")).toBe(0.0);
  });

  it("returns < threshold for typo case (Architect vs Architecto)", () => {
    // Jaccard {architect} vs {architecto} = 0/2 = 0.0 — correctly NOT auto-flagged at 80%.
    const overlap = nameTokenOverlap("Architect", "Architecto");
    expect(overlap).toBeLessThan(DUPLICATE_ROLE_NAME_THRESHOLD);
    expect(overlap).toBe(0.0);
  });

  it("is case-insensitive", () => {
    expect(nameTokenOverlap("BIM coordinator", "bim COORDINATOR")).toBe(1.0);
  });
});

describe("DUPLICATE_ROLE_NAME_THRESHOLD", () => {
  it("is 0.80 per spec", () => {
    expect(DUPLICATE_ROLE_NAME_THRESHOLD).toBe(0.8);
  });
});
