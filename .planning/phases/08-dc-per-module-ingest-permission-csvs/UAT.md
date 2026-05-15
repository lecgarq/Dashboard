# Phase 8 UAT

**Date:** {fill in YYYY-MM-DD when Luis runs the manual checklist}
**Operator:** Luis
**Build:** 27a5d07 (HEAD at Wave-4 start, before docs(08-08) commits)

> **STATUS: PENDING-MANUAL-UAT**
> Claude executor cannot install Windows Scheduled Tasks (requires elevation on Luis's PC),
> cannot trigger live APS Data Connector calls (requires Luis's 3-leg session),
> and cannot visually inspect the SyncFreshnessPill popover. The manual checklist below must
> be executed by Luis on his PC; the DECISION line at the bottom is the acceptance gate.

---

## Manual checklist (Luis runs each block on his PC)

### A. Install the scheduled task (one-time)

Right-click PowerShell → *Run as Administrator*, then paste:

```powershell
$action   = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument '-File "C:\LECG\Dashboard\scripts\dc-daily-cron.ps1"'
$trigger  = New-ScheduledTaskTrigger -Daily -At '3:00am'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries
Register-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest' `
  -Action $action -Trigger $trigger -Settings $settings `
  -RunLevel Highest -Description 'Phase 8 daily APS Data Connector ingest'

Get-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
```

### B. Trigger one manual run (validates new pipeline BEFORE wiping legacy data)

```powershell
Start-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
Get-Content "C:\LECG\Dashboard\logs\dc-ingest-$(Get-Date -Format yyyy-MM-dd).log" -Wait
```

Wait for `Run <uuid> ended with status=success` (up to 30 min). If the log shows status=quarantined or status=failed, fix per RUNBOOK.md section 8 before continuing.

### C. Verify in dashboard

1. Open the dashboard URL Luis uses (e.g. http://localhost:3000).
2. Hover the **SyncFreshnessPill** in the sidebar — popover should show:
   - Backfill: month X of Y
   - Next run: in ~24h
   - Quota used: 1-5 / 25
   - Access changes: +N / -M users
3. Click into a user with file activity. Each row should show a colored module badge chip (Docs / Issues / Reviews / etc.).

### D. Wipe legacy AccActivity (ONLY after C confirms module badges render)

```cmd
cd C:\LECG\Dashboard
node scripts/wipe-legacy-acc-activity.cjs --dry-run
:: confirm "Would delete ~2507 rows"
node scripts/wipe-legacy-acc-activity.cjs --yes
```

Then trigger one more manual run to repopulate with service-tagged rows:

```powershell
Start-ScheduledTask -TaskName 'LECG-DC-Daily-Ingest'
```

### E. Final verification queries (run in psql / Prisma Studio)

```sql
-- Should be > 0 after first successful run:
SELECT COUNT(*) FROM "AccDcUser";
SELECT COUNT(*) FROM "AccDcProject";
SELECT COUNT(*) FROM "AccDcBackfillProgress";

-- All AccActivity rows should have a non-null service after the wipe + repopulate:
SELECT service, COUNT(*) FROM "AccActivity" GROUP BY service ORDER BY 2 DESC;
```

---

## Checks (Luis fills in)

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| A. Scheduled task installed (LECG-DC-Daily-Ingest visible in `Get-ScheduledTask`) | | |
| B. Manual run completes with status=success in AccDcIngestRun | | |
| C1. SyncFreshnessPill shows green status | | |
| C2. Pill popover shows Backfill / Next run / Quota / Access changes | | |
| C3. Module badge chips visible on File Activity rows | | |
| D. Legacy wipe executed (2,507 → 0; next run repopulates with service tagged) | | |
| E. AccDcUser row count > 0 (admin CSV snapshot landed) | | |
| F. AccDcProject row count > 0 | | |
| G. AccDcBackfillProgress has 1 row per known project | | |

## Unknown modules observed (if any)

```sql
SELECT "unknownModulesSeen" FROM "AccDcIngestRun"
WHERE status='success' ORDER BY "startedAt" DESC LIMIT 1;
```

{paste output of latest success row here}

## Anomalies / issues

{free-form notes — quarantines, retries, slow projects, etc.}

---

## DECISION

> Luis: replace the line below with **exactly one** of the three tokens.

DECISION: PHASE-8-ACCEPT=PENDING-MANUAL-UAT

Valid tokens (pick one when checks A-G complete):
- `DECISION: PHASE-8-ACCEPT=APPROVED` — all checks green; phase shipped.
- `DECISION: PHASE-8-ACCEPT=GAPS` — itemize failed checks above; Claude will plan gap closure.
- `DECISION: PHASE-8-ACCEPT=REVERT` — pipeline broken; revert merge.
