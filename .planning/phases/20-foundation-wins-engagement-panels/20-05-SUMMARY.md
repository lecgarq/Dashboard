---
phase: 20-foundation-wins-engagement-panels
plan: 05
subsystem: ui
tags: [nextjs, react, trpc, prisma, echarts, access-analysis]

requires:
  - phase: 20-foundation-wins-engagement-panels
    provides: "PermissionFootprintChart (20-01), DormantSignInChart (20-02), IssueFetchCoverageDonut (20-03), IngestFreshnessPanel (20-04) + their server loaders"
provides:
  - "All four Phase 20 panels wired live on /access-analysis at CONTEXT.md's locked insertion points"
  - "11-entry parallel Promise.all fan-out in mainCharts.tsx (was 8)"
  - "Project-picker/FilterBanner universe no longer leaks raw project GUIDs for coordination-only or DC-only projects"
  - "Owner-recorded UAT feedback (7 items) routed to a follow-up phase, not implemented here"
affects: [access-analysis, foundation-wins-engagement-panels-followup]

tech-stack:
  added: []
  patterns:
    - "Picker-only project-selection filtering for new panels (filterRowsBySelection, no sliceFilters extension) — mirrors the existing moduleSummary pattern"
    - "Server-boundary BigInt->Number conversion at the loader layer, never crossing the RSC->client boundary as BigInt"
    - "buildProjectNameMap/resolveProjectName (AccProject authoritative, AccDcProject fallback, 'Unknown project' honest floor) now applied uniformly across folderActivityView, permissionFootprintView, and coordinationByProjectView"

key-files:
  created: []
  modified:
    - app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
    - app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx
    - app/(dashboard)/access-analysis/mainCharts.tsx
    - app/(dashboard)/access-analysis/page.test.tsx
    - lib/server/coordinationByProjectView.ts
    - lib/server/coordinationByProjectView.test.ts

key-decisions:
  - "Owner functionally approved the live page load ('Is good but') — no BigInt serialization error, all 4 panels render at their locked positions; approval is conditional on 7 follow-up change requests, which are new scope routed to a future phase, not implemented in this plan."
  - "Fixed the project-picker raw-GUID gap (owner feedback item 1) in-phase because it is a genuine regression-adjacent correctness issue surfaced by this plan's wiring: coordinationByProjectView.ts's rows (which feed the FilterBanner/ProjectPicker universe via coordinationData.rows) built its name map from AccProject alone and fell back to the bare projectId — inconsistent with the already-established honest 'Unknown project' floor in folderActivityView.ts/permissionFootprintView.ts. Fix: merge AccDcProject into the name map via the existing buildProjectNameMap/resolveProjectName helpers (AccProject wins on conflict); any id in neither source now renders 'Unknown project', never a bare GUID."
  - "Feedback items 2-7 (sign-in vs activity recency semantics, permission-volume-by-level reframing, terrain search-bar/tab consolidation, role-click scroll jump, new folder-activity-by-company graph, whole-page tab reorganization) are NOT implemented — they are new product scope, explicitly deferred to a follow-up phase per resume instructions."

requirements-completed: [PERM-01, ENG-01, ISSUE-01, PIPE-01]

duration: ~35min (continuation session; full plan across both sessions ~1h)
completed: 2026-07-03
---

# Phase 20 Plan 05: Wire Phase 20 Panels into /access-analysis Summary

**Wired PermissionFootprintChart, DormantSignInChart, IssueFetchCoverageDonut, and IngestFreshnessPanel into the live `/access-analysis` page (8→11-entry parallel loader fan-out), owner-verified live with no BigInt serialization error, plus an in-phase fix removing raw-GUID leakage from the project picker.**

## Performance

- **Duration (this continuation session):** ~35 min
- **Started:** 2026-07-03T~09:40 (prior session) / continuation resumed and completed 2026-07-03T10:11-06:00
- **Completed:** 2026-07-03T10:11:17-06:00
- **Tasks:** 3/3 (Task 1 mount panels, Task 2 wire fan-out + gates, Task 3 live checkpoint — all complete)
- **Files modified:** 6 (2 in this continuation's gap-fix commit; 4 from the prior session's Task 1/2 commits)

## Accomplishments
- Four Phase 20 panels (PERM-01, ENG-01, ISSUE-01, PIPE-01) are live on `/access-analysis` at their CONTEXT.md-locked positions: Dormant users (donut grid, after Role distribution), Permission footprint by role (full-width, after the donut grid), Issue data coverage (directly above Model Coordination), Ingest freshness (bottom strip).
- `mainCharts.tsx`'s `Promise.all` fan-out grew from 8 to 11 entries, staying flat/parallel (no waterfall), under the ~12-entry PITFALLS.md warning threshold.
- Owner performed the live-page checkpoint and gave functional approval ("Is good but") with 7 verbatim change-request items for a follow-up phase.
- Fixed a genuine project-picker data-truthfulness gap: coordination-only/DC-only projects were showing their raw internal GUID instead of a name in the FilterBanner/ProjectPicker.

## Task Commits

Each task was committed atomically:

