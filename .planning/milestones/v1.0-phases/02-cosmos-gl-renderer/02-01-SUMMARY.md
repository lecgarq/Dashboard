---
phase: 02-cosmos-gl-renderer
plan: "01"
subsystem: graph-renderer
tags: [cosmos.gl, webgl2, gpu-renderer, typescript]
dependency_graph:
  requires: []
  provides: [CosmosGraphRenderer, cosmosUtils]
  affects: [AccUsersGraph.tsx, graphRenderers.ts]
tech_stack:
  added: ["@cosmos.gl/graph@3.0.0-beta.8"]
  patterns: ["dynamic import for SSR safety", "async factory pattern", "Float32Array GPU buffer builders"]
key_files:
  created:
    - app/(dashboard)/users/cosmosUtils.ts
  modified:
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/AccUsersGraph.tsx
    - package.json
    - package-lock.json
decisions:
  - "Use @cosmos.gl/graph@3.0.0-beta.8 (beta) pinned to exact version — plan specified this over v2.6.1 stable"
  - "selectNode() uses v3 selectPointByIndex/unselectPoints API — highlightedPointIndices does not exist in v3"
  - "GraphRenderNode.kind expanded to user|project|role|module (was user-only) for Phase 2 multi-type node support"
  - "Minimal AccUsersGraph.tsx update: import/type references only — full wiring deferred to Plan 02-02"
metrics:
  duration: "6m"
  completed_date: "2026-04-28"
  tasks_completed: 2
  files_changed: 5
requirements_satisfied: [REND-01, REND-03, REND-04]
---

# Phase 02 Plan 01: Cosmos.gl Renderer Core — Summary

**One-liner:** GPU renderer adapter with WebGL2 detection, Float32Array buffer builders, and dynamic @cosmos.gl/graph import for SSR safety — all 4 node type colors preserved via pre-computed hex.

## What Was Built

### cosmosUtils.ts (new file)
Six exports for data conversion between the existing `GraphRenderFrame` format and Cosmos GPU buffer format:
- `hexToRGBNorm` — hex color string to normalized `[r, g, b]` floats with shorthand support
- `isWebGL2Available` — synchronous WebGL2 probe, SSR-safe (returns false on server)
- `buildNodeColorBuffer` — per-node RGBA Float32Array using `node.color` (pre-computed hex per kind)
- `buildNodeSizeBuffer` — per-node size Float32Array with sqrt-scaled degree weighting
- `buildLinkBuffer` — converts `Int32Array` sources/targets to Cosmos `Float32Array` flat pair format
- `buildLinkColorBuffer` — uniform gray RGBA (Phase 2 single edge type; multi-type deferred)

### graphRenderers.ts (modified)
- `GraphRenderer.backend` union changed from `"canvas2d" | "webgpu"` to `"canvas2d" | "cosmos"`
- `GraphRenderNode.kind` expanded from `"user"` to `"user" | "project" | "role" | "module"`
- `WebGpuGraphRenderer` stub removed entirely
- `CosmosGraphRenderer` class added with:
  - `static async create(container, onContextLost)` — async factory with WebGL2 probe and dynamic import
  - `draw(frame)` — delta uploads GPU buffers on node/link count change (not every frame)
  - `selectNode(index | null)` — v3 selection API
  - `setPhysicsConfig(partial)` — live physics via `setConfigPartial`
  - `destroy()` — cleanup with optional chaining for v3 `destroy?.()` uncertainty
  - `onNodeSelectCallback` field for component notification

### AccUsersGraph.tsx (minimal update)
Import and type references updated from `WebGpuGraphRenderer`/`"webgpu"` to `CosmosGraphRenderer`/`"cosmos"` so TypeScript compiles. Full component wiring (container div, physics panel, toggle UI) is Plan 02-02 scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] selectNode() API adapted for v3 actual methods**
- **Found during:** Task 2, after reading `dist/index.d.ts`
- **Issue:** Plan specified `setConfigPartial({ highlightedPointIndices, highlightedLinkIndices })` and `getConnectedLinkIndices([index])` — these methods do not exist in v3.0.0-beta.8
- **Fix:** Used actual v3 selection API: `selectPointByIndex(index, true)` (selects point + adjacent) and `unselectPoints()` for clear
- **Files modified:** `app/(dashboard)/users/graphRenderers.ts`
- **Commit:** 5d5830b

**2. [Rule 1 - Bug] GraphRenderNode.kind expanded to 4 types**
- **Found during:** Task 2 review of existing graphRenderers.ts
- **Issue:** Current `kind: "user"` only — plan and cosmosUtils comment reference 4 types; buildNodeColorBuffer needs to handle all 4 kinds correctly (uses node.color directly so this was a type accuracy fix, not behavioral)
- **Fix:** Updated `kind` union to `"user" | "project" | "role" | "module"`
- **Files modified:** `app/(dashboard)/users/graphRenderers.ts`
- **Commit:** 5d5830b

**3. [Rule 3 - Blocking] Minimal AccUsersGraph.tsx update required for TypeScript compilation**
- **Found during:** Task 2 TypeScript check
- **Issue:** AccUsersGraph.tsx imported `WebGpuGraphRenderer` which was removed; also had `"webgpu"` state type incompatible with updated `GraphRenderer.backend` union
- **Fix:** Updated import, ref type, state type, create() call, and canvas visibility class
- **Files modified:** `app/(dashboard)/users/AccUsersGraph.tsx`
- **Note:** Full AccUsersGraph.tsx wiring (container div, toggle UI, physics panel) remains Plan 02-02 scope
- **Commit:** 5d5830b

## Verification Results

- @cosmos.gl/graph version in package.json: `3.0.0-beta.8` (exact, no caret)
- cosmosUtils.ts exists with all 6 exports
- graphRenderers.ts exports CosmosGraphRenderer with backend="cosmos"
- GraphRenderer.backend union is `"canvas2d" | "cosmos"` (not "webgpu")
- `npx tsc --noEmit` passes with no errors
- CosmosGraphRenderer.create() contains `await import("@cosmos.gl/graph")` — no static top-level import
- v3 config keys used: `pointDefaultColor`, `pointDefaultSize`, `linkDefaultColor`, `linkDefaultWidth`, `linkDefaultArrows`
- graph.start() then graph.render() called after `await graph.ready`
- selectNode() uses v3 API (selectPointByIndex/unselectPoints)
- onNodeSelectCallback field present
- Static imports of cosmosUtils at top of graphRenderers.ts

## Self-Check: PASSED
