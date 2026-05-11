# Architecture Research

**Domain:** ACC Extraction Layer v2.0 — APS endpoint parity, real Prisma schema, existing UI enrichment
**Researched:** 2026-05-08
**Confidence:** HIGH — derived entirely from reading the actual codebase + all 9 HOW_TO docs; no training-data assumptions

---

## Critical Upfront Context

This is not greenfield work. The extraction layer already runs in production (`bulkAccSync` → `accMemberCache` JSON → graph + dashboard). v2.0 **adds a relational schema underneath the existing system** and populates new fields across existing surfaces. Nothing about the UI shell, routing, renderer, or context system changes.

The research question is: given the 9 APS endpoint shapes we now know, how do the new Prisma tables slot into the existing tRPC → Prisma → PostgreSQL pattern, how does the sync orchestration evolve, and in what order do the pieces get built?

---

## Extraction Classification by APS Endpoint Type

Before designing anything, the 9 HOW_TO docs must be classified because they divide into two fundamentally different delivery mechanisms:

### Group A — REST Endpoints (fast, synchronous, minutes)

| Extraction | Endpoint Family | Key Fields | Already Fetched? |
|---|---|---|---|
| Project Members Matrix | `construction/admin/v1/projects/:projectId/users` | `products[]`, `accessLevels`, `roles[]`, `addedOn`, `lastSignIn` | Partial — roles + modules fetched but not `products` access levels |
| Project Info | `construction/admin/v1/accounts/:accountId/projects` | `name`, `type`, `jobNumber`, `createdAt` | No — only projectId/name extracted ad-hoc |
| Hub Roles (master list) | `hq/v2/accounts/:accountId/industry_roles` | Hub-level role dictionary | Yes — `syncHubRoles` procedure + `AccHubRoleCache` |
| Per-project Roles | `hq/v2/accounts/:accountId/projects/:projectId/industry_roles` | Role name + default service access per project | No |
| Folder Tree | `project/v1/hubs/:hubId/projects/:projectId/topFolders` + `data/v1/projects/:projectId/folders/:folderId/contents` | Folder hierarchy, URNs | No |
| Folder-Role Permissions | `bim360/docs/v1/projects/:projectId/folders/:folderUrn/permissions` | `subjectType=ROLE`, `actions[]` | No |
| Last Sign-In (hub level) | `hq/v1/accounts/:accountId/users` | `last_sign_in` | Yes — in `fetchAllAccUsers` |
| Recently Added Users | `construction/admin/v1/projects/:projectId/users?sort=addedOn+desc` | `addedOn` + activity log cross-reference | Partial — `addedOn` captured; no admin-attribution |

### Group B — Data Connector (async, minutes-to-hours, ZIP download)

| Extraction | Mechanism | CSV Files | Use Case |
|---|---|---|---|
| Activity Log | POST job → poll → download ZIP → parse CSVs | `project_activities.csv`, `admin_activities.csv`, `users.csv`, `projects.csv` | Per-user activity history, last file activity, who-added-whom audit |

**Architectural implication:** Group A can share a single "Quick sync" trigger. Group B requires a separate async job with persisted state, polling, and a ZIP/CSV ingestion pipeline. These two groups MUST be orchestrated differently.

---

## Prisma Schema Design

### New Tables

The seven locked Prisma models map directly to the extraction groups above. The schema design below specifies columns, relationships, and required indexes.

