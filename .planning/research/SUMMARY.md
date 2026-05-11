# Project Research Summary

**Project:** LECG Dashboard v2.0 ACC Extraction Completion
**Domain:** APS endpoint parity, real Prisma schema, existing UI enrichment (no new surfaces)
**Researched:** 2026-05-08
**Confidence:** HIGH

---

## Executive Summary

v2.0 is not a greenfield build. The existing dashboard already runs a GPU-accelerated 25k-node graph and a 9-widget Access Analysis dashboard against a JSON blob cache (`accMemberCache`). The milestone replaces that cache with seven real Prisma tables, achieves full extraction parity across 9 APS endpoint families, and surfaces every new field into the existing user list, graph, and dashboard without adding a single new tab, page, or view. The foundational design constraint: the 9 APS extractions divide into two mechanically distinct groups. Group A (7 extraction families) are synchronous REST calls that take minutes. Group B (Data Connector activity log) is an async job at APS that takes minutes to hours and delivers a ZIP of CSV files. These groups must be orchestrated differently via a "Quick Sync" REST path and a "Deep Sync" async job path. Any attempt to collapse them into a single inline server action will hit Railway's 300-second timeout on the first large-hub run.

The stack additions are deliberately minimal: `csv-parse@6` for streaming CSV ingest (not papaparse, which cannot pipe natively on Node), `unzipper@0.12.3` for streaming ZIP extraction (not jszip or adm-zip, both of which buffer entire files), and `pg-boss@12.18.2` for PostgreSQL-backed job persistence (not BullMQ/Redis or Inngest, which would add new infrastructure to a Railway deployment that already has Postgres). All 9 APS endpoint calls will use the existing raw `fetch` + retry pattern in `lib/server/acc-admin.ts`, extended in a new `lib/acc/acc-admin-v2.ts`. No new `@aps_sdk/*` packages are added since they duplicate the already-correct retry/auth layer and add Axios as a transitive dependency.

The three highest-probability failure modes in priority order: (1) the `b.`-prefix contradiction where the Data Management API requires the `b.` prefix on projectId while every other API family strips it, and mixing up the direction produces silent 401/404s that look like auth failures; (2) the Data Connector inline polling trap where the HOW_TO example shows a `while (!downloadUrl) { await sleep(60000) }` loop correct for a standalone script but guaranteeing a timeout inside a Next.js Route Handler; (3) folder nodes in the graph without a perf pre-flight where Cosmos.gl is validated at 25,559 nodes but production folder trees for a large hub could push the total to 35k-50k+, and discovering the FPS cliff after folder extraction, schema, and widget work are complete is an expensive rewrite. All three must be addressed in the first phase.

---

## Key Findings

### Recommended Stack

The validated base stack (Next.js 16, React 19, tRPC 11.17.0, Prisma 7.7.0, PostgreSQL, TypeScript 6, Tailwind 4, Cosmos.gl 3.0.0-beta.8, ECharts, framer-motion) is unchanged. v2.0 adds exactly three new production dependencies:

**Core technologies:**
- `csv-parse@6.2.1`: streaming CSV parser; implements Node `stream.Transform`; pipes directly from unzipper entry stream without buffering; zero dependencies; correct choice for multi-million-row activity CSVs
- `unzipper@0.12.3`: streaming ZIP extraction; `unzipper.Parse()` emits entry streams that pipe into csv-parse; O(batch) memory footprint; jszip and adm-zip both require full in-memory load and are excluded
- `pg-boss@12.18.2`: PostgreSQL-backed job queue; uses existing Railway Postgres via `DATABASE_URL`; no new infrastructure; TypeScript-native; handles `pending -> running -> success/failed` state machine for Data Connector jobs

**Explicitly excluded:**
- `@aps_sdk/construction-account-admin` or `@aps_sdk/data-management`: wrap Axios, duplicate existing retry/auth layer, return AxiosPromise types mismatched to existing AccUser/AccProject type system
- `@adsk-platform/acc-dataconnector`: non-official publisher; Data Connector flow is 3 HTTP calls handled by existing `fetchWithRetry` in ~40 lines
- `papaparse`: no native Node `stream.Transform` pipe interface; requires buffering the full file in memory
- BullMQ or Inngest: add Redis infrastructure or external SaaS for a job that runs manually at most once per day

