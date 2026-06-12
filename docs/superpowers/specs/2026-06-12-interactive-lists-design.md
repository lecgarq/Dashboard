# Interactive lists — `/access-analysis` & `/template-mty`

**Date:** 2026-06-12
**Branch:** `feat/access-analysis-redesign`
**Status:** Approved (design)

## Goal

Vastly improve the UI of the two analytics pages `/access-analysis` and
`/template-mty` with **subtle, professional animations** and **real
interactivity in each list**. The bar is "the data feels alive and responsive"
— motion you notice subconsciously — not flashy effects.

Motion intensity: **Subtle & premium** (gentle entrance fades + capped stagger,
soft hover micro-lifts, height-animated expand/collapse; ~180ms on the existing
`--motion-ease` = `cubic-bezier(.22,1,.36,1)`).

## Constraints

- **No new dependencies.** `framer-motion` v12 is already installed; reuse the
  existing motion tokens and keyframes in `app/globals.css`.
- **No data/server changes.** Pure client/presentation work.
- **Respect `prefers-reduced-motion`** (already globally guarded; framer-motion
  variants additionally gate via `useReducedMotion`).
- **Surgical commits** on this WIP-heavy branch: stage by explicit path only;
  verify `git diff --cached --name-only` before every commit.
- **Keep existing tests green**; the touched components have vitest suites
  (`TemplateMembersTable.test.tsx`, `CoordinationByProject.test.tsx`,
  `page.test.tsx`, `AccessAnalysisCharts.test.tsx`).

## The lists in scope

**`/access-analysis`** (`AccessAnalysisCharts.tsx`)
- `ProjectPicker` — grouped, collapsible checkbox dropdown.
- `CoordinationByProject` — project rows (count bars) → click-to-expand clash
  drill-down (cards + top-author chips).

**`/template-mty`** (`TemplateAnalysisCharts.tsx`)
- `TemplateMembersTable` — currently a plain read-only `<table>` with only
  `hover:bg`. The biggest opportunity.

Out of scope: ECharts internals (donuts, terrain, role-similarity graph) — they
own their own animation engines. We touch only the panels/lists around them.

## Architecture

### 1. Shared motion toolkit — `components/ui/animated-list.tsx` (new)

A small, focused, reusable module. Each unit has one purpose, a clear interface,
and no dependency on the consumers.

- `listContainer` / `listItem` — framer-motion variants. `listItem` = fade +
  6px slide-up, ~180ms. `listContainer` uses `staggerChildren: 0.025` with a
  small `staggerCap` (only the first ~20 children stagger; the rest appear
  together) so long lists don't cascade forever. Disabled under reduced motion.
- `<AnimatedExpand>` — wraps height-`auto` content in `AnimatePresence` +
  `motion.div` animating `height`/`opacity`, replacing instant
  `{isOpen && …}` snaps. Props: `open: boolean`, `children`.
- `<Reveal>` — `whileInView` fade-up wrapper for panel `<section>`s so each
  settles into view on scroll. Props: `children`, optional `delay`.

All three read `useReducedMotion()` and degrade to no-op.

### 2. `TemplateMembersTable` → interactive data table

Currently a server component rendering a static table. Becomes a client
component (`"use client"`) that owns search / sort / filter state.

- **Pure logic module** `templateMembersTable.ts` (new): `filterMembers`,
  `sortMembers`, `MemberSortKey`, `MemberFilter`. Unit-tested in isolation —
  this is where the "do you understand a unit without reading internals" line
  is drawn.
