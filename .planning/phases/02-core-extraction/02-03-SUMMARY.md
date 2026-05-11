---
phase: 02-core-extraction
plan: 03
subsystem: acc-quick-sync
tags: [acc, quick-sync, members, roles, extraction, pLimit, prisma]
requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-04, MEM-05, ROLE-02, ROLE-03]

dependency_graph:
  requires:
    - "lib/acc/quick-sync-extraction.ts header + RawProject + fetchWithRetry import (plan 02-01)"
    - "fetchHqUsers re-export from lib/server/acc-admin.ts (plan 02-01 / 02-02)"
    - "AccProjectMember + AccProjectRole + AccRole Prisma models (Phase 1)"
    - "p-limit ^7.3.0 (already in package.json)"
  provides:
    - "extractAndPersistProjectData(prisma, accountId, project, accessToken, aggregator): per-project members + roles + role linking"
    - "runPerProjectFanOut(prisma, accountId, projects, accessToken): pLimit(5) fan-out, skip-and-continue"
    - "fetchProjectMembers / fetchProjectRoles / normalizeProducts / RawMember / ProjectRole / ProductTier"
    - "MemberAggregator + MemberAggregatorEntry + MemberAggregatorPerProject types — consumer contract for plan 02-04 accMemberCache dual-write"
  affects:
    - "Plan 02-04 (release wiring + accMemberCache dual-write) — reads aggregator output"

tech_stack:
  added: []
  patterns:
    - "?fields= hardcoded URL constant with lastSignIn embedded literally; key-presence check on first member surfaces dropped fields params (Pitfall 1)"
    - "pLimit(5) fan-out with Promise.all + try/catch per-project (skip-and-continue, RESEARCH Decision 1)"
    - "Compound unique with nullable component: Prisma rejects null in compound-where, fall back to findFirst + create/update"
    - "Case-insensitive name resolution via lowercased Map<string, T> (member role names -> project role IDs)"
    - "In-memory aggregator threaded through fan-out for cross-project dual-write deferred to next plan"

key_files:
  created:
    - ".planning/phases/02-core-extraction/02-03-SUMMARY.md"
  modified:
    - "lib/acc/quick-sync-extraction.ts (appended members + per-project roles section)"
    - "lib/acc/quick-sync-extraction.test.ts (9 new cases)"

key_decisions:
  - "Compound-unique null fallback: AccProjectRole has @@unique([projectId, roleId, memberId]) with memberId nullable. Prisma's generated projectId_roleId_memberId compound where requires non-null components, so the unassigned default-access row (memberId=null) uses findFirst + create/update instead of upsert. Member-linked rows (memberId NOT null) still use upsert via the same compound key."
  - "Product alias map limited to documentManagement/fieldManagement/costManagement per RESEARCH Open Question 3. Other keys (designCollaboration, modelCoordination, autoSpecs, insight, projectAdministration, takeoff) pass through unchanged — APS uses these short forms natively at the admin v1 endpoint."
  - "lastSignInPresent uses hasOwnProperty key-presence (not value check) so a member with lastSignIn:null still reads as present. False is only raised when ?fields= is dropped entirely."
  - "extractAndPersistProjectData fetches roles BEFORE members (Pitfall 3) so member.roles[] name resolution has the per-project map populated."
  - "pLimit(5) — bulkAccSync runs at pLimit(3) historically, but RESEARCH Decision 1 specifies 5 here. Maintained as authored."

metrics:
  duration_minutes: ~5
  completed_date: "2026-05-11"
  tasks_completed: 3
  files_modified: 2
  files_created: 1
  test_count: 16   # 7 prior + 9 new (all passing)
---

# Phase 02 Plan 03: Per-Project Members + Roles Summary

Per-project member and industry-role extraction with name->ID role linking and skip-and-continue pLimit(5) fan-out; produces an in-memory `MemberAggregator` map keyed by lowercased email for plan 02-04 to consume for `accMemberCache` dual-write.

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-11T17:36Z
- **Completed:** 2026-05-11T17:39Z
- **Tasks:** 3 (all auto, no checkpoints)
- **Tests:** 16/16 passing (7 prior + 9 added)
- **Typecheck:** `npx tsc --noEmit` clean.

## What Shipped

| Symbol                          | Kind      | Purpose                                                                                       |
| ------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `ProductTier`                   | type      | `"administrator" \| "member" \| "none"`                                                       |
| `MEMBER_FIELDS` (internal)      | constant  | Hardcoded `?fields=` value containing literal `lastSignIn`                                    |
| `normalizeProducts`             | function  | APS products array -> `{key: tier}` map, with `documentManagement`/`fieldManagement`/`costManagement` aliases |
| `RawMember`                     | interface | Wire shape from `/construction/admin/v1/projects/:id/users` (phone object form)               |
| `fetchProjectMembers`           | function  | Paginated members fetch; returns `{members, lastSignInPresent}` key-presence flag             |
| `ProjectRole`                   | interface | Per-project role with resolved docs/admin default access levels                               |
| `fetchProjectRoles`             | function  | Plain-array fetcher for `/hq/v2/.../industry_roles`; handles snake_case AND camelCase services |
| `MemberAggregatorPerProject`    | interface | One per-project occurrence of a member                                                        |
| `MemberAggregatorEntry`         | interface | All occurrences of one email across projects                                                  |
| `MemberAggregator`              | type      | `Map<email_lower, MemberAggregatorEntry>` — plan 02-04 consumer contract                      |
| `extractAndPersistProjectData`  | function  | Per-project: roles first -> AccRole upserts + default AccProjectRole rows -> members -> AccProjectMember upserts -> role linking -> aggregator append |
| `runPerProjectFanOut`           | function  | `pLimit(5)` fan-out with skip-and-continue; returns `{aggregator, failCount, failures}`       |

