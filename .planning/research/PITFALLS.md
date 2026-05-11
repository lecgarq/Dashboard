# Pitfalls Research

**Domain:** ACC Extraction Completion — adding Data Connector async jobs, recursive folder crawl, folder-role permissions, activity log all-time retention, and folder nodes in Cosmos.gl graph to an existing dashboard with bulkAccSync + accMemberCache + working 25k-node graph
**Researched:** 2026-05-08
**Confidence:** HIGH — grounded in all 9 HOW_TO docs (scraped APS docs), v1.0 PITFALLS.md, STATE.md accumulated context, and PROJECT.md locked decisions

---

## TOP THREE — Read These First

The three pitfalls below have the highest probability of causing a phase rewrite or production incident. Each has its own full section below.

| # | Name | Why Top Three |
|---|------|---------------|
| 1 | b.-prefix contradiction between Construction Admin API and Data Management API | Silent 401/403 that looks like auth failure; already bit v1.0 in a different form; now has a NEW direction (DM API needs it, CA API strips it) |
| 2 | Data Connector job pattern: inline await will timeout the Railway function | Default Next.js timeout is 300s; Data Connector jobs take minutes to hours; inline polling guarantees a 5-minute cliff |
| 3 | Folder nodes in graph without pre-flight perf gate | Node count is unknown until you actually crawl; discovering the Cosmos.gl cliff in a late phase means graph work is thrown away |

---

## Critical Pitfalls

### Pitfall 1: b.-prefix Contradiction — Construction Admin API vs Data Management API

**What goes wrong:**
The `b.` prefix is required in opposite directions depending on which API family you are calling. The Data Management API (folder crawl, folder contents, top folders) requires the full `b.`-prefixed projectId. The Construction Admin API (project users, project list, folder permissions) requires the bare UUID with `b.` stripped. If you use one stripping pattern for all APS calls, you will get 401s or 404s on exactly the wrong half of your v2.0 extraction pipeline.

The v1.0 codebase established `getAccountId(db)` to strip `b.` from the hub ID for ACC Admin API calls. That pattern is correct for hub-level calls. It does NOT apply to projectId values passed to the Data Management API (top folders, folder contents, folder search).

Concrete from HOW_TO_Extract_All_Files_and_Folders.md: "In the Data Management API, your Project ID must retain the `b.` prefix!"
Concrete from HOW_TO_Extract_Project_Members.md: "The `:projectId` is WITHOUT the `b.` prefix."
Concrete from HOW_TO_Extract_Folder_Role_Permissions.md: The folder permissions endpoint uses `projectId.replace('b.', '')`, but the folder crawl above it uses the raw `projectId` with `b.` intact.

**Why it happens:**
The APS platform was built across different product eras (BIM 360, HQ, Construction Admin, Data Management). Each API family has its own convention. A developer looking at the existing `getAccountId` helper will assume the stripping pattern is universal and apply it to projectId values for folder crawl calls — which silently breaks them.

**How to avoid:**
- Create two distinct helper shapes: `getAccountId(db)` (strips `b.` from hub, for CA/HQ endpoints) and `getProjectIdForDM(rawProjectId)` (returns raw with `b.` intact, for Data Management endpoints). Name them so the distinction is obvious.
- Code-review rule: Every new APS call must be tagged with which API family it belongs to. DM API = keep `b.`. CA/HQ API = strip `b.`.
- Add a comment at the top of every router file that touches multiple API families listing the convention.
- Unit test: call each helper with a `b.`-prefixed string and assert the correct output.

**Warning signs:**
- Data Management folder crawl returns 404 for a projectId that definitely exists
- Construction Admin user list returns 401 when hub-level calls work fine
- The two failures appear at different extraction steps and are mistaken for auth/scope issues

**Phase to address:**
Phase 1 (extraction foundation) — before any folder crawl, permission fetch, or member matrix work. Establish the two helpers and the naming convention before a single data extraction function is written.

---

### Pitfall 2: Data Connector Job Pattern — Inline Polling Guarantees a 5-Minute Cliff

**What goes wrong:**
HOW_TO_Extract_Activity_Logs.md shows a `while (!downloadUrl) { await sleep(60000); ... }` loop. If this pattern is implemented inside a tRPC mutation or a Next.js Route Handler, it will hit Railway's function timeout (Next.js default is 300 seconds = 5 minutes). Data Connector jobs for a large hub (all-time retention) can take 10–60 minutes. The server action silently times out, the job finishes on the APS side, but the client never receives the download URL and the activity data is never persisted.

Additionally: if the user triggers Sync twice (double-click, re-visit), two concurrent job requests are submitted to APS. There is no idempotency key in the Data Connector API. Two separate jobs will run, the first to finish writes its data, the second overwrites it — with no collision detection.

