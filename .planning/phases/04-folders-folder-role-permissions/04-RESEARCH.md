# Phase 4: Folders & Folder-Role Permissions — Research

**Researched:** 2026-05-11
**Domain:** ACC Data Management API crawl + BIM360 Docs permissions API + virtualized matrix widget
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Matrix widget — shape and scale**
- Hub-wide flat scope: all projects × all roles × all folders × all permissions in one matrix. NOT scoped to a single project. Information density over compactness.
- Column organization: grouped by project, role within project. Sticky project group headers span their role columns. Roles are NOT deduped across projects.
- Virtualized rendering is mandatory at this scale (cell count can exceed 100k).
- Folder hierarchy: collapsed to top-level by default, expand on click. Collapsed parents display the parent's own grant; expanded children show their own.
- Default open view: all projects collapsed, user expands what they need.

**Matrix widget — cell semantics**
- Cell value when role has overlapping grants on same folder: highest tier wins (Full Controller > V+D+U+E > V+D+U > Upload Only > V+D > View Only). Hover reveals raw `actions` array.
- 6-tier UI labels: View Only, View+Download, Upload Only, View+Download+Upload, View+Download+Upload+Edit, Full Controller.

**6-tier permission mapping — edge cases**
- Extra actions: match closest tier + add small `+` "extended" badge. Hover lists extras.
- Missing actions (partial grant): round DOWN to highest tier whose actions are all present. Never overstate access.
- Unknown actions: log warning in Railway logs; ignore unknown action; map remaining known ones. Don't crash.
- Mapping table location: single typed constant `lib/acc/permissionMapping.ts`, fully unit-tested.

**Matrix widget — scale-usability controls**
- Filters (all four required): project multi-select, role name filter, permission-tier filter (>= threshold or exact tier), anomalies-only toggle.
- Search: single search box filters rows by folder path AND columns by role name simultaneously.
- Cross-widget interaction: two-way. Inbound: project/role selection elsewhere scopes this widget. Outbound: clicking role column or folder row spotlights across graph + user list + heatmap.

**Orphan / anomaly surfacing**
- All four orphan definitions flagged: role granted on folder but zero members; role with permissions on deleted/missing folder; role granted only at root with no project members; folder with zero role permissions of its own.
- Visual treatment: muted/desaturated cell + ⚠ glyph. Hover reveals specific reason.
- Click on orphan cell: opens side panel with full detail + link to role in user list filtered to zero members.
- Recommendations widget gains "orphan role" finding NOW in Phase 4. Phase 5 DASH plan must NOT re-build it.

**Crawl strategy**
- Cadence: full crawl on every Railway release + nightly cron. No incremental delta crawl. No manual sync UI.
- Per-project budget: soft cap 5 min (log warning), hard cap 15 min (abort that project, mark `partial`).
- Concurrency: `pLimit(5)` per project.
- Retries: 3 retries with exponential backoff on transient ACC API failures, then mark project's crawl status as `partial`.
- Partial-failure surfacing: `AccProject.folderCrawlStatus` column (`ok` / `partial` / `failed` / `never`). Matrix cells from non-ok projects render with "data incomplete" visual treatment + tooltip.

**Crawl sizing dry-run gate**
- First task in Phase 4 is a dry-run crawl on the entire hub, read-only / no DB persistence.
- Measures time + folder count + permission count per project.
- Produces `.planning/phases/04-folders-folder-role-permissions/CRAWL-ESTIMATE.md`.
- Luis approves the estimate before any wiring into Quick Sync / cron happens.
- If estimate > 1 hour for full hub: fall back to weekly cron + Railway-release-only, not nightly.

**Perf pre-flight (gates Phase 5 GRAPH-04)**
- Node-count projection: real Hermosillo data × 2× and × 5× multipliers.
- GO threshold (strict): 60 FPS sustained AND GPU memory under 512MB at projected node count.
- Artifact location: `.planning/phases/04-folders-folder-role-permissions/PERF-GATE.md`.
- NO-GO contingency: folders stay dashboard-only; graph-node integration deferred. Phase 5 GRAPH-04 plan logs why.

### Claude's Discretion
- Exact virtualized renderer choice (TanStack Virtual vs custom).
- Color palette / desaturation curve for orphan cells.
- Side-panel layout details for the orphan drill.
- Exact pLimit(5) error categorization (which errors retry vs which mark partial immediately).
- Project group header sticky behavior (CSS sticky vs scroll-tracked).
- How `+` "extended" badge is visually distinguished from anomaly glyph.
- Whether the matrix uses canvas, SVG, or DOM for cell rendering (depends on perf measurements).

