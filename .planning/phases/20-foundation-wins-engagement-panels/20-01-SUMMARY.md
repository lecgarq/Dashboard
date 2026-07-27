---
phase: 20-foundation-wins-engagement-panels
plan: 01
subsystem: ui
tags: [echarts, prisma, access-analysis, permissions, bigint]

# Dependency graph
requires: []
provides:
  - "lib/server/permissionFootprintView.ts: loadPermissionFootprint loader + pure assemblePermissionFootprint (BigInt->Number conversion)"
  - "app/(dashboard)/access-analysis/permissionFootprintCounts.ts: formatBytes + summarizePermissionFootprint pure transforms"
  - "app/(dashboard)/access-analysis/components/PermissionFootprintChart.tsx: client horizontal-bar chart with per-role drill"
affects: [20-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "formatBytes() B/KB/MB/GB/TB helper, the milestone's first genuinely new formatting helper"
    - "Server-side BigInt->Number conversion at the loader boundary (never on the client) — the milestone's PERM-01-established convention for AccFolderPermissionSummary.totalBytes"

key-files:
  created:
    - lib/server/permissionFootprintView.ts
    - lib/server/permissionFootprintView.test.ts
    - app/(dashboard)/access-analysis/permissionFootprintCounts.ts
    - app/(dashboard)/access-analysis/__tests__/permissionFootprintCounts.test.ts
    - app/(dashboard)/access-analysis/components/PermissionFootprintChart.tsx
    - app/(dashboard)/access-analysis/__tests__/PermissionFootprintChart.test.tsx
  modified: []

key-decisions:
  - "PermissionFootprintChart uses local drill state (mirrors RolesPieChart.tsx's toggleDrill), not the shared sliceFilters cross-filter bus — per 20-RESEARCH.md Open Q3 resolution"
  - "Component exposes both an EChart onEvents.click AND a clickable HTML legend list wired to the same toggleDrill function — matches the existing RolesPieChart/DormantSignInChart convention and keeps the interaction unit-testable without simulating canvas clicks"

patterns-established:
  - "formatBytes(): pure, tested byte-formatting helper, reusable by any future bytes-denominated panel"

requirements-completed: [PERM-01]

# Metrics
duration: ~20min
completed: 2026-07-03
---

# Phase 20 Plan 01: Permission Footprint by Role (PERM-01) Summary

**Server loader + pure transform + client horizontal-bar chart reading `AccFolderPermissionSummary` (22,082 rows), converting `totalBytes` BigInt→Number server-side, with a new `formatBytes()` helper and per-role click-to-drill — a vertical slice not yet wired into `/access-analysis` (plan 20-05 does the registration).**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3 completed
- **Files modified:** 6 created, 0 modified

## Accomplishments
- `loadPermissionFootprint`/`assemblePermissionFootprint` loader converts `AccFolderPermissionSummary.totalBytes` (BigInt) to a plain `number` at the server boundary, resolving project names (`AccProject`-over-`AccDcProject` precedence) and role names (`AccRole`) with honest `"Unknown role"`/`"Unknown project"` fallbacks.
- `formatBytes()` — the milestone's one genuinely new helper — renders `"0 B"`/`"512 B"`/`"1.0 KB"`/`"42.3 GB"`-style strings across all 5 unit boundaries.
- `summarizePermissionFootprint()` aggregates rows per role into top-10 + a trailing "Other (N roles)" bar (sorted by `totalBytes` desc), plus a per-role project drill-down map sorted by bytes desc.
- `PermissionFootprintChart` renders the horizontal bars via the canonical `@/components/ui/EChart`, colored via `buildRoleColorMap` (matches the Role-distribution donut), with a clickable legend/drill list and an honest empty state.

## Task Commits

Each task was committed atomically:

1. **Task 1: PERM-01 server loader** - `ccfb07d6` (feat) — plus a follow-up fix `b59a1160` (BigInt literal → `BigInt()` constructor, found via the `tsc --noEmit` gate before Task 3 finished)
2. **Task 2: formatBytes + summarizePermissionFootprint** - `bb664612` (feat)
3. **Task 3: PermissionFootprintChart client component** - `291c4250` (feat)

_No separate plan-metadata commit exists at this point in the run; STATE/ROADMAP/REQUIREMENTS updates are captured in the final commit described below._

## Files Created/Modified
- `lib/server/permissionFootprintView.ts` - Loader + pure assembly; `Number(r.totalBytes)` conversion lives here only
- `lib/server/permissionFootprintView.test.ts` - Pure-assembly tests (BigInt→Number, unknown roleId, project-name precedence); no DB
- `app/(dashboard)/access-analysis/permissionFootprintCounts.ts` - `formatBytes` + `summarizePermissionFootprint`
- `app/(dashboard)/access-analysis/__tests__/permissionFootprintCounts.test.ts` - formatBytes boundaries, top-N+Other math, drill sort, role-bounded row count
- `app/(dashboard)/access-analysis/components/PermissionFootprintChart.tsx` - Client horizontal-bar chart + drill
- `app/(dashboard)/access-analysis/__tests__/PermissionFootprintChart.test.tsx` - Empty state, bar count/sort, drill open/close, Other non-clickable

## Verification Evidence
- **Commands run:** `npx vitest run lib/server/permissionFootprintView.test.ts "app/(dashboard)/access-analysis/__tests__/permissionFootprintCounts.test.ts" "app/(dashboard)/access-analysis/__tests__/PermissionFootprintChart.test.tsx"` → 3 files, 15 tests, all passed
- **Type/build gate:** `npx tsc --noEmit` → 0 errors (repo-wide, run after the BigInt-literal fix)
- **Targeted tests/source checks:**
  - Grep proof `Number\(.*totalBytes\)` in `lib/server/permissionFootprintView.ts` → 1 match (line 50)
  - Grep proof `accFolderPermission\b` (raw table, word-boundary excludes `...Summary`) in both new non-test source files → 0 matches in either — confirms zero raw-table touch
  - Grep proof `components/ui/EChart` in `PermissionFootprintChart.tsx` → confirms the canonical (not legacy route-local) wrapper is imported
- **Repo-map check:** not needed — no import/data-flow/boundary changes; this plan adds new leaf files only, no existing module's exports or consumers changed

## Dashboard Evidence
- **Workshop surface:** `/access-analysis` (component built but not yet mounted — registration is plan 20-05's scope per this plan's frontmatter/success criteria)
- **Workshop impact:** Once registered (20-05), gives the presenter a credible "which roles reach the most data" story with real folder counts and human-readable byte totals, drillable per project — currently unreachable from the live page, so zero user-visible change yet
- **UI guardrails:** zinc theme via CSS-variable-driven classes (`border-border`, `bg-card`, `text-muted-foreground`, etc.), colors resolved through `useTheme()`/`buildRoleColorMap` (no hardcoded light/dark branching beyond the existing `dark` boolean pattern used elsewhere in this route), empty state present and honest ("No permission summary rows for this selection."), no new WebGL, no card-inside-card nesting
- **Scope guardrails:** `/users/spatial-graph` untouched; `mainCharts.tsx`/`AccessAnalysisCharts.tsx` untouched (confirmed via `git diff` across this plan's commit range — zero hits)

## Data Truthfulness
- **Data sources:** `AccFolderPermissionSummary` (22,082 rows, materialized in v2.2 Ph18/19, cron-refreshed), joined against `AccProject`/`AccDcProject` (name resolution) and `AccRole` (role name resolution) — all verified against `prisma/schema.prisma` lines 479-561 this pass
- **Coverage limits:** None new — this loader reads a fully-materialized summary table (not a partial/under-covered source); role/project name fallbacks (`"Unknown role"`/`"Unknown project"`) are defensive, not expected to fire against live data (0 of 107 distinct roleIds were unmatched per 20-RESEARCH.md's live query)
- **No fake data:** Confirmed — no invented fixtures reach the live loader path; the loader queries real Prisma models via `db.accFolderPermissionSummary.findMany`/`db.accProject.findMany`/`db.accDcProject.findMany`/`db.accRole.findMany`. Only the unit tests use fabricated in-memory rows (standard, matches `projectCoverageView.test.ts` convention)

## Decisions Made
- Local component drill state (not the shared `sliceFilters` bus) for `PermissionFootprintChart` — matches the phase-level resolution recorded in 20-RESEARCH.md Open Question 3 and the existing `RolesPieChart.tsx`/`DormantSignInChart.tsx` precedent.
- Component wires the click handler through both the EChart `onEvents.click` (for real chart-bar clicks) and an HTML legend list (for accessibility + unit-test coverage without simulating canvas events) — matches `RolesPieChart.tsx`'s established dual-wiring pattern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] BigInt literal fixtures broke the ES2017 `tsc` target**
- **Found during:** Task 1, discovered by the repo-wide `npx tsc --noEmit` gate run before finishing Task 3
- **Issue:** `permissionFootprintView.test.ts` used `n`-suffix BigInt literals (e.g. `2_963_471_918_056n`) in test fixtures. This repo's `tsconfig.json` targets ES2017, which does not support BigInt literal syntax (`TS2737`), a documented standing pitfall in this codebase (STATE.md: "0n/2048n BigInt literals break ES2017 target → use `BigInt()`").
- **Fix:** Replaced all 5 occurrences with `BigInt(...)` constructor calls.
- **Files modified:** `lib/server/permissionFootprintView.test.ts`
- **Verification:** `npx tsc --noEmit` → 0 errors; re-ran the test file → still 3/3 passing.
- **Committed in:** `b59a1160`

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary correctness fix caught by the mandated `tsc --noEmit` gate; no scope creep, no behavior change to the assembly logic itself.

## Issues Encountered

**Shared git index race across parallel wave-1 executors (no destructive impact on this plan's work, documented for the phase-level record).** This repo's wave-1 execution for phase 20 ran multiple plan executors (20-01 through at least 20-04) concurrently in the *same* working directory with no worktree isolation. Twice during this run, `git add <this-plan's-files>` followed immediately by `git commit` picked up files from a concurrently-running sibling plan's `git add` that landed in the shared index at nearly the same moment (observed: a commit initially labeled for a BigInt-literal fix to this plan's test file instead captured a sibling-plan-authored `.planning/phases/20-foundation-wins-engagement-panels/deferred-items.md`, which itself documents the identical race from the sibling plans' perspective). No files were lost or corrupted — every commit was verified via `git diff --cached --name-only` (and, after the fact, `git show --stat`) before being trusted, and the mis-attributed commit's content was legitimate sibling-plan documentation, not discarded. The actual intended fix was re-staged and re-committed cleanly in the next commit (`b59a1160`, verified 10 lines changed matching exactly the 5 BigInt-literal replacements). Recorded here per the "Staging index hazard" project memory pattern; no action needed from a future 20-01 re-run, but this is a standing risk for any phase with concurrent wave-1 plan execution in a single working tree.

## User Setup Required

None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed (zinc theme, canonical EChart, BigInt server-side conversion, no new WebGL, `/users/spatial-graph` untouched)
- [x] Data coverage is truthful and labeled (materialized summary table, no under-coverage caveat needed for this specific requirement)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked
- [x] Claims backed by command output (vitest, tsc, grep proofs above) or marked `VERIFY:` (none needed this plan)

## Next Phase Readiness
- PERM-01's loader/transform/component slice is complete, tested, and typechecked, but **not yet mounted** on `/access-analysis` — plan 20-05 is responsible for registering `loadPermissionFootprint()` in `mainCharts.tsx`'s fan-out and rendering `<PermissionFootprintChart>` inside `AccessAnalysisCharts.tsx` (per CONTEXT.md's placement: after the role-related charts, before Model Coordination), plus the live-page-load BigInt-serialization smoke check called out in 20-RESEARCH.md.
- No blockers for 20-05 consuming this plan's exports (`loadPermissionFootprint`, `PermissionFootprintRow`, `PermissionFootprintChart`, `summarizePermissionFootprint`, `formatBytes`).

---
*Phase: 20-foundation-wins-engagement-panels*
*Completed: 2026-07-03*

## Self-Check: PASSED

All 6 created files confirmed present on disk; all 4 task commit hashes
(`ccfb07d6`, `bb664612`, `b59a1160`, `291c4250`) confirmed present in git log.
