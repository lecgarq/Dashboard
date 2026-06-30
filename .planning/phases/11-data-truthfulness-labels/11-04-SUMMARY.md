---
phase: 11-data-truthfulness-labels
plan: "04"
subsystem: access-analysis / coverage-labels / module-tooltip
tags: [TRUTH-01, TRUTH-03, coverage-header, module-donut, radix-tooltip, vitest, tdd]
dependency_graph:
  requires: [11-03]
  provides: [dcCoverage, loadDcCoverage, assembleDcCoverage, coverage-header-line, module-caveat-tooltip]
  affects:
    - lib/server/dcCoverageView.ts
    - lib/server/__tests__/dcCoverageView.test.ts
    - app/(dashboard)/access-analysis/mainCharts.tsx
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
    - app/(dashboard)/access-analysis/page.test.tsx
    - .planning/codebase/INTEGRATIONS.md
tech_stack:
  added: []
  patterns: [TDD RED/GREEN, server-only cache module, pure transform export, local TooltipProvider, prop threading]
key_files:
  created:
    - lib/server/dcCoverageView.ts
    - lib/server/__tests__/dcCoverageView.test.ts
  modified:
    - app/(dashboard)/access-analysis/mainCharts.tsx
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
    - app/(dashboard)/access-analysis/page.test.tsx
    - .planning/codebase/INTEGRATIONS.md
decisions:
  - "assembleDcCoverage is pure exported for unit testability; DB access stays in lib/server only (no Prisma in components)"
  - "Coverage header renders conditionally only when covTotal > 0 to avoid empty-state noise"
  - "ⓘ tooltip wraps in local TooltipProvider because no global one exists in this client tree"
  - "page.test.tsx needed a loadDcCoverage mock (Rule 1 fix) — resolved alongside Task 3"
  - "ⓘ SVG info-icon passed via the SectionHeader badge slot as a React fragment alongside ActivityCoverageBadge"
metrics:
  duration: "10 minutes"
  completed: "2026-06-30"
  tasks_completed: 3
  files_changed: 6
status: complete
---

# Phase 11 Plan 04: TRUTH-01 + TRUTH-03 Coverage Header + Module Tooltip Summary

One-liner: Added live metric-specific coverage header (free-crawl activity ~956/1,153 leads; DC metadata ~550/1,153 secondary) and a hover/focus-only ⓘ Radix tooltip on the module-activity donut (rawAction classification + ~40.7% unreconciled `service` caveat), with INTEGRATIONS.md aligned.

## What Was Built

**TRUTH-01 — coverage header line:**

1. **`lib/server/dcCoverageView.ts`** — new server-only module. Exports `DcCoverage` interface, `assembleDcCoverage(covered, total)` pure helper, and `loadDcCoverage()` with 5-minute in-process cache. Queries `db.accDcProject.count()` (≈550) and `db.accProject.count()` (≈1,153) in parallel. No hard-coded fallback counts.

2. **`lib/server/__tests__/dcCoverageView.test.ts`** — 3 TDD unit tests for `assembleDcCoverage`: verbatim return, `covered ≤ total` invariant, zero-input case. Test-pinned pattern mirrors `projectCoverageView.ts` → `buildCoverage`.

3. **`app/(dashboard)/access-analysis/mainCharts.tsx`** — adds `loadDcCoverage()` to the `Promise.all`; passes `dcCoverage` as new prop to `<AccessAnalysisCharts />`. 11-03's `timeline.rows/dataFloor/floorByProject` props preserved unchanged.

4. **`app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`** — accepts `dcCoverage?: DcCoverage` prop. Renders ONE restrained muted header line (`data-testid="coverage-header"`, `text-xs text-muted-foreground`) between `<StatStrip>` and `<ProjectPicker>`:
   - "Activity data covers {covCovered} of {covTotal} ACC projects · Data Connector metadata covers {dcCoverage.covered} of {dcCoverage.total}"
   - Activity (~956/1,153) leads; DC (~550/1,153) is secondary. Renders only when `covTotal > 0`.
   - All numbers come from live props — no literals in JSX. "428" is absent (verified by grep gate).
   - Existing `ActivityCoverageBadge` on each activity-derived panel is unchanged.

