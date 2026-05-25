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

  it("membershipBucket: unknown tenure → 0; real bucket → CONFIDENCE_FACTOR.medium (0.7)", () => {
    // membershipBucket confidence="medium" → CONFIDENCE_FACTOR.medium = 0.7;
    // isAvailable: false for "unknown"/undefined, true for a real bucket.
    const unknown = buildDimensionWeights([snap({ membershipBucket: "unknown" })], ["membershipBucket"]);
    expect(unknown.membershipBucket[0]).toBe(0);
    const real = buildDimensionWeights([snap({ membershipBucket: ">1y" })], ["membershipBucket"]);
    expect(real.membershipBucket[0]).toBeCloseTo(CONFIDENCE_FACTOR.medium, 6); // 0.7
  });

  it("activityRecency: none/undefined → 0; real bucket → CONFIDENCE_FACTOR.medium (0.7)", () => {
    // activityRecency confidence="medium" → CONFIDENCE_FACTOR.medium = 0.7;
    // isAvailable: false for "none"/undefined, true for a real bucket.
    const none = buildDimensionWeights([snap({ activityRecencyBucket: "none" })], ["activityRecency"]);
    expect(none.activityRecency[0]).toBe(0);
    const undef = buildDimensionWeights([snap({ activityRecencyBucket: undefined })], ["activityRecency"]);
    expect(undef.activityRecency[0]).toBe(0);
    const real = buildDimensionWeights([snap({ activityRecencyBucket: "0-7d" })], ["activityRecency"]);
    expect(real.activityRecency[0]).toBeCloseTo(CONFIDENCE_FACTOR.medium, 6); // 0.7
  });

  it("riskScore: zero/undefined risk → 0 (the >0 gate); risk≥1 → CONFIDENCE_FACTOR.low (0.4)", () => {
    // riskScore confidence="low" → CONFIDENCE_FACTOR.low = 0.4;
    // isAvailable: (riskScore ?? 0) > 0 — zero-risk nodes exert NO layout pull (calm layout).
    const zero = buildDimensionWeights([snap({ riskScore: 0 })], ["riskScore"]);
    expect(zero.riskScore[0]).toBe(0);
    const undef = buildDimensionWeights([snap({ riskScore: undefined })], ["riskScore"]);
    expect(undef.riskScore[0]).toBe(0);
    const one = buildDimensionWeights([snap({ riskScore: 1 })], ["riskScore"]);
    expect(one.riskScore[0]).toBeCloseTo(CONFIDENCE_FACTOR.low, 6); // 0.4
    const five = buildDimensionWeights([snap({ riskScore: 5 })], ["riskScore"]);
    expect(five.riskScore[0]).toBeCloseTo(CONFIDENCE_FACTOR.low, 6); // 0.4
  });
});
