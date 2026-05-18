---
phase: 09-v2.0-list-wave-gap-closure
plan: 01
subsystem: api
tags: [trpc, prisma, zod, vitest, postgres, list-wave]

# Dependency graph
requires:
  - phase: 03-acc-activity-deep-sync
    provides: AccActivity table, CATEGORY_TO_RAW_ACTIONS, composite (userEmail, createdAt DESC) index
  - phase: 05-ui-enrichment-waves
    provides: BulkAccUser aggregatedStatus/projectAdmin/executive/companyName fields + enrichedUsers tRPC
  - phase: 02-acc-projects-and-roles
    provides: AccProjectMember.products JSON + project.status soft-delete contract
provides:
  - Pure status reducer (reduceMemberStatus) for client-side fallback
  - Pure products JSON parser (parseProductsJson) with isUnknownModule flagging
  - getLastFileActivityBatch tRPC procedure (LIST-03 display path)
  - usersOrderedByLastFileActivity tRPC procedure (LIST-03 sort path with compound cursor)
  - getProductsForUser tRPC procedure (LIST-04 per-user products fetch)
  - 09-01-EXPLAIN.md verdict ACCEPTABLE (98 ms batch / 6 ms sort vs 200 ms ceiling)
affects:
  - 09-02 (status column + facet — consumes reduceMemberStatus fallback)
  - 09-03 (Module Access section — consumes getProductsForUser + parseProductsJson)
  - 09-04 (last-file-activity column + sort — consumes both new acc-activity procedures)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Compound (MAX(createdAt), email) cursor pagination over GROUP BY aggregate"
    - "Prisma.sql template tags with Prisma.raw for safe direction injection"
    - "NULLS LAST regardless of sort direction (empty rows always last)"
    - "Shared FILE_RAW_ACTIONS constant derived from CATEGORY_TO_RAW_ACTIONS to prevent sort/display drift"

key-files:
  created:
    - lib/acc/accStatusReduction.ts
    - lib/acc/accStatusReduction.test.ts
    - lib/acc/productsTierMap.ts
    - lib/acc/productsTierMap.test.ts
    - .planning/phases/09-v2.0-list-wave-gap-closure/09-01-EXPLAIN.md
    - scripts/dev/09-01-explain-analyze.cjs
  modified:
    - server/routers/acc-activity.ts
    - server/routers/acc-activity.timeline.test.ts
    - server/routers/acc-members.ts
    - server/routers/acc-members.kpi.test.ts

key-decisions:
  - "Two separate procedures (batch display vs server-side sort) — Pitfall 6 defense; sharing one would double server load on sort changes"
  - "Compound cursor on (MAX(createdAt), email) — stable under writes; matches RESEARCH Open Question 2 recommendation"
  - "NULLS LAST regardless of asc/desc — empty rows always tail; CONTEXT discretion lock"
  - "Zero-activity users NOT appended in sort procedure — consumer plan 09-04 owns the BulkAccUser remainder append"
  - "EXPLAIN ACCEPTABLE on current 2,507-row dataset; follow-up re-measure trigger documented for post-DC-backfill"
  - "Products parser KNOWN_MODULES set covers documented 8 + cost/assets/projectAdministration; futureModule deliberately excluded so it surfaces as isUnknownModule:true"

patterns-established:
  - "Pure helper modules in lib/acc/ (not under app/) so server routers can import without crossing app boundary"
  - "Procedure-presence tests via Object.keys(router._def.procedures) as cheap smoke gates"

requirements-completed: [LIST-01, LIST-02, LIST-03, LIST-04]

# Metrics
duration: ~15 min
completed: 2026-05-18
---

# Phase 09 Plan 01: tRPC procedures + pure helpers Summary

**Three tRPC procedures (getLastFileActivityBatch + usersOrderedByLastFileActivity + getProductsForUser) and two pure helpers (reduceMemberStatus + parseProductsJson) — Phase 09 data contracts shipped, no UI changes**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-18T15:24Z (approx)
- **Completed:** 2026-05-18T15:39Z
- **Tasks:** 3
- **Files modified:** 4 modified + 6 created (2 helpers + 2 tests + EXPLAIN artifact + harness script)

## Accomplishments

- Two pure, dependency-light helper modules (`reduceMemberStatus`, `parseProductsJson`) — 16/16 Vitest cases green, zero new package.json additions, zero Prisma/React imports.
- Two new tRPC procedures on `accActivityRouter` (`getLastFileActivityBatch` + `usersOrderedByLastFileActivity`) — display + sort code paths kept intentionally separate (Pitfall 6 defense).
- One new tRPC procedure on `accMembersRouter` (`getProductsForUser`) — lazy per-user fetch filtered to active projects only.
- EXPLAIN ANALYZE artifact captured against real dev DB (2,507 rows): batch query 98 ms, sort query 6 ms, both well under 200 ms ceiling. **Verdict: ACCEPTABLE.**
- Re-runnable EXPLAIN harness (`scripts/dev/09-01-explain-analyze.cjs`) ships alongside artifact for post-DC-backfill re-measure.
- Zero changes to `BulkAccUser` shape, `enrichedUsers` procedure, or `getFileActivityForUser` (ACTV-03 lazy contract preserved).

