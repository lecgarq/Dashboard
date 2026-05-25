# Template — Final Task Report

> The report you give the user when work is complete (or stopped). Use with
> `superpowers:verification-before-completion` — **every claim carries evidence**.

---

## <Task name> — <Complete | Blocked | Plan-only>

### What changed
- <plain-language summary of the outcome>

### Files
| File | Change | New/Modified |
|------|--------|--------------|
| `...` | <what> | New / Modified |

(Explicit list only — matches `git diff --cached --name-only` at commit time.)

### Tests & verification (evidence, not claims)
- `npm test`: <PASS — n tests | FAIL — ...>
- `npx tsc --noEmit -p tsconfig.json`: <0 errors | n>
- `npm run test:e2e`: <19/19 | n/19 — failing: ...> (or "n/a — no UI/graph change")
- e2e node count: <16942 unchanged | changed to X because ...>
- Key output:
  ```
  <pasted lines proving the above>
  ```

### Scope check
- Forbidden files touched: **none** (lasso/camera/nav/UserDetailPanel/renderers/edges/physics/router untouched)
- Other-terminal files touched: **none**
- Beyond-scope work: <none | kept X because... | reverted Y>

### Commits
- `<hash>` <subject>

### Boundaries respected
- [ ] No runtime code changed (if doc-only task)
- [ ] No baseline WIP staged
- [ ] No destructive git commands

### Open items / next step
- <what remains, or "none">

### Memory proposed (ask before writing)
- <slug> — <one-line hook> | none