**TRUTH-03 — module-donut ⓘ tooltip:**

5. **`AccessAnalysisCharts.tsx` (continued)** — imports `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` from `@/components/ui/tooltip`. Wraps the "Activity by module" `SectionHeader` badge slot with a React fragment containing:
   - Local `<TooltipProvider>` (required — no global one in this tree)
   - `<TooltipTrigger asChild>` wrapping a `<button aria-label="About module classification">` with an ⓘ SVG info-circle (`h-3.5 w-3.5`, `text-muted-foreground`, hover transition)
   - `<TooltipContent data-testid="module-caveat" className="max-w-xs text-xs">` — candid copy: "Classification is derived from each activity's `rawAction`. Autodesk's own `service` product attribution is not yet reconciled — the two disagree on ~40.7% of rows."
   - `<ActivityCoverageBadge>` preserved after the tooltip in the same fragment
   - Tooltip is hover/focus-only (Radix default behavior)

6. **`.planning/codebase/INTEGRATIONS.md`** — expands the `AccActivity.service` bullet (formerly line ~215) to explicitly frame the ~40.7% as the unreconciled `service`-vs-`rawAction` disagreement and calls out the TRUTH-03 tooltip as the surface where this is disclosed. Scoped to that note only; AccDcRole fallback block (11-01) untouched.

## Verification Evidence

### Vitest (16/16 pass)
```
Test Files  4 passed (4)
     Tests  16 passed (16)
  Duration  2.58s
```

Files tested:
- `lib/server/__tests__/dcCoverageView.test.ts` — 3 tests (TDD RED→GREEN: verbatim, covered≤total, zero-input)
- `lib/server/__tests__/activityTimelineView.test.ts` — 6 tests (no regression)
- `app/(dashboard)/access-analysis/__tests__/ActivityTimelineChart.test.tsx` — 5 tests (no regression)
- `app/(dashboard)/access-analysis/page.test.tsx` — 2 tests (mock updated for `loadDcCoverage`)

### `npx tsc --noEmit`
```
(no output — clean; exit 0)
```

### `rg "428"` gate
```
app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx — 0 matches
```
Rejected framing absent.

### `rg "rawAction"` gate
```
app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx:485: rawAction (in TooltipContent)
```
Caveat copy present.

### Hard-coded number check
No literal `428`, `550`, `956`, or `1153` in JSX. All counts flow from `covCovered`/`covTotal` (existing activity coverage props) and `dcCoverage.covered`/`dcCoverage.total` (new prop from `loadDcCoverage()`).

### 11-03 regression check
`mainCharts.tsx` still passes `timeline.rows`, `timeline.dataFloor`, `timeline.floorByProject`. `AccessAnalysisCharts.tsx` still threads `dataFloor`/`floorByProject` to `ActivityTimelineChart`. All 5 `ActivityTimelineChart.test.tsx` tests pass.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 TDD RED→GREEN | 327d0e13 | `dcCoverageView.ts` + 3-test Vitest pin |
| 2 Coverage header | 71305f5c | `mainCharts.tsx` + `AccessAnalysisCharts.tsx` coverage header line |
| 3 Module tooltip | 295fbbed | ⓘ Radix tooltip + `page.test.tsx` mock fix + `INTEGRATIONS.md` |

## Deviations from Plan

### Deviation 1: page.test.tsx loadDcCoverage mock (Rule 1 — Bug)
- **Found during:** Task 3 vitest run
- **Issue:** `page.test.tsx` calls `MainCharts()` which now calls `loadDcCoverage()`. The test environment has no DB connection, so the Prisma call fails with "User was denied access on the database (not available)".
- **Fix:** Added `vi.mock("@/lib/server/dcCoverageView", () => ({ loadDcCoverage: vi.fn(async () => ({ covered: 0, total: 0 })) }))` to `page.test.tsx`, following the exact pattern of the `projectCoverageView` mock already present.
- **Files modified:** `app/(dashboard)/access-analysis/page.test.tsx`
- **Commit:** 295fbbed (bundled with Task 3)

No other deviations. All three tasks executed as planned.

## Data Truthfulness Notes

