# Surgical Staging & WIP Protection Workflow

> **Status:** Durable process doc. **Rigid** — follow exactly; do not relax the discipline.
> **Scope:** How to stage and commit on this branch without sweeping in foreign or baseline WIP. Also
> covers WIP protection (not destroying pre-existing uncommitted work).
> **Companions:** [`index`](./index.md) · [`repo-development-workflow`](./repo-development-workflow.md) ·
> [`multiterminal-coordination-workflow`](./multiterminal-coordination-workflow.md).

## Why this exists

The working branch (`feat/access-analysis-redesign`, hundreds of commits ahead of `deploy`) carries a
**large amount of uncommitted, pre-existing WIP** — tracked-file modifications and deletions (e.g. the
`.gsd/` tree) that are **not yours** and must not ride along in your commits. Two standing hazards:

1. **Bulk staging** (`git add -A` / `git add .`) sweeps the entire baseline WIP into your commit.
2. **The staging index hazard** — files can already be staged in the index *before you start*. An
   explicit-path commit still includes anything previously `git add`-ed.

## When to use

Every time you stage or commit anything on this branch. No exceptions.

## Required inputs

- The exact list of files **you** created/changed for the current task.
- A clear baseline: what was already modified/deleted/staged before you began.

## Allowed operations

- `git add <explicit path>` — one path at a time, only your files.
- `git diff --cached --name-only` — the mandatory pre-commit check.
- `git status --short`, `git diff`, `git log` — read-only inspection.

## Forbidden operations

- ❌ `git add -A`, `git add .`, `git add -u`, `git commit -a`.
- ❌ `git checkout -- <path>`, `git restore`, `git reset --hard`, `git clean` on baseline WIP — these
  **destroy the user's uncommitted work**. Never "tidy" the tree.
- ❌ Staging another terminal's files (see
  [`multiterminal-coordination-workflow`](./multiterminal-coordination-workflow.md)).
- ❌ Committing deletions of files you didn't delete (the `.gsd/` deletions are baseline, not yours).

## Step-by-step process

1. **Snapshot the baseline before you start.**
   ```bash
   git status --short
   git diff --cached --name-only     # what is ALREADY staged (the index hazard)
   ```
   If files are already staged that aren't yours, note them — you'll need to unstage *only those* before
   committing, or stage into a clean index deliberately.

2. **Do your work.** Make changes only to your task's files.

3. **Stage by explicit path, one at a time.**
   ```bash
   git add path/to/your/file.ts
   git add path/to/your/file.test.ts
   ```
   Quote paths with parentheses/spaces (Windows PowerShell + Next.js route groups):
   ```bash
   git add "app/(dashboard)/users/access-analysis/featureSnapshot.ts"
   ```

4. **MANDATORY pre-commit verification.**
   ```bash
   git diff --cached --name-only
   ```
   Read every line. It must contain **exactly** your task's files — nothing else. If a foreign or baseline
   file appears, unstage it:
   ```bash
   git restore --staged path/that/should/not/be/here   # unstages only; does NOT touch the working copy
   ```
   (`git restore --staged` is safe — it only updates the index. The destructive form is `git restore`
   *without* `--staged`, which reverts file contents. Never use that on baseline WIP.)

5. **Commit** with a conventional message matching recent history.
   ```bash
   git commit -m "feat(acc-graph): <what changed>"
   ```

6. **Re-check** `git status --short` — the baseline WIP should still be present and untouched.

## Required tests

Gates from [`testing-verification-workflow`](./testing-verification-workflow.md) must be green **before**
the commit. Do not commit on red.

## Verification checklist

- [ ] Baseline + already-staged files snapshotted before work.
- [ ] Only explicit-path `git add` used (no `-A`/`.`/`-u`/`-a`).
- [ ] `git diff --cached --name-only` reviewed — contains only my task's files.
- [ ] No baseline WIP / deletions / foreign-terminal files staged.
- [ ] No destructive restore/checkout/reset/clean run on baseline WIP.
- [ ] Post-commit `git status` shows baseline WIP intact.

## Commit rules

- One logical change per commit.
- Explicit paths only; verify the cached set every single time.
- Commit only when the user asks or the active workflow instructs.
- Match the existing message convention (`feat`/`fix`/`docs`/`perf` + scope).

## Stop conditions

- `git diff --cached` shows files you can't account for → stop, unstage, re-verify. Do not commit "to be
  safe" — an over-broad commit on this branch is hard to unwind.
- You'd need a destructive git command to proceed → stop and ask.

## Handoff report template

```
## Staging — <task>
- Files staged (explicit): <list>
- git diff --cached --name-only: <pasted — must equal the list above>
- Baseline WIP after commit: intact (n files still modified/deleted, unchanged)
- Commit: <hash> <subject>
```
