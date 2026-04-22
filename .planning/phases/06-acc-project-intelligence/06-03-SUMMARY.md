---
phase: 06-acc-project-intelligence
plan: "03"
subsystem: trpc-router
tags: [trpc, acc, cache, autodesk, server-router]
dependency_graph:
  requires:
    - lib/server/acc-admin.ts
    - lib/server/aps-user-token.ts
    - lib/server/integration-errors.ts
    - prisma/AccMemberCache-table
  provides:
    - users.getAccProfile tRPC procedure
  affects:
    - server/routers/users.ts
tech_stack:
  added: []
  patterns:
    - "cache-first with forceRefresh bypass"
    - "b. prefix stripping for ACC Admin API accountId"
    - "IntegrationError -> PRECONDITION_FAILED mapping"
    - "Promise.all for parallel ACC API fetches"
key_files:
  created: []
  modified:
    - server/routers/users.ts
decisions:
  - "getAccProfile placed in usersRouter (not a new router) — it is a user data query aligned with existing user profile procedures"
  - "toAccRouterError copies the aps-search.ts pattern rather than sharing — avoids importing from sibling router file"
  - "Cache hit returns early with JSON.parse of Prisma Json field — cast to typed object for downstream consumers"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-22"
  tasks_completed: 1
  files_modified: 1
---

# Phase 06 Plan 03: getAccProfile tRPC Procedure Summary

**One-liner:** Cache-first tRPC query procedure in usersRouter that fetches ACC hub membership by email using admin token, with 24h Prisma cache and on-demand refresh support.

## What Was Built

Added `getAccProfile` procedure to the existing `usersRouter` in `server/routers/users.ts`. This is the data layer that Plan 04's `AccProfileSection` UI component will call.

**Procedure signature:**
```typescript
users.getAccProfile({ email: string, forceRefresh?: boolean })
```

**Logic flow:**
1. Cache check: if `accMemberCache` row for email exists and `syncedAt < 24h`, return cached JSON immediately
2. `forceRefresh: true` skips step 1 and always hits ACC Admin API
3. Retrieve admin's Autodesk access token via `getValidAutodeskAccessToken` — throws `PRECONDITION_FAILED` if not linked
4. Get `apsHubId` from `Project` table, strip `b.` prefix → bare UUID for ACC Admin API
5. Call `fetchAccUserByEmail` — returns `null` (not throw) if email not in ACC
6. If not found: upsert `{ found: false, syncedAt }` to cache and return
7. If found: `Promise.all([fetchAccUserProjects, fetchAccUserProducts])` in parallel
8. Upsert full result to `accMemberCache` and return

**Return types:**
- `{ found: false, syncedAt: string }` — email not in ACC hub
- `{ found: true, autodeskId, name, status, projects, products, syncedAt }` — full profile

**Error handling:**
- No Autodesk account linked → `PRECONDITION_FAILED` (via `IntegrationError.reconnect_required`)
- APS config missing → `PRECONDITION_FAILED` (via `IntegrationError.config_missing`)
- `apsHubId` not configured → `PRECONDITION_FAILED` with clear message
- ACC Admin API 403 (no Account Admin privilege) → `PRECONDITION_FAILED`
- Other API failures → `INTERNAL_SERVER_ERROR`

## Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add getAccProfile procedure to usersRouter | 612b15d | Complete |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `server/routers/users.ts` — imports `IntegrationError`, `getValidAutodeskAccessToken`, `fetchAccUserByEmail`, `fetchAccUserProjects`, `fetchAccUserProducts`
- [x] `getAccProfile` procedure present at line 721 of `server/routers/users.ts`
- [x] `b.` prefix stripping present: `project?.apsHubId?.replace(/^b\./, "")` at line 768
- [x] `{ found: false }` negative result cached and returned
- [x] `toAccRouterError` maps `IntegrationError` to `PRECONDITION_FAILED` for reconnect_required / config_missing
- [x] `npx tsc --noEmit` — zero TypeScript errors in users.ts and project-wide
- [x] Commit `612b15d` — present in git log

## Self-Check: PASSED