- Activity coverage (~956/1,153): sourced from existing `activityCoverageCounts(coverage)` → `covCovered`/`covTotal`. No new query.
- DC coverage (~550/1,153): sourced from new `loadDcCoverage()` → `db.accDcProject.count()` + `db.accProject.count()`. Live at render time; 5-min cache prevents redundant DB calls.
- No hard-coded count literals appear in the UI. The "428" framing (stale DC-API-extractable count, owner-rejected) is absent.
- The ~40.7% `service`/`rawAction` disagreement figure in the tooltip matches the verified INTEGRATIONS.md census and the diagnostic scripts referenced in STATE.md.

## Known Stubs

None. Both coverage figures flow from live Prisma counts to the UI. The tooltip copy is static text (the 40.7% figure is a verified diagnostic result, not a live query — treated as a known constant like a calibrated label, consistent with the plan).

## Workshop Impact

On `/access-analysis`:
- A muted `text-xs` header line now reads "Activity data covers {N} of {M} ACC projects · Data Connector metadata covers {K} of {M}" — metric-specific, not one blanket number. The presenter can name what each metric covers.
- The "Activity by module" panel title carries a small ⓘ icon. Hover/focus reveals the rawAction/40.7% caveat — "honest at a glance, full candor on hover."

Visual UAT (rebuild on :3000 to see in browser) is deferred to end-of-phase per `human_verify_mode: end-of-phase`. Do NOT run `npm run build` while :3000 is serving.

## Threat Flags

None. Coverage ratios and the classification caveat are explicitly owner-approved disclosures (T-11-06 accepted). The "no literal counts in JSX" rule enforced by the negative grep satisfies T-11-07 (live counts, not spoofable stale figures).

## Dashboard Self-Check

- **Context:** 11-04-PLAN.md, 11-CONTEXT.md, 11-03-SUMMARY.md (prop seam), 11-01-SUMMARY.md (INTEGRATIONS.md voice), STATE.md, coverageCounts.ts, mainCharts.tsx, AccessAnalysisCharts.tsx, projectCoverageView.ts (pattern), tooltip.tsx (Radix exports), INTEGRATIONS.md — all read.
- **Evidence:** `accDcProject` + `accProject` models confirmed from Prisma schema; `covCovered`/`covTotal` already in `AccessAnalysisCharts` via `activityCoverageCounts(coverage)`; `TooltipProvider` NOT global (only in UsersDirectoryClient.tsx — confirmed via 11-04-PLAN context); INTEGRATIONS.md line ~215 already held the 40.7% note (expanded, not invented).
- **Constraints applied:** zinc theme (`text-muted-foreground`, `text-xs`, `h-3.5 w-3.5`); semantic CSS vars; hover/focus-only tooltip (Radix default); ≤200ms motion (tooltip default); no bordered card; no hard-coded counts in JSX; no new WebGL; `/users/spatial-graph` untouched; DB access in `lib/server` only.
- **Gates run:** `npx vitest run` (4 files, 16 tests PASS) + `npx tsc --noEmit` (CLEAN) + `rg "428"` gate (0 matches) + `rg "rawAction"` gate (1 match). Rebuild deferred (end-of-phase, per config).
- **VERIFY remaining:** Visual check on `/access-analysis` at rebuild — coverage header line legible in zinc-dark; module ⓘ tooltip appears on hover with correct copy; light/dark mode zinc colors hold.

## Self-Check: PASSED

- [x] `lib/server/dcCoverageView.ts` exists (created)
- [x] `lib/server/__tests__/dcCoverageView.test.ts` exists (created, 3 tests)
- [x] `app/(dashboard)/access-analysis/mainCharts.tsx` has `loadDcCoverage` import and `dcCoverage` prop
- [x] `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` has coverage header + module tooltip
- [x] `.planning/codebase/INTEGRATIONS.md` has expanded service note
- [x] Commit `327d0e13` exists in git log
- [x] Commit `71305f5c` exists in git log
- [x] Commit `295fbbed` exists in git log
- [x] 16 tests pass, tsc clean, "428" absent, "rawAction" present
- [x] 11-03 timeline props preserved (no regression)
