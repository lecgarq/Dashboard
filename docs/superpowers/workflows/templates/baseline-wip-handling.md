# Template — Baseline-WIP Handling

> Use at the **start** of any session on `feat/access-analysis-redesign` (or any branch carrying large
> uncommitted WIP). Pairs with [`surgical-staging-workflow`](../surgical-staging-workflow.md).

---

## Why this matters

This branch carries a large amount of **pre-existing uncommitted WIP that is not yours** — modified tracked
files and deletions (e.g. the `.gsd/` tree). Any bulk `git add` or destructive cleanup will corrupt or
destroy the user's work. The rule: **observe it, never absorb it, never revert it.**

## Baseline snapshot (fill at session start)

```bash
git status --short
git diff --cached --name-only     # the staging-index hazard: what's ALREADY staged before you began
git branch --show-current
git rev-list --count deploy..HEAD
```

| Item | Value |
|------|-------|
| Branch | <...> |
| Commits ahead of deploy | <...> |
| Pre-existing modified files (count) | <...> |
| Pre-existing deletions (count) | <...> |
| **Already-staged files (must not commit unless mine)** | <list or none> |

## Rules

1. **Never** `git add -A` / `git add .` / `git add -u` / `git commit -a`.
2. **Never** `git restore` (without `--staged`), `git checkout -- <path>`, `git reset --hard`, or
   `git clean` on baseline WIP — these destroy the user's uncommitted work.
3. If files are already staged that aren't yours, unstage **only those**:
   `git restore --staged <path>` (index-only, safe).
4. Stage your work by **explicit path only**, then verify `git diff --cached --name-only` shows **only**
   your files before committing.
5. After committing, confirm the baseline WIP is still present and unchanged (`git status --short`).

## Note on deletions

The `.gsd/` deletions in `git status` are **baseline** — they were removed before your session (the GSD
planning tree was archived to `docs/archive/planning/`). Do **not** stage these deletions and do **not**
restore the files; they're not part of your task.

## Session-end check

- [ ] My commits contain only my files.
- [ ] All baseline WIP still present and untouched.
- [ ] No destructive git command was run.
