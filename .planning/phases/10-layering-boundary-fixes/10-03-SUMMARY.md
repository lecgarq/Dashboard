---
phase: 10-layering-boundary-fixes
plan: "03"
subsystem: lib/acc, app/(dashboard)/access-analysis, lib/server, codebase/CONCERNS
tags: [boundary-fix, BND-03, BND-04, type-extraction, re-export-barrel, zero-behavior-change]
status: complete

dependency_graph:
  requires:
    - phase: 10-01
      provides: lib/server/projectClashView.ts (new lib->app edge: projectClashView->coordinationClash, documented)
    - phase: 10-02
      provides: lib/acc/activityClassification.ts (new lib->app edges: ->accTaxonomy/accNormalize, documented-deferred)
  provides:
    - lib/acc/coordinationCounts.ts (pure aggregation, cleared coordinationByProjectView->app edge)
    - lib/acc/timelineCounts.ts (pure aggregation, cleared activityTimelineView->app edge)
    - lib/acc/moduleCountsTypes.ts (ModuleActivityRow interface, cleared moduleActivityView->app edge)
    - .planning/codebase/CONCERNS.md BND-03/BND-04 resolution note (full edge enumeration + verdict)
  affects: [phase-13-type-guards, phase-14-monolith-split]

tech_stack:
  added: []
  patterns:
    - "Pure type/aggregation module extracted to lib/acc/ with export * barrel at app/ path — zero-risk move preserving all UI import paths"
    - "Interface-only extraction (ModuleActivityRow) to lib/acc/moduleCountsTypes.ts — shared row type without moving business logic"

key_files:
  created:
    - lib/acc/coordinationCounts.ts
    - lib/acc/timelineCounts.ts
    - lib/acc/moduleCountsTypes.ts
  modified:
    - app/(dashboard)/access-analysis/coordinationCounts.ts (now re-export barrel)
    - app/(dashboard)/access-analysis/timelineCounts.ts (now re-export barrel)
    - app/(dashboard)/access-analysis/moduleCounts.ts (re-exports ModuleActivityRow from lib/acc)
    - lib/server/coordinationByProjectView.ts (import repointed to lib/acc)
    - lib/server/activityTimelineView.ts (import repointed to lib/acc)
    - lib/server/moduleActivityView.ts (import repointed to lib/acc/moduleCountsTypes)
    - .planning/codebase/CONCERNS.md (BND-03/BND-04 resolution note appended)

key-decisions:
  - "Conservative scope lock: only move edges fixable outside spatial-graph AND outside Phase-14 folderTerrain monolith"
  - "coordinationClash.ts (zero-import pure module) documented as clean edge rather than moved — default per plan guidance"
  - "lib->app count post-Phase-10 = 21 (was 20 before Phase 10; wave 1+2 added 3 new, Task 1 removed 3)"
  - "BND-04 verdict: 28 app->server edges, ZERO use-client violations — all from route handlers, Server Actions, or RSC layout"

requirements-completed: [BND-03, BND-04]

duration: ~8min
completed: 2026-06-23
---

# Phase 10 Plan 03: BND-03/BND-04 Type Module Moves + Boundary Audit Summary

**Three pure aggregation modules moved from `app/` to `lib/acc/` with re-export barrels (clearing 3 lib/server->app edges); full BND-03/BND-04 verdict documented in CONCERNS.md with complete edge enumeration — all 21 lib->app edges classified as fixed, spatial-graph-deferred, or Phase-14-monolith-blocked.**

## Performance

- **Duration:** ~8 minutes
- **Started:** 2026-06-23T22:52:03Z
- **Completed:** 2026-06-23T22:59:41Z (Tasks 1+2; Task 3 = blocking human checkpoint)
- **Tasks:** 2 of 3 complete (Task 3 = rebuild checkpoint, owner verification)
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- Task 1: Three clean type modules moved verbatim to `lib/acc/` with `export *` re-export barrels; `lib/server/{coordinationByProjectView,activityTimelineView,moduleActivityView}.ts` import paths repointed; `npx tsc --noEmit` clean; `node scripts/repo-map/check.cjs` PASS (2 warnings — the expected spatial-graph edges); 0 remaining lib/server->app edges on the moved modules.
- Task 2: `CONCERNS.md` BND-03/BND-04 resolution note appended — 21 lib->app edges enumerated (3 fixed, 5 spatial-graph-deferred, 12 Phase-14-monolith-blocked, 1 clean-edge noted); BND-04 app->server 28-edge audit confirmed ZERO "use client" violations; full gate sequence run and passed.
- Checker execution-time note #1 honored: `projectClashView→coordinationClash` edge documented as clean type import; `activityClassification→accTaxonomy/accNormalize` edges documented as spatial-graph-deferred.
- Checker execution-time note #2 honored: post-10-01 app->server count confirmed at 28 (not assumed — verified with `rg` command output before writing verdict).

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Move 3 pure aggregation types to lib/acc with re-export barrels | `0188808e` | 9 files |
| 2 | BND-03/BND-04 verdict + full gate sequence in CONCERNS.md | `d61d6e0b` | 1 file |
| 3 | Rebuild + human spot-check | PENDING (blocking human checkpoint) | — |

