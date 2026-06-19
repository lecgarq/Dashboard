---
phase: "06-template-mty-forma-proposal-polish"
plan: "05"
subsystem: "template-mty/role-similarity-graph"
tags: ["d3-force", "drill-sheet", "tdd", "settle-freeze", "role-overview", "click-vs-drag"]
depends:
  requires: ["06-03"]
  provides: ["RoleSimilarityGraph.onNodeClick", "RoleOverviewSheet", "settle-and-freeze sim"]
  affects: ["TemplateAnalysisCharts.tsx"]
tech_stack:
  added: []
  patterns:
    - "settle-and-freeze: sim.on('end', sim.stop()) ends perpetual d3-force ticking"
    - "click-vs-drag: totalMovement+duration gate distinguishes pointer click from drag"
    - "in-bounds SVG label clamping: clamp(x, margin, width-margin), clamp(y, 12, H-12)"
    - "reduced-motion: sim.stop() immediately after creation; seed positions as final layout"
    - "NA-01: role overview data derived entirely from already-loaded page props (no new query)"
    - "INT-01: member-row click closes role sheet then opens shared AuthorProfileDrawer"
key_files:
  created:
    - app/(dashboard)/template-mty/components/RoleOverviewSheet.tsx
  modified:
    - app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx
    - app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
    - app/(dashboard)/template-mty/__tests__/RoleSimilarityGraph.test.tsx
decisions:
  - "CLICK_THRESHOLD_PX=6 + CLICK_DURATION_MS=250 — safer on touch (per RESEARCH Risk 3)"
  - "Tooltip card stays pinned top-left (already in-bounds); no dynamic follow needed"
  - "selectedRoleId hoisted in TemplateAnalysisCharts (mirrors profileEmail pattern — RESEARCH Open Q1)"
  - "RoleOverviewSheet closes before AuthorProfileDrawer opens (INT-01: single sheet visible)"
  - "totalMovement accumulated per pointermove delta (not cumulative from anchor) for accuracy"
metrics:
  duration: "~6min"
  completed: "2026-06-19"
  tasks_completed: 2
  files_changed: 4
status: complete
---

# Phase 06 Plan 05: Role-Similarity Graph Polish Summary

One-liner: Settle-and-freeze d3-force sim with 6px/250ms click-vs-drag threshold, in-bounds label clamping, reduced-motion snap, and slide-in RoleOverviewSheet sourced from page props.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| TDD RED | Add failing RoleSimilarityGraph tests | 398eaa91 | RoleSimilarityGraph.test.tsx |
| 1 (GREEN) | RoleSimilarityGraph settle-freeze + click-vs-drag + clamping | 0cfd2bd9 | RoleSimilarityGraph.tsx |
| 2 | RoleOverviewSheet + selectedRoleId hoist in TemplateAnalysisCharts | 9c3412fe | RoleOverviewSheet.tsx, TemplateAnalysisCharts.tsx |

## What Was Built

### Task 1: RoleSimilarityGraph upgrades (TDD)

**Settle-and-freeze (T-06-06 mitigation):** Added `.on("end", () => sim.stop())` to the d3-force simulation. The sim now runs briefly on mount, reaches alphaMin, then stops. On `onNodeDown` it reheats via `alphaTarget(0.3).restart()`; on `onUp` after drag it cools via `alphaTarget(0)` and coasts to auto-freeze via the `"end"` listener. Eliminates the perpetual CPU drain.

**Click-vs-drag threshold:** Extended `ix.current` with `totalMovement: number` and `downTime: number`. In `onMove` (node mode), `totalMovement += Math.hypot(dx, dy)` accumulates per-event delta. In `onUp`, if `totalMovement < CLICK_THRESHOLD_PX (6)` AND `elapsed < CLICK_DURATION_MS (250)`, fires `onNodeClick?.(node.roleId)`. Otherwise treats as drag. Constants chosen per RESEARCH Risk 3 (touch safety).

