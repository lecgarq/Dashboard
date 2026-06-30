---
phase: 14-characterization-tests
plan: 01
subsystem: terrain-boundary-tests
status: complete
tags: [characterization-tests, golden-master, split-pending, terrain, TEST-02]
dependency_graph:
  requires: [Phase 10]
  provides: [TEST-02 boundary pins, REF-01 signposts, REF-02 signpost on folderPermissionTerrainView]
  affects: [/access-analysis terrain surface, /template-mty terrain surface]
tech_stack:
  added: []
  patterns: [vi.hoisted + vi.mock seam, golden-master .toEqual, chained mockResolvedValueOnce, force=true cache bypass]
key_files:
  created:
    - lib/server/__tests__/folderPermissionTerrainView.test.ts
  modified:
    - lib/server/folderPermissionTerrainView.ts
    - app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx
    - app/(dashboard)/access-analysis/folderTerrain.ts
    - app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx
decisions:
  - "Pinning strictness: HYBRID — golden-master .toEqual on assembled FolderTerrainData boundaries (loadFolderPermissionTerrain + loadFolderPermissionOverview); lighter key-invariant pin on loadTerrainProjects"
  - "HybridAnalyticsSurface.tsx: comment-only this phase; no new tests (client DuckDB/Mosaic, browser-only logic)"
  - "officeCodeFor runs for real in tests; synthetic id 'p1'/'Project One' resolves to 'OTHER' (no MTY/city token)"
  - "Inherited cell f2/r1 (n_actions:0) adopts parent Full Controller grant via resolveEffectiveTier; rank 6 pinned"
metrics:
  duration: "~15min"
  completed: "2026-06-30"
  tasks: 2
  files_changed: 5
---

# Phase 14 Plan 01: Terrain Characterization Tests (TEST-02) Summary

**One-liner:** Golden-master pins for the three `folderPermissionTerrainView.ts` loader boundaries + SPLIT-PENDING REF-01/REF-02 signposts on four terrain files.

## What Was Built

### Task 1 — SPLIT-PENDING signpost comments (commit `9a5173f0`)

Comment-only edits to four files. No behavior changed. `"use client"` preserved as first statement in both client files.

| File | Signpost |
|------|----------|
| `lib/server/folderPermissionTerrainView.ts` | REF-02 — shared AccFolderPermission join extraction into `folderPermQuery.ts`; pinned by TEST-02 + TEST-03 |
| `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` | REF-01 — terrain monolith slated to split into data-hook/transform/thin-view modules |
| `app/(dashboard)/access-analysis/folderTerrain.ts` | REF-01 — pure transform module to be extracted in the split |
| `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` | REF-01 — comment-only this phase (browser-only real logic) |

### Task 2 — Golden-master characterization test file (commit `69f2139a`)

New file: `lib/server/__tests__/folderPermissionTerrainView.test.ts` (238 lines, 4 tests).

Mock seam mirrors `coordinationByProjectView.test.ts`: `vi.hoisted()` + `vi.mock("@/server/db")` with `mocks.queryRaw` + `mocks.findUnique`. `force = true` bypasses module-level TTL cache in every test.

**Test 1 — `loadFolderPermissionTerrain` golden master (two-folder project):**
- 5 `$queryRaw` calls pinned via `toHaveBeenCalledTimes(5)`
- Inherited cell f2/r1 (`n_actions:0`) resolves to `tier: "Full Controller"` rank 6 via `resolveEffectiveTier` (parent grant wins over View Only floor)
- Explicit cell f1/r1 (`n_actions:7`): `tier: "Full Controller"`, rank 6
- `usersByRole.r1`: Ann's duplicate from liveRoleUsers collapsed by email key; Bob added; name-sorted → `[Ann, Bob]`
- Folder order: numbered-before-unnumbered (`compareFolderNames`) → `01_Client` before `Design Documents`
- `maxUserCount: 2`; `office: "OTHER"` (officeCodeFor runs for real; `"Project One"` has no MTY/city token)

**Test 2 — `loadFolderPermissionTerrain` null-path:** folders `$queryRaw` returns `[]` → loader returns `null`.

