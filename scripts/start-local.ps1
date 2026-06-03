#requires -Version 5.1
<#
.SYNOPSIS
  Boot the LECG Dashboard locally: Prisma migrate, Yjs server, Next.js dev.

.DESCRIPTION
  Replaces Railway deployment. Run manually or via Task Scheduler at log-on.
  Foreground: Next.js dev on http://localhost:3000
  Background: Hocuspocus Yjs server on ws://localhost:4444
  Logs:      logs\yjs.log  (Yjs only; Next.js stays in the foreground window)
#>

$ErrorActionPreference = 'Stop'
$ProjectRoot = 'C:\LECG\Dashboard'
Set-Location $ProjectRoot

if (-not (Test-Path "$ProjectRoot\logs")) {
    New-Item -ItemType Directory -Path "$ProjectRoot\logs" | Out-Null
}

Write-Host "[start-local] $(Get-Date -Format o)  cwd=$ProjectRoot"

Write-Host "[start-local] Running prisma migrate deploy..."
& npx --no-install prisma migrate deploy
if ($LASTEXITCODE -ne 0) {
    Write-Warning "[start-local] prisma migrate deploy exited $LASTEXITCODE (continuing anyway)"
}

# Stop any leftover Yjs server from a previous session so port 4444 is free.
# Process command-line inspection can be denied on some local Windows setups;
# stale cleanup is best-effort and should not block the dashboard from starting.
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
        Where-Object { $_.CommandLine -like '*yjs-server.mjs*' } |
        ForEach-Object {
            Write-Host "[start-local] Killing stale Yjs PID $($_.ProcessId)"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
} catch {
    Write-Warning "[start-local] Could not inspect node command lines for stale Yjs cleanup: $($_.Exception.Message)"
}

Write-Host "[start-local] Starting Yjs server (background) -> logs\yjs.log"
$yjs = Start-Process -FilePath 'node' `
    -ArgumentList 'scripts/yjs-server.mjs' `
    -WorkingDirectory $ProjectRoot `
    -RedirectStandardOutput "$ProjectRoot\logs\yjs.log" `
    -RedirectStandardError  "$ProjectRoot\logs\yjs.err.log" `
    -WindowStyle Hidden -PassThru
Write-Host "[start-local] Yjs PID $($yjs.Id)"

Write-Host "[start-local] Verifying production build exists (.next/BUILD_ID)..."
$buildIdPath = Join-Path $ProjectRoot '.next\BUILD_ID'
if (-not (Test-Path $buildIdPath)) {
    Write-Host "[start-local] No production build found. Running 'npm run build'..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "[start-local] npm run build failed (exit $LASTEXITCODE). Fix the build, then re-run."
        exit $LASTEXITCODE
    }
} else {
    Write-Host "[start-local] Existing build found. (Re-run 'npm run build' manually after code changes.)"
}

Write-Host "[start-local] Starting Next.js production server (foreground) on http://localhost:3000"
Write-Host "[start-local] Close this window to stop the dashboard."
# Raise the V8 old-space heap: the access-analysis bulkUsers query assembles the
# full 16,942-user payload in memory and was OOM-crashing the default ~4GB heap.
# Machine has 64GB RAM, so 8GB is safe headroom.
$env:NODE_OPTIONS = '--max-old-space-size=8192'
& npm start
