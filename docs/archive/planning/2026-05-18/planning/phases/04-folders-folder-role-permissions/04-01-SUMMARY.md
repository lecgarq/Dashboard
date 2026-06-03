---
phase: 04-folders-folder-role-permissions
plan: "01"
subsystem: api
tags: [typescript, vitest, tdd, permissions, acc, pure-module]

# Dependency graph
requires: []
provides:
  - "PermTier literal union (6 UI tier labels)"
  - "TIER_DEFINITIONS ordered high→low with ReadonlySet per tier"
  - "mapActions() pure function: string[] → { tier, extended, extendedActions, unknownActions }"
affects:
  - 04-folders-folder-role-permissions/04-04 (folderCrawl ingest calls mapActions())
  - 04-folders-folder-role-permissions/04-06 (FolderPermissionsWidget imports PermTier)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD (RED/GREEN): test file committed first with import error, then implementation"
    - "Pure module pattern: zero imports beyond TypeScript built-ins, no I/O"
    - "Round-down tier selection: iterate TIER_DEFINITIONS high→low, first full match wins"

key-files:
  created:
    - lib/acc/permissionMapping.ts
    - lib/acc/permissionMapping.test.ts
  modified: []

key-decisions:
  - "TIER_DEFINITIONS ordered Full Controller → View Only; first tier with all actions present in input wins (round-down semantics)"
  - "extended=true means at least one KNOWN input action is NOT in the matched tier's required set (not about unknown actions)"
  - "Unknown actions: console.warn with action names, then ignored; mapping continues on remaining known actions"
  - "tier=null returned (no throw) when input is empty or only contains unknown actions"
  - "Upload Only tier = {PUBLISH} only — single-action tier intentionally isolated from View-family tiers"

patterns-established:
  - "mapActions() is the single call site for ACC actions[] → PermTier anywhere in the codebase"
  - "KNOWN_ACTIONS set kept internal (not exported); downstream callers use mapActions() only"

requirements-completed: [FLDR-03]

# Metrics
duration: 2min
completed: "2026-05-11"
---

# Phase 4 Plan 01: Permission Mapping Module Summary

**Pure TypeScript module `lib/acc/permissionMapping.ts` implementing 6-tier ACC actions→label mapping with TDD — round-down semantics, extended-action flagging, and unknown-action warning without throw**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-11T23:41:09Z
- **Completed:** 2026-05-11T23:42:32Z
- **Tasks:** 2 (RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Created `lib/acc/permissionMapping.test.ts` with 14 tests across 9 groups (6 tier matches + 3 edge cases + shape assertions) — committed in RED state with import error
- Implemented `lib/acc/permissionMapping.ts` — pure module with `PermTier` union, `TIER_DEFINITIONS` constant (6 entries, high→low), and `mapActions()` function — all 14 tests pass GREEN
- Module is the single source of truth for ACC `actions[]` → UI tier label, ready to be consumed by folderCrawl ingest (Plan 04) and the FolderPermissionsWidget (Plan 06)

## Tier Definitions (exact values for downstream plans)

| Order | Tier | Required Actions |
|-------|------|-----------------|
| 1 (highest) | Full Controller | VIEW, DOWNLOAD, COLLABORATE, PUBLISH, EDIT, CONTROL |
| 2 | View+Download+Upload+Edit | VIEW, DOWNLOAD, COLLABORATE, PUBLISH, EDIT |
| 3 | View+Download+Upload | VIEW, DOWNLOAD, COLLABORATE, PUBLISH |
| 4 | Upload Only | PUBLISH |
| 5 | View+Download | VIEW, DOWNLOAD, COLLABORATE |
| 6 (lowest) | View Only | VIEW, COLLABORATE |

Known actions: VIEW, DOWNLOAD, COLLABORATE, PUBLISH, EDIT, CONTROL

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Write failing tests** - `a28ed73` (test)
2. **Task 2 (GREEN): Implement permissionMapping.ts** - `c778cd3` (feat)

_TDD plan: 2 commits (test → feat)_

## Files Created/Modified

- `lib/acc/permissionMapping.ts` — exports `PermTier`, `TIER_DEFINITIONS`, `MapActionsResult`, `mapActions()`; zero external imports
- `lib/acc/permissionMapping.test.ts` — 14 Vitest tests: 6 tier-match groups + extended/round-down/unknown-action edge cases + shape assertions

## Decisions Made

- **Round-down implemented via ordered iteration**: `TIER_DEFINITIONS` is high→low; first tier whose full `actions` set is a subset of `knownSet` wins. This naturally implements round-down — partial grants that don't satisfy a higher tier fall through to a lower one.
- **extended vs unknownActions are separate concerns**: `extended` tracks known-but-excess actions (beyond matched tier); `unknownActions` tracks unrecognised action strings. Callers can distinguish "ACC added a new action to a familiar tier" from "ACC returned an undocumented action string".
- **Upload Only = {PUBLISH} only**: The tier table from CONTEXT.md has PUBLISH as the sole action for Upload Only. This is correct — it sits below View+Download+Upload in the iteration order, so inputs that have VIEW+DOWNLOAD+COLLABORATE+PUBLISH match View+Download+Upload first, not Upload Only.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `lib/acc/permissionMapping.ts` is ready for import by Plan 04 (`folderCrawl.ts`) via `mapActions()` at ingest time
- `PermTier` type is ready for import by Plan 06 (`FolderPermissionsWidget`) for cell rendering and hover detail
- FLDR-03 requirement fully satisfied: mapping table + all edge-case behaviors documented and unit-tested

---
*Phase: 04-folders-folder-role-permissions*
*Completed: 2026-05-11*