```prisma
// ============ MODULE: ACC v2.0 RELATIONAL SCHEMA ============

model AccProject {
  id          String   @id          // bare UUID from APS (no b. prefix)
  name        String
  type        String?              // "Hospital", "Template Project", etc.
  jobNumber   String?              // project number in ACC
  status      String?              // "active" | "inactive"
  createdAt   DateTime?            // ACC creation date from API
  syncedAt    DateTime             // when we last fetched this row

  members     AccProjectMember[]
  roles       AccProjectRole[]
  folders     AccFolder[]

  @@index([syncedAt])
}

model AccProjectMember {
  id                String   @id @default(cuid())
  projectId         String
  project           AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  email             String
  name              String
  status            String?          // "active" | "pending" | "deleted"
  companyName       String?
  accessLevelAdmin  Boolean  @default(false)   // accessLevels.projectAdmin
  addedOn           DateTime?
  lastSignIn        DateTime?

  // products[] from construction/admin/v1/projects/:id/users
  // Stored as JSONB rather than a separate AccProjectMemberProduct table
  // because product keys are a fixed-ish set (~8 keys) and cross-product
  // analytics are not needed at JOIN level. Can be promoted to a table later.
  products          Json?    // { docs: "administrator", build: "member", ... }

  syncedAt          DateTime

  @@unique([projectId, email])
  @@index([email])
  @@index([projectId])
  @@index([addedOn])
  @@index([lastSignIn])
}

// Hub-level role definitions (master dictionary from hq/v2/.../industry_roles)
// The existing AccHubRoleCache (singleton JSON) will be replaced by this table.
// The singleton pattern is preserved during migration via a @default("singleton")
// sentinel OR by migrating rows from the JSON blob.
model AccRole {
  id           String   @id          // APS role UUID
  name         String
  memberCount  Int      @default(0)  // denormalized count from hub list API
  syncedAt     DateTime

  projectRoles AccProjectRole[]

  @@index([name])
}

// Per-project role assignments (hq/v2/.../projects/:id/industry_roles)
// Many-to-many between AccProject and AccRole with per-project default access metadata.
model AccProjectRole {
  id                      String     @id @default(cuid())
  projectId               String
  project                 AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  roleId                  String
  role                    AccRole    @relation(fields: [roleId], references: [id], onDelete: Cascade)

  // Default service access levels for this role in this project (from per-project role API)
  defaultDocsAccess       String?    // "admin" | "user" | "none"
  defaultProjectAdminAccess String?

  @@unique([projectId, roleId])
  @@index([projectId])
  @@index([roleId])
}

model AccFolder {
  id          String   @id          // APS folder URN (retains urn: prefix from Data Management API)
  projectId   String
  project     AccProject @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parentId    String?              // null = top-level folder
  parent      AccFolder? @relation("FolderTree", fields: [parentId], references: [id])
  children    AccFolder[] @relation("FolderTree")
  name        String
  path        String               // full path string "Project Files / Architecture" for display
  syncedAt    DateTime

  permissions AccFolderPermission[]

  @@index([projectId])
  @@index([parentId])
}

model AccFolderPermission {
  id          String   @id @default(cuid())
  folderId    String
  folder      AccFolder @relation(fields: [folderId], references: [id], onDelete: Cascade)
  roleId      String?              // null = individual user permission
  subjectType String               // "ROLE" | "USER"
  subjectId   String               // role UUID or user email
  subjectName String?
  actions     String[]             // ["VIEW", "DOWNLOAD", "COLLABORATE", ...]
  permType    String               // derived label: "Full Controller" | "View Only" | etc.
  syncedAt    DateTime

  @@index([folderId])
  @@index([roleId])
  @@index([subjectId])
}

model AccActivity {
  id          String   @id @default(cuid())
  projectId   String?              // null for hub-level admin activities
  userId      String               // APS user ID (join to AccProjectMember via email lookup)
  userEmail   String?              // resolved email from users.csv join
  service     String?
  tool        String?
  action      String               // "File Uploaded", "Document Viewed", "Member Added", etc.
  details     String?
  occurredAt  DateTime             // `created_at` from CSV

  // No FK to AccProject — activity log rows may reference deleted projects.
  // Query by (userEmail, occurredAt) for per-user activity; (projectId, occurredAt) for project view.

  @@index([userEmail, occurredAt(sort: Desc)])
  @@index([projectId, occurredAt(sort: Desc)])
  @@index([action, occurredAt(sort: Desc)])
}

// Async job tracking for Data Connector extractions.
// Required because Data Connector jobs run minutes-to-hours and must survive
// page reloads and server cold starts.
model AccDataConnectorJob {
  id           String   @id @default(cuid())
  requestId    String   @unique     // APS Data Connector requestId
  jobId        String?              // APS job ID (from jobs poll response)
  status       String   @default("pending")  // pending | running | success | failed
  serviceGroups String[]            // ["activities", "admin"]
  dateRange    String?              // "PAST_7_DAYS" | "CUSTOM" etc.
  downloadUrl  String?              // signed S3 URL once status=success
  errorMessage String?
  rowsIngested Int?                 // populated after CSV parse completes
  startedAt    DateTime @default(now())
  completedAt  DateTime?

  @@index([status])
  @@index([startedAt(sort: Desc)])
}
```

### AccProjectMember vs accMemberCache: Coexistence Strategy

`AccProjectMember` and `accMemberCache` serve overlapping but different purposes:

| | `accMemberCache` | `AccProjectMember` |
|---|---|---|
| Granularity | One row per email (hub-level) | One row per (project, email) pair |
| Schema | JSON blob | Typed relational columns |
| Fields | roles[], modules[], companyRole, lastSignIn, isAccountAdmin, addedOn | accessLevels (per project), products (per project), addedOn, lastSignIn |
| Graph source | Yes — `buildAccGraphSnapshot` reads it | Will replace this role |
| Dashboard source | Yes — `bulkAccSummary` reads it | Will replace this role |
| Current status | In production | Does not exist yet |

**Recommended strategy: coexistence during a migration window, then cutover.**

1. Phase A (schema migration): Create `AccProject`, `AccProjectMember`, and related tables as empty. Do not remove `accMemberCache`.
2. Phase B (parallel writes): The new sync procedures write to BOTH `accMemberCache` (unchanged) and `AccProjectMember`. This means the existing graph + dashboard continue working while new tables populate.
3. Phase C (read cutover): `bulkAccSummary` and `buildAccGraphSnapshot` switch to reading from `AccProjectMember`. `accMemberCache` writes stop. The old rows are retained for one milestone as a rollback rail.
4. Phase D (cleanup, v2.1 or later): `accMemberCache` table dropped; old read paths removed.

The graph rebuild pipeline (`rebuildAccGraphCache`) reads `AccMemberCache` today. The cutover point is when `graphSnapshot.ts` is rewritten to read from `AccProjectMember` instead. This is a localized change to one server-side file.

**The `AccHubRoleCache` singleton** is replaced by `AccRole` rows. During migration, `syncHubRoles` writes to both the old singleton and new `AccRole` table, then the old read path switches.

---

## Sync Orchestration Architecture

### Decision: Tiered Buttons (Quick Sync + Deep Sync)