**Prisma additions:** Seven new models (AccProject, AccProjectMember, AccRole, AccProjectRole, AccFolder, AccFolderPermission, AccActivity) plus AccSyncJob/AccDataConnectorJob for async job tracking. The existing AccMemberCache model stays and is NOT dropped until a post-v2.0 cleanup phase.

### Expected Features

**Must have (table stakes, P1):**
- Members matrix full extraction: `status`, `companyName`, `phone`, `products` (access tiers per module), `accessLevels.projectAdmin`, `addedOn` source-corrected to project endpoint
- Hub + per-project industry roles extraction via HQ v2 endpoints
- Project info extraction: `type`, `jobNumber`, `createdAt`
- Last sign-in enriched to project-level via Construction Admin `?fields=lastSignIn`
- `status` and `accessLevels.projectAdmin` in user list columns and filter facets
- Full `products` array (administrator/member/none per module) in side panel
- KpiStrip enriched: pending invite count + project admin count tiles
- Manual sync trigger with job-status UI (Quick Sync + Deep Sync, two distinct buttons)
- Data Connector async pipeline: POST to poll to ZIP download to streaming CSV parse to AccActivity upsert
- WHO-added attribution in RecentlyAdded widget drill-down (milestone lock-in requirement)
- Last file activity column and side-panel section derived from `project_activities.csv`

**Should have (differentiators, P2, conditional on folder perf GO decision):**
- Folder tree extraction + AccFolder table
- Folder-role permissions widget as 10th dashboard widget
- Folder nodes as 5th node type in Cosmos.gl graph, hidden by default
- Per-module access level filter facet extending FILT-03
- `status` filter facet; `accessLevels.projectAdmin` filter facet

**Defer (v2.x, P3):**
- AdminConstellation 3-tier enrichment (hub admin / project admin / executive rings)
- Hub vs project role color encoding in graph edges
- Activity log page or folder permissions page (explicitly prohibited, no new tabs/pages/views)
- Real-time sync or webhooks; permission editing from the dashboard

### Architecture Approach

The migration follows a seven-phase build order maintaining zero production downtime via dual writes and additive schema changes. Two new tRPC routers handle the sync surface: `server/routers/acc.ts` for all new sync mutations (avoiding bloating the existing 1,463-line `users.ts`) and extensions to existing procedures for read-path cutover.

**Major components:**
1. `lib/acc/acc-admin-v2.ts`: new raw fetch helpers for 5 new APS endpoint families; mirrors existing `acc-admin.ts` structure
2. `server/routers/acc.ts`: Quick Sync mutation (Group A REST pipeline with `pLimit(3)`), Deep Sync mutation (returns job ID immediately), `getDeepSyncStatus` query (polls AccDataConnectorJob + APS server-side), `ingestDeepSync` mutation (streams ZIP to CSV to AccActivity)
3. `lib/acc/graphSnapshotV2.ts`: replaces `graphSnapshot.ts`; signature changes to accept AccProjectMember[] + AccFolder[] + AccFolderPermission[]; import swap in `users.ts` at Phase E
4. `lib/acc/ingestActivities.ts`: streaming CSV parser with pause/resume backpressure; `createMany({ skipDuplicates: true })` in 500-row batches
5. `AccDataConnectorJob` Prisma table: single source of truth for async job state; survives Railway container restarts; client polls tRPC query, never APS directly

**Key patterns enforced throughout:**
- Tiered sync (Quick REST + Deep async) maps directly to the two extraction groups
- `AccDataConnectorJob` as persistent state machine, not in-memory state
- Streaming ZIP to streaming CSV to chunked createMany, no full-file buffering at any step
- Graph snapshot replacement via import swap at one call site, not a wrapper
- Activity rows lazy-loaded per drill-down selection, NOT embedded in BulkAccUser or FindingsContext

### Critical Pitfalls

1. **`b.`-prefix contradiction**: Data Management API requires `b.` on projectId; Construction Admin requires it stripped. Fix: two distinct helpers, `getAccountId(db)` strips `b.` for CA/HQ endpoints, `getProjectIdForDM(rawProjectId)` keeps `b.` intact for DM API. Unit-test both. Establish before any extraction function is written.

2. **Data Connector inline polling timeout**: The HOW_TO `while (!downloadUrl) { await sleep(60000) }` loop hits Railway's 300-second limit inside a tRPC mutation. Fix: mutation submits job and returns `jobId` immediately; `AccDataConnectorJob` row persists state; client polls `getDeepSyncStatus` every 5-30 seconds; download+parse in a separate `ingestDeepSync` step. Lock against double-submit.

