# Architecture Research

**Domain:** WebGL graph module integration into Next.js 16 App Router with tRPC
**Researched:** 2026-04-28
**Confidence:** HIGH — derived entirely from reading the actual codebase, not training data assumptions

---

## Critical Upfront Finding: Module Is Already Substantially Built

Before any architecture decisions are made, the actual state of the codebase must be acknowledged. The ACC Users Graph module is **not a greenfield integration** — it is approximately 80% complete and running. The following is already in production at `app/(dashboard)/users/`:

| File | Status | What It Does |
|---|---|---|
| `AccUsersGraph.tsx` | Complete (1421 lines) | Full WebGL canvas component with pan/zoom/pick/filter/side panel |
| `graphRenderers.ts` | Complete | `CanvasGraphRenderer` (Canvas 2D) + stub `WebGpuGraphRenderer` |
| `accGraphOrganicLayout.ts` | Complete | Client-side physics types, topology graph builder, seed position engine |
| `accGraphOrganicLayout.worker.ts` | Complete | Web Worker running force-directed layout off the main thread |
| `accGraphTopology.test.ts` | Present | Vitest topology test |
| `lib/acc/graphSnapshot.ts` | Complete | Server-side snapshot builder: ACC cache rows → typed node array |
| `lib/acc/graphSimulation.ts` | Complete | Server-side grid-based O(n×k) force simulation (150 iterations) |
| `lib/acc/compactionAnalysis.ts` | Present | Permission compaction analysis |
| `server/routers/users.ts` | Complete | All tRPC procedures exist: `getPrecomputedGraph`, `rebuildAccGraphCache`, `bulkAccSync` |
| `prisma/schema.prisma` | Complete | `AccMemberCache`, `AccHubRoleCache`, `AccGraphLayoutCache` models |

**The research question is therefore not "how to build this" but "what is the integration shape of what exists, what gaps remain, and what the correct build order is for the remaining work."**

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      Next.js App Router                          │
│  app/(dashboard)/users/page.tsx  (RSC — metadata + Suspense)    │
├─────────────────────────────────────────────────────────────────┤
│  UsersDirectoryClient.tsx  ("use client" — tab shell)           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ AccAnalysis  │  │ AccOverview  │  │   AccUsersGraph.tsx   │  │
│  │   Panel      │  │    Tab       │  │  ("use client" leaf)  │  │
│  └──────────────┘  └──────────────┘  └───────────┬───────────┘  │
│                                                   │              │
│        ┌──────────────────────────────────────────┤              │
│        │  useRef<HTMLCanvasElement> (canvas2dRef)  │              │
│        │  useRef<HTMLCanvasElement> (webgpuRef)    │              │
│        │  useRef<Worker> (organicWorkerRef)        │              │
│        └──────────────────────────────────────────┘              │
├─────────────────────────────────────────────────────────────────┤
│                     Web Worker Thread                            │
│  accGraphOrganicLayout.worker.ts                                 │
│  Receives: init / tick / drag / release / controls / stop msgs  │
│  Sends:    tick (Float32Array positions) / links arrays          │
├─────────────────────────────────────────────────────────────────┤
│                       tRPC Layer                                 │
│  server/routers/users.ts → usersRouter                          │
│  ┌────────────────────┐  ┌──────────────────────────────────┐   │
│  │ getPrecomputedGraph│  │ rebuildAccGraphCache (mutation)  │   │
│  │ (query, adminOnly) │  │ bulkAccSync (mutation, adminOnly)│   │
│  └────────────────────┘  └──────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                    Server-Side Data Layer                        │
│  lib/acc/graphSnapshot.ts   — AccMemberCache rows → AccGraphNode[]│
│  lib/acc/graphSimulation.ts — Server-side force sim (150 iters) │
│  lib/server/acc-admin.ts    — APS SDK calls to ACC Admin API    │
├─────────────────────────────────────────────────────────────────┤
│              PostgreSQL via Prisma                               │
│  AccMemberCache (email → JSON blob)                             │
│  AccGraphLayoutCache (singleton: nodes, positions[], nodeIds[]) │
│  AccHubRoleCache (singleton: hub role list)                     │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation Pattern |
|---|---|---|
| `page.tsx` | RSC shell, metadata, Suspense boundary | Next.js App Router RSC |
| `UsersDirectoryClient.tsx` | Tab navigation, loads `bulkAccSummary`, passes `users` down | `"use client"`, tRPC query |
| `AccUsersGraph.tsx` | Canvas owner, RAF loop, hit testing, filter state, side panel | `"use client"`, two `<canvas>` elements |
| `graphRenderers.ts` | Renderer abstraction (`CanvasGraphRenderer` / `WebGpuGraphRenderer`) | Class-based renderer interface |
| `accGraphOrganicLayout.worker.ts` | Off-thread force-directed physics | Web Worker, message protocol |
| `accGraphOrganicLayout.ts` | Shared types + topology graph builder + seed position engine | Imported by both component and worker |
| `lib/acc/graphSnapshot.ts` | Builds typed `AccGraphNode[]` from `AccMemberCache` rows | Server-only, pure function |
| `lib/acc/graphSimulation.ts` | Server-side initial layout (reduces cold-start layout time) | Server-only, grid O(n×k) physics |
| `server/routers/users.ts` | tRPC procedures for all ACC data | adminProcedure guards |

