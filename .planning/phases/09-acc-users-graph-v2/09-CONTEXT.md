# Phase 9: ACC Users Graph v2 — Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Source:** User description (direct requirements)

<domain>
## Phase Boundary

Redesign the ACC Users Graph tab. The graph currently shows three node types (user-instances, project hubs, role hubs) connected by edges. This redesign eliminates hub nodes entirely, fixes the canvas width, and upgrades the filter panel.

**Files in scope:**
- `lib/acc/graphSnapshot.ts` — backend node builder
- `app/(dashboard)/users/AccUsersGraph.tsx` — frontend graph component
- `lib/acc/acc-types.ts` — BulkAccProject/BulkAccUser types
- `server/routers/users.ts` — only if needed to expose lastAdded/individualAccess

</domain>

<decisions>
## Implementation Decisions

### Node Model
- **LOCKED**: Only `instance` nodes (one per user×project). Zero hub nodes for project, role, or module.
- **LOCKED**: Hub nodes (`HubNode` type, `HubTooltip` component, hub-related rendering, edges array) are fully removed from both backend and frontend.
- **LOCKED**: Each instance node is a unique user×project combination — the same person in 3 projects = 3 nodes. This already matches the current `instance` node model; the change is only removing the hubs.

### Spatial Layout — 6 Properties
- **LOCKED**: Node spatial position is determined by similarity across exactly these 6 properties:
  1. **User name** — the display name / first name token
  2. **Project name** — the project the user belongs to
  3. **Role name** — primary role in that project
  4. **Admin access** — `isAdmin` boolean (admin users cluster together)
  5. **Last added** — `addedOn` from the AccUser (when added to the ACC hub; available in cached data)
  6. **Individual access** — derived: `roles.length > 0 || modules.length > 0` meaning the user has been specifically configured with access rights (not just a bare member)
- **LOCKED**: The `computeSemanticPositions` and `applySemanticNodePositions` functions must be updated to incorporate all 6 properties with appropriate weights.
- **LOCKED**: `lastAdded` should be bucketed (e.g., year-month or quarter) for spatial grouping since exact dates don't cluster well.

### Canvas Width Fix
- **LOCKED**: Add a `ResizeObserver` on the `containerRef` that calls `markGraphDirty()` whenever the container dimensions change. This ensures the canvas redraws at the correct size after layout changes (tab switching, window resize).
- **LOCKED**: The outer container in `UsersDirectoryClient` for the graph tab uses `max-w-[1600px] mx-auto`. This is intentional for other tabs. For the graph tab, the graph area itself has `px-6 pb-6 pt-4` padding which is fine. The core issue is the canvas not refreshing its size — the ResizeObserver fix addresses this.

### Filter Panel
- **LOCKED**: Remove the current `FilterMenu` for "Modules" (modules are no longer a filter — they're a layout factor).
- **LOCKED**: Replace with these filters:
  - **Roles** (multi-select pill chips): all roles visible — NO "+more" truncation. `maxVisible` is removed or set to Infinity. Search box stays.
  - **Admin Access** (two-state toggle): "All" / "Admin only" / "Non-admin only"
  - **Individual Access** (two-state toggle): "All" / "Has access config" / "Bare member"
- **LOCKED**: "Project name" and "User name" are NOT filters — they only affect spatial placement.
- **LOCKED**: Modules are NOT a filter. They remain as a spatial layout weight slider.
- **LOCKED**: `GraphFilters` interface replaces `modules: string[]` with `adminAccess: "all" | "admin" | "non-admin"` and `individualAccess: "all" | "configured" | "bare"`.

### Graph Cache
- **LOCKED**: Bump `GRAPH_TOPOLOGY_VERSION` in `graphSnapshot.ts` to force cache invalidation. Old cache with hub nodes will be treated as stale and rebuilt.
- **LOCKED**: Remove `edges` generation from `buildAccGraphSnapshot` (or keep as empty array for schema compatibility). The `AccGraphLayoutCache.edges` field can remain but will be empty.

### Claude's Discretion
- Exact weight values for the new spatial layout properties (lastAdded, individualAccess) — use reasonable defaults based on the existing pattern (role:72, access:38, module:58, project:68).
- Whether to expose `lastAdded` as a new field on `AccGraphInstanceNode` or derive it from the existing `addedOn` field that's already in AccMemberCache.data.
- Color coding strategy: currently "colored by primary role" — keep this behavior.
- The layout weight sliders in the toolbar — update labels from "Role/Access/Modules/Project" to match the new 6 properties.

</decisions>

<specifics>
## Specific Ideas

- `addedOn` is already stored in `AccMemberCache.data` (it's set at line 1099 in `server/routers/users.ts`). It's a string like `"2023-08-15T00:00:00Z"`. Extract year-month bucket: `"2023-08"` for spatial clustering.
- `individualAccess` = `project.roles.length > 0 || project.modules.length > 0`. Users with zero roles AND zero modules are "bare members" — added to a project but given no specific configuration.
- The `graphNodeToSimNode` function in `AccUsersGraph.tsx` handles hub nodes and should be simplified to only handle instance nodes.
- `nodeMatchesFilters` currently checks `node.kind !== "user"` and returns `true` for hubs. Remove that branch.
- The render frame passes `projectIndices`, `roleIndices`, `moduleIndices` to the renderer. These will all be empty arrays after removing hubs — they can stay as empty typed arrays without breaking anything.
- The `SidePanel` has a branch for `node.kind !== "user"` (shows "Connection Hub" content). This branch should be removed.
- `GRAPH_TOPOLOGY_VERSION` is currently `2` — bump to `3`.

</specifics>

<deferred>
## Deferred Ideas

- Force-directed physics simulation (currently uses pre-computed semantic positions only) — not in scope for this phase
- Node clustering/grouping UI (lasso select, group highlight) — future
- Export graph as PNG/SVG — future
- Per-project filter (excluded from this phase per user decision)

</deferred>

---

*Phase: 09-acc-users-graph-v2*
*Context gathered: 2026-04-27 via user description*
