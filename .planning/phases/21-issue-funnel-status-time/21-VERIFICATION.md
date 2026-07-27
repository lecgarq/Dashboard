---
phase: 21-issue-funnel-status-time
verified: 2026-07-06T18:00:00Z
status: passed
score: 5/5 must-haves verified (1 via explicit owner override)
behavior_unverified: 0
overrides_applied: 1
gaps: []
overrides:
  - must_have: "IssueStatusChart supports the existing onSliceClick/activeSlice cross-filter/drill convention"
    reason: "IssueStatusChart clones the immediately-adjacent Phase 20 IssueFetchCoverageDonut's local-drill-state pattern instead — a documented CONTEXT.md decision, and the owner reviewed and approved live click-to-drill behavior during the :3100 checkpoint ('Yes I like it.'). Owner explicitly chose 'Accept local drill' over 'Require cross-filter' when presented the decision on 2026-07-06."
    accepted_by: "Luis (owner)"
    accepted_at: "2026-07-06T18:30:00Z"
human_verification:
  - test: "Confirm whether ISSUE-03's onSliceClick/activeSlice cross-filter/drill wording in ROADMAP.md and REQUIREMENTS.md should be read literally (RolesPieChart's cross-filter-bus prop convention) or as satisfied by IssueStatusChart's local-drill-state pattern (matching the immediately-adjacent Phase 20 IssueFetchCoverageDonut, which also does not use onSliceClick/activeSlice)."
    expected: "Either (a) accept the local-drill implementation as intentional and add a VERIFICATION.md override, or (b) require a follow-up plan to add cross-filter-bus wiring to IssueStatusChart to literally match onSliceClick/activeSlice."
    why_human: "This is a product-intent decision about which 'existing convention' the roadmap text meant, not a code-presence question — grep confirms the code as built (local drill only), but only the product owner can decide if that satisfies the requirement as written."
    resolution: "RESOLVED 2026-07-06 — owner accepted the local-drill implementation as delivered (explicit decision, option 'Accept local drill'). No follow-up plan required for ISSUE-03."
---

# Phase 21: Issue Funnel — Status & Time Verification Report

**Phase Goal:** The full `AccIssue` set (17,360 issues, not just the coordination-classified
subset) is visualized as a timeline and status breakdown on `/access-analysis`, reusing the
trust-precedes-metric framing the Phase 20 coverage donut establishes.

