# Deferred Items — Phase 20 (Foundation Wins & Engagement Panels)

Items observed during plan execution that are out of scope for the executing
plan (belong to a concurrently-running sibling plan's files) and were left
untouched per the Scope Boundary rule.

## From 20-02 execution

- **`lib/server/permissionFootprintView.test.ts`** — `npx tsc --noEmit` reports
  5x `TS2737: BigInt literals are not available when targeting lower than
  ES2020` (lines 11, 24, 35, 36, 37). This file is owned by plan 20-03
  (PERM-01), not 20-02 — observed while running the full-repo `tsc --noEmit`
  gate for 20-02's own files (which produced zero errors). Matches a known
  project pattern (STATE.md/MEMORY: "0n/2048n BigInt literals break ES2017
  target → use `BigInt()`"). Not fixed here — out of scope for 20-02's file
  set (`lib/server/signInRecencyView.ts`, `signInRecencyCounts.ts`,
  `DormantSignInChart.tsx` + tests).

## Staging-index hazard observed during 20-02 execution

Confirmed the known "Staging index hazard" risk in practice: `git add
lib/server/signInRecencyView.ts lib/server/signInRecencyView.test.ts` followed
by `git commit` produced a commit that also included two files from a
concurrently-running sibling plan (`lib/server/ingestFreshnessView.ts` /
`.test.ts`, plan 20-04 task 1) that were apparently pre-staged in the shared
git index by that sibling agent's own `git add` running at the same time in
the same working directory (no worktree isolation observed for this phase's
wave-1 parallel execution). No content was lost — those files are real,
correctly-built loader code for 20-04 — but the commit attribution is now
mixed (commit `c2ed73b7` carries both 20-02's and 20-04's task-1 files). A
downstream sibling commit (`62466da7`, labeled "20-04 task 1") subsequently
picked up yet other files (`permissionFootprintView.ts` /
`coordinationByProjectView.ts`, likely plan 20-03's), confirming this is a
genuine shared-index race across parallel wave-1 executors, not a one-off
mistake by this agent alone. Recorded here for the phase-level verifier /
orchestrator; not something 20-02 can retroactively fix without risking a
destructive git operation on other agents' commits.

## From 20-03 execution

- Confirmed via current frontmatter: `permissionFootprintView.ts`/`.test.ts`
  belong to plan **20-01** (PERM-01), not 20-03 (which is ISSUE-01,
  `coordinationByProjectView.ts` + the two new `issueFetchCoverageCounts`/
  `IssueFetchCoverageDonut` files). The above note's "PERM-01, likely plan
  20-03's" attribution was stale/incorrect at the time it was written.
- Before every task-commit in this run, `lib/server/permissionFootprintView.ts`
  and `lib/server/permissionFootprintView.test.ts` (the latter uncommitted-modified,
  presumably a concurrently-running 20-01 executor's WIP) showed up
  pre-staged in the shared git index alongside this plan's own files —
  reconfirming the staging-index-hazard race above. Unstaged them explicitly
  (`git restore --staged`) before each commit; never included in a 20-03 commit.
- The repo-wide `npx tsc --noEmit` gate reports 5x `TS2737: BigInt literals
  are not available when targeting lower than ES2020` in
  `permissionFootprintView.test.ts` (lines 11/24/35/36/37). Confirmed these
  are NOT introduced by any 20-03 file — `tsc --noEmit` output filtered for
  `coordinationByProjectView`/`issueFetchCoverageCounts`/
  `IssueFetchCoverageDonut` shows zero errors. Left untouched — out of scope
  for 20-03; owned by 20-01. (Note: 20-01's own execution independently fixed
  this via `BigInt()` constructor per its STATE.md decision entry.)

## From 20-02 execution (post-SUMMARY note)

- The staging-index race recurred at the *final metadata-commit* stage, not
  just at task-commit stage: `20-02-SUMMARY.md` was `git add`ed and left
  staged while this agent ran `gsd-tools query state.*`/`roadmap.*`/
  `requirements.*` commands; a concurrently-running sibling agent's own
  `docs(20-04): complete ingest freshness panel plan` commit (`8aa5f68a`)
  swept it in alongside their own `20-04-SUMMARY.md` and the shared
  STATE/ROADMAP/REQUIREMENTS diffs. No content lost or corrupted — verified
  `20-02-SUMMARY.md` is present, complete, and correctly attributed to plan
  20-02 in that commit's tree — but the commit message names only 20-04.
  Lesson for future phase-20-style parallel waves: commit (or at minimum
  `git add`) the plan SUMMARY.md immediately before running any `gsd-tools`
  state/roadmap/requirements mutation, not after — those commands and their
  eventual final `commit` call race with sibling agents' own final commits
  on the same shared STATE/ROADMAP/REQUIREMENTS files.

## From 20-05 continuation (Task 3 resume, gap-fix gate run)

- `npm test` (full suite) reports 12 failures, all in
  `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx`
  (`TypeError: Cannot read properties of undefined (reading 'useQuery')` at
  `useUsersDirectoryData.ts:110`, `trpc.accDcGraph.dataVersion.useQuery`).
  Confirmed NOT caused by this plan's gap fix (`lib/server/
  coordinationByProjectView.ts` + its test): re-ran the same file in isolation
  (`npx vitest run ".../UsersDirectoryClient.integration.test.tsx"`) and all 12
  passed cleanly — this is a test-isolation/mock-pollution issue that only
  surfaces when run inside the full suite, in a completely unrelated domain
  (users directory / accDcGraph router) with zero file overlap with
  `coordinationByProjectView.ts`. The test file itself also carries a
  pre-existing uncommitted 6-line WIP diff (`git log` shows its last real
  commit was `69e423ad`, phase 04) that predates this session and was not
  touched here. Out of scope for 20-05 per the Scope Boundary rule — left
  unfixed. Targeted gates for this plan's actual changed files (
  `coordinationByProjectView.ts`/`.test.ts`, `AccessAnalysisCharts.tsx`,
  `mainCharts.tsx`) all pass: `npx tsc --noEmit` 0 errors, targeted vitest
  38/38 + 8/8 green, `node scripts/repo-map/check.cjs` clean.
