---
phase: 01-data-math-foundation
plan: 01
subsystem: database
tags: [apache-arrow, duckdb-wasm, typescript, vitest, fnv1a, normalization]

requires: []
provides:
  - "normalize(BulkAccUser[]) → NormalizedNodeRow[] with log1p+min-max activity, recency clip, isExternal, roleIds, moduleWeights"
  - "materializeNodes(rows) → DuckDB nodes Arrow table (idempotent via DROP+INSERT)"
  - "hashNodeSetAndSliders(ids, sliders) → FNV-1a cache key with 2dp slider quantization"
  - "positions table z REAL column for 3D physics"
affects:
  - "02-math-layer (reads pre-normalized activityNorm/recencyNorm from NormalizedNodeRow)"
  - "phase-2-physics (consumes positions z column; cache key includes slider state)"
  - "positionsCache consumers (packPositions/unpackPositions now xyz triples not xy pairs)"

tech-stack:
  added: []
  patterns:
    - "Arrow typed arrays: Int32Array/Float32Array/Uint8Array for column inference (Pitfall 1)"
    - "Idempotent DuckDB materialization: DROP TABLE IF EXISTS before insertArrowTable (Pitfall 5)"
    - "Mock DuckDB in tests: vi.mock duckdbClient instead of real WASM (Pitfall 3)"
    - "FNV-1a hash with slider quantization: Math.round(s*100)/100 before mixing (Pitfall 4)"
    - "REAL not DOUBLE for positions z: Float32 round-trip is bit-exact (Pitfall 6)"

key-files:
  created:
    - "app/(dashboard)/users/access-analysis/dataLayer.ts"
    - "app/(dashboard)/users/access-analysis/dataLayer.test.ts"
  modified:
    - "app/(dashboard)/users/access-analysis/positionsCache.ts"
    - "app/(dashboard)/users/access-analysis/positionsCache.test.ts"

key-decisions:
  - "DuckDB roundtrip tests use vi.mock(duckdbClient) — real WASM Worker not available in Vitest jsdom/node; mock captures Arrow table rows and simulates COUNT(*)"
  - "positionsCache xyz triples: Float32Array stride changed from 2 to 3; packPositions/unpackPositions API breaking change — callers must update"
  - "INTERNAL_DOMAINS defaults to lecg.com only (TODO: confirm subdomains with Luis)"
  - "moduleWeights are uniform (1/N) in Phase 1; per-module activity weights deferred to DC CSV join"

patterns-established:
  - "Pattern: normalize() is pure sync; materializeNodes() is async and owns the DuckDB side effect"
  - "Pattern: positionsCache tests use in-memory SQL mock to avoid WASM Worker dependency"
  - "Pattern: dataLayer.test.ts mocks duckdbClient at module level with vi.mock for DuckDB-free unit testing"

requirements-completed:
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04

duration: 7min
completed: 2026-05-19
---

# Phase 01 Plan 01: Data Layer Summary

**Apache Arrow + DuckDB-WASM data layer normalizing BulkAccUser[] into one (email, projectId) row with log1p activity, recency clip, isExternal, deduped roleIds, and uniform moduleWeights; positions cache extended with z REAL column and slider-aware FNV-1a hash key**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-19T18:31:24Z
- **Completed:** 2026-05-19T18:37:56Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Built `normalize()` producing exactly one `NormalizedNodeRow` per (email, projectId) with all six feature families pre-computed (activityNorm via log1p+min-max, recencyNorm via 90-day clip, isAdmin/isExternal 0/1, deduped roleIds, uniform moduleWeights)
- Built `materializeNodes()` that registers an Apache Arrow `nodes` table in DuckDB-WASM idempotently using typed columnar arrays and DROP-before-INSERT pattern
- Extended `positionsCache.ts` with `z REAL` column (not DOUBLE) and `hashNodeSetAndSliders()` using quantized FNV-1a hashing to prevent float-drift cache poisoning

## Task Commits

1. **Task 1: Extend positionsCache.ts with z column + slider-aware hash** - `c99cfbd` (feat)
2. **Task 2: Create dataLayer.ts with normalize() + materializeNodes()** - `0b27f19` (feat)
3. **Task 3: Create dataLayer.test.ts (jsdom env) covering DATA-01..04** - `8b849f8` (test)

## Files Created/Modified

