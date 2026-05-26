$ErrorActionPreference = "Continue"
Set-Location "C:\LECG\Dashboard"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$logFile = "logs\dc-daily-ingest-$stamp.log"
$env:DC_DAYS = "1"
"=== DC daily ingest started $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
node --env-file=.env scripts/dc-daily-ingest.cjs *>&1 | Tee-Object -FilePath $logFile -Append
"=== DC daily ingest ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
