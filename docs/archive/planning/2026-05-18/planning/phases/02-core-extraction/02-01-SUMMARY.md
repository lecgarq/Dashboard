---
phase: 02-core-extraction
plan: 01
subsystem: api
tags: [prisma, acc, autodesk, aps, vitest, pagination, soft-delete]

# Dependency graph
requires:
  - phase: 01-foundation-schema-sync
    provides: AccProject Prisma model, getAccountId helper, scripts/release.cjs sync shell
provides:
  - extractAndPersistProjects() Quick Sync primitive
  - fetchAllProjects() short-page sentinel pagination
  - RawProject type shared by downstream extractors
  - exported fetchWithRetry on lib/server/acc-admin.ts (429/backoff reuse)
affects: [02-02 hub-roles, 02-03 members, 02-04 release wiring, 03-04 dashboard project filters]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Short-page pagination sentinel (results.length < limit) instead of totalResults arithmetic"
    - "Set-difference soft delete (findMany notIn + updateMany status:inactive)"
    - "Extraction module as pure function tree (no top-level invocation until 02-04 release bridge)"

key-files:
  created:
    - lib/acc/quick-sync-extraction.ts
    - lib/acc/quick-sync-extraction.test.ts
  modified:
    - lib/server/acc-admin.ts (exported fetchWithRetry)

key-decisions:
  - "Exported fetchWithRetry from acc-admin.ts rather than inlining a duplicate — single source of truth for APS 429 handling"
  - "Used short-page sentinel (results.length < PROJECT_PAGE_SIZE) rather than pagination.totalResults — APS totalResults drifts on freshly-deleted projects"
  - "Pass the caller-provided accountId into upsert rather than raw.accountId — guarantees bare form (no b. prefix) regardless of APS payload shape"
  - "Do not set updatedAt explicitly — let Prisma @updatedAt manage it"

patterns-established:
  - "Pagination: while(true) loop, accumulate, break when results.length < PAGE_SIZE, offset += PAGE_SIZE"
  - "Soft delete: build Set<string> of fresh IDs, findMany with status:active + id notIn freshIds, updateMany status:inactive only if any stale exist"
  - "Console summary line `[quick-sync] projects: N upserted, M soft-deleted` — downstream extractors should mirror this format"

requirements-completed: [PROJ-01, PROJ-02]

# Metrics
duration: ~10min
completed: 2026-05-11
---

# Phase 02 Plan 01: Project Extraction Scaffold Summary

**Quick Sync project extraction with paginated APS fetch and set-difference soft delete; foundation for all Phase 2 extractors.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-11T17:18Z
- **Completed:** 2026-05-11T17:28Z
- **Tasks:** 2
- **Files modified:** 3 (1 modified, 2 created)

## Accomplishments
- `extractAndPersistProjects(prisma, accountId, accessToken)` upserts every `/construction/admin/v1/accounts/:id/projects` row into `AccProject` and soft-deletes any project no longer returned by APS.
- `fetchAllProjects` paginates with `limit=100` and terminates on the short-page sentinel (no reliance on `pagination.totalResults`).
- 4 Vitest cases pin pagination behavior (full+short, single-short) and soft-delete behavior (set-difference + no-op when empty).
- `fetchWithRetry` is now exported from `lib/server/acc-admin.ts`, giving non-tRPC callers (release script, future extractors) a single source of truth for APS 429 handling.

## Task Commits

1. **Task 1: Export fetchWithRetry + create extraction module scaffold** — `c1407cc` (feat)
2. **Task 2: Unit tests for pagination + soft-delete** — `7487508` (test)
3. **Auto-fix: Cast updateMany mock call args through unknown** — `f0bea77` (fix)

## Files Created/Modified
- `lib/acc/quick-sync-extraction.ts` — RawProject type + fetchAllProjects + extractAndPersistProjects
- `lib/acc/quick-sync-extraction.test.ts` — 4 Vitest cases for pagination + soft-delete
- `lib/server/acc-admin.ts` — `fetchWithRetry` changed from local helper to exported

## Decisions Made
- **Export vs inline `fetchWithRetry`:** Exported. Inlining would have duplicated APS 429/backoff logic in two locations; a future tweak to one would silently diverge.
- **Pagination sentinel choice:** `results.length < PROJECT_PAGE_SIZE` (short-page) rather than `offset >= totalResults`. APS totalResults drifts during concurrent deletes; short-page is self-correcting.
- **AccountId source for upsert:** Use the caller-supplied `accountId` (already stripped of `b.` by `getAccountId`), not `raw.accountId` from APS. Guarantees the FK invariant downstream extractors depend on.
- **No top-level invocation yet:** Pure module. Plan 02-04 will add the `npx tsx` bridge once members + hub-roles also land.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tightened strict-tsc cast on `mock.calls[0][0]`**
- **Found during:** Final verification typecheck
- **Issue:** Under strict noImplicitAny, `vi.fn().mock.calls` infers as `never[][]`, so `mock.calls[0][0] as { ... }` produces TS2352 "no overlap" and TS2493 "tuple of length 0".
- **Fix:** Cast the whole call tuple through `unknown` first: `(prisma.accProject.updateMany.mock.calls[0] as unknown as [{...}])[0]`. Behavior identical; types satisfied.
- **Files modified:** `lib/acc/quick-sync-extraction.test.ts`
- **Verification:** `npx tsc --noEmit` clean; all 4 tests still pass.
- **Committed in:** `f0bea77`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial test-only typing nit; no behavior or scope change.

## Issues Encountered

- **Parallel agent (plan 02-02) merge surface:** 02-02 runs concurrently and shares `lib/acc/quick-sync-extraction.ts`. Per the coordination note, this plan only added the file header, types, constants, and project-related exports. The parallel agent additively layered `fetchHubRoles` / `extractAndPersistHubRoles` exports on top, and added their imports to my test file. The merge was clean (union semantics, no conflicts); typecheck and tests remained green.

## User Setup Required

None — no external service configuration required. Project list scaffolding is wired but not yet invoked; release.cjs unchanged.

## Next Phase Readiness

- **02-02 (hub-roles):** Can share the `RawProject` shape and `fetchWithRetry` import already in place. Already adding its exports to this same file in parallel.
- **02-03 (members):** Will import `RawProject[]` from this module and fan out per-project membership calls. Soft-delete pattern here is the template members will mirror.
- **02-04 (release wiring):** Will add the `if (require.main === module)` invocation that calls `extractAndPersistProjects` (then members, hub-roles) and wires it into `scripts/release.cjs`.

## Self-Check: PASSED

- FOUND: lib/acc/quick-sync-extraction.ts
- FOUND: lib/acc/quick-sync-extraction.test.ts
- FOUND: lib/server/acc-admin.ts (export fetchWithRetry)
- FOUND commit: c1407cc
- FOUND commit: 7487508
- FOUND commit: f0bea77

---
*Phase: 02-core-extraction*
*Plan: 01*
*Completed: 2026-05-11*
