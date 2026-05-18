# Requirements: LECG Dashboard v2.0 — ACC Extraction Completion

**Defined:** 2026-05-08
**Core Value:** Project teams can monitor and act on ACC user access data — surfacing permission gaps, duplicated roles, and inconsistent access patterns before they cause project delivery problems.

> v2.0 rebuilds the ACC extraction layer against documented APS endpoints (see `APS_DOCS/HOW TO/`), persists data in real Prisma tables, and enriches existing user list / spatial graph / Access Analysis dashboard surfaces with the new fields. **No new tabs, pages, or views.** REQ-IDs continue numbering from v1.0 within their categories where applicable; new categories start at -01.

## v2.0 Requirements

### Schema & Foundation

Establish the relational data layer that every other category depends on.

- [x] **SCHEMA-01**: Prisma adds 7 new models — `AccProject`, `AccProjectMember`, `AccRole`, `AccProjectRole`, `AccFolder`, `AccFolderPermission`, `AccActivity` — plus `AccDataConnectorJob` for async job state. Initial migration applied on dev + Railway.
- [x] **SCHEMA-02**: `AccActivity` table created with composite indexes from day one: `(autodeskId, created_at DESC)`, `(projectId, created_at DESC)`, `(action)`. No retroactive index addition.
- [x] **SCHEMA-03**: Two distinct projectId helpers shipped with unit tests — `getAccountId(db)` (strips `b.` for Construction Admin / HQ) and `getProjectIdForDM(rawId)` (preserves `b.` for Data Management). Existing `b.`-stripping callers audited.

### Sync Orchestration

Backend-driven sync model — Quick Sync runs as a Railway release step (REST extractions), Deep Sync runs as a Railway cron (Data Connector). No user-trigger UI; freshness is surfaced read-only in the sidebar.

- [x] **SYNC-01**: Quick Sync runs server-side as the Railway `releaseCommand` after every deploy (REST extractions: members, projects, roles, folders, folder-permissions, last sign-in, recently-added). Hard 5-minute timeout; status persisted to `SyncMeta('quick')`; failure fails the deploy and emails the operator via Resend. During the transition window, dual-writes to `accMemberCache` AND new tables.
- [x] **SYNC-02**: Deep Sync runs server-side as a nightly Railway cron (09:00 UTC = 02:00 Hermosillo); submits an APS Data Connector bulk extraction request and persists state (`requestId`, `status`, timestamps) in `AccDataConnectorJob`.
- [x] **SYNC-03**: Sync freshness is visible in the existing sidebar chrome via `SyncFreshnessPill`, which polls `accSync.getSyncFreshness` + `accSync.getActiveDeepSyncJob` (15s while a deep sync is running, 5min otherwise). Status survives Railway container restarts because the source of truth is Postgres (`SyncMeta` + `AccDataConnectorJob`), not in-memory state.
- [x] **SYNC-04**: Deep Sync cron enforces a server-side overlap guard (skips submission when any `AccDataConnectorJob` is `pending` or `running`) and surfaces failure reasons via Resend email alert (sync type, timestamp, error, `requestId` when available) to the operator.

### Members Matrix Enrichment

Full parity with `HOW_TO_Extract_Project_Members.md`. The load-bearing extraction.

- [x] **MEM-01**: Per-project members extracted via `/construction/admin/v1/projects/:id/users` with `?fields=` hardcoded so `lastSignIn` is always returned (never silently absent).
- [x] **MEM-02**: Each member persisted with `status`, `companyName`, `phone`, `addedOn` (from project endpoint, NOT hub `created_at`).
- [x] **MEM-03**: Each member's full `products` array persisted with per-module access tier (administrator / member / none) for: Docs, Design Collaboration, Model Coordination, Build, AutoSpecs, Insight, Cost, Project Administration.
- [x] **MEM-04**: Each member's `accessLevels.projectAdmin` and `accessLevels.executive` flags persisted distinctly from HQ-level account-admin status.
- [x] **MEM-05**: Per-project role assignments persisted in `AccProjectRole` (many-to-many: member × project × role).
- [x] **MEM-06**: Existing `accMemberCache` continues to be written during the dual-existence window so the live dashboard never breaks mid-deploy.

### Project Info

Per `HOW_TO_Extract_Project_Info.md`.

- [x] **PROJ-01**: All projects extracted via `/construction/admin/v1/accounts/:id/projects` with pagination; `type`, `name`, `jobNumber`, `accountId`, `createdAt` persisted to `AccProject`.
- [x] **PROJ-02**: Project list refresh integrated into Quick Sync; deleted projects in APS marked inactive in `AccProject` (not hard-deleted).

