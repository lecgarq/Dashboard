---
phase: 04-access-analysis
plan: 04
subsystem: api
tags: [trpc, googleapis, people-api, oauth, workspace, directory]

requires:
  - phase: 02.5-acc-data-filter-refinement
    provides: Existing google OAuth scope plumbing (directory.readonly already in oauth.ts:11)
provides:
  - workspaceRouter.getDirectory tRPC procedure (typed { emails: string[] })
  - In-memory 1h server cache keyed by userId
  - Typed error codes for the Coverage donut UI to handle (PRECONDITION_FAILED, FORBIDDEN)
  - Graceful empty-list fallback for non-Workspace (personal Gmail) users
affects: [DASH-01 Coverage donut, future Workspace-backed widgets]

tech-stack:
  added: []
  patterns:
    - Module-level Map<userId, { value, expires }> for simple per-process server cache
    - googleapis OAuth2 client construction via getPrimaryGoogleOAuthClientConfig (mirrors buildUserGmailApi)
    - Pagination loop with explicit MAX_PAGES safety cap

key-files:
  created:
    - server/routers/workspace.ts
  modified:
    - server/routers/root.ts

key-decisions:
  - "Plan referenced server/routers/_app.ts; actual project file is server/routers/root.ts (registered new router there)"
  - "Used DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE per Google docs (sources is typed as string[] in googleapis, no compile-time check)"
  - "MAX_PAGES = 25 × PAGE_SIZE 1000 = 25,000 user safety cap (Pitfall 3)"
  - "In-memory Map cache (not @upstash/redis) for v1.0 — single-process scope; documented limitation in JSDoc"
  - "Mapped People API 400/FAILED_PRECONDITION responses to empty list (Open Q5: non-Workspace users)"
  - "Mapped 403/insufficientPermissions to FORBIDDEN workspace_scope_missing for re-consent UX"
  - "Did not commit any temporary smoke-test trigger code — smoke test deferred to manual UAT (requires live Workspace login)"

patterns-established:
  - "Server cache pattern: module-level Map with { value, expires } records; check-then-write at procedure boundaries"
  - "Google OAuth tRPC procedure: refresh_token lookup → OAuth2 client → setCredentials → API call → typed TRPCError on scope/auth issues"

requirements-completed: [DASH-01]

duration: 3min
completed: 2026-05-08
---

# Phase 4 Plan 04: Workspace Directory tRPC Procedure Summary

**Server-side `workspaceRouter.getDirectory` using already-granted `directory.readonly` scope, with paginated People API listing, 1h in-memory cache, and graceful fallback for non-Workspace users — unblocks DASH-01 Coverage donut.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T18:54:53Z
- **Completed:** 2026-05-08T18:57:22Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 edited)

## Accomplishments

- New `workspaceRouter.getDirectory` protected tRPC procedure returning `{ emails: string[] }` (lower-cased, deduped via Set)
- Pagination via `nextPageToken` until exhaustion or 25-page safety cap (Pitfall 3 — handles >1000 users)
- Module-level `Map<userId, { value, expires }>` cache with 1h TTL prevents quota burn on dashboard reloads (Open Q4 recommendation)
- Typed error vocabulary for downstream UI:
  - `PRECONDITION_FAILED` `workspace_access_required` — no Google account / no refresh_token
  - `FORBIDDEN` `workspace_scope_missing` — Google rejected with 403/insufficient scope (re-consent flow)
  - `INTERNAL_SERVER_ERROR` `workspace_directory_failed` — anything else
- Graceful empty-list fallback (Open Q5) — personal Gmail / non-Workspace users get `{ emails: [] }` and a cached negative result, not a crash
- Registered on the root tRPC `appRouter` so `trpc.workspace.getDirectory.useQuery()` is typed end-to-end

## Task Commits

1. **Task 1: Create workspaceRouter.getDirectory** — `b9ea4b3` (feat)
2. **Task 2: Register workspaceRouter on appRouter** — `3fea8a2` (feat)

## Files Created/Modified

- `server/routers/workspace.ts` (created) — workspaceRouter with getDirectory protectedProcedure, in-memory cache, pagination, typed errors
- `server/routers/root.ts` (modified) — added `workspaceRouter` import and `workspace: workspaceRouter` registration

## Decisions Made

