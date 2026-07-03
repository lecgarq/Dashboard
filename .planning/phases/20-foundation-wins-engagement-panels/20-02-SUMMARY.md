---
phase: 20-foundation-wins-engagement-panels
plan: 02
subsystem: analytics
tags: [prisma, echarts, access-analysis, dormant-users, engagement, react]

# Dependency graph
requires:
  - phase: 19-issue-funnel-hardening (prior milestone, PROJ-02/PROJ-03)
    provides: "AccDcUser / AccDcProjectUser / AccDcCompany DC-metadata tables and precedent Map-join pattern (lib/acc/dcUserAssembly.ts)"
provides:
  - "loadSignInRecency loader + assembleSignInRecency pure join (lib/server/signInRecencyView.ts)"
  - "bucketSignInRecency + summarizeSignInRecency pure transform (app/(dashboard)/access-analysis/signInRecencyCounts.ts)"
  - "DormantSignInChart client bar chart with band drill + DC-coverage caption (app/(dashboard)/access-analysis/components/DormantSignInChart.tsx)"
affects: [20-05-workshop-mount, engagement-panels]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server loader + pure-join + 5-min TTL cache mirroring lib/server/dcCoverageView.ts (import \"server-only\", force param, module-level cache)"
    - "Null-defensive recency bucketing mirroring lib/acc/activeUserTiers.ts (date-fns parseISO/isValid/differenceInDays, explicit now param for deterministic tests)"
    - "Local drill/setDrill state pattern (RolesPieChart precedent) instead of the shared sliceFilters cross-filter bus"

key-files:
  created:
    - lib/server/signInRecencyView.ts
    - lib/server/signInRecencyView.test.ts
    - app/(dashboard)/access-analysis/signInRecencyCounts.ts
    - app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts
    - app/(dashboard)/access-analysis/components/DormantSignInChart.tsx
    - app/(dashboard)/access-analysis/__tests__/DormantSignInChart.test.tsx
    - .planning/phases/20-foundation-wins-engagement-panels/deferred-items.md
  modified: []

key-decisions:
  - "ENG-01 Option B (orchestrator-approved, documented in 20-02-PLAN.md objective): source per-project sign-in recency from AccDcUser.lastSignIn joined via AccDcProjectUser, NOT AccProjectMember.lastSignIn (100% NULL across 14,566 rows — dead field) or AccDcProjectUser.lastSignIn (also 100% NULL, 22,835/22,835). Coverage narrows to DC-covered projects (~550 of 1,153); the panel carries an explicit DC-coverage scope caption."
  - "Recency band boundaries: <30d = [0,29] days, 30-90d = [30,90], 90-365d = [91,365], >365d = [366+] — chosen so the 3 boundary test pairs (29/31, 89/91, 364/366) each land unambiguously on either side with no gap or overlap."
  - "\"Never signed in\" bar rendered in muted zinc (#71717a) against a warm emerald->amber->orange->red ramp for the 4 dated bands, so it reads as different in kind (no date at all), not merely the most-stale color step."

requirements-completed: [ENG-01]

# Metrics
duration: 55min
completed: 2026-07-03
---

# Phase 20 Plan 02: Dormant-User Engagement Panel (ENG-01) Summary

**Real per-project sign-in recency signal (AccDcUser.lastSignIn via AccDcProjectUser join) bucketed into 5 locked bands with an honest, populated "Never signed in" bucket — loader, transform, and drillable chart, standalone and unit-tested; not yet mounted on the page (plan 20-05 wires it in).**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-07-03T09:19:00-06:00 (2026-07-03T15:19:00Z)
- **Completed:** 2026-07-03T09:25:38-06:00 (2026-07-03T15:25:38Z)
- **Tasks:** 3/3 completed
- **Files modified:** 6 (3 source + 3 test)

## Accomplishments
- Replaced the roadmap's dead-field assumption (`AccProjectMember.lastSignIn`, 100% NULL) with a verified, real recency distribution (`AccDcUser.lastSignIn`, 1,254/3,870 non-null) — turns a would-be degenerate 100%-Never chart into a genuine engagement story.
- Delivered a fully-tested vertical slice (loader → pure bucketing transform → drillable client chart) with 22 passing tests across 3 files, none touching the two files (`mainCharts.tsx` / `AccessAnalysisCharts.tsx`) owned by plan 20-05.
- Null `lastSignIn` is never dropped: it lands in an explicit, always-rendered "Never signed in" band (verified by a lossless-total test asserting `sum(band counts) === rows.length`).

## Task Commits

Each task was committed atomically:

1. **Task 1: signInRecency server loader (AccDcUser join via AccDcProjectUser) + sibling test** - `c2ed73b7` (feat)
2. **Task 2: recency bucketing + summarize transform + test** - `62308f5e` (feat)
3. **Task 3: DormantSignInChart client component + test** - `4ceed646` (feat)

_No TDD tasks in this plan (type="auto" only); no plan-metadata commit beyond this SUMMARY's own final commit._

## Files Created/Modified
- `lib/server/signInRecencyView.ts` - `loadSignInRecency` (5-min TTL cache, `force` param) + pure `assembleSignInRecency` Map-join of `AccDcProjectUser` × `AccDcUser` × `AccDcCompany`; serializes `lastSignIn` to ISO string at the RSC boundary.
- `lib/server/signInRecencyView.test.ts` - 7 tests: name/company resolution, ISO serialization, missing-user/company fallbacks ("Unknown user"/"Unknown company"), null lastSignIn kept (not dropped), `JSON.stringify` never throws.
- `app/(dashboard)/access-analysis/signInRecencyCounts.ts` - `RECENCY_BANDS` (locked order), `bucketSignInRecency` (null-defensive, date-fns), `summarizeSignInRecency` (all 5 bands always present, drill rows sorted oldest-first).
- `app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts` - 9 tests: exact boundary pairs (29/31d, 89/91d, 364/366d), null → Never, lossless total, all-5-bands-present, drill sort order, stable order for Never rows.
- `app/(dashboard)/access-analysis/components/DormantSignInChart.tsx` - `"use client"` vertical bar chart via `@/components/ui/EChart`; click-to-drill (local state, not the shared `sliceFilters` bus); DC-coverage scope caption from live props; empty state.
- `app/(dashboard)/access-analysis/__tests__/DormantSignInChart.test.tsx` - 6 tests: empty state, all 5 bands rendered in order, drill shows "Never" for null dates, drill toggles closed, coverage caption renders live numbers, caption omitted when absent.
- `.planning/phases/20-foundation-wins-engagement-panels/deferred-items.md` - records two out-of-scope observations (see Deviations below).

## Verification Evidence
- **Commands run:** `npx vitest run lib/server/signInRecencyView.test.ts "app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts" "app/(dashboard)/access-analysis/__tests__/DormantSignInChart.test.tsx"` -> 3 files, 22/22 tests passed.
- **Type/build gate:** `npx tsc --noEmit` -> zero errors in any of this plan's 6 files (verified via targeted grep of the full-repo tsc output); 5 pre-existing `TS2737` BigInt-literal errors found in `lib/server/permissionFootprintView.test.ts`, a file owned by sibling plan 20-01 (PERM-01, confirmed via its `files_modified` frontmatter — not 20-03 as first suspected), not this plan — logged to `deferred-items.md`, not fixed here (Scope Boundary rule).
- **Targeted tests/source checks:** grep proof — `grep -n "db\.accProjectMember\|\.accProjectMember\."` across all 3 new source files returns no matches; the dead field is never read (only referenced in documentation comments explaining the deviation).
- **Repo-map check:** not run — no import/dependency-boundary changes; new files are additive leaves (loader in `lib/server/`, pure transform + client component in `app/(dashboard)/access-analysis/`) that mirror existing sibling patterns exactly.

## Dashboard Evidence
- **Workshop surface:** `/access-analysis` (component built standalone; page mount deferred to plan 20-05 per this plan's explicit scope).
- **Workshop impact:** Once mounted (20-05), gives Luis a real "who has gone quiet, and who never showed up" story backed by a genuine non-degenerate distribution, instead of a 100%-Never chart that would undermine credibility live.
- **UI guardrails:** zinc dark theme preserved (component reads `resolvedTheme` via `next-themes`, colors resolved through `mergeEChartsTheme`); no new WebGL (canvas-renderer ECharts only, same as every other access-analysis chart); empty state implemented; motion budget respected (`animationDuration: 700`, well under the 200ms *interaction*-drill budget — this is initial chart-paint animation, matching `ActivityTimelineChart`'s existing precedent).
- **Scope guardrails:** `/users/spatial-graph` untouched; `mainCharts.tsx` and `components/AccessAnalysisCharts.tsx` untouched (confirmed via `git log` — no commits from this plan touch either file), preserving the file-ownership split with plan 20-05.

## Data Truthfulness
- **Data sources:** `AccDcUser.lastSignIn` (verified in `prisma/schema.prisma:648-661`, `DateTime?`), joined via `AccDcProjectUser` (`prisma/schema.prisma:709-720`, no Prisma relation exists between `userId` and `AccDcUser.id` — confirmed by schema inspection, joined in JS by `Map` exactly as `lib/acc/dcUserAssembly.ts` already does for the same tables). `AccDcCompany` (`prisma/schema.prisma:663-669`) resolves company names.
- **Coverage limits:** DC-metadata coverage narrows the dataset to DC-covered projects (~550 of 1,153 live-API projects) — `DormantSignInChart` renders an explicit caption ("Sign-in dates come from Data Connector metadata ({covered} of {total} projects). The live ACC API sync captures no sign-in timestamps.") whenever the parent supplies live `dcCoverage` numbers (sourced from `lib/server/dcCoverageView.ts` in the eventual 20-05 mount — never hardcoded here).
- **No fake data:** No fixtures, mock env vars, or invented routes/procedures. All Prisma fields/models referenced were verified directly against `prisma/schema.prisma` before use.

## Decisions Made
- **ENG-01 Option B deviation** (pre-authorized by the orchestrator in the plan's `<objective>` — not a new decision made during execution, but recorded here per the plan's explicit instruction): source is `AccDcUser.lastSignIn` via `AccDcProjectUser`, not the roadmap-named `AccProjectMember.lastSignIn`. Rationale and live counts are documented in the source-code comment at the top of `lib/server/signInRecencyView.ts` and in the plan's objective block.
- **Band boundary partition** chosen to be gap-free and overlap-free: `<30d` = days < 30; `30–90d` = 30 ≤ days ≤ 90; `90–365d` = 91 ≤ days ≤ 365; `>365d` = days > 365. This was Claude's discretion per the plan (exact boundary treatment not locked beyond the labels themselves) and is exercised by all 3 boundary-pair tests.
- **Never-signed-in visual treatment**: solid muted zinc (#71717a) rather than a hatch/pattern fill (ECharts pattern fills add render complexity for negligible legibility gain at this bar count) — satisfies "different in kind" without introducing new visual machinery.

## Deviations from Plan

### Auto-fixed Issues

None required for this plan's own task execution — all 3 tasks matched the plan's file/interface specifications and passed their tests on first implementation.

### Documented Observations (Rule: Scope Boundary — not auto-fixed)

**1. [Scope Boundary] Pre-existing BigInt TS2737 errors in a sibling plan's file**
- **Found during:** post-Task-3 `npx tsc --noEmit` full-repo gate.
- **Issue:** `lib/server/permissionFootprintView.test.ts` (owned by plan 20-01, PERM-01, per its `files_modified` frontmatter — not in this plan's file set) has 5 BigInt-literal TS2737 errors.
- **Action:** confirmed zero errors in this plan's own 6 files; logged the sibling-plan issue to `.planning/phases/20-foundation-wins-engagement-panels/deferred-items.md` for the phase-level verifier. Not fixed here. (A 20-03 sibling agent's later note in the same file corrected the initial 20-03 attribution to 20-01 — reflected here.)

**2. [Process note] Staging-index hazard confirmed live during parallel wave-1 execution**
- **Found during:** Task 1 commit.
- **Issue:** `git add lib/server/signInRecencyView.ts lib/server/signInRecencyView.test.ts && git commit` produced commit `c2ed73b7` containing 4 files, not 2 — two files (`lib/server/ingestFreshnessView.ts` / `.test.ts`, belonging to sibling plan 20-04/PIPE-01) were apparently pre-staged in the shared git index by a concurrently-running sibling agent in the same working directory (no worktree isolation observed for this phase's wave). No content was lost; the sibling files are legitimate, correctly-built code, just commit-attribution is now mixed across `c2ed73b7`/`62466da7`.
- **Fix:** for Tasks 2 and 3, added an explicit `git diff --cached --name-only` check immediately after `git add` and *before* `git commit`, confirming only this plan's intended files were staged (both came back clean — exactly 2 files each). Did not attempt any destructive git operation (no reset/rebase) on the earlier mixed commit, per the destructive-git prohibition and the file-content-preservation goal.
- **Files affected:** none of this plan's own files were lost or corrupted; commit `c2ed73b7`'s tree is a superset (my 2 intended files + 2 sibling files), not a loss.
- **Commit:** `c2ed73b7` (documented, not reverted); full detail in `deferred-items.md`.

## Known Stubs

None. All three deliverables (`loadSignInRecency`/`assembleSignInRecency`, `bucketSignInRecency`/`summarizeSignInRecency`, `DormantSignInChart`) are fully wired to real Prisma-sourced data shapes and have no hardcoded/placeholder values. The component is intentionally **not yet mounted** on `/access-analysis` (plan 20-05's explicit responsibility, stated in this plan's objective) — this is a scoped hand-off, not a stub.

## Threat Flags

None. This plan adds a read-only server loader (Prisma `findMany` selects, no writes) and a client-side chart component; no new network endpoints, auth paths, or schema changes at a trust boundary.

## Self-Check: PASSED

- `lib/server/signInRecencyView.ts` — FOUND
- `lib/server/signInRecencyView.test.ts` — FOUND
- `app/(dashboard)/access-analysis/signInRecencyCounts.ts` — FOUND
- `app/(dashboard)/access-analysis/__tests__/signInRecencyCounts.test.ts` — FOUND
- `app/(dashboard)/access-analysis/components/DormantSignInChart.tsx` — FOUND
- `app/(dashboard)/access-analysis/__tests__/DormantSignInChart.test.tsx` — FOUND
- Commit `c2ed73b7` — FOUND in `git log --oneline --all`
- Commit `62308f5e` — FOUND in `git log --oneline --all`
- Commit `4ceed646` — FOUND in `git log --oneline --all`

## Dashboard self-check

- **Context:** `.planning/STATE.md`, `.planning/PROJECT.md` (via config), `.planning/config.json`, `20-02-PLAN.md`, `20-CONTEXT.md` (Dormant-users section), `.claude/skills/lecg-dashboard/SKILL.md`, and precedent source files (`lib/acc/activeUserTiers.ts`, `lib/acc/dcUserAssembly.ts`, `lib/server/dcCoverageView.ts`, `RolesPieChart.tsx`, `ActivityTimelineChart.tsx`, `NoActivityBars.tsx`, `relativeTime.ts`, `chartContrast.test.ts`) all read before implementation.
- **Evidence:** Prisma fields verified directly against `prisma/schema.prisma` (lines 648-720) before writing the loader; `date-fns` presence verified in `package.json` and `node_modules`; existing test/component conventions verified by reading sibling files rather than assumed.
- **Constraints:** zinc theme preserved (theme-resolved colors only); no new WebGL (canvas ECharts); `/users/spatial-graph` untouched; `mainCharts.tsx`/`AccessAnalysisCharts.tsx` untouched (file-ownership boundary with 20-05 respected); under-covered DC data explicitly labeled via the live-prop caption, never hidden or hardcoded.
- **Gates:** `npx vitest run` (3 targeted files, 22/22 pass) and `npx tsc --noEmit` (0 errors in this plan's files) both run. Repo-map check skipped — no import/boundary/data-flow changes (additive leaf files only).
- **VERIFY:** none outstanding for this plan's own scope. (The sibling-plan BigInt tsc errors and the staging-index mixing are recorded as deferred/observed items above, not unresolved claims within this plan's deliverables.)