**Rationale:** Three options were considered:

- One mega-button: Simple UI, but forces users to wait for Data Connector (potentially hours) to get basic member updates. Blocks on the slowest extraction.
- Per-extraction buttons (9 separate): Maximum granularity but UX complexity. Users don't know which button does what.
- Tiered (Quick + Deep): Matches the natural REST/async split already present in the data. Users learn one mental model: Quick for routine updates, Deep for activity log.

**Verdict: Tiered sync.** This directly maps to the two extraction groups and matches the existing "one sync button" pattern in `AccAnalysisPanel.tsx` by replacing it with two clearly-labeled buttons.

```
┌──────────────────────────────────────────────────────────┐
│  AccAnalysisPanel.tsx (existing)                          │
│  ┌─────────────────────┐  ┌──────────────────────────┐   │
│  │  Quick Sync          │  │  Deep Sync (Activity)    │   │
│  │  ~2-5 min            │  │  ~10 min – hours         │   │
│  │  REST endpoints only │  │  Data Connector job      │   │
│  └─────────────────────┘  └──────────────────────────┘   │
│  [status: last synced 3h ago]   [status: job running...]  │
└──────────────────────────────────────────────────────────┘
```

**Quick Sync tRPC procedure: `users.quickSync` (new mutation)**

Sequentially runs Group A extractions in this order (dependencies govern order):
1. `fetchAllAccProjects` → upsert `AccProject` rows
2. `fetchAllAccUsers` → upsert hub-level user data (existing logic, now also writes `AccProjectMember` hub-level fields)
3. Per-project: `fetchProjectMembers` → upsert `AccProjectMember` (with `products` + `accessLevels`)
4. Per-project: `fetchProjectRoles` → upsert `AccProjectRole`
5. Per-project: `fetchFolderTree` → upsert `AccFolder`
6. Per-folder: `fetchFolderPermissions` → upsert `AccFolderPermission`
7. Rebuild `AccGraphLayoutCache` (existing `rebuildAccGraphCache` call, unchanged)

The existing `bulkAccSync` procedure is NOT removed; it is preserved for backward compatibility during migration. `quickSync` eventually replaces it but runs in parallel during migration window.

**Deep Sync tRPC procedure: `users.startDeepSync` (new mutation)**

Triggers a Data Connector job and immediately returns the `AccDataConnectorJob.id`. The client polls `users.getDeepSyncStatus` (query by jobId) until `status === "success"` or `"failed"`. On success, a separate server-side step downloads, unzips, and parses CSVs into `AccActivity` rows.

---

## Job State for Data Connector

### Decision: Prisma `AccDataConnectorJob` Table with Server-Side Poll

**Why Prisma table over in-memory:** The job runs server-side via a tRPC mutation. If the Railway container restarts (which it will during deployments), an in-memory map is lost. The job is still running at APS. The Prisma row survives the restart.

**Why NOT SSE/subscription for v2.0:** The dashboard's polling model is already proven (tRPC query with `refetchInterval`). SSE adds a persistent HTTP connection, server-sent event infrastructure, and connection management. tRPC 11 does support subscriptions, but the added complexity is not justified for a feature that runs once every few days.

**Recommended pattern: client polls on 5-second interval.**

```
User clicks "Deep Sync"
    ↓
users.startDeepSync mutation
    → POST to APS Data Connector API (requestId returned immediately)
    → Create AccDataConnectorJob row {status: "pending", requestId}
    → Return {jobId: AccDataConnectorJob.id}
    ↓
Client stores jobId in React state
Client starts polling users.getDeepSyncStatus({jobId}) every 5s
    ↓
users.getDeepSyncStatus (query, runs server-side each poll)
    → Read AccDataConnectorJob row
    → If status === "pending" or "running":
        → Call APS GET .../requests/:requestId/jobs
        → Update AccDataConnectorJob.status + .jobId + .downloadUrl
        → Return current status to client
    → If status === "success": return {status, downloadUrl, rowsIngested}
    → If status === "failed": return {status, errorMessage}
    ↓
When status === "success":
    → users.ingestDeepSync mutation (or automatic trigger)
    → Downloads ZIP from downloadUrl (no auth headers — signed S3 URL)
    → Streams ZIP extraction + CSV parsing
    → Bulk upserts into AccActivity
    → Updates AccDataConnectorJob.rowsIngested + completedAt
    ↓
Client receives final status; stops polling
```

**State machine for `AccDataConnectorJob.status`:**
```
pending → running → success
                 → failed
```

An "ingesting" state is optional but recommended to distinguish "ZIP downloading" from "job running at APS". Add if the CSV parse step could take measurable time.

---

## CSV → Prisma Ingestion Pipeline

### Decision: Streaming Parse with Chunked `createMany`

The `project_activities.csv` can contain millions of rows for an active hub. Loading the full CSV into memory before writing is a memory blowup risk.

**Recommended pattern:**