- `app/(dashboard)/users/access-analysis/dataLayer.ts` - normalize() + materializeNodes() + INTERNAL_DOMAINS + NormalizedNodeRow
- `app/(dashboard)/users/access-analysis/dataLayer.test.ts` - 18 tests covering DATA-01 through DATA-04 with mocked DuckDB
- `app/(dashboard)/users/access-analysis/positionsCache.ts` - z REAL column, xyz triple pack/unpack, hashNodeSetAndSliders()
- `app/(dashboard)/users/access-analysis/positionsCache.test.ts` - 13 tests including z roundtrip via in-memory mock and hashNodeSetAndSliders invariants

## Decisions Made

- **DuckDB tests use vi.mock instead of real WASM**: jsdom does not provide a real `Worker` implementation, so DuckDB-WASM cannot actually initialize in Vitest. The plan specified jsdom env + real DuckDB, but all existing DuckDB tests in the repo also use mocks. The mock captures the Arrow table rows from `insertArrowTable` and simulates COUNT(*)/DROP/INSERT in memory.
- **positionsCache xyz triple is a breaking change**: `packPositions(ids, Float32Array)` now expects `ids.length * 3` elements (xyz) instead of `ids.length * 2` (xy). Existing callers of `savePositions`/`loadCachedPositions` must update their Float32Array allocation from `2*n` to `3*n`. This affects Phase 2 physics integration.
- **INTERNAL_DOMAINS = `new Set(["lecg.com"])`**: Exact domain match. Subdomains (e.g. `sub.lecg.com`) are classified as external. Confirmed default; Luis should review during Phase 2.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced DuckDB real WASM tests with mock-based tests**
- **Found during:** Task 1 (positionsCache z roundtrip) and Task 3 (dataLayer DuckDB roundtrip)
- **Issue:** Plan specified `// @vitest-environment jsdom` + real `getDuckDbClient()` for DuckDB roundtrip tests. jsdom does not provide a real `Worker` global, so `getDuckDbClient()` throws "DuckDB-Wasm analytics can only initialize in a browser runtime" in all Vitest environments.
- **Fix:** Task 1: Created in-memory SQL mock implementing CREATE/INSERT/DELETE/SELECT for `positionsCache.test.ts`. Task 3: Used `vi.mock("./duckdbClient")` with a mock connection that intercepts `insertArrowTable` and stores rows for COUNT(*) assertions.
- **Files modified:** positionsCache.test.ts, dataLayer.test.ts
- **Verification:** 31 tests pass; idempotency, z roundtrip, and column correctness all verified via mock
- **Committed in:** c99cfbd, 8b849f8

**2. [Rule 1 - Bug] Fixed regex `s` flag TypeScript target error in positionsCache.test.ts**
- **Found during:** Task 3 verification (tsc --noEmit)
- **Issue:** `positionsCache.test.ts` used `/regex/si` (dotAll + case-insensitive) which requires ES2018 target; project tsconfig targets earlier ES version
- **Fix:** Replaced regex-based SQL parsing with string slice operations (`sql.slice(sql.indexOf("VALUES") + 6)` and `s.slice(s.indexOf("(") + 1, s.lastIndexOf(")"))`
- **Files modified:** positionsCache.test.ts
- **Verification:** tsc --noEmit reports zero errors
- **Committed in:** 8b849f8

---

**Total deviations:** 2 auto-fixed (1 test environment bug, 1 TypeScript regex target bug)
**Impact on plan:** Both fixes necessary for tests to pass under the actual project configuration. No scope creep. The mock-based DuckDB testing follows the established pattern in `MosaicCoordinatorContext.test.tsx`.

## Issues Encountered

- DuckDB-WASM cannot run in Vitest (any environment) because jsdom does not implement `Worker`. This is a known project constraint. All DuckDB-touching tests in the existing tree use mocks.

## User Setup Required

None - no external service configuration required. Pure TypeScript data layer with no new runtime dependencies.

## Next Phase Readiness

- `normalize()` is ready for Plan 02 (mathLayer.ts) — `NormalizedNodeRow` provides all six feature families
- `materializeNodes()` is ready for Phase 2 physics integration
- `hashNodeSetAndSliders()` is ready as the cache key for position cache lookups
- **Breaking change for Phase 2**: callers of `savePositions`/`loadCachedPositions` must use `Float32Array(n*3)` for xyz triples instead of `Float32Array(n*2)`

---
*Phase: 01-data-math-foundation*
*Completed: 2026-05-19*
