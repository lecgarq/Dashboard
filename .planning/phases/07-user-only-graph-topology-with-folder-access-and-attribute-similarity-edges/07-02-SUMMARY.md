---
phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges
plan: 02
subsystem: acc-folders
tags: [graph, folder-hub, pure-module, tdd, topology]
requires: [server/routers/acc-folders.ts:FolderMatrixRow]
provides:
  - "collapseFoldersToDepth(rows, maxDepth=2) → CollapsedFolder[]"
  - "CollapsedFolder"
  - "FolderHubInputRow"
affects: ["Plan 07-05 (2D wiring)", "Plan 07-07 (3D wiring)"]
tech_stack:
  added: []
  patterns: ["pure-module", "tdd-red-green", "structural-typing"]
key_files:
  created:
    - lib/acc/folderHubCollapse.ts
    - lib/acc/folderHubCollapse.test.ts
  modified: []
decisions:
  - "Structural input type (FolderHubInputRow) instead of importing FolderMatrixRow — keeps module pure (no @/server dependency)."
  - "First-seen group order preserved for stable, deterministic output."
  - "maxDepth=Infinity handled by the existing depth ≤ maxDepth branch — no special case."
  - "Group key includes projectId so cross-project rows on identical paths never merge."
metrics:
  duration: ~4 min
  tasks: 2
  files: 2
  completed: "2026-05-12"
requirements: [GRAPH7-01]
---

# Phase 7 Plan 02: Folder Hub Collapse Module Summary

Pure depth-N folder-collapse utility that folds `accFoldersRouter.getMatrix` rows into a smaller set of folder hubs while preserving the full permission picture via UNION semantics.

## What Shipped

- `lib/acc/folderHubCollapse.ts` — `collapseFoldersToDepth(rows, maxDepth=2)` plus the `CollapsedFolder` output type and `FolderHubInputRow` structural input type. 129 lines, zero Prisma/React imports.
- `lib/acc/folderHubCollapse.test.ts` — 7 Vitest cases covering empty input, shallow preservation, depth-2 collapse, UNION semantics, per-`(roleId, permType)` dedupe, `maxDepth=Infinity` escape hatch, and cross-project isolation.

## Key Behaviours

- **Default `maxDepth=2`**: descendants beyond depth 2 fold onto a synthetic hub identified by `collapsed:${projectId}::${collapsedPath}` (e.g. `/Project Files/Plans` for any leaf under `/Project Files/Plans/02 Architecture/...`).
- **UNION semantics**: every descendant row contributes its `(roleId, permType)` pair to the hub. No silent drop of the permission picture (Pitfall 3 of the phase RESEARCH).
- **Dedup**: a `Set<roleId::permType>` per hub keeps each pair exactly once.
- **Escape hatch**: `maxDepth=Infinity` causes every row to satisfy `depth ≤ maxDepth`, returning the original folder set unchanged (modulo same-(projectId,path) merging which never triggers when ids are unique).
- **Cross-project isolation**: group key is `${projectId}::${collapsedPath}`, so identical paths under different projects produce separate hubs.

## Decisions Made

- **Structural input typing.** Defined `FolderHubInputRow` locally (5 fields: `folderId, folderPath, projectId, roleId, permType`) instead of importing `FolderMatrixRow` from `server/routers/acc-folders.ts`. Keeps the module free of server / Prisma transitively and lets callers adapt any shape.
- **Stable output order.** Used an `order` array of first-seen group keys so consumers (renderers in Plans 07-05 / 07-07) see deterministic output across runs.
- **Group key includes projectId.** Prevents cross-project path collisions from accidentally merging into a single hub.
- **No special case for `Infinity`.** `depth ≤ Infinity` is always true for finite paths, so the preserve-as-is branch handles the escape hatch without a separate code path.

## Verification

- `npx vitest run lib/acc/folderHubCollapse.test.ts` → 7/7 passing.
- Purity grep `from .(prisma|react|@/server)` against `lib/acc/folderHubCollapse.ts` → empty.

## Deviations from Plan

None — plan executed exactly as written. Two atomic commits (RED, GREEN) per the TDD spec.

## Commits

- `deba7c6` — test(07-02): add failing tests for collapseFoldersToDepth
- `ef3aef7` — feat(07-02): implement collapseFoldersToDepth (GRAPH7-01)

## Downstream

- Plan 07-05 consumes `collapseFoldersToDepth` to feed the 2D topology renderer with hub nodes.
- Plan 07-07 consumes it for the 3D spherical renderer.

## Self-Check: PASSED

- `lib/acc/folderHubCollapse.ts` — FOUND
- `lib/acc/folderHubCollapse.test.ts` — FOUND
- Commit `deba7c6` — FOUND
- Commit `ef3aef7` — FOUND
