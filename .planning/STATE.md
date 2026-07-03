---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
current_phase: "20.1"
current_phase_name: "Access-Analysis IA Redesign & Panel Semantics (IN PROGRESS, wave 1 of 7 plans)"
status: verifying
stopped_at: "Wave 1 of Phase 20.1 executing in parallel: 20.1-01/02/03/04 built (unmounted); 20.1-04 added FolderPermissionTerrain externalSelectedIds/hidePickers + deriveTerrainSelection derivation, 24/24 terrain-component tests green"
last_updated: "2026-07-03T22:17:23.542Z"
last_activity: 2026-07-03
last_activity_desc: "Phase 20.1 wave 1 in progress (parallel executors, no worktree isolation): 20.1-01 (ENG-01 activity-recency), 20.1-02 (PERM-01 permission-level reframe), 20.1-03 (UAT-6 folder-activity-by-company), and 20.1-04 (terrain externalSelectedIds/hidePickers + deriveTerrainSelection) all complete, all unmounted; 20.1-05/06/07 remain. Shared-git-index race caused cross-plan test-file commit-attribution mixing between 20.1-02 and 20.1-04 -- verified byte-identical/no data loss via `git show`, documented in both SUMMARY files."
progress:
  total_phases: 16
  completed_phases: 12
  total_plans: 34
  completed_plans: 31
  percent: 75
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.3 New Graphs (opened 2026-07-02) — new charts for `/access-analysis` (+ `/template-mty` where a genuine fit exists) from existing-but-unvisualized Prisma data. Phase 20 complete (2026-07-03); Phases 21-23 remain.

## Current Position

- **Milestone:** v2.3 — New Graphs (opened 2026-07-02). Scope: 8 requirements (ISSUE-01–05, PERM-01, ENG-01, PIPE-01) across 4 phases (20-23), continuing sequential phase numbering from v2.2's Phase 19. No new data sources, no new npm dependencies, no new WebGL, honest coverage labels.
- **Phase:** 20 — Foundation Wins & Engagement Panels (COMPLETE, 5/5 plans)
- **Plan:** 20-05 complete (wiring + verification; owner-approved live)
- **Status:** Phase 20 complete + verified (VERIFICATION passed). Next: route owner UAT feedback (6 new-scope items → proposed Phase 20.1 IA redesign) or plan Phase 21.
- **Last activity:** 2026-07-03 — Plan 20-05 executed: all 4 Phase 20 panels wired into `/access-analysis` (`mainCharts.tsx` fan-out 8→11); owner live-verified with functional approval ("Is good but") + 7 verbatim UAT feedback items (1 fixed in-phase, 6 routed to a follow-up phase); fixed project-picker raw-GUID leak in `coordinationByProjectView.ts`. Phase 20 (PERM-01, ENG-01, ISSUE-01, PIPE-01) is complete.

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (census below), unchanged since 2026-06-23. v2.1/v2.2 shipped on this baseline; v2.3 adds charts over it without changing the data.

## Data Extraction — Verified 2026-06-23

Confirmed read-only against the live local PostgreSQL DB.

### Census (`scripts/count-acc-data.cjs` logic, no-SSL)

| Table / metric | Count |
|----------------|-------|
| AccProject (live API) | 1,153 |
| AccDcProject (Data Connector) | 550 |
| AccFolder | 415,908 |
| AccFolder — sized (contents crawled) | 111,308 |
| AccFolder — total files | 420,096 |
| AccFolder — total size | 3.17 TB |
| AccFolderPermission | 6,040,610 |
| AccProjectMember (live) | 14,566 |
| AccDcProjectUser | 22,835 |
| AccActivity (Data Connector events) | 1,102,030 |
| AccActivityAccds (web-session crawl) | 4,554,785 |
| Distinct projects in AccActivityAccds | 956 |
| Folder-crawl status | 975 ok / 178 inaccessible (= 1,153) |
| Activity by source | project 1,101,159 / admin 871 |
| AccDcIngestRun | 72 |

### Merge integrity (`scripts/verify-accds-merge.cjs`, partitioned mode)

All 5 assertions PASS: `accds=4,554,785 dc_backfill=41,714 dc_admin=871`; unified total `4,597,370` == merged query `4,597,370`; backfill + account-admin rows kept; boundary spot-check reconciles.

