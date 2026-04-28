# Feature Research

**Domain:** Permission/access graph visualization — ACC Users Graph module
**Researched:** 2026-04-28
**Confidence:** MEDIUM (ACC data model HIGH via official APS docs; Cosmos.gl capabilities HIGH via GitHub/OpenJS; UX patterns MEDIUM via Cambridge Intelligence and peer-reviewed sources)

---

## ACC Data Model Context

Before feature discussion, the entity model determines what node types and edge types exist. The ACC Admin API exposes:

- **Users** — individual members, identified by `userId`, carry `email`, `name`, `company`, `status`
- **Projects** — each user can belong to many projects; the API returns a `projectIds` array per user-role pair
- **Roles** — custom and default roles per account; `GET accounts/{accountId}/users/{userId}/roles` returns all roles with their active project list
- **Products/Modules** — ACC services (Build, Docs, Cost, etc.); `GET accounts/{accountId}/users/{userId}/products` returns per-user product entitlements with project scope
- **Permission levels** — folder-level permissions exist as a separate concern (document management); role-based and company-based access are the primary graph-level entities

The graph therefore has four canonical node types (User, Project, Role, Module/Product) and three canonical edge types (User→Project membership, User→Role assignment, Role→Module entitlement). This is the foundation every feature must serve.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in any access visualization tool. Missing these makes the graph feel unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Four node types rendered distinctly** — User, Project, Role, Module | Without visual distinction users cannot parse graph at a glance; every access viz tool does this | LOW | Use different colors per node type via `nodeColor` Float32Array in Cosmos.gl; shapes require custom sprite textures |
| **Three edge types with direction** — membership, role assignment, entitlement | Direction encodes "who has access to what"; undirected edges hide the access hierarchy | LOW | Cosmos.gl `links` config supports `linkColor` and `linkWidth`; arrowheads require custom overlay (Cosmos renders lines, not arrows natively) |
| **Pan and zoom** | Universal expectation for any canvas-based visualization; users need to navigate large graphs | LOW | Cosmos.gl provides built-in scroll-to-zoom and click-drag pan |
| **Hover tooltip** | Users need identity confirmation before clicking; hovering to see name/email/role is assumed | LOW | `onPointMouseOver` callback in Cosmos.gl returns node index; look up data by index and render a React overlay |
| **Click-to-select a node with neighbor highlight** | Standard in every graph tool (Neo4j Browser, Gephi, Linkurious, Teleport Graph Explorer); shows connected nodes | MEDIUM | `onPointClick` callback; dim non-neighbors by updating `pointOpacity` Float32Array; requires neighbor lookup in typed-array data structure |
| **Filter panel: filter by node type** | Users managing 500+ nodes need to hide irrelevant types (e.g., hide Module nodes to focus on User↔Role) | MEDIUM | Filter controls the input data fed to Cosmos.gl `setPointsData` / `setLinksData`; re-render on filter change |
| **Filter panel: filter by Role name** | Primary use case is "show me all users with role X"; expected by any RBAC/permission tool | MEDIUM | Filter applied before data fed to graph; Role node names come from APS API |
| **Search by user name or email** | With 500+ users, visual scanning is impossible; search-to-focus is universal expectation | MEDIUM | Text input filters user nodes; match triggers `zoomToNode` equivalent or highlights matching nodes |
| **Legend** | Users unfamiliar with the schema need a key explaining node colors and edge types | LOW | Static UI element outside canvas; no Cosmos.gl dependency |
| **Loading state and empty state** | APS data fetch is async; graph must communicate fetch progress and handle zero-member projects gracefully | LOW | Standard React suspense/loading pattern; no graph-specific complexity |
| **Node count summary** | "Showing 342 users across 18 projects" — enterprise users need audit-grade counts | LOW | Derived from data, rendered in sidebar; no graph dependency |

### Differentiators (Competitive Advantage)

