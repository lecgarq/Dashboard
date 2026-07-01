---
phase: 15
plan: "01"
subsystem: server/folderPermQuery
tags: [refactor, query-extraction, server, terraform, behavior-preserving]
dependency_graph:
  requires: [Phase 14 characterization tests (TEST-02/TEST-03)]
  provides: [lib/server/folderPermQuery.ts shared join owner]
  affects: [lib/server/templateFolderTerrain.ts, lib/server/folderPermissionTerrainView.ts]
tech_stack:
  added: []
  patterns: [plain tagged-template db.$queryRaw, Promise.all position-stable extraction]
key_files:
  created:
    - lib/server/folderPermQuery.ts
  modified:
    - lib/server/templateFolderTerrain.ts
    - lib/server/folderPermissionTerrainView.ts
decisions:
  - QUERY-01 extraction uses plain tagged-template db.$queryRaw (not Prisma.sql) to keep TEST-03 byte-identical
  - l2Only opts object selects a static SQL branch; only projectId is ever interpolated
  - Both callers retain same Promise.all element positions so TEST-02 5-call chain is undisturbed
metrics:
  duration: continuation finalization
  completed: "2026-07-01"
status: complete
requirements: [QUERY-01]
---

# Phase 15 Plan 01: Shared Query Extraction (QUERY-01/REF-02) Summary

**One-liner:** Extracted the duplicated 5-column `AccFolderPermission` base join into `lib/server/folderPermQuery.ts` via two plain tagged-template `db.$queryRaw` branches; both terrain loaders rewired; TEST-02+TEST-03 pass byte-identical, tsc 0 errors, owner-approved visual parity on `/template-mty` + `/access-analysis`.

## What Was Built

### New file: `lib/server/folderPermQuery.ts`

Single shared module owning the base `AccFolderPermission` join (QUERY-01 / REF-02).

**Exported function signature:**
```ts
export async function loadFolderPermRows(
  projectId: string,
  opts?: { l2Only?: boolean }
): Promise<FolderPermRow[]>
```

**Return type (`FolderPermRow`):**
```ts
interface FolderPermRow {
  folder_id: string
  role_id: string
  role_name: string
  perm_type: string
  n_actions: number
}
```

**Two branches (both plain tagged-template `db.$queryRaw`):**
- Default (`l2Only` falsy): all-folders scope — copies the 5-alias SELECT/FROM/JOIN/WHERE from `templateFolderTerrain.ts` verbatim; interpolates only `${projectId}`.
- `l2Only: true`: same 5-alias select plus `JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'` — copies from `folderPermissionTerrainView.ts` verbatim; interpolates only `${projectId}`.

Imports: `import "server-only"` + `import { db } from "@/server/db"`. No `Prisma.sql`/`Prisma.raw`/`Prisma.join`.

### Modified: `lib/server/templateFolderTerrain.ts`

- Added `import { loadFolderPermRows } from "@/lib/server/folderPermQuery"`.
- Replaced the inline base-join `$queryRaw` block (previously lines 179–186) with `loadFolderPermRows(TEMPLATE_MTY_ID)` at the **same third position** in the `Promise.all`, keeping the `perms` destructuring and downstream `.map()` to camelCase unchanged.
- Updated `// SPLIT-PENDING: REF-02` header to state "extraction complete — shared join now in lib/server/folderPermQuery.ts".

### Modified: `lib/server/folderPermissionTerrainView.ts`

- Added `import { loadFolderPermRows } from "@/lib/server/folderPermQuery"`.
- Replaced the inline L2-only `$queryRaw` block (previously lines 96–107) with `loadFolderPermRows(projectId, { l2Only: true })` at the **same array position (index 2)** in the `Promise.all`, keeping all downstream `perms` snake_case usage untouched (`p.folder_id`, `p.role_id`, `p.role_name`, etc.).
- `import { Prisma }` retained — still used by the untouched `loadFolderPermissionOverview` CTE / `Prisma.join`.
- Updated `// SPLIT-PENDING: REF-02` header to state "extraction complete — shared join now in lib/server/folderPermQuery.ts".

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `lib/server/folderPermQuery.ts` | Created (new) | +63 |
| `lib/server/templateFolderTerrain.ts` | Rewired base join call | −17 / +10 |
| `lib/server/folderPermissionTerrainView.ts` | Rewired l2Only join call | −12 / +8 |

**Total:** 3 files changed, 76 insertions(+), 29 deletions(−). No test files touched.

## Verification Gates

### 1. `npx tsc --noEmit`
**Result: 0 errors.** The new module type-checks standalone; both callers type-check against the `FolderPermRow[]` return type.

### 2. Vitest TEST-02 + TEST-03
```
npx vitest run lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts
                lib/server/__tests__/folderPermissionTerrainView.test.ts
```
**Result: 9 passed / 2 files.** TEST-03 assertion #4 (called exactly once + `mock.calls[0]` contains `TEMPLATE_MTY_ID`) passes because `loadFolderPermRows` emits a synchronous plain tagged-template call — not a composed `Sql` object. TEST-02 5-call ordered chain passes because the Promise.all element position is unchanged.

