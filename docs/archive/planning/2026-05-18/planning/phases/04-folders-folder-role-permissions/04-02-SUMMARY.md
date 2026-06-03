---
phase: 04-folders-folder-role-permissions
plan: 02
subsystem: api
tags: [aps, bfs, p-limit, folder-crawl, vitest, dry-run, cadence-decision]

requires:
  - phase: 01-foundation
    provides: fetchWithRetry, get2LeggedAutodeskToken, AccProject schema
  - phase: 02-core-extraction
    provides: AccProject rows populated (1143 active)
  - phase: 04-folders-folder-role-permissions/04-01
    provides: permissionMapping.ts (consumed by Plan 04-04 ingest wrapper)
  - phase: 04-folders-folder-role-permissions/04-03
    provides: AccProject.folderCrawlStatus column + accFolders router scaffold
provides:
  - crawlProjectFolders() BFS+pLimit library with dryRun param (pure, no Prisma)
  - fetchFolderPermissions() with subjectType=ROLE filter at parse boundary
  - Vitest test coverage (BFS termination, pLimit cap, b.-prefix discipline, ROLE filter, hard-cap, fullPath)
  - scripts/dry-run-folder-crawl.cjs (read-only live-hub measurement script)
  - CRAWL-ESTIMATE.md artifact with approved cadence decision
  - Cadence decision (weekly) feeding Plan 04-04 cron schedule
affects: [04-04, 04-05, 04-06, 04-07]

tech-stack:
  added: [p-limit (already present)]
  patterns:
    - BFS-with-explicit-queue (never recurse — depth can exceed Node stack)
    - Soft-cap (5min warn) + hard-cap (15min abort with status='partial')
    - b.-prefix discipline split at function boundary (DM uses b.PROJ, Permissions uses bare UUID)
    - subjectType=ROLE filter at parse boundary (USER permissions discarded at ingest, never stored)
    - Pure library + thin CJS script + tsx/cjs runtime loader pattern (mirrors Phase 3)
    - dryRun=true returns in-memory arrays; caller (Plan 04-04) owns DB writes

key-files:
  created:
    - lib/acc/folderCrawl.ts
    - lib/acc/folderCrawl.test.ts
    - scripts/dry-run-folder-crawl.cjs
    - .planning/phases/04-folders-folder-role-permissions/CRAWL-ESTIMATE.md
    - .planning/phases/04-folders-folder-role-permissions/04-02-SUMMARY.md
  modified: []

key-decisions:
  - "Cadence: WEEKLY cron (not nightly). 13/1143 sample too small to commit to nightly; weekly gives headroom for the real distribution. Locks Plan 04-04 cron schedule at weekly."
  - "Scope: SKIP ARCHIVED IN-FLIGHT. Do NOT soft-delete ~526 archived projects; let the fast-fail 403 path (~200ms/project) handle them on each crawl. Soft-delete from a 13-project sample is a one-way risky operation; fast-fail surfaces drift cleanly."
  - "Library is pure — never touches Prisma. dryRun param signals intent; caller (Plan 04-04 extractAndPersistFolders wrapper) owns persistence."
  - "BFS with explicit queue (no recursion) — defends against deep folder trees blowing Node's stack."
  - "pLimit(5) per project (concurrency cap on APS folder-contents fetches). Sequential between projects in dry-run for clean per-project timings; parallelism between projects becomes Plan 04-04's choice."
  - "ROLE filter applied at parse boundary, not at query time — USER permissions never enter memory beyond the parse loop."
  - "Soft cap = 5 min warn-once; hard cap = 15 min abort with status='partial'+reason='hard_cap_exceeded'. Per-project failures continue with whatever was crawled."
  - "Dry-run script writes CRAWL-ESTIMATE.md from partial sample (13/1143) — sufficient for cadence decision because per-project timings extrapolate cleanly."

patterns-established:
  - "Pure-library + thin-script: library is testable with mocked fetch; script handles live token + Prisma + artifact write. Plan 04-04 will reuse the library inside extractAndPersistFolders()."
  - "Estimate-before-commit: dry-run produces CRAWL-ESTIMATE.md as an explicit human checkpoint before any cron wiring. Establishes the gate pattern for future expensive crawls."

requirements-completed: [FLDR-01, FLDR-02]

duration: ~25min
completed: 2026-05-11
---

# Phase 04 Plan 02: Folder Crawl Library + Dry-Run Cadence Decision Summary

**BFS folder-crawl library (pure, mocked-tested) + read-only dry-run script produced CRAWL-ESTIMATE.md; Luis approved WEEKLY cadence with skip-archived-in-flight scope for Plan 04-04 cron wiring.**

## Performance

