---
phase: 19-raw-scan-retirement-refresh
plan: 02
subsystem: acc-dc-ingest (cron) + planning docs
tags: [acc, cron, prisma, projection-refresh, staleness-bound]

requires:
  - phase: 19-01
    provides: "getCachedAccDcBulkUsers includePermissionSummary reads AccFolderPermissionSummary projection (PROJ-02) — makes the refresh-before-embedding ordering in this plan load-bearing"
provides:
  - "scripts/dc-daily-ingest.cjs success branch refreshes AccFolderPermissionSummary (non-fatal) as the FIRST step, before the person-graph rebuild and build-instance-features.ts"
  - ".planning/codebase/INTEGRATIONS.md documents the <=1-ingest-cycle staleness bound, the out-of-band folder-crawl caveat, and the manual rebuild fallback"
affects:
  - "Phase-close owner visual parity checkpoint (Task 2, PENDING — see below)"

tech-stack:
  added: []
  patterns:
    - "Cron re-invokes the existing idempotent server-side backfill script verbatim (single owner of the aggregate SQL) instead of extracting a shared helper — zero SQL duplication, zero drift risk"

key-files:
  created: []
  modified:
    - scripts/dc-daily-ingest.cjs
    - .planning/codebase/INTEGRATIONS.md

key-decisions:
  - "Refresh block placed as the FIRST step of the success branch (before person-graph rebuild AND before build-instance-features.ts) so the same ingest run's embedding build reads fresh projection data — matches 19-CONTEXT's load-bearing ordering requirement."
  - "Reused scripts/backfill-folder-perm-summary.cjs verbatim via execSync (static string, no interpolated input) rather than extracting a shared helper — the reused script IS the single SQL owner; stronger than a helper because cron and standalone backfill run the identical code path."

patterns-established:
  - "Non-fatal try/catch cron hook: a refresh failure never aborts ingest exit status, matching the existing person-graph/embedding pattern in the same file."

requirements-completed: [PROJ-03]

duration: ~25min
completed: 2026-07-02
status: complete
---

# Phase 19 Plan 02: Projection Refresh Cron Wiring (PROJ-03) Summary — COMPLETE (both tasks; owner visual parity approved 2026-07-02)

**`dc-daily-ingest.cjs` now re-runs `backfill-folder-perm-summary.cjs` (non-fatal, server-side) as the first success-branch step so `AccFolderPermissionSummary` never lags more than one ingest cycle; INTEGRATIONS.md documents the bound and the folder-crawl staleness caveat. Task 2 (owner visual parity on `/access-analysis` + `/template-mty`) is RESOLVED: after a fresh `:3000` rebuild (tsc 0, `npm run build` 0, scheduled task restarted, `/api/health` 200, workshop routes 307 auth-redirect — no 500s), the owner confirmed both pages render identically ("approved", 2026-07-02). This plan and Phase 19 are complete.**

## Performance

- **Duration:** ~25 min (Task 1 only)
- **Started:** 2026-07-02T21:37:25Z
- **Tasks:** 1 of 2 complete (Task 2 is `checkpoint:human-verify`, gate="blocking" — deliberately not attempted)
- **Files modified:** 2

## Accomplishments

- `scripts/dc-daily-ingest.cjs` success branch (`if (result.status === 'success')`) now runs a new non-fatal block FIRST — before the person-graph rebuild and before `build-instance-features.ts` — invoking `node scripts/backfill-folder-perm-summary.cjs` verbatim.
- `.planning/codebase/INTEGRATIONS.md` gained a new `**AccFolderPermissionSummary projection (REF-03):**` subsection (under the Folder crawl block) documenting WHAT/CONSUMER/REFRESH+STALENESS-BOUND/CAVEAT/MANUAL-FALLBACK.
- Re-ran the backfill against the live local DB: 22,082 rows inserted (904 projects x 107 roles filtered, well within the 96,728 upper bound).
- Re-ran reconciliation post-refresh: `VERDICT: PASS` (22,082 == 22,082, 0 full-outer-join mismatches, 20/20 spot-checks MATCH).

