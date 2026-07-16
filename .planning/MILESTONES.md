# Milestones — LECG Dashboard

## v2.4 Spatial Graph Dimensions (Shipped: 2026-07-16)

**Phases:** 5 (24–28) + 1 fractional (28.1) · **Requirements:** 18/18 shipped · **Commits:** 74 (2026-07-14 → 2026-07-16; 12 feat, 6 fix, 2 refactor, 49 docs, 5 chore) · **Tag:** _local-only_

**Goal vs outcome:** Make every access-analysis dimension selectable on the spatial graph and make selecting one actually *restructure* the graph — by unlocking dimension machinery already built, computed every page load, and discarded. **Achieved with zero new data source, Prisma table, loader, or npm dependency** — the milestone was an unlock, not a build. The two hardcoded 3-string apertures became a unified, coverage-honest, ~17-dim group/color/filter surface; the 208-dim catalog wall renders lazily and searchably; the dead force-anchor engine drives organic layout; and the closeout exonerated the widened surface for a first-paint regression that turned out to be a pre-existing SSR-hydration bug.

**Per-requirement audit:**

| Req | Verdict | Phase | Evidence |
|---|---|---|---|
| DIM-01 group by any node dim | ✅ shipped | 25 | `APERTURE_THEME_GROUPS`→17-id presets, themed `GroupByControls` (`662dc0da`,`917a98c9`) |
| DIM-02 color by any node dim | ✅ shipped | 25 | Toolbar Color-by over same aperture; banded categorical swatches (`917a98c9`) |
| DIM-03 unified id-space | ✅ shipped | 24 | 24-VERIFICATION 8/8 |
| DIM-04 filter by any dim | ✅ shipped | 25 | Add-a-chip Toolbar, aperture-keyed `FilterContext`, `DIMENSIONS` import removed (`7ae2f29a`) |
| DIM-05 honest coverage labels | ✅ shipped (deviation) | 25 | `dimensionCoverage.ts` node-derived covered/total + provenance chip. **Deviation:** node-derived denominator, NOT 550/1,153 project denominator (never verified → would be a made-up number; `VERIFY:` note stands) |
| DIM-06 stale registry doc fixed | ✅ shipped | 24 | 24-VERIFICATION |
| CAT-01 catalog wall renders in prod | ✅ shipped | 26 | Grouping/Catalog tabs, 3D-flag decoupled (`d54ace25`) |
| CAT-02 176-action lazy-load | ✅ shipped | 26 | 26-VERIFICATION; CONCERNS §3.3 closed |
| CAT-03 searchable catalog | ✅ shipped | 26 | 26-VERIFICATION |
| CAT-04 unavailable dims greyed w/ reason | ✅ shipped | 26 | 26-VERIFICATION |
| LAY-01 dimension restructures organically | ✅ shipped | 27 | 27-VERIFICATION |
| LAY-02 catalogTargets/Weights live | ✅ shipped | 27 | dead compute→live render path |
| LAY-03 sliders morph continuously | ✅ shipped | 27 | 27-VERIFICATION |
| LAY-04 never a fixed grid | ✅ shipped | 27 | 27-VERIFICATION |
| PERF-01 DuckDB warm-up off critical path | ✅ shipped | 28 | idle-guard `useHybridAnalytics.ts` + live path already JS-snapshot (28-01); CONCERNS §3.1 closed |
| PERF-02 no accidental reheat | ✅ shipped | 27 | frozen-handle invariant `GraphCanvas.test.ts`; CONCERNS §3.2 closed |
| PERF-03 lasso e2e reliable | ✅ shipped | 28.1 | LassoOverlay latest-ref (`716ee966`); e2e 3/3 warm-cache GREEN |
| PERF-04 no first-paint regression | ✅ shipped | 28.1 | SSR-hydration fix `spatial-graph/page.tsx` (`9fb54cb8`); median 4360 ms ≤ 6812 gate, −30% vs baseline |

**Phases shipped:** 24 Baseline & Dimension ID Unification (2026-07-14) · 25 Dimension Aperture (2026-07-15, BUILD_ID `Vl7pXM_h_j5j2UrFGYd5Z`) · 26 Catalog Slider Wall (2026-07-15, `CwTEecFhqC9yUj_Vm7Koh`) · 27 Layout Engine — Force-Anchor Revival & Reheat Guard (2026-07-15, `kZKWbfeAqYW1R4bYrUx2U`) · 28 Performance Closeout — PERF-01 shipped, PERF-03/04 found-regressed → 28.1 · 28.1 Spatial-Graph Regression Debug (2026-07-16, deployed BUILD_ID `KeTX6mq25E1sa0vgA-Pnn`).

