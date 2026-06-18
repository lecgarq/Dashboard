# Phase 3: DataTable Primitive - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Build ONE reusable, virtualized `DataTable` primitive at `components/ui/DataTable.tsx` — sort, sticky header, row-click, inline row-expand, density toggle, pinned column — typed with `ColumnDef<T>` generics (`@tanstack/react-table` v8 + `@tanstack/react-virtual` v3). Styled with Phase 1's `PremiumSurface`/depth tokens; renders correctly in light and dark (zinc) themes; introduces no new WebGL context; `npx tsc --noEmit` exits 0.

This phase delivers the **primitive and its default look/behavior contract only**. Wiring it into real pages is later: `/users` (Phase 4) and `/template-mty` (Phase 6). Decisions below define defaults every consumer inherits; pages may override via props/slots but should not need to re-decide behavior.

</domain>

<decisions>
## Implementation Decisions

### Row interactions
- A row has two distinct gestures, each mapped to exactly one outcome:
  - **Always-visible chevron** (left side of the row) toggles the **inline row-expand** (a "quick peek").
  - **Clicking anywhere else on the row** fires `onRowClick` → opens the shared slide-in detail panel (the full profile). The panel itself is wired per-page in Phase 4/6; this phase exposes the `onRowClick` callback.
- The inline peek is the **glance** version: a short **quick-summary** of a few key fields rendered in place, without losing scroll position. Deep detail lives in the slide-in panel, not the peek. The peek content is page-supplied via a render slot (e.g. `renderExpanded(row)`); the primitive owns the expand/collapse mechanism and animation.
- Expand is **one-at-a-time (accordion)**: opening a row's peek auto-collapses any other open one. Keeps the table tidy and layout stable.
- The expand **chevron is always visible** on every row (not hover-only) so the affordance is obvious to a room watching a projector.

### Density
- **Two levels: Comfortable (default) / Compact.** Comfortable = taller, easy-to-read rows for the room by default; Compact = more rows on screen when scanning.
- The chosen density **persists in the browser** (e.g. `localStorage`) so it survives reloads/revisits — set once for the workshop and it stays.
- The density toggle lives in the **table toolbar, top-right** — a small, visible control (not buried in an overflow menu) so it can be demoed live.
- Compact changes **row height + padding only**; **font size stays constant** so text never degrades at projector distance.

### Sort behavior
- Header click cycle is **three-state: Ascending → Descending → off** (third click clears back to the table's natural/default order).
- **Single-column sort**: clicking a new header replaces the current sort (no multi-column / Shift-click). Simplest to follow when presenting live.
- Sort indicator = **up/down arrow on the active column + a subtle active-header highlight**, so the room can instantly see what's sorted.
- Sort **resets to the page's sensible default each visit** (e.g. Name A–Z) — predictable demo state, no surprise persisted sort. (Each consuming page supplies its own default-sort column via props.)

### Visual feel
- **Frosted-glass sticky header**: translucent, blurred, pinned to the top; body content passes softly beneath it. Uses Phase 1's glass token — reinforces the premium 2.5D goal.
- **Pinned first column** (e.g. Name): casts a **soft shadow once the body is scrolled horizontally**, so it reads as a layer floating above the data.
- Rows separated by **subtle hairline separators** (thin, low-contrast lines) — clean and modern, and plays well with inline row-expand (no zebra striping, no whitespace-only).
- Row hover = **background highlight + a slight depth "lift"** — tactile, telegraphs that the row opens a panel.

### Empty state
- Default empty state = **centered subtle icon + a one-line message**. The icon and text are **overridable per page** via props/slots.
- The primitive distinguishes **two cases with distinct messaging**: "no data yet" (truly empty source) vs. "no results — try adjusting your filters" (a filter is hiding everything). The consuming page tells the primitive which case applies (e.g. via a `hasActiveFilter` prop).
- When a filter is the cause, the empty state offers a **"Clear filters" button**. The primitive **exposes the action slot/callback**; the page wires the actual reset (Zustand store reset in Phase 4) so you're never stranded on a blank table mid-demo.

### Claude's Discretion
- Exact prop/slot naming and the `ColumnDef<T>` generic surface (e.g. how column-level `enableSorting`, pinning, and `renderExpanded` are exposed).
- Animation specifics for expand/collapse and hover-lift (must route through Phase 1's motion facade and honor `prefers-reduced-motion`).
- Virtualization tuning (overscan, estimated row size per density), measurement strategy, and the scroll-container structure that keeps the sticky header + pinned column working under virtualization.
- Exact spacing/typography scale per density level, shadow depths, hairline color tokens (must come from Phase 1 tokens, resolve in both themes).
- The demo/test harness used to prove the primitive renders in both themes this phase (since no real page consumes it yet).
- Default icon choice for the empty state.

</decisions>

<specifics>
## Specific Ideas

- **Projector-first framing** drove most choices: always-visible chevron, visible toolbar toggle, font-size held constant in Compact, distinct empty-state messages, and a "Clear filters" escape hatch — all so a live audience is never confused or stuck.
- Coherence is intentional: one-at-a-time peek + hairline separators + highlight-and-lift hover together produce a calm, layered surface rather than a busy one — the kind of consistency a shared primitive is meant to lock in.
- Two-layer detail model is a hard contract: **inline peek = glance, slide-in panel = deep dive.** Pages must respect this split (don't duplicate the full profile into the peek).

</specifics>

<deferred>
## Deferred Ideas

- **Multi-column sort (Shift-click)** — considered and explicitly declined for this primitive (single-column only). Could revisit as an opt-in capability in a future milestone if analysis workflows need it.
- **Remembering last sort across visits** — declined (sort resets to default); only density persists. Revisit only if users ask.
- **Three density levels (Spacious/Comfortable/Compact)** — declined in favor of two. Easy to extend later if needed.

</deferred>

---

*Phase: 03-datatable-primitive*
*Context gathered: 2026-06-18*