> Note: `AccFolderPermission` = ~6.04M rows here (census) — the "~5M-row scan" language in code/CONCERNS predates the last folder crawl; REF-03 (shipped in v2.2) targeted whichever count was live at build time.

### v2.3-specific verified counts (research pass, 2026-07-02)

| Table / metric | Count | Source |
|-----------------|-------|--------|
| `AccFolderPermissionSummary` (materialized in v2.2 Ph18/19) | 22,082 rows | `.planning/research/ARCHITECTURE.md` |
| `AccIssue` issue-type GUIDs | 316 distinct `issueTypeId` | REQUIREMENTS.md ISSUE-04 (verified live 2026-07-02) |
| `AccIssue` issue-subtype GUIDs | 515 distinct `issueSubtypeId` | REQUIREMENTS.md ISSUE-04 (verified live 2026-07-02) |
| `AccIssue` full set (funnel scope) | 17,360 issues | REQUIREMENTS.md ISSUE-02 |
| `AccIssue.status` distinct live values | 8 (open, closed, completed, in_review, draft, pending, not_approved, in_progress) | REQUIREMENTS.md ISSUE-03 |
| `AccProjectMember`, `AccDcIngestRun`, `AccIssueFetchRun`/`AccIssueProjectFetchResult` exact row counts | `VERIFY:` not independently re-counted this pass | `.planning/research/ARCHITECTURE.md` (reasoned estimates: tens of thousands / 72 / small-per-run — all well below `AccActivityAccds` scale) |

## Accumulated Context

### Roadmap Evolution

- Phase 20.1 inserted after Phase 20: Access-Analysis IA Redesign & Panel Semantics (URGENT)

### Decisions

v2.1/v2.2 (shipped) decisions are recorded in `PROJECT.md` Key Decisions + the per-plan
SUMMARY files in `.planning/phases/09..19`. Decisions relevant to v2.3 planning:

- **v2.3 roadmap = 4 phases (20-23), not the 5-wave shape from research SUMMARY.md.**
  Research suggested 5 phases matching risk-graded waves across the original 9 candidates;
  after REQUIREMENTS.md scoped the milestone to 8 requirements (4 seeds deferred to Future
  Requirements), the roadmap folds ENG-01 (dormant users) into the foundation-wins phase
  (Phase 20) alongside ISSUE-01/PERM-01/PIPE-01 — all four are P1/LOW-risk panels that share
  no file surface except `mainCharts.tsx`/`AccessAnalysisCharts.tsx` (per ARCHITECTURE.md),
  so grouping them avoids repeated merge contention on those two files across four separate
  phases and avoids a thin single-requirement "ENG-01 only" phase (granularity guidance).
  Standalone phases are preserved for: the issue funnel (ISSUE-02/03 — new groupBy shapes),
  issue type resolution (ISSUE-04/05 — the only phase carrying external APS-call +
  Prisma-migration risk, isolated per PITFALLS.md/ARCHITECTURE.md), and a final workshop
  curation + milestone-close gate (Phase 23, zero new requirements — mandatory per
  PITFALLS.md Pitfall 7, not automatic).

- **Phase numbering continues sequentially from v2.2** (Phase 20, not reset to Phase 1) —
  consistent with how v2.1→v2.2 continued 09→19 without a milestone-scoped reset; `config.json`
  has no `phase_id_convention` key, so the default `sequential` form (`### Phase N:`) applies.

- **ISSUE-04 must land before ISSUE-05 within Phase 22** — the lookup-table backfill (external
  APS call + new Prisma model/migration) is the milestone's only genuinely risky item; it is
  planned/executed/verified as an earlier plan than the issues-by-type chart that consumes it.

- **Deferred from v2.3 scope (see REQUIREMENTS.md "Future Requirements"):** folder storage
  treemap (needs depth-cap/leaf-rollup UX design), permission tier × folder-depth heatmap
  (needs its own OOM/perf regression test against the test-pinned `folderPermQuery.ts`),
  activity verb/object-type breakdown (needs top-N/other bucketing design + must avoid the
  deferred spatial-graph-coupled `lib→app` edges), provisioned-vs-active module coverage
  (needs `products` Json → `ModuleId[]` vocabulary alignment). None of these are in Phase 20-23.

