---
gsd_state_version: 1.0
milestone: v2.3
milestone_name: New Graphs
current_phase: null
current_phase_name: Not started (defining requirements)
status: defining-requirements
stopped_at: "Milestone v2.3 New Graphs opened 2026-07-02 — defining requirements. Scope: new charts for /access-analysis + /template-mty from existing-but-unvisualized Prisma data (candidate pool: ROADMAP.md 'v2.3 Candidates (Seeds)'). Prior milestone v2.2 Structural Refactors SHIPPED + closed 2026-07-02 (safe-logical-close, tagged v2.2; 5/5 phases 15-19, 9/9 plans, 8/8 requirements, owner parity approved after :3000 rebuild)."
last_updated: "2026-07-02T23:59:00Z"
last_activity: 2026-07-02
last_activity_desc: "Milestone v2.3 New Graphs started — PROJECT.md updated (Current Milestone section + Active promotion), STATE.md reset. Next: requirements definition → roadmap."
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.3 New Graphs (opened 2026-07-02) — new charts for `/access-analysis` + `/template-mty` from existing-but-unvisualized Prisma data. Defining requirements.

## Current Position

- **Milestone:** v2.3 — New Graphs (opened 2026-07-02). Scope: new ECharts panels on `/access-analysis` and `/template-mty` derived from existing Prisma models (candidate pool: ROADMAP.md "v2.3 Candidates (Seeds)"); no new data sources, no new WebGL, honest coverage labels.
- **Phase:** Not started (defining requirements)
- **Plan:** —
- **Status:** Defining requirements
- **Last activity:** 2026-07-02 — Milestone v2.3 started (PROJECT.md Current Milestone section added; STATE.md reset). Prior milestone v2.2 Structural Refactors shipped + closed 2026-07-02 (safe-logical-close, tagged `v2.2`; details in PROJECT.md Shipped Milestone section and `.planning/phases/15..19` artifacts).

## Status (data baseline — still current)

- **State:** Data extraction COMPLETE and VERIFIED (census below), unchanged since 2026-06-23. v2.1 shipped on this baseline; v2.2 refactors it without changing the data or what the workshop pages show.

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

> Note: `AccFolderPermission` = ~6.04M rows here (census) — the "~5M-row scan" language in code/CONCERNS predates the last folder crawl; REF-03 targets whichever count is live at build time.

## Accumulated Context

### Decisions

v2.1 (shipped) decisions are recorded in `PROJECT.md` Key Decisions + the per-plan
SUMMARY files in `.planning/phases/09..14`. Decisions that still constrain v2.2 work:

- **QUERY-01/REF-02 shipped (2026-07-01, commit a4d923ca).** `lib/server/folderPermQuery.ts` owns the shared base `AccFolderPermission` join. Both terrain loaders (`templateFolderTerrain.ts` all-folders; `folderPermissionTerrainView.ts` l2Only) consume it via `loadFolderPermRows(projectId, { l2Only? })`. Plain tagged-template `db.$queryRaw` (no Prisma.sql) keeps TEST-02/TEST-03 byte-identical. Phase 16 splits and Phase 18 projection build on this shared owner.

- **REF-01 access-analysis splits shipped (2026-07-01, Phase 16).** `folderTerrain.ts` → `folderTerrainModel`/`folderTerrainLayout`/`folderTerrainScene`/`folderTerrainCamera` + thin barrel (SPLIT-01). `FolderPermissionTerrain.tsx` → `useFolderPermissionTerrainCamera` (hook) + `terrainViewModel` (pure) + `TerrainStage`/`TerrainControls` (presentational) + thin shell (SPLIT-02). All 9 files ≤ ~400 lines; pinning tests byte-identical; owner visual parity confirmed.

