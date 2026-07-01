---
phase: 15-shared-query-extraction
verified: 2026-07-01T18:40:00Z
status: passed
score: 7/7 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: null
gaps: []
deferred: []
behavior_unverified_items: []
human_verification: []
---

# Phase 15: Shared Query Extraction — Verification Report

**Phase Goal:** QUERY-01 / REF-02 — extract the duplicated base per-project `AccFolderPermission` join (5 columns: `folder_id | role_id | role_name | perm_type | n_actions`) into one owned module `lib/server/folderPermQuery.ts`, with both terrain loaders importing and calling it instead of inlining the SQL. Behavior-preserving, byte-identical golden-master tests, zero workshop-visible change.
**Verified:** 2026-07-01T18:40:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `lib/server/folderPermQuery.ts` exists and exports `loadFolderPermRows(projectId, { l2Only? })` | VERIFIED | File exists at 63 lines. Function signature at line 39: `export async function loadFolderPermRows(projectId: string, opts?: { l2Only?: boolean }): Promise<FolderPermRow[]>`. Interface `FolderPermRow` exports all 5 columns. |
| 2 | `templateFolderTerrain.ts` obtains permission rows via `loadFolderPermRows(TEMPLATE_MTY_ID)`, not an inline base-join `$queryRaw` | VERIFIED | Import at line 8; call `loadFolderPermRows(TEMPLATE_MTY_ID)` at line 179 in `Promise.all`. `grep -Fn 'r.name AS role_name, fp."permType" AS perm_type' lib/server/templateFolderTerrain.ts` → EXIT:1 (no matches). |
| 3 | `folderPermissionTerrainView.ts` obtains L2 rows via `loadFolderPermRows(projectId, { l2Only: true })` | VERIFIED | Import at line 8; call `loadFolderPermRows(projectId, { l2Only: true })` at line 98 in `Promise.all`. Confirmed same array index position (element 2), preserving the 5-call `mockResolvedValueOnce` chain for TEST-02. |
| 4 | No duplicated base-join SQL remains in either caller | VERIFIED | `grep -Fn 'r.name AS role_name, fp."permType" AS perm_type' lib/server/templateFolderTerrain.ts lib/server/folderPermissionTerrainView.ts` → EXIT:1, zero matches. The discriminating join-select line is absent from both callers. |
| 5 | TEST-02 and TEST-03 pass byte-identical (test files unchanged); Vitest suites are green | VERIFIED | `npx vitest run lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts lib/server/__tests__/folderPermissionTerrainView.test.ts` → **9 passed / 2 files** (VITEST_EXIT:0). `git diff --name-only HEAD -- lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts lib/server/__tests__/folderPermissionTerrainView.test.ts` → EMPTY (neither test file modified). |
| 6 | `npx tsc --noEmit` exits with 0 errors | VERIFIED | TSC_EXIT:0. No type errors across the new module or rewired callers. |
| 7 | `/template-mty` and `/access-analysis` render identically to pre-phase (owner visual check) | VERIFIED | Owner visual check completed and approved prior to commit `a4d923ca`, recorded in 15-01-SUMMARY.md. Both pages confirmed: same folders, tiers/colors, bar heights, and role breakdowns. Accepted per task instructions (owner approval already performed). |