**Verified:** 2026-07-06
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (ROADMAP Success Criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Issues-over-time timeline (`date_trunc('month', "createdAt")`) for the full issue set, per selected project(s), following the ActivityTimeline visual pattern, with a coverage caption sourced from the Phase 20 issue-fetch coverage loader (never hardcoded) | ✓ VERIFIED | `lib/server/issueFunnelView.ts` uses `db.$queryRaw` with `date_trunc('month', "createdAt")` GROUP BY (line 47-54), excludes null `createdAt` from the month cut only. `IssueTimelineChart.tsx` renders `deriveIssueCoverageCaption(coverageProjects)` live (no hardcoded numbers — confirmed via `grep` for `17,360`/`17360` inside production files: 0 matches, only test fixtures matched). Mounted in `ProjectsTabPanel.tsx` directly below `IssueFetchCoverageDonut`. |
| 2 | Issues-by-status chart, all 8 verified live statuses, "supporting the existing `onSliceClick`/`activeSlice` cross-filter/drill convention, matching the current pie/donut drill pattern" | ⚠️ DISCREPANCY — see Human Verification | `IssueStatusChart.tsx` was built with **local drill state only** (`useState`/`toggleDrill`, verified via direct read + `grep -n "onSliceClick\|activeSlice"` → 0 matches). This directly clones `IssueFetchCoverageDonut.tsx`'s pattern (verified: that Phase 20 component *also* uses local `useState`/`toggleDrill`, not `onSliceClick`/`activeSlice`) rather than `RolesPieChart.tsx`'s cross-filter-bus pattern (verified: `RolesPieChart.tsx` is one of 6 files in the codebase that actually implement `onSliceClick`/`activeSlice`). This was a **documented, locked decision** in `21-CONTEXT.md` ("No shared cross-filter bus wiring") made during discuss-phase, and the owner exercised click-to-drill live during the `:3100` checkpoint and approved it ("Yes I like it."). However, ROADMAP.md's Success Criterion 2 and REQUIREMENTS.md's ISSUE-03 both name the specific `onSliceClick`/`activeSlice` prop convention verbatim — that convention was not implemented. All other elements of the truth (8 statuses always shown, ranked legend, drill list, honest overflow bucket) are verified present and correct. |
| 3 | Both charts render an explicit "No issues for this view" empty state for a zero-issue project (not blank/broken) | ✓ VERIFIED | Both components render a bordered empty pane with `data-testid="issue-timeline-empty"` / `issue-status-empty` containing literal text "No issues for this view" plus an honest unavailable-vs-genuinely-zero distinction line. Confirmed via direct read of both component files and passing test assertions (`IssueTimelineChart.test.tsx` lines 63-80, `IssueStatusChart.test.tsx` lines 95-112). |
| 4 | `npm test` stays green including a new aggregate-bound Vitest test for the issue-funnel loader (output bounded by `n_status × n_projects`/`n_months × n_projects`, not raw issue rows); `npx tsc --noEmit` passes | ✓ VERIFIED | Independently re-ran both gates myself (not trusting SUMMARY): `npx tsc --noEmit` → exit 0, no output. `npm test` (full suite) → **320 passed \| 1 skipped (321 files), 2421 passed \| 1 skipped (2422 tests)** — exact match to the SUMMARY's claimed "2421 passed / 1 skipped / 0 failed." `lib/server/issueFunnelView.test.ts`'s `"bounds monthRows/statusRows to the aggregate row count, never a raw AccIssue scan"` test asserts `data.monthRows.length === 3` / `data.statusRows.length === 3` against 3 aggregate mock rows and asserts `mocks.accIssueFindMany` (the raw scan) was never called. |

**Score:** 4/5 truths cleanly verified; 1 flagged for human decision (functionally present, but a literal-text discrepancy vs. the roadmap's named convention).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `lib/server/issueFunnelView.ts` | `loadIssueFunnel()` server aggregate loader | ✓ VERIFIED | Bounded `$queryRaw` date_trunc + `groupBy` status cut, 5-min TTL cache, `buildProjectNameMap`/`resolveProjectName` for names, null-status→"unknown" coalesce. |
| `lib/server/issueFunnelView.test.ts` | Aggregate-bound Vitest test | ✓ VERIFIED | 7 test cases, all passing (ran directly, not trusting SUMMARY). |
| `app/(dashboard)/access-analysis/issueFunnelActions.ts` | Auth-gated lazy server action | ✓ VERIFIED | `auth()` gate, delegates to `loadIssueFunnel()`, returns `null` on no session. |
| `app/(dashboard)/access-analysis/issueFunnelCounts.ts` | `summarizeIssueStatus`/`deriveIssueCoverageCaption` pure transforms | ✓ VERIFIED | Fixed 8-status order + honest overflow bucket, live coverage caption math, no hardcoded figures. |
| `app/(dashboard)/access-analysis/components/IssueTimelineChart.tsx` | ISSUE-02 chart | ✓ VERIFIED | 153 lines, EChart wrapper, `useTheme` dark branching, zoom+peak, no YoY code present, live caption, empty state. |
| `app/(dashboard)/access-analysis/components/IssueStatusChart.tsx` | ISSUE-03 chart | ✓ VERIFIED (see truth #2 discrepancy) | 261 lines, 8-status donut, local drill, ranked legend, overflow color, live caption, empty state. |
| `app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx` | Mounts both charts | ✓ VERIFIED | Both mounted directly below `IssueFetchCoverageDonut`, above Model Coordination, gated on `loadIssueFunnel` prop presence with `DonutPanelSkeleton` fallback. |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | 4th lazy fetch-once branch | ✓ VERIFIED | `issueFunnelFetchedRef` ref-flag set before await, keyed `tab === "projects"`; two picker-only memos (`issueTimelineSummary`, `filteredIssueStatusRows`) using `selected` directly. |
| `app/(dashboard)/access-analysis/mainCharts.tsx` | `loadIssueFunnelAction` as function prop, `Promise.all` unchanged | ✓ VERIFIED | Read directly: exactly 9 entries in the eager `Promise.all` array; `loadIssueFunnel={loadIssueFunnelAction}` passed as a prop, not awaited eagerly. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `issueFunnelView.ts` | `AccIssue` table | `date_trunc('month', ...)` GROUP BY + `groupBy` status | ✓ WIRED | Confirmed via direct read; both are bounded server-side aggregates, no `findMany`+reduce over `AccIssue` (the two `findMany` calls present are on `accProject`/`accDcProject` for name resolution, not the issue table). |
| `issueFunnelView.ts` | `folderActivityView.ts` | `buildProjectNameMap`/`resolveProjectName` import | ✓ WIRED | Import confirmed at line 3. |
| `mainCharts.tsx` | `issueFunnelActions.ts` | function-prop import | ✓ WIRED | `import { loadIssueFunnelAction } from "./issueFunnelActions"`; passed at `loadIssueFunnel={loadIssueFunnelAction}`. |
| `AccessAnalysisCharts.tsx` | `loadIssueFunnel` prop | lazy `useEffect` keyed `tab === "projects"` | ✓ WIRED | Confirmed lines 291-299; ref-flag set before await. |
| `ProjectsTabPanel.tsx` | `IssueTimelineChart.tsx` + `IssueStatusChart.tsx` | JSX mount between coverage donut and Model Coordination | ✓ WIRED | Confirmed via direct read of `ProjectsTabPanel.tsx`. |
| `IssueStatusChart.tsx` | `issueFunnelCounts.ts` | `summarizeIssueStatus`/`deriveIssueCoverageCaption` import | ✓ WIRED | Confirmed at import lines 6-10. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `IssueTimelineChart` | `summary` (via `summarizeActivityTimeline(issueFunnelData?.monthRows, selected)`) | `loadIssueFunnelAction()` → `loadIssueFunnel()` → live `$queryRaw` over `AccIssue` | Yes — real DB aggregate, not static | ✓ FLOWING |
| `IssueStatusChart` | `rows` (via `filterRowsBySelection(issueFunnelData?.statusRows, selected)`) | Same loader, `groupBy` status cut | Yes | ✓ FLOWING |
| Coverage captions on both | `coverageProjects` → `filteredIssueCoverageProjects` | Existing Phase 20 `coordinationByProjectView.ts` issue-coverage loader (unchanged, reused) | Yes — live, no hardcoded coverage figures found anywhere in production files (`grep` for "17,360"/"17360" and literal percentage strings returned zero production-file matches) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| tsc gate | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Full test suite (run once, not trusted from SUMMARY) | `npm test` | 320 files passed / 1 skipped (321); 2421 tests passed / 1 skipped (2422); 0 failed | ✓ PASS — exact match to SUMMARY claim |
| Targeted issue-funnel test files | `npx vitest run` on 5 issue-funnel test files | 60 + 41 tests passed (ran in two batches; vitest deduped a combined-glob run, re-ran the 5th file alone to confirm) | ✓ PASS |
| Lazy-fetch-once-per-tab pin | `grep -n loadIssueFunnel` in `AccessAnalysisCharts.test.tsx` | Test case `"does not call loadIssueFunnel on initial (Overview) render"` + fetch-once-on-Projects-tab assertions present and passing | ✓ PASS |
| No cross-filter bus in IssueStatusChart | `grep -n "onSliceClick\|activeSlice" IssueStatusChart.tsx` | 0 matches | Confirms the CONTEXT.md-locked decision was followed exactly — see truth #2 discrepancy above |
| Scope boundary — `/users/spatial-graph` untouched | `git diff 1e59e4c8..HEAD --name-only` | Only phase-21 `app/(dashboard)/access-analysis/*`, `lib/server/issueFunnelView.*`, and `.planning/*` files listed; no `spatial-graph` path present | ✓ PASS |
| No new npm dependency | `git diff 1e59e4c8..HEAD -- package.json` | Empty diff | ✓ PASS |
| No new WebGL on this surface | `grep` for `three`/`react-three`/`WebGL` in the two new components | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| ISSUE-02 | 21-01, 21-02, 21-03, 21-04 | Issues-over-time timeline, full 17,360-issue set, ActivityTimeline visual pattern | ✓ SATISFIED | Server aggregate + chart + mount all verified above. |
| ISSUE-03 | 21-01, 21-02, 21-03, 21-04 | Issues-by-status chart, 8 statuses, existing `onSliceClick`/`activeSlice` cross-filter/drill convention | ? NEEDS HUMAN | Chart, 8-status coverage, and drill functionality all verified present and correct; the *specific* named convention (`onSliceClick`/`activeSlice`) was deliberately not implemented in favor of the adjacent Phase 20 donut's local-drill pattern. Marked `Complete` in REQUIREMENTS.md — this verification does not dispute the functional delivery, but flags the literal-text mismatch for an explicit owner decision. |

No orphaned requirements found — REQUIREMENTS.md maps only ISSUE-02/ISSUE-03 to Phase 21, and both appear in every plan's `requirements:` frontmatter field.

### Anti-Patterns Found

None found in the phase's changed production files. Checked `IssueStatusChart.tsx`, `IssueTimelineChart.tsx`, `issueFunnelView.ts`, `issueFunnelCounts.ts`, `issueFunnelActions.ts` for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"coming soon"/"not yet implemented" — zero matches. No hardcoded coverage figures in production code (only in test fixture literals, which is expected and correct). No `findMany`+reduce over `AccIssue` (both cuts are bounded server-side aggregates).

### Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `.planning/ROADMAP.md` (Phase 21 entry), `.planning/REQUIREMENTS.md` (ISSUE-02/03), all 4 PLAN.md + SUMMARY.md files, `21-CONTEXT.md` read directly. No stale/missing artifacts.
- **Scope matched:** `/access-analysis` Projects tab, confirmed via `ProjectsTabPanel.tsx` mount and `git diff 1e59e4c8..HEAD --name-only`. `/users/spatial-graph` confirmed untouched.
- **Exact artifacts:** every path, export, and test file claimed was independently opened/grepped, not assumed from SUMMARY prose.
- **Repo roots:** no generic `src/...` paths anywhere in the phase's changed files — all under `app/(dashboard)/access-analysis/` and `lib/server/`.
- **Data truth:** both charts source live server-side aggregates over `AccIssue` (17,360-row full set, no `isCoordination` filter); coverage captions computed live from Phase 20's issue-fetch coverage loader — zero hardcoded coverage figures found in production code.
- **UI constraints:** zinc theme via `useTheme`/`resolvedTheme` branching in both new components (matches sibling-chart convention); ECharts colors are resolved hex constants with dark/light branching, not raw Tailwind slate/blue; no card-inside-card drift (both mount as single `PremiumSurface` panels); no new WebGL.
- **Boundary constraints:** components do not reach into Prisma directly — all DB access is in `lib/server/issueFunnelView.ts`; no expansion of route-owned shared logic.
- **Gates:** `npx tsc --noEmit` (re-run myself, exit 0) and full `npm test` (re-run myself, 2421/1/0 — exact match) both independently confirmed, not trusted from SUMMARY alone.

## Human Verification Required

### 1. ISSUE-03 cross-filter convention — literal wording vs. delivered pattern

**Test:** Read `21-CONTEXT.md`'s "Issues-by-status chart" decision block (locked "local drill state... no shared cross-filter bus wiring") alongside ROADMAP.md Phase 21 Success Criterion 2 and REQUIREMENTS.md's ISSUE-03 text (both name `onSliceClick`/`activeSlice` verbatim). Decide whether the delivered `IssueStatusChart.tsx` (local-drill-only, matching the immediately-adjacent Phase 20 `IssueFetchCoverageDonut` pattern) satisfies the requirement, or whether a follow-up plan should add `onSliceClick`/`activeSlice` cross-filter-bus wiring (the `RolesPieChart.tsx` pattern) to `IssueStatusChart.tsx`.

**Expected:** Either an explicit override recorded (accepting the local-drill delivery as intentional, since the owner already reviewed and approved live click-to-drill behavior during the `:3100` checkpoint) or a scoped follow-up task before this requirement is considered fully closed to the letter of the roadmap.

**Why human:** This is a product-intent call about which "existing... convention" the roadmap text refers to (there are two valid precedents in the codebase — `RolesPieChart`'s cross-filter bus and `IssueFetchCoverageDonut`'s local-drill, and the latter is the more recently-established, directly-adjacent pattern in the same tab). Grep/code inspection can only confirm what was built, not which reading of the requirement text the owner intends to hold as authoritative.

**This looks intentional.** To accept this deviation, add to VERIFICATION.md frontmatter:

```yaml
overrides:
  - must_have: "IssueStatusChart supports the existing onSliceClick/activeSlice cross-filter/drill convention"
    reason: "IssueStatusChart clones the immediately-adjacent Phase 20 IssueFetchCoverageDonut's local-drill-state pattern instead — a documented CONTEXT.md decision, and the owner reviewed and approved live click-to-drill behavior during the :3100 checkpoint ('Yes I like it.'). Cross-filtering to other charts was never demonstrated or requested during the checkpoint."
    accepted_by: "<owner name>"
    accepted_at: "<ISO timestamp>"
```

### Gaps Summary

No hard blockers. All artifacts exist, are substantive, are wired, and carry real live data. Both gates (`tsc`, `npm test`) were independently re-run by this verifier and match the SUMMARY's claims exactly. The one open item is a **discrepancy between the roadmap's literal success-criterion wording and the delivered implementation** for ISSUE-03's drill convention — functionally present (click-to-drill works, all 8 statuses shown, honest overflow), but not via the specific `onSliceClick`/`activeSlice` prop convention the roadmap names. This was a disclosed, deliberate planning decision (not a hidden shortcut) and was exercised live by the owner during the approved `:3100` checkpoint, but REQUIREMENTS.md was marked "Complete" without an explicit acknowledgment of this textual deviation. Routing to human decision per the escalation-gate pattern rather than silently passing or hard-failing.

---

_Verified: 2026-07-06_
_Verifier: Claude (gsd-verifier)_
