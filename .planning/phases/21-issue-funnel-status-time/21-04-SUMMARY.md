---
phase: 21-issue-funnel-status-time
plan: 04
subsystem: ui
tags: [react, next, echarts, vitest, tsc]

requires:
  - phase: 21-issue-funnel-status-time (plan 21-01)
    provides: "lib/server/issueFunnelView.ts loadIssueFunnel() + issueFunnelActions.ts loadIssueFunnelAction() — monthRows/statusRows aggregates"
  - phase: 21-issue-funnel-status-time (plan 21-02)
    provides: "app/(dashboard)/access-analysis/issueFunnelCounts.ts — summarizeIssueStatus, deriveIssueCoverageCaption"
  - phase: 21-issue-funnel-status-time (plan 21-03)
    provides: "IssueTimelineChart.tsx + IssueStatusChart.tsx — unmounted presentational components"
provides:
  - "Both charts mounted live on the Projects tab of /access-analysis, directly below IssueFetchCoverageDonut"
  - "4th lazy fetch-once-per-tab branch in AccessAnalysisCharts.tsx (tab === \"projects\"), ref-flag gated"
  - "Pinned Vitest shell test for the lazy fetch-once behavior"
affects: [22-issue-type-resolution]

tech-stack:
  added: []
  patterns:
    - "loadIssueFunnelAction threaded as a function prop from mainCharts.tsx (Promise.all fan-out unchanged at 9 entries)"
    - "4th lazy per-tab useEffect branch mirrors the existing activityRecency/permissionLevel/folderScopedActivity ref-flag shape"
    - "Picker-only filtering (selected, not sliceFilteredProjectIds) for both issue-funnel memos"

key-files:
  created: []
  modified:
    - "app/(dashboard)/access-analysis/mainCharts.tsx"
    - "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx"
    - "app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx"
    - "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"

key-decisions:
  - "Both panels mounted as two full-width stacked Reveal > PremiumSurface panels between IssueFetchCoverageDonut and Model Coordination, matching the Projects tab's existing flex flex-col gap-6 rhythm — Phase 22's issues-by-type chart can append as a third sibling with zero redesign"
  - "Picker-only filtering locked: issueTimelineSummary/filteredIssueStatusRows use `selected` directly, never sliceFilteredProjectIds"

patterns-established: []

requirements-completed: [ISSUE-02, ISSUE-03]

duration: ~20min (execution) + checkpoint wait
completed: 2026-07-06
status: complete
---

# Phase 21 Plan 04: Issue Funnel Wiring + Owner Checkpoint Summary

**ISSUE-02/ISSUE-03 are now live on the /access-analysis Projects tab — a monthly issue-creation timeline and an 8-status donut, both lazily fetched once per page load and owner-approved on a `:3100` production-build preflight.**

## Performance

- **Duration:** ~20 min execution (Tasks 1-3) + checkpoint wait for owner review
- **Tasks:** 4/4 complete (3 auto tasks + 1 checkpoint, APPROVED)
- **Files modified:** 4 (all pre-existing, no new files)

## Accomplishments