**Durable traps & decisions (carry forward):**

1. **Name collision** — `app/(dashboard)/access-analysis/` = 23-panel charts page; `app/(dashboard)/users/access-analysis/` = spatial-graph shell. `/users/spatial-graph` and `/users/access-analysis` render the same UI. This milestone touched the `users/` one.
2. **The "+42% regression" was NOT the widened surface.** Boot instrumentation: whole build/render path = 317 ms (`buildCatalogTargets`/`Weights` = 86 ms). Root cause was a pre-existing **SSR-hydration miss**: `createServerSideHelpers({transformer:superjson}).dehydrate()` returns a superjson-WRAPPED `{json,meta}` state, but the App Router passed it raw to `<HydrationBoundary>` (which needs a bare `DehydratedState`) → hydrated nothing → the client refetched the multi-MB `bulkUsers` on the critical path. Fix = `superjson.deserialize` before the boundary. **This same bug still affects `layout.tsx` + `users/page.tsx` app-wide** (CONCERNS §Ph28.1).
3. **PERF-03 lasso race was latent since the Phase-24 baseline**, not authored by Phase 27 — `LassoOverlay`'s pointer effect depended on an inline `onComplete`; Phase 27's post-freeze re-renders newly *triggered* it warm-cache. Fixed with a latest-ref pattern.
4. **cosmos.gl 3.3.0** upgrade (uncommitted at milestone open) was owner-confirmed and rode through all phases; frozen-handle invariant held.
5. Sequencing that held: DIM-03 before DIM-01/02; CAT-01 before CAT-02/03/04; PERF-02 landed inside Phase 27 (not a separate phase) as the safety net for LAY-01/02.

**Deferred items (destinations):**

- **DIM-05 project-coverage denominator** — verify whether 550/1,153 is the correct DC-sourced denominator before ever displaying it (→ v2.5 or a data-truth spike). `VERIFY:` in `dimensionCoverage.ts`.
- **App-wide SSR-hydration miss** — `layout.tsx` + `users/page.tsx` prefetches still refetch; candidate shared `deserializeHydrationState(helpers)` helper (→ CONCERNS §Ph28.1(1)).
- **`dynamic()` shell-chunk ~4 s parse gap** — remaining time-to-graph cost after the hydration fix; code-split heavy static imports out of the shell chunk (→ CONCERNS §Ph28.1(2)).
- **3 pre-existing `usePredicateEngine` Phase-25 unit failures** — banded-catalog aperture tests; not a regression (proven by stash-and-rerun); pre-existing WIP.
- **Tier-3 graph dims** (ISSUE-GRAPH-01 needs `AccIssue.createdBy`→`AccDcUser` resolution spike; TIME-01 temporal scrubber) → v2.5.
- **COMPANY-GRAIN-01, ORPHAN-01, TEST-SPLIT-01, MILESTONES v2.1/v2.2 backfill** → standing.

**Archive:** [`milestones/v2.4-ROADMAP.md`](milestones/v2.4-ROADMAP.md) · [`milestones/v2.4-REQUIREMENTS.md`](milestones/v2.4-REQUIREMENTS.md)

---

## v2.3 New Graphs (Shipped: 2026-07-14)

**Phases completed:** 6 phases, 28 plans, 62 tasks

**Key accomplishments:**