**Why it happens:**
The HOW_TO example script is correct for a standalone Node.js script. It is not designed for a server-side function with an HTTP timeout. The polling loop that looks fine in a script becomes a reliability bomb in a web server context.

**How to avoid:**
- Pattern: persistent job table in Prisma + client polling. The tRPC mutation only submits the job (`POST /requests`) and records `{ requestId, status: "pending", submittedAt }` in a `DataConnectorJob` table. A separate tRPC query (`getJobStatus`) polls the APS jobs endpoint on demand and updates the row. The client polls `getJobStatus` every 30 seconds with a visible progress surface.
- Download and parse in a separate async step triggered when job status becomes `success`. Stream the ZIP using Node.js `stream` pipeline so multi-GB files are not buffered entirely in RAM.
- Lock against double-submit: before creating a new job, check for an existing `pending` or `running` row in `DataConnectorJob` for the same `accountId`. If one exists, return its status to the client instead of creating a second request.
- Surface failed jobs explicitly: store `status: "failed"` and `errorMessage` in the table; show an actionable error in the sync UI with a manual retry button.

**Warning signs:**
- Railway logs show the sync mutation completing with no error, but activity data never appears in the database
- The client shows "Sync complete" but the activity log widget shows zero rows
- Two concurrent jobs both return `success` and the activity table has duplicate rows from overlapping date ranges

**Phase to address:**
Phase 1 (extraction foundation) or a dedicated Phase 2 (Data Connector sync engine). Must be designed before any activity log features are built on top of it, because the storage schema depends on the async job model.

---

### Pitfall 3: Folders in Graph — Discovering the Node-Count Cliff in a Late Phase

**What goes wrong:**
PROJECT.md explicitly flags this as HIGH RISK: "Folders enter spatial graph (override) — perf will be validated in research." The v1.0 exclusion rationale was "node count multiplies unmanageably." A typical ACC hub has dozens of projects, each with hundreds of folders and subfolders. If a hub has 50 projects × 200 folders each = 10,000 folder nodes added to an existing 25,559-node graph = 35,000+ nodes. Cosmos.gl 3.0.0-beta.8 has handled 25k nodes, but performance at 35k-50k is unverified. If this is discovered in a late phase (after the Prisma folder schema, folder crawl sync, and dashboard widgets are built), throwing away the graph work is extremely expensive.

**Why it happens:**
Folder nodes feel like "just more nodes" — the graph already handles 25k, so 10k more should be fine. But Cosmos.gl typed-array uploads scale with node count. The GPU simulation step cost is O(n) per tick. WebGL context memory is finite. The cliff might be at 30k, 40k, or 50k — it is unknown. The only way to know is to run it.

**How to avoid:**
- Make the perf pre-flight the first deliverable of the folder-graph phase, not the last. Steps: (1) crawl one representative project and count its folders, (2) extrapolate total folder count for the hub, (3) instantiate Cosmos.gl with `existingNodes + folderCount` synthetic nodes and measure FPS + GPU memory, (4) gate the rest of folder-graph work on a clear pass threshold (60fps at full node count).
- Design the folder node layer as opt-in by default (hidden, toggled on). This means even if perf is borderline, users can disable folder nodes for a clean view. Never add folder nodes to the initial render without a hide-by-default toggle.
- Filter folder nodes by project before adding to graph: only load folders for projects currently in the filter selection. This bounds the worst case to a single project's folder tree rather than all projects simultaneously.
- If perf fails at full-hub scale, fall back to a project-scoped folder view (show folders only when exactly one project is selected in the filter panel) — document this as the contingency in the phase plan.

**Warning signs:**
- Cosmos.gl `setPointPositions` call duration spikes above 16ms after folder nodes are added
- GPU memory usage in Chrome DevTools → Performance → GPU Memory exceeds 500MB
- Physics simulation FPS drops below 30 when folder toggle is enabled
- The `cosmosReady` flag takes more than 3 seconds to fire after adding folder nodes

**Phase to address:**
A dedicated perf-feasibility phase before any folder-graph rendering work. Do not implement folder node rendering until this phase produces a verified GO decision.

---

### Pitfall 4: accMemberCache → AccProjectMember Table Cutover Without Breaking Existing Dashboard

**What goes wrong:**
The existing dashboard (DASH-01..13, all 9 widgets) reads from `accMemberCache.data` — a JSON blob on a single Prisma row. v2.0 will migrate this to real `AccProjectMember`, `AccFolder`, `AccActivity`, etc. tables. If the cutover is done in a single migration that drops `accMemberCache` and replaces all reads simultaneously, any in-flight dashboard request during the Railway deploy will return empty data or throw Prisma errors. The user will see a blank Access Analysis dashboard in production for the duration of the deploy restart.

Additionally: `accMemberCache` had partial data for some fields. `BulkAccUser.addedOn` was normalized from `created_at` in Phase 04-access-analysis P02. `BulkAccUser.lastSignIn` was aliased from `last_sign_in || last_activity || lastSignIn` (field name unverified live). Backfilling the new Prisma tables from the JSON cache will inherit these partial values — users who were in the old cache with `addedOn: null` will still have null in the new table unless a re-sync is triggered.

