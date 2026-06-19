# UAT Runbook — Phase 7 Pre-Workshop

**Who runs this:** Luis (dashboard owner)
**What it does:** Builds the production UAT copy on :3100, runs the engineering gate report,
runs the live projector pass, and promotes to :3000 only after sign-off.
**Time needed:** ~20 min build + 30 min projector pass

> WARNING — NEVER run `npm run build` while the :3000 Task Scheduler instance is live.
> Doing so freezes the running dashboard for ~8 minutes (500 errors on every request).
> Always follow STEP 0 before building.

---

## STEP 0 — Choose Build Isolation (do this once, then record the result below)

You have two options. Try Option A first. If it touches the live `.next/` directory, fall back to Option B.

### Option A (Faster — keep :3000 live during build)

Open PowerShell in `C:\LECG\Dashboard` and run:

```powershell
# Note the last-modified time of .next/ BEFORE building
$beforeBuild = (Get-Item .next).LastWriteTime
Write-Host "Before build — .next\ last modified: $beforeBuild"

# Build to an isolated directory
$env:NEXT_DIST_DIR = ".next-uat"
npm run build

# Check whether .next/ was touched
$afterBuild = (Get-Item .next).LastWriteTime
Write-Host "After build  — .next\ last modified: $afterBuild"

if ($beforeBuild -eq $afterBuild) {
    Write-Host "SAFE: .next/ was NOT modified. Option A is safe on this machine."
    Write-Host ">>> Record result: Option A verified safe — skip :3000 stop next time."
} else {
    Write-Host "UNSAFE: .next/ was modified during the build. Use Option B next time."
    Write-Host ">>> The :3100 build in .next-uat/ is still usable — continue from STEP 2."
    Write-Host ">>> But for future UAT runs, stop the :3000 task first (Option B)."
}
```

**Record your result here (fill in after first run):**

```
Option A verified safe on this machine: [ YES / NO ]
Date tested: _______________
```

### Option B (Safest — stop :3000 before building)

1. Open **Task Scheduler** (search "Task Scheduler" in Start menu).
2. Find the task named **LECG Dashboard** (or similar — it runs `start-local.ps1` at logon).
3. Right-click → **End** to stop the running :3000 instance.
4. Confirm :3000 is down: open http://localhost:3000 — it should refuse to connect.
5. Build (STEP 1 below).
6. After UAT is complete and you approve, restart the task (STEP 5) to bring :3000 back.

> Note: Option B is required if Option A is NOT verified safe, or if the machine was
> restarted since the last verification.

---

## STEP 1 — Build the UAT Copy

Open PowerShell in `C:\LECG\Dashboard`.

```powershell
$env:NEXT_DIST_DIR = ".next-uat"
npm run build
```

**What this produces:** `.next-uat/` directory with the full production build of the current
working tree. The live `.next/` directory (used by :3000) is not touched when `NEXT_DIST_DIR`
is set — but verify this per STEP 0 above.

**Do NOT set these flags — they are out of scope:**
- `NEXT_PUBLIC_ACC_GRAPH_TEST=1` — only affects the spatial-graph cosmos.gl GPU physics;
  the four UAT pages (/users, /access-analysis, /template-mty, /forma-proposal) are unaffected.
- `NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1` — not needed; the new /access-analysis route is the
  default (this flag only appears in a users page test fixture).

**Expected build time:** 5–8 minutes.

**If the build hangs or fails:** Check that :3000 is not live during the build (see STEP 0).
If it is, stop the Task Scheduler task and retry. If the build returns a tsc error, note the
error and run `npx tsc --noEmit` to inspect; do NOT proceed to serve or UAT until tsc is clean.

---

## STEP 2 — Serve the UAT Build on :3100

In the same PowerShell window (or a new one), run:

```powershell
$env:NEXT_DIST_DIR = ".next-uat"
$env:PORT = "3100"
node node_modules/.bin/next start -H 0.0.0.0 --port 3100
```

**What to expect:** The terminal prints something like:
```
   ▲ Next.js 15.x.x
   - Local:        http://localhost:3100
   - Network:      http://0.0.0.0:3100
   Ready in Xs
```

**Confirm it is serving:** Open http://localhost:3100/users in a browser. The /users page
should load (you may see a skeleton for a moment, then the full table). If you see an error,
check that the `.next-uat/` directory exists from STEP 1.

**Leave this PowerShell window open** — it is the server for the entire UAT session. Closing
it stops :3100.

---

## STEP 3 — Run the Engineering Gate Report

Open a NEW PowerShell window (leave the STEP 2 server running) and run:

```powershell
cd C:\LECG\Dashboard
node scripts/uat/run-engineering-gates.cjs
```

**What this does:** Runs all five engineering gates in order:
1. `npx tsc --noEmit` — full-tree typecheck including test files
2. `npm run repo-map:check` — dependency ratchet (no new fetch/effect/Prisma-in-UI regressions)
3. Boundary diff — confirms Phase 7 commits touch zero files under `users/access-analysis/`
4. GraphCanvas grep — confirms no conditional GraphCanvas mount in the four UAT pages
5. Playwright UAT run — 38 tests across all four pages at 1280px viewport, both themes,
   drills, contrast, tRPC fetch-once, canvas count, reduced-motion

**What you should see at the end:**
```
ALL GATES GREEN — UAT harness complete
```

The report is written to `.planning/phases/07-pre-workshop-uat/UAT-REPORT.md`.

