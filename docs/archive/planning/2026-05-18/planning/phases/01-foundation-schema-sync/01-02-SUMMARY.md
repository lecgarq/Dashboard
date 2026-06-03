---
phase: 01-foundation-schema-sync
plan: 02
subsystem: api
tags: [acc, prisma, helpers, tdd, vitest, trpc]

requires:
  - phase: 01-foundation-schema-sync
    provides: existing inline getAccountId in server/routers/users.ts (v1.0 FOUND-03)

provides:
  - Shared helper module lib/server/acc-helpers.ts exporting getAccountId and getProjectIdForDM
  - 7 Vitest unit tests covering prefix strip, passthrough, null/empty throws, identity, empty throw
  - Plain-Error throw contract (no TRPCError, no server-only) so non-tRPC callers (release script, cron script in plan 01-03) can import safely
  - resolveAccountIdForRouter() local wrapper in users.ts that maps the helper's plain Error to TRPCError({ code: PRECONDITION_FAILED })

affects: [01-03 (release/cron scripts), 02-acc-extraction, 03-acc-extraction]

tech-stack:
  added: []
  patterns:
    - "Pure server helper module (no 'server-only' import) — callable from Next.js routers, CJS scripts, and Vitest tests alike"
    - "Throw plain Error in shared module; tRPC caller wraps via local resolveAccountIdForRouter() into TRPCError"
    - "Vitest mock pattern: vi.fn() for db.project.findFirst with parameterized scenarios"

key-files:
  created:
    - lib/server/acc-helpers.ts
    - lib/server/__tests__/acc-helpers.test.ts
  modified:
    - server/routers/users.ts

key-decisions:
  - "Helper throws plain Error (not TRPCError, not IntegrationError) so release/cron scripts can require() the module without pulling @trpc/server"
  - "Local resolveAccountIdForRouter() wrapper maps plain Error to PRECONDITION_FAILED (not UNAUTHORIZED) — config-missing is a precondition issue, not an auth issue"
  - "getProjectIdForDM throws on empty string — explicit guard surfaces caller bugs early instead of silently returning empty"
  - "First Vitest test file placed under lib/server/__tests__/ — establishes the convention for future server-side helper tests"

patterns-established:
  - "Pattern 1: Shared server helpers live in lib/server/*.ts with NO 'server-only' directive; tests live in lib/server/__tests__/*.test.ts"
  - "Pattern 2: Non-tRPC-aware helpers throw plain Error; tRPC routers wrap to TRPCError at the call site"

requirements-completed: [SCHEMA-03]

duration: 1m 30s
completed: 2026-05-11
---

# Phase 01 Plan 02: Shared ACC ID Helpers Summary

**`getAccountId` extracted to `lib/server/acc-helpers.ts` and paired with `getProjectIdForDM`; 7 Vitest cases ship green and `users.ts` consumes the shared helper at all 3 call sites — release/cron scripts in plan 01-03 can now import the helpers directly.**

## Performance

- **Duration:** 1m 30s
- **Started:** 2026-05-11T15:56:59Z
- **Completed:** 2026-05-11T15:58:29Z
- **Tasks:** 3 (RED / GREEN / REFACTOR — TDD)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Shared `getAccountId(db)` and `getProjectIdForDM(rawId)` helpers in `lib/server/acc-helpers.ts`, free of `server-only` and `@trpc/server` deps so they can be `require()`'d from `scripts/release.cjs` and `scripts/deep-sync.cjs` in plan 01-03.
- 7 Vitest cases covering prefix-strip, no-prefix passthrough, null-record throw, empty-`apsHubId` throw (getAccountId) and prefixed-identity, unprefixed-identity, empty-throws (getProjectIdForDM) — all green.
- `server/routers/users.ts`: deleted the inline `getAccountId` function; added `import { getAccountId }` from the shared module; introduced a thin `resolveAccountIdForRouter()` wrapper that maps the new plain `Error` back into a `TRPCError({ code: PRECONDITION_FAILED })`. All 3 prior call sites (`syncAccUser`, `bulkAccSync`, `syncHubRoles`) updated to use the wrapper.
- SCHEMA-03 audit clean: `grep replace(/^b\./)` in `server/` + `lib/server/` returns ONLY `lib/server/acc-helpers.ts:28`.

## Task Commits

1. **Task 1 (RED): failing tests** — `625854f` (test)
2. **Task 2 (GREEN): implement helpers** — `80ce197` (feat)
3. **Task 3 (REFACTOR): users router consumes helper** — `9e76f88` (refactor)

REFACTOR step produced semantic changes (delete + import + wrapper), so it received its own commit per protocol.

## Files Created/Modified

