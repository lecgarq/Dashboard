---
phase: 27-layout-engine-force-anchor-revival-reheat-guard
verified: 2026-07-15
status: passed
requirements: [LAY-01, LAY-02, LAY-03, LAY-04, PERF-02]
---

# Phase 27 Verification — Layout Engine and Reheat Guard

## Outcome

Phase 27 is implemented, locally deployed, and passes the focused unit, type,
architecture, production-build, authenticated Playwright, and browser gates. The live
flag-off graph now starts at exact similarity, morphs organically through the strongest
active dimension, and cannot accidentally reheat the frozen Cosmos simulation.

## Requirement audit

| Requirement | Status | Evidence |
|---|---|---|
| LAY-01 | PASS | The live static layer consumes catalog anchor targets; authenticated production browser evidence showed the visible graph canvas changed between General and Role after the 600 ms transition. Product commits: `67d57fc5`, `1e5073ff`. |
| LAY-02 | PASS | `staticLayer.ts` retains targets/weights and exposes lazy target registration; `AccessAnalysisShell.tsx` passes the computed structural maps into the flag-off render path and registers generated action targets on Dimensions activation. Focused static-layer and embedding-seam tests passed. |
| LAY-03 | PASS | `clusterTransitionLayer.ts` uses a 600 ms workshop transition and settles immediately for reduced motion. Timing and seam tests passed; authenticated browser comparison waited 700 ms and observed the settled canvas change. |
| LAY-04 | PASS | `catalogAnchorTarget` uses the strongest positive dimension, deterministic catalog-order ties, weighted anchors, and an organic similarity residual. Exact-zero, strongest-wins, tie, and no-grid regression tests passed. |
| PERF-02 | PASS | The frozen-handle invariant covers `applySliders`, `setClustering`, `setClusters`, and `setClusterPositions` and proves zero simulation starts, reseeds, cluster-position writes, anchor writes, or config mutations when `gpuSimulation:false`. Product commit: `4cb001be`. |

## Verification gates

- Final focused Vitest — PASS, 13 files / 110 tests covering grouping, controls, toolbar,
  lazy catalog, static layout, transitions, graph canvas, graph nodes, embedding seam,
  slider state, and dimension coverage.
- `npx tsc --noEmit` — PASS.
- `node scripts/repo-map/check.cjs` — PASS; baseline warnings remain 2 dependency warnings /
  236 AST findings.
- Impeccable detector over the final UI — no Phase 27 findings. One pre-existing warning
  remains at `ComplianceScanPanel.tsx:320` (`text-indigo-400` on a heading), outside the
  changed spatial-graph surface.
- `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/catalog-preview-lazy.spec.ts --config playwright.verify.config.ts` — PASS, 1 test in 12.6 s.
- Authenticated browser gate — PASS: General exact zero after reload; 22,279 membership nodes /
  3,791 distinct people; exactly 11 ordered primary options; Role at 60 with 16,783 / 22,279
  membership coverage; 208 Dimensions rows with 98 unavailable; `Issue Create` at 100 with
  234 / 22,279 coverage; no console warnings/errors.
- Visible-canvas comparison — PASS: General and Role screenshot hashes differed after 700 ms.

## Deployment

- Deployed: `2026-07-15T13:39:54-06:00`.
- Build: `.next/BUILD_ID` `kZKWbfeAqYW1R4bYrUx2U`.
- `npx tsc --noEmit` then `npm.cmd run build` — PASS; Next.js 16.2.10 production build.
- `LECG Dashboard Local` — `Running`; port 3000 listening.
- Authenticated production route and production Playwright gate — PASS.
- The browser was reset to General at exact zero for handoff.

## Decisions and deviations

- Strongest active dimension wins; catalog order breaks ties. The layout never uses a grid.
- Group/Color transfers seed 60 strength; catalog sliders remain independent and intentional.
- Action dimensions remain lazy. Their targets and coverage are derived from the loaded
  snapshot only when Dimensions opens.
- No new scrape was needed: the existing access-analysis snapshot and embeddings were
  sufficient for this phase.

## Remaining VERIFY

- Phase 28 must measure the one-time first-Dimensions target-build cost and complete the
  milestone's first-paint comparison. Phase 27 proves functional responsiveness, not an
  isolated main-thread hitch budget.
- No owner visual-approval claim is made; the authenticated functional and screenshot-hash
  evidence above is the recorded browser proof.
