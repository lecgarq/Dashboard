# Phase 1: Foundation — Schema + Sync Orchestration - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the v2.0 relational data layer (8 new Prisma models) and the sync orchestration shell. Sync runs **server-side only** — there are no user-triggered UI buttons. Quick Sync runs as a Railway release step on every deploy; Deep Sync runs as a nightly Railway cron. Actual extraction logic (members, projects, roles, activity rows) is **Phase 2 / Phase 3** — Phase 1 wires the orchestration, scheduling, persistence, alerting, and freshness-indicator surfaces only.

</domain>

<decisions>
## Implementation Decisions

> **Major scope amendment vs REQUIREMENTS.md:** SYNC-01..04 are currently worded as user-triggered UI flows ("User can trigger…", "UI polls…"). Per this discussion, the implementation is **backend-only** — no Quick Sync / Deep Sync buttons, no in-app trigger surfaces. Requirements text should be amended at plan-phase time (or noted as a documented deviation) to read as scheduled/release-hook backend jobs.

### Sync triggering model
- **No UI trigger buttons.** No Quick Sync or Deep Sync buttons appear in the dashboard. All syncs are server-side.
- **Quick Sync** runs as a Railway **release step** on every deploy, after `prisma migrate deploy`, before the new container serves traffic.
- **Deep Sync** runs as a **Railway cron** daily at **02:00 Hermosillo time (UTC-7) = 09:00 UTC**.
- Manual on-demand sync (e.g. from local laptop) is **not** part of Phase 1 — sync is fully driven by deploy + cron.

### Quick Sync (release step) behavior
- **Hard timeout: 5 minutes.** If Quick Sync overruns, the deploy fails (release command exits non-zero). This protects ability to ship hotfixes.
- On failure, the deploy is failed (old container keeps serving) and an alert email fires.
- Quick Sync execution writes its outcome to `SyncMeta` (see audit storage below) so the dashboard footer can show freshness even when sync fails.

### Deep Sync (cron) behavior
- States: **`pending` → `running` → (`success` | `failed`)**. No `cancelled` or `timeout` state in v2.0.
  - `pending` = submitted to APS Data Connector, awaiting their processing.
  - `running` = ZIP downloaded, importing to Postgres on our side.
- **Overlap handling:** if cron fires while a previous job is still `pending` or `running`, **skip** the new run and log `"skipped — previous still in-flight"`. Enforced via DB check on `AccDataConnectorJob` for non-terminal rows.
- **No auto-retry.** Failed jobs wait for the next nightly cron. No exponential backoff.

### Audit & freshness storage
- **`AccDataConnectorJob`** — full row per Deep Sync run, **retained forever** (audit trail). Storage cost is negligible.
- **`SyncMeta`** — single-row-per-sync-type key-value table holding `last_run_at`, `last_status`, `last_error` for Quick Sync (and any other future sync type). Powers the dashboard footer indicator. Lightweight; no per-run history for Quick Sync in v2.0.

### Failure alerting
- **Email** sent to `luis.ecorteg@gmail.com` on any sync failure (Quick or Deep).
- Email contains: sync type, timestamp, last error, jobId (Deep only).
- Email-only for v2.0 — no Sentry, no in-app banner. Planner picks a simple SMTP path (Resend / Postmark / nodemailer) at plan time.

### Dashboard freshness indicator
- **Small "Last synced: 2h ago" text** in the dashboard footer (or equivalent unobtrusive location — planner decides exact placement).
- Reads from `SyncMeta` for Quick Sync timestamp; reads latest `AccDataConnectorJob.completedAt` for Deep Sync.
- No drill-down `/sync-status` page in this phase. No status banner on failures (alerting is email-only per above).

### Migration rollout
- **Auto-apply on deploy.** Railway release command runs `prisma migrate deploy` first, then Quick Sync, then serves traffic.
- **Additive-only is sufficient** — no feature flag, no back-compat shim, no dual-write scaffolding in P1. The v1.0 dashboard continues reading only the old `accMemberCache` shape until Phase 2 wires real extraction with dual-write.
- **No DB snapshot before migrate** — additive migrations are safe.
- **Pure DDL, no seed data.** All data (including permission types) comes from sync. No lookup-table seeding in this phase.
- **Rollback policy:** if migration succeeds but Quick Sync fails in the same deploy, the **migration stays** (schema is additive and harmless), the deploy is failed, the old container keeps serving, and an alert email fires. Schema and initial data load are independent concerns.

### Claude's Discretion
- Exact tRPC routing / file layout for the freshness indicator query.
- Email sending mechanism (Resend vs Postmark vs nodemailer via Gmail SMTP — pick cheapest/simplest given Railway env).
- Exact wording of failure email subject/body.
- Footer placement and styling for "Last synced: …" indicator (must fit existing dashboard chrome; planner inspects layout).
- Schedule expression syntax (Railway cron format).
- Helper function file locations for `getAccountId` / `getProjectIdForDM` (REQUIREMENTS already locks behavior; placement is implementation detail).
- Unit-test scaffolding choices (Vitest / Jest — match what's already in the repo).

</decisions>

<specifics>
## Specific Ideas

- **"Always have the latest info before push."** Driving intent for the deploy-hook Quick Sync. Data should be fresh as of the moment the new container starts serving.
- **Hermosillo timezone for cron** — explicitly UTC-7. 02:00 local = 09:00 UTC.
- **Two-cadence model is intentional:** Quick Sync per-deploy (minutes, REST endpoints) + Deep Sync nightly (hours, APS Data Connector). They are not interchangeable.
- **Dashboard must never go down because sync failed.** Old data > no data. Hard rule from "fail loudly: alert + keep old data."

</specifics>

<deferred>
## Deferred Ideas

- **Manual one-shot Deep Sync via Railway CLI** — useful before stakeholder demos. Not in v2.0 P1; can be added as a small follow-on task or in a future milestone.
- **Dedicated `/sync-status` history page** — currently footer-only. If freshness questions become common, this is the upgrade path.
- **Sentry / structured error tracking** — email alerts are enough for v2.0. Sentry can come later if dashboard error rate grows.
- **In-app failure banner** — email-only for now. If failures are missed, surface them in the dashboard.
- **Auto-retry with backoff** — deferred; nightly cadence is fast enough that next-day retry is acceptable.
- **REQUIREMENTS.md wording update** — SYNC-01..04 currently describe UI flows. Should be amended (either at plan-phase time, or in a separate doc-only commit) to reflect the backend-only model decided here. Captured here so the next planner sees the divergence explicitly.

</deferred>

---

*Phase: 01-foundation-schema-sync*
*Context gathered: 2026-05-11*