Features that make this graph tool genuinely useful for AEC project managers diagnosing permission gaps — not just a pretty graph.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Duplicate role detector** | Surfaces users assigned multiple roles with overlapping entitlements — the primary stated core value in PROJECT.md | HIGH | Requires post-processing the APS data: for each user, compute role-to-module entitlement sets and detect overlaps; highlight detected users with a visual badge or distinct color; no built-in Cosmos.gl support, pure data layer |
| **Inconsistent access pattern flagging** | Detects users on the same project who have diverging access to the same module — tells PM "why can User A access Cost but User B cannot?" | HIGH | Compare user-role-module adjacency per project; flag outliers; requires aggregation of all three API endpoints |
| **Physics simulation controls (sliders)** | GPU-based force simulation in Cosmos.gl allows real-time tuning of repulsion, link distance, gravity; users familiar with Gephi expect this for large graph exploration | MEDIUM | Cosmos.gl exposes `simulationRepulsion`, `simulationLinkSpring`, `simulationLinkDistance`, `simulationGravity`, `simulationFriction` as config; bind to React sliders and call `graph.setConfig()` live |
| **Cluster by project** | Groups all nodes by project membership — makes multi-project access patterns visible at a glance | MEDIUM | Cosmos.gl v3+ includes point dragging and early clustering support; alternatively, pre-compute cluster positions using a force-directed layout per project and feed as initial positions |
| **Selective label rendering at zoom level** | Show no labels at overview zoom, role/module labels at mid zoom, user email labels at full zoom — prevents label hairball | MEDIUM | Cosmos.gl `showLabels` and label config; threshold on `cameraDistance` from zoom event callback; requires zoom-level tracking |
| **Sidebar detail panel on node select** | When user clicks a User node: show name, email, company, all roles, all projects, all module entitlements in a readable list — makes the graph actionable | MEDIUM | Data lookup by node ID; React component outside canvas; no Cosmos.gl complexity; high user value |
| **Export current view as PNG** | Audit-grade deliverable; project managers send screenshots to clients; expected by any enterprise tool but not guaranteed in WebGL | MEDIUM | Cosmos.gl renders to a WebGL canvas; `canvas.toBlob()` gives PNG; must wait for a settled frame; wrap in export button |
| **Export filtered data as CSV** | "Give me all users who have Module X on Project Y" — replaces manual ACC Admin Console queries | LOW | Pure data export, no graph dependency; filter state drives the export payload |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time live sync / webhooks** | "I want the graph to update automatically when ACC changes" | ACC webhooks add a separate backend service (event listener), persistent connections, and delta-patching graph data without breaking the typed-array structure; doubles implementation scope for v1.0 | Polling on page load (already scoped out-of-scope in PROJECT.md); add a manual "Refresh" button that re-fetches APS data |
| **Permission editing from the graph** | "I want to click a node and change the role" | Makes the module a write-capable ACC admin tool; requires ACC Admin API write scopes, optimistic UI, error rollback, and audit logging; completely different product contract | Keep read-only for v1.0; link to ACC Admin Console for changes |
| **Full graph always visible (no filtering)** | "Show me everything at once" | 500+ nodes with full edges produces a hairball — empirically studied and documented; cognitive load makes it useless | Progressive disclosure: default view shows only Users and Roles; user must opt in to expand Modules/Permissions |
| **Animated edge flows / particle effects** | "Make it look like data is flowing" | Animation is cosmetically appealing but conveys no information about static permission state; adds GPU cost; distracts from analysis | Use edge color and weight to encode relationship strength/importance instead |
| **SVG-based graph alternative** | "SVG is easier to export and style" | SVG rendering collapses above ~200 nodes; PROJECT.md explicitly constrains to Cosmos.gl WebGL; Cosmos.gl was chosen specifically because SVG cannot handle 500+ nodes at 60fps | Cosmos.gl canvas PNG export covers the export use case |
| **D3-force as layout layer inside Cosmos** | "Just use D3 for layout positions then render in Cosmos" | D3-force runs on CPU in JavaScript; defeats the entire purpose of Cosmos.gl's GPU-side simulation; introduces synchronization overhead | Use Cosmos.gl's built-in GPU force simulation exclusively |
| **Per-folder permission graph** | "Show me folder-level permissions too" | The folder permission model in ACC is a separate, deeply nested tree (per-project, per-folder, per-user); grafting it onto the user↔project↔role graph multiplies node count by an order of magnitude | Scope folder permissions as a separate drilldown panel, not a graph node type, in a future milestone |

