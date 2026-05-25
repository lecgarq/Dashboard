# Testing & Verification Workflow

> **Status:** Durable process doc.
> **Scope:** The repo's verification gates — unit/integration (Vitest), types (tsc), and e2e (Playwright).
> Covers both the "before I claim done" gate and the regression/e2e gate.
> **Companions:** [`index`](./index.md) · [`repo-development-workflow`](./repo-development-workflow.md) ·
> [`access-analysis-graph-development`](./access-analysis-graph-development.md) (renderer-regression detail).

## Purpose

Define exactly what "verified" means here so no session claims success without evidence. Wires
`superpowers:verification-before-completion` to this repo's concrete commands.

## When to use

- Before claiming any work is complete, fixed, or passing.
- Before staging/committing.
- Before opening a PR or finishing a branch.
- After a subagent reports done (re-verify; subagents over-claim — see
  [`subagent-development-workflow`](./subagent-development-workflow.md)).

## Required inputs

- The set of files changed (to scope which gates apply).
- Whether the change touches UI / the access-analysis graph (decides if e2e is required).

## Allowed files

Test files (`*.test.ts`, `tests/e2e/**`) and the source under test. No production behavior changes while
"only making tests pass" — fix the code or the test honestly.

## Forbidden files

Do not edit e2e fixtures or assertions to mask a real regression. A node-count assertion that drops is a
signal, not a nuisance.

## The gates

### Gate 1 — Unit / integration (Vitest)
```bash
npm test                 # = vitest run --exclude "**/tests/e2e/**"
# focused:
npx vitest run <name>    # e.g. npx vitest run activityAggregate dcUserAssembly
```
- Tests live beside source as `*.test.ts`. Property tests use **fast-check**.
- Baseline at last check: **952+ unit tests green**. New work only adds.

### Gate 2 — Types (tsc)
```bash
npx tsc --noEmit -p tsconfig.json     # must be 0 errors
```
- Treat any new type error as a failure even if tests pass.

### Gate 3 — End-to-end / regression (Playwright)
```bash
npm run test:e2e         # = playwright test
npm run test:e2e:ui      # interactive
```
- Runs against **:3100** (a dedicated test server, **not** the always-on :3000), with
  `NEXT_PUBLIC_ACC_GRAPH_TEST=1` and a minted NextAuth cookie. Config: `playwright.config.ts`.
- Baseline at last check: **19/19**.
- For graph work, assertions go through the in-app `graphTestBridge` (`getColorStats`,
  `getRendererState`, etc.) — see [`access-analysis-graph-development`](./access-analysis-graph-development.md)
  §5 for the renderer-regression specifics (2D/3D colors, edges, lasso, mode parity, diagnostics overlay).

### Lint (optional)
```bash
npm run lint             # eslint — run if the change is lint-relevant
npm run knip             # dead-code/exports — run if you added/removed exports
```
There is **no markdown/docs lint script** in `package.json`; doc-only changes skip lint.

## Step-by-step process

1. Scope the gates: code change → Gates 1+2; UI/graph change → Gates 1+2+3.
2. Run the focused Vitest file(s) for fast feedback while iterating.
3. Run the **full** `npm test` before claiming done (focused runs hide cross-file breakage).
4. Run `tsc --noEmit`. Zero errors required.
5. If UI/graph: run `npm run test:e2e`; confirm **19/19** and the node count is unchanged unless the change
   intends to change it (DC ingest drift can shift counts — keep assertions tolerant, per
   [`access-analysis-graph-development`](./access-analysis-graph-development.md) §5 gate).
6. Capture the actual output. Paste it into your report — claims without output are not acceptable
   (`superpowers:verification-before-completion`).

## Required tests

Whatever the change implies, plus: never reduce coverage. New behavior ⇒ new test (preferably written
first via `superpowers:test-driven-development`).

## Verification checklist

- [ ] Full `npm test` run (not just focused) — green.
- [ ] `npx tsc --noEmit -p tsconfig.json` — 0 errors.
- [ ] `npm run test:e2e` — 19/19 (if UI/graph touched).
- [ ] e2e node count unchanged unless intentionally changed (and explained).
- [ ] No test/fixture weakened to hide a regression.
- [ ] Output captured for the report.

## Commit rules

Do not commit on red. If a pre-existing failure is unrelated to your change, say so explicitly with
evidence; do not silently absorb it. Use the [`templates/e2e-gate-report.md`](./templates/e2e-gate-report.md)
for the e2e record.

## Stop conditions

- A gate fails and the cause is unclear → `superpowers:systematic-debugging`.
- e2e node count changed unexpectedly → stop; this usually means a data/identity regression.
- The only way to "pass" is to weaken a test → stop and surface it.

## Handoff report template

```
## Verification — <task>
- npm test: <PASS n tests | FAIL ...>
- tsc --noEmit: <0 errors | n errors>
- npm run test:e2e: <19/19 | n/19 — failing: ...>
- e2e node count: <16942 | changed to X because ...>
- Lint/knip (if run): <result>
- Evidence: <pasted key lines>
```