---

## Recommended Project Structure

The existing structure already follows the correct pattern. The complete file tree for the graph module is:

```
app/(dashboard)/users/
├── page.tsx                          # RSC — metadata, Suspense shell
├── loading.tsx                       # Route-level skeleton
├── UsersDirectoryClient.tsx          # "use client" — tab shell, bulkAccSummary query
├── AccUsersGraph.tsx                 # "use client" — canvas owner (1421 lines, complete)
├── AccAnalysisPanel.tsx              # "use client" — sync panel, BulkAccUser type
├── AccOverviewTab.tsx                # Tab view
├── AccRolesTab.tsx                   # Tab view
├── AccCompactionTab.tsx              # Tab view
├── AccCompactionTable.tsx            # Sub-component
├── AccInsightCard.tsx                # Sub-component
├── AccProfileSection.tsx             # Per-user profile
├── AccUserSidePanel.tsx              # User detail drawer
├── accGraphOrganicLayout.ts          # Shared types + topology builder + seed positions
├── accGraphOrganicLayout.worker.ts   # Web Worker — real-time physics loop
├── accGraphTopology.test.ts          # Vitest topology test
└── graphRenderers.ts                 # CanvasGraphRenderer + WebGpuGraphRenderer stub

lib/acc/
├── acc-types.ts                      # Shared ACC type definitions
├── graphSnapshot.ts                  # Server: AccMemberCache rows → AccGraphNode[]
├── graphSimulation.ts                # Server: grid force sim for initial layout
├── compactionAnalysis.ts             # Permission compaction analysis
└── modules.ts                        # ACC module label map

server/routers/
└── users.ts                          # All tRPC procedures including graph endpoints
```

No new directories need to be created. The module does not live under `acc-users-graph/` — it is colocated at `users/` alongside the existing users directory functionality.

---

## Architectural Patterns

### Pattern 1: SSR Boundary via "use client" Directive (Not Dynamic Import)

**What:** The graph canvas is a leaf `"use client"` component imported statically into another client component (`UsersDirectoryClient`). No `dynamic(() => import(...), { ssr: false })` wrapper is used.

**When to use:** When the parent component is already a client component. Dynamic import with `ssr: false` is only necessary when a WebGL component is imported from an RSC (server component). Here, `UsersDirectoryClient` has `"use client"` at its top, so it never SSRs its subtree.

**Why it works:** Next.js App Router only SSRs subtrees rooted in RSC. Once a component has `"use client"`, its entire import tree is treated as client-only. `AccUsersGraph` safely uses `useRef`, `useEffect`, `window`, `Worker`, and `HTMLCanvasElement` without any additional SSR guard.

**Trade-off:** If the `users/` page ever becomes a pure RSC route, a `dynamic` import wrapper would be required. The current design avoids wrapper complexity at the cost of this future constraint.

### Pattern 2: Dual-Canvas with Renderer Abstraction

**What:** Two `<canvas>` elements exist in the DOM simultaneously — one for Canvas 2D (`canvas2dRef`) and one for WebGPU (`webgpuCanvasRef`). Only one is visible at a time via `opacity-0 pointer-events-none`. The active renderer is held in `activeRendererRef`.

**When to use:** When progressive enhancement is needed. Canvas 2D is always available; WebGPU is attempted asynchronously and falls back gracefully. Currently `WebGpuGraphRenderer.create()` always returns `null` with a reason string — it is a stub for future GPU acceleration.

