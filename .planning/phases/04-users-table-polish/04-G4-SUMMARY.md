---
phase: "04"
plan: "G4"
subsystem: users-profile-panel
tags: [bug-fix, tdd, tRPC, user-experience]
status: complete
completed: 2026-06-18
duration: ~25min
tasks_completed: 2
tasks_total: 2
key_files:
  created: []
  modified:
    - server/routers/acc-dc-graph.ts
    - app/(dashboard)/users/UserProfilePanel.tsx
    - app/(dashboard)/users/UserProfilePanel.test.tsx
decisions:
  - "Full non-lean fetch via new bulkUser proc rather than per-project API calls"
  - "Email guard on fullBulkUser prevents cross-user data bleed in mocks and edge cases"
  - "Query disabled for rail variant (rail opens from access-analysis graph, not /users DrillSheet)"
  - "mockReturnValueOnce pattern preserved for loading-state test; spy inspects enabled option"
---

# Phase 04 Plan G4: Profile Panel Roles/Modules Auto-Load Summary

Panel now shows per-project roles and modules without a manual Refresh click, sourced from
local DC snapshot data (no live Autodesk API call).

## Root Cause (confirmed, not re-investigated)

The /users DrillSheet uses the lean bulk payload (`leanProjects: true`) which empties
`roles: []` and `modules: []` on every project. `UserProfilePanel` rendered from the
in-memory lean `BulkAccUser`, so the ACC section showed 0 roles / 0 modules. The only
repopulation path was the manual Refresh button, which called the live Autodesk Admin API.

## What Was Built

### Task 1 (RED) — Failing tests

**`server/routers/acc-dc-graph.test.ts`** — added `makeMinimalDb()` helper and a new
`accDcGraphRouter.bulkUser` describe block with 3 tests:
- found user returns full roles + modules
- unknown email returns null
- case-insensitive email lookup

**`app/(dashboard)/users/UserProfilePanel.test.tsx`** — updated mock to use `vi.hoisted`
with a smart spy that (a) respects the `enabled` option, (b) dispatches by email, (c) can
be overridden per-test with `mockReturnValueOnce`. Added 2 G4 tests:
- panel shows per-project roles/modules without Refresh (`bulkUserQuerySpy` called; live fetch not called)
- loading indicator (`data-testid="acc-detail-loading"`) appears while in-flight

### Task 2 (GREEN) — Implementation

**`server/routers/acc-dc-graph.ts`** — added `bulkUser` procedure:
```ts
bulkUser: adminProcedure
  .input(z.object({ email: z.string() }))
  .query(async ({ ctx, input }) => {
    const users = await getCachedAccDcBulkUsers(ctx.db, {});  // full non-lean variant
    return users.find(u => u.email.toLowerCase() === input.email.toLowerCase()) ?? null;
  })
```
Uses the shared hot-cache (`cacheId: "lean"` for the full `{}` variant). First call after
cold start pays assembly cost once; subsequent calls are instant.

**`app/(dashboard)/users/UserProfilePanel.tsx`** — dialog variant now:
1. Calls `trpc.accDcGraph.bulkUser.useQuery({ email }, { enabled: variant === "dialog" && !!email, staleTime: 5min })`
2. Derives `baseData` with priority: Refresh override > fullBulkUser (email-guarded) > lean user
3. Shows `data-testid="acc-detail-loading"` spinner while full fetch is in flight (not blocking — header chrome + lean data render immediately)
4. Passes `baseData` (enriched with real roles/modules) to `AccProfileFull`

## Deviations from Plan

None — plan executed exactly as written. One self-found issue resolved inline:

**[Rule 1 - Bug] Email guard added to fullBulkUser consumption**
- **Found during:** GREEN implementation + test run
- **Issue:** Mock spy returned Ada's data for all emails (no email filter), causing cross-user bleed — stub (ghost@example.com) would render Ada's roles
- **Fix:** Added `fullBulkUser.email.toLowerCase() === email.toLowerCase()` guard before using the full user result; also updated spy to dispatch by email and respect `enabled: false`
- **Files modified:** UserProfilePanel.tsx, UserProfilePanel.test.tsx
- No separate commit needed — caught during GREEN iteration

## Success Criteria Verification

- [x] Opening a profile shows per-project roles/modules WITHOUT clicking Refresh
- [x] Panel opens instantly (lean user renders immediately; ACC detail enriches asynchronously)
- [x] ACC section shows loading indicator while bulkUser fetch is in flight (`data-testid="acc-detail-loading"`)
- [x] Activity panel (`AccUserActivityPanel`) already had eager fetch + loading state — no changes needed
- [x] Live Autodesk fetch (`getAccProfile`) not called automatically — only on manual Refresh
- [x] tsc: 0 errors
- [x] Unit suite: 2115 pass (net +5 new tests; 2 pre-existing FolderPermissionTerrain failures unchanged)
- [x] repo-map:check: passed
- [x] Surgical staging: only 3 files committed, no unrelated WIP swept in

## Commits

| Hash     | Message |
|----------|---------|
| eac70dcf | test(04-G4): add failing tests for bulkUser proc and roles/modules auto-load |
| d0d6da08 | feat(04-G4): auto-load per-project roles/modules in UserProfilePanel without Refresh |

## Known Stubs

None.

## Threat Flags

None — new `bulkUser` proc is protected via `adminProcedure` (same auth level as `bulkUsers`). No new network endpoints or trust boundary changes.

## Self-Check: PASSED

- `server/routers/acc-dc-graph.ts` — modified (bulkUser proc added): FOUND
- `app/(dashboard)/users/UserProfilePanel.tsx` — modified (bulkUser query + baseData logic): FOUND
- `app/(dashboard)/users/UserProfilePanel.test.tsx` — modified (spies + G4 tests): FOUND
- Commits eac70dcf and d0d6da08 exist in git log: FOUND
