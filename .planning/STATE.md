---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: New Graphs
current_phase: 23
current_phase_name: Workshop Curation & Milestone Close
status: active
stopped_at: Phase 23 plan 23-02 complete (panel curation + owner review checklist) — 23-panel inventory recounted (Roles=6, not 5), zero-diff curation PASS, 23-REVIEW-CHECKLIST.md written. Next: 23-03 (owner review).
last_updated: "2026-07-14T00:00:00.000Z"
last_activity: 2026-07-14
last_activity_desc: Phase 23 plan 23-02 (panel curation recount + owner review checklist) executed — 23-panel inventory confirmed from source, no within-tab reorder warranted, 23-REVIEW-CHECKLIST.md committed (e70d3850). tsc clean, access-analysis Vitest suite 520/520 green.
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 28
  completed_plans: 25
  percent: 89
current_plan: 23-03
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.3 New Graphs (opened 2026-07-02) — Phases 20, 20.1, 21, 21.1, and 22 are ALL complete (8/8 requirements delivered). **Only Phase 23 (Workshop Curation & Milestone Close) remains.**

## Current Position

- **Milestone:** v2.3 — New Graphs (opened 2026-07-02). Scope: 8 requirements (ISSUE-01–05, PERM-01, ENG-01, PIPE-01) across 4 phases (20-23), continuing sequential phase numbering from v2.2's Phase 19. No new data sources, no new npm dependencies, no new WebGL, honest coverage labels.
- **Phase:** 20 — Foundation Wins & Engagement Panels (COMPLETE, 5/5 plans). Phase 20.1 — Access-Analysis IA Redesign & Panel Semantics (INSERTED, **COMPLETE, 7/7 plans**). Phase 21 — Issue Funnel — Status & Time (**COMPLETE, 4/4 plans**). Phase 21.1 — Overview Tab UAT Follow-ups (INSERTED, **COMPLETE, 4/4 plans, owner-approved live**). Phase 22 — Issue Type Resolution (**COMPLETE, 3/3 plans — closed 2026-07-14 on live-`:3000` evidence, see caveat below**). Phase 23 — Workshop Curation & Milestone Close (**IN PROGRESS, 2/5 plans**).
- **Plan:** 23-02 complete (docs-only, 1 commit `e70d3850`): recounted the live `/access-analysis` panel inventory from source — **23 panels, not 22** (`23-CONTEXT.md`'s own table under-counted the Roles tab; "Folder Activity by Role" is a distinct `PremiumSurface` mount, not part of the folder-action heatmap below it). Ruled zero-diff on the within-tab lead-panel curation question (every tab already leads with its strongest panel — no reorder performed, matching `23-RESEARCH.md` §A's finding). Wrote `23-REVIEW-CHECKLIST.md` — the graded-depth owner sign-off checklist covering all 4 workshop pages, every caveat cited to a real source `file:line` honesty label, `Issues by type` flagged as the zero-UAT panel. `npx tsc --noEmit` clean; `npm test -- "app/(dashboard)/access-analysis"` 61 files/520 tests green. See `23-02-SUMMARY.md`.
- **Next:** **Phase 23 plan 23-03** — the live owner graph-by-graph review session, walking `23-REVIEW-CHECKLIST.md` on the rebuilt `:3000` (23-01) and filling in its Verdict column.
- **Status:** All 8 v2.3 requirements (ISSUE-01–05, PERM-01, ENG-01, PIPE-01) delivered. Milestone is feature-complete; only the curation + close gate remains. `:3000` serves the current tree (23-01) and now has a corrected 23-panel review checklist ready for owner sign-off (23-02).
- **Last activity:** 2026-07-14 — Phase 23 plan 23-02 (panel curation recount + owner review checklist) executed.

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
- Phase 21.1 inserted after Phase 21: Overview tab UAT follow-ups (URGENT)

### Decisions

v2.1/v2.2 (shipped) decisions are recorded in `PROJECT.md` Key Decisions and git history.
Only active-milestone phase artifacts remain on disk. Decisions relevant to v2.3 planning:

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

- **Phase numbering continues sequentially from v2.2** (Phase 20, numbering not reset) —
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