**Key implementation detail:**
```typescript
// Both canvases receive the same pointer events — they're overlaid absolutely.
// The inactive one has pointer-events: none so events always reach the active one.
// CSS opacity swap is instantaneous; no re-mount cost.
const renderCanvasClass = cn(
  "absolute inset-0 block w-full h-full",
  isDraggingState ? "cursor-grabbing" : ...
);
```

### Pattern 3: useRef-Heavy State for Animation Loop

**What:** All state that changes every frame (positions, view transform, hit-test grid, selected node) is stored in `useRef`, not `useState`. Only UI-visible state that warrants a React re-render uses `useState`.

**When to use:** For any WebGL/canvas render loop driven by `requestAnimationFrame`. React's reconciler is not involved in per-frame rendering.

**Canonical separation in `AccUsersGraph.tsx`:**

| useRef (no re-render) | useState (triggers re-render) |
|---|---|
| `posRef` — Float32Array positions | `hoveredNode` — tooltip content |
| `view`, `targetView` — pan/zoom | `selectedNode` — side panel |
| `nodesRef` — sim node array | `filters` — filter UI state |
| `gridRef` — spatial hash | `isReady` — loading overlay |
| `linksRef` — edge arrays | `graphControls` — slider values |
| `selectedNodeRef` — sync with RAF | `renderBackend` — backend indicator |
| `organicWorkerRef` — Worker handle | `motionMetric` — velocity display |

### Pattern 4: Web Worker Message Protocol for Physics

**What:** The organic layout worker runs a continuous force-directed simulation. The main thread sends typed messages; the worker transfers `Float32Array` position buffers back via `postMessage(data, [buffer])` for zero-copy transfer.

**Message types (main → worker):**
- `init` — full graph topology, positions (transferred buffer), controls
- `visibility` — which node indices are visible (filter changes)
- `controls` — updated physics sliders
- `drag` — node being manually dragged (x, y)
- `release` — node released from drag
- `pause` / `stop`

**Message types (worker → main):**
- `tick` — updated `Float32Array` positions (transferred), velocity metric, diagnostics
- `links` — `Int32Array` source/target pairs for edge rendering

**Why transferable buffers:** At 500+ nodes the position array is 1000+ floats. Zero-copy transfer via `ArrayBuffer` detach/reattach avoids serialization overhead every tick.

### Pattern 5: Precomputed Server-Side Layout Cache

**What:** When the graph cache is cold or stale, `rebuildAccGraphCache` on the server runs `buildAccGraphSnapshot` (AccMemberCache → AccGraphNode[]) followed by `runSimulation` (150 grid-based force iterations) and persists the result in `AccGraphLayoutCache`. The client reads positions from this cache via `getPrecomputedGraph`, skipping initial layout thrashing.

**Data flow for cache build:**
```
adminProcedure.mutation (rebuildAccGraphCache)
  → db.accMemberCache.findMany()           — all member rows
  → buildAccGraphSnapshot(rows)            — typed node array + data hash
  → runSimulation(physicsNodes, edges)     — 150-iter server-side force sim
  → normalizeAccGraphPositions(nodes)      — [0,1] normalized Float[]
  → sanitize + validate                   — guard against NaN/Infinity
  → db.accGraphLayoutCache.upsert()       — singleton row
```

**Cache validity check** in `getPrecomputedGraph`: dataHash + nodeCount + edgeCount + instanceCount + projectCount + nodeIds.length + positions.length must all match. Any mismatch returns `hit: false` and the client shows a "Rebuild" prompt.

### Pattern 6: APS API → tRPC → Typed Graph Data Flow

**What:** ACC user data originates from the Autodesk Platform Services Admin API and is cached locally. The tRPC layer bridges APS data to typed graph structures.

**Full data pipeline:**
```
APS Admin API (HTTPS)
  fetchAllAccUsers(accountId, token)    — single hub sweep, email→user map
  fetchAccUserProjects(...)             — per-user project list
  fetchAccUserRoles(...)                — per-user role map
  fetchAccUserProducts(...)             — per-user module/product map
        ↓  (pLimit(3) concurrency)
  db.accMemberCache.upsert()           — JSON blob per email, 1hr TTL
        ↓
  buildAccGraphSnapshot(rows)          — AccMemberCache[] → AccGraphNode[]
        ↓  (normalized Float[])
  db.accGraphLayoutCache.upsert()      — singleton with positions[]
        ↓
  tRPC getPrecomputedGraph (query)
        ↓  (JSON over HTTP)
  AccUsersGraph component
    graphQuery.data.nodes              — AccGraphNode[]
    graphQuery.data.positions          — number[] → Float32Array
    graphQuery.data.nodeIds            — string[] for order verification
```