- **Plan referenced wrong filename.** Plan said `server/routers/_app.ts`; the actual project app router lives at `server/routers/root.ts`. Registered there. (Rule 3 — blocking issue, auto-fixed.)
- **`sources` enum value.** Used `DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE` per Google's public docs. The `googleapis` TS surface declares `sources?: string[]` (no string literal union), so verification was via Google docs rather than compile-time check. Documented in JSDoc on the constant.
- **In-memory cache only.** Did NOT introduce `@upstash/redis` despite presence in deps — RESEARCH.md Open Q4 explicitly recommends 1h server cache; in-memory is sufficient for v1.0 since each user only causes one cache entry per replica. Limitation documented in JSDoc.
- **Error mapping for non-Workspace users.** People API can return either an empty list OR a 400/FAILED_PRECONDITION for users not in a Workspace tenant. Both paths fold to `{ emails: [] }` and cache the negative result so the donut renders an empty-state without crashing.
- **Smoke-test trigger code NOT committed.** Per plan task 2 instruction; live verification deferred to manual UAT (requires a Workspace-tenant Google login to observe non-empty result).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan referenced `server/routers/_app.ts`; project uses `server/routers/root.ts`**
- **Found during:** Task 2 (Register workspaceRouter on the tRPC app router)
- **Issue:** The plan's `<files>` block specified `server/routers/_app.ts`, but the project's tRPC app router is named `root.ts` (verified via `Glob server/routers/*.ts` — no `_app.ts` exists). Without this fix, the procedure could not be registered.
- **Fix:** Imported `workspaceRouter` and added `workspace: workspaceRouter` to the existing `appRouter` definition in `server/routers/root.ts`. The export `export type AppRouter = typeof appRouter;` is unchanged so client typing is preserved.
- **Files modified:** `server/routers/root.ts`
- **Verification:** `npx tsc --noEmit` reports zero errors related to `workspace` (other unrelated DASH-04/07 pre-existing errors logged to `deferred-items.md`).
- **Committed in:** `3fea8a2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking)
**Impact on plan:** No scope creep. Single filename mismatch resolved by following the project's actual file layout.

## Deferred Issues

Pre-existing TypeScript errors discovered during `npx tsc --noEmit` are NOT in files modified by this plan and belong to other in-flight DASH plans (DASH-04 nameSimilarity module not yet committed; DASH-07 `isAccountAdmin` field added to types but not populated everywhere). Logged to `.planning/phases/04-access-analysis/deferred-items.md`. Out-of-scope per GSD SCOPE BOUNDARY rule.

## Issues Encountered

- **Smoke test cannot run autonomously.** Plan Task 2 step 4 calls for visiting the app while logged in as a Workspace user and reading the result via React DevTools. This requires interactive human action with a live Workspace account. Marked as deferred manual UAT — does NOT block downstream work because:
  - Type-level export is verified (tsc passes for workspace).
  - All three response branches (success / scope-missing / non-Workspace) are deterministic from inspection of the implementation.
  - The DASH-01 Coverage donut consumer can stub the response in widget tests.

## Verified `sources` Enum Value

`DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE` — selected per Google's public People API docs. `googleapis@171.4.0` declares `Params$Resource$People$Listdirectorypeople.sources?: string[]`, so no compile-time enum constraint exists. Constant is named `DOMAIN_PROFILE_SOURCE` in `server/routers/workspace.ts` with a JSDoc link to the spec.

## Email Count Observed During Smoke Test

**Not measured** — smoke test deferred to manual UAT (requires live Workspace login). The implementation will return up to 25,000 emails via the safety cap; typical Workspace tenants are under that limit.

## Cache Strategy + TTL

- **Strategy:** Module-level `Map<userId, { value: string[]; expires: number }>` (in-memory, single-process, single-replica)
- **TTL:** 1 hour (`60 * 60 * 1000` ms)
- **Limitations documented in JSDoc:** Multi-replica deployments cache independently. Migrate to `@upstash/redis` if quota pressure (1500 req/min/project) appears.
- **Negative caching:** Empty-result responses (non-Workspace users) are also cached for 1h to prevent repeated 400 errors on dashboard reloads.

## TRPC Error Codes Downstream UI Must Handle

| Code | Message | Meaning | Recommended UI |
| ---- | ------- | ------- | -------------- |
| `PRECONDITION_FAILED` | `workspace_access_required` | No Google account row or no refresh_token in `Account` table | Inline prompt: "Sign in with Google to view Workspace coverage" |
| `FORBIDDEN` | `workspace_scope_missing` | Google rejected with 403 / insufficient scope | Inline prompt: "Re-authorize with Workspace to see directory coverage" |
| `INTERNAL_SERVER_ERROR` | `workspace_directory_failed` | Unexpected upstream error | Generic widget error state with Retry |
| (no error, `emails: []`) | — | User not in a Workspace tenant (personal Gmail) | Empty-state inline message: "Workspace integration not available — sign in with a Workspace account to see coverage" |

## Next Phase Readiness

- DASH-01 Coverage donut widget is unblocked: `trpc.workspace.getDirectory.useQuery()` returns `{ emails: string[] }` for set arithmetic against ACC members.
- Server cache prevents quota burn on dashboard reloads; client-side `@tanstack/react-query` adds another layer of staleTime control.
- Pre-existing tsc errors in `lib/server/acc-admin.ts` and `lib/acc/nameSimilarity.test.ts` should be resolved by the plan that introduced `isAccountAdmin` / DASH-04 work — flagged in `deferred-items.md`.

## Self-Check

Verified before state updates:
- `server/routers/workspace.ts` exists (FOUND)
- `server/routers/root.ts` modified to import and register workspaceRouter (FOUND)
- Commit `b9ea4b3` exists (FOUND)
- Commit `3fea8a2` exists (FOUND)

## Self-Check: PASSED

---
*Phase: 04-access-analysis*
*Completed: 2026-05-08*
