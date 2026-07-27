# Daily bulk ACC user refresh — runs on Luis's PC via Task Scheduler.
#
# Force-refreshes every user's live ACC profile (projects, roles, products) into
# AccMemberCache — the bulk equivalent of clicking "Refresh" on each user in the
# /users directory — then rebuilds the spatial-graph cache. Same logic as
# scripts/sync-acc-users.ts (the in-app users.bulkAccSync mutation, scripted).
#
# Scheduled for 04:00, AFTER the 03:00 "LECG DC Daily Ingest" (also API-heavy,
# 30-min window) so the two don't fight over APS rate limits.
#
# Install (once, from an Administrator PowerShell):
#   schtasks /Create /TN "LECG ACC User Sync" /TR "powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\sync-acc-users-cron.ps1" /SC DAILY /ST 04:00 /F
#
# Uninstall:
#   schtasks /Delete /TN "LECG ACC User Sync" /F
#
# Run manually to verify:
#   powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\sync-acc-users-cron.ps1
#
# Kill switch (skip a run without touching Task Scheduler):
#   create C:\LECG\Dashboard\.sync-acc-users.disabled

$ErrorActionPreference = "Continue"
$DashboardRoot = "C:\LECG\Dashboard"
Set-Location $DashboardRoot

$LogDir = Join-Path $DashboardRoot "logs"
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

$Today = Get-Date -Format "yyyy-MM-dd"
$LogFile = Join-Path $LogDir "sync-acc-users-$Today.log"

# Kill switch — lets the operator stop the cron without touching Task Scheduler.
$KillSwitch = Join-Path $DashboardRoot ".sync-acc-users.disabled"
if (Test-Path $KillSwitch) {
    "$(Get-Date -Format 'o') Kill switch present (.sync-acc-users.disabled) -- skipping run." | Tee-Object -FilePath $LogFile -Append
    exit 0
}

$Header = @"
============================================================
ACC User Sync -- started $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
Working directory: $DashboardRoot
Entry: scripts/sync-acc-users.ts
============================================================
"@
$Header | Out-File -FilePath $LogFile -Encoding utf8 -Append

# 45-minute hard timeout — the full-hub sync (~3.7k users at concurrency 3) ran
# ~18 min in practice; 45 min is generous headroom for a slow API day.
$TimeoutMs = 45 * 60 * 1000
$Proc = Start-Process -FilePath 'node' `
    -ArgumentList '--env-file=.env', '--import', 'tsx', 'scripts/sync-acc-users.ts' `
    -RedirectStandardOutput $LogFile `
    -RedirectStandardError "$LogFile.err" `
    -PassThru -NoNewWindow

$Exited = $Proc.WaitForExit($TimeoutMs)

if (Test-Path "$LogFile.err") {
    Get-Content "$LogFile.err" | Out-File -FilePath $LogFile -Encoding utf8 -Append
    Remove-Item "$LogFile.err" -Force -ErrorAction SilentlyContinue
}

if (-not $Exited) {
    "$(Get-Date -Format 'o') TIMEOUT after 45min -- killing process." | Tee-Object -FilePath $LogFile -Append
    try { $Proc.Kill() } catch {}
    "============================================================`nACC User Sync -- TIMED OUT $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")`n============================================================`n" | Out-File -FilePath $LogFile -Encoding utf8 -Append
    exit 124
}

"============================================================`nACC User Sync -- finished $(Get-Date -Format "yyyy-MM-dd HH:mm:ss") exit=$($Proc.ExitCode)`n============================================================`n" | Out-File -FilePath $LogFile -Encoding utf8 -Append

exit $Proc.ExitCode