**Key type: `AccGraphNode` (from `lib/acc/graphSnapshot.ts`):**
```typescript
interface AccGraphInstanceNode {
  kind: "instance";
  id: string;           // "instance:{email}:{projectId}"
  email: string;
  name: string;
  label: string;
  projectId: string;
  projectName: string;
  isAdmin: boolean;
  roles: string[];
  modules: string[];
  lastAddedBucket: string;  // "YYYY-MM" or ""
  individualAccess: boolean;
  color: string;            // deterministic from primaryRole
  x: number; y: number; vx: number; vy: number;
}
```

**Positions format:** `Float[]` (Prisma) / `number[]` (tRPC JSON) containing `[x0, y0, x1, y1, ...]` normalized to [0,1]. The client converts with `new Float32Array(rawPositions)`.

---

## Data Flow

### Graph Render Loop (per frame, ~60fps)

```
requestAnimationFrame callback
    ↓
  Check: camLerping || needsRenderRef || forceRenderUntil?
    → NO → skip frame (dirty-flag pattern, not continuous redraw)
    → YES ↓
  Lerp view.current toward targetView (0.2 factor smooth camera)
  Build GraphRenderFrame {nodes, positions, userIndices, links, view, ...}
  activeRendererRef.current.draw(frame)
    → CanvasGraphRenderer.draw(frame)
       1. Resize canvas if DPR changed
       2. Clear background
       3. Draw edges (subtle gray lines, very low alpha)
       4. Batch nodes by color → drawImage sprite (circle, 8px radius cache)
       5. Draw selected node ring + highlight
    → returns { needsContinuousRedraw }
  needsRenderRef.current = result || camLerping || forceLive
```

### Filter State Flow

```
User toggles filter chip (setFilters)
    ↓
useEffect [filters] fires
    ↓
filtersRef.current = filters  (sync ref for RAF access)
rebuildVisibleIndices()
    → nodeMatchesFilters(node, filters) for each node
    → rebuild instIdxRef, visibleNodeIdxRef, visibleIndexSetRef
    → rebuildGrid() — spatial hash for hit testing
    → postVisibilityToWorker() — worker skips hidden nodes in physics
    → markGraphDirty()
```

### Graph State: What Lives Where

| State | Location | Why |
|---|---|---|
| Node positions | `posRef` (Float32Array, mutated by worker messages) | Zero allocation per frame |
| View transform | `view`, `targetView` (plain objects in ref) | RAF-only, no React |
| Selected node | Dual: `selectedNodeRef` (RAF sync) + `selectedNode` useState (side panel React) | Both needed |
| Filter values | `filtersRef` (RAF read) + `filters` useState (UI controlled) | Both needed |
| Graph controls | `graphControlsRef` + `graphControls` useState | Both needed |
| Worker handle | `organicWorkerRef` | Cleanup in useEffect return |
| Renderer | `activeRendererRef`, `canvasRendererRef`, `webgpuRendererRef` | Fallback switching |

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|---|---|
| 0–500 nodes (current target) | Canvas 2D with sprite batching by color; Web Worker for physics; client-side spatial grid for hit test. Current implementation handles this. |
| 500–2000 nodes | Current architecture holds. The `visibleNodeIdxRef` filter system already reduces render load. Sprite cache (color → offscreen canvas) is the key optimization. |
| 2000–5000 nodes | WebGPU renderer (stub exists, needs WGSL shader implementation). Instanced rendering via GPU replaces per-node drawImage calls. The abstraction is already in place. |
| 5000+ nodes | Level-of-detail: render clusters at low zoom, expand on zoom-in. The `visibleWorldBounds` frustum culling already exists in the renderer. |

### Scaling Priorities for Current Milestone

1. **First bottleneck:** Canvas 2D `drawImage` per node at 500+ nodes. Already mitigated by sprite caching and batching by color. Benchmark before assuming it is a problem.
2. **Second bottleneck:** Worker tick → main thread message rate. Already addressed: positions transferred as `ArrayBuffer`, metrics throttled to 250ms updates.
3. **Third bottleneck:** `getPrecomputedGraph` query response size. Nodes array at 500 instances is manageable JSON (~200KB). At 5000 nodes, binary encoding would be warranted — not needed for v1.0.

