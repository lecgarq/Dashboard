---
phase: 11-data-truthfulness-labels
plan: 02
subsystem: database
tags: [prisma, accproject, accdcproject, folderActivity, vitest, tdd, data-truthfulness]

requires:
  - phase: 09-performance-guardrails
    provides: Prisma DB stable with AccProject + AccDcProject models verified

provides:
  - "resolveProjectName(nameById, projectId): string — exported pure function; returns mapped name or 'Unknown project', never a raw GUID"
  - "buildProjectNameMap(accProject, accDcProject): Map<string,string> — exported pure merge helper; AccProject names take precedence on id conflict"
  - "loadFolderActivityProjects() now merges AccProject (1,153 superset) + AccDcProject (550) for name resolution; unresolved ids render 'Unknown project'"

affects:
  - 11-data-truthfulness-labels (plans 11-03, 11-04 share the access-analysis context)
  - phase verification: Folder Activity by Role panel must be visually confirmed to show no GUIDs

tech-stack:
  added: []
  patterns:
    - "Pure-function extraction pattern (mirrors buildCoverage in projectCoverageView.ts): export resolver as a named pure function for Vitest isolation"
    - "Merged-source name map: DC source loaded first, live AccProject overwrites on conflict (authoritative superset wins)"

key-files:
  created:
    - lib/server/__tests__/folderActivityView.test.ts
  modified:
    - lib/server/folderActivityView.ts

key-decisions:
  - "AccProject takes precedence over AccDcProject on id conflict — AccProject is the live API superset and is always fresher"
  - "Fallback string is the literal 'Unknown project' (not the raw id, not null, not empty) — this closes the GUID-leak that was owner-flagged for the demo"
  - "buildProjectNameMap and resolveProjectName are exported named functions so they can be unit-tested without mocking Prisma"

patterns-established:
  - "Pattern: export pure name-resolver from lib/server/* as a named export; DB-fetch wrapper calls it after loading raw rows"

requirements-completed: [TRUTH-01]

duration: 4min
completed: 2026-06-30
status: complete
---

# Phase 11 Plan 02: Folder-Activity GUID Leak Fix Summary

**Merged AccProject (1,153 superset) into loadFolderActivityProjects name resolution, replacing the raw-GUID fallback with 'Unknown project' — unit-pinned with 7 Vitest assertions.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-30T15:00:02Z
- **Completed:** 2026-06-30T15:04:02Z
- **Tasks:** 3 (Task 1: DB verify; Task 2: TDD RED+GREEN; Task 3: wire merge — all done)
- **Files modified:** 2

## Accomplishments

- DB verified: AccProject covers all 956 distinct ACCDS projectIds (100%); AccDcProject covers only 495 — confirming the merge closes the entire DC-only name gap.
- Extracted `resolveProjectName` + `buildProjectNameMap` as exported pure functions from `lib/server/folderActivityView.ts`, following the `buildCoverage` precedent in `projectCoverageView.ts`.
- Wired `db.accProject.findMany()` into `Promise.all` alongside the existing `db.accDcProject.findMany()` in `loadFolderActivityProjects()`; replaced the raw-id fallback with `resolveProjectName()`.
- 7-test Vitest suite passes: name-present → name; name-absent → "Unknown project"; blank id → "Unknown project"; AccProject-only id resolves (superset gap closed); AccProject wins on conflict; both map-builder tests green.

## Task Commits

TDD RED → GREEN sequence:

1. **Task 1: DB verification** — no file writes; results documented below
2. **Task 2 RED: failing Vitest** — `045d89cb` (test)
3. **Task 2 GREEN + Task 3: implement + wire** — `8e9c88ec` (feat)

## DB Verification Results (Task 1)

Live read-only query against local Postgres (via raw `pg` client, `DATABASE_URL` from `.env`):

| Metric | Count |
|--------|-------|
| Distinct `AccActivityAccds.projectId` | 956 |
| `AccProject` rows | 1,153 |
| `AccDcProject` rows | 550 |
| ACCDS projectIds matched by AccProject | **956** (100%) |
| ACCDS projectIds matched by AccDcProject | 495 (52%) |
| ACCDS projectIds matched by NEITHER | **0** (no residual) |

Decision: AccProject is the complete superset for all 956 ACCDS project ids. The merge eliminates the GUID leak entirely. The "Unknown project" fallback is defensive — it would fire only for a future project id not yet synced to either table.

## Files Created/Modified

- `lib/server/__tests__/folderActivityView.test.ts` — Created. 7-test Vitest covering all resolver behaviors. No Prisma mock — helper is pure.
- `lib/server/folderActivityView.ts` — Modified. Added `buildProjectNameMap` + `resolveProjectName` as exports; updated `loadFolderActivityProjects` to fetch both `accProject` and `accDcProject` in `Promise.all`, merge via `buildProjectNameMap`, and call `resolveProjectName` in the row map. `loadFolderActivityTree` is byte-unchanged.

