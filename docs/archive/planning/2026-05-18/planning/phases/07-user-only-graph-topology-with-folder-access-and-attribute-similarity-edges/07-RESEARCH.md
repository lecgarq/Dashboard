# Phase 7: User-only graph topology with folder access and attribute-similarity edges - Research

**Researched:** 2026-05-12
**Domain:** Graph topology extension (2D Cosmos.gl + 3D r3f sphere) — new node kind (folder), new edge family (role↔folder permissions), new edge family (user↔user attribute similarity, 5 parallel dimensions), new view-mode toggle (user-only).
**Confidence:** HIGH on adapters/patterns (codebase-grounded); MEDIUM on parallel-edge rendering at hub scale (needs perf checkpoint).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Folder hubs in topology (multi-kind view)**
- Folder appears as a new node kind in both 2D `AccTopologyHubKind` and the 3D sphere node-kind union (extends `GraphRenderNode.kind`).
- **Edge model for permission tier: single link kind `role-folder` with a `permTier` attribute** (not 4 separate link kinds). Renderer reads `permTier` to derive edge color.
- **Folder granularity: collapse at depth N=2 by default, with a "show all folders" escape hatch.** Top-level folders carry most of the permission story at hub scale (~1,143 active projects); deep folders inherit. Avoids 10k+ folder-hub explosion.
- **Folder ↔ project edges: yes.** Each folder hub also links to its parent project hub so projects remain natural clusters.
- Folder hub color: distinct neutral (slate/teal) so it reads as "container," not "actor." Bypass `getCategoryColor` for kind=folder.

**User↔user attribute-similarity edges**
- **Five dimensions, modeled as separate parallel edges per dimension** (not a single merged-weight edge):
  1. Shared folder access (via `AccFolderPermission` cross-join through roles)
  2. Shared industry/project roles
  3. Shared projects
  4. Shared company
  5. Shared admin tier (hub admin ↔ hub admin, project admin ↔ project admin, executive ↔ executive)
- Each dimension gets its own edge color. Up to 5 parallel edges per user pair. Renderer cost is accepted; planning must verify FPS at hub-scale.
- Edges live in the topology even in multi-kind view (they are always part of the graph data).

**"User-only" view mode**
- New filter toggle on both 2D and 3D filter panels. When ON: every non-user node kind (project, role, company, folder) is hidden and only user↔user similarity edges render.
- Default: OFF (multi-kind view stays the default).
- URL-persisted via the existing param pattern (e.g. `view=user-only` plus existing `folders`, `ptiers` keys from the folder-hub plan).

**Both renderers in scope**
- 2D Cosmos.gl `AccUsersGraph`: extend `accGraphOrganicLayout.ts`, `accGraphFilters.ts`, `graphRenderers.ts`, `AccUsersGraph.tsx`, `lib/acc/graphSnapshot.ts`. Filter panel gains: "Show folders" toggle, permission-tier checkboxes, similarity-dimension toggles (5), "User-only view" toggle.
- 3D `Sphere3DGraph` (Phase 6, which must land first): same conceptual additions in `Sphere3DFilterPanel.tsx`, topology adapter (06-03), and the GPU buffers (`NodesPoints` / `EdgesLines`). Folder nodes are a 5th node kind only if Phase 6 GRAPH-04 records a GO decision; otherwise 3D ships user-only edges + similarity but no folder hubs.

**Filter panel additions (both surfaces)**
- Show folders toggle (default ON)
- Permission-tier checkboxes: view / upload / edit / control (default all)
- Similarity-dimension toggles: folder-access, roles, projects, company, admin-tier (default all)
- User-only view toggle (default OFF)
- All URL-persisted

### Claude's Discretion

- **Edge density / similarity-weight threshold algorithm** — slider in filter panel with default `min shared attributes ≥ 2` per dimension to suppress weakest ties; user can drag to 1 or up. Confirm during planning after a perf pass.
- Exact edge colors for the 5 similarity dimensions and 4 permission tiers (9 new colors total) — design during planning.
- How to render parallel edges without z-fighting (offset / curve / bundling) — implementation detail.
- Algorithm for the "shared folder access" similarity calculation (direct via `AccFolderPermission` user-resolved, or transitive via shared roles) — verify with research.
- Whether the 3D sphere's GPU edge buffer needs a per-edge `dimension` attribute (likely yes, similar to existing `aVisible`).

### Deferred Ideas (OUT OF SCOPE)

