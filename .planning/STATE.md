---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Structural Refactors
current_phase: 16
current_phase_name: SPLIT-01, SPLIT-02
status: ready-to-execute
stopped_at: "Phase 16 IN PROGRESS — both plans executed, BOTH checkpoint-pending. 16-01 (SPLIT-01) folderTerrain.ts split SHIPPED across commits 3cfd3734 + 71df53db. 16-02 (SPLIT-02) FolderPermissionTerrain.tsx split SHIPPED across commits 0dbae11f + 40126798 + 224519a4 (Task 1 fixed 2 pre-existing WIP failures at root cause — folder-label over-pruning + a ground-plane polygon miscount — before splitting into useFolderPermissionTerrainCamera/terrainViewModel/TerrainStage/TerrainControls + thin shell). Both SUMMARYs status=checkpoint-pending (owner visual-parity on /access-analysis + /template-mty not yet confirmed for either plan). Next = owner verification, then Phase 17."
last_updated: "2026-07-01T23:20:00Z"
last_activity: 2026-07-01
last_activity_desc: "16-02 SPLIT-02 executed — FolderPermissionTerrain.tsx (1,046 L) split into useFolderPermissionTerrainCamera.ts (154L) + terrainViewModel.ts (121L) + TerrainStage.tsx (392L) + TerrainControls.tsx (252L) + thin shell (212L); all ≤400 lines. Task 1 fixed the 2 pre-existing FolderPermissionTerrain.test.tsx WIP failures at the component/helper root cause (13/13 green). Committed 0dbae11f/40126798/224519a4. Owner visual-parity checkpoint pending on /access-analysis + /template-mty."
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 20
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.2 Structural Refactors — REF-01/REF-02/REF-03, all behavior-preserving behind v2.1's characterization tests. Defining requirements + roadmap.

## Current Position

- **Milestone:** v2.2 — Structural Refactors (opened 2026-07-01). Full scope: REF-01 (all 3 monoliths) + REF-02 (shared `folderPermQuery` extraction) + REF-03 (`AccFolderPermissionSummary` projection + raw-scan retirement). **Roadmap approved:** 5 phases (15–19), 8 requirements mapped 8/8.
- **Phase:** 16 of 19 — folderTerrain Monolith Split (SPLIT-01, SPLIT-02). Both plans executed — 2/2, both checkpoint-pending.
- **Plan:** 16-01 (SPLIT-01) SHIPPED — `folderTerrain.ts` split committed `3cfd3734` + `71df53db`; SUMMARY status=checkpoint-pending. 16-02 (SPLIT-02) SHIPPED — `FolderPermissionTerrain.tsx` split committed `0dbae11f` + `40126798` + `224519a4`; SUMMARY status=checkpoint-pending. Both await owner visual-parity confirmation on /access-analysis + /template-mty. Phase 15 shipped `a4d923ca`; plans committed `ce93372a`.
- **Status:** Phase 16 executed, both checkpoints open — owner verification needed before Phase 17. v2.2: 1 of 5 phases complete, 3/8 plans executed.
- **Last activity:** 2026-07-01 — 16-02 SPLIT-02 executed (FolderPermissionTerrain.tsx → hook + view-model + 2 presentational views + thin shell, byte-identical pins honored, 2 pre-existing WIP bugs fixed at root cause); owner visual-parity checkpoint pending for both 16-01 and 16-02.

