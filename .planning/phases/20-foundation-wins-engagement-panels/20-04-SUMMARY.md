---
phase: 20-foundation-wins-engagement-panels
plan: 04
subsystem: ui
tags: [prisma, vitest, react, ecommerce-analytics, ingest-pipeline]

requires:
  - phase: 20-foundation-wins-engagement-panels (plan 19, Ph19)
    provides: "AccDcIngestRun model + dc-daily-ingest.cjs cron refresh convention"
provides:
  - "loadIngestFreshness() server loader — latest AccDcIngestRun + live AccActivity throughput count"
  - "ingestStaleness/statusTone/formatRunDuration pure transforms (open-string status handling)"
  - "IngestFreshnessPanel component — muted ops-metadata strip, not yet mounted"
affects: [20-05]

tech-stack:
  added: []
  patterns:
    - "lib/server/<name>View.ts loader + sibling <name>View.test.ts (mocked @/server/db, no real DB)"
    - "app/(dashboard)/access-analysis/<name>Counts.ts pure transform + shared __tests__/ directory"
    - "status treated as an open string, never a fixed enum — unrecognized values map to a neutral badge with the raw label instead of crashing/blanking"

key-files:
  created:
    - lib/server/ingestFreshnessView.ts
    - lib/server/ingestFreshnessView.test.ts
    - "app/(dashboard)/access-analysis/ingestFreshnessCounts.ts"
    - "app/(dashboard)/access-analysis/__tests__/ingestFreshnessCounts.test.ts"
    - "app/(dashboard)/access-analysis/components/IngestFreshnessPanel.tsx"
    - "app/(dashboard)/access-analysis/__tests__/IngestFreshnessPanel.test.tsx"
  modified: []

key-decisions:
  - "STALE_THRESHOLD_HOURS = 36, exact boundary is stale strictly greater than 36h (35.9h fresh / 36.1h stale / exactly 36.0h still fresh) — Claude's-discretion value per CONTEXT.md, aligned with the ≤1-ingest-cycle staleness convention from Ph19"
  - "statusTone maps success/positive, running/neutral('in progress'), partial+quarantined/caution, failed/negative, any other value/neutral with the raw string as label — status treated as an open string per Pitfall 4, never a fixed enum"
  - "No TTL cache on loadIngestFreshness (unlike sibling loaders) — CONTEXT.md requires a static per-page-load read that must not be stale from a 5-min cache window"
  - "Panel uses text-destructive (not a hardcoded red) for the negative tone, matching the repo's --destructive CSS variable already resolved in app/globals.css for both themes"

patterns-established:
  - "Muted ops-metadata strip pattern: small stat tiles, text-[10px]/text-xs, bg-muted/20 border-border container, no PremiumSurface/SectionHeader — deliberately visually secondary to analytics-headline panels"

requirements-completed: [PIPE-01]

duration: 5min
completed: 2026-07-03
status: complete
---

# Phase 20 Plan 04: Ingest Freshness Panel Summary

**PIPE-01 vertical slice: `loadIngestFreshness()` server loader (latest `AccDcIngestRun` + live `AccActivity` throughput by `ingestRunId`, `rowsByModule` never read), pure `ingestStaleness`/`statusTone`/`formatRunDuration` transforms, and a muted `IngestFreshnessPanel` ops-metadata strip — not yet mounted on `/access-analysis` (plan 20-05 owns page wiring).**

## Performance

- **Duration:** ~5 min (task work; commit timestamps 09:20:51–09:25:02)
- **Tasks:** 3/3 completed
- **Files created:** 6 (0 modified)

## Accomplishments
- `lib/server/ingestFreshnessView.ts` — `loadIngestFreshness()` reads the latest `AccDcIngestRun` (id/startedAt/endedAt/status/projectsProcessed only — `rowsByModule` never selected, per the standing always-zero guardrail) and a live `db.accActivity.count({ where: { ingestRunId } })` for throughput; returns `null` on an empty DB.
- `app/(dashboard)/access-analysis/ingestFreshnessCounts.ts` — pure `ingestStaleness` (36h threshold, injected `now`), `statusTone` (open-string status → `positive`/`caution`/`negative`/`neutral`, unrecognized values never blank/crash), `formatRunDuration` ("1h 23m" / "12m" / "in progress").
- `app/(dashboard)/access-analysis/components/IngestFreshnessPanel.tsx` — single slim row of muted stat tiles (last ingest, ended, status badge, duration, projects processed, activity rows this run), amber stale badge past 36h, explicit "Account-wide — not affected by the project filter." caption, honest empty-state line when no runs exist.
- 21/21 new tests passing across the 3 files.

