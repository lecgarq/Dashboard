# All-time backward backfill — manual/daily runner.
#
# Regenerates the remaining-project list, then runs the quota-safe extractor for
# the window project-start -> 2025-06-30. Re-run daily until the list is empty.
#
# Scope is the MTY-eligible set (lib/acc/dcProjectEligibility.ts), matching
# scripts/dc-coverage-report.cjs and scripts/dc-build-extract-list.cjs.
#
# Manual run:
#   powershell.exe -ExecutionPolicy Bypass -File C:\LECG\Dashboard\scripts\dc-alltime-backfill.ps1
#
# Env knobs (override before calling): DC_MAX_REQUESTS (default 20), DC_DRY_RUN.
#
# NOTE: invoking dc-extract-id-list.cjs (even with DC_DRY_RUN=1) acquires the
# Autodesk access token and will ROTATE+PERSIST the single-use refresh token if
# the cached access token has expired. Recovery path if login breaks:
#   node --env-file=.env scripts/aps-login.cjs

$ErrorActionPreference = "Continue"
Set-Location "C:\LECG\Dashboard"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$logFile = "logs\dc-alltime-backfill-$stamp.log"
if (-not (Test-Path "logs")) { New-Item -ItemType Directory -Path "logs" -Force | Out-Null }

$env:DC_START_DATE = "2019-01-01T00:00:00.000Z"
$env:DC_END_DATE   = "2025-06-30T23:59:59.999Z"
$env:DC_IDS_FILE   = "tmp\dc-extract-list.txt"
$env:DC_NO_BISECT  = "1"
if (-not $env:DC_MAX_REQUESTS) { $env:DC_MAX_REQUESTS = "20" }

"=== all-time backfill started $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append

# 1) Regenerate the remaining-project list (DB-only; no token, no quota).
node --env-file=.env scripts/dc-build-extract-list.cjs *>&1 | Tee-Object -FilePath $logFile -Append

# 2) Stop early if nothing remains.
if (-not (Test-Path $env:DC_IDS_FILE) -or ((Get-Content $env:DC_IDS_FILE | Where-Object { $_.Trim() }).Count -eq 0)) {
    "Nothing remaining — campaign complete." | Tee-Object -FilePath $logFile -Append
    "=== all-time backfill ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
    exit 0
}

# 3) Run the extractor (spends quota up to DC_MAX_REQUESTS; touches the token).
node --env-file=.env scripts/dc-extract-id-list.cjs *>&1 | Tee-Object -FilePath $logFile -Append

"=== all-time backfill ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