Progress: [##░░░░░░░░░░] 20% — v2.2: 1 of 5 phases complete (3/8 plans executed; Phase 16 at 2/2, checkpoint-pending)

**Roadmap (Phases 15–19):**

| # | Phase | Reqs | Plans |
|---|-------|------|-------|
| 15 | Shared Query Extraction | QUERY-01 | 1/1 ✅ |
| 16 | Monolith Splits (access-analysis) | SPLIT-01, SPLIT-02 | 2/2 (checkpoint-pending) |
| 17 | HybridAnalyticsSurface Split | SPLIT-03, SPLIT-04 | 0/2 |
| 18 | AccFolderPermissionSummary Foundation | PROJ-01 | 0/1 |
| 19 | Raw Scan Retirement & Refresh | PROJ-02, PROJ-03 | 0/2 |

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

- **Behavior-preserving refactors only.** REF-01/REF-02/REF-03 must keep their
  characterization tests (TEST-02 `folderPermissionTerrainView.test.ts`, TEST-03
  `templateFolderTerrain.sharedQuery.test.ts`, TEST-01 OOM guard) byte-identical /
  green. No workshop-visible change.

- **Sequence:** REF-02 (extract shared `folderPermQuery.ts`) lands before/with the
  REF-01 splits so both `/template-mty` and `/access-analysis` consume one owned query;
  REF-03 (summary projection) builds on the centralised query.

- **`HybridAnalyticsSurface.tsx` pin is thin** — only `HybridAnalyticsSurface.fallback.test.tsx`
  (fallback path). Widen its characterization net (main DuckDB-Wasm path) BEFORE splitting.

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

### Blockers/Concerns

- None blocking v2.2 planning. Risks tracked above (REF-03 migration/backfill/refresh;
  thin `HybridAnalyticsSurface` pin).

- **Resolved 2026-07-01 (16-02 Task 1):** the 2 pre-existing `FolderPermissionTerrain.test.tsx`
  failures were root-caused and fixed — folder-label over-pruning at default zoom (restored the
  roomy evenly-spaced layout for small/typical datasets in `folderTerrainCamera.ts`) and a
  ground-plane `<polygon>` inflating the polygon-count pin (rendered as `<path>` instead). Both
  bugs trace to commit `d2d990bf` (2026-06-15). `FolderPermissionTerrain.test.tsx` is now 13/13
  green. See `16-02-SUMMARY.md` Deviations for full root-cause detail.

- Branch is `feat/access-analysis-redesign` with heavy uncommitted WIP + the `.planning/`
  migration deletions in the working tree. **Commit by explicit path only** (never `-A`/`.`);
  check `git diff --cached --name-only` before every commit.

## Next Action

Phase 16 is executed — both plans shipped, both checkpoint-pending. 16-01 (SPLIT-01,
`folderTerrain.ts`) shipped across `3cfd3734` + `71df53db`. 16-02 (SPLIT-02,
`FolderPermissionTerrain.tsx`) shipped across `0dbae11f` + `40126798` + `224519a4`. Both SUMMARYs
are `checkpoint-pending` — owner visual-parity on `/access-analysis` + `/template-mty` is not yet
confirmed for either plan.
**Next: owner verification of both checkpoints, then `/gsd:execute-phase 17`** (`/clear` first — fresh context window).

- **16-01 (SPLIT-01, wave 1) — ✅ SHIPPED (checkpoint-pending):** `folderTerrain.ts` (1,096 L, all-pure) → 4 co-located geometry
  sub-modules (`folderTerrainModel` / `folderTerrainLayout` / `folderTerrainScene` /
  `folderTerrainCamera`) + a thin re-export barrel keeping the original filename. Byte-identical
  pins: `folderTerrain.test.ts` (direct, 30+ symbols) + TEST-02 (transitive via
  `folderPermissionTerrainView.ts`). Owner visual-parity checkpoint on `/access-analysis` + `/template-mty`.

- **16-02 (SPLIT-02, wave 2, depends_on 16-01) — ✅ SHIPPED (checkpoint-pending):** Task 1 fixed the
  2 pre-existing WIP failures in `FolderPermissionTerrain.test.tsx` at the root cause (green
  baseline, 13/13), then split `FolderPermissionTerrain.tsx` (1,046 L) → `useFolderPermissionTerrainCamera.ts`
  (154L, hook) + `terrainViewModel.ts` (121L, pure) + `TerrainStage.tsx` (392L) +
  `TerrainControls.tsx` (252L, presentational) + thin shell (212L). All ≤ ~400 lines. tsc 0;
  `FolderPermissionTerrain.test.tsx` 13/13 + TEST-02/`folderTerrain.test.ts` 68/68; byte-identical
  (0 test edits this session). Owner visual-parity checkpoint on `/access-analysis` + `/template-mty`.

Guardrails carried into execution: byte-identical tests (no test edits), ~400-line ceiling per
file, co-located only (no `lib/acc` migration on critical path — deferred VERIFY), explicit-path
commits with `git diff --cached --name-only` proof, `npx tsc --noEmit` before any rebuild,
no new WebGL, zinc theme untouched, `/users/spatial-graph` not touched.

---
*Last updated: 2026-07-01 — 16-02 SPLIT-02 shipped (0dbae11f + 40126798 + 224519a4); both 16-01 and 16-02 checkpoint-pending. v2.2: 1 of 5 phases done, Phase 16 at 2/2 (checkpoint-pending).*

## Session

**Last session:** 2026-07-01T23:20:00Z (execute-phase 16, plan 16-02)
**Stopped at:** Phase 16 executed — both 16-01 and 16-02 shipped, both checkpoint-pending owner visual parity on /access-analysis + /template-mty
**Resume file:** .planning/phases/16-folderterrain-monolith-split/16-02-SUMMARY.md → owner verification of both Phase 16 checkpoints, then /gsd:execute-phase 17
