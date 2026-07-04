# Phase 21: Issue Funnel — Status & Time - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Two new charts on `/access-analysis` over the full `AccIssue` set (17,360 issues, not
just the coordination-classified subset): an issues-over-time monthly timeline
(ISSUE-02) and an issues-by-status breakdown (ISSUE-03), reusing the
trust-precedes-metric coverage framing established by the Phase 20 issue-fetch
coverage donut. Issue *type* resolution (GUID → name) is Phase 22, not this phase.
No new data sources, no new npm dependencies, no new WebGL.

</domain>

<evidence>
## Grounding Sources

- `.planning/ROADMAP.md` Phase 21 entry — goal, ISSUE-02/ISSUE-03 mapping, 4 success
  criteria (monthly `date_trunc` timeline w/ live coverage caption, 8-status chart with
  drill convention, explicit empty states, aggregate-bound Vitest test + `tsc` gate).
- `.planning/REQUIREMENTS.md` — ISSUE-02/ISSUE-03 verbatim; 8 verified live statuses
  (open, closed, completed, in_review, draft, pending, not_approved, in_progress);
  17,360-issue full set (verified live 2026-07-02).
- `.planning/STATE.md` — Phase 20/20.1 complete; carried guardrails (server-side
  aggregates only, never hardcode coverage figures, explicit-path commits, `tsc` before
  rebuild); 20.1-06 lazy fetch-once-per-tab-activation pattern; `mainCharts.tsx` eager
  `Promise.all` fan-out currently 9 entries.
- Source: `app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx` mounts
  `IssueFetchCoverageDonut` (verified via Grep) — the roadmap's "beside the coverage
  donut" placement resolves to this tab in the post-20.1 6-tab IA.
- Source: `AccessAnalysisCharts.tsx` is the thin shell (state + picker + Tabs root)
  with 6 sibling `*TabPanel` components (20.1-05 split).
- VERIFY: exact existing ActivityTimeline component/loader file names and its
  zoom/peak implementation details (researcher should read
  `activityTimelineView.ts` and the timeline chart component before planning).
- VERIFY: whether `AccIssue` has a usable closed/updated date field — irrelevant to
  the locked chart forms (created-only timeline) but worth noting if found.

</evidence>

<defaults>
## Inferred Dashboard Defaults

- Server-side SQL/`groupBy` aggregates only: `date_trunc('month', "createdAt")` for the
  timeline; status × project for the breakdown. Never `findMany` + JS reduce
  (TEST-01 OOM-guard class). Output row counts bounded by `n_months × n_projects` /
  `n_status × n_projects` — pinned by the required aggregate-bound Vitest test.
