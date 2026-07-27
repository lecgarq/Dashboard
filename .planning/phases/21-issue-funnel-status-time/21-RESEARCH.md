# Phase 21: Issue Funnel — Status & Time - Research

**Researched:** 2026-07-04
**Domain:** Repo-native (no external library research needed) — Prisma `AccIssue` aggregation
+ existing ECharts/React chart-panel registration pattern on `/access-analysis`
**Confidence:** HIGH (every claim below is grounded in direct file reads of this repo; no
external ecosystem uncertainty exists for this phase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tab placement & grouping**
- Both charts mount on the **Projects tab** (`ProjectsTabPanel.tsx`), directly below the
  `IssueFetchCoverageDonut` — preserves the roadmap's trust-precedes-metric adjacency with
  zero IA churn to the just-owner-approved 6-tab layout.
- Ordering within the tab: coverage donut first, then the issue charts (coverage precedes
  metric). Exact grid arrangement (side-by-side vs stacked) is Claude's discretion.

**Issues-by-status chart**
- **Ungrouped 8-slice donut** matching the existing `RolesPieChart`/coverage-donut pattern.
  No open-vs-closed visual grouping (that grouping would be our inference, not ACC's).
- **Local drill state** on slice click (the `RolesPieChart` `toggleDrill` pattern): expands
  a per-project count list for the clicked status. No shared cross-filter bus wiring.

**Issues-over-time timeline**
- **Plain monthly area line** (single created-count series) following the existing
  ActivityTimeline visual pattern the roadmap names.
- Affordances: **zoom brush + peak marker, no YoY** (issue history is shorter/spikier than
  activity data; YoY would compare against sparse early months).
- No status stacking — the status story lives in the donut beside it.

**Coverage caption & empty states**
- **Per-chart subtitle line** under each chart title, e.g. "Issue data covers N of M fetched
  projects — X forbidden/error", sourced live from the Phase 20 coverage loader (matches the
  `ActivityRecencyChart` scope-caption convention).
- Empty state: **"No issues for this view" + coverage context** — one line distinguishing
  "project fetched ok, genuinely zero issues" from "project forbidden/error — issue data
  unavailable". The honest distinction the coverage buckets already provide.

### Claude's Discretion
- Exact grid layout of the two charts within the Projects tab.
- Loader file naming/shape (own view module vs extending an existing issues-domain loader),
  respecting the consolidation guidance in STATE.md.
- Drill-list styling, chart spacing, tooltip content, skeleton states — following existing
  20/20.1 panel conventions.
- Subtitle exact wording (keep it one quiet line, question-stating like the 20.1-07
  activity-recency copy rewrite).

### Deferred Ideas (OUT OF SCOPE)
- Open-vs-closed dual-line "true funnel" timeline (created vs closed per month) — would need
  a verified, populated close-date field on `AccIssue`; candidate for a future issues phase
  if the field proves real.
- Status-stacked timeline variant — revisit only if the owner asks for status trend over
  time after seeing the shipped pair.
- Issues-by-type chart — already scoped to Phase 22 (ISSUE-04/05), not this phase.

**Domain boundary (from CONTEXT.md `<domain>`):** Issue *type* resolution (GUID → name) is
Phase 22, not this phase. No new data sources, no new npm dependencies, no new WebGL.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-------------------|
| ISSUE-02 | User can see issues over time (`AccIssue.createdAt` timeline, full 17,360-issue set, not just coordination subset), following the existing activity-timeline visual pattern. | `lib/server/activityTimelineView.ts`'s `date_trunc('month', ...)` raw-SQL pattern and `lib/acc/timelineCounts.ts`'s `summarizeActivityTimeline` (reusable as-is — see "Don't Hand-Roll") are the direct analogs. `AccIssue.createdAt` is verified `DateTime?` (schema.prisma:850) — nullable, must filter `IS NOT NULL` server-side. |
| ISSUE-03 | User can see issues by status (8 verified live statuses) with the existing `onSliceClick`/`activeSlice` cross-filter/drill convention, matching the current pie/donut drill pattern. | `app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts`'s `summarizeIssueCoverage` (fixed-bucket-order + honest-overflow-bucket pattern) is the direct analog for a `summarizeIssueStatus` transform. **IMPORTANT NUANCE:** CONTEXT.md's locked decision clarifies the "cross-filter/drill convention" as **local drill state** (`IssueFetchCoverageDonut.tsx`'s `toggleDrill` pattern — no `onSliceClick`/`sliceFilters` bus wiring), not `RolesPieChart`'s shared cross-filter bus. Build the component structurally identical to `IssueFetchCoverageDonut.tsx`, not `RolesPieChart.tsx`. |
</phase_requirements>

## Summary

This phase is a same-shape repeat of work already shipped twice in this milestone
(Phase 20's `IssueFetchCoverageDonut` and the pre-existing `ActivityTimelineChart`). There is
no new library, no new data source, and no new architectural pattern to invent — the job is
to correctly identify and reuse four already-proven pieces:

1. **`lib/server/activityTimelineView.ts`'s raw-SQL `date_trunc('month', ...)` groupBy** —
   the query shape for the monthly cut, minus the accds/DC-backfill UNION complexity (AccIssue
   is a single table, no merge needed).
2. **`lib/server/coordinationByProjectView.ts`'s `db.accIssue.groupBy({ by: [...], _count: {...} })`**
   — the query shape for the status cut, literally the same call with `isCoordination: true`
   removed and `status` swapped in for the `by` array.
3. **`lib/acc/timelineCounts.ts`'s `summarizeActivityTimeline`** — the exact zero-filled,
   continuous-month-axis, peak-detecting pure transform already used by the Overview tab's
   Activity timeline. Its input shape (`{projectId, month, count}`) is generic enough to reuse
   **verbatim** for the issue timeline — no new pure-transform function needed for the time
   cut, only a new *caller*.
4. **`app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts`'s `summarizeIssueCoverage`**
   — the exact fixed-bucket-order + honest-overflow pattern to clone for
   `summarizeIssueStatus` (8 known statuses instead of 4 coverage buckets), and the exact
   `filteredIssueCoverageProjects` prop (already threaded into `ProjectsTabPanel.tsx`, already
   computed in `AccessAnalysisCharts.tsx`) to reuse for both new charts' coverage captions and
   empty-state distinction — **no new coverage data plumbing required**.

**Primary recommendation:** One new loader (`lib/server/issueFunnelView.ts`, per
`.planning/research/ARCHITECTURE.md`'s naming) returning both row sets (`monthRows` +
`statusRows`) in a single `Promise.all`; one new lazy `"use server"` action
(`issueFunnelActions.ts`) gated by `auth()`, wired into `AccessAnalysisCharts.tsx`'s existing
lazy-fetch-once-per-tab-activation `useEffect` (add `tab === "projects"` as a 4th branch,
alongside the existing `roles`/`users`/`companies` branches) — **do not** add this as a 5th
eager `mainCharts.tsx` `Promise.all` entry; CONTEXT.md's locked default explicitly overrides
the older ROADMAP.md phrasing ("adding a 5th loader") that predates the 20.1-06 lazy-fetch
pattern.

## Architecture Patterns

### Recommended new/modified files (verified against `.planning/research/ARCHITECTURE.md`'s
per-candidate analysis + this session's direct source reads)

```
lib/server/
  issueFunnelView.ts          # NEW — loader: monthRows + statusRows, project-name-resolved
  issueFunnelView.test.ts      # NEW — co-located test (mock-db pattern, aggregate-bound assertion)

app/(dashboard)/access-analysis/
  issueFunnelActions.ts        # NEW — "use server" lazy action, auth()-gated, mirrors activityRecencyActions.ts
  issueFunnelCounts.ts         # NEW — pure transforms: summarizeIssueStatus (clone of summarizeIssueCoverage);
                                #        timeline cut REUSES lib/acc/timelineCounts.ts's summarizeActivityTimeline verbatim
  __tests__/issueFunnelCounts.test.ts   # NEW — pure-transform unit tests
  components/
    IssueStatusChart.tsx      # NEW — structurally = IssueFetchCoverageDonut.tsx (local drill, 8 status buckets)
    IssueTimelineChart.tsx    # NEW — structurally = ActivityTimelineChart.tsx MINUS the YoY delta line/computation
  components/ProjectsTabPanel.tsx   # MODIFIED — mount both new charts below IssueFetchCoverageDonut (already has the placeholder comment)
  components/AccessAnalysisCharts.tsx  # MODIFIED — +1 lazy fetch-once state/effect branch (tab === "projects"), +2 filtered-rows useMemo, +2 props threaded to ProjectsTabPanel
mainCharts.tsx                 # MODIFIED — +1 function-prop import + pass-through (loadIssueFunnelAction), NOT a new Promise.all entry
```

### Pattern 1: Server loader — combine two aggregate cuts in one `Promise.all`

**What:** A single `lib/server/issueFunnelView.ts` module loads both the monthly time-series
rows and the per-status rows in one `Promise.all`, resolving project names once via the
established `buildProjectNameMap`/`resolveProjectName` helpers (`lib/server/folderActivityView.ts`).

**When to use:** Exactly this phase — two related aggregate cuts over the same base table,
consumed by the same tab, fetched together.

**Example (verified query shapes, source: `activityTimelineView.ts` lines 69-98 and
`coordinationByProjectView.ts` lines 46-50):**
```typescript
// lib/server/issueFunnelView.ts
import "server-only";
import { db } from "@/server/db";
import { buildProjectNameMap, resolveProjectName } from "./folderActivityView";

interface RawMonthRow { projectId: string; month: string; count: number }

export async function loadIssueFunnel(force = false) {
  // ... TTL cache pattern (5-min, matches every sibling *View.ts) ...
  const [monthRows, statusGroups, projects, dcProjects] = await Promise.all([
    db.$queryRaw<RawMonthRow[]>`
      SELECT "projectId",
             to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
             COUNT(*)::int AS count
      FROM "AccIssue"
      WHERE "createdAt" IS NOT NULL
      GROUP BY "projectId", month
    `,
    db.accIssue.groupBy({
      by: ["projectId", "status"],
      _count: { id: true },
      // NOTE: no `where: { isCoordination: true }` — full 17,360-issue set (ISSUE-02/03 boundary)
    }),
    db.accProject.findMany({ select: { id: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = buildProjectNameMap(projects, dcProjects);
  // map monthRows/statusGroups through resolveProjectName(nameById, projectId) ...
}
```

**Nullable `createdAt` handling (VERIFY-flagged below):** `AccIssue.createdAt` is
`DateTime?` (schema.prisma:850) — the `WHERE "createdAt" IS NOT NULL` clause is required or
`date_trunc` on a null produces a null group key that `to_char` will stringify oddly. The
existing `coordinationByProjectView.ts` groupBy on `status` has no such null-date concern
(status feeds a different cut), so this WHERE clause is new to this phase specifically for
the timeline cut — the status cut does NOT need it (an issue with a null `createdAt` still
has a valid status and should still count in the donut).

### Pattern 2: Reuse `summarizeActivityTimeline` verbatim for the issue timeline (Don't Hand-Roll)

**What:** `lib/acc/timelineCounts.ts`'s `summarizeActivityTimeline(rows, selected)` takes
`ReadonlyArray<{projectId: string; month: string; count: number}>` — a shape the new
`issueFunnelView.ts`'s month rows already match. It already does: selection filtering,
per-month summing, continuous zero-filled month axis (quiet months show as real dips, not
gaps), peak detection (ties → earliest), and a `busiestYear` rollup. This is **exactly** the
"existing activity-timeline visual pattern" the roadmap requires ISSUE-02 to follow.

**When to use:** Directly, for the issue timeline. Do not write a parallel
`summarizeIssueTimeline` function — the row shape is identical and the aggregation logic has
zero issue-specific semantics baked in.

**Difference from the Activity timeline caller:** `ActivityTimelineChart.tsx` computes a
`deltaByMonth` YoY map and renders a delta line in the tooltip — CONTEXT.md's locked decision
is **no YoY** for the issue timeline (sparse early months would make YoY misleading). The new
`IssueTimelineChart.tsx` should be `ActivityTimelineChart.tsx` minus the `deltaByMonth`
`useMemo` and its tooltip lines, keeping: the zoom `dataZoom` (`inside` + `slider`), the
`markPoint` peak pin, and the `data-testid="timeline-headline"` summary line pattern.

### Pattern 3: Clone `summarizeIssueCoverage`'s bucket pattern for the status donut

**What:** `issueFetchCoverageCounts.ts`'s `summarizeIssueCoverage` establishes the exact
shape needed: a fixed-order array of known buckets (here: the 8 verified statuses, not 4
coverage statuses) that are **always present even at count 0**, plus any unexpected-status
value appended as its own honest overflow bucket (never dropped, never silently merged) —
and a `Map<status, sortedDrillRows>` for the per-status drill list.

**Example — the fixed-order constant to add (verified 8 statuses, source:
`REQUIREMENTS.md` ISSUE-03 + `STATE.md` v2.3-specific verified counts table):**
```typescript
// app/(dashboard)/access-analysis/issueFunnelCounts.ts
export const ISSUE_STATUSES = [
  "open", "closed", "completed", "in_review",
  "draft", "pending", "not_approved", "in_progress",
] as const;
```
Mirror `summarizeIssueCoverage`'s loop-over-fixed-list-then-append-unexpected-keys structure
(lines 70-83 of `issueFetchCoverageCounts.ts`) verbatim, swapping "projects per bucket" for
"issues per status, with a per-project count breakdown for the drill".

### Pattern 4: Lazy fetch-once-per-tab-activation (the 20.1-06 ref-flag pattern) — REQUIRED, not eager

**What:** `AccessAnalysisCharts.tsx` (lines 251-283) already implements this pattern three
times (activity-recency, permission-level, folder-scoped-activity): a `useState<T[] | null>`
for rows, a `useState<boolean>` for loading, a `useRef<boolean>` fetched-flag (NOT a
`rows === null` check — a no-session `null` result must not cause an infinite refetch loop on
every tab revisit), and one `useEffect` keyed on `tab` that fires the lazy `"use server"`
action at most once.

**Why this matters for Phase 21 specifically:** ROADMAP.md's Phase 21 "Depends on" clause
says Phase 20 "lets the fan-out review from Phase 20 land before adding a 5th loader" — this
sentence was written *before* Phase 20.1 introduced the lazy-fetch-once pattern and shrank the
eager fan-out from 11→9. CONTEXT.md (dated 2026-07-04, the most recent and authoritative
artifact) explicitly locks: *"Lazy fetch-once-per-page-load keyed to first Projects-tab
activation using the 20.1-06 ref-flag pattern — do not grow `mainCharts.tsx`'s eager fan-out
(9 entries)."* **Follow CONTEXT.md, not the older ROADMAP phrasing** — add the 4th lazy
branch (`tab === "projects"`) to the existing effect, do not add a 10th `mainCharts.tsx`
`Promise.all` entry.

**Example (the exact shape to add, source: `AccessAnalysisCharts.tsx` lines 251-283):**
```typescript
const [issueFunnelData, setIssueFunnelData] = useState<IssueFunnelData | null>(null);
const [issueFunnelLoading, setIssueFunnelLoading] = useState(false);
const issueFunnelFetchedRef = useRef(false);

useEffect(() => {
  // ...existing 3 branches unchanged...
  if (tab === "projects" && loadIssueFunnel && !issueFunnelFetchedRef.current) {
    issueFunnelFetchedRef.current = true;
    setIssueFunnelLoading(true);
    void loadIssueFunnel()
      .then((data) => setIssueFunnelData(data))
      .finally(() => setIssueFunnelLoading(false));
  }
}, [tab, loadActivityRecency, loadPermissionLevel, loadFolderScopedActivity, loadIssueFunnel]);
```
`mainCharts.tsx` passes `loadIssueFunnelAction` as a function prop only (no eager await),
matching `loadActivityRecencyAction`/`loadPermissionLevelAction`/`loadFolderScopedActivityAction`'s
existing wiring at lines 105-107 of `mainCharts.tsx`.

### Pattern 5: The lazy action itself — auth-gated `"use server"` delegate

**Example (verbatim shape, source: `activityRecencyActions.ts`):**
```typescript
// app/(dashboard)/access-analysis/issueFunnelActions.ts
"use server";
import { auth } from "@/server/auth";
import { loadIssueFunnel, type IssueFunnelData } from "@/lib/server/issueFunnelView";

export async function loadIssueFunnelAction(): Promise<IssueFunnelData | null> {
  const session = await auth();
  if (!session) return null;
  return loadIssueFunnel();
}
```

### Pattern 6: Coverage caption + empty-state distinction — reuse `filteredIssueCoverageProjects`, no new plumbing

**What:** `AccessAnalysisCharts.tsx` (line 300-303) already computes
`filteredIssueCoverageProjects` via `filterRowsBySelection(coordinationData?.issueCoverage?.projects ?? [], selected)`
and threads it into `ProjectsTabPanel.tsx`, which currently only feeds it to
`IssueFetchCoverageDonut`. Both new charts should receive this **same already-computed prop**
(no new data source, no new server round-trip) and call `summarizeIssueCoverage(projects)`
themselves (already exported from `issueFetchCoverageCounts.ts`) to derive:
- the caption numbers: `ok + zero_issues` count = "fetched" (regardless of whether the fetch
  found zero issues — that's still honest coverage), `forbidden + error` count = the
  "X forbidden/error" clause.
- the empty-state distinction: when the current chart has zero rows for the selection, check
  whether the selection's coverage rows are all `ok`/`zero_issues` (→ "genuinely zero issues
  for this view") vs contain `forbidden`/`error` (→ "issue data unavailable for N project(s)").

**Example (caption convention to match, verified source: `ActivityRecencyChart.tsx` line 165-168):**
```tsx
{coverage && (
  <p data-testid="issue-timeline-coverage-caption" className="mt-2 text-[10px] text-muted-foreground">
    Issue data covers {coverage.fetched} of {coverage.total} fetched projects
    {coverage.unavailable > 0 && ` — ${coverage.unavailable} forbidden/error`}
  </p>
)}
```

### Anti-Patterns to Avoid

- **Do not build the status donut on `RolesPieChart.tsx`'s `onSliceClick`/`activeSlice`/
  `sliceFilters` cross-filter-bus pattern.** CONTEXT.md's locked decision is explicit: local
  drill state only, matching `IssueFetchCoverageDonut.tsx`. This literally contradicts a
  naive reading of ROADMAP.md's success-criterion wording ("existing `onSliceClick`/
  `activeSlice` cross-filter/drill convention") — CONTEXT.md is the later, more specific,
  owner-approved artifact and must win.
- **Do not add a 10th eager `mainCharts.tsx` `Promise.all` entry.** Use the lazy-fetch-once
  pattern (Pattern 4 above).
- **Do not write a new `summarizeIssueTimeline` pure-transform function.** `summarizeActivityTimeline`
  already does exactly this, generically, and is unit-tested.
- **Do not use `db.accIssue.findMany()` for either cut.** Both cuts must be server-side
  aggregates (`groupBy` / `$queryRaw GROUP BY`) — this is the TEST-01-class OOM-guard rule
  (`CONVENTIONS.md`: "Use `$queryRaw` for GROUP BY aggregates where the result set must be
  small... Returning raw rows from large tables into the Node process causes OOM"). At
  17,360 rows `AccIssue` is not large by this repo's standards, but the phase's own success
  criterion 4 mandates the aggregate-bound test regardless — treat it as a hard rule, not a
  perf nicety.
- **Do not silently drop an unexpected `status` value.** `AccIssue.status` is
  `String?` (nullable, no enum) — mirror `coordinationByProjectView.ts`'s
  `status: g.status ?? "unknown"` null-coalesce and `summarizeIssueCoverage`'s
  append-unexpected-as-own-bucket pattern.
- **Do not add YoY to the issue timeline.** Locked decision: peak marker + zoom brush only.
- **Do not touch `/users/spatial-graph`, add WebGL, or introduce a new npm dependency.**
  Standing constraints; nothing in this phase requires any of the three.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Zero-filled continuous month axis + peak detection | A new `summarizeIssueTimeline` | `lib/acc/timelineCounts.ts`'s `summarizeActivityTimeline` (import directly) | Identical row shape (`{projectId, month, count}`), already handles selection-filtering, zero-fill, and peak/busiest-year — zero issue-specific logic needed |
| Project name resolution for AccIssue rows | A new name-lookup helper | `buildProjectNameMap`/`resolveProjectName` from `lib/server/folderActivityView.ts` | Already the shared precedent across `activityTimelineView.ts`, `coordinationByProjectView.ts`, `permissionLevelView.ts` — never falls back to a raw GUID |
| Coverage caption numbers (fetched/forbidden/error counts) | A new coverage-summary computation | `summarizeIssueCoverage` from `issueFetchCoverageCounts.ts`, called on the already-threaded `filteredIssueCoverageProjects` prop | Zero new data plumbing; the exact same summary object the coverage donut itself renders |
| Fixed-bucket-order + honest-overflow status grouping | A new ad hoc `Map`/`reduce` | Clone `summarizeIssueCoverage`'s loop-then-append-unexpected structure (lines 70-83) | Same honesty guarantee (all 8 statuses always shown, even at 0; unexpected values never dropped) already proven correct and tested |
| Lazy per-tab data fetch state machine | A new pattern | The existing 3-branch `useEffect` in `AccessAnalysisCharts.tsx` (lines 261-283) — add a 4th branch | Exact ref-flag correctness (fires once, survives no-session `null`) already solved; do not reinvent |

**Key insight:** Every piece of this phase already has a proven analog shipped in this exact
codebase within the last 48 hours of git history (Phase 20 / 20.1). The main planning risk is
not "what pattern to use" — it's correctly threading the reused pieces (loader → lazy action
→ lazy-fetch effect → tab panel → two chart components) without accidentally reintroducing
the `RolesPieChart` cross-filter-bus pattern where CONTEXT.md locks local drill state instead.

## Common Pitfalls

### Pitfall 1: Reading ROADMAP.md's "adding a 5th loader" as license to grow the eager fan-out
**What goes wrong:** A planner reads only `ROADMAP.md`'s Phase 21 "Depends on" clause and
schedules a 10th `mainCharts.tsx` `Promise.all` entry.
**Why it happens:** That sentence was written when the milestone was scoped (2026-07-02),
before Phase 20.1 (2026-07-04) introduced the lazy-fetch-once-per-tab pattern that trimmed
the fan-out 11→9 and established the convention for exactly this kind of "5th-ish" loader.
**How to avoid:** Follow `21-CONTEXT.md`'s explicit locked default (lazy fetch keyed to
first Projects-tab activation) — it is the most recent and most specific source.
**Warning signs:** A plan task that says "add `loadIssueFunnel()` to `mainCharts.tsx`'s
`Promise.all`" instead of "add `loadIssueFunnelAction` as a function prop + a `tab ===
"projects"` branch in the existing lazy-fetch `useEffect`".

### Pitfall 2: Treating "onSliceClick/activeSlice cross-filter/drill convention" (ROADMAP wording) literally
**What goes wrong:** Wiring the status donut into the shared `sliceFilters` bus (like
`RolesPieChart`), which would cross-filter the whole dashboard on an issue-status click.
**Why it happens:** ROADMAP.md's success criterion 2 uses the phrase "existing `onSliceClick`/
`activeSlice` cross-filter/drill convention" generically, referring to the *interaction feel*
(click a slice → visual pull-out/highlight → drill list opens), not literally the
`sliceFilters`-bus wiring `RolesPieChart` implements.
**How to avoid:** CONTEXT.md's Locked Decision spells this out precisely: "Local drill state
on slice click... No shared cross-filter bus wiring." Build on `IssueFetchCoverageDonut.tsx`'s
structure (local `useState<string|null>` drill), not `RolesPieChart.tsx`'s (`onSliceClick`
prop bubbling to parent `toggleSliceFilter`).
**Warning signs:** A plan task passing an `onSliceClick`/`activeSlice` prop into the new
status chart, or wiring it into `AccessAnalysisCharts.tsx`'s `sliceFilters`/`toggleSliceFilter`
state.

### Pitfall 3: Forgetting the nullable `AccIssue.createdAt` in the timeline query
**What goes wrong:** `date_trunc('month', "createdAt")` on a NULL `createdAt` groups into a
NULL bucket that `to_char` stringifies unpredictably (empty string or literal), silently
corrupting the month axis.
**Why it happens:** `coordinationByProjectView.ts`'s existing `groupBy` on `status` has no
date field and never had to handle this; it's easy to copy that query's *shape* without
copying its *lack* of a null-date guard, since it's the wrong analog for this specific
concern (the null-date issue is closer to what `activityTimelineView.ts`'s `AccActivityAccds`
rows don't have — that table's `createdAt` is non-nullable).
**How to avoid:** Add `WHERE "createdAt" IS NOT NULL` to the raw SQL for the month cut only
(the status cut does not need it — a null-`createdAt` issue can still have a valid status).
**Warning signs:** A month label like `"undefined-NaN"` or empty string appearing in the
zero-filled axis; a test fixture that doesn't include a null-`createdAt` row (add one to
`issueFunnelView.test.ts` to catch a regression here).

### Pitfall 4: Building a component test around `RolesPieChart`'s slice-click prop contract
**What goes wrong:** `IssueStatusChart.test.tsx` written expecting an `onSliceClick`/
`activeSlice` prop pair (mirroring `RolesPieChart.test.tsx`'s conventions) when the component
under test doesn't take those props at all (mirroring `IssueFetchCoverageDonut.test.tsx`
instead, which tests local drill open/close via `fireEvent.click` + `aria-expanded`).
**How to avoid:** Read `IssueFetchCoverageDonut.test.tsx` (not `RolesPieChart.test.tsx`) as
the test-shape analog before writing the new component test.

## Validation Architecture

> `workflow.nyquist_validation` is `true` per `.planning/config.json` ("Nyquist / AI
> integration gates: enabled") — this section is included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.6` |
| Config file | `vitest.config.ts` (repo root); setup `vitest.setup.ts` |
| Quick run command | `npx vitest run app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts lib/server/issueFunnelView.test.ts` |
| Full suite command | `npm test` (2392 passed / 1 skipped baseline as of Phase 20.1 close, per `STATE.md`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|--------------------|--------------|
| ISSUE-02 | Monthly `date_trunc` timeline aggregate is bounded by `n_months × n_projects`, never raw issue rows; nullable `createdAt` excluded; project names resolved via `buildProjectNameMap` (never raw GUID). | unit | `npx vitest run lib/server/issueFunnelView.test.ts` | ❌ Wave 0 |
| ISSUE-02 | `summarizeActivityTimeline` reused correctly for issue month rows (zero-fill, peak, no YoY in the chart). | unit | `npx vitest run app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts` | ❌ Wave 0 (or confirm `summarizeActivityTimeline`'s existing test at `lib/acc/__tests__/timelineCounts.test.ts` — VERIFY exact path — already covers the generic case with no new test needed for the transform itself) |
| ISSUE-02 | Timeline chart renders "No issues for this view" + coverage-aware empty state for a zero-issue project selection. | component (jsdom) | `npx vitest run app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx` | ❌ Wave 0 |
| ISSUE-03 | Status groupBy is bounded by `n_status × n_projects`, never raw issue rows; all 8 known statuses always present even at 0; unexpected status values surfaced as an honest overflow bucket. | unit | `npx vitest run lib/server/issueFunnelView.test.ts` (loader-level bound) + `npx vitest run app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts` (`summarizeIssueStatus` transform-level bucket-order/overflow) | ❌ Wave 0 |
| ISSUE-03 | Status donut click opens local per-project drill (no `sliceFilters` bus call); empty state renders for a zero-issue project selection. | component (jsdom) | `npx vitest run app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx` | ❌ Wave 0 |
| ISSUE-02/03 | `tsc --noEmit` passes with the new files/props wired end-to-end (`mainCharts.tsx` → `AccessAnalysisCharts.tsx` → `ProjectsTabPanel.tsx` → the two new components). | typecheck | `npx tsc --noEmit` | n/a (whole-tree gate) |
| ISSUE-02/03 | Full `npm test` suite stays green (2392-passed baseline + new tests, 0 regressions). | full suite | `npm test` | n/a (whole-suite gate) |

### Sampling Rate
- **Per task commit:** the quick-run command above (loader + transform tests) plus
  `npx tsc --noEmit`.
- **Per wave merge:** `npm test` (full suite).
- **Phase gate:** Full suite green + live check on `/access-analysis` Projects tab before
  `/gsd:verify-work` (see Dashboard `references/dashboard-verification-sequence.md` for the
  tiered gate sequence and `references/deploy-sequence.md` for the webpack-production-build
  preflight workaround — `next dev` is broken both ways on this machine per `STATE.md`).

### Wave 0 Gaps
- [ ] `lib/server/issueFunnelView.test.ts` — new co-located loader test (mock-db pattern per
  `coordinationByProjectView.test.ts`'s style: `vi.mock("@/server/db", ...)`, `vi.hoisted`),
  covering: (a) the aggregate-bound assertion (mock `groupBy`/`$queryRaw` to return exactly
  `n_status × n_projects` / `n_months × n_projects` rows and assert the loader's output
  length matches, plus assert `db.accIssue.findMany` is never called — the TEST-01-class
  regression-guard shape, see `lib/server/acc-hot-cache.test.ts` lines 254-325 for the exact
  template of this assertion style); (b) nullable-`createdAt` row exclusion from the month
  cut; (c) project-name resolution/"Unknown project" fallback; (d) unexpected-status
  passthrough (not dropped).
- [ ] `app/(dashboard)/access-analysis/__tests__/issueFunnelCounts.test.ts` — new pure-transform
  test for `summarizeIssueStatus` (fixed 8-bucket order, honest overflow, per-status
  project-drill sort order) and a caption/coverage-derivation helper if one is added.
- [ ] `app/(dashboard)/access-analysis/__tests__/IssueTimelineChart.test.tsx` — new component
  test (jsdom), mirroring `ActivityTimelineChart.test.tsx`'s structure minus any YoY-specific
  assertions.
- [ ] `app/(dashboard)/access-analysis/__tests__/IssueStatusChart.test.tsx` — new component
  test (jsdom), mirroring `IssueFetchCoverageDonut.test.tsx`'s structure (local drill
  open/close via `fireEvent.click` + `aria-expanded`, NOT `RolesPieChart.test.tsx`'s
  `onSliceClick`/`activeSlice` prop contract).
- [ ] VERIFY: confirm whether `lib/acc/timelineCounts.ts`'s `summarizeActivityTimeline`
  already has a dedicated test file (its barrel re-export lives at
  `app/(dashboard)/access-analysis/timelineCounts.ts`) — if a test already exercises the
  generic case, no new test is needed for the reused transform itself, only for the new
  loader/caller wiring.

*(No framework install needed — Vitest is already configured and every sibling test in
`lib/server/` and `app/(dashboard)/access-analysis/__tests__/` uses the exact conventions
above.)*

## Open Questions

1. **Exact loader file/shape: one combined `issueFunnelView.ts` vs two separate loaders?**
   - What we know: `.planning/research/ARCHITECTURE.md` recommends one combined
     `lib/server/issueFunnelView.ts` (per its "New files" list for candidate #1). CONTEXT.md
     leaves "loader file naming/shape... own view module vs extending an existing
     issues-domain loader" as Claude's discretion.
   - What's unclear: whether the planner should literally extend
     `coordinationByProjectView.ts` (adding two more additive fields, mirroring how ISSUE-01's
     `issueCoverage` field was added there) instead of a new file.
   - Recommendation: **new file** (`issueFunnelView.ts`). `coordinationByProjectView.ts`'s
     existing job is the coordination-classified subset (`isCoordination: true`) plus the
     issue-fetch-run coverage metadata — semantically distinct from "the full issue set,
     status × time cuts." Extending it further would conflate two different query
     boundaries (coordination-subset vs full-set) inside one loader's return shape, which
     the file's own header comment explicitly scopes as "coordination subset of all stored
     ACC issues, not the full issue table." A new sibling loader keeps that boundary honest
     and matches the ARCHITECTURE.md research recommendation.

2. **Does any live `AccIssue.status` value fall outside the 8 verified statuses?**
   - What we know: `REQUIREMENTS.md`/`STATE.md` cite "8 verified live statuses... verified
     live 2026-07-02." `AccIssue.status` is `String?` in schema (no enum constraint).
   - What's unclear: whether a 9th/overflow status has appeared since 2026-07-02, or whether
     `status: null` rows exist.
   - Recommendation: build the honest-overflow-bucket path regardless (near-zero extra cost,
     already the proven `summarizeIssueCoverage` pattern) and null-coalesce to `"unknown"`
     exactly like `coordinationByProjectView.ts` line 75 does — this makes the "VERIFY" moot
     by construction; the phase does not need a fresh live count to be correct.

3. **Does `AccIssue.deleted` need filtering out of either cut?**
   - What we know: `AccIssue.deleted` is `Boolean @default(false)` (schema.prisma:851). No
     existing consumer (`coordinationByProjectView.ts`, `projectClashView.ts`,
     `acc-issues-validate-clashes.cjs`) filters on it — grep across the repo found zero
     `deleted: false` usages against `AccIssue`.
   - What's unclear: whether any row currently has `deleted: true`, and whether the
     17,360-issue count already excludes or includes such rows.
   - Recommendation: mirror the existing precedent (no filter) for consistency with
     `coordinationByProjectView.ts` and the already-verified 17,360 figure — do not
     introduce a new filtering decision this phase invented alone. `VERIFY:` if a future
     phase discovers `deleted` rows are meant to be excluded account-wide, revisit all
     `AccIssue` consumers together, not just this phase's new loader.

## Sources

### Primary (HIGH confidence — direct repo file reads, this session)
- `prisma/schema.prisma` (lines 840-902) — `AccIssue`/`AccIssueFetchRun`/
  `AccIssueProjectFetchResult` model definitions, verified field nullability.
- `lib/server/activityTimelineView.ts`, `lib/acc/timelineCounts.ts`,
  `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` — timeline query +
  transform + chart pattern.
- `lib/server/coordinationByProjectView.ts` + `coordinationByProjectView.test.ts` — status
  groupBy pattern + mock-db test convention.
- `app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts` +
  `components/IssueFetchCoverageDonut.tsx` + its `__tests__` sibling — fixed-bucket +
  honest-overflow + local-drill-state pattern (the direct analog for ISSUE-03).
- `app/(dashboard)/access-analysis/components/ProjectsTabPanel.tsx` — confirms the locked
  mount point already carries a placeholder comment: "Ph21-22 issue funnel / issue-type
  charts land here in a later phase — this tab is the locked home for them."
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (lines 241-304) —
  the lazy-fetch-once-per-tab `useEffect`/ref-flag pattern and the already-computed
  `filteredIssueCoverageProjects` prop.
- `app/(dashboard)/access-analysis/activityRecencyActions.ts`,
  `lib/server/activityRecencyView.ts`, `lib/server/permissionLevelView.ts` — lazy
  `"use server"` action + loader pairing conventions.
- `app/(dashboard)/access-analysis/components/RolesTabPanel.tsx` — how a lazy-loaded panel
  with a loading skeleton is gated/threaded inside a `*TabPanel` component.
- `app/(dashboard)/access-analysis/components/ActivityRecencyChart.tsx` (lines 165-168) —
  the exact "coverage caption" convention CONTEXT.md names as the model to match.
- `app/(dashboard)/access-analysis/projectFilter.ts` — `filterRowsBySelection` (picker-only
  filtering, the locked convention for this phase per CONTEXT.md's Inferred Defaults).
- `lib/server/acc-hot-cache.test.ts` (lines 254-325) — the TEST-01-class aggregate-bound
  regression-test template (assert bounded output length + assert the raw-scan path was
  never called).
- `.planning/codebase/TESTING.md`, `.planning/codebase/CONVENTIONS.md` — Vitest/mocking
  conventions, `$queryRaw`-for-GROUP-BY rule, empty-state/skeleton conventions, zinc-theme
  ECharts rules.
- `.planning/research/ARCHITECTURE.md` (lines 127-155, 393-421) — the pre-milestone research
  pass's per-candidate analysis for "Issues over time/by status/by type," including its
  recommended file list and Wave-B build-order placement.
- `.planning/ROADMAP.md` (Phase 21 entry, lines 348-362), `.planning/REQUIREMENTS.md`
  (ISSUE-02/03 verbatim + traceability table), `.planning/STATE.md` (verified counts,
  guardrails, Phase 20/20.1 decision log), `.planning/PROJECT.md` (product constraints),
  `.planning/phases/21-issue-funnel-status-time/21-CONTEXT.md` (locked decisions, verbatim
  above).

### Secondary / Tertiary
None — no external library or ecosystem research was needed for this phase; every claim
above is grounded in direct repo evidence (Primary tier).

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no new library; 100% reuse of existing repo patterns (HIGH).
- Architecture: HIGH — every recommended file/pattern is a direct analog already shipped in
  this repo within the last 48 hours (Phase 20/20.1), read directly this session.
- Pitfalls: HIGH — Pitfalls 1/2 are grounded in an explicit textual conflict between an
  older ROADMAP.md sentence and the newer, more specific CONTEXT.md decision (both read
  directly); Pitfall 3 is grounded in the verified `DateTime?` nullability of
  `AccIssue.createdAt`; Pitfall 4 is grounded in the two different existing test files'
  structures.

**Research date:** 2026-07-04
**Valid until:** Stable — 30 days, or until Phase 22 lands (which will re-touch `AccIssue`
consumers for the type-resolution cut and should re-verify the `deleted`/null-status open
questions above at that point).

---

**Dashboard self-check:**
- Context: `.planning/STATE.md`, `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`,
  `.planning/ROADMAP.md`, `.planning/phases/21-issue-funnel-status-time/21-CONTEXT.md`,
  `.planning/codebase/{TESTING,CONVENTIONS}.md`, `.planning/research/ARCHITECTURE.md`, and
  the current diff (`git status` clean of unrelated Phase 21 changes at research time) were
  all read this session. `.claude/skills/lecg-dashboard/SKILL.md` and `./CLAUDE.md` briefing
  applied throughout.
- Scope matched: `/access-analysis`, Projects tab (`ProjectsTabPanel.tsx`) — the other three
  workshop pages (`/users`, `/template-mty`, `/forma-proposal`) are untouched by this phase.
- Exact artifacts: every path/model/function named above is verified via direct `Read`/`Grep`
  against `prisma/schema.prisma`, `lib/server/*.ts`, and
  `app/(dashboard)/access-analysis/**`. No `src/...` paths used or implied.
- Data truth: `AccIssue` (17,360 rows, verified live 2026-07-02 per STATE.md), aggregated
  server-side only; coverage authority is the existing Phase 20
  `AccIssueFetchRun`/`AccIssueProjectFetchResult` loader, reused (not re-fetched).
- UI constraints: zinc theme + resolved ECharts colors (both new components branch on
  `useTheme()`/`resolvedTheme` exactly like every sibling chart); no new WebGL; no
  card-inside-card (both charts mount as siblings inside the existing `ProjectsTabPanel`
  `PremiumSurface` wrappers, not nested).
- Boundary constraints: new loader lives in `lib/server/`, new lazy action is `"use server"`
  in the route, pure transforms carry no directive — matches `CONVENTIONS.md`'s
  Server/Client boundary rules exactly; `components/` stays Prisma-free.
- Gates selected: `npx tsc --noEmit`, targeted Vitest (loader + transform + 2 component
  tests), full `npm test`, live Projects-tab check via the webpack-production-build
  preflight (per `references/deploy-sequence.md` — `next dev` is broken on this machine).
- VERIFY: (1) whether `summarizeActivityTimeline` already has a dedicated test file to avoid
  a duplicate test; (2) whether any live `AccIssue.status`/`.deleted` value falls outside the
  documented 8-status/all-`false` assumption — both are low-risk-by-construction per the Open
  Questions section (honest-overflow-bucket + no-new-filter-decision handling covers either
  outcome without a plan change).
