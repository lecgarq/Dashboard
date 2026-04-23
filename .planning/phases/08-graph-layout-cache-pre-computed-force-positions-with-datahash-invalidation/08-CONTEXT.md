# Phase 8: Graph Layout Cache — pre-computed force positions with dataHash invalidation - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Pre-compute and persist the force-directed graph node positions from `AccUsersGraph.tsx` so the graph loads instantly on repeat visits. A `dataHash` derived from the full `AccMemberCache` dataset invalidates the cache whenever ACC data changes. The graph rendering logic, visual style, filters, and user interactions are unchanged — this phase only adds a cache layer beneath the existing simulation.

</domain>

<decisions>
## Implementation Decisions

### Cache storage location
- Store pre-computed positions in the database (new Prisma model), not localStorage
- One global shared cache row — all users and devices share the same layout
- No per-user personalization of node positions
- When a valid cache exists, apply positions as an instant snap (no animation from random)
- Expose a "Refresh Layout" button in the graph toolbar for manual cache invalidation

### Invalidation strategy
- `dataHash` computed from the full `AccMemberCache` row content (all fields: email, projectId, roles, modules, etc.)
- Cache is invalidated when any field in any row changes — most thorough approach
- New layout computed lazily: on the first graph tab open after invalidation (not during sync)
- No TTL — cache validity is determined purely by `dataHash` comparison
- "Refresh Layout" button also forces cache regeneration regardless of hash match

### Cold cache experience
- When no valid cache exists: show the live force simulation running and settling (current behavior)
- Once the simulation settles, silently write positions to the DB in the background — no UI notification
- The "Refresh Layout" button: shows a spinner on the button + resets the graph and replays the live simulation, then saves the new positions
- No toast or confirmation after silent background saves

### Filter sensitivity
- Cache stores only one layout: all nodes (instance, user, role, module)
- Filter toggles (show roles, show modules) simply hide/show nodes from the same cached positions — no separate cached layout per filter state
- Cached positions loaded immediately when the graph tab mounts, before any user interaction

### Claude's Discretion
- Prisma model schema design (table name, column types for position storage)
- tRPC endpoint design (getGraphLayout / saveGraphLayout mutations)
- How the dataHash is computed (e.g., crypto hash of JSON.stringify of sorted rows)
- Error handling if the DB write fails (silent failure acceptable — next load runs simulation again)

</decisions>

<specifics>
## Specific Ideas

- The existing `normalizePositions()` function in `AccUsersGraph.tsx` already outputs a `Float32Array` of `[x, y]` pairs — this is the data to cache
- The cache read should happen before `runSimulation()` is called, short-circuiting the simulation entirely on a cache hit
- The `dataHash` should be computed server-side (not client-side) to avoid sending all ACC data to the browser just to hash it

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-graph-layout-cache-pre-computed-force-positions-with-datahash-invalidation*
*Context gathered: 2026-04-23*
