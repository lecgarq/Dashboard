# Phase 8: DC per-module ingest + permission CSVs — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the legacy single-file Data Connector activity ingest with a pipeline that handles the real 2-year backfill schema (9 per-module `activities_<module>_activities.csv` files), ingest the 15+ admin/permission CSVs that DC ships alongside (entirely new data), generalize the promote script (no hardcoded request ID), and re-establish a daily ingest cadence on Windows Task Scheduler now that Railway is retired.

Out of scope for this phase: new dashboard widgets dedicated to non-Docs modules; CSV/API export surfaces; standalone desktop apps; ingest of `_changes.csv` audit-trail siblings or submittal-detail tables; email-alert features. See **Deferred Ideas** below.

</domain>

<decisions>
## Implementation Decisions

### Activity module scope

- **All 9 activity modules ingested**: Docs, Issues, Submittals, RFIs, Sheets, Admin, Cost, Assets, Bridge — every `activities_<module>_activities.csv` in DC output.
- **Module is recorded but not visually separated**: all module activity merges into existing widgets (File Activity, Recently Added, etc.). The `AccActivity.service` column is populated with the module name (`docs`, `issues`, `submittals`, etc.) — currently NULL for all rows.
- **Module badge on each row**: File Activity widget rows show a small module chip (`Docs`, `Issues`, `RFIs`, etc.) so users can scan by module. The widget label may need a tiny tweak from "File Activity" to "Activity" since it now spans non-file events.
- **Module-agnostic pipeline**: never skip a module at ingest time; dashboards decide what's surfaced.
- **Unknown future modules** (Autodesk adds a 10th): log loudly, skip those rows, surface in the runlog. No silent ingest into a generic bucket.
- **`_changes.csv` siblings and submittal detail tables are NOT in scope** — defer until a concrete dashboard surface needs them.
- **Dedup by event signature**: existing `@@unique([autodeskId, rawAction, createdAt, projectId])` constraint catches cross-module duplicates. Same event appearing in two CSVs results in one row.
- **Raw action verbs preserved per module**: no normalization. `view-entity`, `issue-created`, `budget-updated` stored as-is from APS.
- **All-time retention**: rows never deleted. Matches Phase 3 policy.
- **Filter out system actors at ingest**: known bot accounts (`Autodesk Cloud Worker`, `Construction Cloud Sync`, etc.) are dropped at the parse boundary. Maintain a known-bot list as a constant.
- **No special handling for sensitive events** (permission grants, project deletes) in this phase — uniform treatment. A "Notable Activity" surface, if needed, gets its own phase.
- **1-day overlap window** on each daily run: each run fetches yesterday + today's slice; dedup catches the overlap. Late-arriving events that arrive >24h after their event time are knowingly missed.

### Permission data destination

