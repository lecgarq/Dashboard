// @vitest-environment jsdom
/**
 * usePredicateEngine.test.tsx — Phase 4-01 Task 3 coverage:
 *   - empty inputs → all 1.0
 *   - categorical filter narrows by role
 *   - search prefix dims non-matches
 *   - lassoSelection narrows to members only
 *   - isolatedNodeIndex overrides everything
 *   - drillDown applies only inside lassoSelection
 *   - source contains zero references to sim/getPositions (PHYS-04 invariant)
 */

import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";

import { usePredicateEngine, featureValueForDim } from "../usePredicateEngine";
import type { NodeFeatureSnapshot, PredicateInputs } from "../interactionTypes";
import type { PhysicsLayer } from "../physicsLayer";

// ---- fixtures --------------------------------------------------------------

function mkFeature(over: Partial<NodeFeatureSnapshot> & { nodeId: string }): NodeFeatureSnapshot {
  return {
    nodeId: over.nodeId,
    nameLower: over.nameLower ?? "test",
    emailLower: over.emailLower ?? "test@x.com",
    project: over.project ?? "P1",
    role: over.role ?? "member",
    permTier: over.permTier ?? null,
    isExternal: over.isExternal ?? false,
    activityBucket: over.activityBucket ?? "Low",
    signinBucket: over.signinBucket ?? "<30d",
    activityCountRaw: over.activityCountRaw ?? 5,
    lastSignInRel: over.lastSignInRel ?? "5d ago",
  };
}

function mkPhysics(): { physics: PhysicsLayer; lastPredicate: () => (i: number) => number } {
  let predicate: (i: number) => number = () => 1;
  const physics: Partial<PhysicsLayer> = {
    setMask: vi.fn((p: (i: number) => number) => {
      predicate = p;
    }),
    alphaMask: new Float32Array(0),
    maskVersion: 0,
  };
  return {
    physics: physics as PhysicsLayer,
    lastPredicate: () => predicate,
  };
}

function runHook(inputs: PredicateInputs): void {
  renderHook(({ i }) => usePredicateEngine(i), { initialProps: { i: inputs } });
}

// ---- tests -----------------------------------------------------------------

describe("usePredicateEngine — Pattern 1 single mask", () => {
  it("empty inputs → all indices return 1.0", () => {
    const { physics, lastPredicate } = mkPhysics();
    const features = [
      mkFeature({ nodeId: "a" }),
      mkFeature({ nodeId: "b" }),
      mkFeature({ nodeId: "c" }),
    ];
    runHook({
      physics,
      features,
      activeFilters: {},
      searchQuery: "",
      lassoSelection: null,
      drillDown: null,
      isolatedNodeIndex: null,
    });
    const p = lastPredicate();
    expect(p(0)).toBe(1.0);
    expect(p(1)).toBe(1.0);
    expect(p(2)).toBe(1.0);
  });

  it("categorical filter { role: admin } narrows correctly", () => {
    const { physics, lastPredicate } = mkPhysics();
    const features = [
      mkFeature({ nodeId: "0", role: "admin" }),
      mkFeature({ nodeId: "1", role: "user" }),
      mkFeature({ nodeId: "2", role: "admin" }),
    ];
    runHook({
      physics,
      features,
      activeFilters: { role: new Set(["admin"]) },
      searchQuery: "",
      lassoSelection: null,
      drillDown: null,
      isolatedNodeIndex: null,
    });
    const p = lastPredicate();
    expect(p(0)).toBe(1.0);
    expect(p(1)).toBe(0.15);
    expect(p(2)).toBe(1.0);
  });

  it("search prefix matches name OR email", () => {
    const { physics, lastPredicate } = mkPhysics();
    const features = [
      mkFeature({ nodeId: "0", nameLower: "luis", emailLower: "luis@x.com" }),
      mkFeature({ nodeId: "1", nameLower: "mario", emailLower: "mario@x.com" }),
      mkFeature({ nodeId: "2", nameLower: "luisa", emailLower: "luisa@x.com" }),
    ];
    runHook({
      physics,
      features,
      activeFilters: {},
      searchQuery: "lu",
      lassoSelection: null,
      drillDown: null,
      isolatedNodeIndex: null,
    });
    const p = lastPredicate();
    expect(p(0)).toBe(1.0);
    expect(p(1)).toBe(0.15);
    expect(p(2)).toBe(1.0);
  });

  it("lassoSelection narrows to member indices", () => {
    const { physics, lastPredicate } = mkPhysics();
    const features = [
      mkFeature({ nodeId: "0" }),
      mkFeature({ nodeId: "1" }),
      mkFeature({ nodeId: "2" }),
    ];
    runHook({
      physics,
      features,
      activeFilters: {},
      searchQuery: "",
      lassoSelection: new Set([0, 2]),
      drillDown: null,
      isolatedNodeIndex: null,
    });
    const p = lastPredicate();
    expect(p(0)).toBe(1.0);
    expect(p(1)).toBe(0.15);
    expect(p(2)).toBe(1.0);
  });

  it("isolatedNodeIndex overrides filters + search + lasso", () => {
    const { physics, lastPredicate } = mkPhysics();
    const features = Array.from({ length: 7 }, (_, i) =>
      mkFeature({ nodeId: String(i), role: "admin" }),
    );
    runHook({
      physics,
      features,
      activeFilters: { role: new Set(["user"]) }, // would normally dim everyone
      searchQuery: "zzz",
      lassoSelection: new Set([0]),
      drillDown: null,
      isolatedNodeIndex: 5,
    });
    const p = lastPredicate();
    for (let i = 0; i < 7; i++) {
      expect(p(i)).toBe(i === 5 ? 1.0 : 0.15);
    }
  });

  it("drillDown only filters INSIDE lassoSelection", () => {
    const { physics, lastPredicate } = mkPhysics();
    const features = [
      mkFeature({ nodeId: "0", role: "admin" }),
      mkFeature({ nodeId: "1", role: "user" }),
      mkFeature({ nodeId: "2", role: "admin" }),
    ];
    runHook({
      physics,
      features,
      activeFilters: {},
      searchQuery: "",
      lassoSelection: new Set([0, 1, 2]),
      drillDown: { role: "admin" },
      isolatedNodeIndex: null,
    });
    const p = lastPredicate();
    expect(p(0)).toBe(1.0);
    expect(p(1)).toBe(0.15); // member of lasso but fails drilldown
    expect(p(2)).toBe(1.0);
  });

  it("featureValueForDim maps all six dimensions", () => {
    const f = mkFeature({
      nodeId: "x",
      role: "admin",
      permTier: "edit",
      project: "P",
      isExternal: true,
      activityBucket: "High",
      signinBucket: "<7d",
    });
    expect(featureValueForDim(f, "role")).toBe("admin");
    expect(featureValueForDim(f, "tier")).toBe("edit");
    expect(featureValueForDim(f, "project")).toBe("P");
    expect(featureValueForDim(f, "isExternal")).toBe("external");
    expect(featureValueForDim(f, "activity")).toBe("High");
    expect(featureValueForDim(f, "signin")).toBe("<7d");
  });

  it("PHYS-04 invariant — source contains no simulation symbols", () => {
    const src = readFileSync(
      path.resolve(__dirname, "..", "usePredicateEngine.ts"),
      "utf8",
    );
    expect(src.match(/\bgetPositions\b/)).toBeNull();
    expect(src.match(/\bsim\./)).toBeNull();
    expect(src.match(/\.restart\(/)).toBeNull();
    expect(src.match(/\balpha\(/)).toBeNull();
  });
});
