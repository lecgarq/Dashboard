---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Structural Refactors
current_phase: 17
current_phase_name: HybridAnalyticsSurface Split (SPLIT-03, SPLIT-04)
status: ready-to-plan
stopped_at: "Phase 16 COMPLETE + owner-approved. Both 16-01 (SPLIT-01, folderTerrain.ts) and 16-02 (SPLIT-02, FolderPermissionTerrain.tsx) shipped and verified — owner confirmed visual + interaction parity on /access-analysis + /template-mty against a FRESH :3000 rebuild (commit 224519a4; deploy = tsc 0 -> npm run build exit 0 -> LECG Dashboard Local restart). gsd-verifier PASSED 12/12 (16-VERIFICATION.md). Next = plan Phase 17 (HybridAnalyticsSurface split; plans TBD)."
last_updated: "2026-07-01T23:50:00Z"
last_activity: 2026-07-01
last_activity_desc: "Phase 16 CLOSED — 16-02 SPLIT-02 executed + owner-approved; :3000 rebuilt and restarted; gsd-verifier PASSED 12/12. ROADMAP/REQUIREMENTS/STATE/SUMMARY statuses synced manually (gsd-tools phase-complete mangled STATE frontmatter — milestone/status/progress — repaired here). Next: /gsd:plan-phase 17."
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 8
  completed_plans: 3
  percent: 40
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.2 Structural Refactors — REF-01/REF-02/REF-03, all behavior-preserving behind v2.1's characterization tests. Phase 16 (REF-01 access-analysis monolith splits) is now complete; Phase 17 (HybridAnalyticsSurface split) is next.

## Current Position

- **Milestone:** v2.2 — Structural Refactors (opened 2026-07-01). Full scope: REF-01 (all 3 monoliths) + REF-02 (shared `folderPermQuery` extraction) + REF-03 (`AccFolderPermissionSummary` projection + raw-scan retirement). **Roadmap approved:** 5 phases (15–19), 8 requirements mapped 8/8.
- **Phase:** 17 of 19 — HybridAnalyticsSurface Split (SPLIT-03, SPLIT-04). NOT STARTED — plans TBD (needs `/gsd:plan-phase 17`).
- **Plan:** Phase 16 CLOSED. 16-01 (SPLIT-01) shipped `3cfd3734` + `71df53db`; 16-02 (SPLIT-02) shipped `0dbae11f` + `40126798` + `224519a4`; both owner-approved (visual parity on /access-analysis + /template-mty against fresh :3000 build 224519a4). Phase-goal verifier PASSED 12/12 (`16-VERIFICATION.md`). Phase 15 shipped `a4d923ca`; its plans committed `ce93372a`.
- **Status:** Phase 16 complete + verified + owner-approved. v2.2: 2 of 5 phases complete (3/8 plans). Milestone NOT complete — Phases 17, 18, 19 remain.
- **Last activity:** 2026-07-01 — Phase 16 closed (16-02 executed + owner-approved; :3000 rebuilt/restarted; verifier 12/12). Tracking files repaired after gsd-tools `phase complete` corrupted STATE frontmatter.

Progress: [####░░░░░░] 40% — v2.2: 2 of 5 phases complete (3/8 plans; Phase 16 done 2/2, owner-approved)

**Roadmap (Phases 15–19):**

| # | Phase | Reqs | Plans |
|---|-------|------|-------|
| 15 | Shared Query Extraction | QUERY-01 | 1/1 ✅ |
| 16 | Monolith Splits (access-analysis) | SPLIT-01, SPLIT-02 | 2/2 ✅ (owner-approved) |
| 17 | HybridAnalyticsSurface Split | SPLIT-03, SPLIT-04 | 0/2 — plans TBD |
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

- **REF-01 access-analysis splits shipped (2026-07-01, Phase 16).** `folderTerrain.ts` → `folderTerrainModel`/`folderTerrainLayout`/`folderTerrainScene`/`folderTerrainCamera` + thin barrel (SPLIT-01). `FolderPermissionTerrain.tsx` → `useFolderPermissionTerrainCamera` (hook) + `terrainViewModel` (pure) + `TerrainStage`/`TerrainControls` (presentational) + thin shell (SPLIT-02). All 9 files ≤ ~400 lines; pinning tests byte-identical; owner visual parity confirmed. The remaining monolith is `HybridAnalyticsSurface.tsx` (Phase 17, SPLIT-03/04).

- **Behavior-preserving refactors only.** REF-01/REF-02/REF-03 must keep their
  characterization tests (TEST-02 `folderPermissionTerrainView.test.ts`, TEST-03
  `templateFolderTerrain.sharedQuery.test.ts`, TEST-01 OOM guard) byte-identical /
  green. No workshop-visible change.

- **Sequence:** REF-02 (extract shared `folderPermQuery.ts`) lands before/with the
  REF-01 splits so both `/template-mty` and `/access-analysis` consume one owned query;
  REF-03 (summary projection) builds on the centralised query.

- **`HybridAnalyticsSurface.tsx` pin is thin** — only `HybridAnalyticsSurface.fallback.test.tsx`
  (fallback path). Widen its characterization net (main DuckDB-Wasm path) BEFORE splitting.
  This is Phase 17's SPLIT-03 gate.

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

- None blocking v2.2. Risks tracked above (REF-03 migration/backfill/refresh;
  thin `HybridAnalyticsSurface` pin — widen it first in Phase 17 SPLIT-03).

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

Phase 16 is CLOSED — both plans shipped, verified (12/12), and owner-approved on a fresh
`:3000` build. The remaining REF-01 monolith is `HybridAnalyticsSurface.tsx`.
**Next: `/gsd:plan-phase 17`** (HybridAnalyticsSurface Split — plans are TBD; `/clear` first —
fresh context window). Then `/gsd:execute-phase 17`.

- **Phase 17 (SPLIT-03, SPLIT-04):** SPLIT-03 first widens the `HybridAnalyticsSurface.tsx`
  characterization net to pin the **main DuckDB-Wasm query path** (today only
  `HybridAnalyticsSurface.fallback.test.tsx` covers the fallback), green BEFORE any split.
  Then SPLIT-04 splits the 1,328-line file into a DuckDB-client data-hook + pure transform +
  thin view (each ≤ ~400 lines). Gate: all characterization tests byte-identical, tsc 0,
  `/users/access-analysis` renders identically, `/users/spatial-graph` not touched.

Guardrails carried forward: byte-identical characterization tests (no test edits), ~400-line
ceiling per file, explicit-path commits with `git diff --cached --name-only` proof,
`npx tsc --noEmit` before any rebuild, no new WebGL on data surfaces, zinc theme untouched,
`/users/spatial-graph` not touched.

---
*Last updated: 2026-07-01 — Phase 16 CLOSED (16-01 + 16-02 shipped, verifier 12/12, owner-approved on rebuilt :3000). STATE repaired after gsd-tools phase-complete corruption. v2.2: 2 of 5 phases done, 3/8 plans. Next: /gsd:plan-phase 17.*

## Session

**Last session:** 2026-07-01T23:50:00Z (execute-phase 16 → 16-02 + phase close)
**Stopped at:** Phase 16 complete + owner-approved (rebuilt :3000, verifier PASSED 12/12); STATE/ROADMAP/REQUIREMENTS synced
**Resume file:** `.planning/ROADMAP.md` (Phase 17 details) → `/gsd:plan-phase 17`