**If any gate is RED:**
- **tsc-0 red:** Run `npx tsc --noEmit` to see the errors. Fix the type error, re-run tsc,
  then re-run the full gate wrapper.
- **repo-map:check red:** Run `npm run repo-map:check` to see what rule failed. Most likely
  a new dependency introduced during a fix. Revert or adjust the import.
- **Playwright gate red:** The terminal prints the failing test name and the Playwright HTML
  report opens at `playwright-report/index.html`. Fix the issue inline, then re-run:
  ```powershell
  node scripts/uat/run-engineering-gates.cjs
  ```
- **Do NOT proceed to STEP 4 until the report shows ALL-GREEN.**

**Re-run command (after fixing an issue):**
```powershell
node scripts/uat/run-engineering-gates.cjs
```

---

## STEP 4 — Live Projector Pass

**Setup:**
1. Move your browser to the **secondary display** (the projector screen or the display you
   will use during the workshop).
2. Set the display brightness to **projector-reduced** (the level you expect in the room —
   typically lower than normal monitor brightness).
3. Set the browser window to exactly **1280px wide** (use DevTools → device toolbar, or
   resize manually and confirm in DevTools).

**Navigate to** http://localhost:3100 on the secondary display.

**Walk the Owner Perceptual Checklist** in UAT-REPORT.md for ALL FOUR pages:
- `/users`
- `/access-analysis`
- `/template-mty`
- `/forma-proposal`

Do this in **BOTH** light and dark (zinc) themes. Use the theme toggle in the dashboard
sidebar/header — click "Toggle theme" and select Light or Dark.

**Mark each item** in the checklist as:
- **PASS** — looks correct and legible on the projector
- **BLOCK** — room-breaking issue (invisible/illegible label, clipped modal, horizontal
  overflow you can feel, page error/crash, a drill that does not open). MUST be fixed
  before sign-off.
- **COSMETIC** — a polish nit; ships as-is, logged NOTED in the Defects table. Does NOT
  hold the phase.

**GPU check (DevTools):**
- Open Chrome DevTools (F12 or right-click → Inspect).
- Go to the **Memory** tab and look at the GPU memory readout, or navigate to
  `chrome://gpu` in a separate tab and observe GPU Memory Used.
- Confirm it stays **below 400MB** as you browse all four pages.

---

## STEP 5 — Record Sign-Off and Promote to :3000

**After the report is ALL-GREEN and you approve on the projector:**

1. Fill in the **Combined Sign-Off** section of UAT-REPORT.md with your verdict:
   - Engineering report: ALL-GREEN (gate wrapper passed)
   - Owner approval: "approved on the projector" (write this phrase explicitly)
   - List any remaining COSMETIC nits (they are logged NOTED and do not block)

2. **Promote to :3000** by stopping the :3100 server (press Ctrl+C in the STEP 2 PowerShell
   window), then rebuilding and restarting the :3000 Task Scheduler task:

   ```powershell
   # If you stopped :3000 for Option B build isolation:
   # Restart the Task Scheduler task (LECG Dashboard) to bring :3000 back with the latest build.
   # In Task Scheduler: right-click the task → Run
   ```

   If you used Option A (NEXT_DIST_DIR=.next-uat isolation and :3000 stayed live during the
   UAT build), you still need to rebuild for :3000 to serve the approved build:

   ```powershell
   # Stop :3000 first (Task Scheduler → End the LECG Dashboard task)
   # Then build to .next (the standard production directory):
   npm run build
   # Then restart :3000 (Task Scheduler → Run)
   ```

   Confirm at http://localhost:3000 that the approved build is live.

---

## Recovery Notes

**If anything 500s during the UAT run on :3100:**
- Press Ctrl+C to stop the :3100 server.
- Check that `.next-uat/` is a complete build (STEP 1 must have finished successfully).
- Re-run STEP 2 to restart the server.

**If the build hangs for more than 10 minutes:**
- Press Ctrl+C to stop the build.
- Verify :3000 is NOT live (it may have interfered). Stop the Task Scheduler task.
- Re-run STEP 1 with the Task Scheduler task stopped.

**If :3000 goes down unexpectedly during Option A build:**
- The build completed or partially completed. Once the build finishes, :3000 will recover
  automatically when next start picks up the new `.next/` artifacts — OR restart the Task
  Scheduler task (Run) to bring it back.
- Future runs: switch to Option B (stop :3000 before building).

**If Playwright fails with "browser not found":**
```powershell
npx playwright install chromium
```
Then re-run the gate wrapper.

---

## Quick Reference

| Action | Command |
|--------|---------|
| Build UAT copy | `$env:NEXT_DIST_DIR=".next-uat"; npm run build` |
| Serve on :3100 | `$env:NEXT_DIST_DIR=".next-uat"; $env:PORT="3100"; node node_modules/.bin/next start -H 0.0.0.0 --port 3100` |
| Run all gates | `node scripts/uat/run-engineering-gates.cjs` |
| Run static gates only | `node scripts/uat/run-engineering-gates.cjs --static-only` |
| Run Playwright only | `$env:E2E_BASE_URL="http://localhost:3100"; npx playwright test uat-workshop --config playwright.verify.config.ts` |
| Check tsc only | `npx tsc --noEmit` |
| Install Playwright browsers | `npx playwright install chromium` |

---

*Phase 7 Pre-Workshop UAT*
*Dashboard: C:\LECG\Dashboard*
*Report: .planning/phases/07-pre-workshop-uat/UAT-REPORT.md*
