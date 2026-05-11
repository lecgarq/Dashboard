# Feature Research

**Domain:** ACC extraction enrichment — surfacing v2.0 API data into existing user list / spatial graph / dashboard surfaces
**Researched:** 2026-05-08
**Confidence:** HIGH (APS HOW_TO docs are ground truth; existing codebase is directly readable; feature placement decisions are based on actual component boundaries)

---

## Scope Constraint (Do Not Violate)

All features below surface into **existing surfaces only**: user list (`UsersDirectoryClient`), spatial graph (`AccUsersGraph`), and Access Analysis dashboard (`DashboardClient` + 9 widgets). No new tabs, pages, or views. This constraint is enforced at every feature below.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that complete the extraction layer or make existing surfaces coherent with the new data. Missing these = the v2.0 milestone ships incomplete.

| Feature | Where It Surfaces | Why Expected | Complexity | Dependencies |
|---------|-------------------|--------------|------------|--------------|
| **Members matrix: `status` field visible** (`"active"` / `"pending"` / `"deleted"`) | User list column + side panel | Users who see a "pending" member in ACC Admin UI expect to see the same status here; without it the list feels wrong for orgs with invited-but-not-joined users | S | Members matrix extraction |
| **Members matrix: `companyName` field** (per-project company, not hub-level companyRole) | User list column + side panel | `companyRole` already exists but is hub-level; project-level `companyName` is what the ACC Members tab shows; missing it creates an obvious gap | S | Members matrix extraction |
| **Members matrix: `addedOn` already exists; verify it comes from project endpoint** | User list (existing), dashboard RecentlyAdded widget | Currently sourced from HQ v1 `created_at`; the project-member endpoint exposes `addedOn` natively and supports `sort=addedOn desc`; source switch needed for per-project accuracy | S | Members matrix extraction |
| **Members matrix: full `products` array** (per-module access: `"administrator"` / `"member"` / `"none"`) | Side panel module detail; filter facets | Users cannot currently see per-module access level — only whether a module is present. "I'm in Build as admin vs member" is a real permission distinction managers check | M | Members matrix extraction; Prisma schema for `ProjectMemberProduct` join table |
| **Members matrix: `accessLevels.projectAdmin` + `accessLevels.executive`** | User list badge; side panel; filter facet | `isAccountAdmin` exists (hub-level). Per-project admin is different and currently not exposed. The ACC Members tab shows this distinction prominently — users expect it | S | Members matrix extraction |
| **Last sign-in enriched to project-level** (currently HQ v1 hub-wide; project endpoint returns `lastSignIn` per project-user) | User list sortable column; side panel; ActiveUserTiers widget | ActiveUserTiers widget already bucketes by `lastSignIn` — but that is hub-level. Project-level last-sign-in is more accurate for per-project dormancy analysis | M | Construction Admin API `?fields=lastSignIn` per project fetch |
| **`phone.number` stored and shown** | Side panel only | The ACC Members tab shows phone; PMs use it to contact members; it belongs in the side panel as contact info | S | Members matrix extraction |
| **Project info: `type`, `jobNumber`, `createdAt`** stored in Prisma `Project` table | Side panel project list; graph project node tooltip | Currently the graph shows project IDs/names only. Adding type and job number completes the project node's identity | S | Project info extraction; Prisma `Project` table |
| **Hub roles extracted** (HQ v2 `industry_roles` master list) | Filter facet on graph; dashboard heatmap rows | Currently roles come through user-level data; hub master list enables reliable de-duplication and consistent naming across projects | S | Hub roles extraction; Prisma `Role` table |
| **Per-project industry roles** (construction admin v2 per-project roles with `services.document_management.access_level`) | Dashboard RolesModulesHeatmap enrichment; side panel per-project role detail | Hub roles and project roles diverge — a role named "Architect" may have different default module access per project. The heatmap currently shows hub-level role patterns | M | Hub roles + per-project roles extraction; Prisma `Role` table with project FK |
| **WHO-added attribution in RecentlyAdded widget** | Dashboard RecentlyAdded widget (existing) | The widget currently shows WHEN someone was added (90-day heatmap). The milestone locks in "who added them" — users drilling down on a day expect to see "added by Bob Smith"; the side panel today shows no attribution | M | Activity log extraction (Data Connector); join `admin_activities.csv` `Member Added` events to `addedOn` dates |
| **Manual sync trigger with job-status surface** | User list sync button (existing pattern) | Data Connector jobs are async (minutes to hours); users need to see "job running / success / failed" rather than a spinner that times out | M | Backend job status tracking; tRPC subscription or polling endpoint |