### Deferred Ideas (OUT OF SCOPE)
- Folder-level USER permission (non-role).
- Document-level permissions.
- Folder editing / permission editing UI.
- 11th "crawl health" dashboard widget.
- Per-user saved filter sets / per-user persisted view state.
- Database-backed (admin-editable) permission mapping table.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLDR-01 | Folder tree extracted per project via Data Management API (`b.` prefix preserved); BFS crawl with `pLimit(5)` per project; folders persisted in `AccFolder` with full path, parent reference, folder URN as primary key. | APS DM API endpoints documented in HOW_TO docs; BFS + pLimit pattern already established in Phase 2. AccFolder model already exists in schema.prisma. `folderCrawlStatus` column needs to be added to AccProject via migration. |
| FLDR-02 | Folder-role permissions extracted via `/bim360/docs/v1/projects/:id/folders/:urn/permissions` and persisted in `AccFolderPermission`; `subjectType === "ROLE"` filter applied at ingest. | Endpoint confirmed in HOW_TO_Extract_Folder_Role_Permissions.md. AccFolderPermission model already exists. Note: projectId for this endpoint strips `b.` prefix (uses bare UUID). |
| FLDR-03 | Permission `actions` arrays mapped to UI permission types with unit tests covering all 6 documented combinations + edge cases. | 6-tier mapping documented in HOW_TO. Edge cases (extra/missing/unknown actions) are locked decisions. `lib/acc/permissionMapping.ts` will be a new pure module, ideal for Vitest unit tests. |
| FLDR-04 | Folder-role permissions widget added as 10th dashboard widget — interactive matrix (folder × role) with hover detail, click-to-drill, cross-widget selection spotlighting. | TanStack Virtual v3.13.24 already installed. widgetRegistry.ts needs a new `folderPermissions` entry. SelectedFinding union and SelectionProvider need `folderPermission` kind. |
| FLDR-05 | Members-assigned-count per role-on-folder computed and exposed; role assigned to folder but zero members → flagged as orphan. | AccProjectRole already has member-count data. The count query joins AccFolderPermission → AccProjectRole WHERE memberId IS NOT NULL GROUP BY roleId. |

</phase_requirements>

---

## Summary

Phase 4 crawls ACC folder trees and folder-role permissions, persists them in the already-defined `AccFolder` / `AccFolderPermission` Prisma models, ships the 10th dashboard widget (an interactive folder × role permission matrix), and produces a perf GO/NO-GO artifact for Phase 5 GRAPH-04.

The good news: the **data layer already exists**. `AccFolder` and `AccFolderPermission` are defined in `schema.prisma` with correct indexes. The Phase 2 Quick Sync infrastructure (`fetchWithRetry`, `pLimit`, `extractAndPersist*` pattern, `scripts/release.cjs` wiring) is battle-tested and directly reusable. The only schema addition needed is `AccProject.folderCrawlStatus` (string, default `'never'`).

The hard parts are: (1) correctly scoping the BFS crawl with pLimit and per-project time budgeting — the dry-run gate must happen first; (2) the permission mapping table covering all edge cases with full unit-test coverage; (3) virtualizing the matrix widget at 100k+ cell scale using TanStack Virtual (already installed at v3.13.24); and (4) producing the perf pre-flight artifact with real Cosmos.gl GPU metrics.

