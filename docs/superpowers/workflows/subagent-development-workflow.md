# Subagent-Driven Development Workflow

> **Status:** Durable process doc.
> **Scope:** Dispatching subagents to execute plan tasks, and the scope-control discipline that keeps them
> from overreaching. Binds `superpowers:subagent-driven-development` and
> `superpowers:dispatching-parallel-agents` to this repo's guardrails.
> **Companions:** [`index`](./index.md) · [`repo-development-workflow`](./repo-development-workflow.md) ·
> [`surgical-staging-workflow`](./surgical-staging-workflow.md) ·
> [`testing-verification-workflow`](./testing-verification-workflow.md).

## Purpose

Subagents are powerful but **start cold and tend to over-reach** — they touch files outside scope, leave
uncommitted mess, and a plan can even encode a decision-contradicting bug they'll faithfully implement.
This workflow makes their output trustworthy by bracketing each dispatch with explicit scope and a
post-dispatch verification of the git tree.

## When to use

- Executing an approved plan with independent tasks in the current session
  (`superpowers:subagent-driven-development`).
- 2+ genuinely independent tasks with no shared state (`superpowers:dispatching-parallel-agents`).
- **Not** when the user just asked a question or for a single small edit — do it inline.

## Required inputs

- An **approved** plan (review-gated plans must be approved first — see
  [`repo-development-workflow`](./repo-development-workflow.md) step 2).
- A precise task brief per subagent ([`templates/subagent-task-brief.md`](./templates/subagent-task-brief.md)).
- The allowed-files and forbidden-files lists for each task.

## Allowed files

Exactly the files named in the task brief. The brief must enumerate them; "and related files" is not allowed.

## Forbidden files

The standing graph internals (lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers, graph
physics, router), any other terminal's files, and anything outside the brief's allow-list.

## Step-by-step process

1. **Plan first.** Never dispatch without an approved plan. The plan names files per task and the commit
   message per task.
2. **Write a tight brief** for each subagent using
   [`templates/subagent-task-brief.md`](./templates/subagent-task-brief.md). Include: goal, allowed files
   (exhaustive), forbidden files, required tests, commit message, and explicit **negative assertions**
   ("do NOT add registry descriptors", "do NOT change node identity", etc.).
3. **Check the plan for decision-contradicting bugs** before dispatch. A plan step can contradict a
   prior decision; the subagent will implement it verbatim. Catch it now.
4. **Dispatch.** For parallel work, ensure tasks are truly independent (no shared file writes).
5. **On return, re-verify — do not trust the subagent's self-report:**
   ```bash
   git status --short                 # did it leave uncommitted mess or touch extra files?
   git diff --cached --name-only      # did it stage anything foreign?
   ```
   Confirm it changed **only** the brief's files. Assert the **negative cases** the brief specified.
6. **Re-run the gates yourself** ([`testing-verification-workflow`](./testing-verification-workflow.md)) —
   `npm test`, `tsc --noEmit`, and e2e if UI/graph. A subagent saying "tests pass" is not evidence.
7. **Stage surgically** ([`surgical-staging-workflow`](./surgical-staging-workflow.md)) and commit per the
   plan's per-task message, unless the subagent already committed exactly as specified (verify the hash and
   the staged set match).
8. **Reconcile scope.** If the subagent did extra work, decide deliberately: keep (and document) or revert
   (carefully, only the extra). Record any creep with
   [`templates/scope-creep-detection.md`](./templates/scope-creep-detection.md).

## Required tests

The same gates as everything else, run **by you** after the subagent returns — not delegated trust. See
[`testing-verification-workflow`](./testing-verification-workflow.md).

## Verification checklist

- [ ] Plan approved before dispatch.
- [ ] Brief enumerates exact allowed files + explicit forbidden files + negative assertions.
- [ ] Plan checked for decision-contradicting steps.
- [ ] Parallel tasks confirmed independent (no shared writes).
- [ ] Post-return `git status` / `git diff --cached` reviewed — only brief's files touched.
- [ ] Negative cases asserted (the things that should NOT have changed).
- [ ] Gates re-run by me, output captured.
- [ ] Scope creep handled deliberately and documented.

## Commit rules

- Surgical, explicit-path, per-task messages from the plan.
- If a subagent committed, verify the commit's staged set before trusting it; amend/split only via safe,
  non-destructive means.
- Never let a subagent's commit carry baseline WIP or another terminal's files.

## Stop conditions

- Subagent touched a forbidden file → stop, revert that change, report.
- Subagent's diff doesn't match its report → stop, investigate before committing.
- Gates fail after the subagent claimed success → `superpowers:systematic-debugging`.
- The plan step itself looks wrong → stop; fix the plan before re-dispatching.

## Handoff report template

```
## Subagent dispatch — <task>
- Brief: <link/summary>
- Subagent reported: <summary of its claims>
- Actual git diff --cached --name-only: <pasted>
- Scope check: only brief files touched? <yes/no — details>
- Negative assertions verified: <list>
- Gates (re-run by me): npm test <...>, tsc <...>, e2e <...>
- Commit: <hash> <subject>
- Creep handled: <none | kept X because... | reverted Y>
```
