# Phase 36 Baseline — Full-Rate Gate Closeout

**Captured:** 2026-07-20

**Status:** PASS — strict time-to-graph and full-rate gates met

**Requirement:** REND-02

## Fixed acceptance contract

- Isolated webpack production build on `:3100` with `NEXT_PUBLIC_ACC_GRAPH_TEST=1`.
- Established `scripts/measure-spatial-graph-baseline.cjs` method, unchanged: five fresh
  authenticated browser contexts, run 1 marked cold, median over all five runs.
- Strict Phase-33 reference: **3,913.7 ms**. No tolerance band and no cherry-picking.
- Exact graph population observed in every recorded run: **22,279 nodes/features**.

## Pre-measurement gates

- `npx tsc --noEmit`: PASS.
- Full Vitest suite: PASS — 339 files passed / 1 skipped; 2,632 tests passed / 1 skipped.
- Direct TEST-01/02/03 + PERF-02 characterization set: PASS — 4 files / 49 tests.
- `node scripts/repo-map/check.cjs`: PASS with the existing 3 dependency warnings and
  248 baseline AST findings; no new architecture regression.
- `acc-dc-graph.spec.ts`: PASS — 16 passed / 8 expected skips on isolated build
  `oOpeuFB9Lt0q0Rtsipt46`.

## Time-to-graph evidence

The unchanged Phase-35 production behavior first measured:

| Run | Time to graph |
|---:|---:|
| 1 (cold) | 4,397.9 ms |
| 2 | 4,325.8 ms |
| 3 | 4,204.4 ms |
| 4 | 4,045.2 ms |
| 5 | 4,150.6 ms |

Median: **4,204.4 ms — FAIL**, 290.7 ms / 7.43% slower than the 3,913.7 ms reference.

Repeated diagnostics then demonstrated material host variance without a corresponding
product change:

| Candidate / condition | Build ID | Median | Result |
|---|---|---:|---|
| Disposable diagnostic build | not retained | 3,918.8 ms | FAIL by 5.1 ms |
| Same diagnostic behavior after competing server stopped | not retained | 3,821.4 ms | PASS |
| Clean unchanged acceptance build | `foKjYtCde0QPmi_5wqMOz` | 4,083.0 ms | FAIL |
| One-frame native-link deferral, validation batch | `oOpeuFB9Lt0q0Rtsipt46` | 3,855.9 ms | PASS |
| Same one-frame build after full gate sweep | `oOpeuFB9Lt0q0Rtsipt46` | 4,285.8 ms | FAIL |
| Atomic one-frame native-link upload | `UIyB1pnr7rE9rwb0d81s8` | 3,919.5 ms | FAIL by 5.8 ms |
| Two-frame native-link upload | `JQOmm835Z88OpdOzYYTDV` | 3,934.8 ms | FAIL by 21.1 ms |

The two fully retained candidate batches were:

- `oOpeuFB9Lt0q0Rtsipt46` validation: 8,027.5 / 3,855.9 / 3,816.6 / 3,908.4 /
  3,708.9 ms — median **3,855.9 ms**.
- The same build after the required full gate sweep: 4,774.2 / 3,956.4 / 4,287.7 /
  4,081.1 / 4,285.8 ms — median **4,285.8 ms**.
- `UIyB1pnr7rE9rwb0d81s8`: 8,959.4 / 4,219.5 / 3,919.5 / 3,751.0 / 3,836.7 ms —
  median **3,919.5 ms**.
- `JQOmm835Z88OpdOzYYTDV`: 9,430.5 / 4,003.1 / 3,786.3 / 3,867.3 / 3,934.8 ms —
  median **3,934.8 ms**.

The clean-build result whose individual run file was overwritten by the unchanged
measurement script is retained here only at its observed 4,083.0 ms median; no missing
per-run values are reconstructed.

## Root-cause finding

The established clock stops when `graphTestBridge.isReady()` sees a physics instance and
non-empty features and `getRenderedNodeCount()` is positive. It does **not** wait for the
native similarity-link upload or final Cosmos render. Therefore the three attempted
link-frame scheduling changes were not causally aligned with this metric. Their pass/fail
crossovers on the same build confirm that the current N=5 result is dominated by run/host
variance near the literal cutoff.