3. **Folders in graph: perf pre-flight is a GO/NO-GO gate**: Cosmos.gl verified at 25,559 nodes; 35k-50k+ is unverified. Fix: dedicated perf-feasibility phase before any folder-graph rendering code. Must produce documented FPS + GPU memory result. No folder-graph rendering ships without a recorded GO decision.

4. **`accMemberCache` to Prisma: additive migration window, not big-bang**: New tables added empty; Quick Sync writes to BOTH old and new tables during transition; read paths switch independently after first v2.0 sync verified in production. Two call sites at switchover: `graphSnapshot.ts` (Phase E) and `bulkAccSummary` in `users.ts` (Phase F). Old model not dropped until Phase 7.

5. **`lastSignIn` requires explicit `?fields=` parameter**: Construction Admin endpoint omits `lastSignIn` unless `?fields=` is in the URL. Absent (not null) coalesces silently to null via `??`. Fix: hardcode `?fields=name,email,lastSignIn` as a non-optional constant; reject writes where `lastSignIn` is `undefined`.

---

## Implications for Roadmap

Based on combined research, suggested phase structure:

### Phase 1: Foundation (Schema + Helpers + b.-prefix convention)
**Rationale:** Every downstream phase depends on correct schema and the two-helper naming convention. The `AccDataConnectorJob` table design must be locked before Phase 3. Composite indexes on `AccActivity` must be in the initial migration or they cannot be added cheaply later.
**Delivers:** Seven new Prisma models (empty, migration applied); `getAccountId` + `getProjectIdForDM` helpers with unit tests; `acc-admin-v2.ts` skeleton; `AccDataConnectorJob` state machine defined; composite indexes on `AccActivity`: (autodeskId, created_at DESC), (project_id, created_at DESC), (action)
**Avoids:** b.-prefix confusion (Pitfall 1), inline polling trap (Pitfall 2), big-bang schema migration (Pitfall 4), activity table without indexes (Pitfall 7)

### Phase 2: Quick Sync Pipeline (REST Group A: members, projects, roles)
**Rationale:** Members matrix is the dependency anchor for nearly every P1 feature. Dual writes keep the existing dashboard running unaffected during the entire migration window.
**Delivers:** `acc.ts` tRPC router with `quickSync` mutation; `fetchAllAccProjects`, `fetchProjectMembersMatrix` (with `?fields=lastSignIn` hardcoded), `fetchProjectRoles` helpers; dual writes to AccProjectMember + accMemberCache; `status`, `companyName`, `products`, `accessLevels.projectAdmin`, `addedOn` persisted in new tables; Quick Sync button in `AccAnalysisPanel.tsx`
**Avoids:** `lastSignIn` absent `?fields=` (Pitfall 5); per-project roles before hub roles (dependency order violation)

### Phase 3: Data Connector Deep Sync (Group B: activity log async pipeline)
**Rationale:** WHO-added attribution and last-file-activity are P1 milestone requirements. Both depend on this pipeline. Must be built with the job-table pattern before any activity-data features are built on top.
**Delivers:** `startDeepSync` + `getDeepSyncStatus` + `ingestDeepSync` in `acc.ts`; `extractDataConnectorZip.ts` streaming pipeline; `ingestActivities.ts` with pause/resume backpressure + `skipDuplicates`; Deep Sync button + four-state job-status indicator in `AccAnalysisPanel.tsx`; double-submit lock
**Uses:** pg-boss@12.18.2, unzipper@0.12.3, csv-parse@6.2.1
**Avoids:** Inline polling timeout (Pitfall 2), CSV without normalization (Pitfall 9), activity duplicate rows (Pitfall 7), signed S3 URL with auth header

### Phase 4: Folder Perf Pre-Flight (GO/NO-GO gate, zero rendering code)
**Rationale:** Folder nodes are HIGH RISK per PROJECT.md. This phase produces a binary GO/NO-GO decision with documented numbers. No folder-graph rendering code is written until this decision is recorded in the phase summary.
**Delivers:** Folder crawl count for production hub across all projects; projected total node count (existing 25,559 + folder count); Cosmos.gl synthetic test at projected node count with measured FPS + GPU memory; GO/NO-GO recorded; contingency plan if NO-GO (project-filter-scoped folder display only)
**Avoids:** Perf cliff discovery after integration work is complete (Pitfall 3)

