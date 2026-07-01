---
phase: 16-folderterrain-monolith-split
plan: "01"
subsystem: access-analysis/folderTerrain
tags: [refactor, split, geometry, pure-module, SPLIT-01]
status: complete

dependency_graph:
  requires: [15-01]
  provides: [folderTerrainModel, folderTerrainLayout, folderTerrainScene, folderTerrainCamera]
  affects: [/access-analysis, /template-mty, lib/server/folderPermissionTerrainView.ts]

tech_stack:
  added: []
  patterns:
    - barrel re-export (export * from sub-modules)
    - co-located pure geometry sub-modules
    - verbatim code relocation (zero logic change)

key_files:
  created:
    - app/(dashboard)/access-analysis/folderTerrainModel.ts
    - app/(dashboard)/access-analysis/folderTerrainLayout.ts
    - app/(dashboard)/access-analysis/folderTerrainScene.ts
    - app/(dashboard)/access-analysis/folderTerrainCamera.ts
  modified:
    - app/(dashboard)/access-analysis/folderTerrain.ts

decisions:
  - TERRAIN const promoted to export (was private) so Layout/Scene/Camera sub-modules can import it
  - Pt interface relocated from Layout section to Model — shared by all four sub-modules
  - scene primitives (CELL_CORNERS, SIDE_NORMAL, SHADOW_CORNERS, signedArea, ptsStr, tint, sideBrightness, SceneBar) promoted to export (were private) — Camera sub-module imports them from Scene; non-breaking superset
  - repo-map check skipped — co-located split, no new lib/app/server boundary edges created

metrics:
  duration: "~13 minutes (2026-07-01T21:55Z → 2026-07-01T22:08Z)"
  completed_date: "2026-07-01"
  tasks_completed: 2
  tasks_blocked_at_checkpoint: 1
  files_created: 4
  files_modified: 1
---

# Phase 16 Plan 01: folderTerrain Monolith Split (SPLIT-01) Summary

**One-liner:** Split the 1,096-line pure geometry `folderTerrain.ts` into four cohesive sub-modules (Model/Layout/Scene/Camera, each ≤400 lines) + thin `export *` barrel, keeping all 68 pinning tests byte-identical and green.

## What Was Built

Behavior-preserving structural split of `app/(dashboard)/access-analysis/folderTerrain.ts`:

| File | Lines | Content |
|------|-------|---------|
| `folderTerrainModel.ts` | 270 | Data contract types + tier/rank/colour system + ordering helpers + iso-geometry primitives + Pt + TERRAIN |
| `folderTerrainLayout.ts` | 279 | Fixed iso layout (buildTerrainLayout) + compare mode (buildSharedAxes/projectOntoAxes/buildStackedTerrain) |
| `folderTerrainScene.ts` | 260 | Rotatable axonometric scene (buildScene) + shared scene primitives (SceneFace/SceneBar/TerrainScene/culling/lighting) |
| `folderTerrainCamera.ts` | 363 | Orthographic camera (buildCameraScene) + floating-plane compare (buildStackedScenes) |
| `folderTerrain.ts` (barrel) | 23 | `export * from` all four sub-modules — preserves every existing import path |

All callers (`folderPermissionTerrainView.ts`, `FolderPermissionTerrain.tsx`, `folderInheritance.ts`, `templateFolderTerrain.ts`, `templateView.ts`, `templateRoleTree.ts`, `permissionAccess.ts`) continue to import from `../folderTerrain` unchanged.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extract folderTerrainModel.ts + folderTerrainLayout.ts | `3cfd3734` | folderTerrainModel.ts (new), folderTerrainLayout.ts (new), folderTerrain.ts (intermediate barrel) |
| 2 | Extract folderTerrainScene.ts + folderTerrainCamera.ts, finalize barrel | `71df53db` | folderTerrainScene.ts (new), folderTerrainCamera.ts (new), folderTerrain.ts (thin barrel) |
| 3 | Owner visual parity on /access-analysis + /template-mty | PENDING checkpoint | — |

## Automated Gate Results

All automated gates passed before requesting owner verification:

1. **npx tsc --noEmit** — exits 0 (no TypeScript errors)
2. **folderTerrain.test.ts** — 40+ pure-geometry golden masters: all pass (68 total across both suites)
3. **folderPermissionTerrainView.test.ts (TEST-02)** — transitive golden masters: all pass (68 total)
4. **Byte-identical gate** — `git diff --name-only -- "app/(dashboard)/access-analysis/__tests__/folderTerrain.test.ts" "lib/server/__tests__/folderPermissionTerrainView.test.ts"` → no output (zero test file changes)
5. **FolderPermissionTerrain.test.tsx** — 2 failures, 11 pass — matches the 2 known pre-existing WIP failures (fixed in 16-02); no new failures introduced
6. **Line count** — Model: 270 / Layout: 279 / Scene: 260 / Camera: 363 / Barrel: 23 — all within ≤400 limit
7. **Explicit-path staging proof** — `git diff --cached --name-only` confirmed only the correct files staged per task (Tasks 1 and 2 each committed)

