---
phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges
plan: 03
subsystem: graph-topology
tags: [similarity, edges, pure-module, tdd, user-only-view]
requirements: [GRAPH7-04, GRAPH7-05]
dependency-graph:
  requires: []
  provides:
    - computeSimilarityEdges
    - SimilarityDim
    - SimilarityEdge
    - SimilarityInput
    - SIMILARITY_DIMS
  affects:
    - "Plan 07-05 (2D wiring) — consumes computeSimilarityEdges via memoized adapter"
    - "Plan 07-07 (3D wiring) — consumes computeSimilarityEdges via memoized adapter"
tech-stack:
  added: []
  patterns:
    - "Bucketed indexing — Map<attrValue, userIds[]> per dimension, then pair-count within shared buckets only"
    - "Canonical pair keys (userA < userB lexicographic) — natural dedupe across (a,b) ≡ (b,a)"
    - "Singleton-bucket pruning before pair enumeration — skips O(1)-impossible work"
    - "Pure module discipline — zero Prisma/React/server imports keeps caller-side memoization tractable"
key-files:
  created:
    - lib/acc/userSimilarity.ts
    - lib/acc/userSimilarity.test.ts
  modified: []
decisions:
  - "Bucketed indexing instead of O(n²) outer-loop scan — RESEARCH §Code Examples #2"
  - "Caller supplies pre-resolved folderIds[] per user (user → role → folder transitive resolution lives elsewhere) — folder-access dim is just another attribute bucket here"
  - "Null company / null adminTier excluded from buckets (no 'sharing null' edges)"
  - "Default minShared = 2 — single-incident overlaps are rarely meaningful signal"
metrics:
  duration: "~3 min"
  tasks: 2
  files: 2
  completed: "2026-05-12"
---

# Phase 07 Plan 03: Pure Similarity-Edge Module Summary

Pure `computeSimilarityEdges` module emitting up to 5 parallel user↔user edges per pair (folder-access, roles, projects, company, admin-tier) via bucketed indexing — TDD-driven, zero non-pure deps.

## What Shipped

- `lib/acc/userSimilarity.ts` — 164-line pure module exporting `computeSimilarityEdges`, `SimilarityDim`, `SimilarityEdge`, `SimilarityInput`, `SIMILARITY_DIMS`.
- `lib/acc/userSimilarity.test.ts` — 179-line Vitest spec, 9 cases covering empty/single/threshold/5-dim parallel emit/disabled-dim/canonical-dedupe/null filters/perf smoke.

## Tasks

| Task | Description                                                | Commit    | Phase |
| ---- | ---------------------------------------------------------- | --------- | ----- |
| 1    | RED — Vitest spec for computeSimilarityEdges (9 cases)     | `0be92ab` | RED   |
| 2    | GREEN — Implement bucketed-indexing similarity module       | `1c4317c` | GREEN |

REFACTOR phase skipped — initial implementation already factored into helpers (`buildBuckets`, `countPairs`, `emitEdges`) and all tests passed without cleanup.

## Verification

- `npx vitest run lib/acc/userSimilarity.test.ts` → 9/9 pass, ~94ms tests.
- Purity check: `grep -E "from .(prisma|react|@/server)" lib/acc/userSimilarity.ts` → no matches.
- Performance smoke: 500 users × 10 roles each, all 5 dims enabled, minShared=2 → well under 500ms budget.

## Decisions Made

- **07-03:** Bucketed indexing per RESEARCH §Code Examples #2 — `Map<attrValue, userIds[]>` per dimension, pair-count within shared buckets only. Avoids O(n²) outer scan on 500+ user inputs.
- **07-03:** Canonical pair key `${userA} ${userB}` (lexicographic, single-space separator) — natural dedupe; emission re-canonicalizes via `canonicalPair` for type safety.
- **07-03:** Caller owns user → role → folder transitive resolution; this module accepts pre-resolved `folderIds: string[]` per user. `AccFolderPermission` carries only role permissions (RESEARCH Pitfall 2 / Open Question 1), so the resolution cannot live in a pure attribute-bucket module.
- **07-03:** Null `company` / `adminTier` excluded from buckets (returns empty iterable for those users) — no "sharing null" edges.
- **07-03:** Default `minShared = 2`. Single-incident overlaps are noise; callers can override (e.g. tests use `minShared=1` for deterministic 2-user cases).
- **07-03:** Singleton-bucket pruning runs *before* pair enumeration — keeps inner loop tight for the perf-smoke 500×50-pool scenario.
- **07-03:** Within-bucket dedupe (`new Set(bucket)`) defends against a caller passing duplicate values inside `roleIds` for a single user. No-op on already-unique input.

## Deviations from Plan

None — plan executed exactly as written. Both task commits use the exact messages specified in the plan.

## Self-Check: PASSED

Files verified on disk:
- FOUND: `lib/acc/userSimilarity.ts` (164 lines, >= 60 min)
- FOUND: `lib/acc/userSimilarity.test.ts` (179 lines)

Commits verified in git log:
- FOUND: `0be92ab` test(07-03): add failing tests for computeSimilarityEdges
- FOUND: `1c4317c` feat(07-03): implement computeSimilarityEdges (GRAPH7-04, GRAPH7-05)

must_haves truths verified:
- Pure function emits up to 5 parallel edges per pair, one per enabled dim — case 5 asserts.
- Edge endpoints canonicalized (userA < userB) — cases 3, 5, 7 assert.
- minShared cap suppresses ties below threshold — case 4 asserts (minShared=2 default).
- Disabled dimensions emit zero edges in that dim — case 6 asserts.
- Indexed bucketing — `buildBuckets` + `countPairs` helpers, no nested user-pair outer loop.
- All Vitest tests pass; zero non-pure imports — grep verified empty.
