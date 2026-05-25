# Testing & Gates

> What proves the code works, and how to run it. Mirrors the process in
> [`../workflows/testing-verification-workflow.md`](../workflows/testing-verification-workflow.md); this map
> is the subsystem-level "what each gate proves" reference.

## The three gates

| Gate | Command | Proves | When |
|------|---------|--------|------|
| Unit / integration | `npm test` (`vitest run --exclude "**/tests/e2e/**"`) | Pure logic, assembly, snapshot, dimension/target/color math, cache behavior | Always before done |
| Types | `npx tsc --noEmit -p tsconfig.json` | No type regressions across the tree | Always before done |
| End-to-end | `npm run test:e2e` (`playwright test`) | The real WebGL graph renders, lays out, colors, edges, and counts correctly in a browser | When UI/graph touched |

Focused unit run: `npx vitest run <name>` (e.g. `npx vitest run featureSnapshot dcUserAssembly`).
Interactive e2e: `npm run test:e2e:ui`.

## Unit tests (Vitest)

- Co-located `*.test.ts(x)` beside source, plus `__tests__/` dirs. **fast-check** for property tests.
- Notable specializations:
  - `mathLayer.purity.test.ts`, `physicsLayer.purity.test.ts` — pure-function invariants (no NaN,
    determinism, blend sanity).
  - `physicsClustering.test.ts` — clustering ratio monotonic across a slider sweep (uses
    `layoutStats.computeClusteringRatio`).
  - `acc-dc-graph.test.ts` — router flag behavior, incl. `includePermissionSummary` (`:119`) and
    `includeActivityMix` aggregates "via groupBy (no raw rows)" (`:150`).
  - `acc-hot-cache.test.ts` — cache paths per flag (`:93`).
  - `featureTargets.test.ts`, `nodeColors`/`chartColors.test.ts`, `dataLayer.test.ts`,
    `internalDomains.test.ts`, `sameUserEdges.test.ts`, `linkEmphasis.test.ts`, `dimensionWeights.test.ts`.
- Baseline at authoring: **~952 unit tests** green (per prior phase records).

## E2E tests (Playwright)

- Single spec: **`tests/e2e/acc-dc-graph.spec.ts`** — **19 tests** (confirmed by count).
- **Dedicated server on :3100** (`playwright.config.ts:14`, `E2E_PORT ?? "3100"`), started by the suite's
  `webServer` (`next dev --webpack --port 3100`), **not** the always-on :3000. Env
  **`NEXT_PUBLIC_ACC_GRAPH_TEST=1`** (`:44`) so the graph installs the test bridge. Auth via a minted
  NextAuth cookie.
- **`EXPECTED_NODE_COUNT = 16_942`** (`spec:7`) asserted exactly — bump only when the dataset genuinely
  changes; an unexplained drop is a data/identity regression.
- Drives the **real browser** (`page.mouse.*`) against cosmos.gl / three.js; falls back to the bridge's
  faithful handler invocation only if a WebGL hit-test misses.

## graphTestBridge — why e2e needs it

The graph is a single WebGL `<canvas>` with **no per-node DOM**, so Playwright can't query nodes. The
bridge **`window.__ACC_GRAPH_TEST__`** (`graphTestBridge.ts`, flag-gated) exposes the live render state:
`getRenderedNodeCount`, `getFeatureCount`, `getPositionsStats` (incl. `anyNaN`), `getLayoutStats`
(x/y/zRange), `getClusteringScore(dim)`, `getColorMode`, `getColorStats`, `getMode`, `getFrozen`. This is
the only honest way to assert "what rendered" — and it's why **no manual devtools check is ever required**.
See [access-analysis-graph](./access-analysis-graph.md) §4.

## What each gate proves (and doesn't)

- **Unit** proves the *pure logic* (folding, targets, colors, cache keys). It does **not** prove the WebGL
  pipeline renders.
- **tsc** proves *type wiring* across files. It does **not** prove runtime behavior.
- **e2e** proves the *integrated graph* (data → layout → render → interaction) and the node count. It is
  the only gate that exercises the renderers and the bridge.

## Targeted vs full

- **While iterating:** `npx vitest run <files>` for the unit(s) you're changing.
- **Before claiming done:** full `npm test` (focused runs hide cross-file breakage) + `tsc --noEmit`, plus
  `npm run test:e2e` if anything UI/graph/data-pipeline changed.
- **Doc-only changes (this package):** no app tests apply; there is **no markdown/docs lint script** in
  `package.json` (only `npm run lint` = eslint, `npm run knip` = dead-exports). So docs work runs nothing.

## Known expensive / slow

- **e2e** boots a full Next dev server on :3100 and runs a real browser — slowest gate; the `webServer`
  boot has a long timeout. The **cold `bulkUsers`** request (with `includeActivityMix`) runs the grouped
  `AccActivity` scan once per cache version (~218 ms measured; not a millions-row table) — watch it but it's
  well under budget.
- **Mosaic/DuckDB chart tests** (`*Vgplot*`, `Mosaic*`, `duckdbClient.browser.test.ts`) spin up
  DuckDB-WASM and are heavier than pure-logic tests.

## Verdict discipline

Never claim a gate passed without pasting the command output
(`superpowers:verification-before-completion`). Record e2e runs with
[`../workflows/templates/e2e-gate-report.md`](../workflows/templates/e2e-gate-report.md).
