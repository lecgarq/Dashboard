---
phase: 24-baseline-dimension-id-unification
plan: 02
subsystem: spatial-graph-dimensions
tags: [refactor, dimension-id-space, groupBy, colorMode, dimensionRegistry]

# Dependency graph
requires: ["24-01"]
provides:
  - "dimensionIdSpace.ts — PRESET_DIMENSION_IDS as the single source of record for the Group-by/Color-by option lists, plus the explicit REGISTRY_ID_BY_CATALOG_ID bridge Phase 25 extends"
  - "groupByDimensions.ts and nodeColors.ts both resolve their picker lists from dimensionIdSpace.ts (the two independently-maintained hardcoded 3-string arrays are gone)"
  - "dimensionRegistry.ts's doc comment states real ownership, not the stale 'single source of truth' claim"
affects: ["25-dimension-aperture-group-color-filter"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Catalog ids are the dimension id-space of record; the registry is bridged via an explicit lookup table (REGISTRY_ID_BY_CATALOG_ID) rather than assuming name equality — Phase 25 widens ONE list plus verified bridge entries."

key-files:
  created:
    - app/(dashboard)/users/access-analysis/dimensionIdSpace.ts
    - app/(dashboard)/users/access-analysis/dimensionIdSpace.test.ts
  modified:
    - app/(dashboard)/users/access-analysis/groupByDimensions.ts
    - app/(dashboard)/users/access-analysis/nodeColors.ts
    - app/(dashboard)/users/access-analysis/dimensionRegistry.ts

key-decisions:
  - "Rewrote the DIM-06 doc-fix to paraphrase the old false claim instead of quoting it verbatim, after the first draft's historical quote tripped the plan's own automated verify grep (which checks the exact string is now absent) — same intent (explain what changed and why), zero drift from the plan's required content."

patterns-established: []

requirements-completed: [DIM-03, DIM-06]

# Metrics
duration: ~15min
completed: 2026-07-14
status: complete
---

# Phase 24 Plan 02: Dimension ID Unification Summary

**Unified the two independently-maintained 3-string dimension option lists (`groupByDimensions.ts` catalog ids, `nodeColors.ts` registry ids) into one shared `dimensionIdSpace.ts` module, and corrected `dimensionRegistry.ts`'s stale "single source of truth" doc claim — with both existing invariance tests passing byte-unmodified.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-14T22:22:00Z (approx, context load)
- **Completed:** 2026-07-14T22:27:17Z
- **Tasks:** 3/3 completed
- **Files modified:** 2 created, 3 modified

## Accomplishments
- Created `dimensionIdSpace.ts`: `PRESET_DIMENSION_IDS = ["role", "project", "user"]` (catalog id-space of record) + `REGISTRY_ID_BY_CATALOG_ID` explicit bridge (currently empty — no verified renames yet) + `colorModeIdForCatalogId` resolver.
- Deleted `groupByDimensions.ts`'s local `PRESETS` array; it now imports `PRESET_DIMENSION_IDS` and ranks/filters against it — `isGroupable`, sort, and `defaultGroupBy` logic byte-identical.
- Deleted `nodeColors.ts`'s hardcoded `COLOR_MODES` array; it's now derived via `PRESET_DIMENSION_IDS.map(colorModeIdForCatalogId)`. Also fixed the stale "additive and intentionally UNWIRED" header note (Toolbar.tsx has wired it since).
- Rewrote `dimensionRegistry.ts`'s doc comment above `RUNTIME_DIMENSION_IDS` to state real ownership: catalog = id-space of record + sliders/grouping/clustering; registry = color + filter-chip metadata + legacy 6-slider target list. Registry retained (full collapse deferred, owner decision).
- Both invariance-gate tests (`groupByDimensions.test.ts:24`, `nodeColors.test.ts:100`) pass with **zero test-file diff** — proving pixel-identical/byte-identical behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the unified id-space module + test** - `e499bc39` (feat)
2. **Task 2: Rewire Group-by and Color-by to resolve from the unified id-space** - `6665b28e` (refactor)
3. **Task 3: Fix the stale dimensionRegistry doc claim (DIM-06) + run full gates** - `ce8b34f6` (docs)

**Plan metadata:** (this SUMMARY + STATE/ROADMAP update, committed separately per workflow)

## Files Created/Modified
- `app/(dashboard)/users/access-analysis/dimensionIdSpace.ts` - NEW. `PRESET_DIMENSION_IDS`, `REGISTRY_ID_BY_CATALOG_ID`, `colorModeIdForCatalogId`. Pure, no React/DOM/I/O, `import type` only from `dimensionRegistry` (no runtime cycle).
- `app/(dashboard)/users/access-analysis/dimensionIdSpace.test.ts` - NEW. Locks preset order, identity-bridge for the three current presets, and guards future bridge entries against real registry ids.
- `app/(dashboard)/users/access-analysis/groupByDimensions.ts` - local `PRESETS` array deleted; imports `PRESET_DIMENSION_IDS`.
- `app/(dashboard)/users/access-analysis/nodeColors.ts` - hardcoded `COLOR_MODES` array deleted; derived from `PRESET_DIMENSION_IDS` via `colorModeIdForCatalogId`; header comment corrected.
- `app/(dashboard)/users/access-analysis/dimensionRegistry.ts` - doc comment above `RUNTIME_DIMENSION_IDS` corrected (comment-only change).

## Verification Evidence
- **Commands run:**
  - `npx vitest run "app/(dashboard)/users/access-analysis/dimensionIdSpace.test.ts"` → 3/3 passed (Task 1)
  - `npx vitest run "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts" "app/(dashboard)/users/access-analysis/nodeColors.test.ts"` → 39/39 passed, both files byte-unmodified (Task 2)
  - `npx tsc --noEmit` → 0 errors (run after Task 2 and again after Task 3)
  - `npm test` → 2538 passed, 1 skipped (2535 baseline + 3 new `dimensionIdSpace.test.ts` tests — exact match)
  - `grep -c "single source of truth for what the runtime uses"` and the quoted-string variant on `dimensionRegistry.ts` → both 0 (after paraphrasing the historical-quote deviation, see below)
- **Diff-scope check:** `git diff --stat` across all three commits confined to exactly the plan's 5 `files_modified` — no other file touched.
- **Test-file invariance:** `git diff --stat` on `groupByDimensions.test.ts` and `nodeColors.test.ts` → empty (zero diff), confirming the automated invariance gate held.
- **Repo-map check:** not run — no import graph, boundary, or data-flow change beyond the one new internal module (`dimensionIdSpace.ts`) consumed only by files already in this plan's scope.

## Dashboard Evidence
- **Workshop surface:** `/users/spatial-graph` and its alias `/users/access-analysis` (spatial-graph shell, NOT the 23-panel `/access-analysis` charts page — verified every edited file's path contains `users/`).
- **Workshop impact:** Intentionally invisible in the demo — Group-by and Color-by pickers still show exactly Role (default), Project, User name, same order, same output. This plan is pure plumbing so Phase 25 widens one list instead of two diverging ones.
- **UI guardrails:** Zinc theme, motion, and all consumer components (`Toolbar.tsx`, `GroupByControls.tsx`, `AccessAnalysisShell.tsx`) untouched per plan instruction — invariance proven by leaving them and their tests alone.
- **Scope guardrails:** All 5 files live under `app/(dashboard)/users/access-analysis/`, confirmed distinct from `app/(dashboard)/access-analysis/` (the charts page). No new WebGL, no new deps, no Prisma/loader changes.

## Data Truthfulness
- No data changes. Same Prisma sources as before (`accDcGraph.bulkUsers`, `AccInstanceEmbedding`) — this plan touches only the id-space/plumbing layer, not any query or loader.
- `REGISTRY_ID_BY_CATALOG_ID` is intentionally empty of renames (no unverified catalog→registry mapping was invented) — role/project/company already share names across both spaces, and "user" has no registry dim (nodeColors EXTRA mode). Phase 25 adds entries only after verifying semantic equivalence.

## Decisions Made
- Rewrote the DIM-06 fix mid-task after discovering my first draft's explanatory comment quoted the old false claim verbatim ("...previously claimed RUNTIME_DIMENSION_IDS was 'the single source of truth for what the runtime uses'..."), which caused the plan's own automated verify grep (checking that exact string is now absent) to still match. Paraphrased to explain the same fix without quoting the literal string — same intent, satisfies the plan's literal verification command.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doc-fix draft tripped its own verify grep by quoting the stale claim**
- **Found during:** Task 3, immediately after first edit, before commit
- **Issue:** The plan's `<verify>` step runs `grep -c "single source of truth for ..."` on `dimensionRegistry.ts` expecting 0. My first draft of the corrected comment explained the fix by quoting the old false claim in scare-quotes, which is a literal substring match and would have failed the plan's own gate.
- **Fix:** Reworded the explanatory sentence to paraphrase ("this comment previously overstated RUNTIME_DIMENSION_IDS' scope") instead of quoting the old text verbatim. Re-verified with the exact grep command from the plan — both variants return 0.
- **Files modified:** `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`
- **Verification:** Re-ran `grep -c` for both string variants (plain and quoted) → 0/0. Re-ran `npx tsc --noEmit` and the dimension test suites → all still green.
- **Committed in:** `ce8b34f6` (single commit — caught before the first commit attempt, no extra commit needed)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug fix, caught pre-commit)
**Impact on plan:** None on scope or behavior — comment-only wording fix to satisfy the plan's own literal verification command; no code or test changed.

## Issues Encountered
None beyond the deviation above. Pre-existing unrelated working-tree WIP under `app/(dashboard)/users/access-analysis/` (documented in 24-01-SUMMARY) was confirmed still present and untouched by this plan's commits (`git status --short` before/after each commit showed only this plan's files staged/committed).