**In-bounds label clamping:** SVG `<text>` labels clamped: `x = clamp(n.x, LABEL_MARGIN_X=40, width-40)`, `y = clamp(n.y + n.r + 9/v.k, 12, H-12)`. Hover tooltip card remains pinned top-left (inherently in-bounds; no edge-case clamping required).

**Reduced-motion:** `useReducedMotion()` from framer-motion. When true, `sim.stop()` is called immediately after creation — the deterministic circle-seed positions from the `pnodes` useMemo become the final layout (no animated jiggle).

**Testability:** Added `data-role-node={n.roleId}` to each node `<g>`. Cursor changed to `pointer` (clickable affordance).

**TDD discipline:**
- RED commit (398eaa91): 3 tests, 2 failing (empty-state passes; click and drag tests fail — `data-role-node` not yet present)
- GREEN commit (0cfd2bd9): All 3 tests pass

### Task 2: RoleOverviewSheet + TemplateAnalysisCharts wiring

**RoleOverviewSheet.tsx:** New `"use client"` component wrapping `DrillSheet`. Props: `{ open, onClose, roleName, folderCount, tiers, members, onMemberClick }`. Renders:
- Header: role name (from DrillSheet `title`) + "{folderCount} folders reached"
- Tier breakdown: horizontal bar per tier using `TIER_COLORS[tier.rank]`, count label, proportional bar width
- Members list: button rows for each member; `disabled + opacity-50` when no email (mirrors table rule); `onMemberClick(email)` on click

**TemplateAnalysisCharts.tsx wiring:**
- `selectedRoleId` state hoisted (mirrors `profileEmail` pattern per RESEARCH Open Q1)
- `RoleSimilarityGraph` receives `onNodeClick={(roleId) => setSelectedRoleId(roleId)}`
- `selectedRoleNode`: from `roleSimilarity.nodes.find(n => n.roleId === selectedRoleId)` — no new query
- `selectedRoleTreeNode`: from `roleTree.find(n => n.roleId === selectedRoleId)` — no new query
- `selectedRoleTiers`: mapped from `selectedRoleTreeNode.tiers` (label, rank, count=folders.length)
- `membersForRole`: `overview.members.filter(m => m.role === selectedRoleNode.roleName)` — no new query
- `RoleOverviewSheet` rendered; `onMemberClick` closes role sheet (`setSelectedRoleId(null)`) then opens `AuthorProfileDrawer` (`setProfileEmail(email)`) — INT-01 compliance

## Verification

```
npx tsc --noEmit         → 0 errors
npm test (graph test)    → 3/3 passed (empty + click + drag)
NA-01 grep               → 0 new useQuery/trpc. in RoleOverviewSheet + TemplateAnalysisCharts
```

## Deviations from Plan

None — plan executed exactly as written.

- CLICK_THRESHOLD_PX chose 6 (plan said 6, research said 4; plan value used per task action)
- Tooltip card left pinned top-left (already in-bounds) rather than dynamically following the node (would add complexity without TPL-02 benefit since hovered state already shows the tooltip instantly at top-left)

## Known Stubs

None. All data paths are wired from page props already loaded.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes. Role overview derived entirely from RSC props (NA-01 fulfilled). T-06-06 (CPU DoS via perpetual sim ticking) is mitigated by settle-and-freeze.

## Self-Check: PASSED

- [x] `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx` — exists, modified
- [x] `app/(dashboard)/template-mty/components/RoleOverviewSheet.tsx` — exists, created
- [x] `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` — exists, modified
- [x] `app/(dashboard)/template-mty/__tests__/RoleSimilarityGraph.test.tsx` — exists, modified
- [x] Commit 398eaa91 exists (RED)
- [x] Commit 0cfd2bd9 exists (GREEN)
- [x] Commit 9c3412fe exists (Task 2)
- [x] `npx tsc --noEmit` → 0 errors
- [x] Graph test → 3/3 passed