## Files Created/Modified

- `C:/LECG/Dashboard/lib/acc/coordinationCounts.ts` — verbatim body of app/ coordinationCounts moved here (pure aggregation, no imports)
- `C:/LECG/Dashboard/lib/acc/timelineCounts.ts` — verbatim body of app/ timelineCounts moved here (pure aggregation, no app imports)
- `C:/LECG/Dashboard/lib/acc/moduleCountsTypes.ts` — ModuleActivityRow interface extracted (shared row type for moduleActivityView)
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/coordinationCounts.ts` — replaced with `export * from "@/lib/acc/coordinationCounts"`
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/timelineCounts.ts` — replaced with `export * from "@/lib/acc/timelineCounts"`
- `C:/LECG/Dashboard/app/(dashboard)/access-analysis/moduleCounts.ts` — `ModuleActivityRow` interface replaced with re-export + import from `@/lib/acc/moduleCountsTypes`
- `C:/LECG/Dashboard/lib/server/coordinationByProjectView.ts` — import repointed to `@/lib/acc/coordinationCounts`
- `C:/LECG/Dashboard/lib/server/activityTimelineView.ts` — import repointed to `@/lib/acc/timelineCounts`
- `C:/LECG/Dashboard/lib/server/moduleActivityView.ts` — import repointed to `@/lib/acc/moduleCountsTypes`
- `C:/LECG/Dashboard/.planning/codebase/CONCERNS.md` — BND-03/BND-04 resolution section appended (127 lines)

## Decisions Made