- **Duration:** ~25 min (including live-hub dry-run sample)
- **Started:** 2026-05-11T23:25:00Z
- **Completed:** 2026-05-11T23:55:00Z (approval recorded)
- **Tasks:** 4 (3 auto + 1 human-verify gate)
- **Files modified:** 0
- **Files created:** 5

## Accomplishments

- `lib/acc/folderCrawl.ts` — BFS+pLimit(5) folder crawl, ROLE-filter permissions fetch, dryRun param, soft/hard time caps; pure (no Prisma)
- `lib/acc/folderCrawl.test.ts` — 6 Vitest groups (BFS termination, pLimit cap, b.-prefix split, ROLE filter, hard-cap abort, fullPath); all pass with mocked fetch
- `scripts/dry-run-folder-crawl.cjs` — live-hub read-only runner via tsx/cjs; iterates AccProject sequentially; writes CRAWL-ESTIMATE.md
- `CRAWL-ESTIMATE.md` — partial sample (13/1143 projects) with per-project table, hub extrapolation (~48 min best-case / ~4 h worst-case parallel), cadence recommendation
- **WEEKLY cadence decision recorded** (locks Plan 04-04 cron schedule)
- **SKIP-ARCHIVED-IN-FLIGHT scope decision recorded** (no soft-delete of ~526 archived projects; fast-fail 403 path handles them)
- Zero DB writes confirmed across the dry-run

## Task Commits

1. **Task 1: Implement folderCrawl.ts** — `fc4228c` (feat)
2. **Task 2: Vitest unit tests** — `b238193` (test)
3. **Task 3: Dry-run script + CRAWL-ESTIMATE.md** — `99b3f72` (feat)
4. **Task 4: Human approval gate** — `4ef5d7b` (docs — appended approval section + checked boxes)

## Files Created/Modified

- `lib/acc/folderCrawl.ts` — pure BFS+pLimit folder-crawl library (exported: `crawlProjectFolders`, `fetchFolderPermissions`, `FolderCrawlResult`)
- `lib/acc/folderCrawl.test.ts` — Vitest tests, all mocked, no live APS calls
- `scripts/dry-run-folder-crawl.cjs` — Node CJS script, loads TS via `require('tsx/cjs')`
- `.planning/phases/04-folders-folder-role-permissions/CRAWL-ESTIMATE.md` — sample data + cadence recommendation + approval section

## Decisions Made

See `key-decisions` in frontmatter. Headline:

- **Cadence = WEEKLY.** Sample (13/1143) too narrow to risk nightly; weekly gives the real distribution room. Flip to nightly later by changing only the Railway cron schedule.
- **Scope = SKIP ARCHIVED IN-FLIGHT.** ~526 archived projects fast-fail 403 in ~200ms each (~105s total per crawl) — cheaper than the risk of incorrectly soft-deleting an active project from a 13-project sample.

## Deviations from Plan

None — plan executed exactly as written. Sample was partial (13/1143) rather than full hub, but RESEARCH.md and the plan explicitly anticipated partial samples being sufficient for the cadence decision; the per-project timing distribution extrapolates cleanly.

## Issues Encountered

- **Hub-scale surprise:** DB has 1,143 active AccProjects (larger than CONTEXT.md "200+" estimate). ~46% of sampled projects return APS 403 ("Project is not active") — APS-archived but never soft-deleted in our DB. Documented in CRAWL-ESTIMATE.md; resolved by accepting fast-fail path in the approval (scope decision above) rather than a defensive soft-delete pass.
- **One large project (ACC Migracion Templates CDMX)** hit the 5-min soft cap during the sample run and stayed running — informed the worst-case ~4h parallel estimate.

## User Setup Required

None — no external services configured this plan.

## Next Phase Readiness

- **Plan 04-04 unblocked** with explicit cadence (weekly) and scope (skip archived in-flight) inputs. Cron schedule: weekly. extractAndPersistFolders() can be a thin wrapper around `crawlProjectFolders()` with `dryRun: false` + Prisma writes.
- **Plan 04-05** unblocked — depends only on the persisted data shape (AccFolder + AccFolderPermission rows), not cadence.
- **Plan 04-06 / 04-07** continue per existing dependency graph.

## Self-Check

Checked via Read/git-log:
- FOUND: lib/acc/folderCrawl.ts
- FOUND: lib/acc/folderCrawl.test.ts
- FOUND: scripts/dry-run-folder-crawl.cjs
- FOUND: .planning/phases/04-folders-folder-role-permissions/CRAWL-ESTIMATE.md
- FOUND commit fc4228c (Task 1)
- FOUND commit b238193 (Task 2)
- FOUND commit 99b3f72 (Task 3)
- FOUND commit 4ef5d7b (Task 4 approval)

## Self-Check: PASSED

---
*Phase: 04-folders-folder-role-permissions*
*Completed: 2026-05-11*
