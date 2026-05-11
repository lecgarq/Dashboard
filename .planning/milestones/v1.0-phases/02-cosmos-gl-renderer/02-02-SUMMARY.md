---
phase: 02-cosmos-gl-renderer
plan: "02"
subsystem: graph-renderer
tags: [cosmos.gl, d3-force, web-worker, gpu, sliders, drag, dedicated-gpu]
dependency_graph:
  requires: ["02-01"]
  provides: [d3-force-organic-layout-worker, two-slider-controls, dedicated-gpu-hint]
  affects: [AccUsersGraph.tsx, graphRenderers.ts, accGraphOrganicLayout.worker.ts]
tech_stack:
  added: ["d3-force in worker", "powerPreference monkey-patch on HTMLCanvasElement.getContext"]
  patterns: ["enableSimulation:false → pure GPU renderer", "alphaTarget(0.3) drag pattern from D3 component example", "Float32Array transferable buffers per tick"]
key_files:
  created: []
  modified:
    - app/(dashboard)/users/AccUsersGraph.tsx
    - app/(dashboard)/users/graphRenderers.ts
    - app/(dashboard)/users/accGraphOrganicLayout.worker.ts
decisions:
  - "Cosmos.gl runs with enableSimulation:false — d3-force in worker drives all positions, Cosmos is pure WebGL2 renderer"
  - "Reduced from 5 sliders to 2 (Separation + Cluster) per user request — Repulsion+Spacing merged, Gravity+Stability removed"
  - "Drag stabilization uses D3 component example pattern: alphaTarget(0.3) on drag, alphaTarget(0) on release"
  - "Custom d3 cluster force computes per-cluster centroids from role-derived clusterIds Int32Array, pulls members with alpha-scaled strength"
  - "powerPreference:high-performance hint injected via monkey-patching HTMLCanvasElement.prototype.getContext during graph construction (Cosmos hardcodes luma.gl device creation)"
  - "Explicit graph.render() after every state change in CosmosGraphRenderer.draw() — enableSimulation:false means Cosmos no longer auto-paints"
  - "POST_INTERVAL_MS reduced 33→16 for 60fps target"
metrics:
  completed_date: "2026-04-29"
  files_changed: 3
  verified_in: "Firefox (browser test by user)"
requirements_satisfied: [REND-01, REND-02, REND-03, REND-04]
deferred_to_02_03:
  - "Aggressive separation range — current low/high spread visible but user reports 'not enough'"
  - "Animated cluster transition — current Cluster slider works but lacks the smooth-morph behaviour from cosmos.gl clusters-radial story"
  - "Edge-rendering bug during drag — connection lines disappear when dragged node is far from cluster (link endpoints likely referencing stale frame indices)"
  - "Same-username highlight — when selecting a node, also colorize all other nodes representing the same user"
  - "GPU perf hardening — VRAM allocation tuning, render-loop microbenchmarking against 60fps target"
---

# Phase 02 Plan 02: D3-Force Worker + Cosmos GPU Renderer + 2-Slider UI — Summary

**One-liner:** Replaced Cosmos's built-in physics with d3-force in a Web Worker (per https://observablehq.com/@d3/force-directed-graph-canvas/2), reduced 5 sliders to 2 (Separation + Cluster), wired D3-component-style drag stabilization, and forced dedicated NVIDIA GPU usage via `powerPreference` monkey-patch.

## What Was Built

### accGraphOrganicLayout.worker.ts (modified)
- d3-force `forceSimulation` runs at ~60fps in worker, driving all node positions
- Custom `applyClusterForce(alpha)` — computes per-cluster centroids from `clusterIds: Int32Array`, pulls members toward centroid with `k01 * 0.6 * alpha` strength
- `linkDistance`, `linkStrength`, `collideRadius`, `chargeStrength` all parameterized off Separation + Cluster sliders only
- Drag handler: `simulation.alphaTarget(0.3)`; release: `simulation.alphaTarget(0)` — matches https://observablehq.com/@d3/force-directed-graph-component
- POST_INTERVAL_MS = 16 for 60fps Float32Array snapshot posting

### AccUsersGraph.tsx (modified)
- Cluster IDs derived from `nodes[i].roles?.[0]` mapped to integer cluster index, posted to worker via transferable Int32Array
- UI reduced from 5 to 2 sliders: **Separation** (semantic-similarity-driven node distance) + **Cluster** (0=organic blob, 100=role-grouped)
- Removed Repulsion / Spacing / Gravity / Stability sliders

### graphRenderers.ts (modified)
- `CosmosGraphRenderer.draw()` now explicit-renders: tracks `lastNodeCount`/`lastPositions`, calls `graph.render()` whenever any setter dirties state, calls `graph.fitView(600)` on first-load
- `CosmosGraphRenderer.create()` monkey-patches `HTMLCanvasElement.prototype.getContext` to inject `{ powerPreference: "high-performance" }` for `webgl2`/`webgl` contexts during Graph construction; restored in `finally` — forces dedicated NVIDIA GPU on dual-GPU laptops

## User Verification (Firefox)

| Check | Result |
|-------|--------|
| Reload — no white flash | ✓ pass |
| Separation slider responds | ✓ pass (range insufficient → 02-03) |
| Cluster slider responds | ✓ pass (animation insufficient → 02-03) |
| Drag stabilizes smoothly | ✓ pass (edges drop out → 02-03 bug) |
| GPU = NVIDIA (not Intel) | ✓ pass (`ANGLE (NVIDIA, ...)`) |

## Deferred to 02-03

See frontmatter `deferred_to_02_03`. Five items: aggressive layout range, animated cluster transition, edge-render-during-drag bug, same-username multi-instance highlight, GPU perf hardening.

## Self-Check: PASSED (with deferred follow-ups documented)