### Differentiators (High-Value Polish)

Features that make v2.0 genuinely more useful than the v1.0 dashboard — not just filling in blank columns.

| Feature | Where It Surfaces | Value Proposition | Complexity | Dependencies |
|---------|-------------------|--------------------|------------|--------------|
| **Folder tree in graph: folder nodes as 5th node type** | Spatial graph | Adds the "where can this person go in the file system?" dimension. A PM can trace: User → Role → Folder node → what permissions that implies. No other general-purpose BIM dashboard exposes this | L | Folder tree extraction (recursive DM API); Prisma `Folder` table; perf feasibility phase **must complete first** |
| **Folder-role permissions widget (10th dashboard widget)** — matrix of Folder × Role with permission level cell | Dashboard (adds 10th widget to grid) | Shows "which roles have Full Controller vs View-Only on which folders" across projects. Currently there is no folder-permissions surface anywhere in the dashboard. This is the primary new analytical insight of v2.0 | L | Folder extraction + folder-role permissions extraction; both Prisma tables complete; **depends on folder tree extraction** |
| **Per-module access level as a filter facet** — filter graph by `administrator` / `member` / `none` per product key | Spatial graph filter panel (extends existing FILT-03 module toggle) | FILT-03 only shows which modules a user has; it does not distinguish admins from members. "Show me only module admins for Build" is a real PM diagnostic | M | Full `products` array in members matrix (see table stakes above) |
| **`accessLevels.projectAdmin` as a filter facet** | Spatial graph filter panel (extends existing filter panel) | Adds per-project admin filtering distinct from the existing `isAccountAdmin` (hub-level) filter. "Show me all users who are project admins on any project" | S | `accessLevels` in members matrix |
| **Last file activity column + side-panel detail** — most recent file action (action type + file name + date) per user | User list sortable column; side panel "last activity" section | Bridges "last sign-in" (which only tells you they logged in) with "did they actually do file work". Answers "is this person active in the BIM process or just an account holder?" | M | Activity log extraction (Data Connector); `project_activities.csv` parsed for file actions; depends on activity log extraction completing first |
| **RecentlyAdded widget: admin attribution in drill-down** — clicking a day cell shows "added by [Admin Name]" for each member | Dashboard RecentlyAdded widget (existing, click-to-drill-down already exists via SelectionContext) | Turns the heatmap from "how many added" into an audit trail. PMs can answer "who is adding contractors to our projects without approval?" | M | WHO-added attribution (table stakes above); activity log extraction |
| **`status` as a filter facet** — filter user list and graph by `active` / `pending` / `deleted` | User list filter; graph filter panel | Lets PMs clean up invited-but-never-joined users without opening ACC Admin | S | `status` in members matrix (table stakes above) |
| **KpiStrip enrichment** — add "pending invites" and "project admins" counts to the existing KPI strip | Dashboard KpiStrip widget (existing) | Two new KPI tiles computed from `status === "pending"` count and `accessLevels.projectAdmin` count; costs are negligible since the data already arrives via members matrix extraction | S | `status` + `accessLevels` in members matrix |
| **AdminConstellation widget enrichment** — distinguish hub admins vs project admins in the existing constellation layout | Dashboard AdminConstellation widget (existing, currently shows `isAccountAdmin` only) | With `accessLevels.projectAdmin` available, the constellation can add a second tier: hub admin (center) vs project admin (ring) vs executive (outer ring). Three-tier radial layout is immediately more informative | M | `accessLevels` in members matrix; project-admin data per user |
| **Hub role vs per-project role color-coded in graph** — second role dimension without adding a second node type | Spatial graph edge coloring | Currently all role edges are a single color. With hub roles vs project-specific role variants, edge color can encode "this is the hub master role" vs "this is a project override". Adds signal without node-count explosion | M | Hub roles + per-project roles in Prisma; graph rebuild to consume role source field |