- **Guardrails carried into every v2.3 phase** (from PITFALLS.md, HIGH confidence, repo-grounded):
  never chart `AccDcIngestRun.rowsByModule` (confirmed always-zero); convert
  `AccFolderPermissionSummary.totalBytes` (BigInt) server-side before the RSC→client boundary;
  never duplicate the `AccFolderPermission` join — future heatmap-style work must import
  `loadFolderPermRows` from `lib/server/folderPermQuery.ts`, never re-derive it; never
  hardcode the historical "428/1,152" DC-coverage figure — always call a live loader; every
  new `AccActivityAccds`/`AccActivity`/`AccFolder`-scale aggregate must be server-side SQL/
  `groupBy`, never `findMany` + JS reduce (the TEST-01 OOM-guard class of regression);
  `mainCharts.tsx`'s `Promise.all` fan-out (8 entries pre-v2.3) should be reviewed for
  consolidation once 3+ new loaders share a data domain, not left to grow unbounded.

Prior (v2.1/v2.2) decisions still relevant as standing constraints:

- **QUERY-01/REF-02 shipped (2026-07-01, commit a4d923ca).** `lib/server/folderPermQuery.ts` owns the shared base `AccFolderPermission` join. Both terrain loaders (`templateFolderTerrain.ts` all-folders; `folderPermissionTerrainView.ts` l2Only) consume it via `loadFolderPermRows(projectId, { l2Only? })`. Any new consumer (e.g. a future heatmap) must import, not fork, this function.

- **REF-01 access-analysis splits shipped (2026-07-01, Phase 16).** `folderTerrain.ts` → `folderTerrainModel`/`folderTerrainLayout`/`folderTerrainScene`/`folderTerrainCamera` + thin barrel (SPLIT-01). `FolderPermissionTerrain.tsx` → `useFolderPermissionTerrainCamera` (hook) + `terrainViewModel` (pure) + `TerrainStage`/`TerrainControls` (presentational) + thin shell (SPLIT-02). All 9 files ≤ ~400 lines; pinning tests byte-identical; owner visual parity confirmed.

- **PROJ-02/PROJ-03 shipped (2026-07-02, Phase 19).** `AccFolderPermissionSummary` (22,082 rows, materialized in Ph18) is the summary-aggregate consumer's data source; the `includePermissionContexts:true` raw scan is hard-guarded behind `ACC_ALLOW_RAW_PERMISSION_SCAN=1` (throws by default); a refresh mechanism runs inside `dc-daily-ingest.cjs`'s success branch (≤1-ingest-cycle staleness, documented in INTEGRATIONS.md). This is the exact table Phase 20's permission-footprint-by-role panel reads — zero touch of the raw ~6M-row table required.

- **Behavior-preserving refactors only (v2.1/v2.2 guardrail, still binding for shared modules).** REF-01/REF-02/REF-03 characterization tests (TEST-02 `folderPermissionTerrainView.test.ts`, TEST-03 `templateFolderTerrain.sharedQuery.test.ts`, TEST-01 OOM guard) must stay byte-identical / green through v2.3 as well — any v2.3 phase touching `folderPermQuery.ts` or `acc-hot-cache.ts` inherits this guardrail.

