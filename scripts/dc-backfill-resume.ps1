$ErrorActionPreference = "Continue"
Set-Location "C:\LECG\Dashboard"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$logFile = "logs\dc-backfill-resume-$stamp.log"
$env:DC_DAYS = "730"
$env:DC_RESUME = "1"
"=== DC 730-day backfill RESUME started $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
node --env-file=.env scripts/dc-ingest-where-i-admin.cjs *>&1 | Tee-Object -FilePath $logFile -Append
"=== DC 730-day backfill RESUME ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