---

## Feature Dependencies

```
[APS Data Fetch (tRPC route)]
    └──required by──> [All graph features]
                          ├──required by──> [Node rendering]
                          │                     └──required by──> [Hover tooltip]
                          │                     └──required by──> [Click-to-select + neighbor highlight]
                          │                     └──required by──> [Sidebar detail panel]
                          ├──required by──> [Filter panel]
                          │                     └──enhances──> [Search by user]
                          │                     └──enhances──> [Cluster by project]
                          └──required by──> [Duplicate role detector]
                                                └──requires──> [Role+Module adjacency data]

[Physics simulation controls]
    └──enhances──> [Cluster by project]

[Selective label rendering]
    └──requires──> [Zoom level tracking]

[Export PNG]
    └──requires──> [Canvas settled frame]

[Export CSV]
    └──requires──> [Filter panel state]
```

### Dependency Notes

- **APS Data Fetch requires three API calls:** `GET users`, `GET users/{id}/roles`, `GET users/{id}/products` — these must be merged into a unified graph data structure before any rendering
- **Duplicate role detector requires Role+Module adjacency:** the APS roles API returns role-to-project mappings, but module entitlements per role require the products endpoint; both must be fetched and joined before the detector can run
- **Click-to-select conflicts with filter panel:** when a user has filtered nodes and then clicks a node, the neighbor highlight must respect the current filter state (only highlight visible neighbors); implement selection as a post-filter operation
- **Cluster by project enhances physics controls:** cluster layout positions are initial values for Cosmos.gl simulation; physics controls then let users explore from that starting configuration

---

## MVP Definition

### Launch With (v1.0)

Minimum viable for the stated core value: surfacing permission gaps and inconsistent access patterns.

- [ ] **Four node types rendered distinctly** — without this the graph is meaningless
- [ ] **Three edge types** — without edges there is no graph
- [ ] **Pan and zoom** — without navigation the graph is a static image
- [ ] **Hover tooltip** — without identity confirmation users cannot read the graph
- [ ] **Click-to-select with neighbor highlight** — primary exploration interaction
- [ ] **Filter panel: by node type and by role** — required to manage 500+ node graphs without hairball
- [ ] **Selective label rendering by zoom level** — prevents label overload on initial load
- [ ] **Sidebar detail panel on select** — makes the graph actionable for PMs
- [ ] **Node count summary** — audit-grade; minimal implementation cost
- [ ] **Legend** — required for any user unfamiliar with the schema

### Add After Validation (v1.x)

- [ ] **Duplicate role detector** — highest stated core value but requires complex data join; add once base graph is proven stable
- [ ] **Physics simulation controls** — highly useful but Cosmos.gl defaults work for initial validation
- [ ] **Inconsistent access pattern flagging** — requires same data as duplicate detector; bundle with it
- [ ] **Export PNG** — enterprise ask, easy to add once canvas is stable
- [ ] **Export CSV** — low effort once filter state is established
- [ ] **Search by user name/email** — quality of life; add when user count grows above comfortable manual navigation

### Future Consideration (v2+)

