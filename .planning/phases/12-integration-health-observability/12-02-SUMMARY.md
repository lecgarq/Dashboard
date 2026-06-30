---
phase: 12-integration-health-observability
plan: "02"
subsystem: observability
tags: [acc-roles, role-resolution, diagnostics, vitest, server-logging]

requires:
  - phase: 11-data-truthfulness-labels
    provides: "mergeRoleNames in lib/server/accessInstanceView.ts; AccRole fallback for AccDcRole-empty production state"

provides:
  - "shouldWarnEmptyRoleResolution predicate (exported, tested) — effective-empty trigger for [ACC-ROLES] server warn"
  - "loadInstanceView emits [ACC-ROLES] console.warn once per cache-miss when both AccDcRole and AccRole yield zero names"
  - "acc-admin.ts cleaned: stale TODO[02.5] diagnostics removed; companyRole/lastSignIn resolution unchanged"

affects:
  - "lib/server/accessInstanceView.ts consumers (acc-dc-graph.ts router and any future cache consumers)"
  - "server logs: [ACC-ROLES] warn is now grepable when role-name resolution fails"

tech-stack:
  added: []
  patterns:
    - "effective-empty predicate: exported pure function for testable side-effect trigger"
    - "once-per-cache-refresh warn: TTL gate means the warn fires at most every 5 min, not per request"

key-files:
  created: []
  modified:
    - lib/server/accessInstanceView.ts
    - lib/server/accessInstanceView.test.ts
    - lib/server/acc-admin.ts

key-decisions:
  - "OBS-02 deliberate divergence: warning lives at loadInstanceView (real role-resolution boundary), NOT acc-hot-cache.ts (which never references AccDcRole); fires on effective-empty (both sources=0 names), NOT on by-design AccDcRole-empty alone"
  - "OBS-03 code-grounded removal: job_title confirmed in-file (2026-05-18 diagnostic), companyRole/lastSignIn consumed downstream in acc-graph.ts:148-151 and acc-profile.ts:181 — no live Autodesk sync needed before deletion"

patterns-established:
  - "effective-empty predicate pattern: shouldWarnEmptyRoleResolution(dc, live) wraps mergeRoleNames for testable, log-free predicate extraction"

requirements-completed: [OBS-02, OBS-03]

duration: ~15min
completed: "2026-06-30"
status: complete
---

# Phase 12 Plan 02: OBS-02 + OBS-03 Summary

**Effective-empty role-resolution warning added at `loadInstanceView` and stale `TODO[02.5]` diagnostics removed from `acc-admin.ts` — server logs now surface the real silent failure without noise**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-30T11:37Z
- **Completed:** 2026-06-30T11:40Z
- **Tasks:** 2 (Task 1 TDD, Task 2 deletion)
- **Files modified:** 3

## Accomplishments

- OBS-02: `shouldWarnEmptyRoleResolution(dc, live)` exported from `lib/server/accessInstanceView.ts` — pure predicate returning `mergeRoleNames(dc,live).size === 0`; tested with 3 Vitest cases covering both-empty (true), AccRole-resolves (false), DC-resolves (false)
- OBS-02: `[ACC-ROLES]` console.warn wired in `loadInstanceView` after `mergeRoleNames` — fires once per cache-miss (5-min TTL), silent in normal production operation (AccRole carries 77/77 role names)
- OBS-03: removed module flag `loggedRawShape` + `TODO[02.5]` stale marker, and the `[02.5-D-DIAG]` guarded console.info block from `fetchAllAccUsers`; `for (const u of users)` loop and all `companyRole`/`lastSignIn` resolution lines intact

## Task Commits

Each task was committed atomically:

1. **Task 1: OBS-02 — effective-empty role-resolution warning at loadInstanceView** - `cac1a07e` (feat)
2. **Task 2: OBS-03 — delete stale defensive-logging diagnostics from lib/server/acc-admin.ts** - `72b4079d` (feat)

## Files Created/Modified

- `lib/server/accessInstanceView.ts` — added divergence header note, `shouldWarnEmptyRoleResolution` export, and `[ACC-ROLES]` console.warn in `loadInstanceView`
- `lib/server/accessInstanceView.test.ts` — added `describe("shouldWarnEmptyRoleResolution")` with 3 cases (both-empty, AccRole-resolves, DC-resolves); import updated to include new export
- `lib/server/acc-admin.ts` — deleted line 51 stale comment + line 52 `loggedRawShape` flag; deleted lines 207-219 guarded diagnostic block (TODO[02.5-D] console.info calls + flag gate); `for (const u of users)` loop and field resolution unchanged