## Task Commits

1. **Task 1: Pure helpers — accStatusReduction + productsTierMap with Vitest** — `51a6e52` (feat)
2. **Task 2: tRPC — getLastFileActivityBatch + usersOrderedByLastFileActivity in acc-activity.ts** — `6a79f60` (feat)
3. **Task 3: tRPC — getProductsForUser in acc-members.ts + smoke test** — `85cdaaa` (feat)

## Files Created/Modified

**Created:**
- `lib/acc/accStatusReduction.ts` — pure client-side fallback status reducer (port of acc-members.ts L94-96)
- `lib/acc/accStatusReduction.test.ts` — 8 Vitest cases
- `lib/acc/productsTierMap.ts` — zod-parsed products JSON → ProductTier[]; never throws
- `lib/acc/productsTierMap.test.ts` — 8 Vitest cases
- `.planning/phases/09-v2.0-list-wave-gap-closure/09-01-EXPLAIN.md` — EXPLAIN ANALYZE artifact with ACCEPTABLE verdict
- `scripts/dev/09-01-explain-analyze.cjs` — re-runnable EXPLAIN harness using PrismaPg adapter

**Modified:**
- `server/routers/acc-activity.ts` — appended `getLastFileActivityBatch` + `usersOrderedByLastFileActivity` + shared `FILE_RAW_ACTIONS` constant
- `server/routers/acc-activity.timeline.test.ts` — added 3 procedure-presence assertions (new procedures + intact `getFileActivityForUser`)
- `server/routers/acc-members.ts` — appended `getProductsForUser`
- `server/routers/acc-members.kpi.test.ts` — added presence checks for `getProductsForUser` + `enrichedUsers`

## Decisions Made

- **Two procedures over one (Pitfall 6):** `getLastFileActivityBatch` returns `Record<email, ISO|null>` (display); `usersOrderedByLastFileActivity` returns ordered `{email, lastActivity}` page with compound cursor (sort). Sharing would force the display query to re-fire whenever the sort direction toggles, doubling server load.
- **Compound cursor `(MAX(createdAt), email)` (RESEARCH Open Q2 recommendation):** stable under concurrent writes; raw SQL `HAVING` clause handles asc/desc mirroring; `Prisma.raw` for direction (constrained by enum) + `Prisma.sql` template tags for parameter binding.
- **NULLS LAST regardless of direction (CONTEXT discretion lock):** users without file activity always tail-pad in both ASC and DESC orderings.
- **Zero-activity user append is a UI-layer concern (RESEARCH Open Q3):** the sort procedure only returns users with ≥1 file-activity row; plan 09-04 will append the `BulkAccUser` remainder in stable secondary order after exhausting paginated results.
- **KNOWN_MODULES set scope:** included documented 8 modules + `cost` / `assets` / `projectAdministration` (referenced elsewhere in the product surface) but deliberately excluded `futureModule` so the unknown-module test case surfaces correctly.

## Deviations from Plan

None - plan executed exactly as written. The plan's task list, file targets, test counts (≥6 + ≥7 + presence checks), and verdict format were all hit verbatim.

## Issues Encountered

- **PrismaClient v7 instantiation:** The EXPLAIN harness initially failed with `PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions` because Prisma v7.8.0 requires the `PrismaPg` adapter to be explicitly passed. Resolved by mirroring the pattern from `scripts/dev/verify-08-06-killswitch.cjs` (require `@prisma/adapter-pg`, pass `adapter: new PrismaPg({ connectionString })`). One-shot fix; no impact on the plan deliverables.

## Self-Check: PASSED

All 6 created files present on disk; all 3 task commits resolvable via `git log`:
- `51a6e52` (Task 1: pure helpers)
- `6a79f60` (Task 2: activity procedures + EXPLAIN)
- `85cdaaa` (Task 3: getProductsForUser)

## Next Phase Readiness

- **Plan 09-02 (status column + facet):** Server-side `enrichedUsers` already exposes `aggregatedStatus`; the new `reduceMemberStatus` helper is available as graceful-degradation fallback while the query is in flight. UI work is pure wiring.
- **Plan 09-03 (Module Access section):** `getProductsForUser` + `parseProductsJson` form the complete data contract — plan is pure side-panel rendering.
- **Plan 09-04 (last-file-activity column + sort):** Both `getLastFileActivityBatch` (display) and `usersOrderedByLastFileActivity` (sort) are live; consumer must implement the IntersectionObserver hook (`useVisibleRowEmails`) and the zero-activity remainder append.
- **EXPLAIN follow-up:** Post-DC-backfill re-measure trigger documented in `09-01-EXPLAIN.md`; not a blocker for v2.0 close-out.

---
*Phase: 09-v2.0-list-wave-gap-closure*
*Completed: 2026-05-18*
