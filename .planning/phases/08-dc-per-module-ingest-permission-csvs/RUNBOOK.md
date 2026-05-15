# Phase 8 — DC Daily Ingest Runbook

Operational reference for the APS Data Connector (DC) daily ingest pipeline. Audience: Luis. Read top-to-bottom the first time; bookmark sections 5-8 for day-to-day.

---

## Required Environment Variables

All four variables below are **required**. If any are missing, the orchestrator writes an `AccDcIngestRun` row with `status='failed'` and `errorMessage='Missing required env var(s) for discovery: ...'`, and the `SyncFreshnessPill` turns amber/red within 36 hours.

| Variable | Value | Purpose |
|----------|-------|---------|
| `LUIS_ACC_USER_ID` | `e3657018-3f2f-4fd2-9d22-8d92f19c3324` | APS user UUID for Luis. Used by cold-start project discovery to call `/accounts/{id}/users/{userId}/projects` |
| `APS_HUB_ID` (or `ACC_ACCOUNT_ID`) | Your APS account/hub UUID | Hub identifier for the Admin v1 discovery endpoint |
| `APS_CLIENT_ID` | Your app's client ID | Used for the 2-leg `client_credentials` token that powers discovery (distinct from the 3-leg user token used for DC submission) |
| `APS_CLIENT_SECRET` | Your app's client secret | Used with `APS_CLIENT_ID` to fetch the 2-leg discovery token |

**Failure mode:** Missing any of the above → `AccDcIngestRun` row written with `status='failed'` and `errorMessage='Missing required env var(s) for discovery: <list of missing vars>'`. The `SyncFreshnessPill` escalates to amber/red within ~36 hours (two missed runs). Fix by adding the missing variable to your `.env` / Task Scheduler environment and re-running.

### Cold-start behaviour

On the first run when `AccDcBackfillProgress` is empty (e.g. after a fresh DB provisioning), the orchestrator queries APS Admin v1 for all projects where the configured user (`LUIS_ACC_USER_ID`) is Project Admin.

**Important:** The server-side `filter[accessLevel]=projectAdmin` query parameter is misleading — it returns projects where the user has `projectAdmin` OR `projectMember` access. The pipeline filters **locally** on `accessLevels.projectAdmin === true` to ensure only genuinely admin projects are seeded.

After local filtering, the orchestrator upserts each newly-discovered project into `AccDcBackfillProgress` with `newProjectFlag=true`, which gives them priority scheduling via `planDailySlice` (DC8-13). The same run then immediately proceeds to plan and execute the daily slice — so the first run after cold-start produces real activity data, not a silent 0-slice success.

Subsequent runs perform the same discovery step to detect newly-added admin projects (DC8-13 incremental discovery). Since the discovery call is only 1-2 HTTP requests, this overhead is negligible compared to the DC submission + polling flow.

---

## 1. What this pipeline does

Every night the dashboard pulls fresh permission and activity data from Autodesk Construction Cloud (ACC) using the **APS Data Connector (DC) API**. DC is the only Autodesk endpoint that exposes the granular CSV exports we need (project members, role assignments, folder permissions, file activity per module).

The job runs in **breadth-first progressive backfill** mode: each invocation walks one 30-day slice for every project that still has un-backfilled history, plus the previous-day delta for already-current projects. Over time every project marches backwards from "today" toward its creation date until fully backfilled, then continues with daily deltas only.

Output lands in two table families:
- **`AccDc*` admin tables** (16 CSVs) — project membership, role bindings, folder-permission rows, account-level user records.
- **`AccActivity` (service-tagged)** — 9 activity CSVs (Docs, Issues, Reviews, Submittals, RFI, Markups, Files, Sheets, BIM) merged into one table, each row tagged with its source `service` so the UI can render module badge chips.

## 2. Where it runs

- **Host:** Luis's PC (`C:\LECG\Dashboard`).
- **Scheduler:** Windows Task Scheduler — task name `LECG-DC-Daily-Ingest`.
- **Cadence:** Daily, 03:00 local Hermosillo time.
- **Not Railway.** Railway trial expired 2026-05-13; the dashboard now runs on Luis's PC via Task Scheduler.
- **Not in-process cron.** Next.js server has no background scheduler; the OS scheduler invokes the Node script directly.

## 3. Files involved

| File | Role |
|------|------|
| `scripts/dc-daily-cron.ps1` | PowerShell harness — reads kill-switch, sets 30-min timeout, writes daily log file |
| `scripts/dc-daily-ingest.cjs` | Node entry point — invokes `dcIngest()` once |
| `lib/acc/dcIngest.ts` | Orchestrator — owns the AccDcIngestRun row lifecycle |
| `lib/acc/dcAdminCsvIngest.ts` | Loads 16 admin CSVs into `AccDc*` tables |
| `lib/acc/dcActivityCsvIngest.ts` | Loads 9 activity CSVs into `AccActivity` (service-tagged) |
| `lib/acc/dcAnomalyChecks.ts` | Threshold-based quarantine before commit |
| `lib/acc/dcBackfillScheduler.ts` | Picks the next 30-day slice per project |
| `scripts/wipe-legacy-acc-activity.cjs` | One-time wipe of pre-Phase-8 untagged AccActivity rows |

## 4. How to install the scheduled task

One-time setup. Run from an **elevated PowerShell** prompt (right-click PowerShell → *Run as Administrator*):

```powershell
# Run from elevated PowerShell prompt (Right-click PowerShell -> Run as Administrator)
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\LECG\Dashboard\scripts\dc-daily-cron.ps1"'
$trigger  = New-ScheduledTaskTrigger -Daily -At '3:00am'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest' `
  -Action $action -Trigger $trigger -Settings $settings `
  -RunLevel Highest -Description 'Phase 8 daily APS Data Connector ingest'
```