**Score:** 7/7 truths verified (0 present-but-behavior-unverified)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/server/folderPermQuery.ts` | Shared base AccFolderPermission join loader; `loadFolderPermRows`; plain tagged-template; two scope branches; ≥25 lines | VERIFIED | 63 lines. Exports `loadFolderPermRows` + `FolderPermRow` interface. Two plain `db.$queryRaw` branches (default: all-folders; l2Only: Project Files parent join). Imports `"server-only"` + `{ db } from "@/server/db"`. |
| `lib/server/templateFolderTerrain.ts` | Contains `loadFolderPermRows` import and call replacing inline base join | VERIFIED | Import at line 8; call at line 179. Inline base-join `$queryRaw` block removed. Downstream `.map()` to camelCase and `Promise.all` position unchanged. |
| `lib/server/folderPermissionTerrainView.ts` | Contains `loadFolderPermRows` import + `l2Only` call; `import { Prisma }` retained | VERIFIED | Import at line 8; call at line 98 with `{ l2Only: true }`. `import { Prisma }` retained at line 6 (still used by `loadFolderPermissionOverview` CTE). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/server/templateFolderTerrain.ts` | `lib/server/folderPermQuery.ts` | `loadFolderPermRows(TEMPLATE_MTY_ID)` inside `Promise.all` | WIRED | `grep -Fn loadFolderPermRows lib/server/templateFolderTerrain.ts` → matches at lines 4 (comment), 8 (import), 179 (call). Pattern `loadFolderPermRows\(\s*TEMPLATE_MTY_ID` confirmed at line 179. |
| `lib/server/folderPermissionTerrainView.ts` | `lib/server/folderPermQuery.ts` | `loadFolderPermRows(projectId, { l2Only: true })` inside `Promise.all` | WIRED | `grep -Fn loadFolderPermRows lib/server/folderPermissionTerrainView.ts` → matches at lines 3 (comment), 8 (import), 98 (call). Pattern `loadFolderPermRows(projectId,\s*\{\s*l2Only` confirmed at line 98. |
| `lib/server/folderPermQuery.ts` | `@/server/db` | Plain tagged-template `db.$queryRaw` on both scope branches | WIRED | `grep -n 'db\.\$queryRaw' lib/server/folderPermQuery.ts` → matches at lines 44 (l2Only branch) and 55 (default branch). No `Prisma.sql/raw/join` in executable code (line 9 match is JSDoc comment only). |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `lib/server/folderPermQuery.ts` | `FolderPermRow[]` return | `db.$queryRaw` over `AccFolderPermission` / `AccRole` / `AccFolder` Prisma-backed tables | Yes — live DB queries, no hardcoded or static fallback | FLOWING |
| `lib/server/templateFolderTerrain.ts` | `perms` (third element of `Promise.all`) | `loadFolderPermRows(TEMPLATE_MTY_ID)` → `folderPermQuery.ts` → DB | Yes — same DB tables, all-folders scope | FLOWING |
| `lib/server/folderPermissionTerrainView.ts` | `perms` (third element of `Promise.all`) | `loadFolderPermRows(projectId, { l2Only: true })` → `folderPermQuery.ts` → DB | Yes — same DB tables, L2-only scope (Project Files parent join) | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TEST-03: `loadTemplateFolderTerrain` shared query contract (5 tests) | `npx vitest run lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` | 5 passed | PASS |
| TEST-02: `loadFolderPermissionTerrain` + `loadFolderPermissionOverview` + `loadTerrainProjects` golden masters (4 tests) | `npx vitest run lib/server/__tests__/folderPermissionTerrainView.test.ts` | 4 passed | PASS |
| TypeScript type check | `npx tsc --noEmit` | Exit 0, 0 errors | PASS |
| Residual base-join SQL absent from callers | `grep -Fn 'r.name AS role_name, fp."permType" AS perm_type' lib/server/templateFolderTerrain.ts lib/server/folderPermissionTerrainView.ts` | Exit 1, 0 matches | PASS |
| `loadFolderPermRows` present in all 3 files | `grep -Fn loadFolderPermRows lib/server/folderPermQuery.ts lib/server/templateFolderTerrain.ts lib/server/folderPermissionTerrainView.ts` | 8 matches across all 3 files | PASS |
| No `Prisma.sql/raw/join` in executable code | `grep -En 'Prisma\.(sql\|raw\|join)' lib/server/folderPermQuery.ts` | 1 match — line 9 (JSDoc comment only, not executable code) | PASS |

---

### Probe Execution

Step 7c: Not applicable — no `scripts/*/tests/probe-*.sh` files declared or found for this phase. Phase is a pure server-side TypeScript refactor; automated gates are Vitest + tsc.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| QUERY-01 | 15-01-PLAN.md | Extract base `AccFolderPermission` join to `lib/server/folderPermQuery.ts`; both terrain loaders import from it; TEST-03 passes unchanged | SATISFIED | All code evidence verified: module exists, both callers import it, no residual SQL, TEST-03 green, tsc clean. REQUIREMENTS.md checkbox shows `[ ]` (documentation not updated post-phase) — documentation gap only, not a code gap; ROADMAP.md marks Phase 15 as COMPLETE. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `lib/server/folderPermQuery.ts` | 9 | `Prisma.sql / Prisma.raw / Prisma.join` | Info | JSDoc comment warning AGAINST using these patterns — explicitly the correct documentation; not executable code. No violation. |

No TBD/FIXME/XXX markers found in any of the 3 changed files. No stub patterns. No hardcoded empty data. No return-null/return-[]/return-{} stub implementations.

**Pre-existing WIP note:** `app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx` is modified in the working tree (line 82 gradient count assertion updated from 5 to 6). This was last committed by `1c3e1ea7` (polish(terrain)) — predates Phase 15 entirely. Commit `a4d923ca` did NOT touch this file (`git show --stat a4d923ca` confirms only 3 `lib/server/` files changed). The 2 pre-existing WIP failures in this file are unchanged and correctly deferred to Phase 16 per plan constraints.