- **Toolbar:** search input (reuse `ProjectPicker`'s search field styling) +
  filter chips `All | Internal | External | Admin` + live "N of M" count.
- **Sortable headers** (Member, Role, Company, Access, Origin): click toggles
  asc/desc; active column shows an animated caret.
- **Sticky header** (`sticky top-0`), **staggered row entrance**, hover →
  highlight + 1–2px lift + a "View profile" affordance on the row.
- **Row click → opens the shared Users sidebar.** Reuse
  `AuthorProfileDrawer` (lazy-imported exactly as `AccessAnalysisCharts` does),
  fed `member.email`. State (`profileEmail`) lives in `TemplateAnalysisCharts`
  (the existing `"use client"` parent) so the drawer mounts once at page level.
- **Animated reflow** on sort/filter via framer `layout` + `AnimatePresence`.
  **Tradeoff (decided):** render the table as an ARIA grid of `div`s
  (`role="table" / "row" / "columnheader" / "cell"`) instead of `<table>`,
  because framer `layout` does not move `<tr>` children reliably. Native table
  semantics are replaced by explicit ARIA roles; keyboard focus + screen-reader
  structure preserved. The existing test is updated to query by role/text.
- **Empty / no-match state** with a subtle fade.

### 3. `CoordinationByProject`

- Count bars (the `bg-primary/10` width spans) **grow from 0 → pct** on mount.
- Expand drill-down switches from instant `{isOpen && …}` to `<AnimatedExpand>`.
- Clash cards + `TopAuthors` **stagger in** when a project expands
  (`listContainer`/`listItem`).
- Subtle row hover (keep the existing border-hover; add a faint bg + chevron
  nudge). Author-click → drawer already works, unchanged.

### 4. `ProjectPicker`

- Rows **stagger** when the dropdown panel opens (panel already drops in; rows
  currently appear all at once).
- Group collapse/expand becomes height-animated via `<AnimatedExpand>`
  (currently instant `{!isCollapsed && …}`).
- Light polish only on the check/hover micro-states (already decent).

### 5. Cohesion

Wrap each panel `<section>` on both pages in `<Reveal>` so panels settle into
view on scroll — a single consistent entrance across both pages.

## Data flow

No new data. The members table consumes the same `TemplateMember[]` already
passed in. The sidebar (`AuthorProfileDrawer`) self-fetches bulk ACC users via
its existing tRPC queries, gated on a selected email — no fetch until first
row click, then cached. `profileEmail` is lifted to `TemplateAnalysisCharts`.

## Error / edge handling

- Members with no `email` → row is not clickable (no drawer), matching how
  `CoordinationByProject` treats author rows with null email.
- Empty roster → existing "No members found" message, with a fade.
- Search/filter yielding 0 rows → dedicated no-match state.
- Reduced motion → all motion no-ops; layout and interactivity unaffected.
- Long member rosters → stagger cap keeps entrance bounded; reflow stays smooth
  because only visible diffs animate.

## Testing

- New: `templateMembersTable.test.ts` — `filterMembers` / `sortMembers`
  (sort stability, asc/desc, each filter chip, search match).
- Update: `TemplateMembersTable.test.tsx` — query by ARIA role/text; assert
  search filters rows, header click sorts, row click fires the open handler.
- Keep `CoordinationByProject.test.tsx`, `page.test.tsx`,
  `AccessAnalysisCharts.test.tsx` green (motion wrappers must not break queries).
- Manual verification on the live `:3000` build using the safe rebuild pattern
  (`NEXT_DIST_DIR=.next-new` → swap → `npm start`); never `npm run build`
  against the running server.

## Risks

- **`<tr>` → div-grid swap** could regress a11y or a test. Mitigation: explicit
  ARIA roles + update the test; keep visual layout identical.
- **framer `layout` perf** on large rosters. Mitigation: `layout` only on rows,
  capped stagger, no layout animation on the (heavy) sidebar.
- **Bundle weight** from the sidebar on `/template-mty`. Mitigation: lazy import
  (`next/dynamic`, `ssr:false`) exactly as `/access-analysis` does — zero cost
  until the first row click.

## Out of scope / YAGNI

- No column resizing, pagination, virtualization, or CSV export.
- No changes to chart rendering or the folder-terrain canvas.
- No global "animated list" abstraction beyond the three small primitives above.