## User Setup Required
None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed (zinc theme untouched, no new WebGL, `/access-analysis` charts page untouched, `/users/spatial-graph` scope respected)
- [x] Data coverage is truthful and labeled (no data/loader changes made or claimed)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked (no UI edited at all — pure id-space plumbing)
- [x] Claims backed by command output: `npx tsc --noEmit` (0 errors), `npm test` (2538/2539), targeted vitest runs, `grep -c`, `git diff --stat` (all reproduced above). No `VERIFY:` items outstanding.

## Next Phase Readiness
- `dimensionIdSpace.ts` is ready for Phase 25 (Dimension Aperture — Group, Color & Filter) to widen `PRESET_DIMENSION_IDS` and extend `REGISTRY_ID_BY_CATALOG_ID` as it verifies each new dim's semantic equivalence.
- `dimensionRegistry.ts`'s doc comment now correctly scopes `RUNTIME_DIMENSION_IDS` as the legacy 6-slider subset, not a claim Phase 25/26 work needs to unwind.
- No blockers. Phase 24 is now fully complete (Plan 01 baseline + Plan 02 unification).

---
*Phase: 24-baseline-dimension-id-unification*
*Completed: 2026-07-14*

## Self-Check: PASSED

All 2 created files found on disk (`dimensionIdSpace.ts`, `dimensionIdSpace.test.ts`). All 3 task commit hashes (`e499bc39`, `6665b28e`, `ce8b34f6`) found in `git log --oneline --all`.
