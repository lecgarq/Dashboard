import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeTargetPositions,
  type DimensionDescriptor,
  type NodeFeatureVector,
} from "./mathLayer";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const dims: DimensionDescriptor[] = [
  { id: "activity",   kind: "scalar"  },  // d=0, θ=0      → (cos 0,   sin 0)   = (1, 0)
  { id: "recency",    kind: "scalar"  },  // d=1, θ=π/2    → (cos π/2, sin π/2) = (0, 1)
  { id: "isAdmin",    kind: "boolean" },  // d=2, θ=π      → (cos π,   sin π)   = (-1, 0)
  { id: "isExternal", kind: "boolean" },  // d=3, θ=3π/2   → (cos 3π/2,sin 3π/2)= (0, -1)
];

function node(over: Partial<NodeFeatureVector> = {}): NodeFeatureVector {
  return {
    id: "n",
    activity: 1,
    recency: 0.5,
    isAdmin: 1,
    isExternal: 0,
    roleWeights: new Map(),
    moduleWeights: new Map(),
    permTierWeights: new Map(),
    ...over,
  };
}

const R = 300; // must match R_DEFAULT in mathLayer.ts

// ---------------------------------------------------------------------------
// Test 1: MATH-04 zero state
// ---------------------------------------------------------------------------