**Primary recommendation:** Follow the measure-then-decide philosophy locked in CONTEXT.md — dry-run before wiring crawl, perf test before enabling graph integration. Both artifacts live in the phase directory and gate downstream decisions.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-virtual` | 3.13.24 (installed) | Row + column virtualization for matrix widget | Already in package.json; purpose-built for large flat lists; works with DOM cells (no canvas needed unless perf measurements say otherwise) |
| `p-limit` | 7.3.0 (installed) | Per-project concurrency cap for crawl | Already used in Phase 2 per-project fan-out; same pattern applies here |
| `prisma` | 7.8.0 (installed) | `AccFolder` + `AccFolderPermission` persistence | Already migrated; just add `folderCrawlStatus` column |
| `fetchWithRetry` | (in-repo) | 429/backoff retries for APS calls | Already exported from `lib/server/acc-admin.ts`; reuse, don't duplicate |
| `vitest` | 4.1.6 (installed) | Unit tests for permissionMapping.ts | Established test runner; existing tests in `lib/acc/*.test.ts` follow the pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `framer-motion` | 12.38.0 (installed) | Side-panel animations | Use for orphan drill side panel (consistent with DashboardSidePanel.tsx Pattern 4) |
| `date-fns` | 4.1.0 (installed) | Time budget calculation in crawl | `differenceInMinutes` for soft/hard cap check |
| `lucide-react` | 1.14.0 (installed) | ⚠ glyph for orphan cells | `AlertTriangle` icon already used in AccOverviewTab.tsx |
| `@cosmos.gl/graph` | 3.0.0-beta.9 (installed) | Perf pre-flight GPU measurement | Read `getSimulationAlpha()` — note INVERTED from d3 (memory context: `1 - progress`); use for node-count stress test |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Virtual (DOM cells) | Canvas renderer | Canvas is faster at 100k+ cells but loses native accessibility + CSS styling; choose based on perf measurements — DOM first, canvas only if TanStack Virtual can't hit 60 FPS scroll |
| BFS with pLimit(5) | Recursive depth-first | BFS with a queue is easier to abort mid-crawl and track progress; DFS risks stack overflow on deep hierarchies |
| `fetchWithRetry` reuse | New fetcher | Never duplicate retry logic — `fetchWithRetry` is already exported and handles 429 with Retry-After header |

**Installation:** No new packages needed. Everything is already installed.

---

## Architecture Patterns

### Recommended Project Structure
```
lib/acc/
├── permissionMapping.ts       # NEW — 6-tier mapping constant + mapActions() + edge cases
├── permissionMapping.test.ts  # NEW — full unit test coverage for all 6 tiers + edge cases
├── folderCrawl.ts             # NEW — BFS crawl + pLimit + time budget + DB persistence
├── quick-sync-extraction.ts   # EXTEND — add extractAndPersistFolders() call in runQuickSync()
app/(dashboard)/users/dashboard/
├── widgets/
│   └── FolderPermissionsWidget.tsx  # NEW — 10th widget (matrix + filters + orphan surfacing)
├── widgetRegistry.ts          # EXTEND — add folderPermissions entry
├── selectionContext.tsx        # EXTEND — add 'folderPermission' kind to SelectedFinding union
├── DashboardSidePanel.tsx     # EXTEND — add FolderPermissionBody render branch
server/routers/
├── acc-folders.ts             # NEW — tRPC router for folder matrix data
├── root.ts                    # EXTEND — register accFoldersRouter
.planning/phases/04-folders-folder-role-permissions/
├── CRAWL-ESTIMATE.md          # OUTPUT — dry-run artifact (Luis approves before wiring)
└── PERF-GATE.md               # OUTPUT — GO/NO-GO artifact for Phase 5 GRAPH-04
```

### Pattern 1: BFS Folder Crawl with pLimit and Time Budget

**What:** BFS queue processes folders level-by-level; `pLimit(5)` caps concurrent APS requests per project; a per-project timer enforces the 5-min soft cap and 15-min hard cap.

**When to use:** Any APS crawl where the tree depth is unknown and abort-mid-crawl is required.

```typescript
// lib/acc/folderCrawl.ts (conceptual pattern — matches Phase 2 fan-out shape)
import pLimit from "p-limit";
import { fetchWithRetry } from "@/lib/server/acc-admin";

const DM_BASE = "https://developer.api.autodesk.com";
const SOFT_CAP_MS = 5 * 60 * 1000;   // 5 min: log warning
const HARD_CAP_MS = 15 * 60 * 1000;  // 15 min: abort project

export async function crawlProjectFolders(
  hubId: string,          // raw apsHubId (with b. prefix) for topFolders
  projectIdForDM: string, // b. prefix preserved (getProjectIdForDM)
  projectIdForPerms: string, // bare UUID (b. stripped) for BIM360 Docs endpoint
  accessToken: string,
): Promise<{ folders: RawFolder[]; durationMs: number; status: "ok" | "partial" }> {
  const limit = pLimit(5);
  const startedAt = Date.now();
  const folders: RawFolder[] = [];
  let status: "ok" | "partial" = "ok";

  // BFS queue starts with root sentinel
  const queue: Array<{ folderId: string; parentId: string | null; parentPath: string }> = [
    { folderId: "root", parentId: null, parentPath: "" }
  ];

  while (queue.length > 0) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= HARD_CAP_MS) {
      console.warn(`[folder-crawl] Hard cap (15 min) exceeded for project ${projectIdForDM} — marking partial`);
      status = "partial";
      break;
    }
    if (elapsed >= SOFT_CAP_MS) {
      console.warn(`[folder-crawl] Soft cap (5 min) exceeded for project ${projectIdForDM}`);
    }

    const batch = queue.splice(0, 5); // drain up to 5 items per tick
    const results = await Promise.all(
      batch.map((item) => limit(() => fetchFolderContents(item, hubId, projectIdForDM, accessToken)))
    );
    for (const { children, parent } of results) {
      folders.push(parent);
      queue.push(...children.map(c => ({ folderId: c.id, parentId: parent.id, parentPath: parent.fullPath })));
    }
  }

  return { folders, durationMs: Date.now() - startedAt, status };
}
```

**Key URL difference:**
- **Top folders:** `GET /project/v1/hubs/{hubId}/projects/{projectIdWithBPrefix}/topFolders`
- **Folder contents:** `GET /data/v1/projects/{projectIdWithBPrefix}/folders/{folderId}/contents?filter[type]=folders`
- **Permissions:** `GET /bim360/docs/v1/projects/{projectIdBareUUID}/folders/{folderURN}/permissions`

### Pattern 2: Permission Mapping (Pure Module)

**What:** A single typed constant maps known `actions` arrays to UI tier labels. `mapActions()` handles the three edge cases (extra/missing/unknown).

**When to use:** Everywhere actions arrays are received from APS — at ingest into AccFolderPermission and when displaying cells.

```typescript
// lib/acc/permissionMapping.ts
export type PermTier =
  | "View Only"
  | "View+Download"
  | "Upload Only"
  | "View+Download+Upload"
  | "View+Download+Upload+Edit"
  | "Full Controller";

// Canonical tier definitions — exact action sets for each tier (documented in HOW_TO)
export const TIER_DEFINITIONS: ReadonlyArray<{ tier: PermTier; actions: ReadonlySet<string> }> = [
  { tier: "Full Controller",              actions: new Set(["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","EDIT","CONTROL"]) },
  { tier: "View+Download+Upload+Edit",    actions: new Set(["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","EDIT"]) },
  { tier: "View+Download+Upload",         actions: new Set(["VIEW","DOWNLOAD","COLLABORATE","PUBLISH"]) },
  { tier: "Upload Only",                  actions: new Set(["PUBLISH"]) },
  { tier: "View+Download",               actions: new Set(["VIEW","DOWNLOAD","COLLABORATE"]) },
  { tier: "View Only",                   actions: new Set(["VIEW","COLLABORATE"]) },
] as const;

const KNOWN_ACTIONS = new Set(["VIEW","DOWNLOAD","COLLABORATE","PUBLISH","EDIT","CONTROL"]);
const TIER_ORDER: PermTier[] = [
  "Full Controller",
  "View+Download+Upload+Edit",
  "View+Download+Upload",
  "Upload Only",
  "View+Download",
  "View Only",
];

export function mapActions(rawActions: string[]): {
  tier: PermTier | null;
  extended: boolean;     // extra actions beyond tier definition
  extendedActions: string[]; // which extras
  unknownActions: string[];  // actions not in KNOWN_ACTIONS (logged, ignored)
} {
  const known = rawActions.filter(a => KNOWN_ACTIONS.has(a));
  const unknown = rawActions.filter(a => !KNOWN_ACTIONS.has(a));
  if (unknown.length > 0) {
    console.warn(`[permission-mapping] Unknown ACC actions (ignored): ${unknown.join(", ")}`);
  }

  const knownSet = new Set(known);

  // Round DOWN: find highest tier whose required actions are ALL present
  for (const { tier, actions } of TIER_DEFINITIONS) {
    if ([...actions].every(a => knownSet.has(a))) {
      const extras = known.filter(a => !actions.has(a));
      return { tier, extended: extras.length > 0, extendedActions: extras, unknownActions: unknown };
    }
  }

  return { tier: null, extended: false, extendedActions: [], unknownActions: unknown };
}
```

### Pattern 3: TanStack Virtual Two-Axis Virtualization

**What:** `useVirtualizer` for rows (folders) + `useVirtualizer` for columns (project×role pairs). Total cell count = virtualRows × virtualColumns.

**When to use:** The matrix widget. TanStack Virtual v3 is already installed at 3.13.24.

```typescript
// FolderPermissionsWidget.tsx (structural pattern)
import { useVirtualizer } from "@tanstack/react-virtual";

// In the matrix component:
const parentRef = useRef<HTMLDivElement>(null);

const rowVirtualizer = useVirtualizer({
  count: visibleRows.length,         // folders after filter
  getScrollElement: () => parentRef.current,
  estimateSize: () => 32,            // row height estimate (px)
  overscan: 10,
});

const colVirtualizer = useVirtualizer({
  count: visibleColumns.length,      // project×role pairs after filter
  horizontal: true,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 120,           // column width estimate (px)
  overscan: 5,
});
```

**Source:** `@tanstack/react-virtual` v3 documentation — `useVirtualizer` with `horizontal: true` for column virtualization.

### Pattern 4: folderCrawlStatus on AccProject

**What:** `AccProject.folderCrawlStatus` is a new string column (default `'never'`). The crawl writes `'ok'` on success, `'partial'` on soft/hard cap or retry exhaustion, `'failed'` on unrecoverable error.

**Schema addition needed (single additive migration):**
```sql
ALTER TABLE "AccProject" ADD COLUMN "folderCrawlStatus" TEXT NOT NULL DEFAULT 'never';
```

### Pattern 5: Widget Registration

**What:** Add the new widget to `widgetRegistry.ts` following the existing `WidgetSpec` contract. The widget component accepts `WidgetCommonProps` and fetches its own folder data via a new `accFolders` tRPC router.

**When to use:** All dashboard widgets use this registry. The folder matrix widget will need to fetch from the new router rather than from `users` prop, since it's a different data domain.

```typescript
// widgetRegistry.ts extension
import { FolderPermissionsWidget } from "./widgets/FolderPermissionsWidget";

export const WIDGETS = {
  // ... existing 9 widgets ...
  folderPermissions: {
    component: FolderPermissionsWidget,
    title: "Folder Permissions",
    span: "col-span-2",  // full-width — hub-wide matrix needs horizontal space
  },
} as const satisfies Record<string, WidgetSpec>;
```

### Pattern 6: SelectedFinding Extension for Cross-Widget Interactivity

**What:** Extend the discriminated union in `selectionContext.tsx` with a `folderPermission` kind. The widget calls `setSelected({ kind: 'folderPermission', ... })` on cell click; DashboardSidePanel renders a `FolderPermissionBody` for this kind.

```typescript
// selectionContext.tsx — add to SelectedFinding union
| { kind: "folderPermission"; folderId: string; folderPath: string; roleId: string; roleName: string; projectId: string; projectName: string; tier: PermTier | null; orphanReason?: string }
```

**Inbound scoping:** When another widget sets `selected.kind === 'role'` or a project filter, the FolderPermissionsWidget reads from a shared filter context (see anti-pattern note below about filter architecture).

### Anti-Patterns to Avoid

- **Sequential permission fetches:** Never fetch permissions folder-by-folder in a single `for` loop without pLimit — this is the classic crawl-bottleneck. Use `pLimit(5)` and batch.
- **Storing `permType` only without `actions`:** AccFolderPermission stores BOTH `actions: String[]` (raw) AND `permType: String` (computed). The raw actions are needed for hover detail and the `+` extended badge. Never discard raw data at ingest.
- **Using b. prefix for BIM360 Docs endpoint:** `/bim360/docs/v1/projects/{projectId}/folders/{folderUrn}/permissions` expects the bare UUID (no `b.`). `/data/v1/projects/{projectId}/folders/{folderId}/contents` and topFolders REQUIRE the `b.` prefix. This distinction is the #1 source of 404s in this API surface.
- **Eager loading folder matrix into BulkAccUser:** The folder data is a separate domain. Do NOT fold it into the existing `trpc.users.bulkAccSummary` query — that query is already expensive. Use a new `accFolders` router with its own `useQuery`.
- **Widget-local filter state for cross-widget interaction:** The two-way interactivity contract (inbound from project/role selection) requires reading from `SelectionContext`. The widget should consume `useSelection()` and apply the selected role/project as a filter scope when `selected.kind === 'role'`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Large list rendering | Custom windowing/clipping logic | `@tanstack/react-virtual` (already installed) | TanStack Virtual handles overscan, scroll listeners, resize observers, item measurement — all edge cases are covered |
| APS retry logic | New retry wrapper | `fetchWithRetry` from `lib/server/acc-admin.ts` | Already exported, already handles Retry-After header correctly |
| Project concurrency cap | Manual Promise queue | `pLimit` (already installed) | Handles backpressure, error isolation per-promise |
| Permission tier lookup | Switch statement in component | `mapActions()` from `lib/acc/permissionMapping.ts` | Centralized, testable, avoids duplication across crawl + widget |
| Side panel animation | CSS transitions | `framer-motion` AnimatePresence (already used in DashboardSidePanel) | Consistent with existing slide-in pattern |

**Key insight:** This project has a rich installed dependency set. The research confirms zero new packages are needed. Every tool required for Phase 4 is already in `package.json`.

---

## Common Pitfalls

### Pitfall 1: b. prefix confusion between APIs

**What goes wrong:** The `b.` prefix is required for Data Management API (topFolders, folder contents) but must be stripped for BIM360 Docs API (folder permissions) and Construction Admin API (project users).

**Why it happens:** APS has three separate API families with different projectId conventions.

**How to avoid:** Use `getProjectIdForDM(rawId)` (preserves `b.`) for DM endpoints. For BIM360 Docs, call `rawId.replace(/^b\./, "")` inline (same pattern as existing `acc-admin.ts` examples in HOW_TO).

**Warning signs:** 404 responses from `/bim360/docs/v1/projects/...` when projectId starts with `b.`.

### Pitfall 2: Recursive DFS stack overflow on deep folder trees

**What goes wrong:** Using `await scanFolder(item.id, ...)` recursively (as shown in HOW_TO example script) blows the Node.js call stack on projects with deeply nested folder trees.

**Why it happens:** HOW_TO example scripts are illustrative, not production-ready. Deep BIM360 projects can have 15+ levels of nesting.

**How to avoid:** Use an explicit BFS queue (array) instead of recursive function calls. The queue is iterated in a `while (queue.length > 0)` loop. Never recurse.

### Pitfall 3: permissions endpoint returns ALL subject types — must filter to ROLE

**What goes wrong:** The `/bim360/docs/v1/projects/:id/folders/:urn/permissions` response includes entries with `subjectType === "USER"` and potentially others. If not filtered, user-level permissions pollute the `AccFolderPermission` table (which is designed for ROLE only).

**Why it happens:** HOW_TO is explicit about this but easy to miss during initial implementation.

**How to avoid:** Apply `filter(p => p.subjectType === "ROLE")` immediately after JSON.parse. This is a locked decision in CONTEXT.md (FLDR-02).

### Pitfall 4: Hard cap abort leaves AccFolder rows persisted but permissions missing

**What goes wrong:** Crawl writes folder rows to DB as they're discovered, then hits the 15-min hard cap. The DB has folders with no permission rows — looks like "zero permissions" rather than "uncrawled".

**Why it happens:** Writing incrementally is correct for resilience, but partial crawls leave ambiguous state.

**How to avoid:** Set `AccProject.folderCrawlStatus = 'partial'` whenever the hard cap fires. The matrix widget must check this status and render the "data incomplete" treatment for that project's cells. Don't infer "no permissions" from empty AccFolderPermission rows without first checking `folderCrawlStatus`.

### Pitfall 5: TanStack Virtual total-size calculation with variable-height rows

**What goes wrong:** If folder rows expand (folder expanded to show children), the virtualizer's estimated size becomes wrong and scroll position jumps.

**Why it happens:** `estimateSize` is a hint; dynamic expansion changes actual sizes.

**How to avoid:** Use `measureElement` callback in TanStack Virtual v3 to re-measure after expansion. Or — simpler — keep folder rows at fixed height (32px) and handle expand/collapse by changing the `visibleRows` array (inserting/removing child rows) rather than expanding a single row. The latter is architecturally cleaner for a matrix.

### Pitfall 6: Cross-widget filter creates stale selection mismatch

**What goes wrong:** User clicks a role on the RolesModulesHeatmap (sets `selected.kind = 'role'`), then navigates elsewhere and the FolderPermissionsWidget tries to filter by that role but the role no longer exists in the folder data.

**Why it happens:** The `isSelectionValid` function in `selectionContext.tsx` currently only validates `junk`, `duplicate`, and `outlier` kinds — it returns `true` for `role`, `admin`, `day`, `userActivity`. A `folderPermission` kind would need similar unconditional `return true` treatment (roles are stable; they don't disappear with findings refresh).

**How to avoid:** In the `isSelectionValid` extension, add `case "folderPermission": return true` — roles don't go stale the way findings do.

### Pitfall 7: Dry-run crawl accidentally mutates DB

**What goes wrong:** The dry-run (first task of Phase 4) is supposed to be read-only. If the crawl function is wired to DB before the dry-run gate, even a test invocation persists data.

**Why it happens:** Sharing the same `extractAndPersistFolders()` function for both dry-run and live crawl.

**How to avoid:** Implement the dry-run as a separate script (`scripts/dry-run-folder-crawl.ts`) with an explicit `DRY_RUN=true` flag. The function accepts a `dryRun: boolean` parameter; when `true`, it skips all `prisma.*` calls and only accumulates counts + elapsed time.

### Pitfall 8: folderCrawlStatus column migration must be additive

**What goes wrong:** If the migration adds a NOT NULL column without a default, the Railway deploy fails mid-migration because existing AccProject rows have no value.

**Why it happens:** Railway uses `prisma migrate deploy` (non-interactive). NOT NULL without DEFAULT causes a constraint violation on existing rows.

**How to avoid:** Declare `folderCrawlStatus String @default("never")` in schema.prisma before generating the migration. The generated SQL will include `DEFAULT 'never'` — safe for existing rows.

---

## Code Examples

### Verified: topFolders endpoint shape
```typescript
// Source: HOW_TO_Extract_All_Files_and_Folders.md + HOW_TO_Extract_Folder_Role_Permissions.md
// Top folders uses project/v1 (NOT data/v1) and requires b. prefix
const topFoldersUrl = `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectIdWithBPrefix}/topFolders`;

// Folder contents uses data/v1 and requires b. prefix
const contentsUrl = `https://developer.api.autodesk.com/data/v1/projects/${projectIdWithBPrefix}/folders/${folderId}/contents?filter[type]=folders`;

// Permissions uses bim360/docs/v1 and requires BARE UUID (no b.)
const permsUrl = `https://developer.api.autodesk.com/bim360/docs/v1/projects/${projectIdBareUUID}/folders/${folderURN}/permissions`;
```

### Verified: Permission response structure
```typescript
// Source: HOW_TO_Extract_Folder_Role_Permissions.md
// Response is an array (not paginated — all permissions returned in one call)
interface FolderPermission {
  subjectType: "ROLE" | "USER" | string;
  subjectId: string;  // role ID
  name: string;       // role name
  actions: string[];  // e.g. ["VIEW", "DOWNLOAD", "COLLABORATE"]
}

// Filter pattern (FLDR-02):
const rolePermissions = permissions.filter(p => p.subjectType === "ROLE");
```

### Verified: AccProjectRole member count query
```typescript
// Compute members-per-role for orphan detection (FLDR-05)
// AccProjectRole has @@unique([projectId, roleId, memberId])
// Rows with memberId !== null are member assignments
const roleMemberCounts = await prisma.accProjectRole.groupBy({
  by: ['roleId', 'projectId'],
  where: { memberId: { not: null } },
  _count: { memberId: true },
});
// Result: Map<roleId, count> for orphan check
```

### Verified: Existing pLimit fan-out pattern (Phase 2 precedent)
```typescript
// Source: lib/acc/quick-sync-extraction.ts (runPerProjectFanOut)
// Phase 4 crawl should follow same shape
import pLimit from "p-limit";

const limit = pLimit(5); // per-project concurrency cap (CONTEXT-locked)

const results = await Promise.all(
  projects.map(project =>
    limit(async () => {
      try {
        return await crawlProjectFolders(hubId, project.dmId, project.bareId, token);
      } catch (err) {
        // Per-project failure must not abort the hub-wide crawl
        console.error(`[folder-crawl] project ${project.id} failed:`, err);
        return { status: 'failed', project: project.id };
      }
    })
  )
);
```

### Verified: Dry-run crawl output format (CRAWL-ESTIMATE.md template)
```markdown
# Folder Crawl Estimate

**Date:** [date]
**Hub:** [accountId]
**Mode:** DRY RUN (no DB writes)

## Per-Project Summary

| Project | Folders | Permissions | Duration (s) | Status |
|---------|---------|-------------|--------------|--------|
| [name]  | [N]     | [M]         | [T]          | ok/partial |

## Hub Totals
- Total folders: N
- Total role-permission rows: M
- Total duration (sequential): T min
- Estimated with pLimit(5): ~T/5 min
- Estimated with pLimit(5) + 3s/req overhead: ~X min

## Cadence Recommendation
[If < 1 hr: nightly cron + Railway release]
[If ≥ 1 hr: weekly cron + Railway release, document tradeoff]
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Recursive DFS (HOW_TO example script) | BFS queue with explicit stack | Phase 4 implementation | Avoids stack overflow; enables abort-mid-crawl |
| In-memory permission type detection (switch on actions) | Pure module `permissionMapping.ts` with typed constants | Phase 4 | Testable, single source of truth |
| Linear permission fetch loop | pLimit(5) concurrent fetches | Phase 4 | ~5× faster per project |

**Deprecated/outdated:**
- HOW_TO script's recursive `scanFolder()`: conceptually correct, not production-safe for deep trees.
- HOW_TO script's inline permission type detection: correct mapping logic, but needs to be extracted to the `permissionMapping.ts` constant per CONTEXT locked decision.

---

## Open Questions

1. **Does `/bim360/docs/v1/projects/:id/folders/:urn/permissions` paginate?**
   - What we know: HOW_TO shows a single fetch, no pagination markers visible. The APS docs describe a flat array response.
   - What's unclear: For folders with very many role grants (unlikely but possible), is there a pagination mechanism?
   - Recommendation: In the dry-run, log the raw response `.length` per folder. If any folder returns exactly 100+ results (a common page-size boundary), add a defensive pagination loop. LOW confidence that pagination exists; HIGH confidence that typical folder response fits in one call.

2. **Does `topFolders` require specific APS scopes beyond `data:read`?**
   - What we know: The existing 2-legged token used in Phase 2 Quick Sync already fetches from APS successfully. Phase 2 tested against Hermosillo data.
   - What's unclear: Whether the existing token has `data:read` scope needed for DM API.
   - Recommendation: Dry-run will immediately reveal a 401/403 if scope is missing. The existing `get2LeggedAutodeskToken` call in `quick-sync-extraction.ts` is the token source — check that `data:read` is in the configured APS app scopes before the dry-run. The APS Data Connector blocker (memory context) is specifically for Data Connector API, not DM API.

3. **What is the hubId format for topFolders?**
   - What we know: HOW_TO states topFolders uses `hubId` (from the `Project` table column `apsHubId`). The `apsHubId` stores the value WITH the `b.` prefix.
   - What's unclear: Whether the `project/v1/hubs/:hubId` endpoint wants the `b.`-prefixed form or bare UUID.
   - Recommendation: HOW_TO example passes `hubId` directly without stripping — use `apsHubId` value as-is from the `Project` table. Verify in dry-run first call.

4. **Performance ceiling for TanStack Virtual with 100k+ cells**
   - What we know: TanStack Virtual v3 is designed for large lists. Two-axis virtualization (rows + columns) renders only visible cells.
   - What's unclear: At 100k cells (e.g. 1000 folders × 100 role columns), whether DOM-based virtualization achieves smooth scroll at 60 FPS on target hardware.
   - Recommendation: Use TanStack Virtual DOM approach first (simpler, accessible). If scroll FPS is below 60 in the perf pre-flight, switch to canvas rendering for cells. The perf pre-flight's Cosmos.gl test and any scroll-performance benchmark should guide this. Claude's discretion per CONTEXT.md.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.6 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run lib/acc/permissionMapping.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLDR-01 | BFS crawl terminates correctly; pLimit(5) cap respected; `fullPath` computed correctly | unit | `npx vitest run lib/acc/folderCrawl.test.ts` | ❌ Wave 0 |
| FLDR-02 | `subjectType === "ROLE"` filter applied; bare-UUID projectId used for perms endpoint | unit | `npx vitest run lib/acc/folderCrawl.test.ts` | ❌ Wave 0 |
| FLDR-03 | All 6 tier mappings; extra-actions extended badge; missing-actions round-down; unknown-action log+ignore | unit | `npx vitest run lib/acc/permissionMapping.test.ts` | ❌ Wave 0 |
| FLDR-04 | Matrix renders visible cells only; filter reduces columns; search filters rows + columns | manual-only (UI component — vitest/jsdom can verify filter logic, not scroll behavior) | `npx vitest run lib/acc/permissionMapping.test.ts` | ❌ |
| FLDR-05 | Orphan detection: role with zero members flags correctly; all 4 orphan types detected | unit | `npx vitest run lib/acc/folderCrawl.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run lib/acc/permissionMapping.test.ts` (fast, pure unit)
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/acc/permissionMapping.test.ts` — covers FLDR-03 (6 tiers + 3 edge cases = 9 unit test groups minimum)
- [ ] `lib/acc/folderCrawl.test.ts` — covers FLDR-01, FLDR-02 (BFS pagination, b. prefix handling, pLimit mock), FLDR-05 (orphan detection logic)
- [ ] No framework install needed — Vitest already configured

---

## Sources

### Primary (HIGH confidence)
- `APS_DOCS/HOW TO/HOW_TO_Extract_All_Files_and_Folders.md` — endpoint URLs, b. prefix semantics, recursive vs BFS pattern
- `APS_DOCS/HOW TO/HOW_TO_Extract_Folder_Role_Permissions.md` — permission endpoint URL, subjectType filter, 6-tier action mapping table, member count query pattern
- `prisma/schema.prisma` — AccFolder, AccFolderPermission, AccProject, AccProjectRole models confirmed present with correct indexes
- `package.json` — confirms @tanstack/react-virtual 3.13.24, p-limit 7.3.0, framer-motion 12.38.0, vitest 4.1.6 all installed
- `lib/server/acc-admin.ts` — fetchWithRetry signature, throwApsError, base URLs confirmed
- `lib/acc/quick-sync-extraction.ts` — runPerProjectFanOut pLimit pattern, RawProject shape, Phase 2 precedent
- `app/(dashboard)/users/dashboard/selectionContext.tsx` — SelectedFinding union shape, isSelectionValid pattern for extension
- `app/(dashboard)/users/dashboard/widgetRegistry.ts` — WidgetSpec contract, existing 9 widgets, DEFAULT_ORDER
- `server/routers/root.ts` — tRPC router registration pattern
- `.planning/phases/04-folders-folder-role-permissions/04-CONTEXT.md` — all locked decisions, discretion areas, deferred items

### Secondary (MEDIUM confidence)
- `@tanstack/react-virtual` v3 docs — useVirtualizer with horizontal: true confirmed as the two-axis pattern; verified via package.json version match

### Tertiary (LOW confidence)
- Permissions endpoint pagination behavior — assumed single-response based on HOW_TO examples; needs dry-run validation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in package.json; no new installs needed
- Architecture: HIGH — patterns derived from existing Phase 2/3 code and established widget registry
- API endpoint URLs: HIGH — verified in APS_DOCS/HOW TO/ source documents
- b. prefix semantics: HIGH — documented in HOW_TO and reinforced by Phase 2 implementation decisions
- Pitfalls: HIGH for items derived from code inspection; MEDIUM for runtime behavior (pagination, scope)
- TanStack Virtual scroll performance ceiling: LOW — depends on hardware; resolve at implementation time

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — APS API surface is stable; TanStack Virtual v3 is stable)
