# Milestones

## v1.0 — ACC Users Graph + Access Analysis Dashboard

**Shipped:** 2026-05-08
**Phases:** 6 (Phase 1, 2, 2.5, 3, 4, 4.1) | **Plans:** 33 | **Audit:** `tech_debt` (no blocking gaps; 2 cosmetic doc-drift items + 2 accepted TDs)

### Delivered

A production-deployed ACC user-access platform: GPU-accelerated graph (25k+ node hub interactive), filter pipeline with hide-on-filter semantics, and a single-page Access Analysis dashboard with junk/duplicate/outlier detection, drill-down panel, CSV-per-widget, and drag-reorder persistence.

### Key Accomplishments

1. **Production-stable foundation** — Worker bundling verified in `npm run build && npm start`; renderer destroy lifecycle prevents WebGL context accumulation; `getAccountId(db)` helper centralizes the `b.` strip; cache corruption banner recovers from NaN/Infinity positions (FOUND-01..04, Phase 1).
2. **Cosmos.gl GPU renderer with native physics** — `CosmosGraphRenderer` ships with Separation + Cluster sliders driving Cosmos's `simulationRepulsion`/`simulationLinkSpring`/`simulationLinkDistance`/`simulationCluster` via `setConfigPartial`; lasso multi-select, same-username highlight, perf HUD; 25,559-node hub fully interactive (TD-005 closed by Plan 02-05) (REND-01..04, Phase 2).
3. **ACC data + filter refinement** — `companyRole` and `lastSignIn` extracted from ACC HQ v1; recursive cascade filter with URL persistence; date-range + module on/off toggles; canvas hide via setVisibleIndices (zero-size + edge-skip), 150ms CSS fade (DATA-01, FILT-01..03, Phase 2.5).
4. **Graph UI polish** — Zoom-threshold labels with 11px–18px clamped curve and pill backgrounds (UAT-approved 2026-05-08); Stable badge (sustained-time stability detection on both renderers via `cosmosReady` React state promotion); 1280px panel layout fix (UI-01, UI-02, UI-03, Phase 3).
5. **ACC Access Analysis Dashboard** — Single-page 9-widget grid: Coverage donut (Workspace↔ACC) + Active-user tiers above the fold; KPI strip, Recommendations (junk HIGH/MED/LOW + duplicate-role pairs), Roles×Modules heatmap with inline severity badges, outlier combinations (<5% module sets), recently-added (7d/30d/90d), admin-access (account admins only), role-relationship flow; drag-reorder persisted via localStorage; CSV per widget with locked column order (DASH-01..13, replacing deferred ANAL-01..04, Phase 4).
6. **Astonishing-graphics reskin** — Replaced four list/table widgets with interactive SVG + d3-hierarchy + framer-motion graphics (severity bubble cluster, squarified treemap, 90-day calendar heatmap, admin orbit constellation); shared `_shared/dashboardTokens.ts` propagates severity colors to all 9 widgets; selection-aware spotlight wired into heatmap and flow widgets; reduced-motion compliance (Phase 4.1, INSERTED).

### Stats

- 33 plans across 6 phases shipped between 2026-04-28 and 2026-05-08 (10 days)
- All 27 active v1.0 requirements satisfied; 4 ANAL-* deferred per scope replacement (DASH-* dashboard); 1 REND-02 deferred per locked decision (TD-006)
- 2 flagship E2E flows verified end-to-end (bulk-sync→graph→filter→panel; dashboard→finding→drill-down→CSV)
- Production deployment on Railway, exercised through Phase 4 16-point UAT and Phase 4.1 12-step human-verify

### Technical Debt Carried Forward

- **TD-006** (open): Cosmos slider feel refinement — Separation+Cluster sliders wired but qualitative UX-feel tuning deferred per locked user decision
- **TD-007** (open): Remove vestigial Canvas2D renderer branch — fallback accepted code-only (Firefox is WebGL2-compatible); dual-path scaffolding remains

### Doc-Drift Reconciled at Archival

- UI-03 flipped to `[x] Complete` in archived REQUIREMENTS.md (code shipped via Plan 03-03 commits 0f9a71f, 563a58c)
- ROADMAP.md plan checkboxes for 04.1-02..04 corrected (commits d367a6b, 30886dc, c816144 confirm ship)

### Tag

- `v1.0` — created 2026-05-08

---

_For full detail, see `.planning/milestones/v1.0-ROADMAP.md`, `.planning/milestones/v1.0-REQUIREMENTS.md`, `.planning/milestones/v1.0-MILESTONE-AUDIT.md`._
