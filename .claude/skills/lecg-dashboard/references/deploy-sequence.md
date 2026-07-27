# Dashboard Deploy Sequence

## Context

Production = local Windows machine on `:3000` via the `LECG Dashboard Local`
Windows Scheduled Task. There is no remote deployment, no Docker, no CI/CD
pipeline. A rebuild ships the whole working tree.

## Steps

```powershell
# 1. Stop the scheduled task (frees :3000)
Stop-ScheduledTask -TaskName "LECG Dashboard Local"

# 2. Kill any lingering node process still holding the port
$proc = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
if ($proc) { Stop-Process -Id $proc -Force }

# 3. Fast type pre-check (catches errors without a full build)
npx tsc --noEmit

# 4. Production build
npm run build

# 5. Restart the scheduled task
Start-ScheduledTask -TaskName "LECG Dashboard Local"

# 6. Verify the target page loads
# (open http://localhost:3000/<target-page> in browser)
```

## Rules

- **Never** run `npm run build` while `:3000` is live — it 500s the running app.
- **Always** run `npx tsc --noEmit` first as a fast pre-check.
- After restart, verify the target page loads before declaring success.
- The `LECG Postgres Local` task must also be in `Running` state for the app
  to function; check with `Get-ScheduledTask -TaskName "LECG Postgres Local"`.

## Verification

```powershell
# Confirm task is running
Get-ScheduledTask -TaskName "LECG Dashboard Local" | Select-Object TaskName, State

# Confirm port is listening
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
```