Each scheduling experiment was test-driven and then removed after it failed to establish a
reproducible improvement. The Phase-35 production implementation and its existing test are
restored; `GraphCanvas.test.ts` passes 28/28 and Phase 36 leaves no product-code diff.

## Prior closeout blocker

Plan 36-01 says to stop when the median exceeds 3,913.7 ms, and the locked context forbids
a tolerance band or cherry-picked repeat. The final honest batch is **3,934.8 ms**, so the
full-rate sample, deployment, requirement check-off, and milestone closeout were not run.

At that checkpoint, owner direction was required to choose one of two scope-changing routes:

1. keep the literal N=5 cutoff and authorize a broader profile/optimization phase aimed at
   a margin large enough to survive the observed variance; or
2. revise the acceptance protocol for noisy workshop-machine evidence.

## Authorized optimization and profiling

The owner chose route 1: broaden profiling while retaining the literal 3,913.7 ms cutoff.
Profiling isolated the navigation payload rather than the renderer:

- The original hydrated document decoded to 17,419,976 bytes.
- The heavy `bulkUsers` tRPC result was 14,538,570 bytes for 3,791 users / 22,279
  memberships.
- A normalized graph-only tuple payload measured 5,421,069 bytes, a 62.7% reduction.
- A client-only full-payload experiment was rejected and reverted. Build
  `5lWymVOUF2uM86kD8E9Ud` measured 11,838.2 / 4,178.7 / 3,814.1 / 4,396.8 /
  3,956.6 ms, median **4,178.7 ms — FAIL**. Its request was batched with Gmail work.
- The first SSR compact-payload build `C-XOsMKzacvVZu56YhvMY` measured 9,989.5 /
  3,093.6 / 4,515.5 / 3,287.9 / 4,119.8 ms, median **4,119.8 ms — FAIL**.
- Gzip packing reduced the direct graph snapshot to 1,646,246 bytes and the decoded
  hydrated document to 4,640,554 bytes, but build `0DFqda1inKGLvwbBhmIk-` still measured
  8,985.1 / 2,870.3 / 2,682.2 / 4,328.2 / 4,328.7 ms, median
  **4,328.2 ms — FAIL**.

The remaining correlated source was the default right rail: immediately after graph ready
it eagerly requested `bulkUsers` plus enrichment and directory procedures, producing a
17,606,166-byte background batch. Fresh browser contexts closed before that server work
necessarily finished, so later runs contended with discarded full-directory responses.
The rail now fetches one `bulkUser` only after a node is selected.

## Accepted time-to-graph evidence

Fresh isolated build `tWSXSzfgHWy8ZCQ1BYxT0` first measured from a newly started server:

| Run | Time to graph |
|---:|---:|
| 1 (cold) | 8,708.3 ms |
| 2 | 2,670.7 ms |
| 3 | 2,349.1 ms |
| 4 | 3,131.4 ms |
| 5 | 2,747.2 ms |

Median: **2,747.2 ms — PASS**, 1,166.5 ms / 29.8% faster than the cutoff.

After the full unit, architecture, and graph-E2E sweep, the required final batch on that
same build measured:

| Run | Time to graph |
|---:|---:|
| 1 (cold browser context) | 2,211.5 ms |
| 2 | 2,386.7 ms |
| 3 | 2,389.2 ms |
| 4 | 2,310.3 ms |
| 5 | 2,427.4 ms |

Final median: **2,386.7 ms — PASS**, 1,527.0 ms / 39.0% faster than 3,913.7 ms.
All five runs rendered 22,279 nodes and 22,279 aligned features.

## Accepted full-rate evidence

The Phase-32 gate ran last on the same isolated build and passed 4/4:

- **60.016 fps over 10.014 seconds**.
- 22,279 nodes, all 22,279 animated.
- 18,000 links, `cosmos-native`.
- Tier 0 before and after; the controller did not engage during the accepted sample.
- Reduced motion stayed static; click focus remained functional; grouping morph paused
  ambient motion and resumed cleanly.