- Coverage caption sourced live from the Phase 20 issue-fetch coverage loader
  (`coordinationByProjectView.ts`'s `issueCoverage` + `summarizeIssueCoverage`) —
  never a hardcoded figure.
- Lazy fetch-once-per-page-load keyed to first Projects-tab activation using the
  20.1-06 ref-flag pattern — do not grow `mainCharts.tsx`'s eager fan-out (9 entries).
- ECharts via `@/components/ui/EChart`, zinc theme, theme-resolved colors.
- Project names resolved via `buildProjectNameMap`/`resolveProjectName`
  (AccProject-over-AccDcProject, "Unknown project" fallback) — never a raw GUID
  (20.1-07 lesson; applies to any per-project drill list).
- Picker-only project filtering (the 20-05 `filterRowsBySelection` pattern); no
  `sliceFilters` bus extension.
- Statuses are plain strings, shown verbatim (all 8), with an honest overflow
  handling path if an unexpected status string ever appears (mirror
  `summarizeIssueCoverage`'s overflow-bucket convention).

</defaults>

<decisions>
## Implementation Decisions

### Tab placement & grouping
- Both charts mount on the **Projects tab** (`ProjectsTabPanel.tsx`), directly below
  the `IssueFetchCoverageDonut` — preserves the roadmap's trust-precedes-metric
  adjacency with zero IA churn to the just-owner-approved 6-tab layout.
- Ordering within the tab: coverage donut first, then the issue charts (coverage
  precedes metric). Exact grid arrangement (side-by-side vs stacked) is Claude's
  discretion.

### Issues-by-status chart
- **Ungrouped 8-slice donut** matching the existing `RolesPieChart`/coverage-donut
  pattern. No open-vs-closed visual grouping (that grouping would be our inference,
  not ACC's).
- **Local drill state** on slice click (the `RolesPieChart` `toggleDrill` pattern):
  expands a per-project count list for the clicked status. No shared cross-filter
  bus wiring.

### Issues-over-time timeline
- **Plain monthly area line** (single created-count series) following the existing
  ActivityTimeline visual pattern the roadmap names.
- Affordances: **zoom brush + peak marker, no YoY** (issue history is
  shorter/spikier than activity data; YoY would compare against sparse early months).
- No status stacking — the status story lives in the donut beside it.

### Coverage caption & empty states
- **Per-chart subtitle line** under each chart title, e.g. "Issue data covers N of M
  fetched projects — X forbidden/error", sourced live from the Phase 20 coverage
  loader (matches the ActivityRecencyChart scope-caption convention).
- Empty state: **"No issues for this view" + coverage context** — one line
  distinguishing "project fetched ok, genuinely zero issues" from "project
  forbidden/error — issue data unavailable". The honest distinction the coverage
  buckets already provide.

### Claude's Discretion
- Exact grid layout of the two charts within the Projects tab.
- Loader file naming/shape (own view module vs extending an existing issues-domain
  loader), respecting the consolidation guidance in STATE.md.
- Drill-list styling, chart spacing, tooltip content, skeleton states — following
  existing 20/20.1 panel conventions.
- Subtitle exact wording (keep it one quiet line, question-stating like the
  20.1-07 activity-recency copy rewrite).

</decisions>

<specifics>
## Specific Ideas

- The status donut and timeline should read as one "Issues" block under the coverage
  donut — the coverage donut frames trust for both.
- Copy should state the underlying question where reasonable (the 20.1-07 lesson:
  subtitles that explain *why you'd look at this*, not just the mechanics).

</specifics>

<workshop>
## Workshop Impact

- Surface: `/access-analysis`, Projects tab.
- The presenter can now show the full issue picture — volume over time and current
  status mix — immediately beneath the coverage donut that says how trustworthy that
  picture is, without any raw GUIDs or hardcoded coverage figures.
- Phase 22 (issues-by-type) will later join this same block, so the layout should
  leave room for a third chart without redesign.

</workshop>

<data_truth>
## Data Truthfulness

- Source: `AccIssue` (17,360 rows), aggregated server-side. Timeline on
  `createdAt`; status breakdown on `status` (8 verified live values).
- Coverage authority: latest `AccIssueFetchRun`/`AccIssueProjectFetchResult` via the
  existing Phase 20 loader — per-chart live caption, never hardcoded.
- Under-coverage labeled honestly: forbidden/error projects are called out in both
  the subtitle and the zero-issue empty state (unavailable ≠ zero).
- No new ingestion; charts visualize already-extracted data only.

</data_truth>

<deferred>
## Deferred Ideas

- Open-vs-closed dual-line "true funnel" timeline (created vs closed per month) —
  would need a verified, populated close-date field on `AccIssue`; candidate for a
  future issues phase if the field proves real.
- Status-stacked timeline variant — revisit only if the owner asks for status trend
  over time after seeing the shipped pair.
- Issues-by-type chart — already scoped to Phase 22 (ISSUE-04/05), not this phase.

</deferred>

<verification>
## Verification Expectations

- `npx tsc --noEmit` before any rebuild.
- New aggregate-bound Vitest test for the issue-funnel loader (output bounded by
  `n_status × n_projects` / `n_months × n_projects`, never raw issue rows) — required
  by roadmap success criterion 4; full `npm test` stays green (2392-passed baseline).
- Live check of both charts on the Projects tab: zinc theme, resolved colors,
  coverage subtitles showing live numbers, empty state for a zero-issue project,
  local drill open/close, no raw GUIDs anywhere.
- Dev-server caveat: `next dev` is broken both ways on this machine (webpack 500s,
  turbopack corrupts CSS) — live verification uses a webpack **production** build to
  an isolated dist + `next start` (the 20.1 preflight pattern); `:3000` untouched.
- No new WebGL on `/access-analysis`; `/users/spatial-graph` untouched; explicit-path
  commits with `git diff --cached --name-only` proof (heavy WIP on this branch).

</verification>

---

*Phase: 21-issue-funnel-status-time*
*Context gathered: 2026-07-04*