- [ ] **Cluster by project** — useful but requires either Cosmos.gl clustering API maturity (v3 is early) or pre-computed layout positions; defer until Cosmos.gl clustering is stable
- [ ] **Real-time sync** — explicitly out of scope per PROJECT.md; defer until polling limitation causes user pain
- [ ] **Folder-level permission drilldown** — separate data model, separate interaction pattern; warrants its own milestone

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Four node types rendered distinctly | HIGH | LOW | P1 |
| Three edge types with direction | HIGH | LOW | P1 |
| Pan and zoom | HIGH | LOW | P1 |
| Hover tooltip | HIGH | LOW | P1 |
| Click-to-select + neighbor highlight | HIGH | MEDIUM | P1 |
| Filter by node type and role | HIGH | MEDIUM | P1 |
| Selective label rendering by zoom | HIGH | MEDIUM | P1 |
| Legend | MEDIUM | LOW | P1 |
| Node count summary | MEDIUM | LOW | P1 |
| Sidebar detail panel | HIGH | MEDIUM | P1 |
| Physics simulation controls | MEDIUM | LOW | P2 |
| Duplicate role detector | HIGH | HIGH | P2 |
| Inconsistent access pattern flagging | HIGH | HIGH | P2 |
| Export PNG | MEDIUM | MEDIUM | P2 |
| Export CSV | MEDIUM | LOW | P2 |
| Search by user name/email | MEDIUM | MEDIUM | P2 |
| Cluster by project | MEDIUM | HIGH | P3 |
| Real-time sync | LOW | HIGH | P3 |
| Folder permission drilldown | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for v1.0 launch
- P2: Add in v1.x after core graph is validated
- P3: Future milestone, defer

---

## Competitor Feature Analysis

These are the reference products most comparable to an ACC-specific access graph:

| Feature | Teleport Graph Explorer | Neo4j Browser | Gephi (desktop) | Our Approach |
|---------|------------------------|---------------|------------------|--------------|
| Node type visual distinction | Color + icon | Color + label | Color + size | Color per type via Cosmos.gl `nodeColor` |
| Click-to-select neighbor highlight | Yes | Yes | Yes | Yes — via `onPointClick` + opacity update |
| Filter panel | Yes (by resource type) | Yes (label filter) | Yes (attribute filter) | Yes — role, node type, project |
| Physics/layout controls | No (fixed layout) | No | Yes (full Gephi controls) | Yes — Cosmos.gl simulation sliders |
| Duplicate/anomaly detection | Yes (toxic combos) | No | No | Yes — post-APS data join |
| Export PNG | No | Yes | Yes | Yes — canvas.toBlob() |
| Export CSV | Yes | Yes | Yes | Yes — filter state driven |
| Real-time sync | Yes | No | No | No (polling only, v1.0) |
| Performance at 500+ nodes | Yes (WebGL) | Degrades (SVG) | Yes (OpenGL) | Yes — Cosmos.gl GPU |

---

## Sources

- [Teleport Graph Explorer — access graph visualization tool](https://goteleport.com/docs/identity-security/usage/graph-explorer/)
- [ACC Admin API — products and roles per user](https://aps.autodesk.com/blog/acc-admin-api-new-apis-list-all-products-roles-specified-user)
- [ACC Admin API — GET projects and project users](https://aps.autodesk.com/blog/acc-admin-api-get-projects-and-project-users)
- [Cosmos.gl GitHub — GPU-accelerated force graph](https://github.com/cosmosgl/graph)
- [Cosmos.gl OpenJS Foundation announcement](https://openjsf.org/blog/introducing-cosmos-gl)
- [Cambridge Intelligence — Graph visualization UX pitfalls](https://cambridge-intelligence.com/graph-visualization-ux-how-to-avoid-wrecking-your-graph-visualization/)
- [Cambridge Intelligence — Fixing hairballs](https://cambridge-intelligence.com/how-to-fix-hairballs/)
- [AWS — Graph-powered authorization / ReBAC](https://aws.amazon.com/blogs/database/graph-powered-authorization-relationship-based-access-control-for-access-management/)
- [Neo4j — Access control lists the graph way](https://neo4j.com/blog/developer/access-control-lists-the-graph-database-way/)
- [FalkorDB — Security graphs guide 2025](https://www.falkordb.com/blog/security-graphs-cloud-entitlements-guide/)
- [ACC Role Management](https://resources.imaginit.com/building-solutions-blog/role-management-in-autodesk-construction-clouds-admin-console)

---
*Feature research for: ACC Users Graph — permission/access visualization module*
*Researched: 2026-04-28*