## Task Commits

Each task was committed atomically:

1. **Task 1: ingestFreshness server loader + sibling test** — files landed inside commit `c2ed73b7` ("feat(20-02): add signInRecency server loader...") due to a shared-working-tree staging race with a concurrent wave-1 plan executor (see Deviations below). Content is correct and verified (`git log --oneline -1 -- lib/server/ingestFreshnessView.ts` → `c2ed73b7`).
2. **Task 2: staleness/status/duration pure transform + test** — `1feb22f2` (feat)
3. **Task 3: IngestFreshnessPanel component + test** — `504d5095` (feat)

_No separate plan-metadata commit yet — STATE.md/ROADMAP.md updates below are committed as part of this plan's final docs commit._

## Files Created/Modified
- `lib/server/ingestFreshnessView.ts` — PIPE-01 server loader (`loadIngestFreshness`)
- `lib/server/ingestFreshnessView.test.ts` — mocked-DB unit tests (empty DB, rowsByModule-never-selected proof, ISO serialization)
- `app/(dashboard)/access-analysis/ingestFreshnessCounts.ts` — pure staleness/status/duration transforms
- `app/(dashboard)/access-analysis/__tests__/ingestFreshnessCounts.test.ts` — 13 tests incl. 36h boundary
- `app/(dashboard)/access-analysis/components/IngestFreshnessPanel.tsx` — muted ops-metadata strip component
- `app/(dashboard)/access-analysis/__tests__/IngestFreshnessPanel.test.tsx` — 5 tests (fresh/stale/unknown-status/null/account-wide caption)

## Decisions Made
- 36h stale threshold, strictly-greater-than comparison (exactly 36.0h old is still "fresh") — see key-decisions above.
- No TTL cache in the loader, unlike `projectCoverageView.ts`/`coordinationByProjectView.ts` — CONTEXT.md explicitly wants a static per-page-load read; a 5-min cache would risk showing stale freshness data on a fresh load, which defeats the panel's purpose.
- `statusTone` uses `text-destructive`/`bg-destructive/15` (repo's real semantic token, verified in `app/globals.css`) for the negative tone rather than a hardcoded `red-*` class, keeping zinc-theme consistency across light/dark.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking / shared-working-tree staging race] Task 1 files committed under a concurrent plan's commit message**
- **Found during:** Task 1 commit
- **Issue:** This repo checkout is not a git worktree (`.git` is a real directory), and wave 1 of Phase 20 runs multiple plan-executor agents concurrently against the SAME working directory and git index (confirmed via `.claude`/memory note "Staging index hazard"). Between staging `lib/server/ingestFreshnessView.ts`/`.test.ts` and running `git commit`, a concurrent agent (plan 20-02, `signInRecencyView.ts`) staged its own files into the same shared index; my commit swept in `permissionFootprintView.ts`/`.test.ts` (belonging to a different plan, likely 20-01) as well.
- **Fix:** Ran `git reset --soft HEAD~1` to undo the mis-scoped commit without touching the working tree or losing any file content. The concurrent agents then completed their own commits against the shared index in the interim (`c2ed73b7` for 20-02's `signInRecencyView.ts`, which also picked up my already-staged `ingestFreshnessView.ts`/`.test.ts` in the same race; `a966c610` for 20-03's `coordinationByProjectView.ts` change). No data was lost — every file's content is correct and verified present in git history. For Tasks 2 and 3, switched to `git commit -m "..." -- <exact paths>` (pathspec-scoped commit), which restricts the commit to only the named paths regardless of what else is staged in the shared index — this fully prevented any further sweep for the remaining two tasks.
- **Files affected:** `lib/server/ingestFreshnessView.ts`, `lib/server/ingestFreshnessView.test.ts` (content unaffected — only the commit attribution differs from what a clean single-plan execution would show).
- **Verification:** `git log --oneline -1 -- lib/server/ingestFreshnessView.ts` → `c2ed73b7`; `npx vitest run lib/server/ingestFreshnessView.test.ts` → 3/3 passing against the committed file.
- **Committed in:** `c2ed73b7` (not a commit this plan authored the message for)

---

**Total deviations:** 1 auto-fixed (1 blocking/process, no code-correctness impact)
**Impact on plan:** Zero impact on PIPE-01's shipped behavior — all 3 tasks' code and tests are correct, committed, and verified. The only effect is that Task 1's commit message/history attribution belongs to a concurrently-executing sibling plan rather than this one. Recommend the orchestrator run wave-1 plans with isolated git worktrees (per `superpowers:using-git-worktrees` / the executor's own worktree-mode guidance) to eliminate this class of race in future waves.