## Task Commits

1. **Task 1: normalizeProducts + fetchProjectMembers + fetchProjectRoles** — `efe4d91` (feat)
2. **Task 2: extractAndPersistProjectData + runPerProjectFanOut** — `58142dc` (feat)
3. **Task 3: 9 vitest cases for member/role extraction** — `2e87c44` (test)

## Verification

- `npx tsc --noEmit` — exit 0, clean.
- `npx vitest run lib/acc/quick-sync-extraction.test.ts` — 16/16 passing.
- Grep invariants: `MEMBER_FIELDS` contains literal `lastSignIn`; `pLimit(5)` present in source.

### Test coverage added (9 cases)

1. `normalizeProducts` canonical keys (`docs` / `build`) pass through.
2. `normalizeProducts` alias normalization (`documentManagement` -> `docs`, `fieldManagement` -> `build`, `costManagement` -> `cost`).
3. `normalizeProducts` nullish input returns `{}`.
4. `fetchProjectMembers` flags `lastSignInPresent=false` when first member lacks the key.
5. `fetchProjectMembers` flags `lastSignInPresent=true` when key exists with value `null`.
6. `fetchProjectRoles` reads both `services.document_management.access_level` and `services.documentManagement.access_level`.
7. `extractAndPersistProjectData` resolves member role name case-insensitively (`"architect"` -> `"Architect"`) and links via `accProjectRole.upsert` with the correct `roleId` + `memberId`.
8. Unresolved role name logs a warning containing the name; does NOT throw; no member-link upsert is emitted.
9. `runPerProjectFanOut` skip-and-continue: p2 fails (industry_roles 500), `failCount===1`, `failures[0].projectId==="p2"`, aggregator still contains entries for p1 and p3.

## Decisions Made

- **Prisma compound-unique with nullable component:** `@@unique([projectId, roleId, memberId])` generates a `projectId_roleId_memberId` compound where that requires all three components non-null at the type level. For the "unassigned default access" row (memberId=null), used `findFirst` + `create` / `update` fallback. For member-linked rows (memberId is a real cuid), the compound-key upsert path works as expected.
- **Product alias coverage:** Only the three aliases from RESEARCH Open Question 3 are mapped (`documentManagement`, `fieldManagement`, `costManagement`). Other product keys are short-form natively at the admin v1 endpoint and pass through unchanged. If a future APS payload surfaces additional long-form variants, add them to `PRODUCT_ALIASES`.
- **`lastSignInPresent` key check, not value check:** Uses `Object.prototype.hasOwnProperty.call(firstMember, "lastSignIn")` so members with explicit `null` lastSignIn don't false-positive as dropped-fields. The warning only fires when the key itself is absent, which is the actual symptom of `?fields=` stripping.
- **Roles fetched before members:** Per Pitfall 3 — populating `roleNameToId` first lets the per-member role linking resolve in O(1) name->ID. Reverse order would require a second pass or a deferred linking step.
- **Aggregator threading instead of return value:** `extractAndPersistProjectData` accepts the shared aggregator as a parameter rather than returning per-project entries. Lets `runPerProjectFanOut` collect across all projects without rebuilding a Map after-the-fact, and keeps the memory footprint bounded to one Map regardless of concurrency.

## Deviations from Plan

None - plan executed exactly as written. The Prisma null-in-compound-unique fallback was explicitly anticipated by the plan's own "If Prisma rejects null in the compound where, fall back to findFirst + create-or-update pattern" instruction.

## Open Items (non-blocking)

- Plan 02-04 will invoke `runPerProjectFanOut` after `extractAndPersistProjects`, then walk `aggregator.values()` to write `accMemberCache` JSON matching the `BulkAccUser` interface shape.
- Member access tokens are passed through as-is; no per-project token refresh logic added (matches v1.0 bulkAccSync behavior).
- AccProjectMember/AccProjectRole soft-delete deferred — set-difference across projects (similar to AccProject) requires the per-project ID set first, can be added cleanly in 02-04 or a v2.x CLN bucket.

## User Setup Required

None. Pure backend extraction module — no env vars, no UI, no migrations beyond Phase 1.

## Next Phase Readiness

- **02-04 (release wiring + accMemberCache dual-write):** Consumes `MemberAggregator` from `runPerProjectFanOut` directly. Walks `aggregator.values()` and assembles the `BulkAccUser`-shaped JSON for `accMemberCache.data`. Has everything it needs.

## Self-Check: PASSED

- FOUND: lib/acc/quick-sync-extraction.ts (extractAndPersistProjectData + runPerProjectFanOut exported)
- FOUND: lib/acc/quick-sync-extraction.test.ts (9 new cases appended)
- FOUND commit: efe4d91
- FOUND commit: 58142dc
- FOUND commit: 2e87c44
- VERIFIED: `npx tsc --noEmit` exit 0
- VERIFIED: `npx vitest run lib/acc/quick-sync-extraction.test.ts` 16/16 passing
- VERIFIED: MEMBER_FIELDS contains literal `lastSignIn`
- VERIFIED: `pLimit(5)` present in source

---
*Phase: 02-core-extraction*
*Plan: 03*
*Completed: 2026-05-11*
