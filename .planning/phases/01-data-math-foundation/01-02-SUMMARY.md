---
phase: 01-data-math-foundation
plan: 02
subsystem: math-layer
tags: [math, pure-function, vitest, fast-check, typescript, MATH-01, MATH-02, MATH-03, MATH-04, MATH-05]
dependency_graph:
  requires: []
  provides: [computeTargetPositions, NodeFeatureVector, DimensionDescriptor]
  affects: [phase-02-physics-layer, phase-03-rendering]
tech_stack:
  added: [fast-check@^3.23.2]
  patterns: [pure-function, property-based-testing, static-purity-assertion]
key_files:
  created:
    - app/(dashboard)/users/access-analysis/mathLayer.ts
    - app/(dashboard)/users/access-analysis/mathLayer.test.ts
    - app/(dashboard)/users/access-analysis/mathLayer.purity.test.ts
  modified:
    - package.json
    - package-lock.json
decisions:
  - "R=300 world units (matches force-graph engine defaults; revisit if dataset grows beyond 6000 nodes)"
  - "z=0 at seed time; physics layer handles z in 3D mode (camera change, not math change)"
  - "Monotonicity observable axis: sweep activity slider 0→1 with recency fixed at 1; distance from pure-recency endpoint (0, R) must be non-decreasing"
  - "Forbidden-term JSDoc check catches 'react' in comment text — solution: remove forbidden terms from mathLayer.ts comments entirely"
metrics:
  duration: ~12 minutes
  completed: 2026-05-19
  tasks_completed: 3
  files_created: 3
  files_modified: 2
---

# Phase 1 Plan 02: Math Layer Summary

**One-liner:** Pure-function `computeTargetPositions` implementing `Σ(u_d × f_d × s_d) / Σ(s_d)` with fast-check property tests and a static purity assertion that fails CI if any import sneaks into mathLayer.ts.

## What Was Built

### mathLayer.ts (NEW, zero imports)

Exports three symbols:
- `NodeFeatureVector` — typed feature struct (activity, recency, isAdmin, isExternal, roleWeights, moduleWeights, permTierWeights)
- `DimensionDescriptor` — dimension id + kind + optional category
- `computeTargetPositions(features, dims, sliders, options?)` — deterministic Float32Array seed positions

Key implementation details:
- Formula: `Σ_d (u_d × f_d(node) × s_d) / Σ_d (s_d)` per MATH-03
- Axis angles: `θ_d = (d / D) × 2π` per MATH-02, precomputed into `ux[]` / `uy[]` Float64Arrays
- Zero-state guard: `sSum === 0` short-circuits before division (Pitfall 8, MATH-04)
- z coordinate seeded at 0; physics nudges z in 3D mode (CONTEXT decision)
- `featureValueFor(node, dim)` dispatches on `dim.kind` to scalar / boolean / role / module / permTier paths
- ZERO import lines (MATH-05 purity contract)

### mathLayer.test.ts (NEW, node env, 10 tests)

| # | Test | Requirement |
|---|------|-------------|
| 1 | Zero state: all sliders=0 → exact (0,0,0) | MATH-04 |
| 2 | Single slider (activity): position at (R, 0) | MATH-03 |
| 3 | Two-slider blend: additive formula verified | MATH-03 |
| 4 | Axis distribution: 4 dims at cardinal points | MATH-02 |
| 5 | Determinism: bit-exact output for identical inputs | MATH-01 |
| 6 | Monotonicity (fast-check, 100 runs): distance from pure-recency endpoint non-decreasing as activity slider grows | MATH-04 |
| 7a | Role-kind categorical routing via roleWeights | MATH-03 |
| 7b | Module-kind categorical routing via moduleWeights | MATH-03 |
| 7c | PermTier-kind categorical routing via permTierWeights | MATH-03 |
| 8 | Empty features array: returns Float32Array(0) without throw | MATH-01 |

