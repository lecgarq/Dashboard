# Multi-Terminal Coordination Workflow

> **Status:** Durable process doc.
> **Scope:** How two or more concurrent Claude terminals share one working tree without colliding.
> Also the home for scope-control across terminals.
> **Companions:** [`index`](./index.md) · [`surgical-staging-workflow`](./surgical-staging-workflow.md) ·
> [`subagent-development-workflow`](./subagent-development-workflow.md).

## Purpose

When multiple terminals operate on the **same branch and working tree** at once, the only thing preventing
corruption is a clear ownership map and disciplined staging. This workflow defines both.

## When to use

- Any time you are told "you are Terminal Tn" or that another terminal is active.
- Before touching a file you didn't create, when concurrent work is possible.

## Required inputs

- Your terminal identity (e.g. T1, T2).
- The **ownership map**: which files/areas each terminal owns this session.
- The explicit forbidden list given to you.

## Ownership model

- **Each terminal owns a disjoint set of files/areas.** You may read anything, but you only **write** what
  you own.
- **Shared tree, no isolation by default.** Both terminals see each other's uncommitted edits in
  `git status`. That is expected; it is not yours to stage.
- If true isolation is needed for a risky change, prefer a git worktree
  (`superpowers:using-git-worktrees`) — but coordinate first; don't fork the tree unilaterally.

### Worked example (the split in effect at authoring time)

| Terminal | Owns | Must NOT touch |
|---|---|---|
| **T1** | P5-C AccActivity work: `activityAggregate`, `acc-hot-cache` activity query, `dcUserAssembly` activity plumbing, `acc-dc-graph` activity flag, `graphTables` activity columns, `featureSnapshot` activity fields, `AccessAnalysisShell` `includeActivityMix`, P5-C tests/e2e | T2's docs |
| **T2** | `docs/superpowers/workflows/**` (this package) | Any runtime code; all P5-C files; lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers, graph physics, router |

## Step-by-step process

1. **Confirm your identity and ownership** at the start. Write it down (in your plan/notes).
2. **Read the forbidden list** and treat it as hard boundaries — these double as scope-control
   ([`templates/scope-creep-detection.md`](./templates/scope-creep-detection.md)).
3. **Before editing any file, ask: do I own this?** If not, stop — even if it's a one-line "obvious" fix.
4. **Stage only your files.** Use [`surgical-staging-workflow`](./surgical-staging-workflow.md). The other
   terminal's edits will appear in `git status`; never `git add` them, never revert them.
5. **Don't commit the other terminal's work**, even accidentally — `git diff --cached --name-only` is the
   guard.
6. **Avoid global, tree-wide commands** while another terminal is active: no `npm run build` that rewrites
   generated files, no formatter-on-save across the repo, no `git add -A`, no branch switches.
7. **Hand off** with a report that states exactly which files you changed, so the other terminal can
   reconcile.

## Required tests

Run only the gates relevant to **your** files. Avoid full-tree operations that could interfere with the
other terminal's in-flight work unless you've coordinated. Doc-only work (T2 here) runs no app tests; see
the lint note in [`testing-verification-workflow`](./testing-verification-workflow.md).

## Verification checklist

- [ ] Terminal identity + ownership map recorded.
- [ ] Every file I wrote is one I own.
- [ ] No forbidden/foreign files edited.
- [ ] Staged set (`git diff --cached --name-only`) contains only my owned files.
- [ ] No tree-wide/destructive command that could disrupt the other terminal.
- [ ] Handoff lists my exact changes.

## Commit rules

- Explicit-path staging only ([`surgical-staging-workflow`](./surgical-staging-workflow.md)).
- One terminal's commit must never contain another terminal's files.
- Coordinate message scopes so history stays readable (`docs(superpowers): ...` vs `feat(acc-graph): ...`).

## Stop conditions

- A task would require editing a file another terminal owns → stop, report, request a boundary change.
- The other terminal's uncommitted edits block your change → stop and coordinate; do not work around by
  reverting their work.
- The ownership map is unclear or overlapping → stop and ask before writing anything.

## Handoff report template

```
## Terminal <Tn> handoff
- Owned this session: <areas/files>
- Files I changed: <explicit list>
- Files I deliberately did NOT touch (forbidden/owned by others): <list>
- Staged set: <git diff --cached --name-only output>
- Cross-terminal note: <anything the other terminal must know>
```
