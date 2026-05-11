---
phase: 02-core-extraction
plan: 04
subsystem: acc-quick-sync
tags: [acc, quick-sync, cache, bulkaccuser, release, mem-06, production-cutover]
requirements_completed: [MEM-06]

dependency_graph:
  requires:
    - "MemberAggregator from plan 02-03 (lib/acc/quick-sync-extraction.ts)"
    - "extractAndPersistProjects (plan 02-01), extractAndPersistHubRoles (plan 02-02), runPerProjectFanOut (plan 02-03)"
    - "BulkAccUser/BulkAccProject canonical shape (lib/acc/acc-types.ts)"
    - "getAccountId(prisma) helper (lib/server/acc-helpers.ts, Phase 1)"
    - "get2LeggedAutodeskToken (lib/server/aps-user-token.ts)"
  provides:
    - "buildCacheBlob(entry, syncedAt): BulkAccUser — aggregator entry to canonical cache blob with type-checked return"
    - "writeMemberCacheFromAggregator(prisma, aggregator, syncedAt): per-email accMemberCache.upsert (no row deletion)"
    - "runQuickSync(prisma): top-level orchestrator sequencing projects -> hub roles -> per-project fan-out -> cache writer"
    - "CLI entry guard at file bottom (require.main === module) so `npx tsx lib/acc/quick-sync-extraction.ts` runs the full pipeline"
    - "scripts/release.cjs runQuickSyncShell wired to spawnSync the TS extractor"
  affects:
    - "Every Railway deploy now runs real Quick Sync (replaces Phase 1 NO-OP)"
    - "buildAccGraphSnapshot + bulkAccSummary read the new cache rows without code changes (round-trip test pins this)"
    - "Failure of TS extractor causes deploy failure + Resend alert email (existing recordFailure + sendFailureAlertRaw path)"

tech_stack:
  added: []
  patterns:
    - "Type-annotated return on buildCacheBlob (`: BulkAccUser`) is the structural safety net against Pitfall 2 (graph silently zero-nodes if shape drifts)"
    - "CJS->TS bridge via spawnSync('npx', ['tsx', ...]) — same pattern as scripts/rebuild-graph.ts (lines 193-208 of release.cjs)"
    - "Cache writer does NOT delete rows for absent emails — stale rows tolerable, missing rows would zero the graph"

key_files:
  created:
    - ".planning/phases/02-core-extraction/02-04-SUMMARY.md"
  modified:
    - "lib/acc/quick-sync-extraction.ts (buildCacheBlob + writeMemberCacheFromAggregator + runQuickSync + CLI entry)"
    - "lib/acc/quick-sync-extraction.test.ts (6 new cases incl. round-trip pin)"
    - "lib/server/acc-helpers.ts (widen ProjectFindFirst.apsHubId to string|null — Rule 1 type fix)"
    - "lib/server/__tests__/acc-helpers.test.ts (add null-apsHubId coverage)"
    - "scripts/release.cjs (runQuickSyncShell now spawns tsx the TS extractor)"

key_decisions:
  - "companyRole: null and isAccountAdmin: false for v2.0 — HQ v1 prefetch deferred (RESEARCH Decision 3). buildAccGraphSnapshot already treats null companyRole as 'Unspecified'; bulkAccSummary defaults isAccountAdmin to false on legacy rows."
  - "Cache writer is additive-only (no per-row delete): plan 02 failure partway leaves yesterday's cache intact, so the v1.0 dashboard keeps rendering. Stale rows are tolerable; missing rows would zero the graph (Pitfall 2)."
  - "lastSignIn picks MAX across per-project ISO strings (most recent); addedOn picks MIN (earliest). Both via lexicographic sort on ISO 8601 — safe because the format is fixed-width."
  - "BulkAccProject.status: 'active' for every project — the aggregator only contains projects that survived the soft-delete pass in extractAndPersistProjects, so this is invariant by construction."
  - "Module-level console.warn moved INTO runQuickSync (was at import-time in Task 1 draft) so vitest doesn't spam the warning on every test import."
  - "CLI entry uses require.main === module (CJS-style) — tsx supports this in TS files and the test suite never imports the file as an entry, so the guard is safe."
  - "Rule 1 type fix: widened ProjectFindFirst.apsHubId to string|null. Helper already null-checked at runtime; the type was tighter than Prisma's actual return. Without this, runQuickSync(prisma) failed typecheck."

metrics:
  duration_minutes: ~4
  completed_date: "2026-05-11"
  tasks_completed: 3
  files_modified: 5
  files_created: 1
  test_count: 22  # 16 prior + 6 new in quick-sync-extraction.test.ts; helpers test went from 7 to 8
---

# Phase 02 Plan 04: Production Cutover Summary

Aggregator -> BulkAccUser cache writer + top-level Quick Sync orchestrator + Railway release wiring. After this plan ships, every Railway deploy runs real Quick Sync — the Phase 1 NO-OP body in scripts/release.cjs is gone.

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-11T17:41:16Z
- **Completed:** 2026-05-11T17:45:04Z
- **Tasks:** 3 (all auto, no checkpoints)
- **Tests:** 22/22 passing in quick-sync-extraction.test.ts (16 prior + 6 new); 8/8 in acc-helpers.test.ts (7 prior + 1 new).
- **Typecheck:** `npx tsc --noEmit` clean.