### Anti-Features (Explicitly Excluded)

| Anti-Feature | Why It Looks Tempting | Why It Is Excluded | What to Do Instead |
|--------------|----------------------|--------------------|--------------------|
| **Activity Log view / dedicated activity page** | Activity data is rich; a timeline view seems valuable | Milestone explicitly prohibits new tabs/pages/views. An activity log page is a product feature of its own and would balloon scope | Surface last-file-activity as a column in user list and as a side-panel section only |
| **Folder permissions as a new page/view** | Folder × Role × Project matrix is complex enough to want its own page | Same prohibition as above; also the matrix is manageable as a 10th dashboard widget scoped to the selected project | Add as a dashboard widget with project-selector toggle |
| **Folder nodes for files (not just folders)** | File-level graph would show "which user touched which file" | File count per project can be in the tens of thousands; adding file nodes would make the graph unintelligible and trigger the exact node-count explosion that excluded folder nodes in v1.0. Files in the graph are always an anti-feature | Show file names in side-panel activity section only (text, not nodes) |
| **Real-time / automatic activity sync** | "The dashboard should update when someone is added" | Data Connector is async (minutes to hours job latency); there is no push API for activities. Auto-sync would require a background scheduler, queue, and cost unpredictable Autodesk API consumption | Manual sync trigger with job-status indicator; user controls when to pull |
| **Permission editing** | "Add a button to change folder permissions from the dashboard" | Read-only architecture is a locked constraint. Write operations require ACC Admin API write scopes + audit logging + optimistic UI rollback — a separate product concern | Link to ACC Admin Console for all write operations |
| **Per-user per-folder permission graph** | "Show me every folder a user can access" | Each user × folder × permission triple would produce millions of graph edges for a hub with deep folder trees; this is the exact problem excluded in v1.0 ("multiplies node count unmanageably") | Show per-user folder access as a text list in the side panel only |
| **Phone number as a filter facet** | Phone data is in the members matrix | Phone is a contact detail, not an analytical dimension. Filtering by phone number is never a PM use case | Side panel only — contact info, not filter |
| **`executive` access level as a separate graph node** | `accessLevels.executive` is in the API response | "Executive" is an access flag, not a separate identity. Making it a graph node creates confusion with Role nodes. It belongs as a badge on the User node | Display as badge in side panel; include in filter facet as a checkbox alongside `projectAdmin` |
| **D3-hierarchy tree for folder visualization** | d3-hierarchy is already a dependency (`d3-hierarchy` in PROJECT.md stack) | The spatial graph uses Cosmos.gl (WebGL). Mixing a D3 SVG tree inside a Cosmos canvas frame defeats the GPU renderer and creates z-index conflicts | Folder nodes enter the Cosmos graph as the 5th node type; d3-hierarchy is only used for the folder-role permissions widget layout if needed |
| **Automated "who added whom" email notifications** | Attribution data makes it feel like an audit system | This is a dashboard, not a notification service. Email delivery adds SMTP/SendGrid, subscription management, and GDPR surface area | Surface attribution in the RecentlyAdded widget drill-down only |

---

## Feature Dependencies

