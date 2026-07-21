# 39-03 SUMMARY — Instance path retirement sweep (ACT-03)

**Completed:** 2026-07-21

## What was deleted (32 files, git rm)

- **Router chain:** acc-dc-graph.ts pruned to exactly `dataVersion` /
  `bulkUsers` / `bulkUser` (graphSnapshot, instanceEmbedding,
  instanceNeighbors, similarityEdges removed with their imports).
- **Codec/payload:** `lib/server/graphSnapshotCompression.ts` (+test),
  `graphNodesFromCompactPayload.ts` (+test).
- **kNN/similarity:** `lib/acc/embedding/neighborPayload.ts` (+test),
  `similarityEdgeSet.ts` (+test), `NeighborMatchesPanel.tsx` (+test),
  `SimilarityWebOverlay.tsx` (+test), `similarityWeb.ts` (+test).
- **3D (owner decision 1):** `GraphCanvas3D.tsx` (+test), `lasso3d.ts` (+test),
  `GraphCanvas.tsx` 2D/3D switch (+test).
- **Instance orchestration:** `AccessAnalysisShell.tsx`,
  `GraphInteractions.tsx` (+ __tests__ test), `graphTestBridge.ts`
  (superseded by activityTestBridge), `lassoProbe.ts` (+ test),
  `__tests__/embeddingMapSeam.test.tsx`, `__tests__/previewIntegration.test.tsx`.
- **Pipeline:** `scripts/build-instance-features.ts`,
  `scripts/compute_instance_embeddings.py` + its pytest; nightly
  instance-embedding block removed from `dc-daily-ingest.cjs` (replaced by a
  dated retirement comment; `node --check` clean).

## Minimal severing edits on KEPT files

- `MapClusterLabels.tsx` (+test): `GraphCanvasHandle` type re-homed locally
  (was exported by the deleted GraphCanvas.tsx); "3d" arm typed `unknown` with
  a dated comment. Only kept file that imported anything deleted.
- `physicsLayer.ts`, Toolbar, RightPanelStack, featureTargets, nodeColors,
  usePredicateEngine, interactionTypes, FilterContext, SelectionContext,
  featureSnapshot, physicsLayerWorker: references were comments only — zero
  edits, all still compile (kept-for-Ph40 guarantee held).
- Repo-map dependency-cruiser baseline ratcheted DOWN: the 3
  build-instance-features.ts edges removed with the script; baseline now
  matches the live single warning (Phase-38 build-activity-author-attributes →
  graphNodesFromUsers helper, BND-03 family, previously masked by the higher
  count). ast-grep findings dropped 248 → 231 (deletions); baseline left as a
  ceiling.

## Survivors verified

- /users directory (`bulkUsers` lean + `dataVersion`), profile panels
  (`bulkUser`), /access-analysis charts AuthorProfileDrawer, person-graph
  (accPersonGraph, zero overlap), AccessAnalysisPage hybrid-analytics surface.
- `AccInstanceEmbedding` TABLE untouched (drop = milestone-close item).

## Expected e2e breakage (Phase 41 re-baseline — recorded, NOT chased)

`tests/e2e/acc-dc-graph.spec.ts`, `spatial-graph-baseline.spec.ts`, lasso,
cluster-labels, ambient specs assert the 22,279-node instance universe and the
retired `window.__ACC_GRAPH_TEST__` bridge — they will fail until E2E-03
re-baselines them against `window.__ACTIVITY_UNIVERSE_TEST__` (Playwright specs
import no app modules, so tsc/vitest are unaffected).

## Gates

- `npx tsc --noEmit`: clean after all 32 deletions + severs.
- Full `npm test`: **2543 passed | 1 skipped (336 files)** — no new failures;
  TEST-01/02/03 pins inside and green.
- `node scripts/repo-map/check.cjs`: PASS after `npm run repo-map:check`
  regeneration (map was genuinely stale — baseline referenced deleted files).
- `node --check scripts/dc-daily-ingest.cjs`: clean.

## Follow-ups / debt

- ast-grep baseline (231 live vs 248 ceiling) could be ratcheted down at the
  next repo-map housekeeping pass.
- Kept-but-unmounted instance machinery (sliders/catalog/physics/labels ≈40
  files) is intentional Ph40 inventory — if Ph40 rebuilds activity-native from
  scratch, sweep the leftovers at milestone close.