- Server loader + pure transform + client horizontal-bar chart reading `AccFolderPermissionSummary` (22,082 rows), converting `totalBytes` BigInt→Number server-side, with a new `formatBytes()` helper and per-role click-to-drill — a vertical slice not yet wired into `/access-analysis` (plan 20-05 does the registration).
- Real per-project sign-in recency signal (AccDcUser.lastSignIn via AccDcProjectUser join) bucketed into 5 locked bands with an honest, populated "Never signed in" bucket — loader, transform, and drillable chart, standalone and unit-tested; not yet mounted on the page (plan 20-05 wires it in).
- Additive `issueCoverage` on `coordinationByProjectView.ts` + a pure 4-bucket transform + a standalone `IssueFetchCoverageDonut` client component (ok/zero_issues/forbidden/error, all always shown, drillable per bucket) — not yet mounted; plan 20-05 places it above Model Coordination.
- PIPE-01 vertical slice: `loadIngestFreshness()` server loader (latest `AccDcIngestRun` + live `AccActivity` throughput by `ingestRunId`, `rowsByModule` never read), pure `ingestStaleness`/`statusTone`/`formatRunDuration` transforms, and a muted `IngestFreshnessPanel` ops-metadata strip — not yet mounted on `/access-analysis` (plan 20-05 owns page wiring).
- Wired PermissionFootprintChart, DormantSignInChart, IssueFetchCoverageDonut, and IngestFreshnessPanel into the live `/access-analysis` page (8→11-entry parallel loader fan-out), owner-verified live with no BigInt serialization error, plus an in-phase fix removing raw-GUID leakage from the project picker.
- Role-stacked activity-recency chart sourced from `AccActivityAccds` MAX(createdAt) per (project, user), built unmounted to replace the sign-in-recency panel in 20.1-06.
- Task 1 — `lib/server/permissionLevelView.ts` + server action.
- New "Folder activity by company" graph (owner UAT item 6) built as a two-pass bounded design — a 10,566-row eager headline aggregate (top-10 companies by folder-scoped activity, honest Unknown-company bucket) plus a lazy per-company folder drill on click — never materializing the 190,049-row company×folder cross-product. Built unmounted; ready for plan 20.1-06 to wire into the Companies tab.
- FolderPermissionTerrain now accepts an external project selection (0/1/2+ -> overview/single/compare) via a new pure `deriveTerrainSelection` helper, with pickers hideable and existing behavior byte-identical when the new props are absent.
- `/access-analysis` reorganized from a 722-line flat panel wall into a 6-tab (Overview·Roles·Users·Companies·Projects·Compare) Radix Tabs shell with one global picker/FilterBanner pinned above the strip, and the folder-permission terrain relocated into the Compare tab driven by that same picker (`externalSelectedIds`/`hidePickers` from 20.1-04), replacing its own expand-gate (`TerrainReveal`, deleted).
- 1. [Rule 1 - Bug] Fetch-gating condition changed from `rows === null` to a ref flag
- Role-click scroll-jump measured/fixed and pinned by a Playwright spec (Tasks 1-2, prior session); owner UAT re-check surfaced 4 itemized gaps — Activity-recency panels now state the question they answer, Permission-volume-by-level and Folder-activity-by-company "Other" buckets expand in place, and three project-name loaders (`accessInstanceView`/`moduleActivityView`/`activityTimelineView`) that were leaking raw project GUIDs into the global picker now resolve through the same `buildProjectNameMap`/`resolveProjectName` precedence already used elsewhere in the codebase — all four closed with one commit each.
- Server-side `loadIssueFunnel()` aggregate loader over the full 17,360-row `AccIssue` set (monthly `date_trunc` timeline cut + status `groupBy` cut in one `Promise.all`), its aggregate-bound Vitest test, and an unwired lazy auth-gated server action mirroring the existing `activityRecencyActions.ts` shape.
- Two unmounted presentational charts for the Projects tab — a monthly issue-creation area line (amber accent, zoom+peak pin, no YoY) and an 8-status donut with local per-status drill — both driven by live `deriveIssueCoverageCaption` numbers instead of any hardcoded coverage figure.
- ISSUE-02/ISSUE-03 are now live on the /access-analysis Projects tab — a monthly issue-creation timeline and an 8-status donut, both lazily fetched once per page load and owner-approved on a `:3100` production-build preflight.
- Service-first precedence layered into `classifyActivity` (narrow override, verb taxonomy unchanged as fallback), service preserved through the module-activity loader's SQL union, live attribution counters on `ModuleSummary`, and a live before/after evidence file showing the real fix moves only 207 of 4.72M activities (0.0044%) — nowhere near Model Coordination.
- `loadProvisionedModules()` server loader over `AccProjectMember.products` (full live-project coverage) + `summarizeProvisionedModules()` pure transform + `ProvisionedModulesChart` horizontal-bar component with click-to-drill, all built and tested UNMOUNTED for plan 21.1-04 to wire into the Overview tab.
- `summarizeProjectActivity()` pure transform (top-10 + Other, Account-level exclusion, per-project drill payload) + `ProjectActivityDonut` component with local click-to-drill module breakdown, both built and tested UNMOUNTED for plan 21.1-04 to wire into the Overview tab's new 2-up row.
- All 3 Phase 21.1 UAT items wired live into the /access-analysis Overview tab (2-up row: Activity share by project + Provisioned modules; live service/verb-split ⓘ caveat), owner-approved on a `:3100` production preflight after a 5-correction owner-delegated module-attribution taxonomy review that finished with the owner-directed Sheets-cluster → Build move.
- Task 1 — `AccIssueType` model + migration.
- `loadIssueFunnel()` gains a third `typeRows` cut (per-project issue counts by resolved type name) and a new `summarizeIssueType()` pure transform folds them into top-N + honest "Unknown type"/"No type set" buckets — both unmounted, ready for the 22-03 chart.
- COMPLETE.
- Zero files modified. Zero commits made.
- No reorder warranted — zero-diff curation PASS.
- Owner gave a one-word blanket approval ("approved") of the full 4-page workshop surface on the rebuilt `:3000`; recorded honestly as blanket-granularity evidence, zero findings raised, Task 3's fix-now branch correctly skipped as a legitimate no-op.
- Refreshed a stale repo-map dependency-cruiser baseline (6->2, ratcheted down only, never up), re-ran the full v2.3 gate sweep live (tsc/test/TEST-01-03/WebGL-scope-fence/spatial-graph-scope-fence all green), wrote `23-VERIFICATION.md` (`status: owner_approved`), and flipped both the Phase 22 and Phase 23 ROADMAP checkboxes — unblocking plan 23-05's final self-gate.