## Issues Encountered
None beyond the staging race documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- PIPE-01's loader, pure transform, and component are all built, tested (21/21 green), and typecheck-clean (`npx tsc --noEmit` shows zero errors attributable to any of the 6 new files).
- `rowsByModule` grep proof confirmed: it appears only in a code comment and test-assertion strings across all 6 new files — never read from a DB row.
- **Not yet mounted.** Plan 20-05 owns registering `loadIngestFreshness()` in `mainCharts.tsx`'s `Promise.all` fan-out and placing `<IngestFreshnessPanel />` as the compact strip at the very bottom of `/access-analysis`, per CONTEXT.md's locked page-placement decision.
- No edits were made to `mainCharts.tsx` or `AccessAnalysisCharts.tsx` in this plan, matching the plan's explicit success criterion.

---
*Phase: 20-foundation-wins-engagement-panels*
*Completed: 2026-07-03*

## Dashboard self-check

- **Context:** Loaded `.planning/STATE.md`, `20-04-PLAN.md`, `20-CONTEXT.md`, `20-RESEARCH.md`, `app/(dashboard)/access-analysis/relativeTime.ts`, `components/ui/stat-tile.tsx`, `components/AccessAnalysisCharts` sibling `CoordinationByProject.tsx`, `lib/server/projectCoverageView.ts`+`.test.ts`, `lib/server/coordinationByProjectView.ts`+`.test.ts`, `app/globals.css` (semantic color tokens), and `CLAUDE.md`/`SKILL.md`.
- **Scope:** `/access-analysis` only, new files under `lib/server/` and `app/(dashboard)/access-analysis/`; no touch of `/users/spatial-graph`, `mainCharts.tsx`, or `AccessAnalysisCharts.tsx` (verified via `git show --stat` on all 3 task commits).
- **Evidence:** `AccDcIngestRun`/`AccActivity` fields verified in the plan's `<interfaces>` block (sourced from `prisma/schema.prisma`); `formatRelativeTime`/`formatAbsolute` signatures read directly from `relativeTime.ts`; badge tone classes verified against real repo tokens (`--success`/`--warning`/`--destructive`/`--muted-foreground` in `app/globals.css`), not invented hex values.
- **Constraints applied:** zinc theme preserved (no new colors introduced, only existing CSS-variable-backed Tailwind classes); no new WebGL; no new npm dependency; `rowsByModule` never read (grep-proven); account-wide caption present; static per-page-load read with no polling/timers (`Date.now()` captured once via `useState(() => Date.now())`, no `setInterval`).
- **Gates:** `npx vitest run` on all 3 new test files (21/21 passing); `npx tsc --noEmit` shows zero errors attributable to the 6 new files (full-repo tsc has pre-existing unrelated errors/WIP noise not touched by this plan). `npm run build`/rebuild explicitly deferred to a later phase-close gate per plan scope (this is a not-yet-mounted vertical slice).
- **VERIFY:** none remaining for this plan's own scope — the ENG-01/ISSUE-01/PERM-01 Option-B/consolidation decisions belong to sibling plans 20-01/20-02/20-03 and are out of this plan's scope.

## Self-Check: PASSED

All 6 created files found on disk; all 3 referenced commit hashes (`c2ed73b7`, `1feb22f2`, `504d5095`) found in `git log --oneline --all`.

## Addendum: Final metadata commit

The final `docs(20-04): complete ingest freshness panel plan` commit (`8aa5f68a`) also
swept in `.planning/phases/20-foundation-wins-engagement-panels/20-02-SUMMARY.md` —
a second instance of the same shared-working-tree staging race documented above
(`gsd-tools query commit` internally globs/adds paths without a commit-time pathspec
restriction). The swept file is a complete, well-formed SUMMARY for the concurrently-
executing 20-02 plan (verified: full frontmatter + body present, not a partial write) —
no data loss, only commit-message misattribution, consistent with the Task 1 deviation.