## Task Commits

1. **Task 1: Wire the projection refresh into the ingest cron + document the staleness bound** — `e34ec7e7` (feat)

**Plan metadata:** pending (this SUMMARY + STATE/ROADMAP sync commit follows)

Task 2 (`checkpoint:human-verify`, gate="blocking") was NOT executed — no commit exists for it, none is expected until the owner completes the visual parity check.

## Files Created/Modified

- `scripts/dc-daily-ingest.cjs` — new non-fatal refresh block, first step of the success branch, before the person-graph rebuild and `build-instance-features.ts`. Ingest logic, exit-code handling, kill-switch, and the existing person-graph/embedding blocks are otherwise unchanged (verified via `git diff`).
- `.planning/codebase/INTEGRATIONS.md` — new `AccFolderPermissionSummary projection (REF-03)` subsection: WHAT (materialised per-`(projectId, roleId)` rollup), CONSUMER (`lib/server/acc-hot-cache.ts`), REFRESH + STALENESS BOUND (`<=1 daily ingest cycle`), CAVEAT (folder-crawl updates the source table out-of-band, not the DC ingest), MANUAL FALLBACK (`node scripts/backfill-folder-perm-summary.cjs`).

## Verification Evidence

- **Syntax gate:** `node --check scripts/dc-daily-ingest.cjs` -> exit 0, no output (pass).
- **Backfill re-run (the exact command the cron now invokes):** `node scripts/backfill-folder-perm-summary.cjs` -> `inserted rows: 22082`, `n_projects (filtered): 904`, `n_roles (filtered): 107`, `upper bound (n_p x n_r): 96728`, `within bound: YES`, `Backfill complete.`
- **Reconciliation:** `node scripts/verify-folder-perm-summary.cjs` -> `live aggregate row count: 22082`, `projection row count: 22082`, `PASS row-count`, `full-outer-join mismatch count: 0`, `PASS full-diff`, `spot-checked keys (20): all MATCH`, `PASS spot-check`, `VERDICT: PASS`.
- **Type/build gate:** `npx tsc --noEmit` -> exit 0, no output (clean; no `.ts` file changed this plan, gate still run per plan verification step 4).
- **Full test suite:** `npm test` -> `Test Files 302 passed | 1 skipped (303)`, `Tests 2256 passed | 1 skipped (2257)` — identical counts to 19-01's baseline; cron/doc-only changes did not affect any test.
- **Scope fence:** `git diff --cached --name-only` before commit showed exactly `scripts/dc-daily-ingest.cjs` and `.planning/codebase/INTEGRATIONS.md` — no `app/`, terrain, or spatial-graph files. `git diff --diff-filter=D --name-only HEAD~1 HEAD` after commit -> empty (no accidental deletions).
- **Repo-map check:** not needed — no import graph, boundary, or data-flow change (cron script insertion + doc-only edit).

## Dashboard Evidence

- **Workshop surface:** repo-only (cron script + planning doc). No `app/` route, component, chart, or theme file touched.
- **Workshop impact:** none directly visible — this closes the freshness loop for `/access-analysis`'s permission dims (opened by 19-01's consumer switch) without changing what renders. The visual-parity confirmation is Task 2, still pending.
- **UI guardrails:** N/A — no UI files in scope this plan.
- **Scope guardrails:** `/users/spatial-graph` untouched; verified via scope-fence diff above.

## Data Truthfulness

- **Data sources:** `AccFolderPermissionSummary` (`prisma/schema.prisma`), refreshed by `scripts/backfill-folder-perm-summary.cjs` (server-side `TRUNCATE` + `INSERT...SELECT...GROUP BY`), reconciled by `scripts/verify-folder-perm-summary.cjs`.
- **Coverage limits:** the new INTEGRATIONS.md entry states the staleness bound honestly (`<=1 daily ingest cycle`) and the folder-crawl caveat (source table updates lag until the next ingest, independent of crawl cadence) rather than implying instant freshness.
- **No fake data:** the backfill and reconciliation commands above ran against the live local Postgres DB, not fixtures or mocks.

