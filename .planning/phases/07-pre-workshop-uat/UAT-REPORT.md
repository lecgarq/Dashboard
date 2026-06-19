# UAT Report -- Phase 7 Pre-Workshop

**Date:** 2026-06-19
**Status:** STATIC-GATES-GREEN / PLAYWRIGHT-BLOCKED
**Build:** Production build served on :3100 (`next start --port 3100`)
**Static gates run by:** `node scripts/uat/run-engineering-gates.cjs --static-only`
**Full run (after 07-02 server up):** `node scripts/uat/run-engineering-gates.cjs`

---

## Engineering Gates

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
| tsc-0 | `npx tsc --noEmit` | **PASS** | Full tree (incl. test files) typechecks clean |
| repo-map:check | `npm run repo-map:check` | **PASS** | No new fetch/effect/Prisma-in-UI regressions |
| boundary diff | `git log --oneline HEAD | grep 07- | xargs git show --name-only | grep users/access-analysis/` | **PASS** | Phase 7 commits touch zero files under users/access-analysis/ (spatial-graph boundary intact) |
| GraphCanvas grep | `grep -rn GraphCanvas <four UAT page dirs>` | **PASS** | No conditional GraphCanvas mount in any of the four UAT page directories |
| Playwright UAT | `E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts` | **BLOCKED** | Skipped: --static-only flag passed. Run without --static-only after the owner builds and starts :3100. |

---

## Per-Page Gate Results

*Populated by the Playwright run (Gate 5). Requires :3100 to be serving the production build.*
*Run: `E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts`*

### /users

| Gate | Result |
|------|--------|
| PERF-01: page loads (table visible) | _pending Playwright run_ |
| PERF-03/04: tRPC fetch-once, no duplicate procedure batches | _pending_ |
| PERF-05: canvas count <= 1 (HeaderParticleAccent) | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light (axe-core) | _pending_ |
| THM-01: WCAG AA contrast dark (axe-core) | _pending_ |
| INT-03: table row -> DrillSheet opens | _pending_ |
| INT-03: DataTable expand affordance toggles | _pending_ |

### /access-analysis

| Gate | Result |
|------|--------|
| PERF-01: page loads (h1 + role-legend visible) | _pending_ |
| PERF-03: zero POST /api/trpc (RSC page) | _pending_ |
| PERF-05: canvas count = 0 (ECharts = SVG) | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light | _pending_ |
| THM-01: WCAG AA contrast dark | _pending_ |
| INT-02: role-legend click -> role-drilldown (inline PeopleDrillList) | _pending_ |
| INT-01: view-people-role -> people-sheet DrillSheet | _pending_ |
| ACC-03: terrain-expand aria-expanded toggles | _pending_ |
| lazy clash drill-down: coordination row aria-expanded | _pending_ |
| INT-04/INT-05: slice filter -> FilterBanner + filter-clear | _pending_ |

### /template-mty

| Gate | Result |
|------|--------|
| PERF-01: page loads (h1 + members table rows) | _pending_ |
| PERF-03: zero POST /api/trpc (RSC page) | _pending_ |
| PERF-05: canvas count = 0 initial load | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light | _pending_ |
| THM-01: WCAG AA contrast dark | _pending_ |
| INT-03: members table row -> AuthorProfileDrawer | _pending_ |
| TPL-02: RoleSimilarityGraph node -> RoleOverviewSheet dialog | _pending_ |
| terrain-expand: expand/collapse cycle | _pending_ |

### /forma-proposal

| Gate | Result |
|------|--------|
| PERF-01: page loads (VDC Specialist visible) | _pending_ |
| PERF-03: zero POST /api/trpc (RSC page) | _pending_ |
| PERF-05: canvas count <= 1 before + after role selection | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light | _pending_ |
| THM-01: WCAG AA contrast dark | _pending_ |
| drill smoke: assign role, tier, reload persists, export JSON | _pending_ |

---

## Screenshots

*Attached to the Playwright HTML report at `playwright-report/`.*
*Per-page screenshots captured by uatScreenshot() in each test.*

Expected attachments (after Playwright run):
- users-light, users-dark
- access-analysis-light, access-analysis-dark, access-analysis-role-drilldown, access-analysis-people-sheet, access-analysis-terrain-expanded, access-analysis-coord-expanded
- template-mty-light, template-mty-dark, template-mty-profile-drawer, template-mty-role-sheet, template-mty-terrain-expanded
- forma-proposal-light, forma-proposal-dark, forma-proposal-canvas-check, forma-proposal-tier-set, forma-proposal-export

---


## Defects Found

| # | Page | Severity | Description | Status |
|---|------|----------|-------------|--------|
| — | — | — | No defects recorded yet (populate after full Playwright run) | — |

---

## Owner Perceptual Checklist (Live Projector Pass)

**Instructions:** Run on secondary display at projector-reduced brightness (1280px).
Both light and dark (zinc) themes. Mark each:
- PASS = looks great on the projector
- BLOCK = broken in the room (invisible/illegible label, clipped modal, horizontal overflow, page error, drill does not open)
- COSMETIC = nit, ships as-is

### /users
- [ ] No horizontal overflow at 1280px
- [ ] Data labels legible at projector brightness (both themes)
- [ ] Table rows crisp -- sticky header visible, density toggle works
- [ ] Row click -> DrillSheet slides in smoothly (<=200ms, directional)
- [ ] Motion fires only on mount, not on filter changes
- [ ] No clipped modals or panels

### /access-analysis
- [ ] KPIs + donuts load first (streaming, not one big load)
- [ ] Donut legend click -> inline people drill (PeopleDrillList appears)
- [ ] "View N people" button -> DrillSheet slides in
- [ ] Terrain "Show" button -> terrain mounts, interactive (3D orbit + zoom)
- [ ] Coordination row expand -> lazy clash data loads
- [ ] Filter banner visible when project selected, Clear works
- [ ] Cross-filter updates all panels without page navigation
- [ ] No horizontal overflow at 1280px

### /template-mty
- [ ] Members table loads, search works, row click -> profile drawer
- [ ] Role-similarity graph settles + node click -> RoleOverviewSheet
- [ ] Terrain expand works

### /forma-proposal
- [ ] Role rail loads (VDC Specialist visible)
- [ ] Click role -> folder tree updates
- [ ] Set tier -> tier chip updates
- [ ] Reload -> draft persists
- [ ] Export JSON downloads
- [ ] R3F particle accent visible but subtle (z-0, opacity 0.18)
- [ ] No clipped modals at 1280px

### GPU Observation (owner, DevTools -> chrome://gpu or Memory tab)
- [ ] GPU memory stays below 400MB across all four pages
- [ ] /users HeaderParticleAccent canvas count = 1 (not more)
- [ ] /forma-proposal FormaParticleAccent canvas count = 1 (not more)

---

*Generated by `node scripts/uat/run-engineering-gates.cjs`*
*Phase 7 Pre-Workshop UAT -- LECG Dashboard*