### mathLayer.purity.test.ts (NEW, node env, 3 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | `specifiers.toEqual([])` — captures all import/import() | MATH-05 — zero imports enforced statically |
| 2 | Forbidden module names absent from source text | Prevents accidental jsdoc @import or comment references |
| 3 | No `Math.random`, `Date.now`, `new Date` in source | MATH-01 determinism static check |

## Decisions Made

1. **R = 300 world units.** Matches force-graph engine defaults for a ~500–6000 node layout. Revisit if node count grows significantly. Parameterized via `options.radius` if callers need to override.

2. **z = 0 at seed time.** The seed formula is 2D (x, y). The z coordinate is initialized to 0 and left for the physics layer to populate in 3D mode. This is a camera change, not a math change.

3. **Monotonicity observable axis** (RESEARCH Open Question #2 resolution): Hold `recency=1` fixed, sweep `activity` from `sLo` to `sHi`. Node has `activity=1, recency=1`. As activity slider grows, position moves from pure-recency endpoint `(0, R)` toward midpoint `(R/2, R/2)`. Distance from `(0, R)` is monotonically non-decreasing. This is the correct multi-slider formulation where monotonicity is observable.

4. **Forbidden-term JSDoc check.** The purity test checks `src.toLowerCase().not.toContain(term)` — this catches any mention of forbidden terms even in comments. mathLayer.ts comments were updated to avoid the words "react" and "d3-force" (replaced with "UI framework" and "force-graph engine").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Role-kind test had incorrect expected axis angle**
- **Found during:** Task 2 execution
- **Issue:** Test used 2-dim fixture and expected `role:admin` (d=1) to be at `θ=π/2`, but with 2 dims `θ_1 = (1/2)×2π = π`, not `π/2`
- **Fix:** Restructured categorical test to use a single-dim fixture so `d=0` gives `θ=0` → expected position `(R, 0)` — geometrically unambiguous
- **Files modified:** `mathLayer.test.ts`
- **Commit:** 2135ccd

**2. [Rule 1 - Bug] Purity test flagged "react" and "d3-force" in mathLayer.ts JSDoc**
- **Found during:** Task 3 verification
- **Issue:** The forbidden-term purity test uses `src.toLowerCase().not.toContain(term)` — this caught "no React, no DOM" and "d3-force-3d defaults" in comments
- **Fix:** Updated mathLayer.ts JSDoc to replace forbidden terms with neutral equivalents ("UI framework", "force-graph engine")
- **Files modified:** `mathLayer.ts`
- **Commit:** 300ced8

## Verification

All success criteria confirmed:

1. `mathLayer.ts` exports `computeTargetPositions`, `NodeFeatureVector`, `DimensionDescriptor` — zero import lines (MATH-05)
2. Formula `Σ(u_d × f_d × s_d) / Σ(s_d)` implemented exactly; `sSum === 0` guard prevents NaN (MATH-03, MATH-04)
3. Dimension axes follow `θ_d = (d/D) × 2π` — confirmed by 4-dim axis distribution test (MATH-02)
4. Determinism verified at runtime (test 5) and statically (purity test 3) (MATH-01)
5. Monotonicity asserted via fast-check property test with 100 runs (MATH-04)
6. `fast-check@^3.23.2` in devDependencies; no production import of fast-check

Full suite: 13/13 tests pass (`mathLayer.test.ts` + `mathLayer.purity.test.ts`).

## Commits

| Hash | Message |
|------|---------|
| 219145e | feat(01-02): add fast-check devDep + create pure mathLayer.ts |
| 2135ccd | test(01-02): create mathLayer.test.ts with invariant + fast-check property tests |
| 300ced8 | test(01-02): create mathLayer.purity.test.ts + fix forbidden terms in JSDoc |

## Self-Check: PASSED

- `app/(dashboard)/users/access-analysis/mathLayer.ts` — EXISTS
- `app/(dashboard)/users/access-analysis/mathLayer.test.ts` — EXISTS
- `app/(dashboard)/users/access-analysis/mathLayer.purity.test.ts` — EXISTS
- `fast-check` in `package.json` devDependencies — CONFIRMED (^3.23.2)
- Commits 219145e, 2135ccd, 300ced8 — CONFIRMED in git log