```typescript
// lib/acc/ingestActivities.ts (new file)
import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import Papa from "papaparse"; // or csv-parse/transform

const CHUNK_SIZE = 500; // rows per createMany call

export async function ingestActivitiesFromCsv(
  csvPath: string,
  db: PrismaClient
): Promise<number> {
  let buffer: ActivityRow[] = [];
  let total = 0;

  const stream = Papa.parse(Papa.NODE_STREAM_INPUT, { header: true });

  stream.on("data", async (row: RawActivityRow) => {
    buffer.push(mapRow(row));
    if (buffer.length >= CHUNK_SIZE) {
      stream.pause();
      const chunk = buffer.splice(0, CHUNK_SIZE);
      await db.accActivity.createMany({ data: chunk, skipDuplicates: true });
      total += chunk.length;
      stream.resume();
    }
  });

  await pipeline(createReadStream(csvPath), stream);

  // Flush remaining
  if (buffer.length > 0) {
    await db.accActivity.createMany({ data: buffer, skipDuplicates: true });
    total += buffer.length;
  }

  return total;
}
```

**Why `createMany` with `skipDuplicates` instead of `upsert` per row:**
- `upsert` in a loop is O(n) individual SQL statements — catastrophic for millions of rows.
- `createMany` with `skipDuplicates: true` translates to a single `INSERT ... ON CONFLICT DO NOTHING` batch.
- The natural deduplication key for `AccActivity` is `(userId, action, occurredAt)`. Add this as a `@@unique` constraint to enable idempotent re-ingestion.

**ZIP extraction before CSV parsing:**