**Why it happens:**
Big-bang schema migrations feel cleaner than dual-read paths. But Railway deploys have a brief period where the new code is running against a database that may still have the old schema, or the old code is running against the new schema.

**How to avoid:**
- Dual-existence window: keep `accMemberCache` readable during v2.0 and introduce the new tables in an additive migration (no drops). The new sync path writes to both `accMemberCache` AND the new tables during a transition phase. Dashboard reads switch to the new tables only after the first v2.0 sync has populated them (detected by a `syncedAt` timestamp on a `SyncState` table row).
- Backfill strategy: after the first v2.0 sync, run a one-time migration script that upserts `addedOn` / `lastSignIn` into `AccProjectMember` from the new API data (not from the stale cache). Backfilling from the cache is acceptable for `addedOn` if the API data is unavailable, but `lastSignIn` must come from the Construction Admin API `?fields=lastSignIn` query (see Pitfall 5 below).
- Never drop `accMemberCache` until at least one successful v2.0 sync has been verified in production and the dashboard shows correct data from the new tables.

**Warning signs:**
- Post-deploy: Access Analysis dashboard shows 0 users or Prisma query throws `PrismaClientKnownRequestError: table not found`
- `addedOn` values are uniformly null in the new `AccProjectMember` table after migration
- The sync button shows "complete" but the new tables are empty

**Phase to address:**
Phase 1 (schema foundation). The Prisma migration strategy must be designed before any new tables are created, so the dual-existence pattern is built in from day one.

---

### Pitfall 5: lastSignIn Requires Explicit ?fields= Parameter and Returns a Different Field Name Per API

**What goes wrong:**
There are two entirely different ways to get `lastSignIn` depending on which API you call, and they use different field names:

- HQ v1 (`/hq/v1/accounts/:accountId/users`): field name is `last_sign_in` (snake_case), returned by default
- Construction Admin v1 (`/construction/admin/v1/projects/:projectId/users`): field name is `lastSignIn` (camelCase), NOT returned by default — requires `?fields=name,email,lastSignIn` in the URL

The existing v1.0 code aliases `last_sign_in || last_activity || lastSignIn` because the field name was unverified live (STATE.md: "field names unverified live; diagnostic log will confirm on next sync"). If the Construction Admin endpoint is called without the `?fields=` parameter, `lastSignIn` will be absent from the response object entirely — it will not be null, it will be missing. A `user.lastSignIn ?? null` coalesces this to null silently, making it appear that all project-level users have never signed in.

**Why it happens:**
HOW_TO_Extract_Last_Sign_In.md documents this clearly: "Crucial Note: When using the new Admin API, you must explicitly request the `lastSignIn` field by appending `?fields=name,email,lastSignIn` to your URL." Developers copying the URL from an existing call that does not include `?fields=` will miss this.

**How to avoid:**
- Build the `?fields=` parameter into the Construction Admin user fetch function as a non-optional constant. Never call this endpoint without it.
- The function signature should have `fields` hardcoded, not passed as a parameter that could be omitted.
- Verify at sync time: log a warning if a user row from Construction Admin has `lastSignIn` property absent (vs. present-but-null) — absence indicates the `?fields=` param was dropped.
- At the Prisma write boundary, distinguish `null` (user has never signed in) from `undefined` (field was not requested) — reject the write if `lastSignIn` is `undefined` so the bug is caught immediately rather than stored as null.

**Warning signs:**
- All users in the new `AccProjectMember` table have `lastSignIn: null` after a full sync
- The Last Sign-In column in the user list shows "Never" for every user including ones known to be active
- No `lastSignIn` key appears in the raw API response JSON logged during sync

**Phase to address:**
Phase 1 (extraction foundation) — the Construction Admin user fetch function must include the `?fields=` parameter from its first implementation.

---

### Pitfall 6: Folder Permission actions Array — Wrong Mapping to UI Permission Type

**What goes wrong:**
HOW_TO_Extract_Folder_Role_Permissions.md documents a 6-level mapping from the `actions` array to UI permission type labels. The mapping is order-dependent and easy to implement incorrectly. Specifically:

- `["VIEW", "COLLABORATE"]` → View Only (no download)
- `["VIEW", "DOWNLOAD", "COLLABORATE"]` → View / Download
- `["PUBLISH"]` → Upload Only (no view)
- `["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE"]` → View / Download + Upload
- `["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "EDIT"]` → + Edit
- `["PUBLISH", "VIEW", "DOWNLOAD", "COLLABORATE", "EDIT", "CONTROL"]` → Full Controller

