---
phase: 04-folders-folder-role-permissions
plan: 05
subsystem: api
tags: [trpc, prisma, orphan-detection, acc-folders, pure-module, vitest]

requires:
  - phase: 04-folders-folder-role-permissions
    provides: "PermTier types + permission mapping (04-01); accFoldersRouter scaffold + folderCrawlStatus column (04-03)"
provides:
  - "Pure detectOrphans() module returning Map<`${folderId}::${roleId}`, OrphanReason[]> for all 4 orphan types"
  - "tRPC accFolders.getMatrix: flat folder × role × permission rows with project crawl status, role name, permType, actions, orphan reasons"
  - "tRPC accFolders.getOrphanRoles: orphan-only view (rows with ≥1 reason + folder-level orphans)"
  - "Exported FolderMatrixRow + FolderOnlyOrphan TypeScript types — direct binding surface for Plan 06 widget"
affects: [04-06, 04-07, 07-06]

tech-stack:
  added: []
  patterns:
    - "Pure detection module in lib/acc/* (no Prisma imports) consumed by tRPC procedure — keeps logic unit-testable"
    - "Map keyed by `${folderId}::${roleId}` with empty-roleId variant for folder-level orphans"
    - "6-query parallel Prisma load via Promise.all in tRPC procedure"

key-files:
  created:
    - "lib/acc/orphanDetection.ts (140 lines) - detectOrphans + OrphanReason union + OrphanInput interface"
    - "lib/acc/orphanDetection.test.ts (192 lines, 13 tests) - all 4 orphan codes + combined-reason coverage"
  modified:
    - "server/routers/acc-folders.ts (+228/-10) - getMatrix + getOrphanRoles procedures replacing the Plan 03 ping placeholder"

key-decisions:
  - "Pure module in lib/acc/* with zero Prisma/IO imports — caller (tRPC procedure) owns DB queries and shapes input arrays"
  - "Map key `${folderId}::${roleId}` for permission-level orphans; `${folderId}::` (empty roleId) for folder-level orphans — lets a single Map surface both granularities"
  - "isRootFolder() helper treats parentId===null OR fullPath with no inner '/' as root — defensive against APS pathing variance"
  - "tRPC procedure uses ctx.db (matches acc-activity.ts convention) — not ctx.prisma; both share underlying Prisma client"
  - "getOrphanRoles is a convenience view over the same query bundle as getMatrix — no second round-trip needed; widget gets two ergonomic procedures"

patterns-established:
  - "Pure pipeline module + thin tRPC wrapper: detection logic stays unit-testable; router only handles DB→input-shape transformation"
  - "Composite Map-key encoding (`a::b` with optional empty b) to express two granularities through one return type"

requirements-completed: [FLDR-05]

duration: ~6min
completed: 2026-05-12
---

# Phase 04 Plan 05: Folder-Role Matrix Backbone Summary

**Pure orphan-detection module (4 reason codes, 13 Vitest cases) + accFolders.getMatrix/getOrphanRoles tRPC procedures replacing the Plan 03 placeholder — Plan 06 widget can bind directly.**

## Performance

- **Duration:** ~6 min (administrative close completed 2026-05-12)
- **Completed:** 2026-05-12
- **Tasks:** 2
- **Files modified:** 3 (2 created + 1 expanded)

## Accomplishments

- Pure `detectOrphans()` module isolated in `lib/acc/orphanDetection.ts` — zero Prisma/IO deps, fully unit-testable
- All 4 orphan reasons covered: `role_zero_members`, `permission_missing_folder`, `root_only_zero_members`, `folder_no_permissions`
- 13/13 Vitest cases pass across 5 describe blocks (one per reason + combined-reason coverage)
- `accFolders.getMatrix` returns flat folder × role × permission rows enriched with project name, folderCrawlStatus, role name, permType, actions, and orphanReasons[]
- `accFolders.getOrphanRoles` filters to orphan-only rows + folder-level orphans (folders with zero permissions)
- TypeScript types `FolderMatrixRow` + `FolderOnlyOrphan` exported for direct Plan 06 widget binding
- `npx tsc --noEmit -p .` exits 0; placeholder `ping` removed from router