Verify it registered:

```powershell
Get-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
```

Trigger a manual run (good for the first-time validation):

```powershell
Start-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
```

## 5. How to pause / resume

**Quick pause — skip the next single run** (no admin needed):

```powershell
New-Item -Path 'C:\LECG\Dashboard\.dc-ingest.disabled' -ItemType File
```

The PowerShell harness checks for this file at start; if present it logs "kill-switch active" and exits cleanly without touching the DB. Delete the file to resume:

```powershell
Remove-Item 'C:\LECG\Dashboard\.dc-ingest.disabled'
```

**Long pause — disable the task entirely** (admin):

```powershell
Disable-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
# ... later ...
Enable-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
```

## 6. How to re-authenticate Autodesk

The pipeline uses Luis's 3-leg APS user token (stored in the DB via the dashboard's signIn flow). Tokens auto-refresh; only the long-lived **refresh token** can expire, which happens after ~14 days of no use or if Autodesk forces re-consent.

Symptom: SyncFreshnessPill turns RED with `last error: HTTP 401` or `refresh_token expired`.

Steps:
1. Open the dashboard.
2. Click the red SyncFreshnessPill in the sidebar.
3. Browser redirects to Autodesk OAuth (`signIn` flow); sign in with the LECG Autodesk account.
4. Confirm the consent screen.
5. The next scheduled 03:00 run picks up the refreshed token automatically — no need to trigger manually.

If Luis wants to validate immediately after re-auth without waiting: `Start-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'`.

## 7. Log locations

| Source | Path |
|--------|------|
| PowerShell harness | `C:\LECG\Dashboard\logs\dc-ingest-YYYY-MM-DD.log` (one file per day, rolled by date) |
| Manual debug runs (interactive) | Console stdout when running `node scripts/dc-daily-ingest.cjs` |
| Authoritative status | DB table `AccDcIngestRun` |

Quick status query (run in any psql / Prisma Studio session):

```sql
SELECT id, "startedAt", "endedAt", status, "rowsAdminTotal", "rowsActivityTotal", "errorMessage"
FROM "AccDcIngestRun"
ORDER BY "startedAt" DESC
LIMIT 5;
```

## 8. Common errors and fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| **HTTP 429** in log; pill amber | DC daily quota (~25 req/UTC-day) exhausted | Wait — next 03:00 run resumes automatically. No action needed. |
| **HTTP 401 / token expired**; pill red | Refresh token died | See section 6 — click pill → re-auth. |
| **HTTP 504 on submit** repeated | APS DC backend is degraded | Built-in backoff retries 4×. If it persists overnight, pause for 24h via section 5 quick-pause and try the next day. |
| **Anomaly quarantine** — pill amber + `AccDcIngestRun.status='quarantined'` | A diff threshold tripped (`dcAnomalyChecks.ts`) — e.g., >50% user delete in one run | Inspect `errorMessage` (names the threshold). If a real ACC change caused the diff, raise the threshold in `lib/acc/dcAnomalyChecks.ts` `DEFAULT_THRESHOLDS` and rerun. |
| **Stale lock** — new run won't start, log says "another run is in flight" | Previous run crashed without writing endedAt | Auto-reclaim happens at 60min. Force-reclaim earlier with: `UPDATE "AccDcIngestRun" SET status='failed', "endedAt"=NOW() WHERE status='running';` |
| **Unknown module detected** in log (`unknownModulesSeen` non-empty in AccDcIngestRun row) | Autodesk shipped a new module CSV | Add the module name to `KNOWN_MODULES` in `lib/acc/dcActivityCsvIngest.ts`, add a color to `MODULE_BADGE_COLORS` in `app/(dashboard)/users/UsersDirectoryClient.tsx`, redeploy. |
| **Pill stays gray "no runs yet"** after task install | Task didn't fire / log empty | Run `Get-ScheduledTaskInfo -TaskName 'LECG-DC-Daily-Ingest'` to see LastRunResult. 0x0 = success; anything else needs investigation in the daily log. |

## 9. How to manually trigger one ingest right now (debug)

Skip Task Scheduler entirely; useful for verbose console output during debugging:

```cmd
cd C:\LECG\Dashboard
node scripts/dc-daily-ingest.cjs
```

The script writes a fresh `AccDcIngestRun` row exactly as the scheduled task would.

## 10. Health check (do this weekly)

1. Open the dashboard.
2. Hover the SyncFreshnessPill in the sidebar.
3. Healthy state shows:
   - **Status:** green
   - **Last success:** within the last 24h
   - **Backfill:** "month X of Y" with X advancing week-over-week (or "fully backfilled")
   - **Quota:** 1-25 used today (typically 1-5 once steady-state)
   - **Access changes:** "+N / -M users" delta vs previous run

If any of the above is missing or the pill is amber/red for >48h, walk through sections 6 and 8.

## 11. One-time legacy wipe (Phase 8 cutover only)

Pre-Phase-8 `AccActivity` rows have `service=NULL` (no module tag). After the **first** successful Phase-8 run validates the new pipeline writes module-tagged rows, run the wipe:

```cmd
cd C:\LECG\Dashboard
node scripts/wipe-legacy-acc-activity.cjs --dry-run
# Confirm "Would delete ~2507 rows"
node scripts/wipe-legacy-acc-activity.cjs --yes
```

Then trigger one more run so the table repopulates with service-tagged data:

```powershell
Start-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
```

This is a one-time operation. After cutover the wipe script is no longer needed and can be left in `scripts/` as historical reference.