## Decisions Made

- AccProject name takes precedence over AccDcProject on id conflict (AccProject is the authoritative live API source; DC metadata can lag).
- Fallback is the literal string `"Unknown project"` — not the raw id, not null. This is an honest label for the demo rather than an internal identifier leak.
- Pure helper exported from `lib/server/folderActivityView.ts` (not a separate file) — small enough to stay co-located; tested in `lib/server/__tests__/`.

## Deviations from Plan

**1. [Scope note — pre-existing tsc error, out of scope]** `npx tsc --noEmit` reports one pre-existing type error in `app/(dashboard)/access-analysis/mainCharts.tsx:61` (`ActivityTimelineResult` vs `ActivityTimelineRow[]`). This error exists in the committed branch HEAD before my changes (caused by plan 11-03's `activityTimelineView.ts` type change in commit `e042f1a2`). My changes to `folderActivityView.ts` introduce zero type errors. Documented but not fixed — it is out of scope for this plan's boundary.

No other deviations. Plan executed as written.

## Issues Encountered

- `node -e` inline script could not `require('./server/db')` (TypeScript/ESM alias). Used the existing `pg`-client pattern from `scripts/count-acc-data.cjs` for the DB verification query instead. No code impact.

## Verification Summary

| Gate | Result |
|------|--------|
| `npx vitest run lib/server/__tests__/folderActivityView.test.ts` | 7/7 PASSED |
| `npx tsc --noEmit` — my files | 0 errors in `folderActivityView.ts` / `.test.ts` |
| `npx tsc --noEmit` — whole tree | 1 pre-existing error in `mainCharts.tsx` (plan 11-03, out of scope) |
| `loadFolderActivityTree` untouched | Confirmed — byte-identical query and cache logic |
| `ProjectActivityTotal` shape unchanged | Confirmed — `projectName` stays `string`; caller `folderActivityActions.ts` needs no edits |
| `/users/spatial-graph` untouched | Confirmed — zero commits touching that path |
| No new WebGL | Confirmed — pure server-lib change, no UI files |

**Visual gate (deferred per plan):** On `/access-analysis`, expand "Folder Activity by Role" and confirm every project row shows a name or "Unknown project", never a 32-hex-char GUID. This requires a rebuild on `:3000` (see `references/deploy-sequence.md`).

## Known Stubs

None. The fix wires real data from both Prisma sources and has a labeled graceful fallback.

## Threat Flags

None beyond the plan's threat model. The name-merge precedence is deterministic and documented in a code comment; the pure resolver is pinned by the Vitest.

## Next Phase Readiness

- Plan 11-03 (TRUTH-02 dataFloor) already committed (`e042f1a2`) — note the `mainCharts.tsx` type error from that plan needs a follow-up fix in the same plan's scope or plan 11-04.
- Plan 11-04 (coverage header + module ⓘ tooltip) is the wave 2 plan.
- A rebuild on `:3000` is recommended before end-of-phase visual UAT (see the visual gate above).

---

## Dashboard Self-Check

- **Context:** STATE.md, 11-CONTEXT.md, 11-02-PLAN.md, `lib/server/folderActivityView.ts`, `app/(dashboard)/access-analysis/folderActivityActions.ts`, `lib/server/projectCoverageView.ts` (pure-split precedent), `prisma/schema.prisma` (AccProject.name non-nullable confirmed) — all read. `mainCharts.tsx` tsc error noted as pre-existing.
- **Evidence:** Exact DB counts from live Postgres (pg client). Exact file paths verified in repo. Commit hashes `045d89cb` + `8e9c88ec` verified via `git log`. `loadFolderActivityTree` confirmed unchanged by grep. `folderActivityActions.ts` confirms no caller edits needed.
- **Constraints:** Prisma access stays in `lib/server/` (not components). No new WebGL. No UI files changed. `/users/spatial-graph` untouched. zinc theme unaffected (server-only change).
- **Gates:** Vitest run (7/7 passed). `npx tsc --noEmit` (0 errors from my files; 1 pre-existing error from plan 11-03 in `mainCharts.tsx` — out of scope). Visual GUID-absence check deferred to end-of-phase per `human_verify_mode: end-of-phase`.
- **VERIFY:** Visual check on rebuilt `:3000` that "Folder Activity by Role" shows no raw GUIDs. Pre-existing tsc error in `mainCharts.tsx` needs resolution (plan 11-03 scope).

---
*Phase: 11-data-truthfulness-labels*
*Completed: 2026-06-30*