```typescript
// lib/acc/extractDataConnectorZip.ts (new file)
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { extract } from "unzipper"; // npm package

export async function extractDataConnectorZip(
  zipUrl: string,
  destDir: string
): Promise<string[]> {
  const res = await fetch(zipUrl); // signed S3 URL — no auth headers
  await pipeline(
    res.body as NodeReadableStream,
    extract.ParseStream().on("entry", (entry) => {
      if (entry.path.endsWith(".csv")) {
        entry.pipe(createWriteStream(path.join(destDir, entry.path)));
      } else {
        entry.autodrain();
      }
    })
  );
  return glob.sync(`${destDir}/*.csv`);
}
```

---

## Graph Data Integration

### Current Data Assembly (v1.0)

```
accMemberCache rows
    → buildAccGraphSnapshot(rows)   [lib/acc/graphSnapshot.ts]
        → AccGraphNode[] (user nodes + project instance nodes + role nodes + module nodes)
    → runSimulation()
    → AccGraphLayoutCache (singleton)
    → getPrecomputedGraph (tRPC query)
    → CosmosGraphRenderer
```

The graph knows nothing about folders. Node kinds today are: `"user"`, `"instance"`, `"project"`, `"role"`, `"module"`.

### v2.0 Graph Data Assembly — Folder Nodes

Folders introduce a new node kind: `"folder"`. Edges from folder nodes connect to:
- The project node (folder → project)
- Role nodes assigned to that folder via `AccFolderPermission` (folder ↔ role)

**Data assembly change:** `buildAccGraphSnapshot` must read from `AccProjectMember` (replacing `accMemberCache`) AND from `AccFolder` + `AccFolderPermission` to build folder nodes.

**Where assembly lives:** Keep it in `lib/acc/graphSnapshot.ts`. The function signature changes from `(rows: AccMemberCache[])` to `(members: AccProjectMember[], folders: AccFolder[], permissions: AccFolderPermission[])`. This is a localized change to one server-side utility file.

**Perf concern flag (HIGH RISK from PROJECT.md):** Folder nodes are explicitly marked as HIGH RISK in v2.0 requirements. Before committing to folder nodes in production graph rendering, a dedicated research/perf phase must:
1. Count folder + subfolder count across all projects in the hub
2. Project total node count: current nodes + (folder count × edge density)
3. Validate against the 25k-node benchmark that v1.0 achieved

If folder count pushes total nodes past ~50k, a level-of-detail strategy is required: render folder nodes only when a project cluster is zoomed in. This is architecturally addable (Cosmos.gl supports dynamic node visibility via `setData` calls) but must be planned.

**Recommended approach for v2.0:** Load folder nodes but implement a zoom-gated visibility toggle (folders hidden at global view, revealed per-project on zoom). This is consistent with the existing filter hide pattern.

---

## Dashboard Data Flow

### FindingsContext Shape Extension Strategy

The `DashboardFindings` type (from `lib/acc/dashboardAnalytics.ts`) currently contains analytics derived from `BulkAccUser[]`. In v2.0, new field categories appear:

| New Data | Source | How It Surfaces |
|---|---|---|
| Per-project `accessLevels` (projectAdmin flag) | `AccProjectMember.accessLevelAdmin` | Enriches existing `BulkAccProject.isAdmin` — no new field key needed |
| Per-project `products` (module access tiers) | `AccProjectMember.products` JSON | New field on `BulkAccProject`: `productAccess` |
| Folder-role permissions | `AccFolderPermission` | New `folderPermissions` array on `BulkAccProject` |
| Activity rows for a user | `AccActivity` | NOT in BulkAccUser — paginated query at drill-down time |

**Decision: Extend `BulkAccUser` shape additively, do NOT introduce a new context.**

The `BulkAccUser` type in `lib/acc/acc-types.ts` grows new fields (all optional with explicit `undefined` fallback to preserve backward compatibility with cache rows synced before v2.0). `BulkAccProject` inside it similarly grows `productAccess` and `folderPermissions`.

```typescript
// lib/acc/acc-types.ts additions (additive, non-breaking)

export interface BulkAccProduct {
  key: string;          // "docs" | "build" | "designCollaboration" | ...
  access: string;       // "administrator" | "member" | "none"
}

export interface BulkAccFolderPermission {
  folderName: string;
  folderPath: string;
  permType: string;     // "Full Controller" | "View Only" | ...
  actions: string[];
}

export interface BulkAccProject {
  // ... existing fields ...
  productAccess?: BulkAccProduct[];        // v2.0 addition
  folderPermissions?: BulkAccFolderPermission[];  // v2.0 addition
}

export interface BulkAccUser {
  // ... existing fields ...
  // No new top-level fields needed for the dashboard path.
  // Activity data is NOT added here — see below.
}
```

**Activity rows: paginated query, not in context.**

`AccActivity` can contain millions of rows. Loading all of them into `BulkAccUser` would destroy dashboard startup performance. Instead:

- The drill-down panel (when a user/role is selected) fires a dedicated tRPC query:
  `users.getActivityForUser({ email, limit: 50, cursor?: string })` — a paginated query returning the top-N most recent activity rows.
- This query is NOT in `FindingsContext`. It is a per-selection lazy load inside `DashboardSidePanel.tsx`.
- The `SelectedFinding` union in `selectionContext.tsx` gains a new kind `"activity"` if a dedicated activity drill-down is needed, OR the existing `kind: "role"` and `kind: "admin"` panels are enhanced to show recent activity inline.

**New context: SyncStatusContext (optional but recommended)**

A lightweight context that holds the current sync status for the two sync buttons (last synced timestamp, job running state). This lives in `AccAnalysisPanel.tsx` (or a wrapper) and is NOT in `FindingsContext`. It drives the sync button states and last-synced display.

---

## Migration Sequencing (Build Order)

```
Phase A: Schema (empty tables, no functional change)
    → Add AccProject, AccProjectMember, AccRole, AccProjectRole,
      AccFolder, AccFolderPermission, AccActivity, AccDataConnectorJob
      to prisma/schema.prisma
    → Run migration (tables empty; existing app unaffected)
    → Coexists with accMemberCache (both present, both used)

Phase B: REST Sync Pipeline (populates new tables, reads old tables for graph/dashboard)
    → Add lib/server/acc-admin.ts helpers for new endpoints:
        fetchAllAccProjects, fetchProjectMembers, fetchProjectRoles,
        fetchFolderTree, fetchFolderPermissions
    → Add server/routers/acc.ts (new router) with quickSync mutation
    → quickSync writes to AccProject + AccProjectMember (new) AND accMemberCache (old, unchanged)
    → Register accRouter in server/routers/root.ts
    → Existing graph + dashboard still read from accMemberCache (no breakage)

Phase C: Folder + Role Sync
    → quickSync extended to include folder + permission extraction
    → AccFolder + AccFolderPermission + AccProjectRole populated
    → Per-project role API wired (new AccProjectRole rows)

Phase D: Data Connector (Deep Sync)
    → lib/acc/extractDataConnectorZip.ts (ZIP download + extract)
    → lib/acc/ingestActivities.ts (streaming CSV parse → AccActivity)
    → users.startDeepSync + users.getDeepSyncStatus procedures
    → AccDataConnectorJob state machine
    → Deep Sync button added to AccAnalysisPanel.tsx

Phase E: Graph Cutover (read switch)
    → Rewrite lib/acc/graphSnapshot.ts to read from AccProjectMember
      instead of accMemberCache
    → Add folder node kind + folder edges to buildAccGraphSnapshot
    → Perf verification: count nodes, benchmark render time
    → AccHubRoleCache singleton → AccRole read path
    → Rebuild AccGraphLayoutCache with new topology
    → accMemberCache writes retained as backup

Phase F: Dashboard Cutover + Activity Drill-Down
    → Rewrite bulkAccSummary to read from AccProjectMember
      (BulkAccUser assembled from relational rows instead of JSON blob)
    → Add productAccess + folderPermissions to BulkAccProject shape
    → DashboardSidePanel gains activity drill-down panel:
        users.getActivityForUser paginated query
    → SelectedFinding union extended if needed

Phase G: Cleanup (v2.1 candidate)
    → accMemberCache write path removed from quickSync
    → AccHubRoleCache singleton write path removed
    → Old JSON-read helpers in bulkAccSummary deleted
```

---

## New vs Modified Files (Symbol-Level)

### New Files

| File | Purpose |
|---|---|
| `server/routers/acc.ts` | New tRPC router: `quickSync`, `startDeepSync`, `getDeepSyncStatus`, `ingestDeepSync` — separate from `users.ts` to avoid bloating the existing 1400-line file |
| `lib/acc/acc-admin-v2.ts` | New APS fetch helpers for Group A endpoints not yet implemented: `fetchAllAccProjects`, `fetchProjectMembersMatrix`, `fetchProjectRoles`, `fetchFolderTree`, `fetchFolderPermissions` |
| `lib/acc/extractDataConnectorZip.ts` | ZIP download + extract pipeline (Data Connector) |
| `lib/acc/ingestActivities.ts` | Streaming CSV → `AccActivity` upsert pipeline |
| `lib/acc/graphSnapshotV2.ts` | Rewrite of `graphSnapshot.ts` reading from relational tables. Keep old file until cutover; swap reference in `users.ts` at Phase E. |

### Modified Files

| File | What Changes | When |
|---|---|---|
| `prisma/schema.prisma` | Add 7 new models (Phase A) | Phase A |
| `server/routers/root.ts` | Add `acc: accRouter` import + registration | Phase B |
| `lib/acc/acc-types.ts` | Add `BulkAccProduct`, `BulkAccFolderPermission`; extend `BulkAccProject` with `productAccess?` + `folderPermissions?` | Phase F |
| `server/routers/users.ts` | `bulkAccSummary` rewritten to read from `AccProjectMember` at Phase F cutover; `syncHubRoles` updated to write to `AccRole` at Phase E | Phases E + F |
| `lib/acc/graphSnapshot.ts` | Reference swapped to `graphSnapshotV2.ts` at Phase E | Phase E |
| `app/(dashboard)/users/AccAnalysisPanel.tsx` | Sync button replaced with Quick + Deep Sync + job status | Phase D |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | Add activity drill-down panel body for per-user activity rows | Phase F |
| `app/(dashboard)/users/dashboard/selectionContext.tsx` | Add `kind: "activity"` to `SelectedFinding` union if needed | Phase F |

---

## Component Architecture Diagram (v2.0 Target State)

```
┌────────────────────────────────────────────────────────────────────┐
│                     Next.js App Router                              │
│  app/(dashboard)/users/page.tsx (RSC shell — unchanged)             │
├────────────────────────────────────────────────────────────────────┤
│  UsersDirectoryClient.tsx ("use client" — unchanged)                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ AccAnalysisPanel.tsx                                           │ │
│  │  [Quick Sync btn] [Deep Sync btn + job status]                 │ │
│  │  reads: acc.quickSync (mut) | acc.getDeepSyncStatus (query)    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  CosmosGraphRenderer │  │  Dashboard (app/.../dashboard/)      │ │
│  │  (unchanged)          │  │  DashboardClient.tsx                 │ │
│  │  now reads folder     │  │  FindingsProvider (extended shape)   │ │
│  │  nodes from           │  │  SelectionProvider (+ activity kind) │ │
│  │  AccGraphLayoutCache  │  │  DashboardSidePanel (+ activity rows)│ │
│  │  (rebuilt by v2 snap) │  └──────────────────────────────────────┘ │
│  └──────────────────────┘                                           │
├────────────────────────────────────────────────────────────────────┤
│                       tRPC Layer                                    │
│  server/routers/users.ts — bulkAccSummary (cutover: reads AccProjectMember)  │
│                          — syncHubRoles (cutover: writes AccRole)            │
│                          — getPrecomputedGraph, rebuildAccGraphCache (unchanged) │
│  server/routers/acc.ts  — quickSync, startDeepSync, getDeepSyncStatus, ingestDeepSync │
├────────────────────────────────────────────────────────────────────┤
│                    Server-Side Data Layer                           │
│  lib/acc/graphSnapshotV2.ts — reads AccProjectMember + AccFolder + AccFolderPermission │
│  lib/acc/graphSimulation.ts — unchanged                              │
│  lib/acc/acc-admin.ts       — existing helpers (unchanged)           │
│  lib/acc/acc-admin-v2.ts    — new helpers for 5 new endpoints        │
│  lib/acc/ingestActivities.ts — streaming CSV → AccActivity           │
│  lib/acc/extractDataConnectorZip.ts — ZIP pipeline                   │
├────────────────────────────────────────────────────────────────────┤
│              PostgreSQL via Prisma                                  │
│  Existing: AccMemberCache, AccHubRoleCache, AccGraphLayoutCache      │
│  New:      AccProject, AccProjectMember, AccRole, AccProjectRole     │
│            AccFolder, AccFolderPermission, AccActivity               │
│            AccDataConnectorJob                                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Architectural Patterns

### Pattern 1: Separate `acc.ts` Router for New Sync Procedures

**What:** All v2.0 sync mutations go in `server/routers/acc.ts`, NOT added to the existing `server/routers/users.ts`.

**Why:** `users.ts` is already 1463 lines. Adding 4–6 new complex mutations (quickSync, startDeepSync, getDeepSyncStatus, ingestDeepSync) would make the file unmaintainable. The `acc` namespace is semantically distinct from user management.

**Integration:** Add `acc: accRouter` to `server/routers/root.ts` alongside existing routers. Client calls become `trpc.acc.quickSync.useMutation()`.

### Pattern 2: Migration Window Dual Writes

**What:** During cutover phases, new sync procedures write to BOTH old tables (accMemberCache) and new relational tables. Read paths switch separately, after new tables are populated.

**Why:** Prevents a "big bang" migration where schema deploys, new sync runs, and UI switches all happen simultaneously. If the new read path has bugs, rolling back means re-enabling the old read path — the old data is still there.

**Pattern:**

```typescript
// In acc.ts quickSync — migration window version
await Promise.all([
  // New canonical write
  db.accProjectMember.upsert({ where: { projectId_email }, ... }),
  // Legacy write — removed at Phase G
  db.accMemberCache.upsert({ where: { email }, data: legacyJson }),
]);
```

### Pattern 3: AccDataConnectorJob as State Machine

**What:** The `AccDataConnectorJob` row is the single source of truth for async job state. No in-memory state for job tracking. The client polls `getDeepSyncStatus` which reads + updates the row.

**Why:** Survives server restarts (Railway deploys happen automatically on push). The APS job is still running at Autodesk's infrastructure; the row tells us what state we were in when we last polled.

**State transition enforcement in `getDeepSyncStatus`:**

```typescript
// Only advance state forward, never backward
if (job.status === "pending" && apsStatus === "running") {
  await db.accDataConnectorJob.update({ where: { id }, data: { status: "running", jobId: apsJobId } });
}
if (job.status === "running" && apsStatus === "success") {
  await db.accDataConnectorJob.update({ where: { id }, data: { status: "success", downloadUrl } });
}
// "failed" is terminal; no further APS polling
```

### Pattern 4: Streaming CSV Ingest via Pause/Resume Backpressure

**What:** The CSV parser stream is paused before each `createMany` call and resumed after. This prevents the read stream from buffering unbounded rows while the DB write is in progress.

**Why:** Without backpressure, a multi-million-row CSV would buffer entirely in memory before the first DB write, causing OOM on a Railway container.

### Pattern 5: Graph Snapshot Function Replacement (Not Wrapper)

**What:** `graphSnapshotV2.ts` is a new file that replaces `graphSnapshot.ts` entirely. The function signature changes (different input type). The call site in `users.ts` swaps the import.

**Why NOT wrapping:** A wrapper that reads from both old and new tables simultaneously would be complex and slower. The migration window (dual writes) ensures the new tables are populated before the read cutover. At cutover, swap the import — do not create a compatibility shim.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running the Folder Tree Extraction Per-User

**What people do:** Fetch folder permissions inside the per-user loop (the way roles are currently fetched in `bulkAccSync` via `fetchAccUserRoles`).

**Why it's wrong:** Folders are per-project, not per-user. Fetching folder trees inside a per-user loop means the same folder tree is fetched N times (once per user in the project). A hub with 100 users × 50 projects × 20 folders = 100,000 API calls instead of 50 projects × 20 folders = 1,000 calls.

**Do this instead:** Fetch folder trees once per project, outside the per-user loop. Store in `AccFolder`. Permissions join to roles, not to individual users.

### Anti-Pattern 2: Loading All AccActivity into BulkAccUser

**What people do:** Add `activities: AccActivity[]` to `BulkAccUser` and pass it through `FindingsContext`.

**Why it's wrong:** `FindingsContext` is computed once for all users on dashboard mount. If each `BulkAccUser` carries hundreds of activity rows, the `computeAllFindings` call and the JSON transfer from tRPC become orders of magnitude larger than the dashboard can handle.

**Do this instead:** Activity rows are lazy-loaded per drill-down selection. `DashboardSidePanel` fires a paginated `users.getActivityForUser` query when the user opens a user's detail panel.

### Anti-Pattern 3: Polling APS from the Client

**What people do:** Have the browser directly poll the APS Data Connector jobs endpoint to check if the job is done.

**Why it's wrong:** APS credentials are server-side only (2-legged tokens must not be exposed to the browser). Client-side polling would require either exposing credentials or creating a new Next.js API route that proxies the poll.

**Do this instead:** The server-side `getDeepSyncStatus` tRPC query both fetches the current `AccDataConnectorJob` row AND calls the APS jobs endpoint if the job is still running — one server round-trip does both. The client polls the tRPC query, not APS directly.

### Anti-Pattern 4: Adding `@unique([userId, action, occurredAt])` Without a Meaningful Dedup Key

**What people do:** Skip the deduplication constraint on `AccActivity` because "we'll just check before inserting."

**Why it's wrong:** Re-ingesting an overlapping date range (e.g., PAST_7_DAYS run twice) will create duplicate rows. Checking-before-inserting at scale requires per-row SELECTs before each INSERT, which is O(n) round-trips.

**Do this instead:** Define `@@unique([userId, action, occurredAt])` on `AccActivity`. Use `createMany({ skipDuplicates: true })` for idempotent ingestion.

### Anti-Pattern 5: Migrating accMemberCache in a Single Big-Bang Deploy

**What people do:** Drop `accMemberCache` and switch all reads to `AccProjectMember` in one migration.

**Why it's wrong:** If `quickSync` has a bug and the new tables are incorrectly populated, the dashboard is broken and rollback requires re-running the old `bulkAccSync` against all users. On a 1200-user hub this takes 10–30 minutes.

**Do this instead:** Keep `accMemberCache` writes running during the migration window. Switch reads only after validating new tables with a comparison query. Remove old writes only in a subsequent cleanup phase.

---

## Data Flow

### Quick Sync Flow

```
User clicks "Quick Sync"
    ↓
trpc.acc.quickSync.useMutation()
    ↓
server/routers/acc.ts → quickSync mutation
    ↓
1. get2LeggedAutodeskToken()
2. getAccountId(db)
3. fetchAllAccProjects() → db.accProject.upsertMany
4. fetchAllAccUsers() (existing) → build email→user map
5. pLimit(3): for each project
    a. fetchProjectMembersMatrix(projectId) → db.accProjectMember.upsert (+ db.accMemberCache.upsert legacy)
    b. fetchProjectRoles(projectId) → db.accProjectRole.upsertMany
    c. fetchFolderTree(projectId) → db.accFolder.upsertMany
    d. fetchFolderPermissions(folderId[]) → db.accFolderPermission.upsertMany
6. rebuildAccGraphCache(db) (existing fn, reads graphSnapshotV2)
    ↓
Return { projectCount, memberCount, folderCount, graphCache }
```

### Deep Sync Flow

```
User clicks "Deep Sync"
    ↓
trpc.acc.startDeepSync.useMutation()
    → POST /data-connector/v1/accounts/:id/requests
    → Create AccDataConnectorJob {status:"pending", requestId}
    → Return {jobId}
    ↓
Client polls trpc.acc.getDeepSyncStatus({jobId}) every 5s
    ↓
[Server-side per poll]
    → Read AccDataConnectorJob
    → GET /data-connector/.../requests/:requestId/jobs
    → Update row status (pending→running→success/failed)
    → Return status to client
    ↓
When status === "success":
    Client triggers trpc.acc.ingestDeepSync({jobId})
    ↓
Server:
    → Download ZIP from downloadUrl (fetch, no auth headers)
    → Extract to /tmp/dc-{jobId}/
    → ingestActivitiesFromCsv(project_activities.csv, db) — streaming
    → ingestActivitiesFromCsv(admin_activities.csv, db) — streaming
    → Update AccDataConnectorJob.rowsIngested + completedAt
    ↓
Client receives completion; cache invalidation fires (trpc.users.bulkAccSummary)
```

---

## Scaling Considerations

| Concern | Current (v1.0) | v2.0 |
|---|---|---|
| AccMemberCache rows | ~1,200 rows (one per hub user) | Replaced by AccProjectMember: potentially 1,200 users × N projects (could be 50k+ rows) |
| AccActivity rows | None | Unbounded growth — index on (userEmail, occurredAt) + (projectId, occurredAt) mandatory |
| Graph node count | 25,559 (achieved in v1.0) | +folder nodes; perf verification required before enabling in production |
| Sync duration (Quick) | ~5–15 min (hub scan + per-user APIs) | Longer due to per-project folder crawl (depth-first, sequential per project) |
| Sync duration (Deep) | N/A | Minutes to hours at APS; ingestion depends on CSV size |

**First bottleneck in v2.0:** Folder tree extraction. A hub with 100 projects × 50 folders × depth 3 = 150,000 individual folder API calls. Rate limiting will be hit. Mitigation: batch projects with pLimit(2), add exponential backoff on 429 responses (already exists in `acc-admin.ts`).

**Second bottleneck:** `AccActivity` table growth. Index on `(userEmail, occurredAt DESC)` is mandatory from day one. PostgreSQL B-tree handles time-series queries efficiently with this index. At 10M+ rows, consider partitioning by year — but that's beyond v2.0 scope.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| APS Construction Admin API v1 | 2-legged OAuth, paginated REST, pLimit(3) concurrency | `GET /projects/:id/users` — new call, not in existing `acc-admin.ts` |
| APS HQ v2 industry_roles | 2-legged OAuth, per-project loop | New endpoint, add to `acc-admin-v2.ts` |
| APS Data Management API | 2-legged OAuth, recursive folder crawl | Different base URL; `project/v1/hubs/:hubId/...` and `data/v1/projects/...` |
| APS BIM 360 Docs API | 2-legged OAuth, per-folder permissions | `bim360/docs/v1/projects/:id/folders/:urn/permissions` |
| APS Data Connector API | 2-legged OAuth, async job + signed S3 download | `data:read` + `data:create` scopes required — verify APS app has these |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| `acc.ts` router ↔ `lib/acc/acc-admin-v2.ts` | Direct import (same process) | New file; mirrors existing `lib/server/acc-admin.ts` structure |
| `acc.ts` router ↔ `lib/acc/ingestActivities.ts` | Direct import | Streaming — must not block the tRPC handler event loop; consider worker_thread if CSV parse is CPU-heavy |
| `users.ts` router ↔ `lib/acc/graphSnapshotV2.ts` | Direct import (replaces graphSnapshot.ts at Phase E) | Only one call site in `rebuildAccGraphCache` function |
| `DashboardClient.tsx` ↔ `FindingsContext` | React context (unchanged pattern) | `BulkAccUser` shape extends additively |
| `DashboardSidePanel.tsx` ↔ new activity query | `trpc.users.getActivityForUser.useQuery()` | Lazy query — only fires when a user selection is active |

---

## Sources

- Direct codebase reading: `server/routers/users.ts` (full file, 1463 lines)
- Direct codebase reading: `prisma/schema.prisma`
- Direct codebase reading: `lib/acc/acc-types.ts`
- Direct codebase reading: `app/(dashboard)/users/dashboard/findingsContext.tsx`
- Direct codebase reading: `app/(dashboard)/users/dashboard/selectionContext.tsx`
- Direct codebase reading: `app/(dashboard)/users/dashboard/DashboardClient.tsx`
- Direct codebase reading: `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx`
- Direct codebase reading: `server/routers/root.ts`
- Direct reading: all 9 `APS_DOCS/HOW TO/` documents
- Prior research: `.planning/research/v1.0/ARCHITECTURE.md`
- `.planning/PROJECT.md` v2.0 milestone definition

---
*Architecture research for: ACC Extraction Layer v2.0 — APS endpoint parity + Prisma schema + existing UI enrichment*
*Researched: 2026-05-08*
