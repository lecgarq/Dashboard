---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Structural Refactors
current_phase: 15
current_phase_name: shared-query-extraction
status: ready-to-plan
stopped_at: Phase 15 context gathered (2026-07-01) — QUERY-01 design locked (base-join-only; one loadFolderPermRows(projectId,{l2Only}) returning raw snake_case rows; plain tagged-template $queryRaw to keep TEST-03/TEST-02 byte-identical); ready to /gsd:plan-phase 15
last_updated: "2026-07-01T00:00:00.000Z"
last_activity: 2026-07-01
last_activity_desc: "v2.2 Structural Refactors: 8 requirements + 5-phase roadmap (15–19) defined and owner-approved. QUERY-01→Ph15, SPLIT-01/02→Ph16, SPLIT-03/04→Ph17, PROJ-01→Ph18, PROJ-02/03→Ph19. Next = /gsd:discuss-phase 15 (Phase 15 = REF-02 folderPermQuery extraction, the foundation for the splits + projection)."
progress:
  total_phases: 5
  completed_phases: 0
  total_plans: 8
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-07-01)

**Core value:** Truthful, fast analytics over the fully extracted ACC dataset.
**Current focus:** v2.2 Structural Refactors — REF-01/REF-02/REF-03, all behavior-preserving behind v2.1's characterization tests. Defining requirements + roadmap.

## Current Position

- **Milestone:** v2.2 — Structural Refactors (opened 2026-07-01). Full scope: REF-01 (all 3 monoliths) + REF-02 (shared `folderPermQuery` extraction) + REF-03 (`AccFolderPermissionSummary` projection + raw-scan retirement). **Roadmap approved:** 5 phases (15–19), 8 requirements mapped 8/8.
- **Phase:** 15 of 19 — Shared Query Extraction (QUERY-01). Not started; ready to plan.
- **Plan:** — (roadmap seeds 8 plans across 15–19; `/gsd:plan-phase 15` formalizes 15-01)
- **Status:** Roadmap approved — ready to plan Phase 15.
- **Last activity:** 2026-07-01 — v2.1 shipped + tagged `v2.1`; v2.2 requirements + roadmap defined and owner-approved.

Progress: [░░░░░░░░░░░░] 0% — v2.2 roadmap approved (0 of 5 phases)

**Roadmap (Phases 15–19):**

| # | Phase | Reqs | Plans |
|---|-------|------|-------|
| 15 | Shared Query Extraction | QUERY-01 | 0/1 |
| 16 | Monolith Splits (access-analysis) | SPLIT-01, SPLIT-02 | 0/2 |
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
- **Pre-existing branch WIP:** 2 failing tests in
  `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` are
  unrelated uncommitted WIP — a full `npm test` is not 100% green until resolved. Resolve
  early in v2.2 since REF-01 touches that surface.
- Branch is `feat/access-analysis-redesign` with heavy uncommitted WIP + the `.planning/`
  migration deletions in the working tree. **Commit by explicit path only** (never `-A`/`.`);
  check `git diff --cached --name-only` before every commit.

## Next Action

v2.2 requirements + roadmap are defined and owner-approved (5 phases, 15–19). Start
execution with **`/gsd:discuss-phase 15`** (or `/gsd:plan-phase 15` to skip discussion).
Phase 15 = REF-02 (extract `lib/server/folderPermQuery.ts`) — the foundation the REF-01
splits (Phases 16–17) and the REF-03 projection (Phases 18–19) both build on. `/clear`
first for a fresh context window.

Early housekeeping to fold into v2.2 execution: resolve the 2 pre-existing WIP failures
in `FolderPermissionTerrain.test.tsx` (Phase 16 touches that surface).

---
*Last updated: 2026-07-01 — v2.2 (Structural Refactors) requirements + roadmap defined and owner-approved (5 phases, 15–19). Ready to plan Phase 15.*

## Session

**Last session:** 2026-07-01
**Stopped at:** Phase 15 context gathered — QUERY-01 (REF-02) extraction design locked
**Resume file:** .planning/phases/15-shared-query-extraction/15-CONTEXT.md → /gsd:plan-phase 15
