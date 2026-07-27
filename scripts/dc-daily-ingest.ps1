$ErrorActionPreference = "Continue"
Set-Location "C:\LECG\Dashboard"
$stamp = Get-Date -Format "yyyy-MM-dd-HHmm"
$logFile = "logs\dc-daily-ingest-$stamp.log"
$env:DC_DAYS = "1"
# 2026-07-07: the daily run extracts only MTY-allowlisted projects (~183 of
# ~527 admin projects), so its admin CSVs can never pass the full-universe
# anomaly baseline — every run since 2026-06-04 quarantined on promotion,
# which also froze the post-success rebuilds (folder-perm summary,
# person-graph, embeddings). The admin snapshot is now owned by the weekly
# scripts/dc-admin-snapshot-refresh.ps1 task; skip it here permanently.
$env:DC_SKIP_ADMIN_SNAPSHOT = "1"
"=== DC daily ingest started $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
node --env-file=.env scripts/dc-daily-ingest.cjs *>&1 | Tee-Object -FilePath $logFile -Append
"=== DC daily ingest ended $(Get-Date -Format 'u') ===" | Tee-Object -FilePath $logFile -Append
