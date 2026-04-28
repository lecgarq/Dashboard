# Research Summary: ACC Users Graph — Cosmos Graph Visualization Engine

**Milestone:** v1.0 — ACC Users Graph
**Researched:** 2026-04-28
**Confidence:** HIGH — architecture findings grounded in direct codebase reading

---

## Critical Discovery: Module Is ~80% Built

The ACC Users Graph module at `app/(dashboard)/users/` is already substantially implemented. This milestone is **completion and hardening**, not a greenfield build.

### What Exists

| Component | State | Lines |
|---|---|---|
| `AccUsersGraph.tsx` | Complete — Canvas 2D, pan/zoom, filters, side panel, worker | 1421 |
| `graphRenderers.ts` | Functional — Canvas 2D renderer + WebGPU **stub** | — |
| `accGraphOrganicLayout.worker.ts` | Complete — off-thread force physics | — |
| `lib/acc/graphSnapshot.ts` | Complete — APS data → typed node array | — |
| `lib/acc/graphSimulation.ts` | Complete — 150-iter server-side force sim | — |
| `server/routers/users.ts` | Complete — `getPrecomputedGraph`, `rebuildAccGraphCache`, `bulkAccSync` | 1419 |
| Prisma models | Complete — `AccMemberCache`, `AccHubRoleCache`, `AccGraphLayoutCache` | — |

### Key Gaps Remaining

1. **`WebGpuGraphRenderer` is a stub** — always returns `null`; no GPU acceleration
2. **Node labels not rendered** — `label` field exists on `AccGraphNode` but `CanvasGraphRenderer.draw()` renders no labels at any zoom level
3. **Production worker build unverified** — `new URL('./worker.ts', import.meta.url)` works in Turbopack dev but has known breakage in webpack production builds
4. **`b.` hub ID stripping is inline at 3+ call sites** — latent footgun for any new ACC endpoint
5. **Physics auto-pause not implemented** — worker runs continuously even when graph is stable
6. **Filter/side panel overlap at <1280px viewports** — both positioned top-right

---

## Stack

**One new production dependency:** `@cosmos.gl/graph@^2.6.4` — IF the milestone goal is to replace the custom Canvas 2D renderer with the Cosmos.gl GPU renderer. If the goal is to complete/harden the existing custom renderer, **no new packages are needed**.

**SSR:** No change needed. `UsersDirectoryClient.tsx` already has `"use client"`, making its entire subtree client-only. No `dynamic(ssr: false)` wrapper required.

**Typed arrays:** The existing pipeline already produces `Float32Array` positions. Cosmos.gl would consume the same format.

---

## Feature Priorities

### v1.0 Table Stakes (Mostly Done)
- Four node types rendered distinctly ✓ (exists)
- Pan and zoom ✓ (exists)
- Hover tooltip ✓ (exists)
- Click-to-select with neighbor highlight ✓ (exists)
- Filter panel by node type and role ✓ (exists)
- Sidebar detail panel on select ✓ (exists)
- Node count summary ✓ (exists)
- Legend ✓ (exists)
- **Selective label rendering by zoom level** ✗ (gap — label field exists, rendering missing)

### v1.x Differentiators
- Physics simulation controls (sliders) — Cosmos.gl or custom controls
- Duplicate role detector — HIGH value, HIGH complexity, requires data join
- Inconsistent access pattern flagging — requires same data as duplicate detector
- Export PNG — medium effort, enterprise value
- Export CSV — low effort once filter state is established

### Out of Scope
- Real-time sync / webhooks
- Permission editing from graph
- Folder-level permission nodes
- Cluster by project (Cosmos.gl v3 clustering not stable)

---

## Critical Decision for Requirements

**The milestone name says "Cosmos.gl" — but the implementation question is:**

> **Option A: Complete & Harden** — Fix the gaps in the existing Canvas 2D + custom physics system. Add labels, verify production build, extract `getAccountId()`, add auto-pause, fix UI overlaps.

> **Option B: Integrate Cosmos.gl** — Replace `WebGpuGraphRenderer` stub and/or `CanvasGraphRenderer` with Cosmos.gl's `Graph` class. The `GraphRenderer` abstraction already supports adding a `CosmosGraphRenderer`. GPU-instanced rendering handles 500–5000 nodes.

Option A is 1–2 phases of focused work. Option B is 2–3 phases with a rewrite of `graphRenderers.ts`. Both are valid — this must be clarified before defining requirements.

---

## Pitfall Summary

| Pitfall | Risk Level | Phase |
|---|---|---|
| Worker buffer aliasing after transfer | HIGH (silent data corruption) | Foundation |
| Canvas context leak on navigation | HIGH (blank canvas after 8 navigations) | Foundation |
| Production worker build failure | HIGH (graph silent fails in prod) | Foundation |
| `b.` hub ID strip missing on new endpoints | MEDIUM (403 errors) | Backend |
| Non-finite positions bypassing sanitization | MEDIUM (physics diverges) | Data pipeline |
| ACC sync timeout on large hubs | MEDIUM (Railway timeout) | Data pipeline |

---

## Recommended Phase Order

1. **Foundation** — production worker build, renderer destroy on nav, `getAccountId()` helper, existing test validation
2. **Label Rendering** — zoom-level label thresholding in `CanvasGraphRenderer`
3. **GPU Renderer** (if Option B chosen) — Cosmos.gl `CosmosGraphRenderer` implementing the existing `GraphRenderer` interface
4. **Analysis** — duplicate role detector, inconsistent access flagging
5. **Polish** — physics auto-pause, filter/panel overlap fixes, export PNG/CSV

---
*Research synthesized: 2026-04-28*
*Sources: 4 parallel research agents — STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md*
