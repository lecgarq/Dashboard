import { describe, it, expect } from "vitest";
import { buildDimensionWeights } from "../dimensionWeights";
import { CONFIDENCE_FACTOR, getDimension } from "../dimensionRegistry";
import type { NodeFeatureSnapshot } from "../interactionTypes";

// NOTE: dimensionRegistry uses confidence: "high" | "medium" | "low" (NOT "med").
// project → "high" (1.0), signin → "low" (0.4). CONFIDENCE_FACTOR.medium = 0.7.

function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "",
    emailLower: "",
    project: "Tower A",
    role: "Architect",
    permTier: "View Only",
    isExternal: false,
    affiliation: "internal",
    activityBucket: "Med",
    signinBucket: "<30d",
    activityCountRaw: 1,
    lastSignInRel: "",
    permissionCoverage: "known",
    firmName: "Hermosillo",
    accountStatus: "active",
    isAdmin: false,
    moduleSignature: ["build"],
    ...over,
  };
}

describe("buildDimensionWeights", () => {
  it("weight = confidence for an available node (transformer=1 categorical)", () => {
    // project: confidence="high" → CONFIDENCE_FACTOR.high = 1.0; isAvailable: project !== "" && !== "(unknown)" ✓
    // signin:  confidence="low"  → CONFIDENCE_FACTOR.low  = 0.4; isAvailable: always true ✓
    const w = buildDimensionWeights([snap()], ["project", "signin"]);
    expect(w.project[0]).toBeCloseTo(CONFIDENCE_FACTOR.high, 6);   // 1.0
    expect(w.signin[0]).toBeCloseTo(CONFIDENCE_FACTOR.low, 6);     // 0.4
  });

  it("availability gate zeroes the weight for unknown/absent values", () => {
    // company.isAvailable:           firmName !== ""          → firmName="" gates out
    // internalExternal.isAvailable:  affiliation !== "unknown" → affiliation="unknown" gates out
    // activity.isAvailable:          activityBucket !== "None" → activityBucket="None" gates out
    const w = buildDimensionWeights(
      [snap({ firmName: "", affiliation: "unknown", activityBucket: "None" })],
      ["company", "internalExternal", "activity"],
    );
    expect(w.company[0]).toBe(0);
    expect(w.internalExternal[0]).toBe(0);
    expect(w.activity[0]).toBe(0);
  });

  it("one Float32Array per dim, length = node count", () => {
    const w = buildDimensionWeights([snap(), snap()], ["role"]);
    expect(w.role).toBeInstanceOf(Float32Array);
    expect(w.role.length).toBe(2);
  });
});