1. **Task 1: mount the four panels in AccessAnalysisCharts.tsx with selection filtering** - `3851be38` (feat)
2. **Task 2: wire mainCharts.tsx fan-out (8→11) + full gate sequence** - `185d73d2` (feat)
3. **Task 3: live page-load verification checkpoint** - human-verify checkpoint, owner approved with feedback (no separate commit; verification-only task)
4. **Gap fix (post-checkpoint, resume instructions item 4): project-picker raw-GUID leak** - `6c99d170` (fix)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` - mounts the 4 panels behind optional props with picker-only selection filtering (3 `useMemo`s), no changes to existing sliceFilters/StatStrip wiring
- `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx` - asserts the 4 new sections render when props supplied, and that page behavior is unchanged (no crash, no new sections) when props absent
- `app/(dashboard)/access-analysis/mainCharts.tsx` - imports and appends `loadPermissionFootprint`, `loadSignInRecency`, `loadIngestFreshness` to the existing parallel `Promise.all` (8→11), with a documenting comment on the count/consolidation decision
- `app/(dashboard)/access-analysis/page.test.tsx` - updated to reflect the 11-entry fan-out
- `lib/server/coordinationByProjectView.ts` - merges `AccDcProject` into the coordination-rows name map via `buildProjectNameMap`/`resolveProjectName`; drops the `?? g.projectId` raw-GUID fallback in favor of the honest "Unknown project" floor
- `lib/server/coordinationByProjectView.test.ts` - 3 new targeted tests: AccDcProject fallback resolves a real name, no-name-anywhere renders "Unknown project" (never the GUID), AccProject wins over AccDcProject on id conflict (8/8 tests green)

## Verification Evidence
- **Type/build gate:** `npx tsc --noEmit` -> 0 errors (both after Task 1/2 in the prior session and after the gap fix in this session)
- **Targeted tests/source checks:**
  - `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"` -> pass (prior session)
  - `npx vitest run "lib/server/coordinationByProjectView.test.ts"` -> 8/8 pass (this session, after gap fix)
  - `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx" "lib/server/coordinationByProjectView.test.ts" "lib/server/permissionFootprintView.test.ts"` -> 38/38 pass combined (this session)
- **Full suite:** `npm test` -> 2329 passed / 12 failed / 1 skipped. All 12 failures are in `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` (unrelated domain — `trpc.accDcGraph.dataVersion.useQuery` mock issue), confirmed pre-existing and NOT caused by this plan's changes: re-running that single test file in isolation passes all 12/12. Logged in `deferred-items.md` per Scope Boundary rule (out of scope, zero file overlap with this plan's changed files).
- **TEST-01/02/03 characterization files:** `git diff --name-only -- lib/server/__tests__/ lib/server/acc-hot-cache.test.ts` -> empty (untouched)
- **Repo-map check:** `node scripts/repo-map/check.cjs` -> "Repo-map quality gate passed" (2 pre-existing dependency-cruiser warnings, 278 ast-grep findings checked against baseline, no new blocking rules)
- **Scope check:** `git diff --name-only 3851be38~1 6c99d170` -> exactly the 6 files listed above; `/users/spatial-graph` untouched (`git diff --name-only ... -- "app/(dashboard)/users/spatial-graph"` empty)

## Dashboard Evidence
- **Workshop surface:** `/access-analysis`
- **Workshop impact:** Owner can now see permission reach by role (with human-readable byte formatting, no BigInt crash), dormant/never-signed-in users, honest issue-fetch coverage framing Model Coordination, and account-wide ingest freshness — all four foundation-wins requirements are demo-visible. The project picker no longer leaks raw internal GUIDs, which was actively confusing the owner during his own verification pass.
- **UI guardrails:** Zinc theme preserved (no new PremiumSurface variants introduced beyond existing conventions); no new WebGL; panels use existing `Reveal`/`PremiumSurface`/`SectionHeader` conventions with no card-inside-card nesting.
- **Scope guardrails:** `/users/spatial-graph` untouched (verified above); `folderPermQuery.ts`/`acc-hot-cache.ts` untouched (verified above).

## Data Truthfulness
- **Data sources:** `AccFolderPermissionSummary` (permission footprint, materialized since v2.2), sign-in recency view (dormant users), `AccIssueFetchRun`/`AccIssueProjectFetchResult` (issue coverage), Data Connector ingest run table (freshness). All verified via `lib/server/*View.ts` source reads this session and prior plans' SUMMARYs.
- **Coverage limits:** Ingest freshness stays account-global (not project-filtered) with its own caption, per plan design. Issue coverage's 4 buckets (ok/zero_issues/forbidden/error) are shown honestly, not collapsed.
- **No fake data:** No invented fixtures, routes, or env vars. The gap fix specifically REMOVES a dishonest fallback (raw GUID) in favor of an honest "Unknown project" label when no name source has the id — strictly improves data truthfulness, does not hide anything that was previously visible in a more honest form.

