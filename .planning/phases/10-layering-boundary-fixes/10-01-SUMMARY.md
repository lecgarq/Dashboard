---
phase: 10-layering-boundary-fixes
plan: "01"
subsystem: access-analysis / server-layering
tags: [boundary-fix, trpc, server-action, prisma-layering, BND-01]
status: complete

dependency_graph:
  requires: []
  provides: [lib/server/projectClashView.ts, server/routers/acc-coordination.ts]
  affects: [app/(dashboard)/access-analysis/coordinationActions.ts, server/routers/root.ts]

tech_stack:
  added: [acc-coordination tRPC router]
  patterns: [server-only lib helper, tRPC protectedProcedure, thin Server Action delegation]

key_files:
  created:
    - lib/server/projectClashView.ts
    - lib/server/projectClashView.test.ts
    - server/routers/acc-coordination.ts
  modified:
    - server/routers/root.ts
    - app/(dashboard)/access-analysis/coordinationActions.ts

decisions:
  - BND-01: preferred acc-coordination.ts over growing acc-members.ts (locked)
  - clash.ts confirmed to be clash-wiki/task domain (clashWiki/clashTask); unrelated to accIssue coordination
  - thin Server Action delegates server-side (NOT client useQuery) — mainCharts.tsx lazy-load-on-expand timing unchanged
  - double-gating (protectedProcedure + internal auth()) is safe and preserves [] contract

metrics:
  duration: "~15 minutes"
  completed: "2026-06-23"
  tasks_completed: 2
  files_changed: 5
---

# Phase 10 Plan 01: BND-01 Clash Drill-Down Boundary Fix Summary

**One-liner:** Moved accIssue coordination drill query verbatim from a route Server Action into `lib/server/projectClashView.ts`, exposed via new `accCoordinationRouter.getProjectClashes` tRPC procedure; `direct-prisma-in-ui` drops from 1 to 0 matches with zero behavior change.

## What Was Done

BND-01 eliminated the single `direct-prisma-in-ui` boundary violation: `app/(dashboard)/access-analysis/coordinationActions.ts` was importing `db` from `@/server/db` directly and running `accIssue.findMany` in a route Server Action. The fix:

1. **Task 1 (TDD):** Created `lib/server/projectClashView.ts` — a `server-only` helper containing the verbatim query body (same `accIssue.findMany` select/where/orderBy/take:500, same auth() gate, same DC-wins author resolution). Mirrored the convention of `lib/server/coordinationByProjectView.ts`. Added `lib/server/projectClashView.test.ts` with 5 pin tests (result shape, DC-wins author, empty-session guard, projectId filter, take:500).

2. **Task 2:** Created `server/routers/acc-coordination.ts` exporting `accCoordinationRouter` with `getProjectClashes(projectId: string)` using `protectedProcedure`. Registered `accCoordination: accCoordinationRouter` in `server/routers/root.ts`. Thinned `coordinationActions.ts` to a "use server" wrapper that delegates to `@/lib/server/projectClashView` — no `@/server/db` import, export name/signature unchanged.

## Verification Gates Run

| Gate | Result | Evidence |
|------|--------|----------|
| `npx vitest run lib/server/projectClashView.test.ts` | PASS — 5/5 tests | GREEN phase output |
| `npx tsc --noEmit` | PASS — 0 errors | No output (clean) |
| `npx ast-grep scan --config sgconfig.yml` (direct-prisma-in-ui) | 0 matches (was 1) | Console output: `direct-prisma-in-ui matches: 0` |
| `grep -n "^import" coordinationActions.ts` | No @/server/db import | Lines 2-3 only: ClashIssue type + helper |
| `grep -n "accCoordination" server/routers/root.ts` | Present at lines 25, 51 | Import + appRouter key |

## Commits

| Hash | Files | Description |
|------|-------|-------------|
| `4392637d` | `lib/server/projectClashView.ts`, `lib/server/projectClashView.test.ts` | Task 1: helper + pin test (TDD RED→GREEN) |
| `e400ef61` | `server/routers/acc-coordination.ts`, `server/routers/root.ts`, `app/(dashboard)/access-analysis/coordinationActions.ts` | Task 2: tRPC router + root.ts registration + thin action |

## Deviations from Plan

None — plan executed exactly as written.

- The `@/server/db` string appearing in ast-grep verification was in a JSDoc comment (intentionally documenting what was removed); the actual import lines confirmed clean. ast-grep rule (which targets import statements) returned 0 matches — definitive.
- TDD RED phase confirmed with `Cannot find module` error before implementation.
- Checker execution-time note #1 acknowledged: `lib/server/projectClashView.ts → app/(dashboard)/access-analysis/coordinationClash` type-only edge will be enumerated in Plan 10-03 CONCERNS.md deferred narrative.
- Checker execution-time note #2 acknowledged: post-10-01 `app→server` count is 28 (the `@/server/auth` import in `coordinationActions.ts` stays by design — now imports from the helper, not direct).

## Workshop Impact

Invisible — behavior identical. The `/access-analysis` Model-Coordination panel clash drill-down returns the same `ClashIssue[]` on project expand. Same Prisma models (`accIssue`, `accProjectMember`, `accDcUser`), same `select`/`where`/`orderBy`/`take: 500`, same auth gate, same call site (`mainCharts.tsx` passes `loadProjectClashes` as the `loadClashes` prop unchanged). Manual spot-check deferred to Plan 10-03's rebuild checkpoint.

## Data Truthfulness

No data change. Same query, same DC-wins author resolution, same models.

## Known Stubs

None.

## Threat Flags

None. New tRPC procedure is behind `protectedProcedure` (auth enforced at boundary). Helper retains internal `auth()` guard. No new network endpoints, file access patterns, or schema changes at trust boundaries.

## Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `10-01-PLAN.md`, `10-CONTEXT.md`, `coordinationActions.ts`, `coordinationByProjectView.ts`, `coordinationClash.ts`, `server/trpc.ts`, `server/routers/acc-members.ts`, `server/routers/root.ts` — all read. No missing/stale artifacts.
- **Evidence:** All paths verified from repo files. `accCoordination` key in root.ts confirmed at lines 25 and 51. `loadProjectClashes` export in `coordinationActions.ts` confirmed unchanged (lines 16-18). `@/server/db` import removed (only in JSDoc comment). `protectedProcedure` pattern copied from `acc-members.ts`.
- **Constraints applied:** Zinc theme — not touched. No new WebGL. `/users/spatial-graph` not touched. tRPC/Prisma patterns followed. Exact select/where/orderBy/take:500 preserved verbatim. `server-only` guard in helper. Boundary: Prisma access now in `lib/server/` + `server/routers/` only.
- **Gates:** `npx tsc --noEmit` + vitest pin test + ast-grep `direct-prisma-in-ui` rule. No rebuild required (deferred to 10-03). Repo-map check not required (this is a vertical file move with no new module boundaries or shared code added to scope).
- **VERIFY:** none.

## Self-Check

- [x] `lib/server/projectClashView.ts` exists
- [x] `lib/server/projectClashView.test.ts` exists
- [x] `server/routers/acc-coordination.ts` exists
- [x] Commits `4392637d` and `e400ef61` exist in git log
- [x] `npx tsc --noEmit` clean
- [x] `direct-prisma-in-ui` = 0 matches
- [x] Vitest 5/5 green

## Self-Check: PASSED