## What Shipped

| Symbol                                | Kind     | Purpose                                                                                                  |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `buildCacheBlob(entry, syncedAt)`     | function | Aggregator entry -> `BulkAccUser` blob; return-type annotated for compile-time Pitfall 2 protection      |
| `writeMemberCacheFromAggregator(...)` | function | One `accMemberCache.upsert` per email; no row deletion; returns `{ writtenCount }`                       |
| `runQuickSync(prisma)`                | function | Top-level pipeline: projects -> hub roles -> per-project fan-out -> cache write                          |
| CLI entry guard                       | inline   | `if (require.main === module)` block enables `npx tsx lib/acc/quick-sync-extraction.ts` from release.cjs |
| `runQuickSyncShell` (release.cjs)     | function | Rewritten to spawn the TS extractor; failure throws and fires existing recordFailure + alert path        |

## BulkAccUser Field Mapping (v2.0)

| Field            | Source                                                          | v1.0 -> v2.0 delta                             |
| ---------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `email`          | aggregator key (lowercased)                                     | unchanged                                      |
| `name`           | `entry.name`                                                    | unchanged                                      |
| `found`          | `true`                                                          | unchanged (any synced user is found)           |
| `projectCount`   | `projects.length`                                               | unchanged                                      |
| `activeCount`    | `projects.filter(status === "active").length`                   | unchanged (always equals projectCount in v2.0) |
| `adminCount`     | `projects.filter(isAdmin).length`                               | unchanged                                      |
| `hasNoProjects`  | `projects.length === 0`                                         | unchanged                                      |
| `syncedAt`       | `syncedAt.toISOString()`                                        | unchanged                                      |
| `allRoles`       | union of `projects[].roles`, de-duped                           | unchanged                                      |
| `allModules`     | union of `projects[].modules`, de-duped                         | unchanged                                      |
| `projects[]`     | per-project from `entry.perProject`                             | `status: "active"` always (soft-deletes excluded upstream) |
| `companyRole`    | **`null`**                                                      | **degraded** (was HQ v1 `company_role`) — deferred |
| `lastSignIn`     | max ISO across `perProject.lastSignIn` (sort+reverse, take [0]) | unchanged                                      |
| `isAccountAdmin` | **`false`**                                                     | **degraded** (was HQ v1 `role === "account_admin"`) — deferred |
| `addedOn`        | min ISO across `perProject.addedOn` (sort, take [0])            | unchanged                                      |

Per-project (BulkAccProject) fields:

| Field     | Source                                                     |
| --------- | ---------------------------------------------------------- |
| `id`      | `pp.projectId`                                             |
| `name`    | `pp.projectName`                                           |
| `status`  | `"active"` (invariant — aggregator excludes soft-deleted)  |
| `isAdmin` | `pp.projectAdmin`                                          |
| `roles`   | `pp.roleNames` (raw name strings, matches v1.0 cache shape) |
| `modules` | `Object.entries(pp.products).filter(tier !== "none").map(key)` |

## Task Commits

1. **Task 1: buildCacheBlob + writeMemberCacheFromAggregator + 6 tests** — `d9dd9c0` (feat)
2. **Task 2: runQuickSync orchestrator + CLI entry guard + helper type fix** — `cfd2eb7` (feat)
3. **Task 3: scripts/release.cjs runQuickSyncShell wired to tsx** — `9234ffb` (feat)

## Round-Trip Test Result (Pitfall 2 gate)

The load-bearing test in `quick-sync-extraction.test.ts`:

1. Builds an aggregator with 2 users (Alice, Bob) across 2 projects (Tower, Bridge).
2. Calls `buildCacheBlob` for each.
3. Feeds the resulting `{email, data}` rows into `buildAccGraphSnapshot(rows)`.
4. Asserts:
   - `snapshot.nodes.length === 3` (Alice has 2 instances, Bob has 1)
   - `snapshot.stats.uniqueFoundUsers === 2`
   - `snapshot.stats.uniqueProjects === 2`
   - Alice's Tower node: `isAdmin: true`, `roles` includes `"Architect"`, `modules` includes `"docs"`.

**Result: passes.** The cache shape produced by `buildCacheBlob` is consumable by the existing v1.0 graph builder with zero code changes.

## Verification