## Pending: Task 3 Owner Checkpoint

**Awaiting owner visual parity** on:
- http://localhost:3000/access-analysis — Folder Permission Terrain panel: Single / Compare / Overview modes; orbit, pan, zoom; click a cell; hover; tier colours, folder/role labels, inherited-bar dimming, compass
- http://localhost:3000/template-mty — single-project terrain: folders, tiers/colours, bar heights, role breakdown

**Resume signal:** Owner types "approved" if identical, or describes any visual difference.

## Deviations from Plan

**1. [Rule 2 — Superset export] Promoted private symbols to exports in folderTerrainScene.ts**
- **Found during:** Task 2
- **Issue:** `CELL_CORNERS`, `SIDE_NORMAL`, `SHADOW_CORNERS`, `signedArea`, `ptsStr`, `tint`, `sideBrightness`, `SceneBar` were module-private in the original file. Since they are now in folderTerrainScene.ts and folderTerrainCamera.ts imports them, they must be exported.
- **Fix:** Added `export` to those declarations. This is explicitly noted in the plan as "a non-breaking superset." No caller behavior changes.
- **Files modified:** `app/(dashboard)/access-analysis/folderTerrainScene.ts`
- **Commit:** `71df53db`

**2. [Rule 2 — Correctness requirement] Promoted TERRAIN to export in folderTerrainModel.ts**
- **Found during:** Task 1
- **Issue:** `TERRAIN` was `const TERRAIN` (private) but Layout, Scene, and Camera all need it for tileW/tileH/minBar/margin/gutter/topPad/maxRoleLabels/roleLabelRow constants.
- **Fix:** Changed to `export const TERRAIN`. Non-breaking superset — no external caller imports TERRAIN directly (they destructure via local scope through the barrel).
- **Files modified:** `app/(dashboard)/access-analysis/folderTerrainModel.ts`
- **Commit:** `3cfd3734`

## Known Stubs

None — this is a pure code relocation. No data or UI behavior changed.

## Threat Flags

None — pure code relocation, no new network endpoints, auth paths, file access, or schema changes.

## Data Truthfulness

No change. This plan touches only pure geometry (no I/O, no DB, no analytics). Workshop data accuracy is unchanged.

## Dashboard Constraints Applied

- Zinc theme: untouched (pure geometry module — no UI or CSS changes)
- ECharts: untouched
- No new WebGL: no new imports or dependencies added
- /users/spatial-graph: not touched
- Explicit-path commit hygiene: staged by exact path per task; `git diff --cached --name-only` confirmed
- npx tsc --noEmit: run before each commit (exits 0 both times)
- byte-identical test contract: honored — zero test file edits
- Repo-map check: skipped per plan (co-located split, no new boundary edges)

## Dashboard Self-Check

- **Context:** Loaded STATE.md (Phase 16 ready-to-execute), 16-01-PLAN.md (authoritative task list), folderTerrain.ts (all 1,096 lines), folderTerrain.test.ts (direct pinning net), folderPermissionTerrainView.test.ts (TEST-02), folderPermissionTerrainView.ts (server consumer). Config loaded (commit_docs: true, mode: yolo).
- **Evidence:** All 5 sub-module paths verified by direct Write/create. Line counts verified via wc -l. Commit hashes confirmed via git log. Test results confirmed via npx vitest run (68/68 pass). tsc exits 0. Byte-identical diff confirmed (no output).
- **Constraints applied:** behavior-preserving relocation; byte-identical tests honored; original filename kept as barrel; co-located (no lib/acc migration on critical path); no new WebGL; zinc theme untouched; /users/spatial-graph not touched; explicit-path commits with `git diff --cached --name-only` proof; tsc before any rebuild.
- **Gates:** tsc --noEmit ✓ (exits 0); vitest folderTerrain.test.ts + folderPermissionTerrainView.test.ts ✓ (68/68 pass); byte-identical `git diff --name-only` ✓ (no output); FolderPermissionTerrain.test.tsx ✓ (2 pre-existing WIP only); wc -l ✓ (all ≤400, barrel 23); explicit-path staging ✓ (confirmed per task); owner visual parity PENDING.
- **VERIFY:** Owner visual parity on /access-analysis + /template-mty pending human verification.

## Self-Check

- folderTerrainModel.ts: FOUND (270 lines)
- folderTerrainLayout.ts: FOUND (279 lines)
- folderTerrainScene.ts: FOUND (260 lines)
- folderTerrainCamera.ts: FOUND (363 lines)
- folderTerrain.ts barrel: FOUND (23 lines)
- Task 1 commit 3cfd3734: FOUND in git log
- Task 2 commit 71df53db: FOUND in git log

## Self-Check: PASSED
