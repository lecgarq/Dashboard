---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Structural Refactors
current_phase: 19
current_phase_name: Raw Scan Retirement & Refresh (PROJ-02/PROJ-03)
status: milestone-ready-to-close
stopped_at: "Phase 19 CLOSED (2/2 plans) — v2.2 milestone FUNCTIONALLY COMPLETE, pending formal close (/gsd:complete-milestone). 19-02 (PROJ-03) Task 2 (owner visual parity checkpoint, gate=blocking) APPROVED 2026-07-02 (commit a92ffe0d): a fresh :3000 rebuild ran with the owner's go — Task Scheduler 'LECG Dashboard Local' stopped + port freed, npx tsc --noEmit 0, npm run build (next build --webpack) 0 with full route manifest, task restarted (State=Running, :3000 listening), /api/health 200, workshop routes (/access-analysis /template-mty /users/access-analysis /forma-proposal /users) 307 auth-redirect (no 500s), owner confirmed both pages render identically. gsd-verifier PASSED 10/10 (19-VERIFICATION.md) with every gate independently re-run (fresh tsc 0; 42 targeted tests + 12 terrain golden-master tests green; fresh verify-folder-perm-summary.cjs PASS 22,082==22,082/0 mismatches; terrain confirmed untouched via git log; scope fence clean). All 8/8 v2.2 requirements complete."
last_updated: "2026-07-02T23:45:00Z"
last_activity: 2026-07-02
last_activity_desc: "execute-phase 19 CLOSED: 19-01 (PROJ-02, 9dbe606b/08e78f9c) consumer switch + hard-guard, 19-02 (PROJ-03, e34ec7e7) cron refresh + staleness doc, owner visual parity checkpoint APPROVED (a92ffe0d) after a fresh :3000 rebuild driven with owner consent, then gsd-verifier PASSED 10/10 (19-VERIFICATION.md). Phase 19 complete (2/2 plans); v2.2 milestone functionally done (5/5 phases, 9/9 plans, 8/8 requirements). Next: /gsd:complete-milestone to formally close v2.2."
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 9
  completed_plans: 9
  percent: 100
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.2 Structural Refactors — REF-01/REF-02/REF-03, all behavior-preserving behind v2.1's characterization tests. **All 5 phases (15–19) complete; v2.2 functionally done, pending formal milestone close.**

## Current Position

- **Milestone:** v2.2 — Structural Refactors (opened 2026-07-01). Full scope: REF-01 (all 3 monoliths) + REF-02 (shared `folderPermQuery` extraction) + REF-03 (`AccFolderPermissionSummary` projection + raw-scan retirement). **Roadmap approved:** 5 phases (15–19), 8 requirements mapped 8/8.
- **Phase:** 19 of 19 — Raw Scan Retirement & Refresh (PROJ-02/PROJ-03). COMPLETE + goal-verified 10/10 (2/2 plans; owner visual parity APPROVED). This is the FINAL v2.2 phase — its completion finishes the milestone's execution.
- **Plan:** 19-02 (PROJ-03) Task 1 shipped `e34ec7e7` (cron refresh wiring: `dc-daily-ingest.cjs` success branch now refreshes `AccFolderPermissionSummary` first, before the person-graph rebuild and `build-instance-features.ts`; `.planning/codebase/INTEGRATIONS.md` documents the staleness bound). Task 2 (owner visual parity checkpoint, `gate="blocking"`) PENDING. 19-01 (PROJ-02) shipped `9dbe606b` (consumer switch: `includePermissionSummary` else-branch now reads `db.accFolderPermissionSummary.findMany` instead of the live `$queryRaw` GROUP BY) + `08e78f9c` (hard-guard: `includePermissionContexts:true` throws by default, escape hatch `ACC_ALLOW_RAW_PERMISSION_SCAN=1` documented in `.env.example`). `lib/acc/dcUserAssembly.ts` untouched — Map contents identical, derived dims unchanged. 18-01 (PROJ-01) shipped `77909b10` (model + migration) + `9d55539c` (server-side backfill) + `fb8ba765` (reconciliation script + PASS verdict). 17-02 (SPLIT-04) shipped `e0bb6e66` + `da2f230b`; 17-01 (SPLIT-03) shipped `b6084f5f`. Phase 16 CLOSED (16-01 `3cfd3734`+`71df53db`; 16-02 `0dbae11f`+`40126798`+`224519a4`, owner-approved). Phase 15 shipped `a4d923ca`; its plans committed `ce93372a`.
- **Status:** Phase 19 CLOSED (2/2 plans; gsd-verifier PASSED 10/10, `19-VERIFICATION.md`; owner visual parity on `/access-analysis` + `/template-mty` APPROVED 2026-07-02 after a fresh `:3000` rebuild). v2.2: **5 of 5 phases complete, 9/9 plans, 8/8 requirements** — milestone functionally complete, awaiting formal close (`/gsd:complete-milestone`).
- **Last activity:** 2026-07-02 — 19-02 (PROJ-03) Task 1 executed and committed by explicit path (`e34ec7e7`): non-fatal refresh block inserted as the first step of `dc-daily-ingest.cjs`'s success branch (invokes `node scripts/backfill-folder-perm-summary.cjs` verbatim), `.planning/codebase/INTEGRATIONS.md` staleness-bound doc added. All automated gates green: `node --check`, backfill re-run (22,082 rows, within bound), `verify-folder-perm-summary.cjs` VERDICT PASS, `npx tsc --noEmit` clean, full `npm test` 2256/1-skipped (identical to 19-01 baseline). Task 2 (`checkpoint:human-verify`, `gate="blocking"`) deliberately STOPPED — requires owner-performed `:3000` rebuild + visual check, cannot be auto-approved or automated. REQUIREMENTS.md traceability table corrected (PROJ-02/PROJ-03 were left stale at "Pending" by 19-01; now "Complete").