### Phase 5: Folder Extraction + Permissions (conditional on Phase 4 GO)
**Rationale:** Only executes if Phase 4 records a GO decision. Folder tree and folder-role permissions built together since permissions reference folder URNs and role IDs that must already exist.
**Delivers:** `fetchFolderTree` (BFS with `pLimit(5)`, DM API with `b.` prefix retained) + `fetchFolderPermissions` (incremental: skip unchanged folders, `pLimit(3)`); AccFolder + AccFolderPermission populated; actions-to-permType mapping unit-tested against all 6 documented combinations; `subjectType === "ROLE"` filter applied at ingest
**Avoids:** Quadratic folder crawl (Pitfall 8), wrong actions-to-permType mapping (Pitfall 6), b.-prefix reversed for DM calls (Pitfall 1)

### Phase 6: Graph + Dashboard Read-Path Cutover
**Rationale:** New tables are populated from Phases 2-5. This phase switches both read call sites from accMemberCache to the relational tables and completes the full P1 feature set.
**Delivers:** `graphSnapshotV2.ts` reading from AccProjectMember + AccFolder + AccFolderPermission; import swap in `users.ts`; folder nodes hidden by default with toggle in filter panel; `bulkAccSummary` rewritten to assemble BulkAccUser from relational tables; BulkAccProject extended with `productAccess?` + `folderPermissions?`; DashboardSidePanel activity drill-down (paginated `getActivityForUser` lazy query); WHO-added attribution in RecentlyAdded widget; last-file-activity column; KpiStrip enriched; all new/enriched widgets pass interactivity check (hover detail, click-through, cross-selection)
**Avoids:** Activity rows in FindingsContext (Anti-Pattern 2), widget interactivity regression (UX Pitfall 5), big-bang cutover (Pitfall 4)

### Phase 7: Cleanup (v2.1 candidate)
**Rationale:** Only after Phase 6 is confirmed stable in production.
**Delivers:** `accMemberCache` write path removed from Quick Sync; AccHubRoleCache singleton write path removed; old JSON-read helpers in `bulkAccSummary` deleted; TD-007 Canvas2D vestigial branch removal bundled

### Phase Ordering Rationale

- Schema and helpers must precede all extraction (Phase 1 first; dependency failure cascade otherwise)
- Members matrix (Phase 2) before activity log (Phase 3) because `users.csv` from Data Connector resolves `user_id` to email via AccProjectMember rows that must already exist for the join to work
- Folder perf pre-flight (Phase 4) immediately after extraction data is available but before any rendering code; it is a gate, not a deliverable
- Read-path cutover (Phase 6) last because all tables must be populated and validated first; dual-write window ensures zero downtime during cutover
- Cleanup (Phase 7) post-v2.0 so it does not risk the milestone timeline

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Folder Perf Pre-Flight):** Cosmos.gl behavior at 35k-50k nodes is unverified; requires a live synthetic test against the production hub's actual folder count; outcome determines whether Phase 5/6 folder work proceeds at all
- **Phase 5 (Folder Extraction):** Folder crawl concurrency limits and incremental sync strategy need calibration against the real hub; `pLimit(5)` value may need adjustment based on Phase 4 folder count findings

Phases with standard patterns (skip research-phase):
- **Phase 1 (Schema):** All 7 models fully designed in ARCHITECTURE.md; Prisma migration patterns are well-documented
- **Phase 2 (Quick Sync REST):** APS endpoint shapes fully documented in HOW_TO files; existing `acc-admin.ts` is the blueprint
- **Phase 3 (Data Connector):** pg-boss + unzipper + csv-parse integration pattern is clear from STACK.md; HOW_TO docs cover the 3-call API flow
- **Phase 6 (Cutover):** All cutover call sites are identified (2 files); additive type extension pattern is specified in ARCHITECTURE.md

---

## Watch-Out-For (Cross-Cutting)

These apply throughout all phases, not mapped to a single one:

- **`lastSignIn` field name differs by API family.** HQ v1 returns `last_sign_in` (snake_case, returned by default). Construction Admin v1 returns `lastSignIn` (camelCase, only if `?fields=lastSignIn` is in the URL). Absent is not the same as null. Treat absent as a bug, not a valid value.

- **All-time `AccActivity` retention requires composite indexes from day one.** Required in the initial migration: `(autodeskId, created_at DESC)` for per-user timeline queries; `(project_id, created_at DESC)` for per-project activity feed; `(action)` for filtering "Member Added" / "File Uploaded". Without these the first large-hub sync produces an unqueryable table.