- **Planning retention:** completed v1.0-v2.2 phase and milestone artifacts were removed from
  the working tree during the repository cleanup; tags and git history remain authoritative.
  v2.3 continues evolving PROJECT/STATE/REQUIREMENTS/ROADMAP in place, with only its active
  phase artifacts retained under `.planning/phases/`.

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
- [Phase 20.1]: 20.1-05 (tab-IA shell split, UAT-7/UAT-4): AccessAnalysisCharts.tsx (722L) split into a thin shell (state + picker/FilterBanner + Tabs root, ~452L) + SectionHeaders.tsx + 6 presentational *TabPanel siblings (Overview/Roles/Users/Companies/Projects/Compare); all 11 pre-existing panels relocated intact with zero semantic changes. Compare tab mounts FolderPermissionTerrain with externalSelectedIds/hidePickers (20.1-04 props); TerrainReveal deleted, Radix TabsContent's unmount-by-default is the new lazy-mount gate. mainCharts.tsx untouched (11-entry Promise.all fan-out unchanged until 20.1-06). RECORDED ASSUMPTION surfaced for 20.1-07 owner checkpoint: the global picker defaults to ALL projects selected, so Compare's first paint derives compare-mode over the top-6-staffed intersection, not the all-folders overview -- that only shows once the user actively clears the selection. DEVIATION: Radix Tabs.Trigger activates on onMouseDown not onClick (verified in @radix-ui/react-tabs source) -- test suite (33 migrated + 6 new cases) uses fireEvent.mouseDown; @testing-library/user-event is NOT installed (no-new-deps), so the plan's suggested userEvent.click pattern was swapped for the repo's existing fireEvent convention. page.test.tsx's roles-donut route test also fixed (broken by the shell rewrite, same mouseDown pattern). Full access-analysis module scope green: 51 files / 432 tests.
- [Phase 20.1]: 20.1-06 (panel-semantic swaps mount, UAT-2/3/6/7): PermissionLevelChart + ActivityRecencyChart mounted on Roles tab replacing PermissionFootprintChart; new per-membership activity-recency detail DataTable on Users tab replacing DormantSignInChart; FolderActivityByCompanyChart mounted on Companies tab (UAT-6). mainCharts.tsx eager Promise.all trimmed 11->9 (STATE.md fan-out review resolved); the 3 new loaders (activityRecency/permissionLevel/folderScopedActivity) ride lazy fetch-once-per-page-load effects gated by ref flags (not a rows-null check, to avoid infinite refetch on a no-session null result) keyed to first Roles/Users/Companies tab activation. Deleted DormantSignInChart/PermissionFootprintChart/signInRecencyView/permissionFootprintView + their tests (zero remaining importers, grep-verified); formatBytes retained per locked decision. npm test full suite: 2386 passed/1 skipped/0 failed (the previously-known 12 UsersDirectoryClient.integration failures did not reproduce this run).
- [Phase 20.1]: 20.1-07 (FINAL plan, UAT-5 + owner gap-closure, COMPLETE): Tasks 1-2 (prior session) measured a real ~384px scroll jump (self-inflicted legend cross-filter collapse + drill-list mounting above it) via a live-browser Playwright spec (jsdom can't reproduce -- IntersectionObserver stubbed), fixed with a `legendMinHeight` ratchet (never shrinks) + reordering the drill-down list to render AFTER the legend. Task 3 owner UAT re-check response ("approved but...") surfaced 4 gap-closure items, all closed: (1) Activity-recency panel subtitles (Roles-tab `ActivityRecencyChart` + Users-tab "Activity recency detail" table) rewritten to state the underlying question (who's actually working vs. holding unused access) instead of just the banding mechanics -- copy-only; (2+3) `PermissionLevelChart`/`FolderActivityByCompanyChart` "Other" buckets now expand in place (local `expanded` state re-invokes the same `summarize*(rows, topN)` with `topN=rows.length`, zero new loader/fetch -- reuses `RolesPieChart`'s pre-existing Others-expand pattern) instead of dead-ending, with a collapse-back link that rank-checks whether an in-flight drill survives the collapse; (4) diagnosed the project-GUID leak in the global picker to THREE loaders feeding `projectOptions()` (`accessInstanceView.ts` roleRows -- first-priority source, `moduleActivityView.ts` moduleRows, `activityTimelineView.ts` timelineRows), each querying only `AccDcProject` and falling back to the raw `projectId` string -- all three now use `buildProjectNameMap`/`resolveProjectName` (AccProject-over-AccDcProject, "Unknown project" fallback), matching `coordinationByProjectView.ts`/`permissionLevelView.ts`'s pre-existing correct pattern. `accessInstanceView.ts`'s `RawDc` gained an optional `liveProjects` field (backward-compatible with existing DC-only test fixtures). Playwright re-run hit the pre-existing/already-deferred `next dev --webpack` 500s-every-request infra bug (`deferred-items.md`) -- confirmed unrelated to this plan's changes via direct `curl`, not fixed (out of scope, already recommended for a future infra phase). npm test full suite: 2392 passed/1 skipped/0 failed (6 new tests, 0 regressions vs. the 2386 baseline). Dev server on :3100 restarted clean with `--turbopack` (the working option) for the owner's ongoing quick re-check; production :3000 untouched throughout. Phase 20.1 (all 6 owner UAT items across 20.1-05/06/07) is now fully closed.
- [Phase 21]: 21-01 (issue funnel server data layer, COMPLETE): loadIssueFunnel() aggregates the full 17,360-row AccIssue set (no isCoordination filter) into a monthly date_trunc timeline cut + status groupBy cut in one Promise.all/5-min-TTL cache, mirroring coordinationByProjectView.ts's shape exactly; null createdAt excluded from the month cut (would corrupt the month key) but still counted in the status cut; null status coalesced to "unknown"; project names resolved via buildProjectNameMap/resolveProjectName (never a raw GUID). issueFunnelActions.ts mirrors activityRecencyActions.ts verbatim (auth-gate + delegate); client wiring deferred to plan 21-04 per CONTEXT.md locked decision to avoid growing mainCharts.tsx's eager Promise.all fan-out. Continuation session: prior executor died on an API error after committing Task 1 (fc66c90b, verified correct) but before Task 2 -- this session verified Task 1 then completed Task 2 (b2d39428) with no rework.
- [Phase 21]: 21-02 (issue funnel status transforms, COMPLETE): `app/(dashboard)/access-analysis/issueFunnelCounts.ts` clones `issueFetchCoverageCounts.ts`'s fixed-bucket + honest-overflow pattern over the 8 verified live statuses (not 4 coverage buckets); `summarizeIssueStatus` always emits all 8 in fixed order (zeros kept), appends any unexpected status string as its own bucket (never dropped/merged), labels are the raw status string verbatim (no prettifying, no open/closed grouping -- CONTEXT.md locked), per-status drill rows sorted count desc then project name, with a defensive per-(projectId,status) count merge. `deriveIssueCoverageCaption` computes fetched (ok+zero_issues)/total/unavailable from live `IssueCoverageInputRow[]` -- zero hardcoded figures. Built against a LOCAL structural `IssueStatusInputRow` type (not imported from `lib/server/issueFunnelView.ts`) per the plan's wave-1-parallelism note, avoiding any cross-plan file dependency. Unmounted -- plan 21-03 builds the chart component consuming these exports, plan 21-04 wires it in. 7/7 new Vitest cases green, tsc clean, no deviations.
- [Phase 21]: 21-03 (issue funnel chart components, COMPLETE): `IssueTimelineChart.tsx` clones `ActivityTimelineChart.tsx`'s EChart smooth-area-line/dataZoom/markPoint structure, removing the `deltaByMonth`/YoY tooltip line and `dataFloor`/floor-caption entirely (locked no-YoY decision -- issue history is shorter/spikier than activity data), amber `#f59e0b` accent (distinct from the activity timeline's sky `#38bdf8`) so the two timelines aren't confused across tabs, plus a live `deriveIssueCoverageCaption` subtitle and a coverage-aware empty state (unavailable-vs-genuinely-zero distinction). `IssueStatusChart.tsx` clones `IssueFetchCoverageDonut.tsx`'s local-drill-state donut pattern verbatim (no `onSliceClick`/`activeSlice`/`sliceFilters` -- grep-verified absent), fixed 8-status semantic color map (closed/completed=settled greens, open/in_progress/in_review/pending/not_approved=active warm/blue/violet, draft=neutral zinc) + fuchsia `#e879f9` overflow color for unexpected statuses, ranked legend with all 8 buckets always present (zeros kept) plus appended overflow rows, same live coverage caption convention. Both built UNMOUNTED per `21-CONTEXT.md`'s locked decision -- plan 21-04 mounts them into `ProjectsTabPanel.tsx` below `IssueFetchCoverageDonut`. Deliberately did NOT mark `ISSUE-02`/`ISSUE-03` complete in REQUIREMENTS.md this plan (matches Phase 20 precedent: requirements marked complete only at the wiring plan that makes them user-visible, not the component-build plan). 12/12 new Vitest cases green (5 timeline + 7 status), tsc clean, no deviations.
- [Phase 21]: 21-04 (client wiring + owner checkpoint, FINAL plan, COMPLETE, Phase 21 SHIPPED): `loadIssueFunnelAction` threaded as a function prop from `mainCharts.tsx` (eager `Promise.all` fan-out unchanged at 9 -- issue-funnel loader rides the lazy per-tab path only); `AccessAnalysisCharts.tsx` gained a 4th lazy fetch-once branch (ref-flag set before the await, mirroring the activityRecency/permissionLevel/folderScopedActivity shape) keyed `tab === "projects"`, plus two picker-only memos (`issueTimelineSummary`/`filteredIssueStatusRows`, using `selected` directly -- locked decision, never `sliceFilteredProjectIds`); `ProjectsTabPanel.tsx` mounts both `IssueTimelineChart`/`IssueStatusChart` as two full-width stacked panels directly between `IssueFetchCoverageDonut` and Model Coordination, gated on prop presence with `DonutPanelSkeleton` while loading (leaves room for Phase 22's issues-by-type chart as a third sibling, zero redesign needed). New pinned Vitest shell test mirrors the existing lazy-fetch-once-per-tab convention. Full gate sweep: tsc clean, `npm test` 2421 passed/1 skipped/0 failed (grew from 2392 baseline, zero regressions), scope diff = exactly the 4 planned files, no new deps, `/users/spatial-graph` untouched. Owner live checkpoint **APPROVED** on a `:3100` webpack production-build preflight (isolated `.next-uat-21` dist, `:3000` never touched) -- verbatim: "Yes I like it." `ISSUE-02`/`ISSUE-03` now marked `Complete` in REQUIREMENTS.md. **3 Overview-tab UAT follow-up items surfaced during the same checkpoint session** (all out of this phase's scope, none require any file this plan touched): (1) new Overview chart -- module access grants per module for selected projects ("provisioned modules"), maps to the already-deferred "provisioned-vs-active module coverage" seed (needs `products` Json -> `ModuleId[]` vocabulary alignment); (2) data-bug suspicion -- "Activity by module" allocation looks wrong, many activities suspected attributed to the wrong module; matches the already-diagnosed known gap that module attribution ignores `AccActivity.service` (~40.7% populated), prior June diagnosis found ~966 Model Coordination activities were likely Build misattribution; (3) new Overview panel -- "Activity share by project" donut (top-N + Other, click-to-drill), additive, existing Top-projects-by-activity chart stays unchanged. See `21-04-SUMMARY.md` "UAT Feedback / Follow-ups" for full detail -- surface these for scoping before/alongside Phase 22 planning, they do not block Phase 22's start.
- [Phase 21.1]: 21.1-01 (service-first attribution fix, UAT-21.1-02): `classifyActivity(rawAction, service?)` gains an additive `attributedBy: "service"|"verb"` field; `SERVICE_TO_MODULE` is a narrow override -- decisive services (issues/submittals/rfis/admin) override the verb result when they disagree; umbrella services (docs/sheets/bridge) only rescue an Unmapped verb result, never flatten an already-mapped verb refinement (preserves the intentional Design Collaboration/Datum/Admin Actions verb splits). `moduleActivityView.ts`'s union now groups by service/serviceGroup (live row count 7,824, well below OOM-guard scale); `ModuleSummary.attribution {serviceCount, verbCount}` exposes the live split for 21.1-04's caveat copy. Live evidence (`21.1-ATTRIBUTION-DELTA.md`, 2026-07-06): movement is real but tiny -- 207 of 4,722,412 activities (0.0044%), zero Model Coordination involvement, confirming `docs/activity-module-audit.md`'s stale ~966 figure is superseded. Deviation (Rule 1, non-architectural): 2 pre-existing test files (`activityClassification.test.ts`'s toEqual pins, `ModulesPieChart.test.tsx`'s fixtures) updated to include the additive fields TypeScript/Vitest required. `npm test` 2432 passed/1 skipped/0 failed (baseline 2421). Items 1 (provisioned-modules chart) and 3 (activity-share-by-project donut) remain for later plans in this phase.
- [Phase 21.1]: 21.1-02 (provisioned-modules chart stack, UAT-21.1-01, COMPLETE): `lib/server/provisionedModulesView.ts`'s `loadProvisionedModules()` aggregates member-module grant counts from `AccProjectMember.products` (14,566 rows, full live-project coverage across all 1,153 `AccProject` rows) -- deliberately NOT `AccDcProjectUserProduct` (the DC-only ~550/1,153 subset `accessInstanceView.ts:107` actually feeds `reduceModules` from), per 21.1-RESEARCH.md Pitfall 3. Reuses `reduceModules` (modules.ts) + `buildProjectNameMap`/`resolveProjectName` (folderActivityView.ts) unchanged; output bounded by n_projects x n_modules, never one row per member. Live check (2026-07-06, throwaway script): 0/14,566 rows have null/empty `products` -- no coverage caption needed. `provisionedModulesCounts.ts`'s `summarizeProvisionedModules()` uses the full 10-module vocabulary (incl. modelCoordination, unlike the activity donut) with canonical `zeroModules` (all 10 always accounted for) and a per-project drill map. `ProvisionedModulesChart.tsx` renders horizontal bars (local click-to-drill, top-30 projects + overflow line, no cross-filter-bus wiring), colored via `MODULE_COLORS` (now exported from `ModulesPieChart.tsx`, one-line change, no other impact). All 3 pieces built and tested UNMOUNTED -- plan 21.1-04 wires them in. 20 new Vitest cases (7 loader + 7 transform + 6 chart), `npm test` 2452 passed/1 skipped/0 failed (grew from 2432 baseline, zero regressions), tsc clean, scope diff = exactly the 7 planned files. Deviations (Rule 1, all caught pre-commit by the plan's own gates, no scope impact): a `*/` sequence inside a JSDoc comment broke the parser (reworded); the component's own doc comment literally contained the banned cross-filter-bus token strings, failing its own grep test (reworded); an ECharts `label.formatter` type mismatch caught by `tsc --noEmit` (narrowed with a runtime typeof check). `UAT-21.1-01` intentionally not marked complete in REQUIREMENTS.md -- it isn't a tracked ID there (21.1-RESEARCH.md: no REQUIREMENTS.md IDs assigned to this inserted phase) and, per the 21-02/21-03 precedent, UAT items resolve at the wiring plan (21.1-04), not the component-build plan.
- [Phase 21.1]: 21.1-04 (wiring + owner checkpoint, FINAL plan, COMPLETE, PHASE 21.1 SHIPPED): all 3 UAT items live on the Overview tab — `mainCharts.tsx` eager fan-out 9→10 (`loadProvisionedModules`), picker-only memos (`selected`, never `sliceFilteredProjectIds`), `projectOptions` union extended with provisioned rows (AccProjectMember covers all 1,153 live projects vs. DC-scoped roleRows), locked 2-up row [ProjectActivityDonut | ProvisionedModulesChart] between "Activity by module" and Ingest freshness, TRUTH-03 ⓘ caveat computes the live service/verb split from `moduleSummary.attribution` (stale "~40.7%" copy gone). Owner checkpoint ran TWO rounds on `:3100` webpack production preflights (isolated `.next-uat-21-1`, `:3000` PID 56060 untouched throughout): round 1 delegated the module-attribution mapping review ("I'll hand that to you — review the types of activities and the modules assigned, use your best effort") → corrections 1-4 (sheets rescue-target, version-set family, notify-final-members→Data Management, add-folder-naming-standard→Datum); round 2 final verdict verbatim "approved BUT move sheets and friends to the Build module" → correction 5 (owner-directed): sheet verbs + version-set family + sheets service rescue ALL route to Build via a new classifier-layer `MODULE_OVERRIDES` map (generated excel catalog never edited); `publish-entity` STAYS Design Collaboration (docs-tagged Revit model publish) — Design Collaboration honestly shrinks to a ~53-row sliver, not padded. Net ~24.4k rows (0.52% of 4.72M) now attribute to Build. `21.1-ATTRIBUTION-DELTA.md` regenerated live after each round with a full 5-correction review section. Gates: tsc clean, `npm test` 2477 passed/1 skipped/0 failed (baseline 2470, +7 pins, 0 regressions). Commits 944e4d18/d699a299/1dca75d3/55c4b78d, all explicit-path with staged-diff proof. UAT-21.1-01/02/03 all marked complete in ROADMAP.md (their only tracking surface — no formal REQ-IDs).
- [Phase 21.1]: 21.1-03 (activity-share-by-project donut, UAT-21.1-03, COMPLETE): `projectActivityCounts.ts`'s `summarizeProjectActivity()` re-aggregates the SAME `ModuleActivityRow[]` the Overview already loads for the activity-by-module donut (`loadModuleActivity()`) per project -- zero new loader, zero new fetch. The synthetic Account-level bucket (`projectId === ""`, `moduleActivityView.ts`'s `ACCOUNT_LEVEL` sentinel) is excluded from the donut at the transform layer (never a slice, never a `rowsByProject` entry) and its live excluded volume surfaces as `accountLevelCount` for the caption; top-N (default 10) + trailing "Other (N projects)" mirrors `summarizePermissionLevel`/`summarizeProvisionedModules`'s bucketing shape. `ProjectActivityDonut.tsx` renders an ECharts donut (`ModulesPieChart` option shape) with a ranked legend, local click-to-drill (no cross-filter-bus wiring, grep-verified) that feeds the clicked project's raw rows into the SAME `summarizeModules` the activity-by-module donut uses (no reimplemented classification); the Other slice has no drill payload and its click is a guaranteed no-op. Categorical palette follows `RolesPieChart`'s name-keyed hue-rotation convention (project identity, not a fixed taxonomy); Other always gets the muted zinc rollup color. Caption states the live Account-level exclusion figure and a Top-N-of-M line, both individually conditional. Built UNMOUNTED -- plan 21.1-04 wires it in as the left panel of the new Overview 2-up row. 15 new Vitest cases (8 transform + 7 component), `npm test` 2467 passed/1 skipped/0 failed (grew from 2452 baseline, zero regressions), tsc clean, scope diff = exactly the 4 planned files. Deviation (Rule 1, caught pre-commit by the component's own grep test, no scope impact, repeat of the 21.1-02 pitfall): the component's own doc comment literally contained the banned cross-filter-bus token strings, failing its own grep test (reworded). `UAT-21.1-03` intentionally not marked complete in REQUIREMENTS.md -- same precedent as 21.1-02: UAT items resolve at the wiring plan (21.1-04), not the component-build plan.
- [Phase 22]: 22-01: AccIssueType lookup table applied via prisma/migrations-raw/ raw SQL (migrate dev chokes on pre-existing pgvector shadow-DB requirement, P3018); scripts/acc-issue-types-backfill.cjs live-run over all 1,153 projects (519 ok/38 forbidden/596 404-ISSUES_SERVICE_NOT_FOUND, not the 403-forbidden pattern the sibling /issues endpoint uses); 298/316 issueTypeId and 477/515 issueSubtypeId GUIDs now resolve to human names, 18 genuinely unresolved (live Unknown-type case exists for 22-03); idempotency confirmed (16,928 rows unchanged after single-project re-run). — ISSUE-04 complete, unblocks ISSUE-05 (22-02/22-03 chart plans)
- [Phase 22]: 22-02 (ISSUE-05 data layer, COMPLETE): loadIssueFunnel() gained a typeRows cut inside its existing Promise.all (second accIssue.groupBy on issueTypeId joined in JS against accIssueType.findMany() — single $queryRaw call-count pin still holds, grep-verified 1 call site); summarizeIssueType() (new issueTypeCounts.ts) groups resolved rows by typeName not GUID (APS types are project-scoped) with distinct honest "Unknown type"/"No type set" buckets that rank by count, lossless total. Both UNMOUNTED — plan 22-03 consumes them. Deviation (Rule 3): 3 pre-existing AccessAnalysisCharts.test.tsx fixtures fixed for the new required typeRows field (TS2322). 13 new Vitest cases, npm test 2507 passed/1 failed (pre-existing unrelated /users physicsLayer test-isolation flake, deferred-items.md)/1 skipped, tsc clean. ISSUE-05 intentionally NOT marked complete (resolves at 22-03 per 21-02/20.1-02 precedent).
- [Phase 23]: 23-01 (deploy-only, zero commits, COMPLETE): rebuilt `:3000` via the manual deploy sequence (Task Scheduler stop → `npx tsc --noEmit` → `npm run build` → restart → route probes); `.next/BUILD_ID` moved from stale `2026-07-13 16:13:05` to `2026-07-14 10:08:56`, newer than HEAD, proving the review target is current. All 4 workshop routes probed live (307 auth-gate, PASS). See `23-01-SUMMARY.md`.
- [Phase 23]: 23-02 (docs-only, 1 commit `e70d3850`, COMPLETE): recounted the live `/access-analysis` panel inventory from source — **23 panels, not 22** (Roles tab has 6, not 5; "Folder Activity by Role" is a distinct `PremiumSurface` mount from the folder-action heatmap). Ruled zero-diff on the within-tab lead-panel curation question — every tab already leads with its strongest panel, no reorder performed (matches `23-RESEARCH.md` §A). Wrote `23-REVIEW-CHECKLIST.md` (144 lines): triage rule header, all 23 `/access-analysis` panels graded DEEP, `/users` DEEP-ish verification-only (4 never-reviewed 2026-07-13 surfaces), `/template-mty`/`/forma-proposal` SHORT passes, every caveat cell cited to a real source `file:line` honesty label, `Issues by type` flagged as the zero-owner-UAT panel. Corrected `23-CONTEXT.md`'s stale "untouched" claim about `/template-mty`/`/forma-proposal` (both received off-roadmap commits during the v2.3 window per `23-RESEARCH.md` §E). tsc clean, `npm test -- "app/(dashboard)/access-analysis"` 61/520 green. See `23-02-SUMMARY.md`.

