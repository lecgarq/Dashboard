# Template — Review Checklist

> For self-review before claiming done, or when running `superpowers:requesting-code-review` /
> `superpowers:receiving-code-review`. Tick every box with evidence, not optimism.

---

## Review — <task / PR>

### Correctness
- [ ] Does what the request/plan asked — no more, no less.
- [ ] Edge cases handled (empty, null, unknown, sentinel values like `projectId = ''`).
- [ ] No silent failures / swallowed errors (fallbacks are deliberate and logged, not masking bugs).

### Data honesty
- [ ] Every dimension/edge/chart/flag backed by a real, counted source field.
- [ ] Counts match the discovery inventory (e.g. nodes 16,942; internal 1,265) or the drift is explained.
- [ ] No raw data payloads shipped where an aggregate was specified.

### Tests
- [ ] New behavior has a test, written first where practical.
- [ ] `npm test` green; `npx tsc --noEmit` 0 errors; `npm run test:e2e` 19/19 if UI/graph.
- [ ] No test/fixture weakened to hide a regression.

### Scope & boundaries
- [ ] Forbidden files untouched (lasso, camera, nav/routes, `UserDetailPanel`, renderers, edge layers,
      graph physics, router).
- [ ] No node-identity change unless intended.
- [ ] No unrequested DIMENSION_REGISTRY descriptors / sliders / edges / UI.
- [ ] No other-terminal files touched.

### Staging & commits
- [ ] `git diff --cached --name-only` reviewed — only this task's files.
- [ ] No baseline WIP or deletions swept in.
- [ ] Conventional commit message matching repo history.

### Types & consistency
- [ ] Shared types defined once and reused (no import cycles).
- [ ] Determinism preserved where required (same input ⇒ same output/cache key).

### Docs & memory
- [ ] Plan checkboxes / spec / research updated.
- [ ] `.gsd/TECHNICAL_DEBT.md` updated if live and relevant.
- [ ] Memory update proposed (asked before writing to `MEMORY.md`).

### Receiving feedback (if applicable)
- [ ] Each suggestion evaluated technically, not accepted/rejected performatively
      (`superpowers:receiving-code-review`).
- [ ] Disagreements backed by verification, not assertion.
