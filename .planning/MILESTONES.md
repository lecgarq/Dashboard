# Milestones — LECG Dashboard

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