- `mainCharts.tsx`: imported and passed `loadIssueFunnelAction` as a function prop to `AccessAnalysisCharts` alongside the existing lazy per-tab actions. The eager `Promise.all` fan-out stays at exactly 9 entries — the issue-funnel loader rides the lazy per-tab path only.
- `AccessAnalysisCharts.tsx`: added the 4th lazy fetch-once branch (`issueFunnelData`/`issueFunnelLoading`/`issueFunnelFetchedRef`) inside the existing per-tab `useEffect`, keyed `tab === "projects"`, ref set before the await so a no-session null never refetches. Added two picker-only memos (`issueTimelineSummary` via `summarizeActivityTimeline`, `filteredIssueStatusRows` via `filterRowsBySelection`) using `selected` directly (not `sliceFilteredProjectIds`), threaded to `ProjectsTabPanel`.
- `ProjectsTabPanel.tsx`: mounted `IssueTimelineChart` and `IssueStatusChart` as two stacked panels directly between the `IssueFetchCoverageDonut` block and Model Coordination, each gated on `loadIssueFunnel` presence with a `DonutPanelSkeleton` while loading, `SectionHeader` copy stating the underlying question ("When are issues actually being raised?" / "Where does the issue pile sit right now?").
- `__tests__/AccessAnalysisCharts.test.tsx`: added a mirrored lazy-fetch-once test case — mounts the shell with a `loadIssueFunnel` mock, `fireEvent.mouseDown`s the Projects tab trigger, asserts the mock fires exactly once, switches away and back, asserts still exactly once (ref-flag pin).
- Full gate sweep: `npx tsc --noEmit` clean; `npm test` full suite 2421 passed / 1 skipped / 0 failed (grew from the 2392 baseline with this phase's new tests, zero regressions); scope diff confirmed exactly the 4 planned files changed; `Promise.all` fan-out re-verified at 9; no new npm dependency; `/users/spatial-graph` untouched.
- Owner live checkpoint on the `:3100` production-build preflight (isolated `.next-uat-21` dist, `next build --webpack` then `next start` on `:3100`, `:3000` never touched) — **APPROVED** ("Yes I like it").

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread lazy loader through mainCharts + AccessAnalysisCharts** - `ec2941f0` (feat)
2. **Task 2: Mount both charts in ProjectsTabPanel + pin lazy-fetch test** - `b7ebd006` (feat)
3. **Task 3: Full gate sweep** - verification-only, no commit (tsc clean; npm test 2421 passed / 1 skipped / 0 failed; scope diff = exactly the 4 planned files; Promise.all still 9; no new deps)
4. **Task 4: Owner live checkpoint** - APPROVED, no code commit (checkpoint gate only)

_This SUMMARY + STATE/ROADMAP/REQUIREMENTS updates are committed as the standard final docs commit._

## Files Created/Modified

- `app/(dashboard)/access-analysis/mainCharts.tsx` - `loadIssueFunnelAction` import + function-prop pass-through; fan-out comment block gained one sentence noting the Phase 21 loader rides the lazy per-tab path
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` - 4th lazy branch (state/ref/effect), two picker-only memos, threaded props to `ProjectsTabPanel`
- `app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx` - two mounted panels replacing the Ph21-22 placeholder comment, gated on prop presence with skeleton fallback
- `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx` - new lazy fetch-once-per-tab test case for the Projects tab, mirroring the existing Roles/Users/Companies pattern

## Verification Evidence

- **Type gate:** `npx tsc --noEmit` -> exit 0, no output.
- **Test gate:** `npm test` -> 2421 passed / 1 skipped / 0 failed (baseline was 2392 passed / 1 skipped per STATE.md; growth accounts for this phase's new component/loader/transform/shell tests across 21-01 through 21-04, zero regressions).
- **Scope proof:** `git log --oneline` for `ec2941f0`/`b7ebd006` + `git diff --cached --name-only` per commit confirmed only the 4 planned files changed per task; no stray staging from the branch's heavy uncommitted WIP.
- **Fan-out check:** `Promise.all` in `mainCharts.tsx` still has exactly 9 entries (verified by direct read).
- **No-cross-filter-bus check:** `grep -rn "onSliceClick\|activeSlice" app/(dashboard)/access-analysis/components/IssueStatusChart.tsx` -> no matches (carried over from 21-03, re-verified this plan since the file was not touched).
- **Dependency check:** `package.json` diff -> no new dependency added.
- **Scope boundary:** `/users/spatial-graph` untouched — confirmed via scope diff (only the 4 access-analysis files listed above changed).

## Owner Checkpoint (Task 4)

- **Preflight:** `next build --webpack` to isolated dist `.next-uat-21` (never the live `.next` while `:3000` was running), then `next start` on `:3100` (PID 47364). `/access-analysis` confirmed 200 before presenting to the owner.
- **Owner response:** "approved" — the owner viewed the Projects tab live on `:3100`, exercised the timeline (hover/zoom/peak pin), the status donut (all 8 statuses, click-to-drill, no raw GUIDs), narrowed the picker to zero-issue and forbidden/error projects to confirm honest empty states, and confirmed zinc theme + no refetch flash on tab-switch. Verbatim response: **"Yes I like it."**
- **Background-serve blip:** an earlier attempt to background-launch the `:3100` preflight server hit an exit-127 (command-not-found) blip during setup; recovered by re-running the `next build`/`next start` sequence directly in foreground/tracked-background mode, which succeeded cleanly (PID 47364, confirmed bound to `:3100` via `Get-NetTCPConnection`). No impact on the final approved build — the blip was in the launch mechanism, not the build artifact.
- **Post-checkpoint cleanup:** `:3100` preflight server (PID 47364) stopped cleanly after owner approval (`Stop-Process -Force`, confirmed port released). `:3000` (PID 56060, Task Scheduler production service) was never touched throughout the entire plan — confirmed still running independently after the preflight teardown.

## Dashboard Evidence

- **Workshop surface:** `/access-analysis`, Projects tab. This is the plan where ISSUE-02/ISSUE-03 become user-visible — the presenter can now show the full issue picture (volume over time + current status mix) directly beneath the `IssueFetchCoverageDonut` that frames how trustworthy the picture is, matching the phase's "coverage precedes metric" convention.
- **UI guardrails:** zinc dark theme preserved (no new theme surfaces introduced this plan — both charts already resolved theme colors in 21-03); `DonutPanelSkeleton` loading convention reused (not a bespoke skeleton); restrained motion (no new transitions, existing EChart animation durations only); no new WebGL; two full-width stacked panels match the Projects tab's existing `flex flex-col gap-6` rhythm, leaving room for Phase 22's issues-by-type chart as a third sibling with zero redesign.
- **Scope guardrails:** `/users/spatial-graph` untouched; no changes to any file outside the 4 planned files; no new npm dependency.

## Data Truthfulness

- **Data sources:** both charts consume `loadIssueFunnelAction()`'s output (`lib/server/issueFunnelView.ts`, full 17,360-row `AccIssue` set, server-side `groupBy`/`date_trunc` aggregates from 21-01), filtered client-side by the global project picker (`selected`) via `summarizeActivityTimeline`/`filterRowsBySelection` — never `sliceFilteredProjectIds`, per the locked picker-only decision.
- **Coverage labeling:** both panels render `deriveIssueCoverageCaption`'s live coverage subtitle (from 21-02) — zero hardcoded coverage figures. Honest empty states distinguish "unavailable" (forbidden/error) from "genuinely zero" (zero_issues), verified live by the owner during the checkpoint.
- **No fake data:** no invented fixtures, routes, env vars, or data authority introduced this plan; the new shell test uses a literal mock matching the verified `IssueFunnelData` shape.

## Decisions Made

- Picker-only filtering is locked for both issue-funnel memos (`selected`, not `sliceFilteredProjectIds`) — matches the plan's explicit instruction and is documented inline in `AccessAnalysisCharts.tsx` since the Overview timeline two memos up deliberately differs.
- Panel layout: two full-width stacked `Reveal > PremiumSurface variant="base"` panels (not side-by-side), so Phase 22's issues-by-type chart can append as a third sibling with zero redesign — resolved per the plan's "layout discretion" note.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1-3 matched the plan's file list, interfaces, and verification commands verbatim. Task 4's checkpoint completed with owner approval and no requested code changes to this plan's deliverables (the issue funnel itself had no issues raised).

## UAT Feedback / Follow-ups (NOT this plan's scope)

During the same `:3100` UAT session, the owner raised 3 change requests — all scoped to the **Overview tab**, not the Projects-tab issue funnel this plan delivers. These are new-scope/gap-closure items for a future plan/phase, not conditions on this plan's completion (the issue funnel itself was approved with no changes requested):

1. **NEW Overview chart request:** count of module access grants per module for selected projects ("provisioned modules"). Maps to the already-deferred "provisioned-vs-active module coverage" seed in `REQUIREMENTS.md` Future Requirements / `STATE.md`'s deferred list — needs `products` Json → `ModuleId[]` vocabulary alignment before it can be built (deferred for that reason, not new information this session).
2. **DATA BUG suspicion:** "Activity by module" allocation looks wrong — the owner suspects many activities are attributed to modules they aren't actually from. This matches a known, already-diagnosed suspect: module attribution ignores `AccActivity.service` (only ~40.7% populated); a prior diagnosis (June, `project_activity_service_field.md`) found ~966 Model Coordination activities were likely Build misattribution. Not fixed this plan — flagged here for a future data-correctness plan, not addressed by any Phase 21 file.
3. **NEW Overview panel request:** "Activity share by project" donut (top-N + Other, click-to-drill) — additive; the existing Top-projects-by-activity chart stays unchanged.

None of these three items touch any file this plan modified (`mainCharts.tsx`, `AccessAnalysisCharts.tsx`, `ProjectsTabPanel.tsx`, the shell test) or any Overview-tab file. Recording them here per the owner's session context so they aren't lost before the next phase's discussion/planning step.

## Issues Encountered

None beyond the launch-mechanism blip noted in "Owner Checkpoint" above (exit-127 on the initial background-serve attempt, recovered without touching the build artifact).

## User Setup Required

None — no external service configuration required.

## Dashboard Self-Check

- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed (zinc theme, resolved ECharts colors, honest coverage labels, no new WebGL, `/users/spatial-graph` untouched)
- [x] Data coverage is truthful and labeled (live `deriveIssueCoverageCaption` caption, no hardcoded figures)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked
- [x] Claims backed by command output (tsc/npm test/git log/grep/PowerShell process checks above) or marked `VERIFY:` (none needed this plan)
- [x] `:3000` (production Task Scheduler service, PID 56060) confirmed untouched and independently running throughout, including after `:3100` preflight teardown

## Next Phase Readiness

- **Phase 21 (Issue Funnel — Status & Time) is COMPLETE — 4/4 plans.** Both `ISSUE-02` and `ISSUE-03` are shipped, mounted, and owner-approved live on `/access-analysis`'s Projects tab.
- **Next:** Phase 22 (Issue Type Resolution — ISSUE-04/ISSUE-05), per `ROADMAP.md`. Before planning Phase 22, surface the 3 Overview-tab UAT follow-up items above (module-access-grants chart, activity-by-module data-bug investigation, activity-share-by-project donut) for scoping — they are new/deferred scope, not Phase 21 defects, and do not block Phase 22's start.
- No blockers carried forward from this plan specifically.

---
*Phase: 21-issue-funnel-status-time*
*Completed: 2026-07-06*

## Self-Check: PASSED

Both task commit hashes (`ec2941f0`, `b7ebd006`) verified present via `git log --oneline --all | grep`. All 4 modified files verified present via direct read during plan execution (no new files created this plan). `:3100` preflight server (PID 47364) verified stopped and port released; `:3000` (PID 56060) verified still running independently.