---

## Anti-Patterns

### Anti-Pattern 1: Wrapping AccUsersGraph in dynamic() for SSR

**What people do:** Add `dynamic(() => import('./AccUsersGraph'), { ssr: false })` thinking WebGL requires it.

**Why it's wrong:** `UsersDirectoryClient` already has `"use client"`. Its entire import subtree is client-only. Adding `dynamic` introduces an unnecessary lazy chunk, a loading flash, and splits the module graph for no benefit.

**Do this instead:** Import `AccUsersGraph` statically. The `"use client"` boundary on the parent is sufficient SSR protection.

### Anti-Pattern 2: Storing canvas positions in React state

**What people do:** `const [positions, setPositions] = useState(new Float32Array(...))` and calling `setPositions` on every physics tick.

**Why it's wrong:** Every `setState` triggers a React reconcile. At 60fps with 500+ nodes, this causes ~60 reconciles/second, making the UI unusable.

**Do this instead:** Store positions in `useRef` (`posRef`). React state is only for values that must trigger a re-render of JSX (hover tooltip content, side panel visibility, filter UI).

### Anti-Pattern 3: Running physics on the main thread

**What people do:** Call `requestAnimationFrame`, run force simulation, then draw — all in the same callback.

**Why it's wrong:** Physics computation for 500+ nodes at 60fps easily exceeds the 16ms frame budget, causing jank.

**Do this instead:** Run physics in a Web Worker (already done via `accGraphOrganicLayout.worker.ts`). The worker ticks at its own rate and posts updated positions. The RAF loop on the main thread only reads the latest positions, never blocks.

### Anti-Pattern 4: Fetching ACC data in the graph component

**What people do:** Call `trpc.users.getAccProfile.useQuery()` inside `AccUsersGraph` for each user, or fire `bulkAccSync` from the graph tab.

**Why it's wrong:** The graph component already has the node list passed as a `users` prop from `AccAnalysisPanel`/`UsersDirectoryClient`, which holds the `bulkAccSummary` query. The graph reads the precomputed cache via `getPrecomputedGraph`. Adding APS API calls in the graph component would duplicate fetching and violate the data ownership boundary.

**Do this instead:** Keep data fetching in `UsersDirectoryClient`. The graph receives `users: BulkAccUser[]` as a prop and uses only `getPrecomputedGraph` (a fast DB read) to load positions.

### Anti-Pattern 5: Rebuilding the graph cache on every page load

**What people do:** Add `refetchOnMount: true` or trigger `rebuildAccGraphCache` automatically when the graph mounts.

**Why it's wrong:** Rebuilding requires reading all `AccMemberCache` rows, running 150 physics iterations, and writing to `AccGraphLayoutCache`. At 500+ users this takes 1–5 seconds server-side. The `bulkAccSync` that populates the cache also optionally rebuilds on completion.

**Do this instead:** Show the "Rebuild Graph Cache" prompt only when `getPrecomputedGraph` returns `hit: false` (cache miss or stale). Let the admin trigger rebuild manually. The `bulkAccSync` mutation already accepts `rebuildGraphCache: boolean`.

---

## Integration Points

### New Files vs Modified Files

**No new routes or directories are needed for the graph module itself** — it is already colocated at `app/(dashboard)/users/`. What remains is filling gaps within the existing files.

| File | Status | What Remains |
|---|---|---|
| `app/(dashboard)/users/AccUsersGraph.tsx` | Complete | Cosmos.gl integration (if replacing current canvas renderer) |
| `app/(dashboard)/users/graphRenderers.ts` | Functional | `WebGpuGraphRenderer` is a stub — real WGSL implementation is a future phase |
| `app/(dashboard)/users/accGraphOrganicLayout.worker.ts` | Needs reading | Physics worker implementation completeness unknown from this read |
| `lib/acc/graphSnapshot.ts` | Complete | No changes needed |
| `lib/acc/graphSimulation.ts` | Complete | No changes needed |
| `server/routers/users.ts` | Complete | All graph procedures exist |
| `components/layout/navigation.ts` | Complete | `/users` route already in nav |

### Cosmos.gl Specific Integration Note