describe("mathLayer — MATH-04 zero state", () => {
  it("all sliders = 0 → position = (0, 0, 0) exactly", () => {
    const pos = computeTargetPositions(
      [node()],
      dims,
      { activity: 0, recency: 0, isAdmin: 0, isExternal: 0 },
    );
    expect(Array.from(pos)).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// Test 2: MATH-03 single slider / single dim
// ---------------------------------------------------------------------------

describe("mathLayer — MATH-03 single slider", () => {
  it("activity=1 slider alone → x ≈ R, y ≈ 0, z = 0", () => {
    // dim 0 (activity): θ=0 → u=(1,0) → expected x=R*1*1/1=R, y=0
    const pos = computeTargetPositions(
      [node({ activity: 1 })],
      dims,
      { activity: 1, recency: 0, isAdmin: 0, isExternal: 0 },
    );
    expect(pos[0]).toBeCloseTo(R, 4);
    expect(pos[1]).toBeCloseTo(0, 4);
    expect(pos[2]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: MATH-03 two-slider additive blend
// ---------------------------------------------------------------------------

describe("mathLayer — MATH-03 two-slider blend", () => {
  it("activity=1 and recency=1 both at slider=1 blend additively", () => {
    const pos = computeTargetPositions(
      [node({ activity: 1, recency: 1 })],
      dims,
      { activity: 1, recency: 1, isAdmin: 0, isExternal: 0 },
    );
    // dim 0: θ=0, dim 1: θ=π/2
    const theta0 = (0 / 4) * 2 * Math.PI; // 0
    const theta1 = (1 / 4) * 2 * Math.PI; // π/2
    // formula: (R*1*1*cos(0) + R*1*1*cos(π/2)) / (1+1)
    const expectedX = (R * 1 * 1 * Math.cos(theta0) + R * 1 * 1 * Math.cos(theta1)) / 2;
    const expectedY = (R * 1 * 1 * Math.sin(theta0) + R * 1 * 1 * Math.sin(theta1)) / 2;
    expect(pos[0]).toBeCloseTo(expectedX, 4);
    expect(pos[1]).toBeCloseTo(expectedY, 4);
    expect(pos[2]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: MATH-02 dimension axis distribution
// ---------------------------------------------------------------------------

describe("mathLayer — MATH-02 axis distribution", () => {
  it("4 dims place nodes at cardinal points when slider selects one dim", () => {
    const allOne = node({ activity: 1, recency: 1, isAdmin: 1, isExternal: 1 });

    // dim 0 (θ=0): (R, 0)
    const p0 = computeTargetPositions([allOne], dims, { activity: 1, recency: 0, isAdmin: 0, isExternal: 0 });
    expect(p0[0]).toBeCloseTo(R,  3);
    expect(p0[1]).toBeCloseTo(0,  3);

    // dim 1 (θ=π/2): (0, R)
    const p1 = computeTargetPositions([allOne], dims, { activity: 0, recency: 1, isAdmin: 0, isExternal: 0 });
    expect(p1[0]).toBeCloseTo(0,  3);
    expect(p1[1]).toBeCloseTo(R,  3);

    // dim 2 (θ=π): (-R, 0)
    const p2 = computeTargetPositions([allOne], dims, { activity: 0, recency: 0, isAdmin: 1, isExternal: 0 });
    expect(p2[0]).toBeCloseTo(-R, 3);
    expect(p2[1]).toBeCloseTo(0,  3);

    // dim 3 (θ=3π/2): (0, -R)
    const p3 = computeTargetPositions([allOne], dims, { activity: 0, recency: 0, isAdmin: 0, isExternal: 1 });
    expect(p3[0]).toBeCloseTo(0,  3);
    expect(p3[1]).toBeCloseTo(-R, 3);
  });
});

// ---------------------------------------------------------------------------
// Test 5: MATH-01 determinism
// ---------------------------------------------------------------------------

describe("mathLayer — MATH-01 determinism", () => {
  it("identical inputs produce bit-exact identical outputs", () => {
    const n = node({ activity: 0.7, recency: 0.3, isAdmin: 1, isExternal: 0 });
    const sliders = { activity: 0.8, recency: 0.5, isAdmin: 0.2, isExternal: 0 };
    const a = computeTargetPositions([n], dims, sliders);
    const b = computeTargetPositions([n], dims, sliders);
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

// ---------------------------------------------------------------------------
// Test 6: MATH-04 monotonicity property (fast-check)
// ---------------------------------------------------------------------------

describe("mathLayer — MATH-04 monotonicity (fast-check)", () => {
  it("increasing activity slider never decreases distance from pure-recency endpoint", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const [sLo, sHi] = a <= b ? [a, b] : [b, a];
          const n = node({ activity: 1, recency: 1, isAdmin: 0, isExternal: 0 });
          const pLo = computeTargetPositions([n], dims, { activity: sLo, recency: 1, isAdmin: 0, isExternal: 0 });
          const pHi = computeTargetPositions([n], dims, { activity: sHi, recency: 1, isAdmin: 0, isExternal: 0 });
          // Pure-recency endpoint is (0, R): dim 1 at θ=π/2 → (0, 1)
          // As activity slider grows, position moves away from (0, R) toward midpoint (R/2, R/2).
          // Distance from (0, R) must be non-decreasing.
          const dLo = Math.hypot(pLo[0] - 0, pLo[1] - R);
          const dHi = Math.hypot(pHi[0] - 0, pHi[1] - R);
          return dHi + 1e-6 >= dLo; // non-decreasing (with epsilon for float rounding)
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Test 7: Categorical dimension (role kind)
// ---------------------------------------------------------------------------

describe("mathLayer — categorical dimension (role)", () => {
  it("role-kind dim routes through roleWeights and lands on correct axis", () => {
    // Use 1-dim layout so θ_0 = (0/1)*2π = 0 → u=(1,0) → expected position (R, 0)
    const roleDims: DimensionDescriptor[] = [
      { id: "role:admin",  kind: "role", category: "admin" }, // d=0, θ=0 → (1, 0)
    ];
    // Node with full admin role weight
    const n = node({
      activity: 0,
      recency: 0,
      isAdmin: 0,
      isExternal: 0,
      roleWeights: new Map([["admin", 1.0]]),
    });
    const pos = computeTargetPositions(
      [n],
      roleDims,
      { "role:admin": 1 },
    );
    // dim 0 (θ=0): expected (R, 0)
    expect(pos[0]).toBeCloseTo(R, 3);
    expect(pos[1]).toBeCloseTo(0, 3);
    expect(pos[2]).toBe(0);
  });

  it("module-kind dim routes through moduleWeights", () => {
    const modDims: DimensionDescriptor[] = [
      { id: "mod:docs", kind: "module", category: "docs" }, // d=0, θ=0
    ];
    const n = node({
      activity: 0, recency: 0, isAdmin: 0, isExternal: 0,
      moduleWeights: new Map([["docs", 0.75]]),
    });
    const pos = computeTargetPositions([n], modDims, { "mod:docs": 1 });
    // θ=0 → (1, 0); expected x = R*0.75, y ≈ 0
    expect(pos[0]).toBeCloseTo(R * 0.75, 4);
    expect(pos[1]).toBeCloseTo(0, 4);
  });

  it("permTier-kind dim routes through permTierWeights", () => {
    const tierDims: DimensionDescriptor[] = [
      { id: "tier:edit", kind: "permTier", category: "edit" }, // d=0, θ=0
    ];
    const n = node({
      activity: 0, recency: 0, isAdmin: 0, isExternal: 0,
      permTierWeights: new Map([["edit", 1.0]]),
    });
    const pos = computeTargetPositions([n], tierDims, { "tier:edit": 1 });
    expect(pos[0]).toBeCloseTo(R, 4);
    expect(pos[1]).toBeCloseTo(0, 4);
  });
});

// ---------------------------------------------------------------------------
// Test 8: Empty features array
// ---------------------------------------------------------------------------

describe("mathLayer — empty features array", () => {
  it("returns empty Float32Array (length 0) without throwing", () => {
    const pos = computeTargetPositions(
      [],
      dims,
      { activity: 1, recency: 1, isAdmin: 1, isExternal: 1 },
    );
    expect(pos).toBeInstanceOf(Float32Array);
    expect(pos.length).toBe(0);
  });
});