A naive implementation that checks `includes("EDIT")` without checking for `CONTROL` first will classify "Full Controller" as "View/Download/Upload/Edit". An implementation that checks `includes("DOWNLOAD")` without checking for `PUBLISH` first will classify "Upload Only" as "View/Download".

The HOW_TO example script shows the correct cascade (CONTROL first, then EDIT, then PUBLISH+VIEW, etc.) but it is easy to reorder when writing fresh.

Additionally, `subjectType` must be filtered to `"ROLE"` — the same endpoint returns user-specific and group-specific permissions as well. Forgetting the filter bloats the permission table with non-role entries.

**Why it happens:**
The `actions` array is a set, not an ordered list. Membership-check logic invites bugs when the cascade priority is not obvious. The `CONTROL` vs `EDIT` ambiguity is the most common failure.

**How to avoid:**
- Implement as a pure function with an exhaustive test: given each of the 6 documented actions arrays, assert the correct label. Include edge cases: empty array, single-action array, unknown action.
- The cascade must check `CONTROL` before `EDIT`, `PUBLISH+VIEW` before `PUBLISH` alone, `DOWNLOAD` only inside the `PUBLISH+VIEW` branch.
- Store the raw `actions` array in Prisma alongside the computed label so the label can be recomputed if the mapping logic changes.
- Always filter `subjectType === "ROLE"` before processing.

**Warning signs:**
- Full Controller folders show as "View/Download/Upload/Edit" in the dashboard
- Upload-Only folders show as "View/Download"
- The permissions table has user-level permission rows (subject emails instead of role names)

**Phase to address:**
Phase that implements folder-role permissions extraction. Add the exhaustive unit test before the UI consumes the label.

---

### Pitfall 7: Activity Log All-Time Retention — No Prune Strategy Means Table Size Grows Unboundedly

**What goes wrong:**
PROJECT.md decision: "Activity log retained all-time (no prune)." The `project_activities.csv` from Data Connector can be massive — a large hub with years of history may have millions of rows. Each sync run that uses a broad `dateRange` or `CUSTOM` with wide bounds will re-download and attempt to upsert all rows. Without an upsert-by-primary-key strategy, duplicate rows accumulate. Without indexes, queries against this table degrade from O(log n) to O(n) as the table grows.

Additionally: the all-time retention decision was made without a stated upper bound on storage cost. On Railway's PostgreSQL, storage is metered. A 10-million-row activity table with `varchar` columns for `action`, `details`, `service`, `tool` could reach several gigabytes.

**Why it happens:**
"Retain all-time" is the correct audit/compliance decision. The failure is implementing it without the index strategy and upsert pattern that make it survivable.

**How to avoid:**
- Primary key on `(external_id)` from the CSV — each activity row has a unique ID in the Data Connector output. Use this as the upsert key to prevent duplicates on re-sync.
- Composite indexes required at schema creation: `(user_id, created_at)` for per-user timeline queries, `(project_id, created_at)` for per-project activity. Add a partial index `WHERE action IN (...)` on the file-action subset used by "last file activity per user."
- Store `action` as an enum or a reference FK to an `ActivityAction` lookup table — not as a raw string column. This bounds the carriage values, prevents typo variants from appearing as distinct rows, and halves storage for high-cardinality action columns.
- First sync should use a bounded date range (e.g., last 12 months) to validate the pipeline, then expand to all-time in a follow-up sync. Never first-sync all-time on an unknown-size hub.
- Add a `DataConnectorSync` table row recording rows imported per run, so growth rate is visible before it becomes a problem.

**Warning signs:**
- The activity table has duplicate rows with the same timestamp and user for the same action
- Dashboard widget queries against the activity table take more than 500ms on a 1-year dataset
- Railway storage dashboard shows the database growing faster than 100MB per week

**Phase to address:**
Schema foundation phase (index strategy must be in the initial migration) and Data Connector sync phase (upsert pattern + bounded first sync).

---

### Pitfall 8: Recursive Folder Crawl — Quadratic+ API Calls Without Batching

**What goes wrong:**
HOW_TO_Extract_All_Files_and_Folders.md shows a `scanFolder` function that makes one API call per folder. If a project has 200 folders, that is 200 sequential API calls per project. With 50 projects, that is 10,000 calls just to build the folder tree — before adding the per-folder permissions call from HOW_TO_Extract_Folder_Role_Permissions.md. The permissions call doubles it: 20,000 calls total, sequential, each waiting on the previous. At APS rate limits (varies, typically 60–300 req/min per token), this is 1–5 hours of sync time. The Data Connector approach cannot replace this because folder permissions are not in the Data Connector CSV.

**Why it happens:**
The HOW_TO example is correct as a demonstration script. It is not designed for production scale. A developer implementing it literally will not notice the problem until they run it against the real hub.

