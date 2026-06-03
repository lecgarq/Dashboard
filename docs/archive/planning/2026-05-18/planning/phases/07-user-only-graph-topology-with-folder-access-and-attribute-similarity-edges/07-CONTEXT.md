# Phase 7: User-only graph topology with folder access and attribute-similarity edges - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7 extends BOTH graph renderers (2D Cosmos.gl `AccUsersGraph` and Phase 6 3D `Sphere3DGraph`) with two coordinated features:

1. **Folder hubs + role↔folder permission edges** — wire `AccFolder` + `AccFolderPermission` (already extracted, queryable via `accFoldersRouter.getMatrix`) into the topology as a new node kind and a new edge family with four permission tiers (view / upload / edit / control).

2. **User↔user attribute-similarity edges across 5 dimensions** — connect users who share: folder access, industry/project roles, projects, company, and admin tier. Edges live in the topology regardless of view mode.

3. **"User-only" view mode** — a new view toggle on both renderers that hides every non-user node kind (projects, roles, companies, folders) and reveals only user nodes + user↔user similarity edges. This is the namesake "user-only graph topology."

Data extraction is complete (FLDR-01/02 done, ACC tables populated). No Prisma migrations, no new tRPC procedures — reuse `accFoldersRouter.getMatrix`. Hubs (Autodesk) extraction and file-activity edges are explicitly out of scope (blocked on Data Connector).

</domain>

<decisions>
## Implementation Decisions

### Folder hubs in topology (multi-kind view)
- Folder appears as a new node kind in both 2D `AccTopologyHubKind` and the 3D sphere node-kind union (extends `GraphRenderNode.kind`).
- **Edge model for permission tier: single link kind `role-folder` with a `permTier` attribute** (not 4 separate link kinds). Renderer reads `permTier` to derive edge color.
- **Folder granularity: collapse at depth N=2 by default, with a "show all folders" escape hatch.** Top-level folders carry most of the permission story at hub scale (~1,143 active projects); deep folders inherit. Avoids 10k+ folder-hub explosion.
- **Folder ↔ project edges: yes.** Each folder hub also links to its parent project hub so projects remain natural clusters.
- Folder hub color: distinct neutral (slate/teal) so it reads as "container," not "actor." Bypass `getCategoryColor` for kind=folder.

### User↔user attribute-similarity edges
- **Five dimensions, modeled as separate parallel edges per dimension** (not a single merged-weight edge):
  1. Shared folder access (via `AccFolderPermission` cross-join through roles)
  2. Shared industry/project roles
  3. Shared projects
  4. Shared company
  5. Shared admin tier (hub admin ↔ hub admin, project admin ↔ project admin, executive ↔ executive)
- Each dimension gets its own edge color. Up to 5 parallel edges per user pair. Renderer cost is accepted; planning must verify FPS at hub-scale.
- Edges live in the topology even in multi-kind view (they don't render only in user-only mode — they're always part of the graph data).

### "User-only" view mode
- New filter toggle on both 2D and 3D filter panels. When ON: every non-user node kind (project, role, company, folder) is hidden and only user↔user similarity edges render.
- Default: OFF (multi-kind view stays the default).
- URL-persisted via the existing param pattern (e.g. `view=user-only` plus existing `folders`, `ptiers` keys from the folder-hub plan).

### Both renderers in scope
- 2D Cosmos.gl `AccUsersGraph`: extend `accGraphOrganicLayout.ts`, `accGraphFilters.ts`, `graphRenderers.ts`, `AccUsersGraph.tsx`, `lib/acc/graphSnapshot.ts`. Filter panel gains: "Show folders" toggle, permission-tier checkboxes, similarity-dimension toggles (5), "User-only view" toggle.
- 3D `Sphere3DGraph` (Phase 6, which must land first): same conceptual additions in `Sphere3DFilterPanel.tsx`, topology adapter (06-03), and the GPU buffers (`NodesPoints` / `EdgesLines`). Folder nodes are a 5th node kind only if Phase 6 GRAPH-04 records a GO decision; otherwise 3D ships user-only edges + similarity but no folder hubs (folders remain dashboard-only in the 3D path).

### Filter panel additions (both surfaces)
- Show folders toggle (default ON)
- Permission-tier checkboxes: view / upload / edit / control (default all)
- Similarity-dimension toggles: folder-access, roles, projects, company, admin-tier (default all)
- User-only view toggle (default OFF)
- All URL-persisted

### Claude's Discretion
- **Edge density / similarity-weight threshold algorithm** — Luis said "You decide." Recommendation: slider in filter panel with default `min shared attributes ≥ 2` per dimension to suppress weakest ties; user can drag to 1 to see all, or up to filter to strongest. Confirm during planning after a perf pass.
- Exact edge colors for the 5 similarity dimensions and 4 permission tiers (9 new colors total) — design during planning.
- How to render parallel edges without z-fighting (offset / curve / bundling) — implementation detail.
- Algorithm for the "shared folder access" similarity calculation (direct via `AccFolderPermission` user-resolved, or transitive via shared roles) — verify with research.
- Whether the 3D sphere's GPU edge buffer needs a per-edge `dimension` attribute (likely yes, similar to existing `aVisible`).

</decisions>

<specifics>
## Specific Ideas

- Reuse `accFoldersRouter.getMatrix` shape verbatim — no new tRPC procedure, no Prisma migration.
- Folder hub color: slate/teal family (reads as "container"). Distinct from user (warm), project (existing palette), role, company.
- Phase boundary stays well clear of the APS Data Connector blocker — folder data is fully present in Prisma already.
- 2D and 3D filter panels share the same conceptual toggles but live in separate components (`accGraphFilters.ts` UI vs `Sphere3DFilterPanel.tsx`). URL params should be the same keys so a switch between surfaces preserves state.

</specifics>

<deferred>
## Deferred Ideas

- **Autodesk Hubs as a node kind** — not extracted today (only referenced via `Project.apsHubId`). Separate data-layer phase if/when needed.
- **File-activity edges on the graph** — blocked on the APS Data Connector provisioning (see `project_aps_data_connector_blocker.md`). Revisit once provisioned.
- **Merged single-weight user↔user edge** — chose separate-per-dimension instead. Could revisit if the parallel-edge render is too heavy at hub scale.
- **Per-folder permission drill-down panel** — a side panel listing who-can-do-what on a clicked folder. Belongs in a dashboard-enrichment phase, not the graph topology phase.
- **"Suggest collaborators" via similarity** — UX layer on top of the similarity edges (e.g. "users similar to X"). Future phase.

</deferred>

---

*Phase: 07-user-only-graph-topology-with-folder-access-and-attribute-similarity-edges*
*Context gathered: 2026-05-12*
