---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: Concerns Hardening
current_phase: 21
current_phase_name: "Issue Funnel — Status & Time, 1/4 plans"
status: in_progress
stopped_at: Phase 21 Plan 01 complete
last_updated: "2026-07-06T14:51:30.693Z"
last_activity: 2026-07-06
last_activity_desc: "Phase 21 Plan 01 complete: issueFunnelView.ts loader + test (fc66c90b) + issueFunnelActions.ts (b2d39428). See 21-01-SUMMARY.md for full detail."
progress:
  total_phases: 16
  completed_phases: 13
  total_plans: 38
  completed_plans: 35
  percent: 92
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.3 New Graphs (opened 2026-07-02) — new charts for `/access-analysis` (+ `/template-mty` where a genuine fit exists) from existing-but-unvisualized Prisma data. Phase 20 complete (2026-07-03); Phases 21-23 remain.

## Current Position

- **Milestone:** v2.3 — New Graphs (opened 2026-07-02). Scope: 8 requirements (ISSUE-01–05, PERM-01, ENG-01, PIPE-01) across 4 phases (20-23), continuing sequential phase numbering from v2.2's Phase 19. No new data sources, no new npm dependencies, no new WebGL, honest coverage labels.
- **Phase:** 20 — Foundation Wins & Engagement Panels (COMPLETE, 5/5 plans). Phase 20.1 — Access-Analysis IA Redesign & Panel Semantics (INSERTED, **COMPLETE, 7/7 plans**). Phase 21 — Issue Funnel — Status & Time (IN PROGRESS, 1/4 plans).
- **Plan:** 21-01 complete (server data layer: `loadIssueFunnel()` aggregate loader for ISSUE-02/03 + aggregate-bound Vitest test + unwired lazy auth-gated `issueFunnelActions.ts`). Continuation session — prior executor died on an API error after committing Task 1; this session verified Task 1 and completed Task 2 with no rework. See `21-01-SUMMARY.md`.
- **Status:** In progress — Phase 21 plans 21-02/21-03/21-04 remain (chart/transform work + client wiring into `ProjectsTabPanel.tsx`).
- **Last activity:** 2026-07-06 — Phase 21 Plan 01 complete. See frontmatter `last_activity_desc` and `21-01-SUMMARY.md` for full detail.

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
- [Phase 20.1]: 20.1-05 (tab-IA shell split, UAT-7/UAT-4): AccessAnalysisCharts.tsx (722L) split into a thin shell (state + picker/FilterBanner + Tabs root, ~452L) + SectionHeaders.tsx + 6 presentational *TabPanel siblings (Overview/Roles/Users/Companies/Projects/Compare); all 11 pre-existing panels relocated intact with zero semantic changes. Compare tab mounts FolderPermissionTerrain with externalSelectedIds/hidePickers (20.1-04 props); TerrainReveal deleted, Radix TabsContent's unmount-by-default is the new lazy-mount gate. mainCharts.tsx untouched (11-entry Promise.all fan-out unchanged until 20.1-06). RECORDED ASSUMPTION surfaced for 20.1-07 owner checkpoint: the global picker defaults to ALL projects selected, so Compare's first paint derives compare-mode over the top-6-staffed intersection, not the all-folders overview -- that only shows once the user actively clears the selection. DEVIATION: Radix Tabs.Trigger activates on onMouseDown not onClick (verified in @radix-ui/react-tabs source) -- test suite (33 migrated + 6 new cases) uses fireEvent.mouseDown; @testing-library/user-event is NOT installed (no-new-deps), so the plan's suggested userEvent.click pattern was swapped for the repo's existing fireEvent convention. page.test.tsx's roles-donut route test also fixed (broken by the shell rewrite, same mouseDown pattern). Full access-analysis module scope green: 51 files / 432 tests.
- [Phase 20.1]: 20.1-06 (panel-semantic swaps mount, UAT-2/3/6/7): PermissionLevelChart + ActivityRecencyChart mounted on Roles tab replacing PermissionFootprintChart; new per-membership activity-recency detail DataTable on Users tab replacing DormantSignInChart; FolderActivityByCompanyChart mounted on Companies tab (UAT-6). mainCharts.tsx eager Promise.all trimmed 11->9 (STATE.md fan-out review resolved); the 3 new loaders (activityRecency/permissionLevel/folderScopedActivity) ride lazy fetch-once-per-page-load effects gated by ref flags (not a rows-null check, to avoid infinite refetch on a no-session null result) keyed to first Roles/Users/Companies tab activation. Deleted DormantSignInChart/PermissionFootprintChart/signInRecencyView/permissionFootprintView + their tests (zero remaining importers, grep-verified); formatBytes retained per locked decision. npm test full suite: 2386 passed/1 skipped/0 failed (the previously-known 12 UsersDirectoryClient.integration failures did not reproduce this run).
- [Phase 20.1]: 20.1-07 (FINAL plan, UAT-5 + owner gap-closure, COMPLETE): Tasks 1-2 (prior session) measured a real ~384px scroll jump (self-inflicted legend cross-filter collapse + drill-list mounting above it) via a live-browser Playwright spec (jsdom can't reproduce -- IntersectionObserver stubbed), fixed with a `legendMinHeight` ratchet (never shrinks) + reordering the drill-down list to render AFTER the legend. Task 3 owner UAT re-check response ("approved but...") surfaced 4 gap-closure items, all closed: (1) Activity-recency panel subtitles (Roles-tab `ActivityRecencyChart` + Users-tab "Activity recency detail" table) rewritten to state the underlying question (who's actually working vs. holding unused access) instead of just the banding mechanics -- copy-only; (2+3) `PermissionLevelChart`/`FolderActivityByCompanyChart` "Other" buckets now expand in place (local `expanded` state re-invokes the same `summarize*(rows, topN)` with `topN=rows.length`, zero new loader/fetch -- reuses `RolesPieChart`'s pre-existing Others-expand pattern) instead of dead-ending, with a collapse-back link that rank-checks whether an in-flight drill survives the collapse; (4) diagnosed the project-GUID leak in the global picker to THREE loaders feeding `projectOptions()` (`accessInstanceView.ts` roleRows -- first-priority source, `moduleActivityView.ts` moduleRows, `activityTimelineView.ts` timelineRows), each querying only `AccDcProject` and falling back to the raw `projectId` string -- all three now use `buildProjectNameMap`/`resolveProjectName` (AccProject-over-AccDcProject, "Unknown project" fallback), matching `coordinationByProjectView.ts`/`permissionLevelView.ts`'s pre-existing correct pattern. `accessInstanceView.ts`'s `RawDc` gained an optional `liveProjects` field (backward-compatible with existing DC-only test fixtures). Playwright re-run hit the pre-existing/already-deferred `next dev --webpack` 500s-every-request infra bug (`deferred-items.md`) -- confirmed unrelated to this plan's changes via direct `curl`, not fixed (out of scope, already recommended for a future infra phase). npm test full suite: 2392 passed/1 skipped/0 failed (6 new tests, 0 regressions vs. the 2386 baseline). Dev server on :3100 restarted clean with `--turbopack` (the working option) for the owner's ongoing quick re-check; production :3000 untouched throughout. Phase 20.1 (all 6 owner UAT items across 20.1-05/06/07) is now fully closed.
- [Phase 21]: 21-01 (issue funnel server data layer, COMPLETE): loadIssueFunnel() aggregates the full 17,360-row AccIssue set (no isCoordination filter) into a monthly date_trunc timeline cut + status groupBy cut in one Promise.all/5-min-TTL cache, mirroring coordinationByProjectView.ts's shape exactly; null createdAt excluded from the month cut (would corrupt the month key) but still counted in the status cut; null status coalesced to "unknown"; project names resolved via buildProjectNameMap/resolveProjectName (never a raw GUID). issueFunnelActions.ts mirrors activityRecencyActions.ts verbatim (auth-gate + delegate); client wiring deferred to plan 21-04 per CONTEXT.md locked decision to avoid growing mainCharts.tsx's eager Promise.all fan-out. Continuation session: prior executor died on an API error after committing Task 1 (fc66c90b, verified correct) but before Task 2 -- this session verified Task 1 then completed Task 2 (b2d39428) with no rework.

### Blockers/Concerns

- blocking. Phase 20 shipped clean. Risk for the rest of v2.3 is concentrated and isolated
  in Phase 22 (ISSUE-04's external APS call + new Prisma migration) — tracked above and
  sequenced deliberately after the lower-risk Phase 20/21 work.

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

**Phase 21 (Issue Funnel — Status & Time) is IN PROGRESS — 1/4 plans.** 21-01 (server data
layer) is complete: `lib/server/issueFunnelView.ts`'s `loadIssueFunnel()` aggregates the full
17,360-row `AccIssue` set into a monthly timeline cut + status breakdown cut, both server-side
aggregates (no `findMany` + JS reduce), plus its aggregate-bound Vitest test and an unwired
`issueFunnelActions.ts` lazy auth-gated action. See `21-01-SUMMARY.md`. **Next: `21-02-PLAN.md`**
(chart/transform work consuming `IssueFunnelMonthRow`/`IssueFunnelStatusRow`; plans 21-02/21-03
already exist on disk per `21-CONTEXT.md`'s deferred-to-21-04 client-wiring decision).

Note for the deploy/e2e lane (recorded in `20.1` deferred-items.md): `next dev --turbopack`
CSS corruption on this machine is **deterministic against the current tree** (4/4 fresh-cache
boots, identical 496 parse errors), not ~50% intermittent; `next dev --webpack` 500s
repo-wide. Production `next build --webpack` is unaffected (proven 2026-07-04). E2e specs
that need a dev server are blocked until that infra item is picked up.

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

**Last session:** 2026-07-06T14:51:30.683Z
**Stopped at:** Phase 21 Plan 01 complete
**Resume file:** .planning/phases/21-issue-funnel-status-time/21-02-PLAN.md

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
