# Weekly full-universe DC admin snapshot refresh — runs on Luis's PC via Task Scheduler.
#
# WHY: the daily ingest only extracts MTY-allowlisted projects, whose admin CSVs
# cover a fraction of the account's users. The AccDc* admin snapshot can only be
# promoted from a full-universe extract (see scripts/dc-admin-snapshot-refresh.cjs
# header for the 2026-07-07 root-cause note). This wrapper runs that extract
# weekly; the daily ingest runs with DC_SKIP_ADMIN_SNAPSHOT=1.
#
# Install (once, from an elevated PowerShell):
#   schtasks /Create /TN "DC-Admin-Snapshot-Refresh" /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-admin-snapshot-refresh.ps1" /SC WEEKLY /D SUN /ST 07:00 /F
#
# Uninstall:
#   schtasks /Delete /TN "DC-Admin-Snapshot-Refresh" /F
#
# Run manually to verify:
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-admin-snapshot-refresh.ps1

$ErrorActionPreference = "Continue"
Set-Location "C:\LECG\Dashboard"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$logFile = "logs\dc-admin-refresh-$stamp.log"
"=== DC admin snapshot refresh started $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
node --env-file=.env scripts/dc-admin-snapshot-refresh.cjs *>&1 | Tee-Object -FilePath $logFile -Append
$exit = $LASTEXITCODE
"=== DC admin snapshot refresh ended $(Get-Date -Format 'u') exit=$exit ===" | Tee-Object -FilePath $logFile -Append
exit $exit