- Autodesk Hubs as a node kind (data-layer phase if/when needed).
- File-activity edges on the graph (blocked on APS Data Connector provisioning).
- Merged single-weight user↔user edge (chose separate-per-dimension instead).
- Per-folder permission drill-down panel (dashboard-enrichment phase).
- "Suggest collaborators" via similarity (UX layer for a future phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

CONTEXT.md notes the roadmap has not assigned formal REQ-IDs for Phase 7. The table below derives synthetic IDs from CONTEXT decisions so the planner can map plans → requirements.

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRAPH7-01 | Extend `AccTopologyHubKind` to include `"folder"`; emit folder hubs from `buildAccTopologyGraph` collapsed at depth N=2 by default with a "show all folders" escape hatch. | §Architecture Pattern 1 (topology adapter extension); §Code Examples #1 (folder-depth collapse). Reuse existing `AccFolder.fullPath` to compute depth. |
| GRAPH7-02 | Emit role↔folder edges with a `permTier` attribute (one link-kind `role-folder`, not 4 kinds). | §Architecture Pattern 2 (edge model with attribute, not kind). `AccTopologyLink` already has `kind`; extend with optional `permTier`. |
| GRAPH7-03 | Emit folder↔project edges so folders nest under their owning project hub. | §Architecture Pattern 1 — straightforward `addLink(folderHubId, projectHubId, "folder")`. |
| GRAPH7-04 | Emit user↔user similarity edges across 5 dimensions as parallel edges (one per dimension). | §Don't Hand-Roll (similarity = pure JS over getMatrix output); §Pitfall 1 (parallel edges in cosmos.gl); §Code Examples #2 (similarity computation skeleton). |
| GRAPH7-05 | Surface a similarity-density slider with default `min shared attributes ≥ 2`. | §Architecture Pattern 4 (filter-driven edge culling at adapter, not renderer). |
| GRAPH7-06 | "User-only" view mode hides every non-user node kind; only user↔user similarity edges render. | §Architecture Pattern 3 (visibility via `setVisibleIndices` in 2D, `aVisible` attribute in 3D — already exists for both). |
| GRAPH7-07 | Reuse `accFoldersRouter.getMatrix` verbatim — NO new tRPC procedure, NO Prisma migration. | §Standard Stack — verified `server/routers/acc-folders.ts:getMatrix` returns `{ rows, folderOnlyOrphans, projectCrawlStatuses }` with all fields needed. |
| GRAPH7-08 | URL-persist new filter keys (`folders`, `ptiers`, `simDims`, `simMin`, `view`) via the existing pattern in 2D `AccUsersGraph` and the 3D `sphere3d/filterUrl.ts` lifted in Plan 06-08. | §Code Examples #3 (URL serialization conventions). |
| GRAPH7-09 | Filter panel additions on both surfaces (Show folders, permission-tier checkboxes, 5 similarity-dimension toggles, User-only view toggle). | §Architecture Pattern 4. |
| GRAPH7-10 | Folder hubs in 3D conditional on Phase 6 GRAPH-04 GO; if NO-GO, 3D ships user-only + similarity edges only. | §Open Question 1. |
| GRAPH7-11 | Distinct neutral folder color (slate/teal); bypass `getCategoryColor` for kind=folder. | §Pitfall 4 (color identity for new kind). |
| GRAPH7-12 | Performance: maintain ≥30fps in 2D and ≥60fps in 3D at hub scale with all 5 similarity dimensions ON and folders ON. Planning includes a measurement task. | §Pitfall 1 + §Pitfall 5; §Open Question 2 (similarity edge cap). |
</phase_requirements>

## Summary

Phase 7 is a topology + filter-panel extension on top of two renderers that already exist (2D Cosmos.gl in `app/(dashboard)/users/AccUsersGraph.tsx` and 3D `Sphere3DGraph` from Phase 6). The data layer is fully in place — `prisma/schema.prisma` carries `AccFolder`, `AccFolderPermission`, `AccProjectMember`, `AccProjectRole`, `AccRole` — and `server/routers/acc-folders.ts:getMatrix` already returns the exact `(folder × role × permission)` shape the topology needs, including project crawl status. **No new tRPC, no Prisma migration.**

The work is concentrated in three pure modules (topology builder, similarity computer, filter predicate) plus thin renderer wiring. The largest open risk is rendering 5 parallel edges per user pair in cosmos.gl v3 — the renderer accepts duplicate `(source, target)` pairs in its link buffer but draws them coincident (z-fight, no curvature support in the patched build), so visual differentiation must come from per-edge color + a slight world-space offset OR an edge-density cap. This is the only "verify by prototype" risk in the phase.

**Primary recommendation:** Treat similarity-edge generation as a **pure adapter** (`lib/acc/userSimilarity.ts`) called once per filter change, with an explicit `minSharedPerDimension` cap (default 2) and a per-pair-cap (max 5 = one per dimension). Wire into 2D via `frame.links` extension; wire into 3D by extending `sphere3d/topologyAdapter.ts:buildEdgeBuffers` to carry an additional `aDimension` per-edge attribute that the edge fragment shader consumes as a color LUT index.

## Standard Stack

### Core (already installed — no new deps)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@cosmos.gl/graph` | 3.0.0-beta.9 + LECG patch | 2D GPU graph renderer | Existing, patched (`patches/@cosmos.gl+graph+3.0.0-beta.9.patch` removes spaceSize clamp). Cosmos's `setLinks(Float32Array of [s,t] pairs)` accepts duplicate pairs — that is how parallel edges are expressed. |
| `three` + `@react-three/fiber` + `@react-three/drei` | per Phase 6 | 3D sphere renderer | Phase 6 stack; Phase 7 only adds attributes to `EdgesLines.tsx` + `NodesPoints.tsx`. |
| `@trpc/server` + `@trpc/react-query` | existing | Data plumbing | Reuse `accFoldersRouter.getMatrix` verbatim. |
| `vitest` | existing | Pure-logic tests | Test similarity computation, depth-collapse, filter predicate, URL round-trip. |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zustand` / React state | existing | Filter state | Match the pattern in `Sphere3DFilterPanel.tsx` (Phase 6 plan 06-08) and `AccUsersGraph.tsx` URL-driven state. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parallel duplicate `(s,t)` edges in cosmos | Bezier/curve-rendered edges per dimension | cosmos.gl v3 has no curve API; would require a separate Canvas2D overlay (rejected — defeats GPU performance). |
| Per-dimension separate `link kind` | Single `role-folder` with `permTier` attr | CONTEXT-locked: single kind + attr. |
| Rebuild edge buffer on every slider tick | Filter at adapter, rebuild only when dimension toggle changes | The 3-input `Sphere3DFilterPanel.tsx` (06-08) deliberately separates URL-state changes from continuous slider changes — Phase 7 follows the same split. |

**Installation:** None. Phase 7 is additive code only.

## Architecture Patterns

### Recommended Project Structure
```
lib/acc/
├── graphSnapshot.ts                 # existing — emits AccGraphInstanceNode
├── userSimilarity.ts                # NEW — pure: getMatrix → SimilarityEdge[]
├── folderHubCollapse.ts             # NEW — pure: AccFolder[] → CollapsedFolder[] (depth-N collapse)
└── permissionMapping.ts             # existing — PermTier union (View Only…Full Controller)

app/(dashboard)/users/
├── accGraphOrganicLayout.ts         # MODIFY — add "folder" to AccTopologyHubKind union
├── accGraphFilters.ts               # MODIFY — add showFolders, permTiers, simDims, simMin, viewMode
├── graphRenderers.ts                # MODIFY — GraphRenderNode.kind += "folder"; per-edge color from permTier
├── cosmosUtils.ts                   # MODIFY — buildLinkColorBuffer accepts per-edge color array
├── AccUsersGraph.tsx                # MODIFY — wire new filters, similarity edges, view-mode hide
└── sphere3d/
    ├── topologyAdapter.ts           # MODIFY — extend buildEdgeBuffers with permTier + dimension attrs
    ├── filterAdapter.ts             # MODIFY — view-mode = userOnly hides non-user kinds via aVisible=0
    ├── filterUrl.ts                 # MODIFY — round-trip new keys
    ├── Sphere3DFilterPanel.tsx      # MODIFY — add the 8 new controls
    └── EdgesLines.tsx               # MODIFY — add aDimension + aPermTier vertex attrs; color LUT in frag
```

### Pattern 1: Topology adapter as the single mutation site
**What:** All folder/permission/similarity edge logic flows through `buildAccTopologyGraph` (2D) and `buildEdgeBuffers` (3D). The renderers stay dumb.
**When to use:** Every edge addition. NEVER add edges directly in renderer code.
**Example:**
```typescript
// app/(dashboard)/users/accGraphOrganicLayout.ts (extension)
export type AccTopologyHubKind = "project" | "role" | "module" | "access" | "user" | "folder";

export interface AccTopologyLink {
  source: string;
  target: string;
  kind: AccTopologyLinkKind | "role-folder" | "folder-project" | "user-similarity";
  permTier?: PermTier;          // only for role-folder
  dimension?: SimilarityDim;    // only for user-similarity
  weight?: number;              // for similarity edges (sharedCount)
}

// Folder hub emission (depth-N collapse)
const collapsed = collapseFoldersToDepth(folders, /* depth */ 2);
for (const folder of collapsed) {
  const fid = addHub("folder", folder.id, folder.name);
  addLink(fid, addHub("project", folder.projectId), "folder-project");
  for (const perm of folder.permissions) {
    addLink(addHub("role", perm.roleId), fid, "role-folder", { permTier: perm.permType });
  }
}
```
**Source:** `app/(dashboard)/users/accGraphOrganicLayout.ts:38` (existing `AccTopologyHubKind`); `server/routers/acc-folders.ts:42` (`getMatrix` shape).

### Pattern 2: Edge model — kind + attributes, not 4 kinds
**What:** A single `role-folder` link kind with a `permTier` attribute (CONTEXT-locked). Renderer reads `permTier` to derive color via a small LUT (4 colors).
**When to use:** Whenever an edge has a discrete enumerable variation (permTier, similarity dimension). Avoids combinatorial kind explosion.
**Example:**
```typescript
const PERM_TIER_COLOR: Record<PermTier, string> = {
  "View Only":              "#9CA3AF",  // slate-400
  "View+Download":          "#60A5FA",  // blue-400
  "Upload Only":            "#A78BFA",  // violet-400
  "View+Download+Upload":   "#34D399",  // emerald-400
  "View+Download+Upload+Edit": "#FBBF24", // amber-400
  "Full Controller":        "#F87171",  // red-400
};

// 2D: extend cosmosUtils.buildLinkColorBuffer to accept per-edge color
function buildLinkColorBuffer(links, perEdgeColors?: string[]): Float32Array { /* ... */ }
```

### Pattern 3: View-mode = visibility, not data filter
**What:** "User-only" view mode does NOT remove non-user nodes from the topology. It sets `visibleSet` so non-user indices map to size=0 (2D) / aVisible=0 (3D).
**Why:** Keeps the topology stable across mode toggles (no buffer rebuild → no FPS dip), and similarity edges keep their endpoints valid.
**Example (2D):**
```typescript
// In AccUsersGraph.tsx render frame builder:
const visibleSet = new Set<number>();
for (let i = 0; i < frame.nodes.length; i++) {
  const node = frame.nodes[i];
  if (filters.viewMode === "user-only" && node.kind !== "user") continue;
  if (!nodeMatchesFilters(node, filters)) continue;
  visibleSet.add(i);
}
cosmosRenderer.setVisibleIndices(visibleSet);
```
**Source:** `app/(dashboard)/users/graphRenderers.ts:1316` (`setVisibleIndices` exists; uses size=0 + shape=8).

**Example (3D):** `sphere3d/filterAdapter.ts` already emits a `Uint8Array` of visibility consumed by `PhysicsApi.setVisibility()`. Phase 6 plan 06-04 routes this through the velocity shader's outward-drift force. Phase 7 just extends the predicate to AND with `(viewMode !== "user-only" || node.kind === "user")`.

### Pattern 4: Filter at adapter, not at render
**What:** Filter changes (similarity-density slider, dimension toggles, permTier checkboxes) recompute the edge buffer. They do NOT require a renderer rebuild from scratch — `setLinks` + `setLinkColors` accept new arrays.
**When to use:** Any filter that changes the SHAPE of edges (dimensions toggled OFF → fewer edges, slider tightens minSharedPerDimension → fewer edges).
**Performance:** With ~25k user nodes, a naive O(n²) similarity scan is 6.25e8 comparisons — borderline. Use the indexed approach in §Code Examples #2: build per-dimension `Map<attributeValue, userIds[]>` (O(n)), then for each bucket of size k emit edges within (O(k²) per bucket, manageable because attribute distributions are skewed). Real `AccProjectMember` count is in the low thousands, so this is comfortably sub-second.

### Anti-Patterns to Avoid
- **Adding 5 separate link kinds for similarity dimensions** — CONTEXT-locked against; bloats `AccTopologyLinkKind` union and forces 5 separate cosmos `setLinks` calls. One edge buffer with `dimension` attribute is correct.
- **Computing similarity in a tRPC procedure** — CONTEXT-locked against (no new tRPC). Pure client adapter consuming `getMatrix` output is the correct boundary.
- **Folder hub per leaf folder** — would explode to 10k+ hubs; use depth-2 collapse with escape hatch (CONTEXT-locked).
- **Curve/bundle parallel edges in cosmos.gl** — patched `@cosmos.gl/graph+3.0.0-beta.9` has no curve API; the patch is for spaceSize clamp only (verified `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` is a 9-line shader hack, no API additions). Differentiate by color + accept some z-coincidence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Folder × role × permission matrix | A new tRPC procedure | `accFoldersRouter.getMatrix` (verified at `server/routers/acc-folders.ts:42`) | Already returns `{ folderId, folderPath, projectId, projectName, projectCrawlStatus, roleId, roleName, permType, actions, orphanReasons }`. Phase 7 needs all of these. |
| Permission-tier mapping | A re-implementation in the renderer | `lib/acc/permissionMapping.ts:PermTier` union + `mapActions()` (Phase 04 Plan 01) | Already TDD-tested with 14 cases; CONTEXT mentions 4-tier UI bucketing — collapse 6 PermTier values into 4 view tiers via a small LUT in the renderer color helper. |
| Folder depth from path | A custom path parser | `AccFolder.fullPath` (e.g. `"/Project Files/Plans/02 Architecture"`) split by `/` | Path is persisted by `lib/acc/folderCrawl.ts` (Phase 04 Plan 02). Length-of-segments-after-root is depth. |
| User similarity for "shared folder access" | Direct via `AccFolderPermission` user-resolved | **Transitive via shared roles** (recommended, see §Open Question 1) | `AccFolderPermission` has `subjectType === "ROLE"` only — there is no per-user folder permission row. Resolving to users requires `AccProjectRole` join. Transitive (shared role → both have access) is what the data actually supports without inventing a new pipeline. |
| URL state round-trip | Re-implementing `URLSearchParams` parsing | `sphere3d/filterUrl.ts:readFiltersFromUrl/writeFiltersToUrl` (Phase 6 plan 06-08) | Lifted helpers; Phase 7 just adds new keys to the same shape. |
| Per-edge visibility in 3D | A new GPU texture | Existing `aVisible` G-channel pattern in `params` DataTexture (Phase 6 plan 06-04) | Phase 6 plan 06-05 already routes `aVisible` through edge alpha. Add a parallel `aPermTier` (1 byte) and `aDimension` (1 byte) packed into the edge attribute interleaved buffer — no new texture. |

**Key insight:** The data layer is complete and the renderers are extensible. Every "new" feature in Phase 7 maps to extending an existing union, attribute, or buffer — there is no greenfield infrastructure.

## Common Pitfalls

### Pitfall 1: Parallel edges in cosmos.gl render coincident (z-fight, no curve API)
**What goes wrong:** `setLinks` accepts `[s, t]` duplicates and draws each as a separate line, but at the same screen-space coordinates. With 5 dimensions × 25k pairs you get visible "thick line" instead of distinguishable parallel strands.
**Why it happens:** The patched `@cosmos.gl/graph` 3.0.0-beta.9 line shader (`dist/index.js` line shader, see patch file `patches/@cosmos.gl+graph+3.0.0-beta.9.patch`) has no curve, no offset, no width-per-edge. The patch only removes a position clamp (lines 4669-4673). No edge curve API was added.
**How to avoid:**
1. Cap parallel edges per pair: emit at most ONE edge per (userA, userB, dimension), and rely on `setLinkColors` per-edge alpha-blended to fake thickness banding (fully opaque dimension wins on top).
2. Use the similarity slider (default `min=2`) to keep total edge count manageable.
3. Document that "5 parallel similarity edges" is logical — visually they may render as a single multi-color line at low zoom; that is acceptable per CONTEXT "Renderer cost is accepted; planning must verify FPS at hub-scale."
**Warning signs:** During UAT, a user with similarity edges across all 5 dimensions looks identical to one with a single edge.

### Pitfall 2: AccFolderPermission has only role permissions, not user permissions
**What goes wrong:** Computing "shared folder access" similarity by iterating `AccFolderPermission` rows yields ROLE↔ROLE pairs, not USER↔USER. The plan reads as "compare users by their folder-access set" but the data only supports "compare users by their role set, then look up each role's folder set."
**Why it happens:** Phase 04 Plan 02 explicitly applies `subjectType === "ROLE"` filter at parse boundary (`AccFolderPermission` never receives USER permission rows). Verified at `prisma/schema.prisma:519` — no `userId`/`memberId` column on `AccFolderPermission`.
**How to avoid:** Compute via the chain `user → AccProjectMember → AccProjectRole → roleId → AccFolderPermission.roleId → folderId`. Memoize per-user folder ID set, then Jaccard-overlap pairs of users. CONTEXT explicitly flags this as a Claude's Discretion item ("direct via `AccFolderPermission` user-resolved, or transitive via shared roles") — recommend transitive.
**Warning signs:** A query against `AccFolderPermission.userId` compiles → schema is wrong, or the developer added a new column.

### Pitfall 3: Folder depth-2 collapse loses permission data
**What goes wrong:** When folders are collapsed at depth 2, permissions on deep folders (depth 3+) need a representative. Naive collapse picks "first child's permissions" which silently drops permissions unique to deeper folders.
**How to avoid:** UNION all descendant folders' permissions onto the depth-2 ancestor when collapsing. Document that the visible folder hub represents "this folder + all descendants" — the side-panel drill-down (deferred to a later phase per CONTEXT) is where exact attribution lives.
**Warning signs:** A folder hub shows fewer permission edges than the dashboard's `FolderPermissionsWidget` (Phase 04 Plan 06) reports for that subtree.

### Pitfall 4: New folder kind missed by `getCategoryColor` palette mapping
**What goes wrong:** `lib/acc/graphSnapshot.ts:getCategoryColor` hashes the input string into the `VIBRANT_COLORS` palette. Folder hub IDs would land randomly across the palette, making folders visually indistinguishable from projects/roles. CONTEXT requires "distinct neutral (slate/teal)."
**How to avoid:** In `graphRenderers.ts` color resolution (or wherever `GraphRenderNode.color` is assigned), branch on `node.kind === "folder"` BEFORE calling `getCategoryColor`. Hardcode `"#5EEAD4"` (teal-300) or `"#94A3B8"` (slate-400).
**Warning signs:** Folder hubs render in red/orange/etc.

### Pitfall 5: Filter recompute on every cosmos slider tick → frame drops
**What goes wrong:** Existing `AccUsersGraph.tsx` slider scrubs (separation, cluster) re-fire setSimulationConfig at >30 Hz. If similarity-edge recompute is wired to ANY filter state change, scrubbing physics sliders rebuilds the entire similarity edge buffer per tick.
**How to avoid:** Memoize the similarity edge buffer keyed on `(simMin, enabledDims, getMatrix.dataHash)`. Physics-only sliders never invalidate the cache.
**Warning signs:** Slider scrub on the physics panel feels chunky (>16ms/frame) where it was smooth in v6.

### Pitfall 6: Phase 6 dependency — 3D filter panel doesn't exist yet
**What goes wrong:** Phase 7 plans assume `Sphere3DFilterPanel.tsx` and `sphere3d/filterUrl.ts` exist. They are CREATED in Phase 6 plan 06-08, which is unchecked.
**How to avoid:** Phase 7 Wave-0 verification gate: confirm `app/(dashboard)/users/sphere3d/Sphere3DFilterPanel.tsx` and `sphere3d/filterUrl.ts` exist; if not, either wait for Phase 6 or temporarily target only the 2D surface (CONTEXT explicitly allows this fallback for folder hubs in 3D pending GRAPH-04 GO).
**Warning signs:** `glob app/(dashboard)/users/sphere3d/Sphere3DFilterPanel*` returns empty (verified empty as of 2026-05-12).

## Code Examples

Verified patterns — all references point to current source files.

### Example 1: Folder depth-N collapse
```typescript
// lib/acc/folderHubCollapse.ts (NEW)
import type { FolderMatrixRow } from "@/server/routers/acc-folders";

export interface CollapsedFolder {
  /** Folder ID at depth N (or original if depth < N). */
  id: string;
  projectId: string;
  name: string;
  fullPath: string;
  /** UNION of all descendant role permissions, deduped by (roleId, permType). */
  permissions: Array<{ roleId: string; permType: string }>;
}

export function collapseFoldersToDepth(
  rows: FolderMatrixRow[],
  maxDepth = 2,
): CollapsedFolder[] {
  // Group by (folderId clipped to depth N).
  // Path segments: "/Project Files/Plans/02 Architecture" -> ["Project Files","Plans","02 Architecture"]
  // depth = segments.length; collapse target = first `maxDepth` segments rejoined.
  const byCollapseKey = new Map<string, CollapsedFolder>();
  for (const row of rows) {
    const segments = (row.folderPath || "").split("/").filter(Boolean);
    const isLeafBelowDepth = segments.length > maxDepth;
    const collapsedPath = isLeafBelowDepth
      ? "/" + segments.slice(0, maxDepth).join("/")
      : row.folderPath;
    const key = `${row.projectId}::${collapsedPath}`;
    let entry = byCollapseKey.get(key);
    if (!entry) {
      entry = {
        id: isLeafBelowDepth ? `collapsed:${key}` : row.folderId,
        projectId: row.projectId,
        name: segments[Math.min(segments.length, maxDepth) - 1] ?? row.folderPath,
        fullPath: collapsedPath,
        permissions: [],
      };
      byCollapseKey.set(key, entry);
    }
    entry.permissions.push({ roleId: row.roleId, permType: row.permType });
  }
  // Dedup permissions per collapsed folder.
  for (const entry of byCollapseKey.values()) {
    const seen = new Set<string>();
    entry.permissions = entry.permissions.filter((p) => {
      const k = `${p.roleId}::${p.permType}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return [...byCollapseKey.values()];
}
```
**Source:** `server/routers/acc-folders.ts:19` (FolderMatrixRow shape verified); `prisma/schema.prisma:511` (`AccFolder.fullPath`).

### Example 2: User similarity with per-dimension parallel edges
```typescript
// lib/acc/userSimilarity.ts (NEW)
export type SimilarityDim = "folder-access" | "roles" | "projects" | "company" | "admin-tier";

export interface SimilarityEdge {
  userA: string; // canonical id (e.g. AccProjectMember.id or email)
  userB: string;
  dimension: SimilarityDim;
  sharedCount: number;
}

export interface SimilarityInput {
  users: Array<{
    id: string;
    email: string;
    company: string | null;
    adminTier: "hub" | "project" | "executive" | null;
    roleIds: string[];     // from AccProjectRole join
    projectIds: string[];  // from AccProjectMember.projectId join
    folderIds: string[];   // RESOLVED transitively via roleIds → AccFolderPermission.folderId
  }>;
}

export function computeSimilarityEdges(
  input: SimilarityInput,
  enabledDims: ReadonlySet<SimilarityDim>,
  minShared = 2,
): SimilarityEdge[] {
  const edges: SimilarityEdge[] = [];
  const emit = (a: string, b: string, dim: SimilarityDim, n: number) => {
    if (n < minShared) return;
    if (!enabledDims.has(dim)) return;
    // Canonical order to dedupe (a,b) vs (b,a).
    edges.push(a < b ? { userA: a, userB: b, dimension: dim, sharedCount: n }
                     : { userA: b, userB: a, dimension: dim, sharedCount: n });
  };
  // Indexed approach: bucket userIds per attribute value, emit pairs within each bucket.
  // O(sum of bucketSize^2) — fast for realistic skewed distributions (low thousands of users).
  const dimToBuckets: Record<SimilarityDim, Map<string, string[]>> = {
    "folder-access": new Map(),
    "roles":         new Map(),
    "projects":      new Map(),
    "company":       new Map(),
    "admin-tier":    new Map(),
  };
  for (const u of input.users) {
    for (const f of u.folderIds) push(dimToBuckets["folder-access"], f, u.id);
    for (const r of u.roleIds)   push(dimToBuckets["roles"], r, u.id);
    for (const p of u.projectIds) push(dimToBuckets["projects"], p, u.id);
    if (u.company)   push(dimToBuckets["company"], u.company, u.id);
    if (u.adminTier) push(dimToBuckets["admin-tier"], u.adminTier, u.id);
  }
  // Count shared attributes per pair, per dimension.
  for (const [dim, buckets] of Object.entries(dimToBuckets) as Array<[SimilarityDim, Map<string, string[]>]>) {
    const pairCounts = new Map<string, number>();
    for (const ids of buckets.values()) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const k = ids[i] < ids[j] ? `${ids[i]}::${ids[j]}` : `${ids[j]}::${ids[i]}`;
          pairCounts.set(k, (pairCounts.get(k) ?? 0) + 1);
        }
      }
    }
    for (const [k, n] of pairCounts) {
      const [a, b] = k.split("::");
      emit(a, b, dim, n);
    }
  }
  return edges;
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const arr = m.get(k); if (arr) arr.push(v); else m.set(k, [v]);
}
```
**Notes:** Pure function. Vitest-friendly. The folderIds resolution (transitive via roles) is computed once upstream from `getMatrix` rows — see Pitfall 2.

### Example 3: URL persistence (additive to Phase 6 plan 06-08 helpers)
```typescript
// app/(dashboard)/users/sphere3d/filterUrl.ts (extension)
// Adds 5 keys to the existing readFiltersFromUrl/writeFiltersToUrl from 06-08.
//   folders=true|false        (default true)
//   ptiers=v,u,e,c            (CSV of view/upload/edit/control; default all)
//   simDims=fa,r,p,c,a        (CSV; default all)
//   simMin=N                  (integer; default 2)
//   view=user-only|multi      (default multi)
```
**Source:** `app/(dashboard)/users/AccUsersGraph.tsx:1` (existing 2D URL pattern — grep `URLSearchParams` to find the reader); Phase 6 plan 06-08 lifts this into `sphere3d/filterUrl.ts`.

### Example 4: Cosmos parallel-edge color buffer
```typescript
// app/(dashboard)/users/cosmosUtils.ts (extension to buildLinkColorBuffer)
// Today: builds a uniform-color buffer of length linkCount.
// Phase 7: accept an optional perEdgeColors: string[] (length = linkCount).
export function buildLinkColorBuffer(
  count: number,
  perEdgeColors?: readonly string[],
): Float32Array {
  if (!perEdgeColors) return /* existing uniform default */;
  const buf = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const [r, g, b, a] = hexToRgba01(perEdgeColors[i] ?? "#9CA3AF");
    buf.set([r, g, b, a], i * 4);
  }
  return buf;
}
```
**Source:** `app/(dashboard)/users/cosmosUtils.ts:113` (`buildLinkBuffer` shape — verified `[s,t]` pairs as Float32Array; per-edge color array is the documented input shape for `setLinkColors`).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 4 separate link kinds for 4 permission tiers | Single `role-folder` kind + `permTier` attribute | CONTEXT 2026-05-12 (Phase 7) | Simpler union, smaller edge-buffer churn on tier filter toggle. |
| Per-leaf folder hubs | Depth-2 collapse with escape hatch | CONTEXT 2026-05-12 | Caps folder count from ~10k+ to ~thousands. |
| Single merged-weight user↔user edge | 5 parallel per-dimension edges | CONTEXT 2026-05-12 | Visual differentiation per dimension; cost: edge count up to 5× per pair. |
| 2D-only AccUsersGraph | Both 2D + 3D Sphere3DGraph | Phase 6 (in flight) | Phase 7 must extend BOTH (folder hubs in 3D conditional on Phase 6 GRAPH-04 GO). |

**Deprecated/outdated:**
- Hardcoded `AccTopologyHubKind = "project" | "role" | "module" | "access" | "user"` — extend to add `"folder"`.
- Patch path `patches/@cosmos.gl+graph+3.0.0-beta.8.patch` (deleted in this branch); current is `+3.0.0-beta.9.patch`.

## Open Questions

1. **"Shared folder access" similarity: direct or transitive?**
   - What we know: `AccFolderPermission` carries only ROLE permissions (Pitfall 2).
   - What's unclear: CONTEXT marks this as Claude's Discretion. A "direct" path would require inventing a per-user folder-access materialization (new pipeline; out of scope per "no new tRPC, no Prisma migration").
   - **Recommendation: TRANSITIVE.** Resolve `user → roleIds (via AccProjectRole) → folderIds (via AccFolderPermission)` once at adapter init, cache in memory. Document that two users with no shared role but who happen to both have access via different roles to the same folder will share a similarity edge — this is the desired transitive semantic.

2. **Similarity edge cap at hub scale.**
   - What we know: Real `AccProjectMember` count is in the low thousands (per Phase 04 sample data). Naive O(n²) is 1e7 — fast.
   - What's unclear: Worst case if hub grows beyond 5k users; per-dimension bucket-size distributions (e.g. "company = LECG" might bucket 80% of users → 1.6e7 edges in that one bucket alone before slider).
   - **Recommendation:** Default `minShared=2` AND per-dimension hard cap of e.g. 50k edges (top-K by sharedCount). Surface the cap in the perf HUD.

3. **3D parallel edges — separate draw calls or interleaved attribute?**
   - What we know: Phase 6 plan 06-05 builds `EdgesLines` as a single LineSegments draw call with an `aEdgeAlphaBase` per-vertex attribute.
   - What's unclear: Whether adding `aDimension` (uint8 → color LUT in fragment shader) blows past WebGL2 vertex-attribute limits at ACC_MAX_EDGES_PER_NODE * 5.
   - **Recommendation:** Pack `aDimension` (3 bits) and `aPermTier` (3 bits) into a single byte; sample a 16×1 RGBA color LUT texture in the edge fragment shader. One extra texture sample per edge fragment is cheap.

4. **3D folder hubs blocked by Phase 6 GRAPH-04 GO/NO-GO.**
   - What we know: GRAPH-04 perf pre-flight is unchecked at time of research (Phase 04 Plan 07 not started).
   - What's unclear: Will folders ship in 3D at all?
   - **Recommendation:** Phase 7 plans split folder-hub work between 2D (definitely ships) and 3D (gated). Wave 0 of Phase 7 verifies the GO/NO-GO artifact and branches accordingly.

5. **`AccGraphSnapshot` currently emits only `kind: "instance"` nodes — where do the project/role hub kinds live today?**
   - What we know: `lib/acc/graphSnapshot.ts:308` emits one `AccGraphInstanceNode` per `(user, project)` instance. Hub kinds (`project`, `role`, `module`, `access`, `user`) are constructed CLIENT-side by `buildAccTopologyGraph` (not in the snapshot).
   - **Implication:** Folder hubs follow the same pattern — built client-side from `accFoldersRouter.getMatrix` output, NOT added to `graphSnapshot.ts`. CONTEXT lists `lib/acc/graphSnapshot.ts` in the modify list, but research suggests this is unnecessary — flag for the planner. Folder hubs belong in `accGraphOrganicLayout.ts` extension only.

## Sources

### Primary (HIGH confidence)
- Codebase (verified by Read/Grep this session):
  - `app/(dashboard)/users/accGraphOrganicLayout.ts:38-218` — `AccTopologyHubKind` union, `buildAccTopologyGraph` shape
  - `app/(dashboard)/users/accGraphFilters.ts` — `GraphFilters` interface, `nodeMatchesFilters` predicate
  - `app/(dashboard)/users/graphRenderers.ts:1316` — `setVisibleIndices` (size=0 + shape=8 visibility pattern)
  - `app/(dashboard)/users/graphRenderers.ts:13-22` — `GraphRenderNode.kind` union
  - `app/(dashboard)/users/cosmosUtils.ts:113` — `buildLinkBuffer` `[s,t]` pair format
  - `lib/acc/graphSnapshot.ts:1-353` — `AccGraphSnapshot` shape (instance-only nodes)
  - `server/routers/acc-folders.ts:1-237` — `getMatrix` return shape (verified all required fields present)
  - `prisma/schema.prisma:454-530` — `AccProjectMember`, `AccRole`, `AccProjectRole`, `AccFolder`, `AccFolderPermission` schemas
  - `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` — verified patch is shader-clamp-only, no API surface added
  - `.planning/phases/06-3d-spherical-graph-with-gravity-at-120fps/06-CONTEXT.md` — 3D phase scope and decisions
  - `.planning/phases/06-3d-spherical-graph-with-gravity-at-120fps/06-03-PLAN.md` — `topologyAdapter.ts` + `filterAdapter.ts` interfaces
  - `.planning/phases/06-3d-spherical-graph-with-gravity-at-120fps/06-04-PLAN.md` — `PhysicsApi.setVisibility` + `aVisible` channel
  - `.planning/phases/06-3d-spherical-graph-with-gravity-at-120fps/06-05-PLAN.md` — `EdgesLines.tsx` + `aEdgeAlphaBase` attribute pattern
  - `.planning/phases/06-3d-spherical-graph-with-gravity-at-120fps/06-08-PLAN.md` — `Sphere3DFilterPanel.tsx` + `filterUrl.ts` lift
- Memories: `project_cosmos_alpha_inversion` (cosmos.gl v3 progress is INVERTED — relevant if Phase 7 introduces any alpha-driven logic), `feedback_widget_interactivity` (interactivity contract for new filter panel controls), `project_aps_data_connector_blocker` (file-activity edges deferred per CONTEXT)

### Secondary (MEDIUM confidence)
- None — all critical claims grounded in codebase reads above.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; reuses existing patched cosmos.gl + Phase 6 r3f stack.
- Architecture: HIGH — every extension point is a verified existing union/buffer/predicate.
- Pitfalls: HIGH for 1, 2, 4, 5 (codebase-grounded); MEDIUM for 3 (depth-collapse semantics depend on user expectation, not code).
- Performance at 5 parallel similarity edges + folder hubs: MEDIUM — needs a Wave-1 perf measurement plan; 2D should be fine, 3D depends on Phase 6 baseline numbers.

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days; tied to Phase 6 plans which are in flux, and Phase 04 GRAPH-04 GO/NO-GO).
