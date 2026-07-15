# Phase 25 Verification — Dimension Aperture: Group, Color & Filter

**Verified:** 2026-07-15
**Plans:** 3/3 complete (25-01 `662dc0da`, 25-02 `917a98c9`, 25-03 `7ae2f29a`, ponytail cut `0a94d8c8`)
**Requirements:** DIM-01, DIM-02, DIM-04, DIM-05

## Per-requirement coverage

| Req | Success criterion (ROADMAP) | Shipped evidence | Status |
|---|---|---|---|
| DIM-01 | Group the graph by any of the ~14 computed node dims + role/project/user | `dimensionIdSpace.APERTURE_THEME_GROUPS` → 17-id `PRESET_DIMENSION_IDS`; `GroupByControls` themed optgroups over `groupByDimensions(catalog)`; 10 aperture dims added to `dimensionCatalog.structural.ts`; continuous dims band via `dimensionBands.ts` + `APERTURE_BAND_BY_ID` in `dominantClusters.valueKeyLabel` (`662dc0da`, `917a98c9`) | ✅ |
| DIM-02 | Color by the same expanded set | Toolbar Color-by select over the SAME aperture groups; `AccessAnalysisShell` resolves picker id → `buildDominantClusters` → `bucketedColorsFromClustering` (banded categorical swatches, shared legend; ramp path unreachable) (`917a98c9`) | ✅ |
| DIM-04 | Filter by any available dimension; chip list no longer reads `SliderContext.DIMENSIONS` | Add-a-chip Toolbar: "+ Filter" themed menu adds dimension chips; popover multi-selects banded values-to-keep; AND across dims. `FilterContext` is dynamic aperture-keyed (DIMENSIONS import removed); predicate resolves via `buildApertureValueResolvers` (same `valueKeyLabel` tiers), legacy 6-id switch preserved (`7ae2f29a`) | ✅ |
| DIM-05 | Every exposed dim states coverage honestly at the point of selection | `dimensionCoverage.ts` node-derived `covered/total` inline on every option in Group-by, Color-by AND the "+ Filter" menu (⚠ under 90%); persistent amber caveat chip on the active grouping dim with provenance note (DC-sourced / folder-crawl) (`662dc0da`, `917a98c9`, `7ae2f29a`) | ✅ with recorded deviation (below) |

## Recorded gaps / deviations

1. **DIM-05 denominator:** ROADMAP criterion 4 says "DC-sourced dimensions show their ~550/1,153-project coverage". Shipped figure is the **node-derived** covered/total over the loaded snapshot instead — the 550/1,153 project denominator was never verified as the correct coverage denominator and displaying it would risk a made-up number (CONTEXT.md data-truth rule). `VERIFY:` note stands in `dimensionCoverage.ts` header. Provenance ("DC-sourced" / "folder-crawl") IS shown via the caveat chip title.
2. **Sweep-in WIP:** `662dc0da` carried in-file catalog-rewrite WIP in 3 catalog files (25-01 summary dev. 1); `7ae2f29a` carried `projectStatus?: string` in `interactionTypes.ts` (25-03 summary dev. 2). Same-surface, gates green.
3. **Legacy filter ids retired silently:** persisted filters keyed `tier`/`activity`/`signin`/`module` (old SliderContext ids) are dropped on rehydrate — one-time migration loss, by design (T-25-03-T key gate).
4. **drillDown stays legacy:** SelectionPanel pie drill compares raw snapshot values, not banded labels (deliberate, commented in `usePredicateEngine.ts`).

## Gates actually run (exact outcomes)

| Gate | Outcome |
|---|---|
| `npx tsc --noEmit` | exit 0 (after each plan and after the ponytail cut) |
| `npm test` (full suite, after 25-03) | 331 files passed \| 1 skipped; **2565 passed \| 1 skipped; 0 failures** (2557 → 2565: +8 phase-25-03 tests; suite later −2 with the ponytail cut) |
| Phase-24 invariance gates | `groupByDimensions.test.ts` asserts the widened 17-id set with structural invariants; `nodeColors.test.ts` green **byte-unmodified** across the phase |
| `node scripts/repo-map/check.cjs` | "Repo-map quality gate passed" (2 dep-cruiser warnings + 236 ast-grep findings — unchanged baseline) after 25-01, 25-02, 25-03 |
| Focused plan gates | 25-01: dimensionBands 10/10, coverage 7/7, catalog+clusters 70/70 · 25-02: 45/45, 18/18, 85/85 · 25-03: predicate 24/24, FilterContext 8/8, Toolbar-set 43/43 · post-cut: dimensionIdSpace/nodeColors/groupByDimensions 43/43 |
| Ponytail cut step | 1 finding applied: dead `REGISTRY_ID_BY_CATALOG_ID`/`colorModeIdForCatalogId` deleted (`0a94d8c8`, −35 net) |
| Scope | No `app/(dashboard)/access-analysis/**` (charts page) file touched in any phase commit; no layout/physics/reheat file; no WebGL, dependency, loader, or Prisma change |

## Remaining `VERIFY:` items

- `VERIFY:` whether AccDcProject 550 / AccProject 1,153 is the correct coverage **denominator** for DC-sourced dims (recorded in `dimensionCoverage.ts`; node-derived coverage is the shipped number either way). Rolled to CONCERNS.md.

## Deploy probe (autoDeploy)

- **2026-07-15 ~11:30 local** — deploy sequence run end-to-end: `LECG Dashboard Local` stopped, port 3000 freed, `npx tsc --noEmit` exit 0, `npm run build` completed (route table lists `/users/spatial-graph` + `/users/access-analysis`), task restarted (`Running`, :3000 `Listen`).
- **BUILD_ID:** `Vl7pXM_h_j5j2UrFGYd5Z`
- **Probe:** `GET http://localhost:3000/users/spatial-graph` → **200**, 10,338 bytes of real HTML (no error shell). `LECG Postgres Local` task showed `Ready` (not `Running`) at probe time, but the app served 200 — noted, not blocking.
- **Human visual UAT pending (owner):** the 25-02/25-03 human-checks — themed 17-dim pickers, inline coverage, caveat chip, "+ Filter" add-a-chip flow, banded values matching blobs, no node motion — remain to be eyeballed live by the owner on the new build.