- **Gates:** `npx tsc --noEmit` before any rebuild; deploy = rebuild + Task Scheduler
  restart on `:3000` (not a branch merge); Prisma migrations on this DB have historically
  choked on pgvector — apply via raw `ALTER` + `prisma migrate resolve` when `migrate dev`
  fails (directly relevant to Phase 22's new issue-type lookup table migration).

- **`.planning/` mid-migration:** `MILESTONES.md`/`RETROSPECTIVE.md`/`milestones/` are
  deleted in the working tree; v1.0/v2.0/v2.1/v2.2 history lives only in git HEAD. v2.3
  continues evolving PROJECT/STATE/REQUIREMENTS/ROADMAP in place (same "safe logical close"
  pattern used for v2.1 and v2.2).

- **gsd-tools `phase complete` is unreliable on this repo** — it has previously mangled
  STATE frontmatter on phase close (wrong milestone label, wrong progress numbers). **Always
  inspect and repair STATE frontmatter (milestone/status/current_phase/progress) manually
  after running it**, including during v2.3 phase closes.

- [Phase 20]: PIPE-01 (20-04): ingestFreshnessView loader has no TTL cache (unlike sibling loaders) since CONTEXT.md requires a static per-page-load read; status treated as an open string (unrecognized values map to neutral tone + raw label); 36h stale threshold, strictly-greater-than boundary. Not yet mounted -- plan 20-05 wires it into mainCharts.tsx/AccessAnalysisCharts.tsx.

- [Phase 20]: ISSUE-01 (20-03): extended `lib/server/coordinationByProjectView.ts` in place (consolidation decision, avoids growing `mainCharts.tsx`'s `Promise.all` fan-out) with an additive `issueCoverage` field — raw per-project rows from `AccIssueProjectFetchResult` for the latest `AccIssueFetchRun`, `null` when no run exists, never a raw GUID as project name. New pure transform `summarizeIssueCoverage` (`app/(dashboard)/access-analysis/issueFetchCoverageCounts.ts`) guarantees all 4 buckets (ok/zero_issues/forbidden/error) always present with zeros kept, plus an honest overflow bucket for any unexpected status string. New `IssueFetchCoverageDonut` component: click-to-drill on every bucket, in-progress caption when the latest run is running/unfinished. Not yet mounted -- plan 20-05 places it directly above Model Coordination ("coverage precedes metric").

- [Phase 20]: ENG-01 (20-02): dormant-user recency sourced from AccDcUser.lastSignIn joined via AccDcProjectUser -- NOT AccProjectMember.lastSignIn (100% NULL across 14,566 rows, dead field; AccDcProjectUser.lastSignIn equally dead 22,835/22,835). Option B deviation, pre-authorized by the orchestrator, documented in 20-02-PLAN.md objective + 20-02-SUMMARY.md. Coverage narrows to DC-covered projects (~550/1,153) -- DormantSignInChart requires a live dcCoverage prop for its scope caption, never hardcoded. Band boundaries: <30d=[0,29], 30-90d=[30,90], 90-365d=[91,365], >365d=[366+]. Null lastSignIn always lands in an explicit "Never signed in" bucket (verified lossless: sum(band counts) === rows.length). Not yet mounted -- plan 20-05 wires it into mainCharts.tsx/AccessAnalysisCharts.tsx.

- [Phase 20]: PERM-01 (20-01): permissionFootprintView loader converts AccFolderPermissionSummary.totalBytes (BigInt) to Number at the server boundary only (Pitfall 2); resolves project names via buildProjectNameMap/resolveProjectName (AccProject-over-AccDcProject) and role names via AccRole, falling back to "Unknown role"/"Unknown project". New formatBytes() helper (B/KB/MB/GB/TB, 1024-based) -- the milestone's one genuinely new formatting helper. summarizePermissionFootprint aggregates top-10 + "Other (N roles)" by totalBytes desc, with a per-role project drill map. PermissionFootprintChart uses local drill state (RolesPieChart.tsx's toggleDrill pattern), not the shared sliceFilters bus. Deviation: fixed a BigInt-literal (`n`-suffix) TS2737 error caught by tsc --noEmit -- switched to BigInt() constructor per the standing ES2017-target convention. Not yet mounted -- plan 20-05 wires it into mainCharts.tsx/AccessAnalysisCharts.tsx (after the role-related charts, before Model Coordination).

- [Phase 20]: 20-05 (wiring + verification, PLAN COMPLETE): all 4 panels mounted at their CONTEXT.md-locked positions in AccessAnalysisCharts.tsx behind optional props, picker-only selection filtering (filterRowsBySelection, mirrors the moduleSummary pattern, no sliceFilters extension); mainCharts.tsx Promise.all fan-out grew 8→11 (flat/parallel, ISSUE-01 rides the existing loadCoordinationByProject call, adds nothing new). Owner live-verified on :3100 (Turbopack dev server) and gave functional approval ("Is good but") -- no BigInt serialization error observed, all 4 panels render correctly -- conditioned on 7 verbatim change-request items, 6 of which are new product scope explicitly deferred to a follow-up phase (see 20-05-SUMMARY.md "UAT Feedback / Follow-ups" for the full list: ENG-01 semantic pivot to activity recency, permission-footprint reframe to permission-volume-by-level, terrain/Compare-tab UX consolidation, role-click scroll-jump bug, new folder-activity-by-company graph, /access-analysis tabbed-IA redesign). Item 1 (raw project-GUID leaking into the FilterBanner/ProjectPicker) was fixed in-phase: coordinationByProjectView.ts's rows now merge AccDcProject via buildProjectNameMap/resolveProjectName (pre-existing bug since commit f8f98e5f0, exposed by this plan's wiring review) -- any id in neither AccProject nor AccDcProject now renders "Unknown project", never a bare GUID. `npm test` full suite: 2329 passed / 12 failed (pre-existing, unrelated `UsersDirectoryClient.integration.test.tsx` test-isolation issue, confirmed passes in isolation, logged to deferred-items.md) / 1 skipped. Dev server on :3100 (PID from prior session) killed cleanly; production :3000 Task Scheduler service untouched throughout.
- [Phase 20.1]: PERM-01 (20.1-02): permissionLevelView.ts owns its own bounded $queryRaw GROUP BY over AccFolderPermission+AccFolder (not routed through folderPermQuery.ts, which forbids single-use additions); permType passed verbatim (no PermTier remapping); PermissionLevelChart built unmounted, stacked-bar top-10+Other by role x level, sequential red->sky color ramp; 20.1-06 mounts it replacing PermissionFootprintChart. DEVIATION (process, not code): shared git index race with concurrent wave-1 executors (no worktree isolation) caused 2 of 3 commits to include other plans' files (20.1-01 activityRecency*, 20.1-04 FolderPermissionTerrain.test.tsx additions) -- verified complete/correct, no data loss, no forbidden files touched; documented in 20.1-02-SUMMARY.md.
- [Phase 20.1]: 20.1-01 (ENG-01 activity-recency pivot): sourced recency from AccActivityAccds only (not the accds+DC-backfill union activityByActorView.ts uses); population mirrors signInRecencyView.ts's 22,835-row AccDcProjectUser population so Never active honestly dominates (~33.2% accds-covered). Loader/transform/chart built unmounted; 20.1-06 mounts it and removes DormantSignInChart.
- [Phase 20.1]: UAT-4 (20.1-04): FolderPermissionTerrain gains `externalSelectedIds`/`hidePickers` props (unmounted -- 20.1-05 wires the Compare tab to them); `deriveTerrainSelection()` pure helper implements the locked 0/1/2+ overview/single/compare derivation, and populates `selected` with best-known candidates even in the single/overview fallback branches so a later manual ModeToggle switch to compare mode keeps using externally-derived candidates. Prop absence is byte-identical to prior behavior (13 pre-existing component tests pass unmodified) + 11 new tests added. DEVIATION (process, not code, same shared-git-index race documented in 20.1-02-SUMMARY.md): Task 2's uncommitted test-file edit was absorbed into concurrent commit `5211d984` (20.1-02's own commit) rather than a dedicated commit -- verified byte-identical to intended content via `git show`, no data loss, all gates green against current HEAD; documented in 20.1-04-SUMMARY.md.
- [Phase 20.1]: 20.1-03: summarizeFolderActivityByCompany ranks UNKNOWN_COMPANY like any other slice (not pinned) -- differs from collapseCompanySlices' pinning convention, but preserves losslessness (its count survives inside the collapsed Other bucket)
- [Phase 20.1]: 20.1-03: FolderActivityByCompanyChart is the new 'Folder activity by company' graph (UAT-6), built as a two-pass bounded design (10,566-row headline aggregate + lazy per-company folder drill capped at 1,000 emails / 1,500 project ids) -- never materializes the 190,049-row company x folder cross-product. Built UNMOUNTED; plan 20.1-06 mounts it in the Companies tab.