- **All 15+ admin/permission CSVs ingested**: `admin_users`, `admin_companies`, `admin_projects`, `admin_project_users`, `admin_project_user_roles`, `admin_project_user_products`, `admin_project_user_companies`, `admin_project_roles`, `admin_project_products`, `admin_project_companies`, `admin_roles`, `admin_business_units`, `admin_account_services`, `admin_project_services`, `admin_project_user_services`, `admin_accounts`. Including the tiny stub files (<100B each) — surprises us less when they fill up later.
- **New parallel tables** (`AccDc*` prefix): `AccDcUser`, `AccDcCompany`, `AccDcProject`, `AccDcProjectUser`, `AccDcProjectUserRole`, `AccDcProjectUserProduct`, `AccDcProjectUserCompany`, `AccDcProjectRole`, etc. Keeps DC-sourced data separate from live-API-sourced tables (`AccProjectMember`, `AccRole`) so each data path is debuggable.
- **Full replace per snapshot, transactionally**: each daily run wraps the per-CSV delete-all + insert-all in a transaction so the dashboard never sees an empty intermediate state. No upsert logic, no soft-delete, no append-only history.
- **DC wins on conflict** with live-API data: when `AccProjectMember` (Phase 2 live-API source) and `AccDcProjectUser` disagree, dashboard surfaces the DC value. DC is the comprehensive snapshot of record going forward.
- **Ingest orphans** (DC-only users/projects we haven't seen via live-API): land in `AccDc*` tables without FK constraints to existing `AccProjectMember`/`AccProject`. Dashboard decides whether to surface "DC-only" rows.
- **Companies become first-class entities**: `AccDcCompany` (id, name, hub_id) is a real entity. `AccDcProjectUserCompany` links users to companies. Existing free-text `AccProjectMember.companyName` stays populated by Phase 2 for backward compat; future cleanup phase can deprecate it.
- **Live immediately after ingest** — no staging/promote step. Pipeline writes; next dashboard query reads new data.
- **Permission data feeds existing Access Analysis** surfaces; no new widgets in this phase. The slow/limited live-admin API paths get replaced by AccDc* queries.

### Backfill depth + ongoing cadence

- **All-time depth, achieved progressively** — NOT a single 2-year burst. See "Progressive breadth-first backfill" in Specific Ideas below for the distinctive strategy.
- **Daily cadence** — one run per UTC day after initial backfill completes.
- **Windows Task Scheduler** on Luis's PC fires the scheduled task. No in-app cron, no GitHub Actions, no Railway. Local PC = single point of failure and that's accepted (see cron-health detection).
- **30-day slice per daily run**: each run fetches a 30-day window across ALL admin projects in parallel. Window extends backward day by day until each project reaches its creation date.
- **Floor = per-project creation date** (extracted from `admin_projects.csv`): never request data from before a project existed.
- **Accelerated backfill for newly-detected projects**: when `admin_projects.csv` reveals a project we haven't seen, the next few daily runs prioritize filling its history quickly rather than treating it like a long-tail project.
- **New admin projects auto-detected** each run via `admin_projects.csv`. Zero manual config when Luis's admin portfolio changes.
- **03:00 local Hermosillo time** (≈09:00 UTC) — PC idle, full UTC quota window available.
- **Quota fallback**: abort gracefully + resume next day. Save state (which slices completed) so tomorrow picks up where today stopped. No email noise, no retry-loops, no UTC-midnight pause-and-resume.
- **Run duration budget: ≤30 minutes**. If a run exceeds, investigate — likely a sign of pipeline drift or APS slowness.

### Legacy data + visibility

- **Wipe + re-ingest the 2,507 legacy rows**: delete all existing `AccActivity` rows, let the new per-module pipeline produce fresh data. They have NULL `service` field, no module info, and the progressive backfill covers their date window in days.
- **Extend the existing SyncFreshnessPill** in the Sidebar (Phase 3 surface) — no new pages, no new routes. Hover/click reveals: `DC ingest: backfill at month X of Y · next run in Zh · quota used N/25 today · access changes in last 24h: +A users, -B users`.
- **Pill state machine**:
  - 🟢 green: last successful run < 24h ago, no anomalies
  - 🟡 amber: last successful run 24h–36h ago, OR last run was partial/quarantined
  - 🔴 red: last successful run > 36h ago, OR Autodesk token expired
- **Token-failure recovery**: pill goes red on auth failure; clicking it launches the Autodesk OAuth flow in-app. Self-service re-auth; next scheduled run picks up the refreshed token.
- **DB log table** (`AccDcIngestRun` or extension of `SyncMeta`) records every run: `started_at`, `ended_at`, `projects_processed`, `rows_inserted_per_module`, `quota_used`, `status`, `error_message`, `slice_window_start`, `slice_window_end`. Queryable history. Console output for live debugging. **No emails.**
- **Diff summary per ingest**: each run computes "what changed vs last run" for permission data (+N users granted access, −M users revoked, etc.). Stored alongside the run row. Powers the SyncFreshnessPill's "+A / −B users" surface; lays groundwork for a future change-tracking surface without committing to one.

### Operations + recovery

- **Anomaly auto-quarantine**: post-ingest sanity checks (row-count delta vs previous run, missing CSV files, all-zero ingest) block the transactional commit. Pill goes amber. Next clean run auto-clears the quarantine.
- **Kill switch — flag file**: dropping `.dc-ingest.disabled` (or similar) at the project root causes the next run to exit immediately. Reversible by deletion. Layered with the second option (Windows Task Scheduler 'disable' via UI) for redundancy.
- **PII handling**: standard. Plain Postgres columns. Same posture as existing `AccProjectMember` storage. No encryption at rest, no pseudonymization. Acceptable because the DB lives on Luis's PC only.
- **Cron health detection**: the pill itself is the detector — 36h+ since last successful run flips it amber. No separate cron-failure email or watchdog.
- **RUNBOOK.md ships at phase end** in the phase directory. Covers: the main scripts, how to pause/resume, common errors and fixes, log locations, how to re-auth Autodesk. Markdown only, no screenshots.

### Claude's Discretion

The discussion did not leave many decisions in Claude's hands — Luis gave concrete answers on every gray area presented. Planner discretion remains on:

- Exact Prisma model column types (e.g. nullable vs not-null for product-tier fields)
- The known-bot list contents (planner researches APS docs to populate)
- The anomaly threshold values (e.g. "row count drop > X% triggers quarantine" — pick a defensible default; surface as config later if it churns)
- The Postgres transaction isolation level for full-replace (likely `SERIALIZABLE` but planner confirms)
- The exact file/route layout for the `AccDc*` Prisma models (e.g. one schema file or many)
- The auth-flow UX for "click pill to re-auth" (whether it opens in a new tab, modal, etc.)
- The persistence shape of the progressive-backfill state (DB column on `AccDcIngestRun` vs separate `AccDcBackfillProgress` table)

</decisions>

<specifics>
## Specific Ideas

### Progressive breadth-first backfill (Luis-originated, 2026-05-15)

> "Can we have a workaround to be more conservative with APS quota so that we extract all projects first but then we extract small bits but we're extracting data simultaneous of all projects, so then the data becomes full and productive when we're advancing."

**Translation:** instead of "burn the daily quota deep-backfilling a few projects" (and leaving other projects with zero data for days), each daily run is **shallow + wide**: a 30-day time-slice across ALL admin projects in parallel. The window slides backward day by day until each project has been backfilled to its creation date.

**Effect:**
- Dashboard becomes productive on day 1 (every project has the latest 30 days)
- Historical depth grows incrementally and visibly (each day adds another month of history across the whole hub)
- Quota burn is steady and predictable (~5 requests/day, well under the ~25 cap)
- "All-time" coverage is an emergent property of running daily, not a single huge upfront job
- Naturally combines with the "abort + resume" quota-fallback behavior — slices that don't complete just get picked up the next day

**This is the distinctive design of the phase.** Researcher and planner should investigate how to express the progressive-window state in DC submission payloads, where to persist "which slices for which projects have been completed," and how to compose the daily DC request batch.

### Reuse Phase 3 patterns

- SyncFreshnessPill (Phase 3 plan 03-04) is the visibility surface — extend it, don't replace it.
- `SyncMeta` table pattern works for persisting "last successful run" status — extend or parallel.
- The dual-write / additive-only ingestion principle from Phase 2 plan 02-04 carries over: never delete `AccDc*` rows on partial failures.

### Module badge UI touch

A small chip per File Activity row showing the module name (`Docs` / `Issues` / `Submittals` / etc.). Borderline scope-creep — kept in scope because it's the single thing that makes ingesting all 9 modules visible to a user. If implementation pressure mounts, this is the first scope cut.

</specifics>

<deferred>
## Deferred Ideas

The discussion surfaced several capabilities that are NOT in Phase 8 scope. Capturing here so they're not lost.

- **"Notable Activity" widget / sensitive-event tagging** — flag permission grants, project deletes, role removals for special UI treatment. Own phase.
- **Email alerts** on sensitive events, on quota miss, on auth failure, on anomaly quarantine, on cron-health misses. Own phase (or just a fast-follow once dashboard usage patterns are clearer).
- **"Permissions Overview" widget** — dedicated access-matrix surface. Own phase.
- **Dedicated DC Ingest status page** — beyond the SyncFreshnessPill. Standalone Electron/desktop variant. Own phase.
- **Dedicated module widgets** (Issues widget, Submittals widget, RFIs widget) — non-Docs modules currently merge into File Activity; dedicated surfaces are future phases.
- **`_changes.csv` audit-trail ingest** (cost, issues, RFIs) — adds field-level change history. Useful if a "who changed Issue X from Open→Closed" surface ever ships.
- **Submittal-detail tables** (the 14+ `submittals_target_*` and `submittals_object_*` files) — submittal workflow scaffolding. Likely own phase if Hermosillo's submittal usage ever becomes a dashboard focus.
- **Verb normalization** to a common vocabulary (`created`/`updated`/`viewed`/`deleted`) — could simplify cross-module summary UI. Trade-off vs. preserving raw APS verbs.
- **Append-only snapshot history** for permissions — answers "what was access on date X". Storage-heavy; defer until a real audit use case emerges.
- **Stage + manual promote / diff-threshold auto-promote** for permissions — extra guardrails on top of "live immediately." Add if "live immediately" causes a problem.
- **Pseudonymization / column encryption** for PII — single-operator local DB doesn't warrant it today.
- **CSV export button per widget** — ad-hoc data export to Excel/sharing. Own phase.
- **Read-only API endpoint** for external tool consumption — auth, rate limits, versioning. Own phase.
- **Multi-user / shared access to dashboard** — currently single-operator on Luis's PC. Beyond this phase's scope.
- **Configurable run schedule** — surfacing the 03:00-local schedule as an env var / settings. Add when the schedule needs to change.

</deferred>

---

*Phase: 08-dc-per-module-ingest-permission-csvs*
*Context gathered: 2026-05-15*