```
[Members matrix extraction — Construction Admin /projects/:id/users]
    └──required by──> [status field in user list]
    └──required by──> [companyName in side panel]
    └──required by──> [full products array + access levels]
    └──required by──> [addedOn source correction]
    └──required by──> [phone in side panel]
    └──required by──> [per-module access level filter facet]
    └──required by──> [accessLevels.projectAdmin filter + badge]
    └──required by──> [KpiStrip "pending invites" + "project admins" tiles]
    └──required by──> [AdminConstellation 3-tier enrichment]

[Project info extraction — Construction Admin /accounts/:id/projects]
    └──required by──> [Project node tooltip enrichment in graph]
    └──required by──> [type + jobNumber in side panel project list]

[Hub roles extraction — HQ v2 /accounts/:id/industry_roles]
    └──required by──> [Per-project roles extraction]
    └──required by──> [Hub vs project role color encoding in graph]
    └──required by──> [RolesModulesHeatmap row enrichment]

[Per-project roles extraction — HQ v2 /accounts/:id/projects/:id/industry_roles]
    └──required by──> [Hub vs project role distinction in graph]
    └──required by──> [per-project role detail in side panel]
    └──requires──> [Hub roles extraction] (hub roles define the master dictionary)

[Folder tree extraction — DM API recursive topFolders + folder contents]
    └──BLOCKS──> [Folder nodes in spatial graph]
    └──BLOCKS──> [Folder-role permissions widget (10th widget)]
    └──required by──> [Folder-role permissions extraction]
    └──PERF RISK: must complete feasibility verification before committing to integration phases]

[Folder-role permissions extraction — BIM360 Docs /projects/:id/folders/:urn/permissions]
    └──required by──> [Folder-role permissions widget]
    └──requires──> [Folder tree extraction]
    └──requires──> [Hub roles extraction] (permission rows reference role IDs)

[Activity log extraction — Data Connector POST /accounts/:id/requests (async job)]
    └──required by──> [Last file activity column in user list]
    └──required by──> [Last file activity in side panel]
    └──required by──> [WHO-added attribution in RecentlyAdded widget]
    └──ASYNC CONSTRAINT: job can take minutes to hours; sync trigger UI must handle job lifecycle]

[Last sign-in enrichment — Construction Admin ?fields=lastSignIn per project]
    └──required by──> [Project-level lastSignIn in side panel]
    └──required by──> [ActiveUserTiers widget accuracy improvement]
    └──note: hub-level lastSignIn already exists; this adds per-project granularity]
```

### Dependency Notes

- **Folder tree is the critical path blocker.** Folder nodes in the graph AND the folder-role permissions widget both depend on folder tree extraction completing successfully. If perf feasibility shows that full folder trees exceed the Cosmos.gl node budget, both features must be scoped down (e.g., top-level folders only, or folder nodes shown only when a user is selected). This feasibility question **must be answered in a dedicated research/prototype phase before committing to either dependent integration phase.**

- **Activity log is Data Connector async.** Every feature that consumes activity data (last file activity, WHO-added attribution) depends on a POST → poll → download → parse pipeline with non-deterministic latency. The sync trigger UI must surface job state (queued / running / succeeded / failed) before the data is usable. This is a UX dependency, not just a data dependency.

- **Members matrix is the foundation for most user-list and dashboard enrichments.** Nearly every table-stakes feature above comes from a single endpoint (`/construction/admin/v1/projects/:id/users`). The Prisma schema design for `ProjectMember`, `ProjectMemberRole`, and `ProjectMemberProduct` must be done correctly once — rushing this schema creates migration debt that ripples through all downstream features.

- **Per-project roles require hub roles first.** Hub role IDs are the canonical identifier. Per-project role data references hub role IDs; without the hub master list, per-project role names cannot be de-duplicated across projects.

- **`addedOn` source correction has a UX risk.** The current `addedOn` is from HQ v1 `created_at` (hub join date). The project endpoint's `addedOn` is the project-specific join date — these will differ for users who were in the hub before joining a specific project. The RecentlyAdded widget must be updated to distinguish "added to hub" vs "added to project" or it will confuse users who see dates change after the sync.

---

## Folder-Graph Performance Risk Assessment

**This section is required reading before any folder-graph phase is committed.**

The v1.0 out-of-scope rationale was: "grafting it onto user↔project↔role graph multiplies node count unmanageably." The v2.0 decision reverses this — but the concern is valid and quantifiable.

**The numbers:**

For a hub with N projects, each with an average F folders:
- Existing node count: ~25,559 (users + projects + roles + modules, documented in PROJECT.md)
- Folder nodes added: N × F (example: 50 projects × 80 folders average = 4,000 folder nodes)
- Folder-permission edges added: N × F × avg_roles_per_folder (example: 4,000 × 3 = 12,000 edges)
- Cosmos.gl GPU budget: empirically stable at 25,559 nodes with current beta.8; 30,000 nodes is untested territory

**The risk is MEDIUM-to-HIGH:**

