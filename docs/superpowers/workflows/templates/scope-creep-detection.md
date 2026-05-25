# Template — Scope-Creep Detection

> Run this when you notice yourself (or a subagent) about to do something the task didn't ask for. Pairs
> with [`subagent-development-workflow`](../subagent-development-workflow.md) and
> [`multiterminal-coordination-workflow`](../multiterminal-coordination-workflow.md).

---

## The test (ask before acting)

For the change you're about to make:

1. **Is it named in the plan / brief / request?** If no → it's creep. Default: don't do it.
2. **Is it in your allowed-files list?** If no → stop.
3. **Is it a forbidden file?** (lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers,
   graph physics, router, another terminal's files) → stop, no exceptions.
4. **Does it change node identity, add a DIMENSION_REGISTRY descriptor, slider, edge, or UI** that wasn't
   requested? → stop.
5. **Would it ship a feature on data you haven't counted?** → stop; run
   [`data-discovery-workflow`](../data-discovery-workflow.md) first.

If any answer says stop, you have creep.

## Common creep patterns seen in this repo

- A subagent "tidying" adjacent code while implementing a narrow task.
- A plan step that quietly contradicts a prior decision (the executor implements it faithfully → bug).
  Catch it at review, not after.
- Auto-creating a layout target by adding a registry descriptor as a side effect (the standing P5 trap).
- "While I'm here" refactors of forbidden graph internals.
- Running tree-wide commands (`build`, format-on-save, `git add -A`) that rewrite files outside scope.

## What to do with detected creep

| Situation | Action |
|-----------|--------|
| Not yet done | Don't do it. Note it as a follow-up. |
| Already done by you | Decide: keep + document why, or revert **only** the extra (surgically). |
| Already done by a subagent | Re-verify the diff; revert the out-of-scope part; report it. |
| It's actually necessary | Stop and ask the user to expand scope before proceeding. |

## Record

```
## Creep note — <task>
- Detected: <what>
- In plan/brief? <no>
- Decision: <not done | kept because... | reverted>
- Follow-up filed: <where, or none>
```
