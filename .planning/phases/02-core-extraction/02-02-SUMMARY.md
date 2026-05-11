---
phase: 02-core-extraction
plan: 02
subsystem: acc-quick-sync
tags: [acc, quick-sync, roles, extraction]
requirements-completed: [ROLE-01]
dependency_graph:
  requires:
    - "lib/server/acc-admin.ts::fetchHqUsers (HQ v2 plain-array fetcher; exported as part of this plan)"
    - "lib/acc/quick-sync-extraction.ts header / imports (provided by plan 02-01)"
    - "prisma model AccRole (id PK, accountId, name, memberCount, syncedAt) — added in Phase 1"
  provides:
    - "extractAndPersistHubRoles() — fetches hub master roles and upserts AccRole keyed by APS role id"
    - "fetchHubRoles() — pure mapper for plan 02-03 fallback name->id resolution"
    - "HubRole interface — shared type for Wave 2 per-project role extraction"
  affects:
    - "Plan 02-03 (per-project roles + members) consumes HubRole and the upserted AccRole rows for FK targets"
tech_stack:
  added: []
  patterns:
    - "Plain-array HQ v2 fetcher reuse (fetchHqUsers) — NOT fetchAccPaged"
    - "Defensive raw-input filtering before persistence (drop missing id/name; coerce non-numeric member_count)"
key_files:
  created:
    - ".planning/phases/02-core-extraction/02-02-SUMMARY.md"
  modified:
    - "lib/acc/quick-sync-extraction.ts (hub-roles section appended by 02-01 during scaffolding; verified in place at HEAD)"
    - "lib/acc/quick-sync-extraction.test.ts (added 3 vitest cases for hub-role mapping + upsert)"
    - "lib/server/acc-admin.ts (exported fetchHqUsers + JSDoc clarifying HQ v1/v2 plain-array reuse)"
decisions:
  - "No soft-delete for AccRole in this phase — APS does not expose a stable diffable hub-role list; cleanup deferred to v2.x CLN bucket."
  - "Returned roles[] from extractAndPersistHubRoles is part of the public contract: plan 02-03 will consume it for name->id fallback when per-project industry_roles is incomplete."
metrics:
  duration_minutes: 6
  completed_date: "2026-05-11"
  tasks_completed: 2
  files_modified: 3
  files_created: 1
  test_count: 3
---

# Phase 02 Plan 02: Hub Role Extraction Summary

One-liner: ROLE-01 hub-master role extraction added to Quick Sync via `extractAndPersistHubRoles` keyed on opaque APS role id, with snake_case `member_count` mapped to camelCase and defensive filtering for malformed rows.

## What Shipped

| Symbol                       | Location                         | Purpose                                                                                                  |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `HubRole` (interface)        | lib/acc/quick-sync-extraction.ts | Shared type — `{ id, name, memberCount }`; consumed by plan 02-03 for name->id fallback                  |
| `fetchHubRoles`              | lib/acc/quick-sync-extraction.ts | Calls `GET /hq/v2/accounts/:id/industry_roles` via `fetchHqUsers`; maps + filters raw payload            |
| `extractAndPersistHubRoles`  | lib/acc/quick-sync-extraction.ts | Upserts each role into `AccRole` keyed by `where.id = role.id`; returns roles[] for downstream callers   |
| `fetchHqUsers` (re-export)   | lib/server/acc-admin.ts          | Was internal; now `export`-ed and JSDoc'd as the correct fetcher for HQ v1 AND HQ v2 plain-array endpoints |

## Verification

- `npx tsc --noEmit` — exit 0 (clean).
- `npx vitest run lib/acc/quick-sync-extraction.test.ts` — 7/7 passing (4 from 02-01 + 3 new for ROLE-01).

### Test coverage added