Cosmos.gl 3.0.0-beta.8 has been validated at 25,559 nodes. Adding 4,000 folder nodes puts the graph at ~30,000 nodes — likely acceptable. But if the hub has 100+ projects with deep nested folder trees (200+ folders each), the total can reach 50,000–80,000 nodes, which is unknown territory.

**Required feasibility check before committing folder-graph integration:**

1. Count actual folder depth and breadth for the production hub (run the DM API recursive script against the real data; log folder counts per project)
2. Test Cosmos.gl 3.0.0-beta.8 with a synthetic 35,000-node graph (add synthetic folder nodes to the existing snapshot) and confirm 60fps is maintained
3. Establish a node budget cap (e.g., "folder nodes only shown when filtering to ≤5 projects" or "top-2-levels of folders only")

**Recommendation:** Dedicate Phase 5.x (or earliest post-extraction phase) explicitly to folder-graph feasibility. Do not combine folder-tree extraction phase with folder-graph integration phase. Extract first, count, test, then integrate.

---

## Surface Placement Summary

| Feature | User List | Graph | Dashboard Widget |
|---------|-----------|-------|-----------------|
| `status` field | Column + filter | Filter facet | KpiStrip (pending count) |
| `companyName` | Column | Node tooltip | — |
| `phone.number` | Side panel only | — | — |
| Full `products` array (admin/member/none) | Side panel module detail | Filter facet (FILT-03 extension) | RolesModulesHeatmap enrichment |
| `accessLevels.projectAdmin` | Badge column | Filter facet | KpiStrip tile; AdminConstellation 2nd tier |
| `accessLevels.executive` | Side panel badge | — | AdminConstellation 3rd tier |
| `addedOn` (source corrected) | Existing column | — | RecentlyAdded (existing widget) |
| Project `type` + `jobNumber` | Side panel project list | Project node tooltip | — |
| Hub + per-project industry roles | — | Role edge color distinction | RolesModulesHeatmap row enrichment |
| Folder nodes (5th node type) | — | Graph nodes (PERF RISK) | — |
| Folder-role permissions | — | — | 10th widget (FolderRoleMatrix) |
| Last sign-in (project-level) | Sortable column | — | ActiveUserTiers (accuracy) |
| Last file activity | Sortable column | — | Side panel "last activity" section |
| WHO-added attribution | — | — | RecentlyAdded drill-down (existing SelectionContext) |
| Activity log job status | Sync button status | — | — |

---

## MVP Definition for v2.0

### Ship With (v2.0 Core)

These complete the extraction layer and enrich existing surfaces. No new surfaces.

- [ ] **Members matrix full extraction** — `status`, `companyName`, `phone`, `products`, `accessLevels`, `addedOn` — the data foundation for nearly every other feature
- [ ] **Prisma schema** — `Project`, `ProjectMember`, `ProjectMemberRole`, `ProjectMemberProduct`, `Role`, `Folder`, `FolderPermission`, `ActivityEvent` tables with proper indexes
- [ ] **Hub + per-project roles extraction** — enables RolesModulesHeatmap enrichment and graph role-edge distinction
- [ ] **Project info extraction** — `type`, `jobNumber`, `createdAt` for project nodes
- [ ] **Last sign-in enriched** — project-level, feeds corrected ActiveUserTiers
- [ ] **`status` + `accessLevels.projectAdmin` surfaced** — user list columns + filter facets
- [ ] **Full products array in side panel** — administrator/member/none per module
- [ ] **KpiStrip enriched** — pending count + project admin count tiles
- [ ] **Manual sync trigger with job-status UI** — prerequisite for activity log features
- [ ] **Activity log extraction** (Data Connector async pipeline) — required for WHO-added and last-file-activity
- [ ] **WHO-added attribution in RecentlyAdded widget** — milestone lock-in requirement
- [ ] **Last file activity column + side panel section** — bridges sign-in vs file engagement gap

### Ship Only If Folder Feasibility Passes

- [ ] **Folder tree extraction + Prisma `Folder` table** — must run feasibility prototype first
- [ ] **Folder-role permissions widget (10th widget)** — depends on folder tree
- [ ] **Folder nodes in graph** — depends on folder tree + perf budget confirmed