---

### Human Verification Required

None. All must-have truths are VERIFIED by automated gates. The owner visual check on `/template-mty` and `/access-analysis` was performed and approved prior to commit `a4d923ca`, recorded in 15-01-SUMMARY.md. No additional human verification is required.

---

### Dashboard Guardrails Check

| Guardrail | Status | Evidence |
|-----------|--------|----------|
| Changed files limited to 3 intended source files | PASS | `git show --stat a4d923ca`: exactly `lib/server/folderPermQuery.ts`, `lib/server/folderPermissionTerrainView.ts`, `lib/server/templateFolderTerrain.ts` — 3 files, 76 insertions, 29 deletions |
| `/users/spatial-graph` NOT touched | PASS | `a4d923ca` not in `git log -- app/(dashboard)/users/spatial-graph`; commit touches only `lib/server/` |
| No new WebGL on data surfaces | PASS | `folderPermQuery.ts` is a pure server-side TypeScript module — no React, no browser APIs, no WebGL/R3F imports |
| Zinc theme + ECharts untouched | PASS | Server-only refactor; zero client/render/style changes |
| Data source: live Prisma DB, no faked analytics | PASS | Both branches query `AccFolderPermission` / `AccRole` / `AccFolder` live via `db.$queryRaw`; no fixtures, no hardcoded rows |
| All-folders vs L2-only scope difference preserved | PASS | Two separate SQL branches: default (all-folders) and l2Only (adds `JOIN "AccFolder" parent ... AND parent.name = 'Project Files'`); not unified |
| No `src/...` generic paths introduced | PASS | All 3 files are in verified `lib/server/` root; imports use `@/lib/server/folderPermQuery` and `@/server/db` (alias-mapped) |

---

### Gaps Summary

No gaps. All 7 must-have truths are VERIFIED. All 5 ROADMAP success criteria are met. All automated gates pass. Owner visual check completed. Phase 15 goal achieved.

**Minor documentation note (non-blocking):** `REQUIREMENTS.md` still shows `[ ] **QUERY-01**` (checkbox not updated) and the traceability table shows "Pending". This is a bookkeeping gap in the requirements document — the code implementation is fully verified. The ROADMAP.md correctly marks Phase 15 as COMPLETE and 15-01-PLAN.md as done.

---

## Dashboard Self-Check

- **Context:** Loaded `.planning/STATE.md` (Phase 15 complete, commit a4d923ca recorded), `.planning/ROADMAP.md` (Phase 15 SC 1–5), `.planning/REQUIREMENTS.md` (QUERY-01 traceability), `15-CONTEXT.md` (locked decisions), `15-01-PLAN.md` (must_haves + success_criteria + key_links), `15-01-SUMMARY.md` (gate results claimed). Read `lib/server/folderPermQuery.ts`, `lib/server/templateFolderTerrain.ts`, `lib/server/folderPermissionTerrainView.ts`, `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts`, `lib/server/__tests__/folderPermissionTerrainView.test.ts`.
- **Evidence:** All claims grounded in: git show --stat (3-file commit), live file reads (function signatures, import lines, call sites), automated gate outputs (TSC_EXIT:0, VITEST_EXIT:0, grep EXIT:1 for residual SQL), git diff (empty on test files). No SUMMARY.md claims trusted without corroboration.
- **Constraints applied:** Zinc theme confirmed untouched. No new WebGL (server-only module). `/users/spatial-graph` not in Phase 15 commit. `Prisma.sql/raw/join` confirmed absent from executable code. Pre-existing FolderPermissionTerrain.test.tsx WIP failures confirmed pre-existing (last touched `1c3e1ea7`, not Phase 15). Base-join scope only (parentPerms, loadTerrainProjects density, loadFolderPermissionOverview not extracted — confirmed by reading files).
- **Gates run:** `npx tsc --noEmit` (0 errors), `npx vitest run TEST-02 TEST-03` (9/9 passed), `git diff --name-only` on test files (empty), `grep -Fn` residual SQL (EXIT:1), `grep -Fn loadFolderPermRows` (matches in all 3 files), `grep -En Prisma.(sql|raw|join)` (comment-only match), `git show --stat a4d923ca` (3 files exact), `git log -- spatial-graph` (a4d923ca absent).
- **VERIFY:** REQUIREMENTS.md QUERY-01 checkbox remains `[ ]` (documentation not updated post-phase) — bookkeeping gap only; code implementation fully verified.

---

_Verified: 2026-07-01T18:40:00Z_
_Verifier: Claude (gsd-verifier)_