**How to avoid:**
- Concurrent crawl with a concurrency limiter: `pLimit(5)` for folder contents calls, `pLimit(3)` for permissions calls (tighter, as permissions calls are heavier). Never serial.
- Cache the folder tree between syncs. Only re-crawl folders where the project's `updatedAt` timestamp has changed (check via Construction Admin project list). Most projects will not have new folders on each sync.
- Do NOT fetch folder permissions for every folder on every sync. Fetch permissions only for folders whose tree entry does not exist in Prisma OR whose `updatedAt` changed. Incremental permissions sync.
- The permission fetch loop (one call per folder) is the real bottleneck, not the crawl. Prioritize getting it behind a cache.
- Add a hard ceiling: if folder count exceeds N (e.g., 5,000), log a warning and skip the permissions fetch for that project, marking it with `permissionsSyncStatus: "skipped_too_large"`.

**Warning signs:**
- Folder sync takes more than 5 minutes for a single project
- APS returns 429 responses during folder crawl
- The sync UI shows "running" for over 30 minutes with no progress update

**Phase to address:**
Folder crawl phase — the concurrency pattern must be established before the first production sync attempt.

---

### Pitfall 9: CSV Rows Stuffed Directly into Prisma Without Normalization

**What goes wrong:**
Data Connector produces CSV files. The temptation is to parse the CSV and `createMany` the rows directly into a flat Prisma table that mirrors the CSV columns. This works for a prototype but creates several problems:

- `action` values are free-text strings ("Member Added", "Document Viewed", "File Uploaded") — typo variants from different ACC product generations will appear as distinct rows with no ability to normalize retroactively
- `user_id` in the CSV is an Autodesk user ID — not the email address used elsewhere in the schema. Without a join table or a lookup step, the activity table is disconnected from the `AccProjectMember` table
- `project_id` in the CSV uses the bare UUID format (no `b.` prefix) — different from the format in the Data Management API (see Pitfall 1)
- Empty `details` fields for some action types — NULL vs empty-string inconsistency if not normalized at write boundary

**How to avoid:**
- Normalize `action` to an enum at ingest. Maintain a canonical mapping of all documented action strings to enum values. Unknown strings map to `UNKNOWN` rather than being stored verbatim.
- Resolve `user_id` to the `AccProjectMember.id` FK at ingest. If no match exists (user in activity log but not in member table), create a minimal `AccProjectMember` row and mark it `syncStatus: "partial"`.
- Store the raw CSV `user_id` string as a secondary column for debugging, separate from the FK.
- Coerce empty strings to NULL at the write boundary for all nullable text columns.

**Warning signs:**
- `SELECT DISTINCT action FROM acc_activities` returns dozens of variants including "Member Added", "member added", "Member added" as separate values
- Activity log widget shows users as "Unknown" because `user_id` was never resolved
- Cross-joins between `acc_activities` and `acc_project_members` return empty results