### Future (v2.x)

- [ ] **AdminConstellation 3-tier enrichment** — hub admin / project admin / executive rings — nice-to-have, non-blocking
- [ ] **Hub vs project role color encoding in graph** — adds signal but requires graph rebuild; defer if extraction phases run long

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Members matrix full extraction (Prisma schema) | HIGH | HIGH | P1 |
| `status` + `accessLevels.projectAdmin` in user list | HIGH | LOW | P1 |
| Full products array (admin/member/none) in side panel | HIGH | MEDIUM | P1 |
| Hub + per-project roles extraction | HIGH | MEDIUM | P1 |
| Last sign-in enriched (project-level) | HIGH | MEDIUM | P1 |
| Manual sync trigger + job status UI | HIGH | MEDIUM | P1 |
| Activity log extraction pipeline | HIGH | HIGH | P1 |
| WHO-added attribution in RecentlyAdded widget | MEDIUM | MEDIUM | P1 |
| Last file activity column + side panel | MEDIUM | MEDIUM | P1 |
| Project info extraction (`type`, `jobNumber`) | MEDIUM | LOW | P1 |
| KpiStrip enrichment (pending + project admin tiles) | MEDIUM | LOW | P2 |
| Per-module access level filter facet (FILT-03 extension) | MEDIUM | MEDIUM | P2 |
| `status` filter facet | MEDIUM | LOW | P2 |
| `phone.number` in side panel | LOW | LOW | P2 |
| Folder tree extraction (after feasibility) | HIGH | HIGH | P2 |
| Folder-role permissions widget (10th widget) | HIGH | HIGH | P2 |
| Folder nodes in graph (after perf confirmed) | HIGH | HIGH | P2 |
| AdminConstellation 3-tier enrichment | MEDIUM | MEDIUM | P3 |
| Hub vs project role color in graph | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Required to call v2.0 complete
- P2: Conditional (folder features: gate on feasibility; others: add after extraction phases)
- P3: v2.x, non-blocking

---

## Sources

- `APS_DOCS/HOW TO/HOW_TO_Extract_Project_Members.md` — members matrix endpoint, products array schema, accessLevels schema, addedOn field — HIGH confidence (ground truth)
- `APS_DOCS/HOW TO/HOW_TO_Extract_All_Files_and_Folders.md` — DM API recursive folder extraction; topFolders endpoint; pagination — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_Folder_Role_Permissions.md` — BIM360 Docs permissions endpoint; actions-to-permission-type mapping — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md` — Data Connector async pipeline; CSV schema; job lifecycle — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_Last_Sign_In.md` — HQ v1 hub-level AND Construction Admin project-level lastSignIn; `?fields=` query param required — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_Last_User_File_Activity.md` — derives from activity log; file action types; per-user max timestamp strategy — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_Recent_User_Additions.md` — `addedOn` sort; WHO-added via activity log `Member Added` / `User Invited` events — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_All_Roles.md` — HQ v2 hub master roles; per-project industry roles; services.document_management.access_level — HIGH confidence
- `APS_DOCS/HOW TO/HOW_TO_Extract_Project_Info.md` — Construction Admin projects list; type, jobNumber, createdAt fields — HIGH confidence
- `lib/acc/acc-types.ts` — existing `BulkAccUser` interface; current fields; what is already plumbed — HIGH confidence (live codebase)
- `app/(dashboard)/users/dashboard/widgets/RecentlyAddedWidget.tsx` — SelectionContext click pattern; current data inputs; CSV export columns — HIGH confidence
- `app/(dashboard)/users/AccUsersGraph.tsx` — `UserNode` interface; existing node fields; filter system — HIGH confidence
- `.planning/milestones/v1.0-REQUIREMENTS.md` — what shipped; DASH-01..13 coverage; existing widget capabilities — HIGH confidence
- `.planning/PROJECT.md` — v2.0 locked decisions; out-of-scope list; constraint on no new tabs/pages — HIGH confidence

---
*Feature research for: v2.0 ACC Extraction Completion — enriching existing user list / graph / dashboard*
*Researched: 2026-05-08*