### Blockers/Concerns

- blocking. Phase 20 shipped clean. Risk for the rest of v2.3 is concentrated and isolated
  in Phase 22 (ISSUE-04's external APS call + new Prisma migration) — tracked above and
  sequenced deliberately after the lower-risk Phase 20/21 work.

- **Deferred (non-blocking, new since 20-05):** 6 owner UAT follow-up items from the Phase 20
  live checkpoint are new product scope, not yet a planned phase — see 20-05-SUMMARY.md "UAT
  Feedback / Follow-ups" for the full verbatim list (ENG-01 semantic pivot, permission-footprint
  reframe, terrain/Compare-tab consolidation, role-click scroll-jump bug, folder-activity-by-
  company graph, /access-analysis tabbed-IA redesign). Recommend scoping via discuss-phase
  before planning further v2.3 phases, since some of these may reshape Phase 21-23's own scope.

- **Open (non-blocking, carried from v2.2):** owner visual sign-off on the Phase 17
  HybridAnalyticsSurface split (SPLIT-04) has not occurred — `/users/access-analysis`
  currently redirects to `/users/spatial-graph` and no production code mounts the surface.
  Parity was accepted on the byte-identical DOM-golden-test basis instead. Revisit if/when
  the surface gets a live, unflagged mount. Not part of v2.3 scope.

