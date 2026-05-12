---
phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges
plan: 04
subsystem: AccUsersGraph filter layer
tags: [filters, graph, types, tdd, phase7]
requires: []
provides:
  - "Extended GraphFilters interface with 5 Phase 7 dimensions"
  - "PermTierKey / SimilarityDimKey / ViewMode / GraphNodeKind type aliases"
  - "FilterableNode.kind optional discriminator (backward compatible)"
  - "nodeMatchesFilters viewMode + showFolders gates"
affects:
  - "app/(dashboard)/users/AccUsersGraph.tsx (URL filter restore now spreads DEFAULT_FILTERS)"
tech-stack:
  added: []
  patterns:
    - "Spread-DEFAULT_FILTERS at filter-construction sites so new fields auto-pick-up defaults"
    - "Optional discriminator field (kind?) with `?? 'user'` fallback for legacy nodes"
key-files:
  created:
    - ".planning/phases/07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges/07-04-SUMMARY.md"
  modified:
    - "app/(dashboard)/users/accGraphFilters.ts"
    - "app/(dashboard)/users/accGraphFilters.test.ts"
    - "app/(dashboard)/users/AccUsersGraph.tsx"
decisions:
  - "07-04: SimilarityDimKey kept local to accGraphFilters.ts (not re-exported from lib/acc/userSimilarity.SimilarityDim) to avoid a client-import → server-module type-only cycle. TODO comment flags drift risk."
  - "07-04: permTiers / simDims / simMin documented as EDGE-level filters — applied in graph adapter (Plan 07-05), NOT in nodeMatchesFilters. Keeps node-level predicate cheap and orthogonal."
  - "07-04: kind field made OPTIONAL on FilterableNode with `?? 'user'` fallback so the ~thousands of existing user-only call sites (SimNode/UserNode) continue typechecking without literal-narrowing changes."
  - "07-04: Phase 7 kind gates placed FIRST in nodeMatchesFilters — cheapest short-circuit, avoids running 7 downstream string-array comparisons for a non-user node in user-only view."
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_changed: 3
  completed_date: 2026-05-12
commits:
  - "0f5eeef: test(07-04): add failing tests for Phase 7 filter dimensions"
  - "5e046c7: feat(07-04): extend GraphFilters with Phase 7 dimensions (GRAPH7-06, GRAPH7-09)"
---

# Phase 7 Plan 04: Filter Type Extension Summary

Pure TDD extension of `GraphFilters` + `nodeMatchesFilters` + `FilterableNode` to carry the 5 Phase 7 filter dimensions (showFolders, permTiers, simDims, simMin, viewMode), unblocking Plans 07-05 (2D adapter wiring) and 07-06 (2D filter panel UI) by isolating type churn.

## What Shipped

- `GraphFilters` gains: `showFolders: boolean`, `permTiers: PermTierKey[]`, `simDims: SimilarityDimKey[]`, `simMin: number`, `viewMode: ViewMode`.
- `DEFAULT_FILTERS` extended with the canonical defaults: folders ON, all four tiers, all five sim dims, `simMin: 2`, `viewMode: "multi"`.
- New exported type aliases: `PermTierKey`, `SimilarityDimKey`, `ViewMode`, `GraphNodeKind`.
- `FilterableNode.kind?: GraphNodeKind` — optional discriminator; legacy nodes default to `"user"`.
- `nodeMatchesFilters` gains two cheap, short-circuited Phase 7 gates BEFORE the existing role/admin/etc checks:
  - `viewMode === "user-only"` → returns `false` for any node whose `kind !== "user"`.
  - `kind === "folder" && !showFolders` → returns `false`.
- Documented (in code) that `permTiers` / `simDims` / `simMin` are EDGE-level filters and live in the graph adapter (Plan 07-05), NOT in this node-level predicate.

## Test Coverage

- 9 new test cases under `describe("Phase 7 filter dimensions", ...)`:
  - 5 DEFAULT_FILTERS shape assertions.
  - folder kind hidden when `showFolders: false`.
  - `viewMode: "user-only"` hides project kind, keeps user kind.
  - Legacy nodes without `kind` treated as user (backward compat).
- All 50 tests pass (41 existing + 9 new). RED→GREEN cleanly demonstrated by the intermediate commit 0f5eeef showing 7 failures (2 of the 9 new tests pass trivially when the field is undefined, hence 7 explicit fails on the deltas).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] AccUsersGraph.readFiltersFromUrl typecheck broke after GraphFilters widened**
- **Found during:** Task 2 (post-GREEN typecheck)
- **Issue:** `readFiltersFromUrl` constructed a `GraphFilters` object literal without the 5 new keys → `TS2739: missing properties showFolders, permTiers, simDims, simMin, viewMode`. The plan explicitly anticipated this: "existing callers...should still typecheck because new fields have defaults via DEFAULT_FILTERS spread" — but the caller wasn't spreading DEFAULT_FILTERS.
- **Fix:** Added `...DEFAULT_FILTERS` at the top of the returned literal in `readFiltersFromUrl`. URL-only params still override; new fields pick up canonical defaults.
- **Files modified:** `app/(dashboard)/users/AccUsersGraph.tsx`
- **Commit:** 5e046c7 (folded into the Task 2 GREEN commit since it was a one-line typecheck fix necessary to complete the task)

No other deviations. No authentication gates encountered. No architectural decisions (Rule 4) triggered.

## Requirements Closed

- `GRAPH7-06`: showFolders filter dimension shipped in shape + predicate.
- `GRAPH7-09`: viewMode filter dimension shipped in shape + predicate.
- `FILT-EXT`: permTiers / simDims / simMin filter shape in place (predicate hook deferred to adapter per design — documented as not-a-bug).

## Downstream Unblocked

- Plan 07-05 (2D adapter wiring): can now import `PermTierKey`, `SimilarityDimKey`, `simMin`, `simDims`, `permTiers` for edge-filtering logic.
- Plan 07-06 (2D filter panel UI): can now bind UI controls directly to the new fields in `GraphFilters`.

## Self-Check: PASSED

Verified:
- `app/(dashboard)/users/accGraphFilters.ts` — FOUND (modified, 5 new type exports + 5 new GraphFilters keys + 2 new predicate gates)
- `app/(dashboard)/users/accGraphFilters.test.ts` — FOUND (modified, 9 new test cases)
- `app/(dashboard)/users/AccUsersGraph.tsx` — FOUND (modified, ...DEFAULT_FILTERS spread)
- Commit 0f5eeef — FOUND in `git log`
- Commit 5e046c7 — FOUND in `git log`
- `npx vitest run` — 50/50 pass
- `npx tsc --noEmit -p .` — clean
