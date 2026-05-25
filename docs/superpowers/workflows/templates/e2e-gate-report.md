# Template — E2E Gate Report

> Record of the Playwright regression gate. Use with
> [`testing-verification-workflow`](../testing-verification-workflow.md) Gate 3.

---

## E2E gate — <task> — <date>

**Command:** `npm run test:e2e` (Playwright, server on **:3100**, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`)

| Metric | Expected | Actual |
|--------|----------|--------|
| Tests passing | 19/19 | <...> |
| Graph node count (`n`) | 16942 (unless intended) | <...> |
| Cold `bulkUsers` response | record baseline | <ms> |
| Failing specs | none | <names or none> |

### Renderer assertions (if graph touched — see access-analysis-graph-development §5)
- [ ] 2D colors — `getColorStats()` signature changes when color mode changes
- [ ] 3D colors — instance colors applied, not all-white
- [ ] Edges render — `getRendererState()` link count > 0 in 2D and 3D; per-layer toggles reflected
- [ ] Lasso — selection dims non-selected via mask, not physics
- [ ] Mode parity — 2D↔3D preserves node/edge counts and color semantics
- [ ] Diagnostics overlay matches bridge values (no devtools needed)

### Node-count drift note
DC ingest can shift counts legitimately. If `n` changed: <was it data drift or a regression? evidence>.
Keep the assertion tolerant of ingest drift but **not** of identity/data regressions.

### Evidence
```
<pasted Playwright summary line(s)>
```

### Verdict
- [ ] PASS — gate green, safe to proceed
- [ ] FAIL — <reason; do not commit on red>