**Phase to address:**
Data Connector sync phase — the ingest normalization layer must be built before any rows are written to the database.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Inline `while` poll loop for Data Connector job in a tRPC mutation | Works in dev with short jobs | Times out on Railway for all-time extractions; silent failure | Never — use persistent job table + client polling from day one |
| Drop `accMemberCache` immediately when new tables are ready | Cleaner schema | Dashboard breaks during Railway deploy window | Never — maintain dual-read until first v2.0 sync confirmed in production |
| Fetch folder permissions on every sync for every folder | Always fresh | 10k+ API calls per sync; hours of runtime | Acceptable only for a single-project test run; production must use incremental/cached |
| Store `action` column as raw CSV string | No enum mapping work | Cannot group/query by action type; typo variants proliferate | Never for production schema — enum or FK lookup required |
| Single sync mutex without a job table | Simple to implement | No retry, no progress, no concurrent-request protection | Never — the job table is the minimum viable safety net |
| Apply `b.` strip universally across all APS API calls | One pattern to remember | DM API calls break silently returning 404 | Never — the direction of strip is API-family-specific and must be explicit |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Data Management API — folder crawl | Stripping `b.` from projectId (following the CA/HQ pattern) | Keep `b.` prefix for all Data Management API calls; create `getProjectIdForDM()` helper that returns the raw prefixed ID |
| Construction Admin API — project users | Forgetting `?fields=name,email,lastSignIn` | Hardcode the fields parameter in the fetch function; never call this endpoint without it |
| Data Connector — signed S3 download URL | Adding `Authorization: Bearer ...` header to the download request | The download URL is a pre-signed S3 URL; it must be fetched with NO auth headers (the signature IS the auth) |
| Data Connector — job submission | Calling `POST /requests` synchronously inside a server action | Only submit the job ID; persist it to a `DataConnectorJob` table; poll from the client |
| HQ v1 vs Construction Admin v1 | Assuming `last_sign_in` (HQ snake_case) equals `lastSignIn` (CA camelCase) | Treat them as distinct fields; CA requires explicit `?fields=` opt-in |
| Folder permissions — `subjectType` | Processing all permission entries without filtering | Always filter `subjectType === "ROLE"` before persisting; user-level and group-level permissions are also in the response |
| Activity CSV — `user_id` | Assuming it matches any existing ID in the codebase | It is a raw Autodesk platform user ID; must be resolved to `AccProjectMember` via a separate users.csv join table from the same ZIP |
| HQ v2 industry roles | Using `accountId` with `b.` prefix | HQ v2 `industry_roles` endpoints require bare UUID (strip `b.`) — same as HQ v1 and CA patterns |
| Construction Admin — project list | Using `project.id` directly for DM API calls | `project.id` from CA is already bare UUID; prefix it back with `b.` before passing to DM endpoints |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Serial recursive folder crawl | Sync takes 1+ hours for a 50-project hub | `pLimit(5)` concurrent folder content fetches; `pLimit(3)` for permissions | >20 projects with >100 folders each |
| Per-folder permissions fetch on every sync | API quota exhausted (429s) mid-sync | Incremental: only fetch permissions for changed/new folders; cache `permissionsUpdatedAt` per folder row | >200 folders in any single project |
| Cosmos.gl graph with all hub folders added eagerly | FPS drops below 30; GPU memory > 500MB | Pre-flight node count check; hide folders by default; project-filter bound | >10,000 folder nodes total |
| ZIP download buffered entirely in memory | Railway dyno OOM kill during large hub sync | Stream the ZIP using Node.js `stream.pipeline` to disk or directly to unzip | ZIP > 500MB (large hubs, all-time data) |
| Activity table queries with no index | Dashboard activity widgets take 2-10 seconds | Composite indexes on `(user_id, created_at)` and `(project_id, created_at)` in initial migration | >500,000 rows in activity table |
| All-time Data Connector job as first sync | Job takes hours; no progress feedback | First sync uses bounded date range (last 3 months); expand to all-time only after pipeline validation | Any first sync without a date bound |
| `pLimit(3)` from v1.0 applied to new concurrent folder+permission+member calls | APS returns 429 across multiple extraction types simultaneously | Per-extraction-type concurrency limiters; total in-flight cap across all types | Hub growth beyond 30 projects |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Passing the Data Connector signed S3 URL to the client | Client can download raw activity CSV directly, bypassing all dashboard access controls | Download, unzip, and parse on the server only; never return the download URL in a tRPC response |
| Storing raw Data Connector ZIP file path in Prisma | ZIP contains all hub member emails, project names, and activity details — if accessible via a guessable path, data is fully exposed | Parse and discard the ZIP in a single streaming pass; never persist it to disk in a publicly accessible location |
| Folder permission data (which roles can access which folders) readable by non-admin dashboard users | Exposes internal project permission structure to unauthorized parties | Gate all new v2.0 tRPC procedures on `adminProcedure`; folder/permission/activity data is as sensitive as member data |
| `getAccountId` helper reused for Data Management API calls | Returns a stripped ID that will silently call the wrong project | Separate helpers by API family; the shared helper's name and signature should make its scope explicit |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Adding folder nodes to graph without a hide-by-default toggle | First-render shock — user opens the graph and it has 10k new nodes cluttering the view | Folders hidden by default; prominent toggle in filter panel; persist toggle state in localStorage alongside other filter params |
| Showing sync progress as a spinner with no sub-status | User cannot tell if the sync is at "submitting job," "waiting for Data Connector," "downloading ZIP," or "parsing CSV" | Four-state progress indicator: Submitting → Waiting → Downloading → Importing; each state is a distinct DB status on the `DataConnectorSync` row |
| Filter facet explosion: adding a filter for every new v2.0 field | Filter panel becomes unusable with 15+ facets | Add only three new filter facets maximum: folder (project-scoped), last active date, and activity count. All other new fields surface in the user side panel on click, not as filter facets. |
| Widget count growing from 9 to 13+ without layout consideration | Dashboard feels crowded; existing DnD widget order breaks for users with saved layouts | Do not add new top-level widgets; enrich existing widgets (e.g., KPI widget shows last-sync timestamp; RecentlyAdded widget shows admin attribution from activity log). New data surfaces as drill-down content, not new widgets. |
| Interactivity regression: new v2.0 graphical widgets added without hover/click/cross-selection | User feedback memory explicitly flags static graphics as a regression vs. lists | All v2.0 widget additions must follow feedback_widget_interactivity.md contract: hover detail panels, click-through to side panel, cross-widget selection spotlighting. Non-negotiable. |
| Sync button enabled during an in-flight job | User triggers second sync, Data Connector creates a second job, data imports twice or overwrites | Disable the sync button while any `DataConnectorJob` row is `pending` or `running`; show job status inline |

---

## "Looks Done But Isn't" Checklist

