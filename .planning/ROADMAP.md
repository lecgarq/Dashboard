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
- Quick Sync button triggers REST extractions synchronously with progress feedback (extraction code is a Phase 2 deliverable — this phase wires the shell).
- Deep Sync button submits a Data Connector job, persists `AccDataConnectorJob` row, returns immediately with `jobId`.
- Deep Sync status survives Railway container restart (UI polls Postgres, not memory).
- Double-submit prevention enforced server-side.

**Pre-flight risks:**
- Prisma migration on Railway must not lock writes long enough to break the live dashboard. Strategy: additive-only (no column drops, no renames in this phase).
- pg-boss vs raw `AccDataConnectorJob` polling: pre-decided in REQUIREMENTS Out-of-Scope (no BullMQ/Inngest, no Redis); raw Postgres job table only.

---

#### Phase 2: Core Extraction — Members, Projects, Roles

**Goal:** Make Quick Sync actually extract real data into the new tables. The data backbone for everything downstream.

**Requirements:** MEM-01..06 (6), PROJ-01..02 (2), ROLE-01..03 (3) = 11

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
| 4. ACC Access Analysis Dashboard            | v1.0      | 8/8            | Complete | 2026-05-08 |
| 4.1. Replace lists with interactive graphics | v1.0     | 4/4            | Complete | 2026-05-08 |
| 1. Foundation: Schema + Sync Orchestration  | v2.0      | 0/4            | Planned     | —       |
| 2. Core Extraction: Members, Projects, Roles | v2.0     | 0/?            | Not started | —       |
| 3. Activity Pipeline                        | v2.0      | 0/?            | Not started | —       |
| 4. Folders & Folder-Role Permissions        | v2.0      | 0/?            | Blocked on Phase 1+2 | — |
| 5. UI Enrichment Waves                      | v2.0      | 0/?            | Blocked on Phase 2  | — |

Plan counts (`?`) finalized at plan-phase time per phase. Estimated total: 18–24 plans across v2.0.

---

_v1.0 milestone shipped 2026-05-08. Detailed phase content archived in `.planning/milestones/`._
_v2.0 roadmap drafted 2026-05-11 from REQUIREMENTS.md (41 reqs)._