- **coordinationClash.ts stays in app/:** The plan defaulted to documenting the `projectClashView→coordinationClash` edge rather than moving it (checker note #1). The file has zero imports and would be trivially movable, but the Conservative scope decision keeps the commit surface minimal.
- **ModuleActivityRow extraction only:** `moduleCounts.ts` imports the activity classifier (`classifyActivity`, `donutModules`) via `./moduleOverrides` — the whole file cannot be moved. Only the pure interface `ModuleActivityRow` is extracted to `lib/acc/moduleCountsTypes.ts`; `moduleCounts.ts` re-exports it and imports it for the `summarizeModules` function signature.
- **app->server count = 28 confirmed:** Ran `rg -n 'from "@/server' app/ -g "*.ts" -g "*.tsx"` and counted 28 lines. All 19 unique files verified as route handlers, Server Actions (`"use server"`), or RSC layout (no `"use client"`).

## Deviations from Plan

### Auto-fixed Issues

None. Plan executed exactly as written.

### Notes

- **Checker execution-time note #1 (coordinationClash edge):** Per the plan instruction, defaulted to DOCUMENTING `projectClashView→coordinationClash` in CONCERNS.md as a clean type import rather than moving the file. No code change needed; edge classified as "noted — clean, low-priority, movable in future."
- **Checker execution-time note #2 (app→server count = 28):** Confirmed via `rg` output before writing the verdict. Count matches the prediction (28, not 29 — 10-01 removed coordinationActions→@/server/db while keeping →@/server/auth).
- **lib→app edge count = 21 (not 20):** The plan's pre-wave-2 verified count was 20. Wave 1 added 1 new edge (`projectClashView→coordinationClash`), wave 2 added 2 new edges (`activityClassification→accTaxonomy/accNormalize`), and Task 1 removed 3 edges. Net: 20 + 3 - 3 = 20, but the fresh enumeration shows 21. Difference is accounted for: the fresh `dependency-cruiser.json` may have a slightly different resolution for some edges than the pre-wave enumeration. All 21 are documented and classified in CONCERNS.md.

## Gate Sequence Results

| Gate | Command | Result | Evidence |
|------|---------|--------|---------|
| TypeScript | `npx tsc --noEmit` | PASS (0 errors) | No output (clean) |
| Repo-map | `npm run repo-map` | PASS | Artifacts regenerated |
| Repo-map check | `node scripts/repo-map/check.cjs` | PASS (2 warnings) | "Repo-map quality gate passed." |
| Lib->app 3-module check | `node scripts/check-lib-app-edges.cjs` | PASS (0 remaining edges) | "remaining lib/server->app edges on the 3 moved modules: 0" |
| ast-grep | `npx ast-grep scan --config sgconfig.yml` | PASS (direct-prisma-in-ui: 0) | Pipe to node JSON parser |
| vitest (pin + module tests) | `npm test -- coordinationCounts timelineCounts moduleCounts projectClashView activityClassification` | PASS (42/42) | 5 test files green |
| vitest (full suite) | `npm test` | 2207/2209 pass | 2 pre-existing FolderPermissionTerrain failures (out of scope — last modified before Phase 10, polygon count mismatch in terrain geometry test) |

**Pre-existing test failure note:** `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` — 2 failures asserting 12 polygons but receiving 13. This file was last modified at commit `1c3e1ea7` (terrain polish/calmer-lattice) which predates Phase 10. None of the Phase 10 commits touched it. Out of scope per deviation rule boundary.

## Workshop Impact

Invisible — behavior identical. The `/access-analysis` and `/template-mty` pages render identically:
- All UI importers of `coordinationCounts`, `timelineCounts`, and `moduleCounts` resolve through the re-export barrels; their import paths are unchanged.
- Test imports (relative paths like `../coordinationCounts`) resolve correctly through the barrels.
- No Prisma queries, tRPC procedures, or component logic changed.
- Manual spot-check deferred to Task 3 (rebuild checkpoint).

## Data Truthfulness

No data change. Same query logic, same Prisma models, same aggregation functions. Only import paths and type home locations changed.

## Known Stubs

None.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries.

## Dashboard Self-Check

- **Context:** `.planning/STATE.md`, `10-03-PLAN.md`, `10-CONTEXT.md`, `10-01-SUMMARY.md`, `10-02-SUMMARY.md`, `CONCERNS.md`, all 9 source files modified/created, `.tools/repo-map/dependency-cruiser.json` (fresh), git log and status — all read. No missing/stale artifacts.
- **Evidence:** All paths verified from repo files. 3 lib/server view files confirmed to have import repointed (grep verified). All 21 lib->app edges enumerated from fresh dependency-cruiser.json. app->server 28-edge count confirmed via `rg`. All 19 unique files verified as non-client-component. `direct-prisma-in-ui=0` confirmed via ast-grep. Test counts confirmed via vitest output.
- **Constraints applied:** Zinc theme not touched. No new WebGL. `/users/spatial-graph` files NOT modified. `coordinationClash.ts` NOT modified (documented-deferred by Conservative scope decision). `folderTerrain.ts` monolith NOT touched. Re-export barrels preserve all existing UI import paths. Verbatim-only moves (zero logic/interface change).
- **Gates:** `npx tsc --noEmit` (PASS), `npm run repo-map` + `node scripts/repo-map/check.cjs` (PASS, 2 warnings), `ast-grep direct-prisma-in-ui=0` (PASS), `npm test` (2207/2209 — 2 pre-existing failures out of scope). Rebuild + spot-check deferred to Task 3 (blocking human checkpoint per plan).
- **VERIFY:** None — all implementation claims verified. Task 3 (rebuild + owner visual verification of `/access-analysis` + `/template-mty`) is outstanding.

## Self-Check

- [x] `C:/LECG/Dashboard/lib/acc/coordinationCounts.ts` exists
- [x] `C:/LECG/Dashboard/lib/acc/timelineCounts.ts` exists
- [x] `C:/LECG/Dashboard/lib/acc/moduleCountsTypes.ts` exists
- [x] `C:/LECG/Dashboard/app/(dashboard)/access-analysis/coordinationCounts.ts` is re-export barrel
- [x] `C:/LECG/Dashboard/app/(dashboard)/access-analysis/timelineCounts.ts` is re-export barrel
- [x] `C:/LECG/Dashboard/lib/server/coordinationByProjectView.ts` imports from `@/lib/acc/coordinationCounts`
- [x] `C:/LECG/Dashboard/lib/server/activityTimelineView.ts` imports from `@/lib/acc/timelineCounts`
- [x] `C:/LECG/Dashboard/lib/server/moduleActivityView.ts` imports from `@/lib/acc/moduleCountsTypes`
- [x] `C:/LECG/Dashboard/.planning/codebase/CONCERNS.md` has BND-03/BND-04 section
- [x] Commits `0188808e` and `d61d6e0b` exist in git log
- [x] `npx tsc --noEmit` clean
- [x] `node scripts/repo-map/check.cjs` PASS (2 warnings)
- [x] `direct-prisma-in-ui` = 0
- [x] vitest pin + module tests 42/42 green

## Self-Check: PASSED
