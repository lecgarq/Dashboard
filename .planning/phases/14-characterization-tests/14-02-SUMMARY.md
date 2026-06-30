---
phase: 14-characterization-tests
plan: "02"
subsystem: lib/server
tags: [characterization-tests, test, contract-pin, ref-02, template-mty]
requires: []
provides: [TEST-03, REF-02-signpost]
affects: ["/template-mty terrain", "lib/server/templateFolderTerrain.ts"]
tech_stack:
  added: []
  patterns: [vi.hoisted + vi.mock seam, mock-db contract pin, tagged-template mock]
key_files:
  created:
    - lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts
  modified:
    - lib/server/templateFolderTerrain.ts
decisions:
  - "SPLIT-PENDING comment references REF-02 (folderPermQuery.ts extraction deferred)"
  - "Contract pin with 5-column assertion + row-bound; refactor-tolerant (not golden master)"
  - "pf-level perm row in fixture makes inherited-tier resolution observable (n_actions:0 → parent effective tier)"
  - "TEMPLATE_MTY_ROSTER kept real; assertions are roster-independent (structural)"
metrics:
  duration: "358s (~6min)"
  completed: "2026-06-30"
  tasks_completed: 2
  files_changed: 2
status: complete
requirements: [TEST-03]
---

# Phase 14 Plan 02: Shared AccFolderPermission Query Contract — Summary

**One-liner:** Pinned the shared `AccFolderPermission` 5-column query contract consumed by `loadTemplateFolderTerrain` via a mock-db Vitest characterization test (TEST-03 / REF-02 signpost), and added a `// SPLIT-PENDING:` comment referencing REF-02 on `templateFolderTerrain.ts`.

## What Was Built

### Task 1 — REF-02 SPLIT-PENDING signpost (comment-only)

Added a `// SPLIT-PENDING: REF-02` block above `import "server-only"` in
`lib/server/templateFolderTerrain.ts`. The comment identifies the shared
`AccFolderPermission` role/perm/folder join as the extraction target for the
deferred `lib/server/folderPermQuery.ts` refactor, and references the TEST-03
contract file that protects it. No logic, import, or behavior change.

**Commit:** `f8e15f6e` — `chore(14-02): add REF-02 SPLIT-PENDING signpost to templateFolderTerrain.ts`
**Files:** `lib/server/templateFolderTerrain.ts` (+6 comment lines)

### Task 2 — Shared query contract characterization test (TEST-03)

Created `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` (146 lines).
Five contract assertions:

| # | Name | What it pins |
|---|------|-------------|
| 1 | STABLE COLUMN COUNT | `Object.keys(permRow).sort()` == `["folder_id","n_actions","perm_type","role_id","role_name"]` |
| 2 | FAITHFUL COLUMN MAPPING | All 5 columns flow into assembled cells (role_name→roleName, folder_id→folderId, perm_type→tier for explicit, n_actions:0→inherited tier from parent ≠ stored "View Only" floor) |
| 3 | ROW-BOUND | `cells.length <= foldersWithPerms × roles`; no duplicate (folderId, roleId) pairs |
| 4 | PROJECT SCOPE | `$queryRaw` called once; `TEMPLATE_MTY_ID` present in tagged-template call args |
| 5 | NULL PATH | `null` returned when `accProject.findUnique` resolves null |

Mock seam: `vi.hoisted()` + `vi.mock("@/server/db")` — mirrors `coordinationByProjectView.test.ts` exactly. `TEMPLATE_MTY_ROSTER` kept real; assertions are roster-independent (structural). No jest-dom matchers.

**Commit:** `243d10e9` — `test(14-02): characterize shared AccFolderPermission query contract (TEST-03)`
**Files:** `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` (new, 146 lines)

## Verification Evidence

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (Task 1, after comment) | Clean (no output) |
| `npx vitest run lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` | 5/5 passed |
| `npx tsc --noEmit` (Task 2, after test) | Clean (no output) |
| Negative scope check (each commit) | Task 1: only `lib/server/templateFolderTerrain.ts`; Task 2: only `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` |
| `/users/spatial-graph` files touched | None |
| `git diff lib/server/templateFolderTerrain.ts` logic change | Zero — only 6 added comment lines |

