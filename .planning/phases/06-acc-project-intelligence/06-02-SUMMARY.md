---
phase: 06-acc-project-intelligence
plan: "02"
subsystem: acc-admin
tags: [acc, autodesk, api-wrapper, server-only, typescript]
dependency_graph:
  requires:
    - lib/server/integration-errors.ts
  provides:
    - lib/server/acc-admin.ts
  affects:
    - server/routers/acc-project-intelligence.ts (Plan 03 imports these functions)
tech_stack:
  added: []
  patterns:
    - "server-only guard at top of module"
    - "do-while offset pagination for ACC Admin API"
    - "internal fetchApsJson copy (not re-exported) to avoid circular imports"
key_files:
  created:
    - lib/server/acc-admin.ts
  modified: []
decisions:
  - "accountId stripping (b. prefix) is caller responsibility — these helpers receive bare UUID"
  - "fetchAccUserByEmail returns null on empty results rather than throwing — per ACC API pitfall 3"
  - "fetchAccUserProjects filters roles with name.includes('(Removed)') inside the helper, not in tRPC"
  - "fetchApsJson copied from aps-search.ts pattern (not imported) since it is not exported there"
  - "signal: AbortSignal optional param added to all three public functions for React cancellation support"
metrics:
  duration: "~1 minute"
  completed_date: "2026-04-22"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
---

# Phase 06 Plan 02: ACC Admin API Wrapper Library Summary

Typed server-only helper library (`lib/server/acc-admin.ts`) wrapping three ACC Admin API endpoints with pagination, error propagation, and role filtering baked in.

## What Was Built

A new file `lib/server/acc-admin.ts` that encapsulates all ACC Admin API call logic so the tRPC router (Plan 03) stays clean and testable.

**Exported surface:**
- `ACC_ADMIN_BASE` — base URL constant for ACC Admin v1 API
- `AccUser`, `AccRole`, `AccProject`, `AccProduct` — TypeScript types matching API response shapes
- `fetchAccUserByEmail(accountId, email, accessToken, signal?)` — returns `AccUser | null`
- `fetchAccUserProjects(accountId, autodeskUserId, accessToken, signal?)` — returns `AccProject[]` with `(Removed)` roles filtered out
- `fetchAccUserProducts(accountId, autodeskUserId, accessToken, signal?)` — returns `AccProduct[]`

**Internal (not exported):**
- `fetchApsJson` — copied pattern from `aps-search.ts`; handles 401/403 as `IntegrationError("reconnect_required")` and other non-ok as `"unavailable"`
- `getString` helper — safe string extraction from unknown values

## Task Completion

| Task | Name                                      | Commit  | Files                      |
| ---- | ----------------------------------------- | ------- | -------------------------- |
| 1    | Create lib/server/acc-admin.ts wrappers   | 6328633 | lib/server/acc-admin.ts    |

## Deviations from Plan

None — plan executed exactly as written.

One minor addition: `signal?: AbortSignal` parameter added to all three public functions (not in plan spec). This follows the same pattern as other async helpers in the codebase and allows React/tRPC to cancel in-flight requests. This is a correctness improvement, not a behavioral change.

## Self-Check

- [x] `lib/server/acc-admin.ts` — FOUND
- [x] Commit `6328633` — FOUND
- [x] TypeScript: zero errors in `acc-admin.ts` (tsc --noEmit passed)
- [x] File starts with `import "server-only"`
- [x] Exports: ACC_ADMIN_BASE, AccUser, AccRole, AccProject, AccProduct, fetchAccUserByEmail, fetchAccUserProjects, fetchAccUserProducts

## Self-Check: PASSED