### 3. Test files byte-identical
```
git diff --name-only -- lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts
                         lib/server/__tests__/folderPermissionTerrainView.test.ts
```
**Result: EMPTY.** Neither test file was modified.

### 4. Residual base-join grep
```
grep -Fn 'r.name AS role_name, fp."permType" AS perm_type' \
  lib/server/templateFolderTerrain.ts lib/server/folderPermissionTerrainView.ts
```
**Result: 0 matches.** The discriminating base-join select line is absent from both callers.

Positive check:
```
grep -Fn loadFolderPermRows \
  lib/server/folderPermQuery.ts lib/server/templateFolderTerrain.ts lib/server/folderPermissionTerrainView.ts
```
**Result: matches in all 3 files** — definition in `folderPermQuery.ts`, call in each caller.

### 5. Pre-existing WIP failures (FolderPermissionTerrain.test.tsx)
**Result: 2 failures unchanged.** Confirmed not newly broken; deferred to Phase 16 (out of scope for this phase).

### 6. Owner visual parity
`/template-mty` and `/access-analysis` confirmed rendering identically to pre-phase — same folders, tiers/colors, bar heights, and role breakdown. **Owner approved.**

### 7. Explicit-path staging proof
```
git diff --cached --name-only  (before commit)
```
**Result:**
```
lib/server/folderPermQuery.ts
lib/server/folderPermissionTerrainView.ts
lib/server/templateFolderTerrain.ts
```
Exactly 3 source files — no unrelated WIP, no `.planning/` migration deletions, no `/users/spatial-graph` files. Committed via `git commit` with the index already precisely staged (not `git add -A` / `git add .`).

## Commit

| Hash | Message |
|------|---------|
| `a4d923ca` | `refactor(15): extract shared folderPermQuery base join (QUERY-01/REF-02)` |

## Data Truthfulness

This is a pure server-side query relocation. Zero change to what the workshop pages display:
- The 5-column output (`folder_id`, `role_id`, `role_name`, `perm_type`, `n_actions`) is returned verbatim from the same SQL branches that previously existed inline.
- No new analytics, no inferred or fabricated metrics. No data source changed.
- The all-folders scope (for `/template-mty`) and the L2-only "Project Files" scope (for `/access-analysis`) are preserved with the same WHERE clauses.

## Workshop Impact

No visible change to `/template-mty` or `/access-analysis`. This plan is the foundation for:
- **Phase 16** (folderTerrain + FolderPermissionTerrain monolith splits) — both callers now import the shared join, so the splits can proceed without re-duplicating SQL.
- **Phase 18** (AccFolderPermissionSummary projection) — the shared query owner is the injection point for switching to the materialized summary.

## Deviations from Plan

None — plan executed exactly as written. Tasks 1 and 2 completed with all automated gates passing. Checkpoint Task 3 (owner visual parity) received owner approval.

## Known Stubs

None. All data is live from the PostgreSQL DB; no hardcoded, placeholder, or fixture values were introduced.

## Threat Flags

None. The only interpolated value in both SQL branches is `projectId` (a bound parameter in the plain tagged-template call). `l2Only` selects a static SQL branch at JS runtime — it never contributes SQL text. No new network endpoints, auth paths, file access patterns, or schema changes.

## Dashboard Self-Check

- **Context:** Loaded 15-01-PLAN.md (plan frontmatter + tasks + output spec + threat model), STATE.md, ROADMAP.md, SKILL.md. Source files `lib/server/folderPermQuery.ts`, `lib/server/templateFolderTerrain.ts`, `lib/server/folderPermissionTerrainView.ts` verified via git commit output. Test files confirmed byte-identical by git diff.
- **Evidence:** Commit `a4d923ca` — 3 files changed, 76 insertions, 29 deletions. Staging list verified before commit contained exactly the 3 source files. Gates run: tsc 0 errors, Vitest 9/9 passed (2 files), git-diff empty on test files, residual-SQL grep 0 matches, owner visual parity approved.
- **Constraints applied:** Zinc theme untouched (server-only change). No new WebGL. `/users/spatial-graph` not touched. `Prisma.sql`/`raw`/`join` avoided (plain tagged-template only). Explicit-path commit only (no `-A`/`.`). Pre-existing 2 WIP failures not touched (deferred to Phase 16). Base-join scope only — `parentPerms`, `loadTerrainProjects`, `loadFolderPermissionOverview` not touched.
- **Gates:** `npx tsc --noEmit` (0 errors), `npx vitest run TEST-02 TEST-03` (9/9 passed), git-diff byte-identical proof (empty), residual-SQL grep (0 matches), owner visual parity (approved), explicit-path staging proof (3 files exact).
- **VERIFY:** none — all paths, assertions, commands, and results are grounded in files read and commands run this session.

## Self-Check: PASSED

- `lib/server/folderPermQuery.ts` — committed in `a4d923ca`
- `lib/server/templateFolderTerrain.ts` — committed in `a4d923ca`
- `lib/server/folderPermissionTerrainView.ts` — committed in `a4d923ca`
- Commit `a4d923ca` exists in git log
- All 5 success criteria from 15-01-PLAN.md met
