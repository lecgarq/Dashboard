# Template — Subagent Task Brief

> Hand this to a dispatched subagent. Use with
> [`subagent-development-workflow`](../subagent-development-workflow.md). Every field is required; vague
> briefs are how subagents over-reach.

---

## Task: <short title>

**Goal (one sentence):** <the single outcome this subagent must produce>

**Context it needs (don't make it guess):**
- Relevant files to read first: `...`
- Prior decisions it must honor: `...`
- Data facts: <counts/coverage from data-discovery, if relevant>

**Allowed files (EXHAUSTIVE — touch nothing else):**
- `path/a.ts`
- `path/a.test.ts`

**Forbidden files (hard boundary):**
- lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers, graph physics, router
- any file owned by another terminal
- anything not in the allowed list above

**Negative assertions (things that must remain TRUE / unchanged):**
- [ ] Node identity `userId::projectId` unchanged
- [ ] No new DIMENSION_REGISTRY descriptors / sliders / edges / UI
- [ ] No raw data payload shipped (aggregates only)
- [ ] <task-specific negatives>

**Method:** `superpowers:test-driven-development` — failing test first, minimal code, green.

**Required gates before reporting done:**
```bash
npx vitest run <names>
npm test
npx tsc --noEmit -p tsconfig.json
# npm run test:e2e   # only if UI/graph in scope
```

**Commit (surgical, explicit paths only — verify `git diff --cached --name-only` first):**
```bash
git add <explicit paths>
git commit -m "<type>(<scope>): <task>"
```

**Report back (required):**
- Exact files changed
- `git diff --cached --name-only` output
- Gate results with pasted evidence
- Confirmation each negative assertion still holds
- Anything you did beyond the brief (and why) — or "nothing beyond brief"