### Roles (Hub + Per-Project)

Per `HOW_TO_Extract_All_Roles.md`.

- [x] **ROLE-01**: Hub master roles extracted via `/hq/v2/accounts/:id/industry_roles` and persisted in `AccRole`.
- [x] **ROLE-02**: Per-project industry roles extracted via `/hq/v2/accounts/:id/projects/:pid/industry_roles` and joined to `AccProject` + `AccRole` via `AccProjectRole`.
- [x] **ROLE-03**: Default access levels per role (`docs.access_level`, `project_administration.access_level`) persisted with each `AccProjectRole` row for downstream permission analysis.

### Folders & Folder-Role Permissions (Conditional)

Per `HOW_TO_Extract_All_Files_and_Folders.md` and `HOW_TO_Extract_Folder_Role_Permissions.md`. **Folder graph integration is gated by a perf pre-flight phase** — see GRAPH-04.

- [x] **FLDR-01**: Folder tree extracted per project via Data Management API (`b.` prefix preserved); BFS crawl with `pLimit(5)` per project; folders persisted in `AccFolder` with full path, parent reference, and folder URN as primary key.
- [x] **FLDR-02**: Folder-role permissions extracted via `/bim360/docs/v1/projects/:id/folders/:urn/permissions` and persisted in `AccFolderPermission`; `subjectType === "ROLE"` filter applied at ingest.
- [x] **FLDR-03**: Permission `actions` arrays mapped to UI permission types (View Only / View+Download / Upload Only / View+Download+Upload / View+Download+Upload+Edit / Full Controller) with unit tests covering all 6 documented combinations.
- [x] **FLDR-04**: Folder-role permissions widget added as 10th dashboard widget — interactive matrix (folder × role) with hover detail, click-to-drill, cross-widget selection spotlighting (interactivity contract enforced).
- [x] **FLDR-05**: Members-assigned-count per role-on-folder computed and exposed (e.g., role assigned to folder but zero members in role → flagged as orphan).

### Activity Log & File Activity

Per `HOW_TO_Extract_Activity_Logs.md`, `HOW_TO_Extract_Last_User_File_Activity.md`, `HOW_TO_Extract_Recent_User_Additions.md`. Driven by Data Connector Deep Sync.

- [x] **ACTV-01**: Data Connector ZIP downloaded via signed S3 URL with NO Authorization header; streaming unzip into per-CSV streams without buffering full archive.
- [x] **ACTV-02**: `project_activities.csv` and `admin_activities.csv` streamed through `csv-parse` and upserted into `AccActivity` in 500-row batches via `createMany({ skipDuplicates: true })`. All-time retention; no prune.
- [x] **ACTV-03**: Last file activity per user computed from `AccActivity` (filtered to file-related actions) and exposed via lazy tRPC query for side-panel drill-down — NOT eager-loaded into `BulkAccUser` or `FindingsContext`.
- [x] **ACTV-04**: WHO-added-WHOM attribution surfaced in RecentlyAdded widget — joins `Member Added`/`User Invited`/`Project Member Added` activity rows to the invited user's `AccProjectMember` row by email; surfaces inviting admin's name in widget hover/drill.
- [x] **ACTV-05**: Activity drill-down panel (paginated, top-N by recency) added to existing DashboardSidePanel for any selected user; respects interactivity contract.

### User List Enrichments

Existing user list/table surfaces gain new columns and filter facets.

- [x] **LIST-01**: `status` column added to user list with values active / pending / deleted; corresponding filter facet (extends FILT cascade).
- [x] **LIST-02**: `accessLevels.projectAdmin` indicator visible in user list and filter facet.
- [x] **LIST-03**: Last file activity date column added to user list; values lazy-loaded post initial render to avoid blocking first paint.
- [x] **LIST-04**: Side-panel detail view shows full per-module `products` access tier (administrator/member/none) with module icons.

### Spatial Graph Enrichments

Cosmos.gl graph gains new node kinds and per-project role overlay.

- [x] **GRAPH-01**: Per-project industry-role assignments (vs hub master roles) become available as a graph filter dimension; default rendering remains unchanged.
- [x] **GRAPH-02**: User node hover shows enriched detail (status, companyName, accessLevels, last sign-in normalized, last file activity).
- [x] **GRAPH-03**: Account-admin overlay distinguishes hub admin / project admin / executive in node ring color (extends DASH-12 admin treatment to graph).
- [ ] **GRAPH-04**: Folder perf pre-flight phase produces a documented GO/NO-GO decision (FPS + GPU memory at projected node count). Folder nodes ship in graph (5th node kind, hidden by default with toggle in filter panel) ONLY if GO recorded; if NO-GO, folders remain dashboard-only and contingency contract is logged.

