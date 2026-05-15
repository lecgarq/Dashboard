# Daily Data Connector ingest — runs on Luis's PC via Task Scheduler.
#
# Phase 8 plan 08-06 update:
#   - Now invokes scripts/dc-daily-ingest.cjs (Wave-2 orchestrator entry)
#     instead of the legacy scripts/dc-ingest-where-i-admin.cjs
#   - Adds .dc-ingest.disabled kill-switch check (DC8-10) BEFORE node spawn
#   - Adds 30-minute hard timeout (CONTEXT.md run-duration budget)
#   - Logs to logs/dc-ingest-YYYY-MM-DD.log (renamed from dc-cron-*.log)
#
# Install (once, from an Administrator PowerShell):
#   schtasks /Create /TN "LECG DC Daily Ingest" /TR "powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-daily-cron.ps1" /SC DAILY /ST 03:00 /F
#
# Uninstall:
#   schtasks /Delete /TN "LECG DC Daily Ingest" /F
#
# Run manually to verify:
#   powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-daily-cron.ps1

$ErrorActionPreference = "Continue"
$DashboardRoot = "C:\LECG\Dashboard"
Set-Location $DashboardRoot

$LogDir = Join-Path $DashboardRoot "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$Today = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogDir "dc-ingest-$Today.log"

# ---------------------------------------------------------------------------
# Kill switch — second layer in addition to the runtime check inside
# scripts/dc-daily-ingest.cjs. Lets the operator stop the cron without
# touching Task Scheduler.
# ---------------------------------------------------------------------------
$KillSwitch = Join-Path $DashboardRoot ".dc-ingest.disabled"
if (Test-Path $KillSwitch) {
    "$(Get-Date -Format 'o') Kill switch present (.dc-ingest.disabled) -- skipping run." | Tee-Object -FilePath $LogFile -Append
    exit 0
}

$Header = @"
============================================================
DC Daily Cron -- started $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Working directory: $DashboardRoot
Entry: scripts/dc-daily-ingest.cjs
============================================================
"@
$Header | Out-File -FilePath $LogFile -Encoding utf8 -Append

# ---------------------------------------------------------------------------
# Run with a 30-minute hard timeout. CONTEXT.md run-duration budget.
# ---------------------------------------------------------------------------
$TimeoutMs = 30 * 60 * 1000
$Proc = Start-Process -FilePath 'node' `
    -ArgumentList '--env-file=.env', 'scripts/dc-daily-ingest.cjs' `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError "$LogFile.err" `
    -PassThru -NoNewWindow

$Exited = $Proc.WaitForExit($TimeoutMs)

# Concatenate stderr into the main log for unified review.
if (Test-Path "$LogFile.err") {
    Get-Content "$LogFile.err" | Out-File -FilePath $LogFile -Encoding utf8 -Append
    Remove-Item "$LogFile.err" -Force -ErrorAction SilentlyContinue
}

if (-not $Exited) {
    "$(Get-Date -Format 'o') TIMEOUT after 30min -- killing process." | Tee-Object -FilePath $LogFile -Append
    try { $Proc.Kill() } catch {}
    $Footer = @"
============================================================
DC Daily Cron -- TIMED OUT $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
============================================================

"@
    $Footer | Out-File -FilePath $LogFile -Encoding utf8 -Append
    exit 124
}

$Footer = @"
============================================================
DC Daily Cron -- finished $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") exit=$($Proc.ExitCode)
============================================================

"@
$Footer | Out-File -FilePath $LogFile -Encoding utf8 -Append

exit $Proc.ExitCode