- [ ] **b.-prefix for DM API calls:** Every call to `project/v1/hubs/:hubId/projects/:projectId/topFolders` and `data/v1/projects/:projectId/folders/...` uses a `b.`-prefixed projectId. Run `grep -r "topFolders\|folders/" server/` and verify no `.replace('b.', '')` precedes these calls.
- [ ] **`?fields=lastSignIn` on Construction Admin user calls:** Run `grep -r "construction/admin/v1/projects" server/` and verify every hit includes `fields=` in the URL or in query params.
- [ ] **Data Connector download URL — no auth header:** The fetch that downloads the S3 URL must not include an `Authorization` header. Verify the download fetch uses `fetch(downloadUrl)` with no custom headers.
- [ ] **Job table + client polling wired before first sync test:** The `DataConnectorJob` table must exist in the schema and the poll query must be implemented before any real sync is run against the APS endpoint.
- [ ] **Folder node toggle defaults to hidden:** Open the graph after a v2.0 sync that populated folders. Verify folders are not visible until the toggle is explicitly enabled.
- [ ] **Activity table indexes exist:** Run `\d acc_activities` in psql and verify both composite indexes (`user_id, created_at` and `project_id, created_at`) are present before the first all-time sync.
- [ ] **`accMemberCache` still readable after v2.0 migration:** Deploy the v2.0 schema migration and immediately load the Access Analysis dashboard. Verify it shows existing data from the cache, not an empty state.
- [ ] **Folder permissions `subjectType` filter applied:** Query `SELECT DISTINCT subject_type FROM acc_folder_permissions` after first sync. If non-"ROLE" subject types appear, the filter was not applied at ingest.
- [ ] **action column is an enum/FK, not raw string:** `SELECT DISTINCT action FROM acc_activities` after first sync must return only known enum values; no lowercase variants, no "Unknown" variants beyond the explicit UNKNOWN sentinel.
- [ ] **`adminProcedure` gate on all new v2.0 routes:** `grep -r "folderPermissions\|accActivity\|dataConnector\|folderTree" server/` — every hit must be inside an `adminProcedure`.
- [ ] **Pre-flight perf test passed before folder-graph rendering begins:** The GO decision for folders-in-graph must be recorded in the phase summary. No folder-graph rendering code may ship without a documented FPS + GPU memory result.
- [ ] **New widgets pass interactivity check:** Per feedback_widget_interactivity.md — every new or reskinned widget must have hover detail, click-through to side panel, and cross-widget selection wired before declaring done.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Data Connector job timed out, data never imported | MEDIUM | Add the `DataConnectorJob` table, re-trigger sync; the APS job result is available for 24h via the same `requestId` — query it and retry the download step without re-submitting the job |
| `accMemberCache` dropped before v2.0 sync confirmed | HIGH | Restore from Railway PostgreSQL backup (Railway retains 7-day backups by default); re-deploy previous schema migration |
| Folder crawl hit APS rate limit mid-sync | LOW | Add `pLimit` + exponential backoff; re-run sync; folder table has upsert-on-id so partial runs do not duplicate |
| Cosmos.gl FPS cliff hit after folder nodes added | HIGH | Enable project-filter gate immediately (only show folders for selected project); remove all-projects folder display; document as known constraint; perf pre-flight should have caught this — it means the pre-flight phase was skipped |
| Activity table full of duplicate rows | MEDIUM | Add unique constraint on `external_id`; run deduplication query `DELETE FROM acc_activities WHERE id NOT IN (SELECT MIN(id) FROM acc_activities GROUP BY external_id)`; re-sync will then upsert cleanly |
| `lastSignIn` all-null after sync | LOW | Verify `?fields=lastSignIn` is in the Construction Admin URL; add the field and re-sync; the field update is non-destructive — it only fills in nulls |
| b.-prefix wrong direction on a new endpoint | LOW | Error is always 401 or 404 with a clear resource-not-found message; trace to the endpoint, apply the correct helper, re-test |

---

## V1.0 Carry-Forward Assessment

### TD-006 (Slider Feel) and TD-007 (Canvas2D Vestigial)

**TD-006:** v2.0 does not touch the Cosmos.gl physics slider code path. Slider feel (separation range, organic-vs-cluster transition) is unaffected by adding new node types (folders) to the graph — the simulation parameters apply globally. TD-006 remains deferred unless the folder perf pre-flight reveals that physics parameter changes are needed to maintain 60fps with additional nodes.

**TD-007:** v2.0 does not require resolving Canvas2D branch removal. The folder node rendering path will be implemented via the existing Cosmos.gl `setPointPositions` / `setPointColors` typed-array API — the same GPU path used for user and project nodes. TD-007 cleanup (removing the Canvas2D dead code) should be bundled with a standalone cleanup phase rather than forced into v2.0 scope.

