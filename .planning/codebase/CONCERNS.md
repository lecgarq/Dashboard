# Concerns & Technical Debt

**Analysis Date:** 2026-05-12

This document captures known concerns, technical debt, scaling limits, fragile areas, and missing-but-deferred features. Source of truth for active debt is `.gsd/TECHNICAL_DEBT.md`; this file summarizes the load-bearing items for planning.

## Blocking Issues

### APS Data Connector provisioning
- **Where:** External (Autodesk APS app config + ACC Account Admin)
- **Problem:** Production APS `client_id` is not authorized for the Data Connector API. ZIP-export ingest (`lib/acc/ingestActivityZip.ts`) cannot run in prod.
- **Impact:** Blocks Phase 3 UAT (activity-based metrics).
- **Next step:** Enable Data Connector at `aps.autodesk.com/myapps` and provision in ACC Account Admin. Tracked in memory `project_aps_data_connector_blocker`.

## Scaling Concerns

### SCALE-001 — `AccUsersGraph.tsx` is ~3,970 lines
- **Where:** `app/(dashboard)/users/AccUsersGraph.tsx`
- **What lives there:** Topology rebuild, filter wiring, physics sliders, selection, URL persistence, label rendering, mode switching.
- **Status:** Safe to keep adding Phase 7.1 features. Hard cutoff: extract sub-components before exceeding ~5,000 lines or before next major mode is added.
- **Suggested split:** `useTopologyRebuild` hook, `useGraphSelection` hook, `<PhysicsControls>` panel component, `<FilterPanel>` component.

### SCALE-002 — Folder crawl runs 48 min – 4 h
- **Where:** `lib/acc/folderCrawl.ts`, cron in `services/`
- **Gate:** `FOLDER_CRAWL_IN_RELEASE` env (default OFF). Weekly cron is the production path.
- **Risk:** If folder churn rises, the weekly cadence may go stale. May need to move to nightly + delta-crawl after churn is measured.
- **Next step:** Add churn-rate telemetry, then decide on cadence.

## Fragile Areas

### FRAG-001 — Phase 7 topology rebuild useEffect
- **Where:** `app/(dashboard)/users/AccUsersGraph.tsx` (topology rebuild effect)
- **Problem:** Deps include `showFolders`, `permTiers`, `simDims`, `simMin`, `viewMode`, `folderMatrixQuery.data`, plus a snapshot ref. No unit test guards the deps array against drift; an accidental omission silently freezes the graph.
- **Mitigation:** Phase 7 currently disabled via feature flag. Playwright visual regression would catch breakage when re-enabling.

### FRAG-002 — Cosmos.gl v3.0.0-beta.9 is still beta
- **Where:** `app/(dashboard)/users/AccUsersGraph.tsx`, `app/(dashboard)/users/cosmosUtils.test.ts`
- **Three documented API traps:**
  1. `start()` / `render()` must be paired correctly — out-of-order causes warm-restart issues.
  2. `setConfigPartial` vs `setConfig` — partial does NOT clear unset fields; full replaces everything.
  3. After `end()` the simulation must be re-warmed before next `start()`.
- **Patch dependency:** `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` clamps alpha + adds server-only marker. Bumps require manual re-test.
- **Alpha note:** `getSimulationAlpha()` returns `1 - progress` (INVERTED vs d3) — captured in memory `project_cosmos_alpha_inversion`.

## Missing / Deferred Features

### MISS-001 — HQ v1 prefetch skipped
- **Impact:** `companyRole` and `isAccountAdmin` are written as `null` / `false`. "Account Admin" filter pill won't light up for hub admins.
- **Cost to add back:** ~5–15s added to Quick Sync.
- **Status:** Deferred until product asks for the filter.

### MISS-002 — No soft-delete on `AccProjectMember` / `AccProjectRole`
- **Impact:** When a user is removed from a project, the edge persists; the graph can show stale members.
- **Status:** Deferred pending churn-rate measurement (see SCALE-002).

### MISS-003 — Per-project failure-rate alert not enforced
- **Where:** Sync error handling in `lib/acc/acc-sync.ts`
- **Target:** Alert if a project sync fails >10% of attempts in a rolling window.
- **Today:** Only fatal exceptions propagate non-zero exit.

## Dependency Risk

### DEP-001 — Two `patch-package` patches
- `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` — alpha clamp + `server-only` runtime marker
- (Previously) `patches/@cosmos.gl+graph+3.0.0-beta.8.patch` — replaced by beta.9 patch in this branch
- **Risk:** Patches are fragile across version bumps. Manual verification required on every cosmos.gl upgrade.

## Test Coverage Gaps

- Topology rebuild effect (FRAG-001) — no unit test
- `CosmosGraphRenderer` contract — no test exercises the cosmos.gl API surface we depend on
- `userSimilarity.ts` has tests but the **combined** similarity-dim weighting path is not covered end-to-end
- No Playwright visual-regression suite yet (would defend FRAG-001 + label-polish behavior)

## Security & Secrets

- `.env` and `texti.env` are gitignored (verified)
- NextAuth secrets and APS client secret only read server-side
- No client-side use of `OPENAI_API_KEY` or `UPSTASH_*` tokens
- No known credential-leak patterns in source tree as of this analysis

## Performance Notes

- ACC graph uses Cosmos.gl GPU simulation — runs at 120 fps target on mid-range hardware
- Quick Sync extraction is I/O-bound on APS API; uses `p-limit` for concurrency control
- Folder crawl is the dominant long-running job (see SCALE-002)
- Label polish curve (`pow(zoom, 0.2)` clamped `[0.85, 1.4]`, 11–18px) is UAT-approved (memory: `project_label_polish_curve`)

---

*Concerns analysis: 2026-05-12. Active debt tracked in `.gsd/TECHNICAL_DEBT.md`.*
