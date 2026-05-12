# Roadmap: LECG Dashboard

## Milestones

- ✅ **v1.0 ACC Users Graph + Access Analysis Dashboard** — Phases 1, 2, 2.5, 3, 4, 4.1 (shipped 2026-05-08) — see [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- 🚧 **v2.0 ACC Extraction Completion** — Phases 1–5 (defined 2026-05-11) — see [REQUIREMENTS.md](REQUIREMENTS.md)

## Phases

> v1.0 phases (1, 2, 2.5, 3, 4, 4.1) shipped 2026-05-08 and are archived in [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md). The list below is the **active** v2.0 plan.

### 🚧 v2.0 — ACC Extraction Completion (5 phases, 41 requirements)

**Thesis:** Rebuild the ACC extraction layer against documented APS endpoints, persist data in real Prisma tables, enrich existing UI surfaces. **No new tabs, pages, or views.**

Each requirement is referenced by its REQ-ID — see [REQUIREMENTS.md](REQUIREMENTS.md) for full definitions.

---

#### Phase 1: Foundation — Schema + Sync Orchestration

**Goal:** Establish the relational data layer and the **backend-only** sync orchestration model (Quick Sync as Railway release step, Deep Sync as Railway cron — no user-trigger UI buttons per CONTEXT.md scope amendment). Every downstream phase depends on this.

**Requirements:** SCHEMA-01, SCHEMA-02, SCHEMA-03, SYNC-01, SYNC-02, SYNC-03, SYNC-04 (7)

**Plans:** 4 plans
- [ ] 01-01-PLAN.md — Prisma schema: 8 ACC v2.0 models + SyncMeta, additive migration
- [ ] 01-02-PLAN.md — Extract getAccountId + add getProjectIdForDM with Vitest unit tests (SCHEMA-03)
- [ ] 01-03-PLAN.md — Sync orchestration backend: scripts/release.cjs + scripts/deep-sync.cjs + email alert + cron setup doc
- [ ] 01-04-PLAN.md — accSync tRPC router + Sidebar freshness pill (SYNC-03 status visibility)

**Success criteria:**
- All 8 new Prisma models (`AccProject`, `AccProjectMember`, `AccRole`, `AccProjectRole`, `AccFolder`, `AccFolderPermission`, `AccActivity`, `AccDataConnectorJob`) exist with documented composite indexes; migration applied on dev + Railway.
- Two distinct projectId helpers (`getAccountId` strips `b.`, `getProjectIdForDM` preserves `b.`) shipped with unit tests; existing callers audited.
- Quick Sync runs from the Railway deploy/pre-deploy command and writes persistent `SyncMeta` status (extraction code is a Phase 2 deliverable; this phase wires the shell).
- Deep Sync runs from Railway cron, submits a Data Connector job, persists `AccDataConnectorJob` row, and returns immediately with `jobId` in logs/status storage.
- Deep Sync status survives Railway container restart (UI polls Postgres, not memory).
- Double-submit prevention enforced server-side.

**Pre-flight risks:**
- Prisma migration on Railway must not lock writes long enough to break the live dashboard. Strategy: additive-only (no column drops, no renames in this phase).
- pg-boss vs raw `AccDataConnectorJob` polling: pre-decided in REQUIREMENTS Out-of-Scope (no BullMQ/Inngest, no Redis); raw Postgres job table only.

---

#### Phase 2: Core Extraction — Members, Projects, Roles

**Goal:** Make Quick Sync actually extract real data into the new tables. The data backbone for everything downstream.

**Requirements:** MEM-01..06 (6), PROJ-01..02 (2), ROLE-01..03 (3) = 11

**Plans:** 4 plans
- [ ] 02-01-PLAN.md — Project extraction + soft-delete (PROJ-01, PROJ-02)
- [ ] 02-02-PLAN.md — Hub master role extraction (ROLE-01)
- [ ] 02-03-PLAN.md — Per-project members + per-project roles + role linking at pLimit(5) (MEM-01..05, ROLE-02, ROLE-03)
- [ ] 02-04-PLAN.md — accMemberCache dual-write + release.cjs wiring (MEM-06)

**Success criteria:**
- Per-project members extracted via `/construction/admin/v1/projects/:id/users` with `?fields=` hardcoded so `lastSignIn` is always returned.
- Each member row carries `status`, `companyName`, `phone`, `addedOn`, full `products` array (per-module tier), `accessLevels.projectAdmin`, `accessLevels.executive`.
- Per-project role assignments populate `AccProjectRole` (many-to-many).
- Hub master roles and per-project industry roles both populate `AccRole` / `AccProjectRole`; default access levels persisted per role.
- All projects extracted with pagination; deleted projects in APS marked inactive (soft-delete).
- `accMemberCache` continues to be written via dual-write (MEM-06) — live v1.0 dashboard never breaks mid-deploy.

**Pre-flight risks:**
- `?fields=` parameter behavior unverified against current APS responses — plan-time research must confirm the field set survives.
- Dual-write performance: Quick Sync now hits both old cache + 4 new tables; benchmark before claiming "fast."

---

#### Phase 3: Activity Pipeline — Deep Sync + File Activity

**Goal:** Replace the placeholder Deep Sync wiring (Phase 1 shell) with the real Data Connector flow; surface last-file-activity and WHO-added-WHOM in existing UI.

**Requirements:** ACTV-01..05 (5)

**Plans:** 4 plans
- [x] 03-01-PLAN.md — Wave 0: deps install + Prisma migration (AccActivity v2 + UnresolvedAttribution)
- [x] 03-02-PLAN.md — Wave 1: streaming ingest pipeline + Stage-2 cron + accActivity tRPC router
- [x] 03-03-PLAN.md — Wave 2: user-list File Activity columns + DashboardSidePanel drill-down
- [x] 03-04-PLAN.md — Wave 2: RecentlyAddedWidget WHO-added-WHOM + SyncFreshnessPill amber/Partial

**Success criteria:**
- Data Connector ZIP downloaded via signed S3 URL with NO Authorization header (APS quirk per `HOW_TO_Extract_Activity_Logs.md`).
- Streaming unzip → streaming CSV parse → batch upsert of 500 rows via `createMany({ skipDuplicates: true })`. All-time retention, no prune.
- `project_activities.csv` and `admin_activities.csv` both ingested into `AccActivity`.
- Last file activity per user exposed via **lazy** tRPC query for side-panel drill-down (NOT eager-loaded into `BulkAccUser` or `FindingsContext`).
- RecentlyAdded widget surfaces inviting admin name via email-joined attribution from `Member Added` / `User Invited` / `Project Member Added` activity rows.
- Activity drill-down panel paginated by recency in existing `DashboardSidePanel`.

**Pre-flight risks:**
- 400MB+ ZIP exports must not OOM Railway container — `unzipper` + `csv-parse` streaming validated end-to-end on real export size.
- Email-based attribution fragile for users invited under one address, signed-in under another; unit test against real data after first Deep Sync.

---

#### Phase 4: Folders & Folder-Role Permissions (perf-gated)

**Goal:** Crawl folder trees + folder-role permissions, surface as a new dashboard widget. Graph-node integration is GATED behind a perf pre-flight whose result feeds Phase 5.

**Requirements:** FLDR-01..05 (5). Plus produces the GO/NO-GO artifact consumed by GRAPH-04 in Phase 5.

**Plans:** 4/7 plans executed
- [x] 04-01-PLAN.md — Wave 1 TDD: permissionMapping.ts + 6-tier unit tests + 3 edge cases (FLDR-03)
- [x] 04-02-PLAN.md — Wave 1: folderCrawl.ts BFS+pLimit library + dry-run script → CRAWL-ESTIMATE.md checkpoint (FLDR-01, FLDR-02) — **Luis-approved WEEKLY cadence + skip-archived-in-flight scope**
- [x] 04-03-PLAN.md — Wave 1: AccProject.folderCrawlStatus migration + accFolders tRPC scaffold (FLDR-01)
- [ ] 04-04-PLAN.md — Wave 2: extractAndPersistFolders wiring into Quick Sync + cron script per approved cadence (FLDR-01, FLDR-02)
- [ ] 04-05-PLAN.md — Wave 2: orphanDetection module + accFolders.getMatrix/getOrphanRoles procedures (FLDR-05)
- [ ] 04-06-PLAN.md — Wave 3: FolderPermissionsWidget (10th widget) + side-panel body + Recommendations orphan finding (FLDR-04, FLDR-05)
- [ ] 04-07-PLAN.md — Wave 3: perf pre-flight script + PERF-GATE.md GO/NO-GO artifact for Phase 5 GRAPH-04

**Success criteria:**
- Folder tree crawled per project via Data Management API with `b.` prefix preserved; `pLimit(5)` concurrency cap per project.
- Folders persist in `AccFolder` with full path, parent reference, folder URN as primary key.
- Folder-role permissions extracted via `/bim360/docs/v1/projects/:id/folders/:urn/permissions`, filtered to `subjectType === "ROLE"` at ingest, persisted in `AccFolderPermission`.
- Permission `actions` arrays map to 6 documented UI permission types (View Only, View+Download, Upload Only, View+Download+Upload, View+Download+Upload+Edit, Full Controller) with unit tests covering all combinations.
- Members-assigned-count per role-on-folder exposed (orphan role detection).
- 10th dashboard widget shipped: interactive folder × role matrix with hover detail, click-to-drill, cross-widget selection spotlighting (interactivity contract enforced).
- **Perf pre-flight artifact** produced: documented GO/NO-GO decision (FPS + GPU memory at projected node count) — result feeds Phase 5 GRAPH-04.

**Pre-flight risks:**
- Folder crawl on a 200+ project hub at `pLimit(5)` per project may take hours — must produce an estimate before committing to live Quick Sync wiring.
- 6-way permission action mapping has historical edge cases — REQUIREMENTS calls for full unit test coverage.

---

#### Phase 5: UI Enrichment Waves

**Goal:** Surface the new data through existing user-list, spatial graph, and dashboard widgets. **Leaf phase** — runs after data is in place.

**Requirements:** LIST-01..04 (4), GRAPH-01..04 (4), DASH-14..18 (5) = 13

**Success criteria:**
- **LIST wave:** `status` column + filter facet, `accessLevels.projectAdmin` indicator, last-file-activity lazy column, per-module products tier in side panel.
- **GRAPH wave:** per-project role filter dimension, hover detail enriched (status, companyName, accessLevels, last sign-in normalized, last file activity), admin overlay extended to 3 tiers (hub admin / project admin / executive), folder-node integration **conditional on Phase 4 GO** — if NO-GO, folders remain dashboard-only and contingency contract is logged.
- **DASH wave:** KpiStrip tiles for pending invites + project admins + folders crawled, Recommendations gains "stale invite" + "orphan role" findings, AdminConstellation 3-tier, RolesModulesHeatmap hub vs per-project distinction. **DASH-18 enforced as UAT gate:** every modified or new widget passes the interactivity contract (hover detail / click-through / cross-widget spotlight).

**Pre-flight risks:**
- 13 requirements is the largest single phase — may split into 5.1 / 5.2 / 5.3 waves during plan-phase if scope feels tight.
- Phase 4.1 feedback memory: interactivity contract must be baked in from task 1, not retrofitted.

---

### Phase Dependencies

```
Phase 1 (SCHEMA + SYNC)
   └─► Phase 2 (MEM + PROJ + ROLE)
          ├─► Phase 3 (ACTV)
          ├─► Phase 4 (FLDR + perf gate)
          └─► Phase 5 (LIST + GRAPH + DASH waves)
                  ↑
                  └── Phase 5 GRAPH-04 conditional on Phase 4 GO/NO-GO
```

Phases 3, 4, 5 can begin once Phase 2 lands. Phase 5's graph-node folder integration is the only inter-phase conditional.

## Progress

| Phase                                       | Milestone | Plans Complete | Status   | Completed  |
| ------------------------------------------- | --------- | -------------- | -------- | ---------- |
| 1. Foundation                               | v1.0      | 4/4            | Complete | 2026-04-28 |
| 2. Cosmos.gl Renderer                       | v1.0      | 6/6            | Complete | 2026-04-29 |
| 2.5. ACC Data + Filter Refinement           | v1.0      | 6/6            | Complete | 2026-05-06 |
| 3. Graph UI Completion                      | v1.0      | 5/5            | Complete | 2026-05-07 |
| 4. ACC Access Analysis Dashboard            | 2/7 | In Progress|  | 2026-05-08 |
| 4.1. Replace lists with interactive graphics | v1.0     | 4/4            | Complete | 2026-05-08 |
| 1. Foundation: Schema + Sync Orchestration  | v2.0      | 4/4            | Complete    | 2026-05-11 |
| 2. Core Extraction: Members, Projects, Roles | v2.0     | 0/4            | Plans drafted | —      |
| 3. Activity Pipeline                        | v2.0      | 0/4            | Plans drafted | —       |
| 4. Folders & Folder-Role Permissions        | v2.0      | 4/7            | In Progress | — |
| 5. UI Enrichment Waves                      | 1/3 | In Progress|  | — |

Plan counts (`?`) finalized at plan-phase time per phase. Estimated total: 18–24 plans across v2.0.

### Phase 6: 3D spherical graph with gravity at 120fps

**Goal:** Replace the 2D Cosmos.gl graph in the Users dashboard with a 3D volumetric sphere held together by per-cluster gravity wells, rendered at a 120fps frame-budget (≤8ms/frame) on Chrome + Safari + Firefox. r3f + drei + GPUComputationRenderer; GPU picking; deterministic-replay mode for Playwright; full removal of cosmos.gl + d3-force + patch-package.
**Requirements**: GRAPH3D-01..12 (derived from CONTEXT — no v2.0 REQ-IDs)
**Depends on:** Phase 5
**Plans:** 1/10 plans executed

Plans:
- [ ] 06-01-PLAN.md — Install r3f/drei/seedrandom + scaffold Sphere3DGraph + SphereCanvas + replay mode helper
- [ ] 06-02-PLAN.md — TDD pure math: radialEncoding + clusterAssignment (Vitest)
- [ ] 06-03-PLAN.md — Topology + filter adapters: GPU edge buffers + visibility hook
- [ ] 06-04-PLAN.md — GPGPU PhysicsCompute: GPUComputationRenderer + cluster-gravity + edge-spring + outward-drift shaders
- [ ] 06-05-PLAN.md — NodesPoints + EdgesLines render layer (single draw call each, alpha-attribute filter fade, aVisible streamed to physics)
- [ ] 06-06-PLAN.md — GPU picking: GpuPicker + PickPoints + pick shaders (PickApi onReady channel)
- [ ] 06-07-PLAN.md — Camera (OrbitControls + dolly-into-ball) + CameraTween + AutoRotate + Billboard LOD labels (REQUIRED, no fallback) + positionMirror
- [ ] 06-08-PLAN.md — Lift filter panel + URL persistence into sphere3d/filterUrl.ts + Sphere3DFilterPanel.tsx
- [ ] 06-09-PLAN.md — Compose final Sphere3DGraph + replayHarness + Playwright E2E (≥10 tests × 3 browsers, all un-skipped)
- [ ] 06-10-PLAN.md — Mount swap in UsersDirectoryClient + cosmos.gl/d3-force removal cascade + cross-browser UAT (checkpoint)

### Phase 7: User-only graph topology with folder access and attribute-similarity edges

**Goal:** Extend BOTH 2D AccUsersGraph and 3D Sphere3DGraph with: (1) folder hubs (depth-2 collapsed) + role↔folder edges colored by 4 permission tiers, (2) user↔user attribute-similarity edges across 5 parallel dimensions (folder-access, roles, projects, company, admin-tier), and (3) a "user-only" view-mode toggle. Reuses `accFoldersRouter.getMatrix` verbatim — no new tRPC, no Prisma migration. 3D folder hubs gated on Phase 4 GRAPH-04 GO; 3D wiring overall gated on Phase 6 sphere3d/* artifacts existing (Wave-0 gate in 07-01).
**Requirements**: GRAPH7-01..12 (derived from CONTEXT — Phase 7 has no roadmap-assigned REQ-IDs)
**Depends on:** Phase 6 (3D); Phase 4 GRAPH-04 perf-gate (3D folder hubs only)
**Plans:** 9/9 plans executed (07-07 + 07-08 deferred-complete per 3D-WIRING gate; 07-09 administrative close — PERF-REPORT.md shipped, manual UAT verdict pending)

Plans:
- [x] 07-01-PLAN.md — Wave 0 gate: probe Phase 6 sphere3d/* + Phase 4 GRAPH-04 GO/NO-GO → PHASE-DEPS.md
- [x] 07-02-PLAN.md — Wave 1 TDD: lib/acc/folderHubCollapse.ts (depth-N collapse with UNION semantics)
- [x] 07-03-PLAN.md — Wave 1 TDD: lib/acc/userSimilarity.ts (5-dimension parallel edges, bucketed indexing)
- [x] 07-04-PLAN.md — Wave 1 TDD: extend accGraphFilters.ts (showFolders/permTiers/simDims/simMin/viewMode + nodeMatchesFilters)
- [x] 07-05-PLAN.md — Wave 2: 2D topology adapter wiring (accGraphOrganicLayout + graphRenderers + cosmosUtils + tests)
- [x] 07-06-PLAN.md — Wave 3: 2D AccUsersGraph filter panel + URL persistence + per-edge color buffer (UAT/FPS deferred to 07-09)
- [x] 07-07-PLAN.md — Wave 3: 3D sphere3d adapters — DEFERRED per 3D-WIRING gate (stub SUMMARY only)
- [x] 07-08-PLAN.md — Wave 3: 3D filterUrl.ts + Sphere3DFilterPanel.tsx — DEFERRED per 3D-WIRING gate (stub SUMMARY only)
- [x] 07-09-PLAN.md — Wave 4: PERF-REPORT.md shipped (administrative close per Luis directive; live-FPS/visual UAT deferred to phase-end manual pass; DECISION: PHASE-7-ACCEPT=PENDING-MANUAL-UAT)

---

_v1.0 milestone shipped 2026-05-08. Detailed phase content archived in `.planning/milestones/`._
_v2.0 roadmap drafted 2026-05-11 from REQUIREMENTS.md (41 reqs)._

### Phase 07.1: Positional-only similarity redesign + filter UI reshape (INSERTED)

**Goal:** Convert the 5 user↔user similarity dimensions and 4 permission tiers from visible parallel edges/ribbons into positional clustering forces (similarity) and node-level visuals (tiers via pie-glyphs). Reshape filter UI: 'Topology' -> 'Clustering' with per-dim 0-1 strength sliders, 'User-only view' promoted to top-level toggle, tier swatches double as on-screen legend. 2D AccUsersGraph only; 3D Sphere3DGraph parity deferred to follow-up phase. Flip the gate flag at app/(dashboard)/users/AccUsersGraph.tsx:69 from false to true.
**Requirements**: GRAPH71-01..20 (derived from CONTEXT/RESEARCH — Phase 7.1 has no roadmap-assigned REQ-IDs)
**Depends on:** Phase 7
**Plans:** 6 plans

Plans:
- [ ] 07.1-01-PLAN.md — Wave 1 TDD: lib/acc/similarityForceModel.ts (pure force-link buffer composer) + Top-K perf spike -> TOPK-PERF.md
- [ ] 07.1-02-PLAN.md — Wave 1 TDD: lib/acc/userMaxPermTier.ts + lib/acc/pieGlyphRaster.ts (pure modules for node-level tier filter + pie-glyph LUT)
- [ ] 07.1-03-PLAN.md — Wave 1 TDD: extend accGraphFilters.ts (simStr + maxPermTier node-level filter)
- [ ] 07.1-04-PLAN.md — Wave 2: adapter + renderer two-channel rewire (accGraphOrganicLayout drops similarity links + emits forceLinks; CosmosGraphRenderer setForceLinkChannel/updateForceLinkStrengths; cosmosUtils buildLinkStrengthBuffer)
- [ ] 07.1-05-PLAN.md — Wave 3: AccUsersGraph UI reshape (Clustering section, promoted user-only toggle, pie-glyph wiring, simStr URL round-trip, hot-path strength update, flip line 69 gate)
- [ ] 07.1-06-PLAN.md — Wave 4: phase-end manual UAT checkpoint -> UAT.md DECISION line (Luis on Railway prod)