**Interaction risk:** If the Cosmos.gl folder node implementation requires modifying `CosmosGraphRenderer` deeply enough that it touches the `drawLabelOverlay` / `labelOverrideIndices` path (Phase 03-04 work), the developer must not accidentally reinstate the Canvas2D forward-projection dual-path scaffolding that was isolated in TD-007. The existing `GraphRenderer` interface boundary should be sufficient protection — implement folder nodes as data changes (`setPointPositions` calls), not renderer architecture changes.

### Widget Interactivity (feedback_widget_interactivity.md)

v2.0 adds new data to existing widgets and may introduce new visual treatments for folder-permission data. The user explicitly flagged Phase 04.1 as "not interactive enough" before approving. This feedback is directly binding for v2.0 widget additions:

- Any widget enrichment that adds folder-permission data (e.g., adding a permission-tier breakdown to the heatmap) must include hover detail panels showing the full permission actions array, not just the computed label.
- The "Admin Attribution" insight (who added which user, from activity log) surfaces in the RecentlyAdded widget as an enrichment — it must be clickable (opens side panel showing the admin's full activity, cross-selecting their node in the graph), not just a static "Added by: Bob" badge.
- The folder node toggle in the graph is itself a UX interaction — the reveal animation, the node color differentiation, and the click-to-show-permissions side panel behavior all need to be designed as first-class interactions, not afterthoughts.

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| b.-prefix contradiction (DM vs CA API) | Phase 1: Extraction Foundation | Unit test both helpers with b.-prefixed input; grep audit of all DM API call sites |
| Data Connector inline polling timeout | Phase 1 or Phase 2: Sync Engine | DataConnectorJob table present in schema; poll mutation returns job ID, not result |
| Folder nodes perf cliff | Dedicated perf-feasibility phase before folder-graph rendering | GO decision recorded in phase summary with FPS + GPU memory numbers |
| accMemberCache → new tables cutover | Phase 1: Schema Foundation | Deploy migration; dashboard loads from cache; first v2.0 sync populates new tables; cache not dropped |
| lastSignIn missing ?fields= | Phase 1: Extraction Foundation | Unit test CA user fetch function; verify fields= is hardcoded; post-sync null-check |
| Folder permission actions mapping | Folder permissions extraction phase | Exhaustive unit test covering all 6 documented action combinations |
| Activity log unbounded growth | Phase 1: Schema Foundation | Migration includes composite indexes; upsert on external_id; bounded first-sync |
| Recursive folder crawl quadratic calls | Folder crawl phase | pLimit applied; cache check implemented; permissions only for changed folders |
| CSV rows without normalization | Data Connector sync phase | action column is enum; user_id resolved to FK; empty strings coerced to NULL |
| Widget interactivity regression | Any phase adding/modifying widgets | Per feedback_widget_interactivity.md: hover detail + click-through + cross-selection verified in dev |
| TD-007 Canvas2D path accidentally reinstated | Folder graph rendering phase | Grep for Canvas2D dual-path scaffolding after implementing folder nodes |

---

## Sources

- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Activity_Logs.md` — Data Connector job pattern, signed S3 URL, no-auth-header note, poll loop example
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_All_Files_and_Folders.md` — b.-prefix note for DM API ("must retain the b. prefix"), recursive crawl pattern
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Folder_Role_Permissions.md` — actions array mapping, subjectType filter, three-API combination requirement
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Last_Sign_In.md` — Crucial Note: ?fields= required for Construction Admin; HQ v1 field name = last_sign_in vs CA camelCase lastSignIn
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Project_Members.md` — projectId WITHOUT b. for Construction Admin
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Recent_User_Additions.md` — activity log action string variants: "Member Added", "User Invited", "Project Member Added"
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Last_User_File_Activity.md` — action string variants: "File Uploaded", "Document Viewed", etc.
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_All_Roles.md` — HQ v2 industry_roles endpoint uses bare accountId (no b.)
- `C:\LECG\Dashboard\APS_DOCS\HOW TO\HOW_TO_Extract_Project_Info.md` — Construction Admin project list; accountId without b.
- `C:\LECG\Dashboard\.planning\research\v1.0\PITFALLS.md` — v1.0 pitfalls: b.-prefix (Pitfall 4), ACC sync concurrency (Pitfall 6), tRPC timeout risk (Pitfall 6)
- `C:\LECG\Dashboard\.planning\STATE.md` — accumulated context: lastSignIn alias caveat, TD-006/TD-007 open state, getAccountId pattern established, Phase 04-access-analysis field decisions
- `C:\LECG\Dashboard\.planning\PROJECT.md` — v2.0 locked decisions, HIGH RISK flag on folder-graph, all-time activity retention, manual sync only
- `C:\Users\luis.cortes\.claude\projects\C--LECG-Dashboard\memory\feedback_widget_interactivity.md` — interactivity requirement binding for all v2.0 widget additions

---
*Pitfalls research for: ACC Extraction Completion — v2.0 (folder crawl, Data Connector, permissions, graph folders, schema migration)*
*Researched: 2026-05-08*