- `lib/server/acc-helpers.ts` (CREATED) — `getAccountId(db)` and `getProjectIdForDM(rawId)`. Pure module, plain Error, no `server-only`.
- `lib/server/__tests__/acc-helpers.test.ts` (CREATED) — 7 Vitest cases using `vi.fn()` to mock `db.project.findFirst`.
- `server/routers/users.ts` (MODIFIED) — Deleted inline `getAccountId` (was lines 211–221). Added import at line 32. Added `resolveAccountIdForRouter()` wrapper. Updated 3 call sites (now lines ~1085, ~1173, ~1461 after the new wrapper shifted line numbers; original call sites were 1076, 1164, 1452).

## Decisions Made

- **Plain `Error` over `IntegrationError`.** The plan offered either; plain `Error` keeps `lib/server/acc-helpers.ts` free of internal-module dependencies, which matters most for CJS release/cron scripts that will `require()` the compiled JS.
- **`PRECONDITION_FAILED` over `UNAUTHORIZED` for the router wrap.** Original inline helper threw `TRPCError({ code: UNAUTHORIZED })`, but missing `APS_HUB_ID` config is not an auth problem — it's a server-side precondition. New code uses the more accurate code while preserving the user-facing message hint about `APS_HUB_ID` env var.
- **`resolveAccountIdForRouter()` wrapper instead of try/catch at each call site.** Three call sites would mean three duplicated try/catch blocks. One named wrapper is cleaner and keeps the intent obvious.
- **Test file placed at `lib/server/__tests__/acc-helpers.test.ts`.** No existing convention for `lib/server` tests; this establishes one. Vitest auto-discovers files matching `**/*.test.ts` via `tsconfigPaths()` plugin, so `@/lib/server/acc-helpers` alias works in the test.

## Audit Result (SCHEMA-03)

```text
$ grep -rn "replace(/\^b\\./" server/ lib/server/
lib/server/acc-helpers.ts:28:  return hub.apsHubId.replace(/^b\./, "");
```

Single line, inside the canonical helper. No other inline stripping remains in `server/` or `lib/server/`. SCHEMA-03 satisfied.

## Call Sites Updated

| File                       | Line (pre-refactor) | Function in scope | Change                                                |
| -------------------------- | ------------------- | ----------------- | ----------------------------------------------------- |
| server/routers/users.ts    | 1076                | `syncAccUser`     | `getAccountId(ctx.db)` → `resolveAccountIdForRouter(ctx.db)` |
| server/routers/users.ts    | 1164                | `bulkAccSync`     | `getAccountId(ctx.db)` → `resolveAccountIdForRouter(ctx.db)` |
| server/routers/users.ts    | 1452                | `syncHubRoles`    | `getAccountId(ctx.db)` → `resolveAccountIdForRouter(ctx.db)` |

`toAccRouterError`-style manual wrapping was NOT added at any call site — instead, the single shared `resolveAccountIdForRouter()` performs the conversion (rationale: 3 call sites would duplicate the try/catch; one local wrapper is DRY-er and keeps the original tRPC error contract intact).

## Deviations from Plan

None — plan executed exactly as written. The plan's <implementation> section listed two options for handling the new plain-Error throw at call sites: (a) rely on the existing `toAccRouterError` if the call already routed through it, or (b) manually wrap. None of the 3 call sites previously routed the `getAccountId` call through `toAccRouterError`, so option (b) was taken — implemented once as `resolveAccountIdForRouter()` rather than three duplicated try/catch blocks. This matches the plan's intent (`"wrap the call in try/catch and convert manually to TRPCError({ code: PRECONDITION_FAILED, message: err.message })"`).

## Verification

| Check                                                                                  | Result |
| -------------------------------------------------------------------------------------- | ------ |
| `npx vitest run lib/server/__tests__/acc-helpers.test.ts` — 7/7 pass                   | PASS   |
| `npx tsc --noEmit` — no type errors                                                    | PASS   |
| `grep -n "function getAccountId" server/routers/users.ts` — returns nothing            | PASS   |
| `grep -n 'from "@/lib/server/acc-helpers"' server/routers/users.ts` — returns ≥ 1 line | PASS (line 32) |
| `grep -rn "replace(/\^b\\./" server/ lib/server/` (excl. acc-helpers.ts)               | PASS (no other hits) |

## Issues Encountered

None.

## Self-Check: PASSED

- `lib/server/acc-helpers.ts` — FOUND
- `lib/server/__tests__/acc-helpers.test.ts` — FOUND
- `server/routers/users.ts` (modified) — FOUND
- Commit `625854f` (test) — FOUND
- Commit `80ce197` (feat) — FOUND
- Commit `9e76f88` (refactor) — FOUND

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 01-03 (release/cron scripts) can `require()` the compiled `lib/server/acc-helpers.js` (after Next.js build) or import the TS source via `--experimental-transform-types` / `tsx`. The plain-Error contract avoids the @trpc/server dependency that would otherwise leak into CJS scripts.
- No blockers. Helper contract is stable, tested, and audit-clean.

---
*Phase: 01-foundation-schema-sync*
*Completed: 2026-05-11*
