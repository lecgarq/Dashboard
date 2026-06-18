# Phase 5: /access-analysis Depth & Cross-Filtering - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Add premium 2.5D depth, progressive tiered loading, and click-a-chart-to-cross-filter-the-others to the **existing** `/access-analysis` page. This is presentation-layer surgery on a page that already exists and already does zero-query client cross-filtering via the Project Picker (`filterRowsBySelection` over server-loaded rows) — Phase 5 extends that same proven pattern to chart **segments**, wraps everything in the shared `PremiumSurface` + themed `EChart` foundation from Phase 1, and tiers the load.

In scope: ACC-01/02/03, PERF-02/05, INT-02/04/05, VIS-01/02/05, THM-01, NA-01.
Out of scope: new data pipelines, schema changes, WebGL on the data surface, and any new analytics panel (explicitly polish-only this phase).

</domain>

<decisions>
## Implementation Decisions

### Cross-filter & drill interaction (INT-02, INT-04, INT-05)
- **Slice click = refocus + pill, NOT auto-open panel.** Clicking a chart slice (e.g. a role) smoothly refocuses the *other* charts to that value and drops an active-filter pill. The slide-in people panel does NOT open on the same click — this keeps the cross-filtered charts visible instead of hiding them behind the ~480px panel. (Note: this refines success-criterion #3's "AND opens the panel" — the people panel is reachable via an explicit affordance instead of the same click.)
- **Clicked chart highlights its slice:** the picked slice pulls out slightly and glows; the other slices in that same chart dim. Clear visual anchor of what's driving the filter.
- **Filters stack as AND.** Role "PM" + company "Acme" = people who are both. Clicking a *different* role swaps the role; clicking a *different* company swaps the company (one active value per dimension, ANDed across dimensions).
- **People list opens via a "View N people →" affordance in each panel header** — opens the shared slide-in panel for that chart's *current filtered* view. This is the INT-02 segment→slide-in target. (Person-level profile drawer still opens when a specific person is clicked inside that list.)
- **Project Picker stays a distinct control.** Picker = WHICH projects are in scope; slice-pills = drilling WITHIN those projects. Slice filters live in their own pill bar above the charts; the 400+ project picker is NOT folded into pills.
- **Clearing:** clicking an already-active slice toggles that filter off. A "Clear all" wipes every slice filter at once; each pill also has its own X. (Project Picker is untouched by Clear all.)
- **Filter scope = donuts + activity timeline only.** All donuts and the timeline cross-filter together. The folder-permission terrain and Model Coordination panel stay project-scoped (they are inherently per-project views, not slice-driven).
- **KPI strip updates instantly, no re-animation.** KPI numbers track the active filter so they stay honest, but count-up animates only on first page load — not on every drill (respects VIS-05: motion fires on mount/drill, not constantly).
- **Empty-after-filter state:** a panel with no matching data for the current filter combination shows a small inline "No data for this filter" note in place — layout does not jump, panels are not hidden.

### Loading order & terrain (PERF-02, ACC-03)
- **Tiered load:** Tier 1 = KPIs + all donuts (~300ms target); Tier 2 = activity timeline; Tier 3 = terrain (on expand). Front-loads the most-scannable visuals; replaces any single blocking `Promise.all`.
- **Terrain is collapsed, click-to-reveal.** Shows as a collapsed "Folder permission terrain — show" panel; it only builds when expanded. Guarantees a fast page and no surprise 2-3s lag, and lets the presenter reveal it deliberately.
- **Terrain default content = account-wide overview** (via the existing overview loader) the moment it opens, with a picker to focus a single project. Instant value, not a blank prompt.
- **Skeletons = shaped shimmer placeholders** per panel (donut rings, bars, KPI tiles), within the 200ms bar. Not a single page spinner, not blurred previews.

### Visual depth & layout (VIS-01, VIS-02, ACC-01, ACC-02, THM-01)
- **Depth intensity: noticeable but legibility-first.** Clear 2.5D depth (soft layered shadows, gentle glow, glass panels) tuned so every label stays sharp at projector brightness — the workshop-safe sweet spot, not subtle, not dramatic.
- **Layout: denser 2-up grid.** Donuts arranged two-per-row on wide screens, stacking to one column when narrow; timeline and terrain stay full-width. Replaces today's full-width single-column stack to feel like a live dashboard with less scrolling.
- **Donut restyle: full treatment** — gradient fills + rounded segment ends + selected-slice glow + soft drop-shadow 2.5D lift. All donuts + the timeline use the shared themed `EChart` wrapper with `universalTransition` drill morphs.
- **Theme: tune BOTH light and dark (zinc) to the same contrast bar** — no priority theme chosen (room conditions unknown). Both must pass WCAG AA on data values at projector brightness (THM-01 verified here on the densest data surface).

### Analytics & data honesty (NA-01)
- **Polish-only — no new metrics or panels this phase.** Phase 5 is a depth + cross-filter reskin of the panels that already exist. New analytics ideas defer to the backlog (NA-V2-01).
- **Keep all current panels:** roles, companies, activity-by-role, activity-by-company, modules, timeline, terrain, Model Coordination — all retained, just restyled and re-laid-out. No information loss.
- **Coverage caveat = clear badge on activity panels.** A small consistent badge (e.g. "Activity: 428 / 1,152 projects") on each activity-derived panel, extending the coverage badges that already exist. Honest without shouting.

### Claude's Discretion
- Exact pill-bar visual styling, placement details, and animation of pills appearing/leaving.
- Exact shimmer geometry, gradient stops, glow radii, and shadow tokens (within the Phase 1 token set).
- `universalTransition` morph choreography and the ≤200ms directional drill timing curve.
- Responsive breakpoint(s) at which the 2-up grid collapses to 1-up.
- The precise wording/iconography of the "View N people →" affordance and the inline empty-state note.
- Whether the `AccActivity (email, projectId)` composite index is added as part of terrain/timeline perf work (planning gate — add here, not deferred).

</decisions>

<specifics>
## Specific Ideas

- The headline "lean-in" moment is: click a slice → watch every other chart smoothly refocus while the clicked slice glows and a pill appears. Keeping the people panel OFF that click is a deliberate choice so the refocus is the visible payoff.
- The Project Picker already does zero-query cross-filtering; the segment cross-filter must reuse that same in-memory `filterRowsBySelection` pattern (Pitfall 2 — no new `trpc.useQuery` for already-fetched data).
- Terrain reveal is treated as a presenter-controlled beat, not background work.

</specifics>

<deferred>
## Deferred Ideas

- New analytics beyond the existing panels — backlog (NA-V2-01); any future addition must pass the Prisma-schema feasibility gate.
- Project-grouped persistent accordion in the project picker — already deferred as ACC-V2-01.
- Merging/trimming any existing panel — owner chose to keep all; revisit only if a future density problem appears.

</deferred>

---

*Phase: 05-access-analysis-depth*
*Context gathered: 2026-06-18*
