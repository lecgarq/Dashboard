---
phase: 22-issue-type-resolution
plan: 03
subsystem: ui
tags: [echarts, access-analysis, issue-funnel, vitest, projects-tab]

# Dependency graph
requires:
  - phase: 22-issue-type-resolution (plan 01)
    provides: AccIssueType Prisma lookup table, 298/316 issueTypeId GUIDs resolved via scripts/acc-issue-types-backfill.cjs
  - phase: 22-issue-type-resolution (plan 02)
    provides: loadIssueFunnel() typeRows cut (IssueFunnelTypeRow[]) + summarizeIssueType()/DEFAULT_TOP_N top-N + Other transform
provides:
  - IssueTypeChart.tsx — horizontal-bar top-10 + expand-in-place Other, local per-project drill, live coverage captions, never-backfilled guard
  - ISSUE-05 user-visible on the Projects tab (third issue panel, below IssueStatusChart)
affects: [Phase 23 (workshop curation — this is the 7th and final new v2.3 panel)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IssueTypeChart re-invokes summarizeIssueType(rows, rows.length) for expand-in-place Other — zero new loader/fetch, mirrors PermissionLevelChart/FolderActivityByCompanyChart (20.1-07)"
    - "Never-backfilled guard: totalTypeGuids > 0 && resolvedTypeGuids === 0 renders a run-the-script notice instead of a wall of 100% Unknown-type bars"

key-files:
  created:
    - app/(dashboard)/access-analysis/components/IssueTypeChart.tsx
    - app/(dashboard)/access-analysis/__tests__/IssueTypeChart.test.tsx
  modified:
    - app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
---

# 22-03: ISSUE-05 — Issues-by-type chart + mounting

## Status

**COMPLETE.** Closed 2026-07-14 on **live-evidence basis** (see Checkpoint below) — the
code shipped 2026-07-10 in commits `a01872fd` (chart + tests) and `65871f56` (wiring),
but the plan's Task 3 checkpoint and this summary were never recorded before the session
ended. Phase 22 is now 3/3 plans complete; ISSUE-04 and ISSUE-05 both delivered.

## What shipped

`IssueTypeChart.tsx` (263 lines) renders the issues-by-type breakdown as horizontal bars,
mounted as the **third** issue panel on the Projects tab, directly below `IssueStatusChart`
— completing the issue story on `/access-analysis`: coverage → volume over time → status →
type.

Behavior, all verified against the shipped source:

- **Never a raw GUID.** Bars are labeled with human-readable type names resolved through
  the `AccIssueType` lookup table (22-01). Unresolved GUIDs fold into one ranked
  `"Unknown type"` bar; null `issueTypeId` folds into a distinct ranked `"No type set"`
  bar (`issueTypeCounts.ts:30,32`). Both rank by count like any real type — never pinned,
  never dropped.
- **Expand-in-place Other.** Local `expanded` state re-invokes
  `summarizeIssueType(rows, expanded ? rows.length : DEFAULT_TOP_N)` — zero new loader,
  zero new fetch (the 20.1-07 pattern from `PermissionLevelChart`/
  `FolderActivityByCompanyChart`).
- **Per-type project drill** into a ranked per-project list, project names resolved via the
  loader's `buildProjectNameMap`/`resolveProjectName` ("Unknown project" fallback).
- **Live captions, zero hardcoded figures.** `coverageCaptionText()` derives the fetched/
  total/unavailable line from `deriveIssueCoverageCaption` on live rows; GUID-resolution
  stats come from `summary.resolvedTypeGuids`/`totalTypeGuids`.
- **Never-backfilled guard** (`IssueTypeChart.tsx:99-110`): when type GUIDs exist but none
  resolve (empty/stale lookup table), the panel renders an explicit
  "Type names not yet backfilled — run `scripts/acc-issue-types-backfill.cjs`" notice
  rather than a wall of 100% "Unknown type" bars.
- **No cross-filter-bus wiring** (grep-verified: zero `sliceFilters`/`onSliceClick`/
  `activeSlice` occurrences) — local drill state only, per the locked 22-CONTEXT.md decision.
- **Rides the existing lazy fetch.** `filteredIssueTypeRows` is a picker-only memo over the
  same `loadIssueFunnel` Projects-tab lazy branch Phase 21 established — the eager
  `mainCharts.tsx` `Promise.all` fan-out is unchanged. Panel totals therefore reconcile
  with the status donut above it (same population, same `selected` filtering).

## Checkpoint — closed on live evidence

The plan specified a blocking `checkpoint:human-verify` (Task 3: isolated `:3100`
production preflight). **That preflight was never run.** Instead, the chart has been
running on the owner's live `:3000` deployment since 2026-07-10 — four days of real use,
including through three subsequent feature deployments — and the owner elected on
2026-07-14 to close the phase on that live-running evidence rather than re-run a preflight
for code already proven in production.

`VERIFY:` no formal owner UAT transcript exists for this panel. The acceptance basis is
"has been live on `:3000` since 2026-07-10 without a reported defect," not a recorded
sign-off. If a defect surfaces in the Phase 23 curation pass, this is the panel with the
thinnest verification trail.

## Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | clean (exit 0, re-run 2026-07-14) |
| access-analysis suite | 61 files / 520 tests green (re-run 2026-07-14) |
| Scope | exactly the 4 planned files |
| New deps | none |
| `/users/spatial-graph` | untouched |
| New WebGL | none (ECharts only) |

## Deviations

None in code — both tasks shipped exactly the 4 files named in the plan's `files_modified`.
The deviation is **process**: Task 3's checkpoint gate and this summary were skipped when
the executing session ended, leaving Phase 22 code-complete but formally open for four days
while off-roadmap work continued on top of it. STATE.md consequently reported
"next: plan/execute 22-03" for code that had already shipped.

**Lesson for Phase 23:** the ROADMAP checkbox and SUMMARY are the only durable signal that
a plan closed. When a session ends between the last code commit and the close-out write,
git says "done" and the planning layer says "not started" — and the planning layer is what
the next session reads.