### Dashboard Enrichments

Existing 9 widgets enrich; new 10th widget (folder permissions) added; interactivity contract enforced on every modified widget.

- [ ] **DASH-14**: KpiStrip enriched — pending invite count tile + project admin count tile + total folders crawled tile (post-Quick Sync).
- [ ] **DASH-15**: Recommendations widget gains "stale invite" finding (status=pending older than 30 days) and "orphan role" finding (role assigned to folder with zero members).
- [ ] **DASH-16**: AdminConstellation extended to 3 tiers (account admin / project admin / executive) with distinct ring colors; hover surfaces accessLevel breakdown.
- [ ] **DASH-17**: RolesModulesHeatmap row labels distinguish hub-master role vs per-project assignment count; cell hover shows project list contributing to count.
- [x] **DASH-18**: Every modified or new widget passes the interactivity contract: hover detail panel, click-through to side panel, cross-widget selection spotlighting. UAT gate: non-negotiable per feedback memory.

## v2.x Requirements (Deferred)

### Real-Time & Write

- **WRITE-01**: Permission editing from dashboard (requires ACC write scopes + audit logging)
- **WRITE-02**: Webhooks/real-time sync (replaces manual sync model)
- **WRITE-03**: Bulk role-reassignment workflow

### Visualization Expansions

- **VIZ-01**: Hub vs project role color encoding in graph edges
- **VIZ-02**: Folder activity heatmap (which folders saw most file activity in window)
- **VIZ-03**: Animated activity timeline replay

### Cleanup (Post-v2.0)

- **CLN-01**: Remove `accMemberCache` write path; drop dual-write from Quick Sync
- **CLN-02**: Drop `AccHubRoleCache` singleton in favor of `AccRole` table
- **CLN-03**: TD-007 — remove vestigial Canvas2D renderer branch
- **CLN-04**: TD-006 — Cosmos slider feel refinement

## Out of Scope

| Feature | Reason |
|---------|--------|
| New tabs/pages/views (Activity Log view, Folder Permissions view, Project drill-down view) | User explicit decision: enrich existing surfaces only |
| Permission editing (write APIs) | Read-only architecture; write requires ACC scope + audit logging — separate milestone |
| Real-time sync / webhooks | Manual trigger model is intentional; webhooks add complexity + ACC write-scope risk |
| `@aps_sdk/data-connector` package | Does not exist; existing `acc-admin.ts` raw-fetch pattern handles 3-call flow |
| `papaparse` for CSV ingest | No native Node `stream.Transform`; can't pipe from unzipper without buffering |
| `jszip` / `adm-zip` for ZIP extraction | Both load full archive into memory; bad for multi-100MB Data Connector exports |
| BullMQ / Inngest for job queue | Adds Redis or SaaS infrastructure; pg-boss uses existing Postgres |
| LOD Checker graph integration | Separate module; separate concern |
| D3-force layout inside Cosmos.gl | Defeats GPU simulation purpose |

## Traceability

Populated 2026-05-11 from ROADMAP.md.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHEMA-01..03 | v2.0 Phase 1 — Foundation | Pending |
| SYNC-01..04   | v2.0 Phase 1 — Foundation | Pending |
| MEM-01..06    | v2.0 Phase 2 — Core Extraction | Completed |
| PROJ-01..02   | v2.0 Phase 2 — Core Extraction | Completed |
| ROLE-01..03   | v2.0 Phase 2 — Core Extraction | Completed |
| ACTV-01..05   | v2.0 Phase 3 — Activity Pipeline | Pending |
| FLDR-01..05   | v2.0 Phase 4 — Folders (perf-gated) | Pending |
| LIST-01..04   | v2.0 Phase 09 — LIST wave gap closure (was Phase 5.2) | Pending |
| GRAPH-01..03  | v2.0 Phase 5.1 — UI Enrichment Waves (Graph wave) | Completed |
| GRAPH-04      | v2.0 Phase 10 — PERF-GATE measurement + ship-decision (was Phase 4/5.1 conditional) | Pending |
| DASH-14..17   | v2.0 Phase 11 — DASH wave gap closure (was Phase 5.3) | Pending |
| DASH-18       | v2.0 Phase 5.1 — UI Enrichment Waves (interactivity contract) | Completed |

**Coverage:**
- v2.0 requirements: 41 total
- Mapped to phases: 41 ✅
- Unmapped: 0

---
*Requirements defined: 2026-05-08*
*Last updated: 2026-05-08 after initial v2.0 definition*