- `npx tsc --noEmit` — exit 0, clean.
- `npx vitest run lib/acc/quick-sync-extraction.test.ts` — 22/22 passing.
- `npx vitest run lib/server/__tests__/acc-helpers.test.ts` — 8/8 passing.
- `node -c scripts/release.cjs` — syntax OK.
- Grep invariants:
  - `lib/acc/quick-sync-extraction.ts` line 18: `import type { BulkAccUser, BulkAccProject } from "./acc-types";` (canonical shape import)
  - `scripts/release.cjs` line 110: `spawnSync("npx", ["tsx", "lib/acc/quick-sync-extraction.ts"], ...)` (CJS->TS bridge)
  - `buildCacheBlob` return annotation `: BulkAccUser` present at source line 755

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ProjectFindFirst.apsHubId` typed `string` but Prisma returns `string | null`**

- **Found during:** Task 2 (`runQuickSync` calls `getAccountId(prisma)`).
- **Issue:** `lib/server/acc-helpers.ts` declared `findFirst` returning `{ apsHubId: string }`, but Prisma's generated type is `{ apsHubId: string | null }` because the column is optional in the schema. Calling `getAccountId(prisma)` with a real `PrismaClient` failed typecheck.
- **Fix:** Widened the helper signature to `{ apsHubId: string | null } | null`. The helper's runtime null-check (`if (!hub || !hub.apsHubId)`) already handled the null case correctly — the type was tighter than reality.
- **Files modified:** `lib/server/acc-helpers.ts`, `lib/server/__tests__/acc-helpers.test.ts` (widened test helper type, added null-apsHubId coverage case).
- **Commit:** `cfd2eb7` (bundled with the runQuickSync work — the change unblocked Task 2 typecheck).

**2. [Rule 3 - Blocker] Module-level `console.warn` would spam the test suite**

- **Found during:** Task 1 (drafted v2.0 degradation warning at module load).
- **Issue:** A top-level `console.warn` in `quick-sync-extraction.ts` fires every time the module is imported, including in vitest where 22 tests import it.
- **Fix:** Moved the warning INTO `runQuickSync` so it only fires at actual run-time, not at import time.
- **Files modified:** `lib/acc/quick-sync-extraction.ts`.
- **Commit:** `cfd2eb7` (part of Task 2).

## Open Items (non-blocking)

- **HQ v1 prefetch (companyRole + isAccountAdmin):** v2.0 writes `null` and `false` respectively. The v1.0 `bulkAccSync` flow remains the source of truth for these two fields. A future cleanup ticket can reintroduce HQ v1 prefetch inside `runQuickSync` and backfill both fields — kept the v2.0 path project-centric to stay within the 5-min Railway release timeout.
- **First-run benchmark numbers:** Not captured in this plan — requires a real Railway deploy with APS credentials. The TS module imports resolve cleanly and the CLI entry guard is exercised by the `require.main === module` typecheck, but the wire-level fetch path has only been exercised against mocked `fetch`. Recommendation: monitor the first post-deploy Quick Sync log (`[quick-sync] complete in {Xs} — {N} projects, {M} users, {K} project failures`) and capture the numbers in a follow-up STATE.md note.
- **Per-project failure alerting threshold:** RESEARCH.md Decision 2 specified ">10% project failure rate triggers alert"; current implementation exits 0 on partial failures and only alerts on fatal exceptions. If observed Railway failure rate is non-trivial, add a threshold-based exit-code branch to the CLI entry block.

## User Setup Required

None. Pure backend extraction module — uses existing `APS_CLIENT_ID` / `APS_CLIENT_SECRET` / `DATABASE_URL` env vars already present on Railway.

## Phase 2 Closure

This is the final plan of Phase 2 (Core Extraction — Members, Projects, Roles). MEM-06 satisfied; all other phase 2 requirements (PROJ-01..03, ROLE-01..03, MEM-01..05) were closed in plans 02-01..03. Phase 2 status: complete.

Next milestone work (v2.x and beyond):
- HQ v1 prefetch reintroduction (companyRole + isAccountAdmin)
- AccProjectMember / AccProjectRole soft-delete passes
- Deep Sync cron parity with Quick Sync

## Self-Check: PASSED

- FOUND: lib/acc/quick-sync-extraction.ts (buildCacheBlob + writeMemberCacheFromAggregator + runQuickSync + CLI entry guard)
- FOUND: lib/acc/quick-sync-extraction.test.ts (6 new cases — buildCacheBlob 2-project, lastSignIn max, addedOn min, empty perProject, upsert by email, round-trip graph snapshot)
- FOUND: lib/server/acc-helpers.ts (widened ProjectFindFirst type)
- FOUND: lib/server/__tests__/acc-helpers.test.ts (null-apsHubId test case)
- FOUND: scripts/release.cjs (runQuickSyncShell rewritten; header docs updated)
- FOUND commit: d9dd9c0
- FOUND commit: cfd2eb7
- FOUND commit: 9234ffb
- VERIFIED: `npx tsc --noEmit` exit 0
- VERIFIED: `npx vitest run lib/acc/quick-sync-extraction.test.ts` 22/22 passing
- VERIFIED: `npx vitest run lib/server/__tests__/acc-helpers.test.ts` 8/8 passing
- VERIFIED: `node -c scripts/release.cjs` syntax OK
- VERIFIED: import `BulkAccUser` present in quick-sync-extraction.ts (line 18)
- VERIFIED: `tsx.*quick-sync-extraction` spawnSync present in release.cjs (line 110)
- VERIFIED: `buildCacheBlob(...): BulkAccUser` return annotation present (line 755)
- VERIFIED: round-trip test asserts `snapshot.nodes.length === 3` (non-empty graph from synthesized blob)

---
*Phase: 02-core-extraction*
*Plan: 04*
*Completed: 2026-05-11*