- **PROJ-03 Task 1 shipped (2026-07-02, Phase 19 plan 19-02, commit `e34ec7e7`).**
  `scripts/dc-daily-ingest.cjs`'s success branch now refreshes `AccFolderPermissionSummary`
  as the FIRST step — before the person-graph rebuild and before `build-instance-features.ts`
  (which reads the projection via `includePermissionSummary`, PROJ-02) — by invoking
  `node scripts/backfill-folder-perm-summary.cjs` verbatim inside a non-fatal try/catch,
  matching the existing person-graph/embedding pattern. `.planning/codebase/INTEGRATIONS.md`
  documents the `<=1-ingest-cycle` staleness bound, the out-of-band folder-crawl caveat
  (source table updates lag until the next ingest), and the manual fallback command.
  Verified: backfill re-run 22,082 rows (904 projects x 107 roles, within bound),
  `verify-folder-perm-summary.cjs` VERDICT PASS (0 mismatches, 20/20 spot-checks),
  `npx tsc --noEmit` clean, full `npm test` 2256/1-skipped (identical to 19-01 baseline).
  **Task 2 (owner `:3000` rebuild + visual parity on `/access-analysis` + `/template-mty`,
  the phase-close SC#3 gate) APPROVED 2026-07-02 (commit `a92ffe0d`)** — a fresh rebuild ran
  with owner consent (Task Scheduler stop → tsc 0 → `npm run build` 0 → restart → `/api/health`
  200, workshop routes 307, no 500s) and the owner confirmed identical render. Phase 19 CLOSED;
  gsd-verifier PASSED 10/10 (`19-VERIFICATION.md`). This was the last open item in v2.2.

- **PROJ-02 shipped (2026-07-02, Phase 19 plan 19-01, commits `9dbe606b`/`08e78f9c`).**
  `getCachedAccDcBulkUsers`'s `includePermissionSummary` else-branch switched from the live
  `$queryRaw` GROUP BY to `db.accFolderPermissionSummary.findMany` (the Phase 18 projection);
  `includePermissionContexts:true` now throws by default (hard-guard) unless
  `ACC_ALLOW_RAW_PERMISSION_SCAN=1` is set. `lib/acc/dcUserAssembly.ts` unchanged. Verified:
  `npx tsc --noEmit` clean, full `npm test` 2256/1-skipped green, TEST-02 terrain golden
  masters 12/12 byte-identical (terrain untouched), `verify-folder-perm-summary.cjs` PASS
  (22,082==22,082, 0 mismatches) re-run against the live DB post-switch. Consumer call sites
  (`AccessAnalysisShell.tsx`, `RightPanelStack.tsx`, `acc-route-hydration.ts`) unchanged —
  data-source swap is entirely internal. Owner visual parity on `/access-analysis` +
  `/template-mty` deferred to 19-02's phase-close checkpoint (single rebuild covers both plans).

- **PROJ-01 shipped (2026-07-02, Phase 18, commits `77909b10`/`9d55539c`/`fb8ba765`).**
  `AccFolderPermissionSummary` Prisma model + migration + server-side backfill +
  reconciliation script landed. Migration applied via the raw-SQL +
  `prisma migrate resolve` fallback (pgvector shadow-DB blocks `migrate dev` on this
  DB, confirmed again). Backfill: 22,082 rows, idempotent, entirely server-side
  (`INSERT...SELECT...GROUP BY`, zero Node-side row scan) — TEST-01 stayed green
  12/12 throughout. Reconciliation: live aggregate == projection (22,082 == 22,082),
  0 full-outer-join mismatches, 20/20 spot-checked keys matched — PASS verdict in
  `18-RECONCILIATION.md`. No consumer switched yet; Phase 19 (PROJ-02/PROJ-03) owns
  switching `/access-analysis`/`/template-mty` consumers onto this projection and
  retiring the `includePermissionContexts` raw scan.

- **SPLIT-04 shipped (2026-07-02, Phase 17, commits `e0bb6e66`/`da2f230b`).** `HybridAnalyticsSurface.tsx` (1,328 lines) → `hybridAnalyticsTransforms.ts` (pure) + `useHybridAnalytics.ts` (DuckDB-client hook) + `hybridAnalyticsPanels.tsx` + `HybridAnalyticsView.tsx`/`HybridAnalyticsPostureSection.tsx`/`HybridAnalyticsRankingsSection.tsx` (presentational, 3-way split to honor ~400L) + `HybridAnalyticsDrilldown.tsx` + a 196-line thin shell still exporting zero-arg `HybridAnalyticsSurface()`. Both pinning tests byte-identical (4/4 green); tsc 0; repo-map boundary check passed. **This closes all three REF-01 monolith splits.** Parity was accepted on the byte-identical-DOM-golden-test basis only — `/users/access-analysis` currently redirects to `/users/spatial-graph` and no production code mounts the surface, so there was no live route to visually verify. Owner visual sign-off did NOT occur and remains open for later review if/when the surface gets a live mount.

- **Behavior-preserving refactors only.** REF-01/REF-02/REF-03 must keep their
  characterization tests (TEST-02 `folderPermissionTerrainView.test.ts`, TEST-03
  `templateFolderTerrain.sharedQuery.test.ts`, TEST-01 OOM guard) byte-identical /
  green. No workshop-visible change.

- **Sequence:** REF-02 (extract shared `folderPermQuery.ts`) lands before/with the
  REF-01 splits so both `/template-mty` and `/access-analysis` consume one owned query;
  REF-03 (summary projection) builds on the centralised query.

- **`HybridAnalyticsSurface.tsx` pin was thin, now widened** — SPLIT-03 (17-01, `b6084f5f`)
  added `HybridAnalyticsSurface.mainQuery.test.tsx` pinning the DuckDB-Wasm main path BEFORE
  the SPLIT-04 split (17-02) executed. Phase 17 is now closed.

- **REF-03 is the risk carrier** — it adds a Prisma migration + backfill on the live
  `AccFolderPermission` table (~6M rows). Reconcile projection-vs-live-aggregate parity
  before retiring the `includePermissionContexts` raw scan in `lib/server/acc-hot-cache.ts`.
  A materialised summary needs a refresh path (wire into the existing ingest cron or a
  rebuild step); bound + document staleness.

- **Gates:** `npx tsc --noEmit` before any rebuild; deploy = rebuild + Task Scheduler
  restart on `:3000` (not a branch merge); Prisma migrations on this DB have historically
  choked on pgvector — apply via raw `ALTER` + `prisma migrate resolve` when `migrate dev` fails.

- **`.planning/` mid-migration:** `MILESTONES.md`/`RETROSPECTIVE.md`/`milestones/` are
  deleted in the working tree; v1.0/v2.0 history lives only in git HEAD. v2.2 evolves
  PROJECT/STATE/REQUIREMENTS in place (same "safe logical close" pattern as v2.1).

- **gsd-tools `phase complete` is unreliable on this repo** — it mangled STATE frontmatter
  on Phase 16 close (reset milestone to `v1.0/Concerns Hardening`, set `status: completed`,
  overwrote `progress` with v2.1's 8/8·17/17, reported `is_last_phase: true` though Phases
  17–19 remain). ROADMAP checkbox + Progress table updates were correct. **Always inspect
  and repair STATE frontmatter (milestone/status/current_phase/progress) manually after
  running it.** The wrong milestone label originates in the tool's ROADMAP-Milestones parse,
  not `config.json` (which carries no milestone field).

### Blockers/Concerns

- None blocking v2.2. Risks tracked above (REF-03 migration/backfill/refresh).

- **Open (non-blocking):** owner visual sign-off on the HybridAnalyticsSurface split (17-02,
  SPLIT-04) has not occurred. `/users/access-analysis` currently redirects to
  `/users/spatial-graph` and no production code mounts the surface (the
  `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS` flag appears only in a test file), so there was nothing to
  visually eyeball at execution time. Parity was accepted on the byte-identical DOM-golden-test
  basis (plan how-to-verify step 3) instead. Revisit if/when the surface gets a live, unflagged
  mount.

- **Resolved 2026-07-01 (16-02 Task 1):** the 2 pre-existing `FolderPermissionTerrain.test.tsx`
  failures were root-caused and fixed — folder-label over-pruning at default zoom (restored the
  roomy evenly-spaced layout for small/typical datasets in `folderTerrainCamera.ts`) and a
  ground-plane `<polygon>` inflating the polygon-count pin (rendered as `<path>` instead). Both
  bugs trace to commit `d2d990bf` (2026-06-15). `FolderPermissionTerrain.test.tsx` is now 13/13
  green. See `16-02-SUMMARY.md` Deviations for full root-cause detail.

- Branch is `feat/access-analysis-redesign` with heavy uncommitted WIP + the `.planning/`
  migration deletions in the working tree. **Commit by explicit path only** (never `-A`/`.`);
  check `git diff --cached --name-only` before every commit. `.planning/config.json` is
  pre-existing WIP (research→false, tsc-only build_command) — leave it out of doc commits.

## Next Action

Milestone **v2.3 New Graphs** opened 2026-07-02. Requirements definition in progress
(`/gsd:new-milestone` cycle): scope the ROADMAP.md "v2.3 Candidates (Seeds)" inventory
into REQUIREMENTS.md with REQ-IDs, then roadmap (phases continue from 20).

Prior milestone **v2.2 Structural Refactors** shipped + closed 2026-07-02 via safe-logical-close
(tagged `v2.2` local; 5/5 phases 15–19, 9/9 plans, 8/8 requirements; owner parity approved after
a fresh `:3000` rebuild). Full record: PROJECT.md Shipped Milestone section, `.planning/phases/15..19`
SUMMARY/VERIFICATION artifacts, and git history. Physical archival (MILESTONES.md / RETROSPECTIVE.md /
`milestones/`) remains intentionally DEFERRED per the `.planning/` mid-migration caveat.

Guardrails carried forward: explicit-path commits with `git diff --cached --name-only` proof,
`npx tsc --noEmit` before any rebuild, no new WebGL on data surfaces, zinc theme untouched,
`/users/spatial-graph` not touched, honest coverage labels on under-covered sources.

Carried-forward open item: owner visual sign-off on the Phase 17 SPLIT-04 split is still
pending (test-basis-only acceptance — no live mount) — see Blockers/Concerns above.

---
*Last updated: 2026-07-02 — Milestone v2.3 New Graphs started. PROJECT.md updated (Current Milestone section; new-graphs Active item promoted), STATE.md reset. Next: requirements → roadmap.*

## Session

**Last session:** 2026-07-02 (new-milestone → v2.3 New Graphs opened; PROJECT.md + STATE.md updated)
**Stopped at:** Defining requirements for v2.3 (scoping the ROADMAP.md seed inventory into REQUIREMENTS.md).
**Resume file:** none — continue the `/gsd:new-milestone` cycle (requirements → roadmap).