---

A historical log of shipped versions. Full per-milestone detail lives in `.planning/milestones/`.

---

## v2.0 — Workshop-Grade UI/UX Overhaul

**Shipped:** 2026-06-19 · **Tag:** `v2.0` · **Phases:** 7 · **Plans:** 30 (33 with gap-closure) · **Tasks:** ~80

A premium UI/UX overhaul of four pages (`/users`, `/access-analysis`, `/template-mty`, `/forma-proposal`) so the data looks, feels, and responds like a workshop showcase — fast, visually premium (2.5D depth, not flat), tactile, and explorable live. Presentation-layer surgery on a locked stack, built foundation-first.

**Key accomplishments:**

1. **Shared design foundation** — depth/glow/glass tokens, `PremiumSurface` primitive, theme-aware `EChart` wrapper, motion facade, and one slide-in `DrillSheet`, imported by all 4 pages (Phase 1).
2. **Decomposed the 2,474-line `/users` monolith** into a 314-line orchestrator + Zustand store + single data hook with zero user-visible change, guarded by a golden-path test, and killed the hydration-key double-fetch (Phases 2 & 4).
3. **Built one reusable virtualized `DataTable`** (sort, sticky glass header, pinned column, inline expand, density toggle) now shared by `/users` and `/template-mty` (Phases 3, 4, 6).
4. **Client-side cross-filtering on `/access-analysis`** — clicking one chart filters the others with zero new queries — plus Suspense tiers, depth/glow donuts with drill morphs, and lazy folder terrain (Phase 5).
5. **WCAG AA chart-label contrast at projector brightness** in both themes, backed by an automated 15-assertion regression gate ("raise the token, not the threshold") (Phase 5).
6. **Polished `/template-mty` and `/forma-proposal`** — premium DataTable + depth pies + settle-and-freeze role graph drill; `HierarchyView` split with deferred d3 + a selective real-3D background accent off the data (Phase 6).
7. **Pre-workshop projector UAT** — a 38-test Playwright harness across all 4 pages + every scriptable engineering gate, plus an owner :3100 runbook; engineering report ALL-GREEN and owner "approved on the projector" (Phase 7).

**Stats:** 161 commits over 3 days (2026-06-17 → 2026-06-19) · 53 `feat`, 11 `test`, 6 `fix`, 3 `perf`, 3 `refactor` · 238 files changed.
**Verification:** all 7 phases passed; owner UAT sign-off on Phases 4, 5, 6, and the Phase 7 projector pass.
**Archive:** [`milestones/v2.0-ROADMAP.md`](milestones/v2.0-ROADMAP.md) · [`milestones/v2.0-REQUIREMENTS.md`](milestones/v2.0-REQUIREMENTS.md)
**Deferred to v-next:** Forma role-permission diff view (FRM-V2-01), project-grouped picker accordion (ACC-V2-01), additional new analytics (NA-V2-01), `/users` data freshness.

---

## v1.0 — ACC Users Graph + Access Analysis Dashboard

**Shipped:** 2026-05-08 · **Tag:** `v1.0` · **Phases:** 6 · **Plans:** 33

Production-deployed ACC user-access platform — GPU-accelerated graph (25,559-node hub interactive), filter pipeline with hide-on-filter semantics, and a single-page Access Analysis dashboard with junk/duplicate/outlier detection, drill-down panel, CSV-per-widget, and drag-reorder persistence.

> This milestone predates the project's GSD re-initialization; its planning artifacts were archived before the v2.0 fresh init. Full record lives in the `v1.0` git tag's history. Its existence is why the Workshop overhaul (internally numbered "v1.0" by the fresh project) ships as **v2.0**.

---