The current implementation uses a **custom Canvas 2D renderer** (`CanvasGraphRenderer`) and a **custom force-directed physics engine** (`graphSimulation.ts` + `accGraphOrganicLayout.worker.ts`) — not Cosmos.gl. If the milestone requires replacing these with the Cosmos.gl library:

- Cosmos.gl's `Graph` class manages its own WebGL context and canvas. It expects node/link arrays in its own format, not `Float32Array` position buffers.
- The existing `GraphRenderer` abstraction interface would need a `CosmosGraphRenderer` implementation that wraps Cosmos.gl's `Graph` instance.
- The worker-based physics would be replaced by Cosmos.gl's internal GPU simulation.
- The `useRef<HTMLCanvasElement>` pattern is compatible: Cosmos.gl accepts a canvas element reference.
- SSR: No change needed. The existing `"use client"` boundary is sufficient.

If the milestone is instead to **augment** the existing renderer with Cosmos.gl features (e.g., use Cosmos.gl for node rendering while keeping the custom physics), the `GraphRenderer` abstraction already supports this pattern cleanly.

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| APS Admin API | 2-legged OAuth token (app credentials), paginated REST | `lib/server/acc-admin.ts` handles all calls; token cached per process |
| PostgreSQL | Prisma ORM | `AccMemberCache`, `AccGraphLayoutCache`, `AccHubRoleCache` models exist |
| tRPC | HTTP batch over `/api/trpc` | `adminProcedure` guards all graph endpoints |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| `AccUsersGraph` ↔ Worker | `postMessage` / `onmessage` + transferable ArrayBuffers | Session ID guards against stale messages |
| `AccUsersGraph` ↔ tRPC | `trpc.users.getPrecomputedGraph.useQuery()` + `rebuildAccGraphCache.useMutation()` | `staleTime: Infinity` — no background refetch |
| `UsersDirectoryClient` → `AccUsersGraph` | `users: BulkAccUser[]` prop | Data ownership lives in the parent |
| `server/routers/users.ts` → `lib/acc/` | Direct import (same process) | Not a network boundary |

---

## Build Order Recommendation

Given the existing state, the correct sequencing for remaining milestone work is:

1. **Verify worker completeness** — Read `accGraphOrganicLayout.worker.ts` in full. Confirm the physics loop handles `init`, `tick`, `drag`, `release`, `controls`, `visibility`, `pause`, `stop`. This is the most likely source of remaining gaps.

2. **Verify Cosmos.gl requirement** — Determine if the milestone requires Cosmos.gl the library or if the existing custom renderer is acceptable. The existing system already satisfies all stated requirements (WebGL-class performance via Canvas 2D sprites + worker physics). Cosmos.gl adds GPU instancing but also adds a dependency and a rewrite of `graphRenderers.ts`.

3. **Complete `WebGpuGraphRenderer`** — The stub returns `null` always. For 500+ node production performance, a real GPU renderer is the highest-leverage remaining work. This can be Cosmos.gl or a custom WebGPU implementation.

4. **Label rendering** — The `getFirstName`/`label` field exists on `AccGraphNode` but no label rendering appears in `CanvasGraphRenderer.draw()`. Selective labels at high zoom are a stated requirement.

5. **Topology test coverage** — `accGraphTopology.test.ts` exists but test content was not read. Verify coverage of the `buildAccTopologyGraph` function used by the worker.

6. **E2E smoke test** — Verify the full pipeline: `bulkAccSync` → `AccGraphLayoutCache` row → `getPrecomputedGraph` returns `hit: true` → canvas renders nodes.

---

## Sources

- Direct codebase reading: `app/(dashboard)/users/AccUsersGraph.tsx` (1421 lines)
- Direct codebase reading: `server/routers/users.ts` (1419 lines)
- Direct codebase reading: `lib/acc/graphSnapshot.ts`, `lib/acc/graphSimulation.ts`
- Direct codebase reading: `app/(dashboard)/users/graphRenderers.ts`
- Direct codebase reading: `app/(dashboard)/users/accGraphOrganicLayout.ts`
- Direct codebase reading: `prisma/schema.prisma` (AccMemberCache, AccGraphLayoutCache models)
- Direct codebase reading: `next.config.ts`, `components/layout/navigation.ts`

---
*Architecture research for: ACC Users Graph module in Next.js 16 App Router + tRPC 11*
*Researched: 2026-04-28*
