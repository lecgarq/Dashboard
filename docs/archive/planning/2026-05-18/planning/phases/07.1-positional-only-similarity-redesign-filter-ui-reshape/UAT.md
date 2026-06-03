# Phase 07.1 — UAT

**Phase:** 07.1-positional-only-similarity-redesign-filter-ui-reshape
**Status:** PENDING-MANUAL-UAT
**Deploy:** http://localhost:3000 (Railway retired 2026-05-13 — dashboard runs on Luis's PC via Task Scheduler entry "LECG Dashboard Local"; the dev server hot-reloads, no push or rebuild needed before UAT)

## Automated Signals (captured at plan-end, 2026-05-13)

- **Vitest:** 285 / 286 pass. 1 failure: `app/(dashboard)/users/dashboard/useWidgetOrder.test.ts` "should load from localStorage" — pre-existing breakage from Phase 4 plan 06 (the test's stored order does not include `folderPermissions`, so the migration path produces a different array). Unrelated to Phase 07.1.
- **tsc --noEmit:** clean (0 errors).
- **Lint:** 0 errors, 12 warnings — all `Unused eslint-disable directive (no-console)` on pre-existing `scripts/*.cjs` files. None touched by Phase 07.1.
- **Build:** DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12. Dev server hot-reloads from `deploy` branch; Luis can `npm run build` locally if he wants to verify the production bundle compiles cleanly before UAT.
- **grep gate `false until.*positional-only`** (AccUsersGraph.tsx): 0 matches ✓ (the Wave 3 gate flag was removed; positional similarity is unconditionally on).
- **grep gate `user-similarity`** (graphRenderers.ts, accGraphOrganicLayout.ts): 0 matches in graphRenderers.ts ✓; **6 matches in accGraphOrganicLayout.ts** — **EXPECTED**. The plan was authored before the Wave 3 redesign and assumed the string would disappear entirely. Wave 3 intentionally kept `"user-similarity"` as the `SimulationLinkKind` label for the invisible spring-force links that drive clustering. These are not render branches — `graphRenderers.ts` has zero references, confirming no similarity edges are drawn.
- **grep gate `"Topology"|>Topology<`** (AccUsersGraph.tsx): 0 matches ✓ (filter section was renamed from "Topology" to "Clustering").

## Manual UAT Checklist (Luis on localhost:3000 at hub scale)

### Visual contract
- [ ] No user-similarity edges drawn anywhere on /users canvas → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Pie-glyph segments visible on users with permissions → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12 *(note: pie-glyphs are Plan 07.1-02, NOT YET SHIPPED — expect current users to render as Wave 3's neutral circles until Wave 5 lands)*
- [ ] Users with no permissions render as neutral solid circles → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Pie size feels right under zoom (clamped [6, 14] px) → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12 *(blocked on Plan 07.1-02)*
- [ ] role↔folder edges visible + tier-colored → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] folder↔project edges visible + neutral color → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12

### Filter UI contract
- [ ] "Clustering" section heading present (NOT "Topology") → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] 5 strength sliders (one per dim) + checkboxes → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12 *(actual implementation ships 7 sliders per the 7-dim model — verify count matches what shipped, NOT what plan text says)*
- [ ] "Minimum similarity" slider at bottom of Clustering → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] "User-only view" toggle at TOP of filter panel (above Layout/other sections) → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Tier checkbox swatches double as legend (no separate legend chrome) → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12

### Interaction contract
- [ ] Hover user node → side panel shows tier breakdown + sample folders → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Scrubbing a simStr slider produces smooth local reflow (NOT whole-graph reshuffle) → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12 *(this is the headline Wave 3 acceptance test — clusters should form/loosen smoothly)*
- [ ] Toggling a dim off shrinks that cluster's pull smoothly → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Unchecking a tier hides users whose max tier matches → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12

### URL contract
- [ ] simStr URL key writes when any value !== 1.0 → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Copy URL, paste fresh tab → simStr restored, sliders show non-default values → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Existing Phase 7 URLs (without simStr) still load → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12

### Perf
- [ ] FPS at hub scale with all dims at simStr=1.0 → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12
- [ ] Memory growth on zoom scrub → DEFERRED TO MANUAL UAT — captured at phase end per Luis directive 2026-05-12

## Deferred / Out of Scope (recorded per CONTEXT)
- **Plan 07.1-02 (pie-glyph nodes):** NOT YET SHIPPED — sequenced after UAT per Luis directive 2026-05-13. UAT items dependent on pie-glyph rendering will re-open when Plan 02 lands.
- **Wave 6 (hover fan-out lines colored by dominantDim):** NOT YET SHIPPED — data is on each force-link (`dimension`, `weight`); UI surface is a small follow-up after pie-glyphs.
- **GRAPH71-20 (3D cheap subset):** DEFERRED — 3D-WIRING gate from Phase 7 plan 07-01 still records `DECISION=3D-WIRING=DEFER`; `sphere3d/*` directory empty. Per RESEARCH §Open Question 4 recommendation, all 3D work waits for the 3D follow-up phase.
- 3D Sphere3DGraph full parity — deferred to follow-up phase.
- "Suggest collaborators" UX, per-dim simMin, domain-tuned default strengths — all deferred per CONTEXT.

## Decision

DECISION: PHASE-07.1-ACCEPT=PENDING-MANUAL-UAT

When Luis runs UAT, flip to one of:
- DECISION: PHASE-07.1-ACCEPT=APPROVED (all checklist items pass)
- DECISION: PHASE-07.1-ACCEPT=GAPS (some items fail → spawn /gsd:plan-phase 07.1 --gaps)
- DECISION: PHASE-07.1-ACCEPT=REVERT (fundamental issue, roll back 07.1 commits)