### Blockers/Concerns

- Nothing blocking. Phases 20/20.1/21/21.1/22 all shipped. Phase 22's concentrated risk
  (ISSUE-04's external APS call + new Prisma migration) resolved cleanly — the backfill ran
  over all 1,153 projects and the lookup table is populated.

- **RESOLVED (was "Panel inventory drift") — closed by 23-02.** The live `/access-analysis`
  panel inventory is now authoritatively **23 panels** (recounted from source in
  `23-02-SUMMARY.md`/`23-REVIEW-CHECKLIST.md`; Roles tab has 6 panels, not 5 — "Folder Activity
  by Role" is a distinct mount from the folder-action heatmap below it). The curation question
  ("does each tab lead with its strongest panel?") was ruled zero-diff — no reorder performed.
  This superseded both `23-CONTEXT.md`'s 22-panel count and the roadmap's stale "7 new panels"
  figure.

- **NEW — 22-03 has the thinnest verification trail of any v2.3 panel.** Its blocking
  `checkpoint:human-verify` (`:3100` production preflight) was never run; the phase was closed
  2026-07-14 on the basis that the chart had been live on `:3000` since 2026-07-10 without a
  reported defect. `VERIFY:` no recorded owner sign-off exists for the issues-by-type panel.
  Give it explicit attention in the Phase 23 curation pass.

- **New (non-blocking, from 21-04 owner checkpoint):** 3 Overview-tab UAT follow-up items were
  raised during the Phase 21 checkpoint session — a new module-access-grants-per-module chart
  (Overview tab, maps to the already-deferred "provisioned-vs-active module coverage" seed), a
  data-bug suspicion in the existing "Activity by module" chart (matches the already-known
  `AccActivity.service` under-population gap / prior Model Coordination misattribution
  diagnosis from June), and a new "Activity share by project" donut (Overview tab, additive).
  None touch any Phase 21 file or block Phase 22's start — see `21-04-SUMMARY.md` "UAT
  Feedback / Follow-ups" for full detail; surface for scoping at the next roadmap discussion.

- **Resolved (was "Deferred" from Phase 20 UAT):** all 6 owner UAT follow-up items from the
  Phase 20 live checkpoint (ENG-01 semantic pivot, permission-footprint reframe, terrain/
  Compare-tab consolidation, role-click scroll-jump bug, folder-activity-by-company graph,
  /access-analysis tabbed-IA redesign) plus the 4 Task-3 gap-closure items surfaced at the
  20.1-07 owner re-check (activity-recency clarity, 2x expand-Other, project-GUID leak) are
  now ALL closed across 20.1-01 through 20.1-07. Phase 20.1 is ready for `/gsd:verify-work` /
  phase close.

- **New (non-blocking, from 20.1-07):** the Playwright e2e suite's `webServer.command`
  (`playwright.config.ts`) hardcodes `next dev --webpack`, which currently 500s on every
  request on this machine/Next 16.2.6 combination (confirmed live via `curl`, matches
  `20.1-07`'s own `deferred-items.md` entry recorded during Tasks 1-2). Turbopack
  (`--turbopack`) is the only working dev-server option right now. Recommend switching
  `playwright.config.ts`'s `webServer.command` and `package.json`'s `dev:next` script from
  `--webpack` to `--turbopack` in a future infra-focused phase/plan — out of scope for any
  v2.3 product phase.

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

**Phase 20.1 (Access-Analysis IA Redesign & Panel Semantics) is COMPLETE — 7/7 plans**
(20.1-01 through 20.1-07). 20.1-07 fixed the role-click scroll-jump (UAT-5, pinned by a
Playwright regression spec) and closed 4 owner gap-closure items surfaced at the Task 3
UAT re-check (activity-recency panel clarity, expand-in-place "Other" on Permission-volume-
by-level + Folder-activity-by-company, and a project-GUID leak into the global picker
diagnosed across 3 loaders); see `20.1-07-SUMMARY.md`. All 6 owner UAT items across the
whole phase (20.1-05/06/07) are now closed. Verification PASSED (6/7 automated + human
items resolved) and the owner approved live on a `:3100` webpack production build
(2026-07-04, isolated `.next-uat-20-1` dist — this also served as the successful pre-deploy
build preflight; `:3000` untouched). Deploy the 20.1 changes to `:3000` when the owner wants
them live (`scripts/gsd-self-gate.cjs --phase 20.1 --rebuild` or the standard deploy sequence).

**Phase 21 (Issue Funnel — Status & Time) is COMPLETE — 4/4 plans.** 21-01 (server data
layer): `lib/server/issueFunnelView.ts`'s `loadIssueFunnel()` aggregates the full
17,360-row `AccIssue` set into a monthly timeline cut + status breakdown cut, both server-side
aggregates (no `findMany` + JS reduce), plus its aggregate-bound Vitest test and an unwired
`issueFunnelActions.ts` lazy auth-gated action. See `21-01-SUMMARY.md`. 21-02 (status
transforms): `app/(dashboard)/access-analysis/issueFunnelCounts.ts`'s
`summarizeIssueStatus`/`deriveIssueCoverageCaption`, cloning Phase 20's fixed-bucket +
honest-overflow pattern over the 8 verified live statuses, plus 7 new Vitest cases. See
`21-02-SUMMARY.md`. 21-03 (chart components): `IssueTimelineChart.tsx` (monthly
area line, amber accent, no YoY) + `IssueStatusChart.tsx` (8-status donut, local drill, no
cross-filter bus), both unmounted, plus 12 new Vitest cases. See `21-03-SUMMARY.md`.
**21-04 (client wiring + owner checkpoint, FINAL, COMPLETE):** both charts wired via a 4th
lazy fetch-once-per-tab branch and mounted in `ProjectsTabPanel.tsx` below
`IssueFetchCoverageDonut`; full gate sweep green (tsc clean, `npm test` 2421 passed/1
skipped/0 failed); owner checkpoint **APPROVED** live on a `:3100` production-build preflight
(`.next-uat-21`, `:3000` untouched). `ISSUE-02`/`ISSUE-03` now `Complete` in REQUIREMENTS.md.
See `21-04-SUMMARY.md`, including 3 Overview-tab UAT follow-up items (out of phase scope,
recorded for future scoping — do not block Phase 22).

**Phase 21.1 (Overview Tab UAT Follow-ups) is COMPLETE — 4/4 plans, owner-approved live.** Inserted urgent
phase after Phase 21 (see "Roadmap Evolution" above) to close the 3 owner UAT items from the
21-04 checkpoint. **21.1-01 (service-first attribution fix, UAT-21.1-02, COMPLETE):**
`classifyActivity(rawAction, service?)` gains a narrow `SERVICE_TO_MODULE` override +
`attributedBy` field; `moduleActivityView.ts`'s union preserves `service`/`serviceGroup`;
`ModuleSummary.attribution` exposes the live service/verb split; `21.1-ATTRIBUTION-DELTA.md`
is the live before/after evidence (207/4,722,412 moved, 0.0044%, zero Model Coordination
involvement). See `21.1-01-SUMMARY.md`. **21.1-02 (provisioned-modules chart stack,
UAT-21.1-01, COMPLETE):** `lib/server/provisionedModulesView.ts`'s `loadProvisionedModules()`
aggregates member-module grants from `AccProjectMember.products` (full live-project
coverage, NOT the DC-only `AccDcProjectUserProduct` subset); `provisionedModulesCounts.ts`'s
`summarizeProvisionedModules()` + `ProvisionedModulesChart.tsx` (horizontal bars, local
click-to-drill) complete the stack, all UNMOUNTED. 20 new Vitest cases, `npm test` 2452
passed/1 skipped/0 failed. See `21.1-02-SUMMARY.md`. **21.1-03 (activity-share-by-project
donut, UAT-21.1-03, COMPLETE):** `projectActivityCounts.ts`'s `summarizeProjectActivity()`
re-aggregates the SAME rows the activity-by-module donut already loads (zero new loader/
fetch) into a top-10 + Other donut, excluding the synthetic Account-level bucket at the
transform layer with its live volume in `accountLevelCount`; `ProjectActivityDonut.tsx`
(local click-to-drill, feeds the clicked project's rows into the existing `summarizeModules`,
no cross-filter-bus wiring) completes the stack, both UNMOUNTED. 15 new Vitest cases,
`npm test` 2467 passed/1 skipped/0 failed. See `21.1-03-SUMMARY.md`. **21.1-04 (wiring +
owner checkpoint, FINAL, COMPLETE — PHASE 21.1 SHIPPED):** all 3 UAT items wired live
(fan-out 9→10, 2-up Overview row, live service/verb-split caveat); owner checkpoint
APPROVED across two `:3100` production-preflight rounds, closing with the owner-directed
Sheets-cluster→Build taxonomy move (5 gap-closure corrections total in
`lib/acc/activityClassification.ts`, live evidence in `21.1-ATTRIBUTION-DELTA.md`).
Gates: tsc clean, `npm test` 2477/1/0. See `21.1-04-SUMMARY.md`. Deploy to `:3000` when
the owner wants 21.1 live (standard deploy sequence / `gsd-self-gate.cjs --rebuild`).

**Phase 22 (Issue Type Resolution) is IN PROGRESS — 2 plans complete (22-01, 22-02).**
`22-01` (data layer, COMPLETE): additive `AccIssueType` Prisma model applied via
`prisma/migrations-raw/2026-07-10-acc-issue-type.sql` (raw-SQL fallback — `prisma migrate dev`
choked on the pre-existing pgvector shadow-DB requirement from
`20260416011500_fix_lod_search_foundation`, P3018, same standing guardrail as
`AccInstanceEmbedding`/`AccActivityAccds`); `scripts/acc-issue-types-backfill.cjs` (clone of
`scripts/acc-issues-backfill.cjs`'s auth/pagination/counters shape) live-run over all 1,153
projects: 519 ok / 38 forbidden (403) / 596 error (404 `ISSUES_SERVICE_NOT_FOUND` — Issues
module not provisioned in those containers, a genuinely different failure mode than the
sibling `/issues` list endpoint's mostly-403 pattern the research anticipated, not a bug).
16,928 rows upserted (5,291 type + 11,637 subtype, deduped by GUID). Resolution split: 298/316
distinct `issueTypeId` and 477/515 distinct `issueSubtypeId` GUIDs on `AccIssue` now resolve to
human-readable names (18 / 38 genuinely unresolved — confirms a **live unresolved GUID exists**,
satisfying the roadmap's "Unknown type" live-verification success criterion for 22-03, no
unit-test-only fallback needed). Idempotency confirmed (16,928 rows unchanged after a
single-project re-run). `npm test` 2495 passed/1 skipped/0 failed (baseline 2477, growth is
pre-existing branch WIP unrelated to this plan), tsc clean. Zero diff to `AccIssue`, any
existing issue query, or `/users/spatial-graph`. See `22-01-SUMMARY.md`.

**22-02 (ISSUE-05 data layer, COMPLETE):** `loadIssueFunnel()` (`lib/server/issueFunnelView.ts`)
gained a third `typeRows` cut inside its existing `Promise.all`/5-min-TTL cache — a second
`db.accIssue.groupBy(["projectId","issueTypeId"])` joined in JS against
`db.accIssueType.findMany()` (never a second `$queryRaw` — the single-call pin
`expect(mocks.queryRaw).toHaveBeenCalledTimes(1)` verified still holding, grep-confirmed exactly
1 `$queryRaw` call site in the file). Three-state resolution kept distinct through the loader
(resolved name / non-null GUID absent from lookup / null id — the transform labels them). New
`app/(dashboard)/access-analysis/issueTypeCounts.ts`'s `summarizeIssueType()` clones
`permissionLevelCounts.ts`'s top-N + Other shape, grouping resolved rows by **typeName** (not
GUID — APS issue types are project-scoped, so the same logical type carries a different GUID
per project) with two DISTINCT honest "Unknown type"/"No type set" buckets that rank by count
like any real type, never pinned/dropped; `total` sums every input row's count regardless of the
top-N fold, so the panel will reconcile with the status donut. Both pieces built and tested
UNMOUNTED — plan 22-03 consumes them (`IssueFunnelTypeRow` + `summarizeIssueType`/`DEFAULT_TOP_N`/
`IssueTypeSummary`/`IssueTypeBucket`, all already exported with the exact interface names
22-CONTEXT.md specifies). 13 new Vitest cases (4 loader + 9 transform). Deviation (Rule 3,
non-architectural): adding the required `typeRows` field to `IssueFunnelData` broke 3 pre-existing
test fixtures in `AccessAnalysisCharts.test.tsx` (TS2322) — fixed with `typeRows: []`, matching
the existing empty-array fixture convention. `npm test` 2507 passed/1 failed/1 skipped — the 1
failure (`physicsLayer.test.ts`, `/users` spatial-graph-adjacent) is a pre-existing test-isolation
flake unrelated to this plan's files, passes in isolation, logged to
`.planning/phases/22-issue-type-resolution/deferred-items.md`, not fixed (out of scope). tsc
clean. `ISSUE-05` intentionally NOT marked complete in REQUIREMENTS.md — same precedent as
21-02/20.1-02: requirements resolve at the wiring/mounting plan (22-03), not the data-layer/
transform-build plan. See `22-02-SUMMARY.md`.

**22-03 (ISSUE-05 chart + mounting) is COMPLETE.** `IssueTypeChart.tsx` — horizontal bars,
top-10 + expand-in-place "Other", per-type project drill, live GUID-resolution/coverage
captions, and a never-backfilled guard that tells the presenter to run
`scripts/acc-issue-types-backfill.cjs` rather than rendering a wall of 100% "Unknown type"
bars. Mounted as the third full-width issue panel below `IssueStatusChart` on the Projects
tab, consuming `typeRows`/`summarizeIssueType` (zero new loader/fetch — rides the existing
lazy Projects-tab path). Code shipped 2026-07-10; closed 2026-07-14 on live-`:3000` evidence
(the `:3100` preflight checkpoint was never run — see Blockers/Concerns). See `22-03-SUMMARY.md`.

**PHASE 22 IS COMPLETE (3/3). All 8 v2.3 requirements are delivered.**

---

## Next Action: Phase 23 — Workshop Curation & Milestone Close

The last phase of v2.3, and the only one left. It carries **zero new requirements** — it is the
mandatory curation + verification gate (PITFALLS.md Pitfall 7: shipping every new panel flat and
always-visible dilutes the workshop narrative).

**23-01 (rebuild `:3000`, COMPLETE)** and **23-02 (panel recount + review checklist, COMPLETE)**
are done — see the `[Phase 23]` bullets above and `23-01-SUMMARY.md`/`23-02-SUMMARY.md`. The
panel inventory is now authoritatively 23 (not the roadmap's stale "7 new panels" nor
`23-CONTEXT.md`'s 22), curation is a confirmed zero-diff PASS, and
`23-REVIEW-CHECKLIST.md` is written and ready to walk.

**Next: Phase 23 plan 23-03** — the live owner graph-by-graph review session on `:3000`,
walking `23-REVIEW-CHECKLIST.md`'s 4-page, graded-depth checklist and filling in its Verdict
column. Give `IssueTypeChart` ("Issues by type") explicit attention — it is flagged in the
checklist as the one panel with zero recorded owner UAT. Remaining phase work after 23-03: the
gate sweep (criterion #3/#4 — `npm test`, `npx tsc --noEmit`, `repo-map:check`, WebGL/
spatial-graph scope-fence proof) and the milestone-close artifact writes (MILESTONES.md restore
+ v2.3 entry, ROADMAP Phase 22 checkbox fix, STATE snapshot, PROJECT.md Active→Validated
promotion, config reset) — see `23-RESEARCH.md` §F for the exact sequencing and known
`gsd-tools state record-session` corruption trap (do not run that command).

Note for the deploy/e2e lane (recorded in `20.1` deferred-items.md): `next dev --turbopack`
CSS corruption on this machine is **deterministic against the current tree** (4/4 fresh-cache
boots, identical 496 parse errors), not ~50% intermittent; `next dev --webpack` 500s
repo-wide. Production `next build --webpack` is unaffected (proven 2026-07-04). E2e specs
that need a dev server are blocked until that infra item is picked up.

Prior milestone **v2.2 Structural Refactors** shipped + closed 2026-07-02 via safe-logical-close
(tagged `v2.2` local; 5/5 phases 15–19, 9/9 plans, 8/8 requirements; owner parity approved after
a fresh `:3000` rebuild). The working-tree summary is in PROJECT.md; detailed plan, summary,
and verification artifacts remain available from the `v2.2` tag and git history.

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

**Last session:** 2026-07-14
**Stopped at:** Phase 23 context gathered. Earlier the same session: STATE reconciled after a 4-day drift (Phase 22 closed 3/3 — 22-03's code had shipped 2026-07-10 but was never doc-closed) and the workflow-tools donuts committed (live on `:3000` since 2026-07-13 but existing only in the working tree). **Key Phase 23 finding: ROADMAP criterion #1 is already answered by Phase 20.1's 6-tab IA** — live recount is 22 panels / 6 tabs, and curation is ordering-only (a zero-diff result is a legitimate pass). Next: `/gsd:plan-phase 23`.
**Resume file:** .planning/phases/23-workshop-curation-milestone-close/23-CONTEXT.md

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
| Phase 20.1 P05 | 12min | 3 tasks | 11 files |
| Phase 20.1 P06 | 22min | 3 tasks | 9 files |
| Phase 20.1 P07 | ~55min (continuation) | 3 tasks + 4 gap-fixes | 14 files (+1 prior session) |
| Phase 21 P01 | 10min | 2 tasks | 3 files |
| Phase 21 P02 | 8min | 2 tasks | 2 files |
| Phase 21 P03 | ~20min | 2 tasks | 4 files |
| Phase 21 P04 | ~20min + checkpoint wait | 4 tasks (3 auto + 1 checkpoint) | 4 files |
| Phase 21.1 P01 | ~15min | 3 tasks | 9 files |
| Phase 21.1 P02 | ~20min | 3 tasks | 7 files |
| Phase 21.1 P03 | ~20min | 2 tasks | 4 files |
| Phase 21.1 P04 | ~40min + 2 checkpoint rounds + ~50min gap-closure | 3 tasks (2 auto + 1 checkpoint) + 5 corrections | 9 files |
| Phase 22 P01 | 50min | 3 tasks | 3 files |
| Phase 22 P02 | ~35min | 2 tasks | 5 files |
