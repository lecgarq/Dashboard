# 30-02 SUMMARY — Proc normalization + de-twinned edges

**Status:** COMPLETE · commit `6d52e7e9` · 2026-07-16

## What shipped

- **`lib/acc/embedding/neighborPayload.ts`** (new, pure): `NeighborMatch` /
  `NeighborTwins` / `NeighborsPayload` types + `normalizeNeighborsPayload(raw)`
  — v2 pass-through with per-entry coercion (malformed matches dropped,
  non-string why keys filtered, twins count floored/clamped ≥0), old bare-array
  → `{matches: …why:[], twins:{count:0, ids:[]}}`, null/garbage → empty. Never
  throws.
- **`server/routers/acc-dc-graph.ts`**:
  - `instanceNeighbors` returns `normalizeNeighborsPayload(row?.neighbors)` —
    typed `{matches, twins}` for both payload generations (the CONTEXT
    shape-change trap is closed at the proc boundary).
  - `similarityEdges` builds `RawNodeNeighbors` from normalized **matches
    only** — twin edges structurally cannot enter the edge set.
    `dedupeAndSelectClusterAware(nodes, clusterById, limit)` call unchanged
    (`interReserveFrac` default 0.4 stays until 30-04 evidence); comment
    updated to reflect the post-collapse premise.
- **`lib/acc/embedding/neighborPayload.test.ts`** (new): 5 tests — v2
  pass-through, old-array normalization, null/garbage/`{v:2}`-without-matches,
  malformed-entry dropping + twin coercion, negative/missing twins.

## Deviations

- **Trivial compile-seam fix in `AccessAnalysisShell.tsx`** (2 lines, not in
  the plan's files_modified): the proc's inferred type changed, so
  `neighborsQuery.data ?? []` → `neighborsQuery.data?.matches ?? []` in
  `neighborIndices` and the panel `matches` prop. Without it `tsc` breaks
  between plans. Full shell rewiring (twins prop, coverage map) is 30-03 as
  planned.
- `similarityWeb.test.ts` needed **no change** — the min-max pin the plan
  called for already exists (`min-max normalizes strength to [0,1]` +
  degenerate-span case, lines 25–45). SIM-03 normalization clause pinned by
  existing tests.

## Gates

- `npx vitest run lib/acc/embedding/neighborPayload.test.ts lib/acc/embedding/similarityEdgeSet.test.ts "app/(dashboard)/users/access-analysis/similarityWeb.test.ts"` → **3 files, 22 tests passed**.
- `npx tsc --noEmit` → clean (exit 0).
- `node scripts/repo-map/check.cjs` → **passed** (2 dep-cruiser warnings + 236
  ast-grep findings — baseline, pre-existing).
