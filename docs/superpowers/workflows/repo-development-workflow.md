# Repo Development Workflow

> **Status:** Durable process doc. Safe to adopt incrementally.
> **Scope:** The end-to-end spine for any non-trivial change in this repo — discovery → plan →
> implement → verify → document. Delegates the *how* to `superpowers:` skills; this file supplies the
> repo-specific bindings (commands, paths, gates, boundaries).
> **Companions:** [`index`](./index.md) · [`testing-verification-workflow`](./testing-verification-workflow.md) ·
> [`surgical-staging-workflow`](./surgical-staging-workflow.md) ·
> [`subagent-development-workflow`](./subagent-development-workflow.md) ·
> [`data-discovery-workflow`](./data-discovery-workflow.md) ·
> [`access-analysis-graph-development`](./access-analysis-graph-development.md) (domain-specific).

## Purpose

Give a future Claude session a single, ordered path from "a request arrives" to "verified work committed
and remembered", wired to this repo's actual tooling, so it never has to re-derive how the project works.

## When to use

- Any feature, refactor, or non-trivial bugfix.
- Whenever you are unsure where a change belongs or how to verify it.
- **Not** for one-line typo fixes or pure doc edits (still obey the staging rules in
  [`surgical-staging-workflow`](./surgical-staging-workflow.md)).

## Required inputs

- The user's request / spec / plan path.
- Current branch + WIP state (`git status`, `git branch --show-current`).
- The relevant memory facts (loaded from `…/memory/MEMORY.md` each session).

## Allowed files

Whatever the task legitimately touches — **established by the plan, not improvised**. Default to the
narrowest set. Doc/workflow tasks: `docs/superpowers/**` only.

## Forbidden files (unless the task is explicitly about them)

This repo has a standing "do-not-touch-casually" list. Treat these as off-limits unless the task names them:

- Another terminal's active work (see [`multiterminal-coordination-workflow`](./multiterminal-coordination-workflow.md)).
- Graph internals: **lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers, graph physics,
  router code.** Changing these needs an explicit mandate and the
  [`access-analysis-graph-development`](./access-analysis-graph-development.md) workflow.
- Root `CLAUDE.md` / `.claude/skills/` — do not introduce these without the user's say-so.
- Pre-existing uncommitted WIP on the branch (see [`surgical-staging-workflow`](./surgical-staging-workflow.md) — baseline-WIP rule).

## Step-by-step process

### 0. Skill check (before anything)
Invoke `superpowers:using-superpowers` mentally: if any skill might apply, invoke it first. Process skills
(brainstorming, debugging) come before implementation skills.

### 1. Discovery (read-only)
- `git status` / `git branch --show-current` / `git rev-list --count deploy..HEAD` — know the baseline.
- Read `…/memory/MEMORY.md` and open the facts relevant to the area.
- Locate the area with `Glob`/`Grep` (not `find`/`rg` in Bash). Read the files you'll change *and their tests*.
- For data/schema-shaped work, run [`data-discovery-workflow`](./data-discovery-workflow.md) **first**.
- **Verify every memory claim against the live tree** — facts reflect when they were written; a named
  file/flag may have moved.

### 2. Brainstorm + plan
- For anything creative/ambiguous: `superpowers:brainstorming` before deciding an approach.
- For a multi-step task: `superpowers:writing-plans` → write a dated plan under `docs/superpowers/plans/`
  using [`templates/phase-plan.md`](./templates/phase-plan.md). Plans use `- [ ]` checkbox tasks and name
  files to touch up front.
- **Stop after the plan if the task said "plan only" / "do not implement until approved."** Many plans in
  this repo are review-gated (e.g. the P5-C plan). Respect that gate.

### 3. Implement
- Use `superpowers:test-driven-development`: failing test → minimal code → green. The repo uses **Vitest**
  (`*.test.ts` beside source) and **fast-check** for property tests.
- For independent task sets, use [`subagent-development-workflow`](./subagent-development-workflow.md).
- One logical change at a time; commit surgically as you go (see step 5).
- Keep scope locked — if you discover adjacent work, note it, don't do it
  ([`templates/scope-creep-detection.md`](./templates/scope-creep-detection.md)).

### 4. Verify
- Run the gates in [`testing-verification-workflow`](./testing-verification-workflow.md).
- Use `superpowers:verification-before-completion` — **evidence before claims**. Never say "done/passing"
  without pasting the command output you ran.

### 5. Stage + commit
- Follow [`surgical-staging-workflow`](./surgical-staging-workflow.md): explicit paths only, never `-A`/`.`,
  always `git diff --cached --name-only` before committing.
- Commit only when the user asks, or when the workflow you're executing says to.

### 6. Document + remember
- Update the relevant `docs/superpowers/` artifact (plan checkboxes, spec, research).
- Propose a memory update with [`templates/memory-update-note.md`](./templates/memory-update-note.md).
  **Ask before writing to `MEMORY.md`** unless the user pre-authorized it.
- Update `.gsd/TECHNICAL_DEBT.md` after completing work (standing repo feedback), if that file is live in
  the working tree.

## Required tests

The standard gate (full detail in [`testing-verification-workflow`](./testing-verification-workflow.md)):

```bash
npm test                              # Vitest unit/integration (excludes e2e)
npx tsc --noEmit -p tsconfig.json     # type gate, 0 errors
npm run test:e2e                      # Playwright on :3100 (when UI/graph touched)
```

## Verification checklist

- [ ] Relevant `superpowers:` skill(s) invoked before acting.
- [ ] Memory facts verified against the live tree.
- [ ] Plan written (and approved, if gated) before code.
- [ ] Tests written first; full suite green.
- [ ] `tsc --noEmit` clean.
- [ ] e2e green (if UI/graph in scope) with node count unchanged unless intended.
- [ ] Staged paths reviewed (`git diff --cached --name-only`); no foreign/WIP files swept in.
- [ ] No forbidden files touched.
- [ ] Docs/plan updated; memory update proposed.

## Commit rules

- Surgical, explicit-path staging only. See [`surgical-staging-workflow`](./surgical-staging-workflow.md).
- Conventional-commit style (`feat(...)`, `docs(...)`, `perf(...)`). Match recent history.
- Never stage another terminal's files or pre-existing baseline WIP.

## Stop conditions

- The task is plan-gated ("do not implement until approved") → stop after the plan.
- A forbidden file is the only way to proceed → stop and surface it.
- A memory fact contradicts the live tree in a way that changes the task → stop and report.
- Tests fail in a way you can't explain → switch to `superpowers:systematic-debugging`, don't paper over it.

## Handoff report template

```
## Handoff — <task>
- Branch: <branch> (<n> ahead of deploy)
- Status: <complete | blocked | plan-only>
- Files changed: <explicit list>
- Tests: npm test <pass/fail>, tsc <0 errors>, e2e <19/19>
- Commits: <hashes + subjects>
- Forbidden-file check: none touched
- Open items / next step: <...>
- Memory proposed: <slug + one line, or none>
```