- Branch is `feat/access-analysis-redesign` with heavy uncommitted WIP + the `.planning/`
  migration deletions in the working tree. **Commit by explicit path only** (never `-A`/`.`);
  check `git diff --cached --name-only` before every commit. `.planning/config.json` is
  pre-existing WIP (research→false, tsc-only build_command) — leave it out of doc commits.

- Wave-1 20.1 parallel executors share one working directory/branch (not isolated worktrees) -- observed an index race where a concurrent executor's plain 'git commit' captured this plan's already-staged Task 1 files (content verified correct, commit 0e05cca5, also flagged independently by 20.1-02's own summary). Confirm worktree isolation for future waves.

## Next Action

**Phase 20 (Foundation Wins & Engagement Panels) is COMPLETE** — 5/5 plans, all 4 requirements
(PERM-01, ENG-01, ISSUE-01, PIPE-01) shipped and owner-approved live on `/access-analysis`.
Next: either `/gsd:plan-phase 21` (Issue Funnel — Status & Time), or first run a discuss-phase
pass to scope the 6 deferred owner UAT feedback items from 20-05 into a properly-prioritized
follow-up phase (recommended, since several are panel-semantic pivots and a page-level IA
redesign, not small tweaks) — see `.planning/phases/20-foundation-wins-engagement-panels/
20-05-SUMMARY.md` "UAT Feedback / Follow-ups" for the full verbatim list.

Prior milestone **v2.2 Structural Refactors** shipped + closed 2026-07-02 via safe-logical-close
(tagged `v2.2` local; 5/5 phases 15–19, 9/9 plans, 8/8 requirements; owner parity approved after
a fresh `:3000` rebuild). Full record: PROJECT.md Shipped Milestone section, `.planning/phases/15..19`
SUMMARY/VERIFICATION artifacts, and git history. Physical archival (MILESTONES.md / RETROSPECTIVE.md /
`milestones/`) remains intentionally DEFERRED per the `.planning/` mid-migration caveat.

Guardrails carried forward: explicit-path commits with `git diff --cached --name-only` proof,
`npx tsc --noEmit` before any rebuild, no new WebGL on data surfaces, zinc theme untouched,
`/users/spatial-graph` not touched, honest coverage labels on under-covered sources, never chart
`rowsByModule`, convert `totalBytes` BigInt server-side, never drop the null-`lastSignIn` bucket,
never render a raw issue-type GUID.

Carried-forward open item: owner visual sign-off on the Phase 17 SPLIT-04 split is still
pending (test-basis-only acceptance — no live mount) — see Blockers/Concerns above. Not part
of v2.3 scope.

---
*Last updated: 2026-07-02 — v2.3 New Graphs roadmap created (Phases 20-23). Next: plan Phase 20.*

## Session

**Last session:** 2026-07-03T22:17:23.533Z
**Stopped at:** Plan 20.1-03 executed: FolderActivityByCompanyChart (UAT-6) + loaders/actions/transform, built unmounted, all tests green
**Resume file:** None

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 20 P05 | ~35min | 3 tasks + 1 gap-fix | 6 files |
| Phase 20 P04 | 5min | 3 tasks | 6 files |
| Phase 20 P02 | 55min | 3 tasks | 6 files |
| Phase 20 P03 | 35min | 3 tasks | 6 files |
| Phase 20 P01 | 20min | 3 tasks | 6 files |
| Phase 20.1 P02 | 20min | 3 tasks | 7 files |
| Phase 20.1 P01 | 20min | 3 tasks | 7 files |
| Phase 20.1 P04 | 6min | 2 tasks | 2 files |
| Phase 20.1 P03 | 25min | 3 tasks | 7 files |