Progress: [##########] 100% — v2.2: 5 of 5 phases complete, 9/9 plans (Phase 19 CLOSED, goal-verified 10/10, owner-approved)

**Roadmap (Phases 15–19):**

| # | Phase | Reqs | Plans |
|---|-------|------|-------|
| 15 | Shared Query Extraction | QUERY-01 | 1/1 ✅ |
| 16 | Monolith Splits (access-analysis) | SPLIT-01, SPLIT-02 | 2/2 ✅ (owner-approved) |
| 17 | HybridAnalyticsSurface Split | SPLIT-03, SPLIT-04 | 2/2 ✅ (test-basis parity — no live mount; owner review open) |
| 18 | AccFolderPermissionSummary Foundation | PROJ-01 | 1/1 ✅ (reconciliation PASS; goal-verified 6/6) |
| 19 | Raw Scan Retirement & Refresh | PROJ-02, PROJ-03 | 2/2 ✅ (goal-verified 10/10; owner visual parity approved) |

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

Phase 19 (PROJ-02/PROJ-03) is COMPLETE + goal-verified (2026-07-02). Both plans shipped, the
owner visual parity checkpoint is APPROVED after a fresh `:3000` rebuild, and gsd-verifier
PASSED 10/10 (`19-VERIFICATION.md`). **v2.2 is functionally complete: 5/5 phases, 9/9 plans,
8/8 requirements.**

**Next: `/gsd:complete-milestone`** to formally close v2.2 (milestone-close bookkeeping —
MILESTONES.md entry, PROJECT.md Active→Validated promotion, config.json reset for the next
milestone, ROADMAP v-next seeds). Note the `.planning/` mid-migration caveat still applies:
`MILESTONES.md`/`RETROSPECTIVE.md`/`milestones/` are deleted in the working tree, so v2.2 close
follows the same "safe logical close" pattern as v2.1 (evolve PROJECT/STATE/REQUIREMENTS in
place; do not resurrect deleted archival files unless the owner asks). All work remains on the
`feat/access-analysis-redesign` branch (no merge/deploy beyond the local `:3000` rebuild).

- **18-01 (PROJ-01) — DONE + VERIFIED:** `AccFolderPermissionSummary` Prisma model + migration
  + backfill script + reconciliation script, proving projection parity with the live
  `includePermissionSummary` GROUP BY aggregate (22,082 == 22,082 rows, 0 mismatches, 20/20
  spot-checks). See `18-01-SUMMARY.md`, `18-RECONCILIATION.md`, `18-VERIFICATION.md`.

- **19-01 (PROJ-02) — DONE:** consumer switch + hard-guard shipped. See `19-01-SUMMARY.md`
  for full command output, evidence, and the split-commit technique used to keep both tasks
  in separate commits despite interleaved code regions in `acc-hot-cache.ts`.

- **19-02 (PROJ-03) Task 1 — DONE:** cron refresh + staleness-bound doc shipped (`e34ec7e7`).
  See `19-02-SUMMARY.md` for full command output and evidence. Task 2 (owner visual parity
  checkpoint) is the final v2.2 acceptance gate and has NOT been performed yet.

Guardrails carried forward: byte-identical characterization tests (no test edits), ~400-line
ceiling per file, explicit-path commits with `git diff --cached --name-only` proof,
`npx tsc --noEmit` before any rebuild, no new WebGL on data surfaces, zinc theme untouched,
`/users/spatial-graph` not touched.

Carried-forward open item: owner visual sign-off on the Phase 17 SPLIT-04 split is still
pending (test-basis-only acceptance) — see Blockers/Concerns above.

---
*Last updated: 2026-07-02 — execute-phase 19 CLOSED. 19-01 (PROJ-02, `9dbe606b`/`08e78f9c`): consumer switch to `AccFolderPermissionSummary` + hard-guard of the raw scan. 19-02 (PROJ-03, `e34ec7e7`): cron refresh + staleness doc. Owner visual parity checkpoint APPROVED (`a92ffe0d`) after a fresh `:3000` rebuild driven with owner consent (Task Scheduler stop → tsc 0 → `npm run build` 0 → restart → `/api/health` 200, workshop routes 307, no 500s). gsd-verifier PASSED 10/10 (`19-VERIFICATION.md`), every gate independently re-run. v2.2: 5/5 phases, 9/9 plans, 8/8 requirements — functionally complete. Next: `/gsd:complete-milestone` to formally close v2.2.*

## Session

**Last session:** 2026-07-02 (execute-phase 19 → both plans executed, owner visual parity checkpoint approved, phase goal-verified 10/10, Phase 19 CLOSED)
**Stopped at:** Phase 19 CLOSED — v2.2 functionally complete (5/5 phases, 9/9 plans, 8/8 requirements). 19-01 (PROJ-02) consumer switch + hard-guard (`9dbe606b`/`08e78f9c`); 19-02 (PROJ-03) cron refresh + staleness doc (`e34ec7e7`); owner visual parity checkpoint APPROVED (`a92ffe0d`) after a fresh `:3000` rebuild (Task Scheduler stop → tsc 0 → `npm run build` 0 → restart → `/api/health` 200, workshop routes 307, no 500s, owner confirmed identical render); gsd-verifier PASSED 10/10 (`19-VERIFICATION.md`). ROADMAP/STATE/REQUIREMENTS synced by explicit-path edits (gsd-tools `phase complete` NOT used — it corrupts this repo's STATE frontmatter).
**Resume file:** none — Phase 19 complete + verified. Next: `/gsd:complete-milestone` to formally close v2.2 (safe-logical-close pattern; `.planning/` archival files remain deleted in the working tree per the mid-migration caveat).
