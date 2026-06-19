---
phase: 06-template-mty-forma-proposal-polish
plan: "04"
subsystem: forma-proposal
tags: [r3f, dynamic-import, performance, premium-surface, skeleton]
dependency_graph:
  requires: [06-02]
  provides: [FRM-01, FRM-02]
  affects: [forma-proposal]
tech_stack:
  added: []
  patterns:
    - next/dynamic ssr:false for d3 + R3F bundle deferral
    - requestIdleCallback prefetch pattern (setTimeout fallback)
    - frameloop=demand R3F particle accent
    - PremiumSurface depth on outer containers only (glass/base/float)
key_files:
  created:
    - app/(dashboard)/forma-proposal/components/FormaParticleAccent.tsx
    - app/(dashboard)/forma-proposal/components/HierarchyViewSkeleton.tsx
    - app/(dashboard)/forma-proposal/loading.tsx
  modified:
    - app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx
decisions:
  - FormaParticleAccent is default-exported (not named) so dynamic(() => import('./FormaParticleAccent')) resolves without .then(m => m.X)
  - HierarchyViewSkeleton is named export (used as loading: fallback and reusable)
  - Idle prefetch targets './HierarchyView' (not './HierarchyCanvas') — the dynamic boundary is HierarchyView.tsx
  - PremiumSurface wraps outer containers (rail/editor-section/hierarchy-container/top-bar) as divs; semantic HTML elements preserved as children where needed
  - Particle count 110, opacity 0.18, SPREAD_X 14, SPREAD_Y 10 for full-bleed at barely-there intensity
  - Camera z=5 (vs z=2 in header accent) to frame the wider SPREAD_X/Y without clipping
metrics:
  duration: "4 minutes"
  completed: "2026-06-19"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
status: complete
---

# Phase 06 Plan 04: FormaProposalClient Wiring Summary

**One-liner:** Dynamic d3 deferral via `next/dynamic ssr:false` with idle prefetch, R3F particle accent at `frameloop=demand` / `opacity 0.18`, and restrained `PremiumSurface` depth on outer editor containers only.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create FormaParticleAccent + HierarchyViewSkeleton + loading.tsx | 9027e668 | 3 created |
| 2 | Rewire FormaProposalClient | d56b957b | FormaProposalClient.tsx |

## What Was Built

### FormaParticleAccent.tsx (new)
- R3F drifting-particle background accent; default export for `dynamic(() => import(...))` target.
- 110 particles, SPREAD_X=14 / SPREAD_Y=10 for full-bleed coverage behind the editor.
- `frameloop="demand"` + `setInterval(() => invalidate(), 80)` gentle-drift driver (~12fps).
- `opacity=0.18`, `powerPreference="low-power"` — GPU < 400MB, barely-there ambient.
- `position:absolute inset:0 pointer-events:none z-index:0` — sits behind, never blocks clicks.
- Only file under forma-proposal that imports `@react-three/fiber` (PERF-05 compliant).

### HierarchyViewSkeleton.tsx (new)
- Layout-shaped skeleton matching the hierarchy view tree structure.
- Named export; used as `loading:` fallback in the dynamic() import and available for reuse.
- Tree root node + 4 L1 branches + L2 children for first 2 branches + connector-line hint.
- `animate-pulse rounded-md bg-muted/20` consistent with page skeleton conventions.

### loading.tsx (new)
- Route-level Next.js Suspense skeleton for /forma-proposal (~200ms PERF-01 target).
- Layout: top bar row + left rail column (6 role items) + right tree/canvas area.
- Mirrors conventions of `/users/loading.tsx`.

### FormaProposalClient.tsx (rewired)
- **FRM-01 (dynamic d3):** `const HierarchyView = dynamic(() => import("./HierarchyView").then(m => m.HierarchyView), { ssr:false, loading: () => <HierarchyViewSkeleton /> })`.
- **Idle prefetch:** `useEffect([], ...)` calls `requestIdleCallback(() => import("./HierarchyView"))` with 2s setTimeout fallback for Safari — first mode-switch to hierarchy feels instant.
- **FRM-02 (particle accent):** `FormaParticleAccent` dynamically imported (ssr:false), rendered first in the outermost `relative` container at z-0; all editor content at `relative z-[1]`.
- **PremiumSurface depth (restrained):**
  - Top bar: `variant="float"` (compact, light polish)
  - Role rail outer container: `variant="glass"`
  - Editor section outer: `variant="base"`
  - Hierarchy view container: `variant="base"`
  - Folder-tree rows, tier chips, RoleRail items: **flat** (no PremiumSurface wrapping)
- All 8 HierarchyView props unchanged from the pre-split call site.

## Verification Results

- `npx tsc --noEmit` exits 0 (whole tree including test files).
- `grep -rln "from \"@react-three/fiber\"" app/(dashboard)/forma-proposal` → 1 file: `FormaParticleAccent.tsx` (PERF-05).
- `dynamic(` present in FormaProposalClient with both HierarchyView and FormaParticleAccent.
- `requestIdleCallback` + `cancelIdleCallback` + `clearTimeout` cleanup present.
- No deletions in either commit.

## Deviations from Plan

### Note: Plan verify block "canvas-count = 1" not literally satisfiable post-06-02

The Task 2 verify block uses `grep -rln "Canvas" app/(dashboard)/forma-proposal | wc -l` and expects `= "1"`. After plan 06-02 created `HierarchyCanvas.tsx`, the word "Canvas" appears in 3 files (FormaParticleAccent.tsx, HierarchyCanvas.tsx, HierarchyView.tsx). The PERF-05 compliance requirement is "exactly one `@react-three/fiber` / WebGL Canvas under forma-proposal," which **is** satisfied — only FormaParticleAccent.tsx imports `@react-three/fiber`. The plan's grep was written before 06-02 created HierarchyCanvas.tsx as a named SVG-based component (no R3F). No code regression; deviation is in the verify script's grep pattern only.

## Known Stubs

None. All components are fully wired and functional.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or schema changes. The R3F accent is decorative and non-interactive (pointer-events:none; frameloop=demand; GPU budget < 400MB confirmed by particle count + opacity).

## Self-Check: PASSED

- [x] `app/(dashboard)/forma-proposal/components/FormaParticleAccent.tsx` exists
- [x] `app/(dashboard)/forma-proposal/components/HierarchyViewSkeleton.tsx` exists
- [x] `app/(dashboard)/forma-proposal/loading.tsx` exists
- [x] `app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx` modified
- [x] Commit 9027e668 exists (Task 1)
- [x] Commit d56b957b exists (Task 2)