1. **fetchHubRoles maps fields correctly** — Stub `fetch` returns `[{ id: "r1", name: "Architect", member_count: 5 }, { id: "r2", name: "Engineer", member_count: 0 }]`; asserts snake_case -> camelCase mapping.
2. **Defensive filter** — Stub includes malformed entries `{ id: null, name: "Bad" }` and `{ id: "r3", name: null }`; asserts both are dropped, and `{ id: "r4", name: "Engineer" }` (missing member_count) is kept with `memberCount: 0`.
3. **extractAndPersistHubRoles upserts each role** — Mocks `prisma.accRole.upsert`; runs with 3 roles; asserts upsert called 3× with `where.id` = `["r1", "r2", "r3"]` and create payload carrying the accountId/name/memberCount.

## Commits

| Hash    | Message                                                                                |
| ------- | -------------------------------------------------------------------------------------- |
| (c1407cc by 02-01) | feat(02-01): scaffold quick-sync project extraction — also shipped the hub-role symbols anticipated by this plan (see deviation below) |
| 85a6842 | test(02-02): cover fetchHubRoles mapping and AccRole upsert                            |
| 3ae93ec | fix(02-02): tighten vi.fn arg type for AccRole upsert mock                             |

## Deviations from Plan

### 1. [Rule 3 - Cross-plan coordination] Task 1 source-of-truth shipped inside plan 02-01's commit

- **Found during:** Task 1 execute step (right after Read-ing the existing file).
- **Issue:** The plan 02-02 coordination note assumed I would APPEND the hub-roles section to a file owned by 02-01. By the time my executor read the file, plan 02-01 had already committed `lib/acc/quick-sync-extraction.ts` at HEAD with the full 244-line content — including a complete, plan-02-02-compliant `HubRole` / `fetchHubRoles` / `extractAndPersistHubRoles` section (lines 143–243). The `fetchHqUsers` re-export from `acc-admin.ts` was also already shipped by 02-01 (commit c1407cc touched 9 lines there).
- **Fix:** Verified the in-tree content matches the plan spec exactly (HQ v2 base URL, defensive filter on id/name, `member_count -> memberCount` coercion, AccRole upsert keyed by `role.id`, log line `[quick-sync] hub roles: N upserted`, returns roles[]). No source edit needed; Task 1 deliverables are present at HEAD attributed to 02-01.
- **Files modified:** none (verification only).
- **Commit:** N/A — deliverable lives in 02-01's c1407cc.
- **Note for future planning:** The two parallel plans had overlapping authorship — 02-01 implemented 02-02's source contract in addition to its own. For Wave-1 parallel plans that share a file, planners should either (a) merge the source-side tasks into one plan with split test plans, or (b) explicitly forbid pre-implementing the sibling plan's exports.

### 2. [Rule 1 - Type error] Mock signature fix in new tests

- **Found during:** Final `npx tsc --noEmit` after Task 2 commit.
- **Issue:** `vi.fn(async () => ({}))` infers the arg-tuple as `[]`, which makes `mock.calls[0][0]` reject at the type level (`Tuple type '[]' of length '0' has no element at index '0'`). Same anti-pattern that plan 02-01 had to fix in f0bea77.
- **Fix:** Gave the mock an explicit `(_args: unknown) => Promise<unknown>` signature, captured the mock locally, and cast `mock.calls` through `unknown` to `Array<[UpsertArgs]>` to recover indexed access.
- **Files modified:** lib/acc/quick-sync-extraction.test.ts
- **Commit:** 3ae93ec

## Open Items (none blocking)

- HQ v2 industry_roles response field names (`document_management` snake_case vs. camelCase variant) — out of scope for ROLE-01 (no `services.*` extraction here). Plan 02-03 will exercise this when it reads `services.document_management.access_level` from the per-project endpoint.
- AccRole soft-delete deferred to v2.x CLN bucket — by design.

## Self-Check: PASSED

- FOUND: lib/acc/quick-sync-extraction.ts (HubRole / fetchHubRoles / extractAndPersistHubRoles exported, lines 143-243)
- FOUND: lib/acc/quick-sync-extraction.test.ts (3 new test cases appended)
- FOUND: commit 85a6842 (test commit)
- FOUND: commit 3ae93ec (type-fix commit)
- VERIFIED: `npx tsc --noEmit` exit 0
- VERIFIED: `npx vitest run lib/acc/quick-sync-extraction.test.ts` 7/7 passing