## Decisions Made

- Refresh block ordered FIRST in the success branch (ahead of person-graph rebuild and `build-instance-features.ts`) per 19-CONTEXT's load-bearing requirement — the same ingest run's embedding build now reads the freshly-refreshed projection.
- Reused `scripts/backfill-folder-perm-summary.cjs` verbatim via `execSync('node scripts/backfill-folder-perm-summary.cjs', { stdio: 'inherit' })` — a static string literal with no interpolated input, matching the two existing `execSync` calls already in the same file (`rebuild-person-graph.ts`, `build-instance-features.ts`). A repo hook flagged `execSync` generically as a command-injection pattern; reviewed and confirmed not applicable — no user/external input reaches the command string.

## Deviations from Plan

None - plan Task 1 executed exactly as written (interfaces block in 19-02-PLAN.md matched the live file byte-for-byte; the new block was inserted at the documented insertion point with the documented comment content).

## Issues Encountered

None for Task 1. Task 2 was not attempted per the plan's own `gate="blocking"` designation and the executor's explicit instruction not to rebuild/restart `:3000` or auto-approve an owner-visual-parity checkpoint.

## User Setup Required

None - no external service configuration required. Task 2 requires the OWNER (not an automated setup step) to perform a `:3000` rebuild + visual check; see Checkpoint section below.

## Dashboard Self-Check

- [x] Exact repo paths used; no invented `src/...` paths (`scripts/dc-daily-ingest.cjs`, `.planning/codebase/INTEGRATIONS.md` both verified present before editing)
- [x] Relevant Dashboard skill/project instructions followed (explicit-path commits only, `git diff --cached --name-only` checked before commit, `.planning/config.json` and the pre-existing `.planning/` deletion WIP left untouched)
- [x] Data coverage is truthful and labeled (staleness bound + folder-crawl caveat documented honestly)
- [x] Zinc/no-new-WebGL/`/users/spatial-graph` guardrails checked — N/A this plan (no UI files touched); scope-fence diff confirms no `app/` or terrain files
- [x] Claims backed by command output (all verification commands run against the live local DB, output captured above)

## Next Phase Readiness

**This plan is COMPLETE.** Task 1 (automated) done and committed (`e34ec7e7`). Task 2 (`gate="blocking"` `checkpoint:human-verify` — the phase-close SC#3 owner visual parity gate) is RESOLVED. The rebuild was executed with the owner's explicit go:
1. `npx tsc --noEmit` → exit 0.
2. Scheduled task "LECG Dashboard Local" stopped; `:3000` freed (killed the port owner).
3. `npm run build` (`next build --webpack`) → exit 0, full route manifest emitted.
4. Scheduled task restarted → State=Running; `:3000` listening.
5. `/api/health` → 200; `/access-analysis`, `/template-mty`, `/users/access-analysis`, `/forma-proposal`, `/users` → 307 (auth redirect — server healthy, no 500s).
6. Owner visited `/access-analysis` + `/template-mty` and confirmed identical render → **"approved" (2026-07-02)**.

This was the last plan of the last phase (19) of milestone v2.2. With Task 2 approved, Phase 19 and milestone v2.2 close.

---
*Phase: 19-raw-scan-retirement-refresh*
*Task 1 completed: 2026-07-02 — Task 2 (owner visual parity checkpoint) APPROVED 2026-07-02*

## Self-Check: PASSED

- FOUND: `scripts/dc-daily-ingest.cjs` (modified, commit `e34ec7e7`)
- FOUND: `.planning/codebase/INTEGRATIONS.md` (modified, commit `e34ec7e7`)
- FOUND: `.planning/phases/19-raw-scan-retirement-refresh/19-02-SUMMARY.md`
- FOUND commit `e34ec7e7` in `git log --oneline`
