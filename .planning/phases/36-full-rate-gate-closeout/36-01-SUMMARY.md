# Plan 36-01 Summary — Full-rate gate closed

**Status:** COMPLETE — 2026-07-20
**Requirement:** REND-02
**Product commit:** `78da1286` `perf(36): compact graph hydration payload`

## Outcome

The strict Phase-33 time-to-graph cutoff passed without tolerance or cherry-picking, then
the full-rate graph passed outright at Tier 0. The accepted final batch rendered all 22,279
nodes at a 2,386.7 ms median, 39.0% under the 3,913.7 ms cutoff. The final ambient sample
held 60.016 fps for 10.014 seconds with 18,000 Cosmos-native links and Tier 0 before/after.

## Root cause and implementation

The renderer was not the time-to-graph bottleneck. The graph route hydrated a 14.5 MB
full-user result, then the default right rail eagerly downloaded another 17.6 MB
directory/enrichment batch after readiness. Those discarded background responses
contended with later fresh-context measurements.

- Added a normalized graph-only tuple protocol and reused the existing
  `rawRowToSnapshot` feature mapper for parity.
- Packed and cached the normalized payload against the existing ACC hot-cache array
  identity, avoiding repeated normalization/compression across SSR requests.
- Replaced graph-route `bulkUsers` hydration with the compact `graphSnapshot` procedure.
- Removed the eager full-directory rail fetch. Selecting a node now calls the existing
  single-user `bulkUser` procedure on demand.
- Removed the obsolete DuckDB critical-path fallback from the graph shell; graph assembly
  remains pure JS and the frozen Cosmos simulation contract is unchanged.

No dependency, schema, migration, data source, renderer, visual treatment, or acceptance
threshold changed.

## Exact gates

- Focused compact/compression/hydration tests: 4 files / 6 passed.
- Focused rail/profile tests: 2 files / 21 passed.
- Legacy builder + router parity: 2 files / 20 passed.
- `npx tsc --noEmit`: exit 0.
- Full Vitest: 342 files passed / 1 skipped; 2,638 tests passed / 1 skipped.
- TEST-01/02/03 + PERF-02: 4 files / 49 passed.
- Repo-map: pass with the existing 3 dependency warnings / 248 AST findings.
- `acc-dc-graph.spec.ts`: 16 passed / 8 expected skips.
- Final time-to-graph: 2,386.7 ms median, all five runs recorded in `36-BASELINE.md`.
- Phase-32 ambient gate: 4/4 passed; 60.016 fps / 10.014 s / 22,279 nodes /
  18,000 native links / Tier 0 before and after.

## Deploy

Local production BUILD_ID `39p7DFRd3DbgM8WjWU2Pz` is live on port 3000. Health returned
200 with `database: connected`; unauthenticated graph access returned the expected 307;
an authenticated graph load returned 200 with the populated graph and no console errors.