## Success Criteria Check

- [x] `templateFolderTerrain.ts` carries a `// SPLIT-PENDING:` comment referencing REF-02
- [x] Test file references REF-02 as deferred extraction target
- [x] Stable 5-column contract asserted (`folder_id`, `role_id`, `role_name`, `perm_type`, `n_actions`)
- [x] Faithful column mapping: role_name → roleName, perm_type → tier (explicit), n_actions:0 → inherited tier ≠ floor
- [x] Row-bound asserted: cells ≤ foldersWithPerms × roles; no dup (folderId, roleId) pairs
- [x] Project scope: `TEMPLATE_MTY_ID` in $queryRaw call args, called exactly once
- [x] Null path: null returned when project not found
- [x] `npx tsc --noEmit` clean; 5/5 Vitest tests pass
- [x] Diff is test-file + comment-only; no loader behavior changed
- [x] min_lines: 60 satisfied (146 lines)

## Deviations from Plan

None — plan executed exactly as written. The pf-level perm row (for "Project Files", level 1) was included in the fixture so that the f2 inherited-tier resolution is observable (f2 with n_actions:0 inherits pf's "View+Download" effective tier rather than the stored "View Only" floor). This is consistent with the plan's direction to "run once, capture, and confirm these hold before pinning."

## Workshop Impact

No user-visible change. This is a pure safety-net commit: it makes the deferred REF-02 `folderPermQuery.ts` extraction safe for the next contributor and adds a `SPLIT-PENDING` signpost on the `/template-mty` terrain loader. The four workshop pages remain unaffected.

## Data Truthfulness

Synthetic in-memory fixtures only — no live PostgreSQL DB accessed. No analytics or metrics changed. The row-bound assertion (`cells.length <= foldersWithPerms × roles`) is consistent with the OOM-aggregate guard established in TEST-01 (Phase 09).

## Known Stubs

None. The test uses concrete structural assertions (not placeholder values). The comment is a proper deferred-refactor signpost, not a stub.

## Threat Flags

None. T-14-03 (synthetic fixtures, no PII) and T-14-04 (comment-only edit confirmed by diff) were both accepted/mitigated per the plan's threat register. No new network endpoints, auth paths, file access patterns, or schema changes introduced.

## Dashboard Self-Check

- **Context:** `STATE.md`, `14-CONTEXT.md`, `14-02-PLAN.md`, `TESTING.md`, `templateFolderTerrain.ts`, `coordinationByProjectView.test.ts`, `templateFolderTerrain.test.ts`, `folderInheritance.ts` — all read.
- **Evidence:** `lib/server/templateFolderTerrain.ts` verified for exact call structure (Promise.all, $queryRaw tagged-template, 5-column alias list). Mock seam verified against `coordinationByProjectView.test.ts` pattern. `TEMPLATE_MTY_ID` value verified from `lib/acc/template-mty.ts`. `resolveEffectiveTier` logic verified from `folderInheritance.ts` to confirm inherited-tier assertion.
- **Constraints:** No new WebGL, no theme changes, zinc dark theme untouched, `/users/spatial-graph` not touched, ECharts not involved. Prisma DB not accessed in tests.
- **Gates:** `npx tsc --noEmit` run after each task (clean). `npx vitest run` on the new file (5/5). No `next build` required for this phase. Repo-map check not needed (no import boundary changes).
- **VERIFY:** none.

## Self-Check

- [x] `lib/server/__tests__/templateFolderTerrain.sharedQuery.test.ts` exists (verified via Vitest run)
- [x] `lib/server/templateFolderTerrain.ts` SPLIT-PENDING comment exists (`grep -c` returned 1)
- [x] Commit `f8e15f6e` exists (Task 1)
- [x] Commit `243d10e9` exists (Task 2)

## Self-Check: PASSED