- **Widget interactivity is a hard requirement, not polish.** Per `feedback_widget_interactivity.md`: every new or enriched widget must have hover detail panels, click-through to side panel, and cross-widget selection spotlighting. Static graphics are an explicit regression. The UAT gate for any widget phase is: does it meet the interactivity contract? Non-negotiable.

- **Signed S3 download URL must not carry an Authorization header.** The Data Connector `downloadUrl` is a pre-signed S3 URL; the signature is in the query string. Sending an auth header causes a 400 SignatureDoesNotMatch error. Use plain `fetch(downloadUrl)` with no custom headers.

- **`accMemberCache` must remain readable throughout all of v2.0.** Deploy, migrate, sync, verify in that order. Never drop the model until Phase 7.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All three new packages verified live via npm; APS SDK decision grounded in local codebase inspection of dist/api/; alternatives confirmed inadequate via direct inspection or benchmark |
| Features | HIGH | All 9 HOW_TO extraction docs are user-scraped APS ground truth; feature placement based on direct component reading; dependency tree verified against actual call sites |
| Architecture | HIGH | Derived entirely from reading actual codebase (1,463-line users.ts, prisma/schema.prisma, all context files) + 9 HOW_TO docs; no assumptions from training data |
| Pitfalls | HIGH | Top 3 pitfalls grounded in HOW_TO docs (b.-prefix note verbatim, ?fields= note verbatim), v1.0 PITFALLS.md carry-forward, STATE.md accumulated context; Cosmos.gl perf risk from empirical 25k validation + unknown territory above |

**Overall confidence: HIGH**

### Gaps to Address

- **Actual folder count for production hub:** Unknown until Phase 4 executes the crawl against real APS data. If it exceeds approximately 8,000 folder nodes, the graph integration strategy shifts to project-filter-gated folder display only.

- **`AccActivity` deduplication key:** ARCHITECTURE.md proposes `@@unique([userId, action, occurredAt])`; PITFALLS.md notes the Data Connector CSV may have a native `external_id` per row that is a more reliable dedup key. Validate the CSV schema during Phase 3 and prefer `external_id` if present.

- **pg-boss worker initialization on Railway:** If initialized via an API route (cold-start on first request), there is a brief window post-deploy where queued jobs are not processed. A standalone `scripts/worker.ts` launched as a separate Railway service avoids this. Decide before Phase 3.

- **Construction Admin `?fields=` completeness:** Verify whether `addedOn`, `companyName`, `status`, `phone`, and `products` are also opt-in via `?fields=` or always returned. If opt-in, all required fields must be included in the hardcoded param.

---

## Sources

### Primary (HIGH confidence)
- `APS_DOCS/HOW TO/` (all 9 files, user-scraped): ground truth for every extraction endpoint, field name, b.-prefix note, ?fields= requirement, Data Connector job flow, actions array mapping
- `lib/server/acc-admin.ts`: authoritative existing fetch pattern; retry logic; type system
- `prisma/schema.prisma`, `lib/acc/acc-types.ts`, `server/routers/users.ts`: existing schema, type interfaces, and router structure read directly
- `app/(dashboard)/users/dashboard/` component files: widget structure, FindingsContext, SelectionContext, DashboardSidePanel
- `package.json`: installed dependency list confirming existing stack

### Secondary (MEDIUM confidence)
- npm info pg-boss, npm info csv-parse, npm info unzipper: live npm registry lookups
- /tmp/aps_test local install of @aps_sdk/construction-account-admin: direct inspection confirming which APIs are present and which are absent
- `.planning/research/v1.0/PITFALLS.md` and `.planning/STATE.md`: accumulated project context; v1.0 carry-forward assessment
- `.planning/PROJECT.md`: v2.0 milestone definition, locked decisions, out-of-scope list
- `memory/feedback_widget_interactivity.md`: interactivity requirement binding for all v2.0 widget work

### Tertiary (MEDIUM confidence)
- APS Rate Limits blog: 429 + Retry-After pattern; specific rate limits not published by Autodesk
- csv-parse vs papaparse benchmark (leanylabs.com): memory model comparison confirming streaming approach
- pg-boss Railway guide (docs.railway.com): PostgreSQL-backed queue pattern on Railway

---
*Research completed: 2026-05-08*
*Ready for roadmap: yes*