**Test 3 — `loadFolderPermissionOverview` golden master:**
- 3 `$queryRaw` calls pinned via `toHaveBeenCalledTimes(3)`
- Folders sorted numbered-first: `01_Client` before `Design Documents`
- Roles preserve `roleRank` input order: `Architect`, `Owner`
- DD/r1 modal tier: `Full Controller` (7 projects > 3 View Only); `tierBreakdown: { 6: 7, 1: 3 }`; `userCount: 10`
- 01_Client/r2: `View Only`; `tierBreakdown: { 1: 5 }`; `userCount: 5`
- `maxUserCount: 10`; `heightMetric: "projects"`

**Test 4 — `loadTerrainProjects` key-invariant:** `userRoleCount === 7` (max of DC=3 vs live=7 proves the `Math.max` staffing signal).

## Commands Run and Evidence

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` (after Task 1 comment-only edits) | Clean (no output) |
| `npx vitest run lib/server/__tests__/folderPermissionTerrainView.test.ts` | 4/4 tests passed |
| `npx tsc --noEmit` (after Task 2 test file) | Clean (no output) |
| `npm test` (full suite) | 2249 passed / 2 pre-existing failures (unrelated to this plan) |

**Pre-existing failures (not caused by this plan):**
The 2 failures in `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` are pre-existing WIP in the working tree (file was `M` before any 14-01 work; the diff predates the first 14-01 commit). They are out of scope per the scope boundary rule.

## Deviations from Plan

None — plan executed exactly as written. The CAPTURE-AND-VERIFY step confirmed all hand-traced invariants matched the actual test output before pinning.

## Workshop Impact

No user-visible change. This is a safety-net phase:
- `/access-analysis` terrain surface: `loadFolderPermissionTerrain` + `loadFolderPermissionOverview` boundaries are now pinned — the deferred REF-01 split of `FolderPermissionTerrain.tsx` (1,041 lines) is safe to perform.
- `/template-mty` terrain surface: unchanged by this plan (TEST-03 covers it in plan 14-02).
- `/users/access-analysis` (`HybridAnalyticsSurface.tsx`): comment-only; no new tests (browser-only logic).

## Data Truthfulness

Tests use synthetic in-memory fixtures via a fake `db`. No real PostgreSQL connection. No live-data claim is made. `officeCodeFor` runs for real but on a synthetic project id/name that produces a deterministic `"OTHER"` result.

## Known Stubs

None. The test file is purely behavioral characterization; no UI stubs or placeholder data.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes. Comment-only source edits + new test file in a node unit environment (T-14-02: mitigated — no behavior changed; T-14-SC: accepted — zero new packages).

---

## Dashboard Self-Check

- **Context:** `.planning/STATE.md` (Phase 14 executing), `14-CONTEXT.md` (HYBRID pinning decision), `TESTING.md` (vi.hoisted + vi.mock seam, no jest-dom, no real DB), `coordinationByProjectView.test.ts` (mock pattern), `folderPermissionTerrainView.ts` (full read, call order verified), `folderTerrain.ts` (rankForTier, compareFolderNames), `folderInheritance.ts` (resolveEffectiveTier), `projectGroups.ts` (officeCodeFor logic traced).
- **Evidence:** All file paths verified via Read/Grep from repo. Commit hashes from `git rev-parse`. Test output verified by running `npx vitest run`. tsc output verified clean.
- **Constraints:** No new WebGL on data surfaces (not applicable — test-only phase). Zinc theme preserved (not applicable). `/users/spatial-graph` untouched (confirmed: 0 spatial-graph files in diff). Comment-only edits to source files — no behavior change. Diff is test-file + comment-only only.
- **Gates:** `npx tsc --noEmit` run after Task 1 (clean) and after Task 2 (clean). `npx vitest run` for new file (4/4 passed). Full `npm test` run (2249/2251 pass; 2 pre-existing failures pre-date this plan).
- **VERIFY:** none.

## Self-Check: PASSED

Files exist:
- `lib/server/__tests__/folderPermissionTerrainView.test.ts` — FOUND (created, 238 lines)
- `lib/server/folderPermissionTerrainView.ts` contains SPLIT-PENDING — FOUND
- `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` contains SPLIT-PENDING — FOUND
- `app/(dashboard)/access-analysis/folderTerrain.ts` contains SPLIT-PENDING — FOUND
- `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` contains SPLIT-PENDING — FOUND

Commits exist:
- `9a5173f0` (Task 1: SPLIT-PENDING signposts) — FOUND
- `69f2139a` (Task 2: golden-master test file) — FOUND
