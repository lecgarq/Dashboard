import { describe, it, expect } from "vitest";
import { buildMaskPredicate } from "../usePredicateEngine";
import type { NodeFeatureSnapshot } from "../interactionTypes";

/** Minimal feature stub — only fields the predicate reads need to be real. */
function f(nodeId: string): NodeFeatureSnapshot {
  return {
    nodeId,
    role: "member",
    permTier: "viewer",
    project: "p",
    isExternal: false,
    activityBucket: "active",
    signinBucket: "recent",
    nameLower: "name",
    emailLower: "name@x.com",
  } as unknown as NodeFeatureSnapshot;
}

type Inputs = Parameters<typeof buildMaskPredicate>[0];

const EMPTY: Inputs = {
  features: [],
  activeFilters: {},
  searchQuery: "",
  lassoSelection: null,
  drillDown: null,
  isolatedNodeIndex: null,
};

describe("buildMaskPredicate — isolate lights the same-user footprint", () => {
  it("lights every instance whose userId matches the isolated node, dims the rest", () => {
    const features = [f("u1::pA"), f("u1::pB"), f("u2::pA")];
    const predicate = buildMaskPredicate({ ...EMPTY, features, isolatedNodeIndex: 0 });
    expect(predicate(0)).toBe(1.0); // clicked instance
    expect(predicate(1)).toBe(1.0); // same user, other project → footprint lit
    expect(predicate(2)).toBe(0.15); // different user → dimmed
  });

  it("lights only the clicked node when the user has a single instance", () => {
    const features = [f("u1::pA"), f("u2::pA"), f("u3::pA")];
    const predicate = buildMaskPredicate({ ...EMPTY, features, isolatedNodeIndex: 1 });
    expect(predicate(0)).toBe(0.15);
    expect(predicate(1)).toBe(1.0);
    expect(predicate(2)).toBe(0.15);
  });
});

describe("buildMaskPredicate — non-isolate paths unchanged", () => {
  it("returns 1.0 for all nodes when nothing is active", () => {
    const features = [f("u1::pA"), f("u2::pB")];
    const predicate = buildMaskPredicate({ ...EMPTY, features });
    expect(predicate(0)).toBe(1.0);
    expect(predicate(1)).toBe(1.0);
  });

  it("dims nodes failing a global filter chip (AND semantics)", () => {
    const features = [f("u1::pA"), f("u2::pB")];
    const predicate = buildMaskPredicate({
      ...EMPTY,
      features,
      activeFilters: { role: new Set(["member"]) },
    });
    // both have role "member" → both lit
    expect(predicate(0)).toBe(1.0);
    expect(predicate(1)).toBe(1.0);
    const strict = buildMaskPredicate({
      ...EMPTY,
      features,
      activeFilters: { role: new Set(["admin"]) },
    });
    expect(strict(0)).toBe(0.15);
    expect(strict(1)).toBe(0.15);
  });

  it("lights only lasso members when a lasso selection is active", () => {
    const features = [f("u1::pA"), f("u2::pB"), f("u3::pC")];
    const predicate = buildMaskPredicate({
      ...EMPTY,
      features,
      lassoSelection: new Set([2]),
    });
    expect(predicate(0)).toBe(0.15);
    expect(predicate(1)).toBe(0.15);
    expect(predicate(2)).toBe(1.0);
  });
});