## Decisions Made

**OBS-02 deliberate divergence** (locked in 12-CONTEXT.md, confirmed in implementation):
The roadmap attributes the role-resolution warning to `lib/server/acc-hot-cache.ts`, but that file does not reference `AccDcRole`. The real boundary is `loadInstanceView()` in `lib/server/accessInstanceView.ts` where `mergeRoleNames` runs. The warning fires on effective-empty (both sources=0 names), NOT on the by-design `AccDcRole`-empty state alone (always empty, would warn every refresh). This was pre-decided in 12-CONTEXT.md §OBS-02.

**OBS-03 code-grounded removal (no live sync needed)**:
Field-name proof already present in `acc-admin.ts` line 233-234 ("HQ v1 returns `job_title` — verified 2026-05-18"). `companyRole` (4 refs) and `lastSignIn` (3 refs) are consumed downstream in `server/routers/users/acc-graph.ts:148-151` (threads into `AccMemberCache.data`) and `server/routers/users/acc-profile.ts:181`. Deletion is safe without a live Autodesk sync.

## Deviations from Plan

None — plan executed exactly as written. The OBS-02 divergence from literal roadmap wording was pre-decided in 12-CONTEXT.md and documented in the plan; it is not a new deviation.

## Verification Evidence

All gates run and confirmed clean:

| Gate | Command | Result |
|------|---------|--------|
| RED phase | `npx vitest run lib/server/accessInstanceView.test.ts` | 3 new tests FAIL (shouldWarnEmptyRoleResolution not found), 4 existing PASS |
| GREEN phase | `npx vitest run lib/server/accessInstanceView.test.ts` | 7/7 PASS |
| tsc after Task 1 | `npx tsc --noEmit` | clean (no output) |
| OBS-03 stale grep | `grep -cE 'loggedRawShape\|02\.5' lib/server/acc-admin.ts` | 0 |
| OBS-03 companyRole | `grep -c companyRole lib/server/acc-admin.ts` | 4 (>=1, intact) |
| OBS-03 lastSignIn | `grep -c lastSignIn lib/server/acc-admin.ts` | 3 (>=1, intact) |
| tsc after Task 2 | `npx tsc --noEmit` | clean (no output) |

## Data Truthfulness

No data changes. OBS-02 reframing is itself a data-truth decision: the warning fires on the real failure (no resolvable role names from either source), not on the cosmetic by-design state, so the signal honestly reflects when role labels are actually broken.

## Workshop Impact

None — server logs only. No changes to `/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`, or `/users/spatial-graph`. No schema changes, no new WebGL, no ECharts changes, no UI changes.

## Issues Encountered

None.

## Next Phase Readiness

- Phase 12 now has Plan 12-01 (OBS-01) outstanding. Both plans are wave-1 and independent.
- VERIFY: 12-01-SUMMARY.md not yet created (separate parallel plan for ACCDS session health).
- After both 12-01 and 12-02 complete, Phase 12 closes and v2.1 proceeds to Phase 13 (Type-Safety Guards) and Phase 14 (Characterization Tests).

---

## Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `.planning/phases/12-integration-health-observability/12-02-PLAN.md`, `12-CONTEXT.md`, `lib/server/accessInstanceView.ts`, `lib/server/accessInstanceView.test.ts`, `lib/server/acc-admin.ts` — all read before editing.
- **Evidence:** All file paths verified from repo. `mergeRoleNames` location confirmed in `accessInstanceView.ts:28`. `loadInstanceView` TTL cache confirmed at lines 86-106. Diagnostic block confirmed at original lines 207-219 in `acc-admin.ts`. Downstream consumers confirmed: `acc-graph.ts:148-151` and `acc-profile.ts:181`.
- **Constraints:** No workshop-page changes. No new WebGL. No schema change. No ECharts. No `/users/spatial-graph` touches. `lib/server/` boundary respected — no Prisma in UI.
- **Gates:** `npx tsc --noEmit` run twice (after Task 1 and Task 2). Vitest targeted run `lib/server/accessInstanceView.test.ts` (7/7 pass). OBS-03 grep gates (stale=0, companyRole=4, lastSignIn=3). `npm run build` / rebuild NOT run (not required for server-log-only changes; no workshop UI affected).
- **VERIFY:** none.

---
*Phase: 12-integration-health-observability*
*Completed: 2026-06-30*