## Decisions Made
- Recorded above in frontmatter `key-decisions`: (1) owner functional approval with follow-up feedback is treated as checkpoint success, not failure; (2) the project-picker GUID leak was fixed in-phase as a genuine correctness gap; (3) all other UAT feedback items are new scope, explicitly not implemented here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, per explicit resume instruction] Project-picker raw-GUID fallback in `coordinationByProjectView.ts`**
- **Found during:** Task 3 checkpoint — owner's live verification surfaced "many projects under the search bar show the project ID instead of the actual name."
- **Issue:** `loadCoordinationByProject`'s `rows` (which feed the `ProjectPicker`/`FilterBanner` universe via `coordinationData.rows` in `AccessAnalysisCharts.tsx`) built their project-name map from `AccProject` alone and fell back to the raw `projectId` GUID when a name was missing — pre-existing since commit `f8f98e5f0` (2026-06-05), but exposed as an in-phase gap by this plan's wiring review.
- **Fix:** Widened the name lookup to merge `AccDcProject` via the already-established `buildProjectNameMap`/`resolveProjectName` helpers from `folderActivityView.ts` (`AccProject` wins on id conflict). Any id present in neither source now renders "Unknown project" — the same honest floor already used elsewhere in the codebase — never a bare GUID.
- **Files modified:** `lib/server/coordinationByProjectView.ts`, `lib/server/coordinationByProjectView.test.ts`
- **Verification:** `npx tsc --noEmit` 0 errors; `npx vitest run "lib/server/coordinationByProjectView.test.ts"` 8/8 pass (3 new targeted tests added); `node scripts/repo-map/check.cjs` clean; `git diff --cached --name-only` confirmed only these 2 files staged.
- **Committed in:** `6c99d170`

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug fix per explicit resume instruction)
**Impact on plan:** Necessary correctness/data-truthfulness fix directly requested by resume instructions as a blocking condition before closing the plan. No scope creep — the other 6 owner feedback items were explicitly NOT implemented.

## Issues Encountered
- `npm test` full-suite run showed 12 pre-existing failures in an unrelated test file (`UsersDirectoryClient.integration.test.tsx`, users domain, `trpc.accDcGraph.dataVersion` mock). Confirmed unrelated (passes in isolation, zero file overlap) and logged to `deferred-items.md` rather than fixed, per Scope Boundary rule.
- Dev server process from the prior session (PID 60252, port 3100) was still running at continuation start; killed cleanly via `taskkill //PID 60252 //F` before any further work. Production `:3000` Task Scheduler service (PID 56060) was confirmed untouched throughout.

## UAT Feedback / Follow-ups

Owner verdict on Task 3's live checkpoint: **"Is good but"** — functional approval (all 4 panels render at their locked positions, no BigInt serialization error observed) WITH 7 verbatim change-request items, routed to a follow-up phase per resume instructions (NOT implemented in this plan):

1. Many projects under the search bar show the project ID instead of the actual name. **[FIXED in this plan — see Deviations above.]**
2. Prefers "activity recency by role" instead of sign-in recency (ENG-01 panel semantic change).
3. Permission footprint by role: doesn't care about folder byte sizes — wants permission VOLUMES by level ("which role has the most admin permissions out of all").
4. Folder permission terrain: dislikes its separate search bar — wants a single "Compare" tab cross-referenced with the main search bar.
5. Clicking a role scrolls/jumps the filter to the very top — confusing.
6. New graph request: folder activity by company.
7. Wants `/access-analysis` reorganized into themed tabs (roles, users, projects, companies, ...) for storytelling — current layout "is all over the place."

Items 2-7 are new product scope (panel semantics, new graphs, page-level IA redesign) and are explicitly out of scope for this plan; the orchestrator is routing them to a follow-up phase.

## User Setup Required

None - no external service configuration required.

## Dashboard Self-Check
- [x] Exact repo paths used; no invented `src/...` paths
- [x] Relevant Dashboard skill/project instructions followed (zinc theme, no new WebGL, `/users/spatial-graph` out of scope, Prisma DB as analytics source)
- [x] Data coverage is truthful and labeled (gap fix strictly improves honesty; ingest freshness stays account-global with its caption; issue coverage shows all 4 buckets)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked (verified via `git diff --name-only` scope checks above)
- [x] Claims backed by command output, source evidence, or marked `VERIFY:` (all verification commands run and output recorded above)

## Next Phase Readiness
- Phase 20 (Foundation Wins & Engagement Panels) is functionally complete and owner-approved for its 4 requirements (PERM-01, ENG-01, ISSUE-01, PIPE-01).
- 6 of the 7 owner UAT feedback items are new scope for a follow-up phase covering: ENG-01 semantic pivot (activity vs sign-in recency), permission-footprint reframing (byte volume → permission-level volume), terrain/Compare-tab UX consolidation, role-click scroll-jump bug, a new folder-activity-by-company graph, and a broader `/access-analysis` tabbed-IA redesign. Recommend a dedicated discuss-phase pass to scope and prioritize these before planning.
- No blockers for closing this plan.

## Self-Check: PASSED

All 6 modified/created files verified present on disk; all 3 commits (`3851be38`, `185d73d2`, `6c99d170`) verified present in `git log --oneline --all`.

---
*Phase: 20-foundation-wins-engagement-panels*
*Completed: 2026-07-03*
