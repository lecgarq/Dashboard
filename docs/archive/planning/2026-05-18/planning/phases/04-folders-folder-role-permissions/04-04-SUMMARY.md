---
phase: 04-folders-folder-role-permissions
plan: 04
subsystem: api
tags: [aps, prisma, cron, folder-crawl, quick-sync, env-gate, weekly-cadence]

# Dependency graph
requires:
  - phase: 04-folders-folder-role-permissions/04-01
    provides: mapActions() — used to compute permType at ingest
  - phase: 04-folders-folder-role-permissions/04-02
    provides: crawlProjectFolders() BFS library — wrapped by extractAndPersistFolders
  - phase: 04-folders-folder-role-permissions/04-03
    provides: AccProject.folderCrawlStatus column — written per project
provides:
  - extractAndPersistFolders() — Prisma-writing wrapper around crawlProjectFolders + mapActions
  - FOLDER_CRAWL_IN_RELEASE env gate in runQuickSync (defaults OFF to honor SYNC-01)
  - scripts/folder-crawl-cron.cjs — standalone weekly runner (production path)
affects: [04-05-folder-matrix, 04-06-folder-widget, 04-07-orphan-detection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-library + thin-persistence-wrapper: folderCrawl.ts keeps crawlProjectFolders pure; extractAndPersistFolders owns Prisma + permType mapping"
    - "Env-gated heavy work in release path: FOLDER_CRAWL_IN_RELEASE=true opt-in for full-hub crawl that would otherwise exceed SYNC-01 watchdog"
    - "tsx/cjs runtime hook for CJS cron → TS helper (mirrors deep-sync-ingest.cjs, dry-run-folder-crawl.cjs)"
    - "Additive upserts (no soft-delete) for folders + permissions — matches Phase 2 MemberAggregator decision: stale rows tolerable, missing rows zero the matrix"

key-files:
  created:
    - scripts/folder-crawl-cron.cjs
    - .planning/phases/04-folders-folder-role-permissions/04-04-SUMMARY.md
  modified:
    - lib/acc/folderCrawl.ts
    - lib/acc/quick-sync-extraction.ts

key-decisions:
  - "Folder extraction in runQuickSync is gated by FOLDER_CRAWL_IN_RELEASE=true (defaults OFF). Full-hub crawl is ~48min best / ~4h worst (CRAWL-ESTIMATE.md), which exceeds the 5-min release watchdog (SYNC-01). The weekly cron is the production path."
  - "Cadence = WEEKLY per Luis-approved decision in Plan 04-02 (recorded in CRAWL-ESTIMATE.md). Recommended Railway cron schedule: '0 4 * * 0' (Sunday 04:00 UTC)."
  - "permType null floor = 'View Only'. mapActions() returns null for empty/unknown-only inputs; persisting raw actions[] alongside permType lets render time reconstruct extended-tier info without a schema change."
  - "Additive-only persistence — extractAndPersistFolders never deletes AccFolder or AccFolderPermission rows. Stale-row tolerance matches Phase 2 cache writer (Pitfall 2 round-trip)."
  - "release.cjs untouched. The Phase-2-era spawn (npx tsx lib/acc/quick-sync-extraction.ts) already invokes runQuickSync; the env gate inside runQuickSync is the only release-path control surface needed."
  - "DB-write failures during upsert downgrade ok → partial (not failed) so partial progress is honored. Crawl-level failures (thrown by crawlProjectFolders) still produce status='failed' + matching AccProject.folderCrawlStatus."

patterns-established:
  - "Heavy-work gate pattern: when a Plan adds work that exceeds a release-step time budget, gate via env flag defaulting OFF and ship a separate cron entry as the production path."
  - "DB-write downgrade semantics: a downstream persistence failure should never UPGRADE a crawl's status, only downgrade ok → partial."

requirements-completed: [FLDR-01, FLDR-02]

# Metrics
duration: 12min
completed: 2026-05-12
---

# Phase 04 Plan 04: Folder-Crawl Runtime Wiring Summary

**`extractAndPersistFolders()` wraps the pure BFS crawl with Prisma upserts + `mapActions()` permType ingest + `AccProject.folderCrawlStatus` write; release path gated by `FOLDER_CRAWL_IN_RELEASE=true` (defaults OFF) so the weekly cron (`scripts/folder-crawl-cron.cjs`) owns production crawl on the Luis-approved WEEKLY cadence.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-12T16:24:00Z
- **Completed:** 2026-05-12T16:36:00Z
- **Tasks:** 3 (all `type=auto`)
- **Files created:** 2
- **Files modified:** 2

## Accomplishments

- `lib/acc/folderCrawl.ts` — exported `extractAndPersistFolders(prisma, hubId, project, accessToken)`:
  - Wraps `crawlProjectFolders(dryRun:false)` with `b.`-prefix split (DM vs permissions)
  - Batched (50/batch) `AccFolder.upsert` + `AccFolderPermission.upsert` under `pLimit(5)`
  - `permType = mapActions(actions).tier ?? "View Only"` (null-tier defensive floor)
  - Writes `AccProject.folderCrawlStatus` ('ok' | 'partial' | 'failed') per project
  - DB-write failures downgrade 'ok' → 'partial' (never deletes existing rows)
- `lib/acc/quick-sync-extraction.ts` — `runQuickSync` now invokes folder extraction post-fan-out at `pLimit(5)`, **gated by `FOLDER_CRAWL_IN_RELEASE === "true"`** (default OFF per SYNC-01 5-min watchdog vs. ~48min-best crawl). Resolves hubId from `Project.apsHubId` with skip-with-warning if unconfigured.
- `scripts/folder-crawl-cron.cjs` — standalone weekly runner. Same fan-out shape as runQuickSync's gated block but unconstrained by the release watchdog. Uses tsx/cjs to require the TS extractor directly.
- `scripts/release.cjs` — unchanged. The Phase-2 spawn already invokes `runQuickSync`; the env gate inside runQuickSync is the entire release-path control surface.

## Task Commits

1. **Task 1: Add `extractAndPersistFolders()` wrapper** — `ca62cd8` (feat)
2. **Task 2: Integrate into `runQuickSync` (env-gated)** — `4276b92` (feat)
3. **Task 3: Standalone weekly cron script** — `76238a0` (feat)

## Files Created/Modified

- **created** `scripts/folder-crawl-cron.cjs` — weekly cron entry; resolves hubId + token + active projects, fans out `extractAndPersistFolders` at pLimit(5)
- **created** `.planning/phases/04-folders-folder-role-permissions/04-04-SUMMARY.md` — this file
- **modified** `lib/acc/folderCrawl.ts` — added `extractAndPersistFolders` + Prisma/mapActions imports
- **modified** `lib/acc/quick-sync-extraction.ts` — added gated folder-extraction step + extractAndPersistFolders import

## Decisions Made

See `key-decisions` in frontmatter. Headlines:

- **Release path gated OFF by default.** `FOLDER_CRAWL_IN_RELEASE=true` is the opt-in. Reasoning is locked: ~48min-best / ~4h-worst crawl vs 5-min watchdog (SYNC-01). The cron is production.
- **WEEKLY cadence locked from Plan 04-02.** Cron suggestion `0 4 * * 0` (Sunday 04:00 UTC). Easy to flip to nightly later — only Railway schedule needs to change.
- **Additive only.** `extractAndPersistFolders` never deletes; matches the Phase 2 MemberAggregator round-trip pattern (Pitfall 2).

## Deviations from Plan

None — plan executed exactly as written. Plan explicitly anticipated the env-gate path under the "CRAWL-ESTIMATE indicated ≥ 1 hour" branch in Task 2; CRAWL-ESTIMATE.md shows ~48min best-case / ~4h worst-case, so the gate is mandatory.

## Issues Encountered

None.

## User Setup Required

**Operator checkbox — Luis to wire after deploy:**

- [ ] In Railway dashboard, add a cron job for the deployed service:
  - **Schedule:** `0 4 * * 0` (Sunday 04:00 UTC) — adjustable
  - **Command:** `node scripts/folder-crawl-cron.cjs`
  - **Environment:** uses existing `APS_CLIENT_ID`, `APS_CLIENT_SECRET`, `DATABASE_URL` / `DIRECT_URL` (already configured for deep-sync-ingest cron)
- [ ] After first weekly run, spot-check: `prisma.accFolder.count()` > 0 and `prisma.accProject.findMany({ select: { folderCrawlStatus: true } })` shows mostly `ok` / `partial`

**Until the cron is wired, no folders will be persisted in production.** The release path is OFF by default. To manually trigger a one-off crawl, set `FOLDER_CRAWL_IN_RELEASE=true` for a single release, or run `node scripts/folder-crawl-cron.cjs` locally against the production DB.

## Next Phase Readiness

- **Plan 04-05 (folder matrix + orphan procedures):** unblocked — once the first cron run completes, `AccFolder` + `AccFolderPermission` rows are populated. Plan 04-05's `getMatrix` query has its data.
- **Plan 04-06 (FolderPermissionsWidget):** unblocked — binds against the procedures from 04-05.
- **Plan 04-07 (orphan detection follow-ups):** unblocked.

## Self-Check

Checked via Read/git-log/grep:
- FOUND: `lib/acc/folderCrawl.ts` (extractAndPersistFolders export)
- FOUND: `lib/acc/quick-sync-extraction.ts` (extractAndPersistFolders import + FOLDER_CRAWL_IN_RELEASE gate)
- FOUND: `scripts/folder-crawl-cron.cjs`
- FOUND commit `ca62cd8` (Task 1)
- FOUND commit `4276b92` (Task 2)
- FOUND commit `76238a0` (Task 3)
- VERIFIED: `npx tsc --noEmit` exits 0
- VERIFIED: `npx vitest run lib/acc/folderCrawl.test.ts` — 6/6 pass
- VERIFIED: `node --check scripts/folder-crawl-cron.cjs` — syntax OK

## Self-Check: PASSED

---
*Phase: 04-folders-folder-role-permissions*
*Completed: 2026-05-12*