## Task Commits

1. **Task 1: Pure orphanDetection module + Vitest coverage** — `34c7072` (feat)
2. **Task 2: getMatrix + getOrphanRoles tRPC procedures** — `01519c7` (feat)

**Plan metadata:** Pending in this administrative-close commit (docs(04-05): complete folder-matrix backbone plan).

## Files Created/Modified

- `lib/acc/orphanDetection.ts` — Pure `detectOrphans(input)` returning `Map<string, OrphanReason[]>`. Exports `OrphanReason` union and `OrphanInput` interface.
- `lib/acc/orphanDetection.test.ts` — 13 Vitest cases: 1 describe per OrphanReason (4) + 1 combined-reason describe covering coexistence on the same key.
- `server/routers/acc-folders.ts` — Expanded the Plan 03 placeholder with `getMatrix` (6-query parallel Prisma load + detectOrphans call + row shaping) and `getOrphanRoles` (filtered view). Removed `ping`.

## Decisions Made

- **Pure module / thin wrapper split:** `detectOrphans` is a pure function over plain TS arrays — `lib/acc/orphanDetection.ts` deliberately avoids importing Prisma or `@/server`. tRPC procedure owns DB query → input-shape transformation.
- **Composite Map-key encoding:** `${folderId}::${roleId}` for permission-level orphans, `${folderId}::` for folder-level orphans. One return type covers both granularities; consumer disambiguates by checking `endsWith('::')`.
- **ctx.db convention:** Router uses `ctx.db` (matching `acc-activity.ts`) — not `ctx.prisma`. Same underlying client.
- **getOrphanRoles as a view, not a second query:** Plan called it a "convenience procedure"; implementation reuses the same parallel load to avoid duplicate round-trips.

## Deviations from Plan

None — plan executed exactly as written. Both task commits landed clean; automated checks (Vitest + tsc) green on first pass.

## Issues Encountered

None during execution. Administrative close lagged behind the code commits (Plan 06 in Phase 7 already binds the surface this plan shipped, confirming the contract works in practice).

## User Setup Required

None — no external service configuration. Procedures expose data already loaded by Phase 04 plans 01–04.

## Next Phase Readiness

- **FLDR-05 satisfied:** All 4 orphan types are detectable and exposed via tRPC.
- **Plan 06 unblocked:** Widget can call `trpc.accFolders.getMatrix.useQuery()` and `trpc.accFolders.getOrphanRoles.useQuery()` directly; `FolderMatrixRow` + `FolderOnlyOrphan` types ready for binding.
- **Plan 07-06 already consumed this:** Phase 7's 2D filter panel uses `accFolders.getMatrix` for transitive folder-access SimilarityInput — confirming the contract holds under real consumption.

## Self-Check

Verification run during administrative close 2026-05-12:
- FOUND: `lib/acc/orphanDetection.ts` (140 lines)
- FOUND: `lib/acc/orphanDetection.test.ts` (192 lines, 13 tests passing)
- FOUND: `server/routers/acc-folders.ts` with `getMatrix` (line 42) + `getOrphanRoles` (line 147)
- FOUND: commit `34c7072` (feat(04-05): add pure orphanDetection module + Vitest coverage)
- FOUND: commit `01519c7` (feat(04-05): implement getMatrix + getOrphanRoles in accFoldersRouter)
- PASS: `npx vitest run lib/acc/orphanDetection.test.ts` → 13/13 in 200ms
- PASS: `npx tsc --noEmit -p .` → exit 0

## Self-Check: PASSED

---
*Phase: 04-folders-folder-role-permissions*
*Completed: 2026-05-12*
