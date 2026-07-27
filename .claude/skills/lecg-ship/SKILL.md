---
name: lecg-ship
description: Commit staged work surgically and deploy the LECG Dashboard to the live :3000 service, then probe the changed route. Use whenever Luis says "ship", "deploy", "push this live", "commit and deploy", "update :3000", or when lecg-phase completion runs the autoDeploy policy.
argument-hint: "[commit only | deploy only]"
---

# lecg-ship

Turn verified working-tree changes into commits and a live `:3000` deployment
with truthful evidence. `commit only` skips the rebuild; `deploy only` skips
committing (ships the tree as-is — say so in the report).

Read `../lecg-dashboard/references/lecg-workflow-conventions.md` first.

## Commit

1. `git status --short` — identify what belongs to the work being shipped vs
   pre-existing WIP (this branch always carries intentional WIP; never sweep
   it).
2. Check for pre-staged leftovers: `git diff --cached --name-only`. Unstage
   anything you did not stage for this ship.
3. Stage explicit paths only — never `git add -A` / `.` / `-u` / `commit -a`.
4. Inspect `git diff --cached --name-only` again; every listed path must be
   in scope.
5. Commit in coherent groups using the repository's `feat` / `fix` / `test` /
   `docs` / `chore` style.

## Deploy

Prerequisite gates before touching the live service:

- `npx tsc --noEmit` — zero errors, always, immediately before the build.
- The focused gates for whatever is being shipped have already run and passed
  (see `dashboard-verification-sequence.md`); do not deploy unverified work.

Then follow `../lecg-dashboard/references/deploy-sequence.md` exactly:
stop the `LECG Dashboard Local` scheduled task, free port 3000, build,
restart the task.

## Probe

After restart, verify before declaring success:

1. `Get-ScheduledTask -TaskName "LECG Dashboard Local"` shows `Running` and
   port 3000 is listening.
2. Fetch the changed route(s) (`Invoke-WebRequest http://localhost:3000/<route>`
   or browser) — a 200 with real content, not an error shell. (The design
   gate ran pre-deploy in the Full verification tier; do not repeat it here.)
3. If invoked from phase completion, append the probe result (route, status,
   timestamp, BUILD_ID from `.next/BUILD_ID`) to the phase's
   `NN-VERIFICATION.md`.

## Failure handling

- Build fails: do not leave `:3000` down — restart the scheduled task on the
  previous `.next`, report the exact build error, and stop. Never advance
  STATE or claim shipped.
- Probe fails: report what the route returned; check `LECG Postgres Local`
  task state (Ctrl+C in a console historically kills it → NextAuth
  "Configuration" error) before suspecting the build.
- Never fabricate deploy evidence. "Deployed" means the probe passed.
