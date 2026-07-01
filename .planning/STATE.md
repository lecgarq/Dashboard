---
gsd_state_version: 1.0
milestone: v2.2
milestone_name: Structural Refactors
current_phase: 15
current_phase_name: defining-requirements
status: defining-requirements
stopped_at: v2.2 started (2026-07-01) — REF-01/REF-02/REF-03 scope confirmed; requirements + roadmap being defined
last_updated: "2026-07-01T00:00:00.000Z"
last_activity: 2026-07-01
last_activity_desc: "v2.2 Structural Refactors milestone opened. Owner confirmed full scope: REF-01 (split all 3 access-analysis monoliths), REF-02 (extract lib/server/folderPermQuery.ts), REF-03 (materialise AccFolderPermissionSummary + retire the includePermissionContexts raw scan). PROJECT.md updated with Current Milestone section; REQUIREMENTS.md + ROADMAP.md being written. Phase numbering continues at 15."
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
**Current focus:** v2.2 Structural Refactors — REF-01/REF-02/REF-03, all behavior-preserving behind v2.1's characterization tests. Defining requirements + roadmap.

## Current Position

- **Milestone:** v2.2 — Structural Refactors (opened 2026-07-01). Full scope: REF-01 (all 3 monoliths) + REF-02 (shared `folderPermQuery` extraction) + REF-03 (`AccFolderPermissionSummary` projection + raw-scan retirement).
- **Phase:** Not started — defining requirements, then roadmap. Phase numbering continues at **15**.
- **Plan:** —
- **Status:** Defining requirements.
- **Last activity:** 2026-07-01 — v2.1 (Concerns Hardening) shipped + tagged `v2.1`; v2.2 opened with owner-confirmed refactor scope.

Progress: [░░░░░░░░░░░░] 0% — v2.2 defining requirements

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

v2.2 requirements + roadmap are being defined now (this `/gsd:new-milestone` run). After
the roadmap is approved: `/gsd:discuss-phase 15` (or `/gsd:plan-phase 15`) to start
execution — recommended first phase is REF-02 (extract `folderPermQuery.ts`) since the
REF-01 splits and REF-03 projection both build on the centralised query.

---
*Last updated: 2026-07-01 — v2.2 (Structural Refactors) opened; requirements/roadmap in progress. Interim reset; the phase table is filled when the roadmap is approved.*

## Session

**Last session:** 2026-07-01
**Stopped at:** v2.2 opened; defining requirements + roadmap via /gsd:new-milestone
**Resume file:** .planning/REQUIREMENTS.md → .planning/ROADMAP.md
