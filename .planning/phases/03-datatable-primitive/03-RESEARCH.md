# Phase 3: DataTable Primitive — Research

**Researched:** 2026-06-18
**Domain:** TanStack Table v8 + Virtual v3, virtualized table UI primitive, Phase 1 token integration
**Confidence:** HIGH (stack confirmed in repo; APIs verified via official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Row interactions:**
- Always-visible chevron (left side of row) toggles inline row-expand (quick peek).
- Clicking anywhere else on the row fires `onRowClick` → opens shared slide-in detail panel.
- Inline peek = glance version: short quick-summary of a few key fields rendered in place, without losing scroll position. Deep detail lives in the slide-in panel, not the peek.
- Peek content is page-supplied via a render slot (e.g. `renderExpanded(row)`); the primitive owns the expand/collapse mechanism and animation.
- Expand is one-at-a-time (accordion): opening a row's peek auto-collapses any other open one.
- The expand chevron is always visible on every row (not hover-only).

**Density:**
- Two levels: Comfortable (default) / Compact.
- Density persists in the browser (e.g. localStorage) so it survives reloads/revisits.
- Density toggle lives in the table toolbar, top-right — a small, visible control.
- Compact changes row height + padding only; font size stays constant.

**Sort behavior:**
- Header click cycle is three-state: Ascending → Descending → off (third click clears back to natural order).
- Single-column sort: clicking a new header replaces the current sort (no multi-column).
- Sort indicator = up/down arrow on the active column + a subtle active-header highlight.
- Sort resets to the page's sensible default each visit (each consuming page supplies its own default-sort column via props).

**Visual feel:**
- Frosted-glass sticky header: translucent, blurred, pinned to the top; body content passes softly beneath it. Uses Phase 1's glass token.
- Pinned first column (e.g. Name): casts a soft shadow once the body is scrolled horizontally.
- Rows separated by subtle hairline separators (thin, low-contrast lines). No zebra striping.
- Row hover = background highlight + a slight depth "lift" — tactile, telegraphs that the row opens a panel.

**Empty state:**
- Default empty state = centered subtle icon + a one-line message. Icon and text are overridable per page via props/slots.
- Distinguishes two cases: "no data yet" vs. "no results — try adjusting your filters" (consuming page tells primitive which case via `hasActiveFilter` prop).
- When a filter is the cause, the empty state offers a "Clear filters" button. The primitive exposes the action slot/callback; the page wires the actual reset.

### Claude's Discretion
- Exact prop/slot naming and the `ColumnDef<T>` generic surface (e.g. how column-level `enableSorting`, pinning, and `renderExpanded` are exposed).
- Animation specifics for expand/collapse and hover-lift (must route through Phase 1's motion facade and honor `prefers-reduced-motion`).
- Virtualization tuning (overscan, estimated row size per density), measurement strategy, and the scroll-container structure that keeps the sticky header + pinned column working under virtualization.
- Exact spacing/typography scale per density level, shadow depths, hairline color tokens (must come from Phase 1 tokens, resolve in both themes).
- The demo/test harness used to prove the primitive renders in both themes this phase (since no real page consumes it yet).
- Default icon choice for the empty state.

### Deferred Ideas (OUT OF SCOPE)
- Multi-column sort (Shift-click) — considered and explicitly declined.
- Remembering last sort across visits — declined.
- Three density levels (Spacious/Comfortable/Compact) — declined in favor of two.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FND-05 | A reusable virtualized `DataTable` primitive (sort, sticky header, row-click, inline row-expand, density toggle) is available for table pages | TanStack Table v8 confirmed for sort + expand; Virtual v3 confirmed at ^3.13.24 for virtualized body; Phase 1 tokens confirmed for styling; test patterns confirmed from existing `components/ui/__tests__/` |
</phase_requirements>

---

## Summary

This phase builds a single `components/ui/DataTable.tsx` primitive. The technical stack is nearly fully in place: `@tanstack/react-virtual` v3 is already installed at `^3.13.24`. **The one install this phase requires is `@tanstack/react-table` v8** — currently absent from `package.json`. The current registry version is 8.21.3 [VERIFIED: npm view @tanstack/react-table version]. `react-virtual` is not a v2→v3 concern here because the repo already ships v3; the ROADMAP warning was prophylactic and is resolved.

Phase 1 primitives are complete and confirmed in the repo: `PremiumSurface` (glass variant for the sticky header, base variant for the table shell), the motion facade (`useSafeVariants`, `fadeUp`, `AnimatePresence`), and CSS-var tokens (`--surface-border` for hairlines, `--depth-float` for the hover lift, `--surface-2`/`--surface-border` for the glass header fill) all exist and are importable. No new token work is required.

The critical architectural choice is the **split-table scroll pattern**: the sticky `<thead>` lives in an `overflow-x-auto` wrapper outside the virtualizer's scroll container, while the `<tbody>` lives inside a separate `flex-1 overflow-auto` container that `useVirtualizer` references via `getScrollElement`. This is the only arrangement that keeps `position: sticky top-0` working under `transform`-based virtualization. The pinned first column uses `position: sticky left-0` with a cascading z-index stack. Inline row-expand uses TanStack Table's built-in `getExpandedRowModel` + a custom accordion state override (override `onExpandedChange` to enforce one-at-a-time). Variable-height expanded rows are measured by `useVirtualizer`'s `measureElement` ref callback with `data-index`.

**Primary recommendation:** Install `@tanstack/react-table@^8.21.3`; implement DataTable as a div-within-div split-scroll table where the thead sits in its own overflow-x-auto container above the virtualizer's scroll element. All token and motion imports come from Phase 1 — no new design work.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Sort state (ascending/descending/off) | `DataTable` component (client) | — | Pure client state; TanStack Table manages via `SortingState` |
| Expand state (accordion one-at-a-time) | `DataTable` component (client) | — | TanStack `ExpandedState` overridden to enforce single-row |
| Density toggle + localStorage persist | `DataTable` component (client) | — | UI preference; reads/writes `localStorage` directly |
| Virtualized row rendering | `@tanstack/react-virtual` | — | DOM concern only; data remains in TanStack Table row model |
| Sticky header frosted glass | CSS / Tailwind tokens | PremiumSurface glass | `position:sticky top-0` + Phase 1 glass tokens |
| Pinned first column + scroll shadow | CSS sticky left-0 + JS scroll event | — | `position:sticky left-0`; shadow applied via class toggle on scroll |
| Empty state (no data vs no results) | `DataTable` component (client) | Caller (hasActiveFilter prop) | Caller declares which case; primitive renders the state |
| Animation (expand, hover lift) | Phase 1 motion facade (`AnimatePresence`, `useSafeVariants`) | — | All motion must route through `@/components/ui/motion` |
| Theming (light/dark) | CSS-var tokens from Phase 1 globals.css | — | Pure DOM table; tokens resolve in both themes via CSS vars |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tanstack/react-table` | `^8.21.3` | Headless table logic: sort, expand, column pinning, ColumnDef generics | Industry standard; zero DOM coupling; TypeScript-first; v8 is current |
| `@tanstack/react-virtual` | `^3.13.24` (ALREADY INSTALLED) | Virtualizes the tbody: only visible rows in the DOM | Already in repo; v3 API confirmed working in PersonRowList.tsx |

[VERIFIED: npm registry] `@tanstack/react-table` 8.21.3 confirmed via `npm view @tanstack/react-table version`
[VERIFIED: npm registry] `@tanstack/react-virtual` 3.13.24 confirmed in `package.json` and `package-lock.json`

### Supporting (already in repo — no new install)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `framer-motion` | `^12.40.0` | Animate expand/collapse via `AnimatePresence` | For expand row animation and hover-lift; must import from `@/components/ui/motion` |
| `lucide-react` | `^1.14.0` | Chevron, sort arrows, empty-state icon | Standard icon set already used across the repo |
| `next-themes` | `^0.4.6` | `useTheme` / `resolvedTheme` | Only needed if any inline style (not CSS-var) reads the theme — prefer CSS vars |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| TanStack Table v8 | `react-table` v7 | v7 is unmaintained; v8 is the maintained successor. Do not install v7. |
| Split-scroll sticky thead | `position:sticky` on `<thead>` inside one scroll container | Single-container sticky fails with `transform`-based virtual row positioning — thead disappears on scroll (confirmed GitHub issue #640). Use split-scroll. |
| `useVirtualizer` with `getScrollElement` | `useWindowVirtualizer` | `useWindowVirtualizer` (used by PersonRowList) virtualizes against the full window scroll. A table with a capped height needs `useVirtualizer` + explicit scroll container. |

**Installation:**
```bash
npm install @tanstack/react-table@^8.21.3
```
(`@tanstack/react-virtual` is already installed — no action needed.)

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@tanstack/react-table` | npm | ~8 yrs (v1 2016, v8 2022) | ~4M/wk | github.com/TanStack/table | OK | Approved |
| `@tanstack/react-virtual` | npm | ~5 yrs | ~3M/wk | github.com/TanStack/virtual | OK (already installed) | Approved |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** none

[ASSUMED] Download counts and ages are from training knowledge; the npm registry names are confirmed correct via `npm view` returning 8.21.3 for `@tanstack/react-table`.

---

## Dependency Reality (Critical Question 1)

**`@tanstack/react-virtual`:** `^3.13.24` — INSTALLED. Confirmed in `package.json` dependencies and `package-lock.json` (`node_modules/@tanstack/react-virtual -> 3.13.24`). The ROADMAP's v2→v3 break warning was prophylactic; this repo already runs v3. [VERIFIED: package.json + package-lock.json]

**`@tanstack/react-virtual` v3 API (as used in this repo today):**
The existing `PersonRowList.tsx` uses `useWindowVirtualizer` from v3 with `measureElement`, `getVirtualItems()`, `getTotalSize()`, and `scrollMargin`. The DataTable will use `useVirtualizer` instead (explicit scroll container vs. window scroll). [VERIFIED: PersonRowList.tsx in repo]

**`@tanstack/react-table`:** NOT INSTALLED. `npm view @tanstack/react-table version` returns `8.21.3`. Must be installed this phase. [VERIFIED: package.json inspection + npm registry]

**React version:** `19.2.6` (confirmed in `package.json`). TanStack Table v8 supports React 16.8+ — no compatibility issue. [VERIFIED: package.json]

---

## Phase 1 Primitives API (Critical Question 2)

Phase 1 is complete and merged on this branch. All imports confirmed by reading the actual files.

### PremiumSurface
**File:** `components/ui/PremiumSurface.tsx` [VERIFIED: file read]
```typescript
import { PremiumSurface } from "@/components/ui/PremiumSurface";

interface PremiumSurfaceProps extends React.ComponentProps<"div"> {
  variant?: "base" | "float" | "glass" | "inset";  // defaults to "base"
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}
```
- `variant="glass"` → `rounded-xl bg-surface-2 border border-surface-border backdrop-blur-md` — use for the frosted sticky header.
- `variant="base"` → `.panel-elevated` (layered shadow + catch-light pseudo) — use for the outer table shell.
- No `"use client"` directive — RSC-safe.

### Glass / Frosted Tokens (from globals.css) [VERIFIED: globals.css]
```css
/* Light */
--surface-2: rgba(255, 255, 255, 0.78);
--surface-border: rgba(226, 232, 240, 0.86);
--glass-fill: rgba(255, 255, 255, 0.62);

/* Dark (zinc) */
--surface-2: rgba(24, 24, 27, 0.78);
--surface-border: rgba(63, 63, 70, 0.6);
--glass-fill: rgba(24, 24, 27, 0.72);
```
Tailwind class `bg-surface-2` and `border-surface-border` resolve via the `--color-surface-2` / `--color-surface-border` mapping in `:root` — use these Tailwind classes directly in the sticky thead for glass effect.

### Depth / Shadow Tokens [VERIFIED: globals.css]
```css
/* Light */
--depth-float: 0 8px 40px -8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08);
--glow-primary: 0 0 24px -4px rgba(99,102,241,0.30);

/* Dark */
--depth-float: 0 8px 40px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07);
```
The hover-lift on rows uses `shadow-[var(--depth-float)]` transitioning from no-shadow. The panel shell uses `.panel-elevated` (from `PremiumSurface variant="base"`).

### Hairline / Separator Color [VERIFIED: globals.css]
Use `border-border` (Tailwind) or `border-surface-border` for the subtler version. The existing `TemplateMembersTable` uses `border-border/60` for row hairlines — follow this convention.

### Motion Facade [VERIFIED: components/ui/motion.ts]
**File:** `components/ui/motion.ts`
```typescript
import { motion, AnimatePresence, useSafeVariants, fadeUp, fadeIn, stagger, slideFromRight } from "@/components/ui/motion";
```
- `useSafeVariants(variants)` — zeroes all transition durations when `prefers-reduced-motion: reduce` is active. **MUST be called** on any variant object used for expand/collapse animation.
- `AnimatePresence` — use to animate the expand row mount/unmount (fade in, fade out).
- Usage rule: NEVER `import { motion } from "framer-motion"` directly. Always import from `@/components/ui/motion`.

---

## Existing Table Code to Converge On (Critical Question 3)

### `/users` — PersonRowList.tsx [VERIFIED: file read]
- **Pattern:** Hand-rolled virtualized card list. Uses `useWindowVirtualizer` from `@tanstack/react-virtual` v3.
- **Structure:** Absolute-positioned divs inside a `position:relative` height container. Not a real `<table>`. No TanStack Table instance.
- **Columns (implicit):** Name + email, department, jobTitle, costCenter, phone, StatusPill, AdminPill, 4 FileActivity cells (lazy hover), LastFileActivity, AccBadge — 12-column CSS grid (`grid-cols-[1.5fr_1fr_1fr_1fr_0.8fr_0.8fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto]`).
- **Row click:** `onClick` prop passes up to `onPersonClick`.
- **Row expand:** Not yet implemented. Phase 4 will wire `renderExpanded` from the DataTable primitive.
- **Sort:** Managed by Zustand store (Phase 2). The DataTable primitive will accept sorted data as `data` prop; Phase 4 wires sort columns to the store.
- **Estimated row height:** `estimateSize: () => 72` with `overscan: 8`.
- **The `setMounted` hack:** `const [, setMounted] = useState(false); useEffect(() => setMounted(true), [])` forces a re-render after mount so `scrollMargin: parentRef.current?.offsetTop` picks up the real DOM offset. This pattern is NOT needed for the DataTable (which will use `useVirtualizer` with an explicit `getScrollElement` ref, not `useWindowVirtualizer`).

**Planner must decide (Phase 4, not Phase 3):** Whether Phase 4 replaces PersonRowList entirely with DataTable or adapts it. This phase builds the primitive to fit; Phase 4 wires it in.

### `/template-mty` — TemplateMembersTable.tsx [VERIFIED: file read]
- **Pattern:** Hand-rolled non-virtualized div-based table. No TanStack Table. No virtual.
- **Structure:** CSS grid (`grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto_auto]`) with `role="table"` ARIA semantics.
- **Columns:** Member (name + email), Role, Company, Access (badge), Origin (Internal/External badge).
- **Sort:** Internal local state (`sortKey`, `sortDir`); two-state toggle (no three-state off). Phase 6 will replace this with DataTable's three-state sort.
- **Row click:** `onSelectMember` callback with optional guard (`clickable = !!(mem.email && onSelectMember)`).
- **Row expand:** Not present. Phase 6 wires it via DataTable primitive.
- **Virtualization:** None — the members list is small enough. Phase 6 may keep virtualization off or enable it.
- **Animation:** Uses `motion.div` from framer-motion directly (violates the Phase 1 usage rule). Phase 6 will migrate this to `@/components/ui/motion`.

**Contract the DataTable primitive must satisfy:** `onRowClick(row: Row<T>): void`, `renderExpanded?: (row: Row<T>) => React.ReactNode`, column defs with `enableSorting`, default sort column configurable via `initialState.sorting`.

---

## Virtualization Architecture (Critical Question 4)

### The Core Problem: Sticky Header + transform-based Virtual Rows

`position: sticky` requires the element to be inside its scroll ancestor. When virtual rows use `transform: translateY(...)`, the parent element is `position: relative` and holds the full scroll height. A `<thead>` with `position: sticky top-0` inside this arrangement works — **but only if the sticky element and the scroll container are in the same stacking context.**

**The failure mode** (confirmed GitHub issue #640): If `<thead sticky>` is inside the same `<table>` as the `position:relative` tbody wrapper, the sticky header disappears on scroll because the relative parent traps the stacking context.

**The canonical solution** (confirmed via viprasol.com blog + GitHub discussion #4471): Split the table into two separate DOM trees:

```
<div class="flex flex-col h-full overflow-hidden">            ← outer shell
  <div class="overflow-x-auto">                               ← header scroll sync
    <table class="w-full table-fixed">
      <thead class="sticky top-0 z-10 ...glass tokens...">   ← sticky header (phase 1 glass)
        ...header rows...
      </thead>
    </table>
  </div>

  <div ref={scrollRef} class="flex-1 overflow-auto">         ← virtualizer scroll element
    <div style={{ height: totalSize, position: 'relative' }}> ← virtual canvas
      {virtualRows.map(vr => (
        <div
          key={vr.key}
          data-index={vr.index}
          ref={(el) => virtualizer.measureElement(el)}
          style={{ position:'absolute', top:0, left:0, width:'100%',
                   transform:`translateY(${vr.start}px)` }}
        >
          ...row content...
          {isExpanded && <ExpandContent />}   ← inline peek
        </div>
      ))}
    </div>
  </div>
</div>
```

[CITED: viprasol.com/blog/react-virtual-table — confirmed split-table pattern]
[CITED: github.com/TanStack/virtual/issues/640 — confirmed failure mode of single-container]

> **Important:** The two `<table>` elements will have independent column widths unless you synchronize them via `header.getSize()` and `column.getSize()`. Use `table-fixed` layout + explicit `width` on both `<th>` and the body column containers. The `PremiumSurface glass` wrapper goes on the `<thead>` element (or the outer div housing it), not on the body scroll container.

### Pinned First Column [CITED: tanstack.com/table/v8/docs/guide/column-pinning]

TanStack Table v8 has built-in column pinning via `initialState.columnPinning: { left: ['name'] }`.

The CSS implementation for sticky columns uses:
- Header cell: `sticky left-0 z-30 bg-surface-2 backdrop-blur-md` (glass matches the sticky header)
- Body cell: `sticky left-0 z-10 bg-card` (opaque so body content slides under it)
- Shadow indicator: applied via `column.getIsLastColumn('left')` — add `shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]` to the last left-pinned column when horizontal scroll is active

Scroll-state detection (to show/hide the pinned shadow) requires a `scroll` event listener on the body scroll container, setting a CSS class or state variable when `scrollLeft > 0`.

Key API methods:
```typescript
column.getIsPinned()          // 'left' | 'right' | false
column.getStart('left')       // pixel offset for `left` CSS property
column.getIsLastColumn('left') // boolean — useful for adding box-shadow
column.getIsFirstColumn('right') // boolean
```

### Variable-Height Rows with Inline Expand

`useVirtualizer`'s `measureElement` uses `ResizeObserver` internally. When a row expands, the DOM height changes, `ResizeObserver` fires, and the virtualizer recalculates positions. The `data-index` attribute is required for the virtualizer to map DOM elements back to their indices. [VERIFIED: Virtualizer API docs]

```typescript
const virtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => density === 'compact' ? 48 : 72,  // per density
  measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
  overscan: 5,
});

// In JSX:
<div
  key={virtualRow.key}
  data-index={virtualRow.index}
  ref={(el) => virtualizer.measureElement(el)}
  style={{
    position: 'absolute', top: 0, left: 0, width: '100%',
    transform: `translateY(${virtualRow.start}px)`,
  }}
>
  {/* row content + conditionally: AnimatePresence > expand content */}
</div>
```

The `estimateSize` should return the collapsed row height (density-dependent). When expanded, `measureElement` fires automatically via `ResizeObserver` and recalculates. There is NO manual "notify virtualizer" call needed — `ResizeObserver` handles it. [VERIFIED: TanStack Virtual v3 API docs]

**Pitfall:** The `measureElement` ref must be on the OUTER wrapper div (the one with `data-index`), not on the inner row content. If `measureElement` is on an inner element, the virtualizer measures only that element's height and misses the expanded peek height.

---

## Theme + No-WebGL Constraint (Critical Question 5)

The DataTable is pure DOM + CSS — no canvas, no WebGL. Theme resolution happens entirely via CSS custom properties in `globals.css`. The mechanism: [VERIFIED: globals.css + PremiumSurface.tsx]

```
:root { --surface-2: rgba(255,255,255,0.78); ... }
.dark { --surface-2: rgba(24,24,27,0.78); ... }
```

Tailwind classes like `bg-surface-2`, `border-surface-border`, `border-border` automatically pick up the dark variant when the `.dark` class is on `<html>`. No `useTheme()` hook is needed in DataTable — do not call `useTheme()`. CSS vars resolve correctly in both themes without React involvement.

**Do not call `useTheme()`** in DataTable.tsx. The EChart wrapper calls it because ECharts requires a JavaScript palette object; a DOM table does not. Token-based CSS is sufficient and simpler.

Confirm no-WebGL: `DataTable.tsx` must have zero imports from `@cosmos.gl/*`, `three`, `@react-three/fiber`, `@react-three/drei`, or any canvas/WebGL library. This is a TSC-verifiable constraint.

---

## Test / Demo Harness (Critical Question 6)

### Existing test infrastructure [VERIFIED: vitest.config.ts + vitest.setup.ts + __tests__ directory]

- **Framework:** Vitest 4.1.6 + React Testing Library 16.3.2
- **Environment:** Default `node`; individual files declare `// @vitest-environment jsdom` at top when they need DOM rendering
- **Global mocks in vitest.setup.ts:** `IntersectionObserver` stubbed, `next-auth` mocked, `server-only` mocked
- **Quick run:** `npm test` (runs `vitest run --exclude "**/tests/e2e/**"`)
- **TSC gate:** `npx tsc --noEmit` — must pass before any rebuild

### Jest-dom avoidance rule [VERIFIED: project memory]
The project avoids jest-dom matchers (no `expect(el).toBeInTheDocument()`). Use:
- `expect(el).not.toBeNull()` — element present
- `expect(el.className.includes('foo')).toBe(true)` — class present
- `expect(el.hasAttribute('data-index')).toBe(true)` — attribute present

This is confirmed by reading all existing `components/ui/__tests__/*.test.tsx` files.

### What needs stubbing for DataTable tests
1. **`ResizeObserver`** — the virtualizer uses ResizeObserver for `measureElement`. Add to test file (pattern from DrillSheet.test.tsx): `vi.stubGlobal("ResizeObserver", ResizeObserverStub)`.
2. **`@tanstack/react-virtual`** — the virtualizer's `getTotalSize()` and `getVirtualItems()` return 0/empty in jsdom (no real scroll geometry). **Mock the entire module** to return a predictable set of virtual items:
   ```typescript
   vi.mock('@tanstack/react-virtual', () => ({
     useVirtualizer: () => ({
       getVirtualItems: () => mockItems,
       getTotalSize: () => mockTotal,
       measureElement: vi.fn(),
       options: { scrollMargin: 0 },
     }),
   }));
   ```
3. **`localStorage`** — density persistence reads `localStorage`. In jsdom, `localStorage` is available but starts empty. Tests that verify density persistence should call `localStorage.setItem('datatable-density', 'compact')` before render.
4. **Theme-toggle proof** — since DataTable uses CSS vars (no `useTheme()`), proving both-themes rendering in unit tests means verifying class names / token references in the rendered DOM. A `// @vitest-environment jsdom` test that renders with a mock `next-themes` is NOT needed. Instead, confirm the sticky header carries `bg-surface-2 backdrop-blur-md` (glass classes) — these resolve in both themes via CSS vars.

### Demo without a real consumer page
Options (Claude's discretion per CONTEXT.md):
1. **Storybook story** — not in the repo. Adds tooling overhead. Not recommended.
2. **`components/ui/__tests__/DataTable.test.tsx`** — test renders DataTable with synthetic column defs and 50-row mock data. Asserts: sticky header present, correct class tokens on thead, chevron visible, row click calls handler, expand toggles single row, density toggle updates row height class, empty state renders. This is the established pattern (see PremiumSurface.test.tsx, DrillSheet.test.tsx).
3. **Demo route** (optional, not committed) — a `app/(dashboard)/demo/datatable/page.tsx` for manual visual inspection in both themes. Not a deliverable; for visual UAT during development only.

**Recommendation:** A `DataTable.test.tsx` test file under `components/ui/__tests__/` is sufficient. It proves API contract, class tokens, and behavior without a real consumer. The planner should include it in Wave 0 as a required file.

---

## Architecture Patterns

### Recommended File Structure
```
components/
└── ui/
    ├── DataTable.tsx            ← the primitive (single file, "use client")
    └── __tests__/
        └── DataTable.test.tsx  ← behavioral + token tests
```

No sub-directory. The primitive is one file; complexity lives in the hook it exports internally, not in separate files. If the file exceeds ~300 lines, extract `useDataTableVirtualizer.ts` alongside it.

### Pattern 1: Split-Scroll Table Structure

**What:** The `<thead>` and `<tbody>` live in separate overflow containers. The thead container syncs horizontal scroll with the body container via a shared `scrollLeft` event.

**When to use:** Always, for any DataTable with both a sticky header and virtualized rows using transform-based positioning.

```typescript
// Source: viprasol.com/blog/react-virtual-table + GitHub TanStack/table #4471
// Horizontal scroll sync: when the body scrolls horizontally, mirror to header
function useScrollSync(
  headerRef: React.RefObject<HTMLDivElement>,
  bodyRef: React.RefObject<HTMLDivElement>,
) {
  useEffect(() => {
    const body = bodyRef.current;
    const header = headerRef.current;
    if (!body || !header) return;
    const onScroll = () => { header.scrollLeft = body.scrollLeft; };
    body.addEventListener('scroll', onScroll, { passive: true });
    return () => body.removeEventListener('scroll', onScroll);
  }, []);
}
```

### Pattern 2: ColumnDef<T> with createColumnHelper

```typescript
// Source: tanstack.com/table/v8/docs/guide/column-defs [CITED]
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';

type Person = { name: string; email: string; role: string };
const columnHelper = createColumnHelper<Person>();

export const personColumns: ColumnDef<Person>[] = [
  columnHelper.accessor('name', {
    header: 'Name',
    enableSorting: true,
    cell: info => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('role', {
    header: 'Role',
    enableSorting: true,
  }),
];
```

### Pattern 3: TanStack Table Instance Setup

```typescript
// Source: tanstack.com/table/v8/docs/guide/sorting [CITED]
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getExpandedRowModel,
  flexRender,
  type SortingState,
  type ExpandedState,
} from '@tanstack/react-table';

// Accordion: enforce one-at-a-time by overriding onExpandedChange
const handleExpandChange = useCallback((updater: React.SetStateAction<ExpandedState>) => {
  setExpanded(prev => {
    const next = typeof updater === 'function' ? updater(prev) : updater;
    // If next has more than one key, keep only the newest
    const keys = Object.keys(next);
    if (keys.length > 1) {
      const prevKeys = Object.keys(prev);
      const newKey = keys.find(k => !prevKeys.includes(k));
      return newKey ? { [newKey]: true } : { [keys[keys.length - 1]]: true };
    }
    return next;
  });
}, []);

const table = useReactTable({
  data,
  columns,
  state: { sorting, expanded },
  onSortingChange: setSorting,
  onExpandedChange: handleExpandChange,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getRowCanExpand: () => true,        // all rows can expand (chevron always visible)
  enableSortingRemoval: true,         // allows third-click to clear sort (off state)
  enableMultiSort: false,             // single-column sort only (locked decision)
  initialState: {
    sorting: defaultSort,             // page-supplied via prop
    columnPinning: { left: [pinnedColumn] },  // page-supplied column id
  },
});
```

### Pattern 4: Expand Row Animation via AnimatePresence

```typescript
// Source: Phase 1 motion facade (components/ui/motion.ts) [VERIFIED: repo]
import { AnimatePresence, motion, useSafeVariants, fadeIn } from '@/components/ui/motion';

// Inside the virtual row render:
{row.getIsExpanded() && (
  <AnimatePresence>
    <motion.div
      key={`${row.id}-expand`}
      {...useSafeVariants(fadeIn).hidden}
      animate={useSafeVariants(fadeIn).visible}
      exit={useSafeVariants(fadeIn).hidden}
    >
      {renderExpanded?.(row)}
    </motion.div>
  </AnimatePresence>
)}
```

**Better approach:** Call `useSafeVariants` once at the component level (not per-row), since hooks cannot be called inside loops:
```typescript
const safeExpand = useSafeVariants(fadeIn);
// then per row:
<motion.div initial={safeExpand.hidden} animate={safeExpand.visible} exit={safeExpand.hidden}>
```

### Pattern 5: Density Toggle with localStorage Persist

```typescript
// Pattern: read from localStorage on mount; write on toggle
const DENSITY_KEY = 'datatable-density';
type Density = 'comfortable' | 'compact';

const [density, setDensity] = useState<Density>(() => {
  if (typeof window === 'undefined') return 'comfortable';
  return (localStorage.getItem(DENSITY_KEY) as Density) ?? 'comfortable';
});

const toggleDensity = () => {
  setDensity(d => {
    const next = d === 'comfortable' ? 'compact' : 'comfortable';
    localStorage.setItem(DENSITY_KEY, next);
    return next;
  });
};

// Row height per density (used as estimateSize):
const ROW_HEIGHT: Record<Density, number> = { comfortable: 72, compact: 48 };
```

### Anti-Patterns to Avoid

- **Single scroll container with sticky thead + virtual transform rows:** The thead disappears on scroll. Use the split-scroll pattern. [VERIFIED: GitHub issue #640]
- **Importing `motion` from `framer-motion` directly:** Bypasses `useSafeVariants` and `prefers-reduced-motion` enforcement. Always import from `@/components/ui/motion`. [VERIFIED: project rule in motion.ts]
- **Calling `useTheme()` in DataTable:** Unnecessary; CSS-var tokens resolve in both themes without JavaScript. Would add a dependency on `next-themes` to a primitive that doesn't need it.
- **Putting `measureElement` on an inner child div:** The ref must be on the outermost element that carries `data-index`, so the virtualizer measures the full row height including the expanded peek.
- **Using `useWindowVirtualizer`:** PersonRowList uses it (window-scroll context). DataTable needs a capped-height scroll container, so use `useVirtualizer` with `getScrollElement`.
- **Applying `table-layout: auto` to the split tables:** Column widths will not match between the header table and the body table. Use `table-fixed` + explicit `width` on both `<th>` (header) and cell containers (body).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sort state management (3-state, single-column) | Custom sort reducer | TanStack Table v8 `SortingState` + `getSortedRowModel` | Three-state cycle, multi-column toggle, column-level `enableSorting` — all built-in |
| Row virtualization | Custom viewport tracking + IntersectionObserver | `@tanstack/react-virtual` v3 `useVirtualizer` | ResizeObserver for dynamic heights, overscan, scroll-to-index, smooth scroll — all built-in |
| Row expand model | Custom `expandedRows` Set | TanStack Table v8 `ExpandedState` + `getExpandedRowModel` | `getIsExpanded()`, `getToggleExpandedHandler()`, `getRowCanExpand()` — one-line accordion override |
| Column pinning offsets | Computing `left` pixel values manually | `column.getStart('left')` + `column.getIsPinned()` | TanStack Table computes left offsets accounting for all pinned columns |
| Reduced-motion animation | Checking `window.matchMedia('(prefers-reduced-motion)')` | Phase 1's `useSafeVariants` | Already implemented, tested (15/15 unit tests), and enforced project-wide |

**Key insight:** TanStack Table is a headless data model. It knows nothing about DOM — it only computes sorted/expanded row arrays and column offset values. Virtualization is entirely separate (react-virtual). The split-table DOM structure is the glue. Each layer stays decoupled.

---

## Common Pitfalls

### Pitfall 1: Sticky Header Disappears Under Virtualization
**What goes wrong:** `<thead position:sticky top:0>` inside the same container as `position:relative > absolute-positioned rows` causes the header to scroll away.
**Why it happens:** The `overflow: auto` scroll container clips the sticky element's stacking context; `transform`-based rows don't participate in the flow, so `sticky` has no scroll ancestor to lock to.
**How to avoid:** Split-scroll pattern: thead in its own `overflow-x-auto` div outside the virtualizer's scroll ref. Horizontal scroll synced via a `scroll` event listener.
**Warning signs:** Header is visible at load but disappears after scrolling ~1 row.

### Pitfall 2: Column Width Mismatch Between Header and Body Tables
**What goes wrong:** The header table columns have different widths than body columns, causing visual misalignment.
**Why it happens:** Two separate `<table>` elements cannot share native `<colgroup>` without extra work; `auto` table layout computes widths independently.
**How to avoid:** Set `table-layout: fixed` (Tailwind: `table-fixed`) on both tables. Apply `width: header.getSize()` to every `<th>` and the same `column.getSize()` to every body cell container. Define `size` on each `ColumnDef`.
**Warning signs:** Sort arrows in the header are not above the data they sort.

### Pitfall 3: `measureElement` on Wrong Element
**What goes wrong:** The virtualizer measures only the collapsed row height even after expand.
**Why it happens:** `ref={virtualizer.measureElement}` was placed on an inner div (the visible row), not on the outer `data-index` wrapper that includes the expanded peek content.
**How to avoid:** The `data-index` attribute and the `measureElement` ref MUST be on the same outermost element of each virtual row. The expanded peek is a child of that element — its height is included automatically.
**Warning signs:** Rows overlap after expanding; scroll position jumps.

### Pitfall 4: `useSafeVariants` Called Inside a Map Loop
**What goes wrong:** React throws "more hooks than previous render" when row count changes.
**Why it happens:** Calling `useSafeVariants(fadeIn)` inside the `virtualRows.map(...)` call violates the Rules of Hooks (hooks in loops).
**How to avoid:** Call `useSafeVariants(fadeIn)` once at the component level, store the result, then reference it per row.
**Warning signs:** React hook error: "Rendered more hooks than during the previous render."

### Pitfall 5: Sort Reset Not Working on Navigation
**What goes wrong:** Sort state persists between visits (e.g. sort from `/users` persists if the component stays mounted).
**Why it happens:** `useState` initializer only runs once on mount. If the page doesn't unmount between navigations (Next.js App Router's client-side navigation keeps the component mounted), `defaultSort` is not reapplied.
**How to avoid:** The consuming page (Phase 4, Phase 6) must pass a stable `defaultSort` prop and the table must use it as `initialState.sorting`, NOT as controlled state. TanStack Table's `initialState` only applies once; if pages need a true reset, they should add a `key` to DataTable to force remount on navigation.
**Warning signs:** Table is sorted by last-user-selected column after navigating away and back.

### Pitfall 6: TSC Failures From Test Files
**What goes wrong:** `npx tsc --noEmit` fails on `DataTable.test.tsx` even though the runtime tests pass.
**Why it happens:** The build typechecks ALL files including test files (`ignoreBuildErrors` is not set). Common causes: `vi.mock` factory using incorrect types, generic `DataTable<T>` called with no type argument, or incorrect `ColumnDef` imports.
**How to avoid:** Always run `npx tsc --noEmit` after writing the test file. Use explicit type arguments: `<DataTable<MockRow> columns={...} />`.
**Warning signs:** `npm run build` fails with a TS error in a `.test.tsx` file.

### Pitfall 7: Horizontal Scroll Desync Between Header and Body
**What goes wrong:** When scrolling horizontally, the header stays put while the body moves (or vice versa).
**Why it happens:** The two separate tables are not linked. The `scroll` event handler syncs `scrollLeft` of header to body but misses the body-to-header direction, or the event listener is not cleaned up on unmount.
**How to avoid:** The `useScrollSync` hook must handle both header-to-body and body-to-header sync directions and must include a cleanup in `useEffect`'s return.
**Warning signs:** After horizontal scrolling, a pinned column header no longer lines up with its data.

---

## Code Examples

### Minimal DataTable Props Interface

```typescript
// Source: based on CONTEXT.md locked decisions [VERIFIED: CONTEXT.md]
import type { ColumnDef, Row, SortingState } from '@tanstack/react-table';

export interface DataTableProps<T> {
  /** The data array. Should be pre-filtered/prepared by the calling page. */
  data: T[];
  /** TanStack ColumnDef array — typed to T for full type safety. */
  columns: ColumnDef<T>[];
  /** Called when a non-chevron area of a row is clicked. */
  onRowClick?: (row: Row<T>) => void;
  /** Render slot for the inline expand peek. Receives the TanStack Row<T>. */
  renderExpanded?: (row: Row<T>) => React.ReactNode;
  /** Column ID to pin on the left (e.g. 'name'). */
  pinnedColumn?: string;
  /** Default sort state applied on mount (resets each visit). */
  defaultSort?: SortingState;
  /** Whether a filter is currently hiding rows — controls empty state messaging. */
  hasActiveFilter?: boolean;
  /** Called when the "Clear filters" button in the empty state is clicked. */
  onClearFilters?: () => void;
  /** Custom empty state message override. */
  emptyMessage?: string;
  /** Custom empty-state-with-filter message override. */
  filteredEmptyMessage?: string;
  /** Optional className for the outer shell. */
  className?: string;
}
```

### Minimal useReactTable Setup

```typescript
// Source: tanstack.com/table/v8/docs/guide/sorting + /expanding [CITED]
const table = useReactTable<T>({
  data,
  columns,
  state: { sorting, expanded },
  onSortingChange: setSorting,
  onExpandedChange: handleAccordionExpand,   // custom one-at-a-time enforcer
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  getRowCanExpand: () => true,
  enableSortingRemoval: true,                // three-state: asc → desc → off
  enableMultiSort: false,
  initialState: {
    sorting: defaultSort ?? [],
    columnPinning: pinnedColumn ? { left: [pinnedColumn] } : {},
  },
});
```

### Virtualizer Setup for DataTable

```typescript
// Source: TanStack Virtual v3 API [CITED] + existing PersonRowList.tsx pattern [VERIFIED]
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => density === 'compact' ? 48 : 72,
  measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
  overscan: 5,
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-table` v7 (hook-based, mutable) | TanStack Table v8 (immutable, headless, TS-first) | 2022 | v7 unmaintained; v8 has full TypeScript generics |
| `react-virtual` v2 (`useVirtual` hook) | `@tanstack/react-virtual` v3 (`useVirtualizer` hook) | 2022-2023 | v2 API deprecated; `useVirtual` → `useVirtualizer`; `measureRef` → `measureElement` ref callback |
| `useWindowVirtualizer` for all lists | `useVirtualizer` for capped-height tables, `useWindowVirtualizer` for page-scroll lists | Ongoing | PersonRowList correctly uses window variant; DataTable must use the explicit-container variant |

**Deprecated/outdated:**
- `useVirtual` (react-virtual v2): replaced by `useVirtualizer` in v3. The v2 API used `measureRef` callback; v3 uses `measureElement`. This repo already uses v3.
- `react-table` v7's `useTable`, `useSortBy`, `useExpanded` hooks: completely replaced by v8's unified `useReactTable` + row model pipeline.

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.6 + React Testing Library 16.3.2 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test` |
| Full suite command | `npm test` (same; no separate full-suite command) |
| TSC gate | `npx tsc --noEmit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FND-05-a | DataTable renders columns from `ColumnDef<T>[]` | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-b | Sort header click cycles asc→desc→off | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-c | Expand chevron click opens inline peek; second click collapses | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-d | Accordion: opening row B auto-closes row A | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-e | `onRowClick` fires on non-chevron click | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-f | Density toggle switches row height class; compact/comfortable | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-g | Density persists in localStorage | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-h | Empty state (hasActiveFilter=false) shows no-data message | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-i | Empty state (hasActiveFilter=true) shows filter message + clear button | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-j | Sticky header carries glass token classes (`bg-surface-2 backdrop-blur-md`) | unit | `npm test -- DataTable` | ❌ Wave 0 |
| FND-05-k | `npx tsc --noEmit` exits 0 including DataTable.test.tsx | tsc | `npx tsc --noEmit` | ❌ Wave 0 |
| FND-05-l | No import from WebGL/canvas libraries | unit (import check) | `npm test -- DataTable` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- DataTable` (fast; DataTable tests only)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** `npx tsc --noEmit && npm test`

### Wave 0 Gaps
- [ ] `components/ui/__tests__/DataTable.test.tsx` — covers all FND-05-a through FND-05-l above
- [ ] `ResizeObserver` stub pattern needed (copy from DrillSheet.test.tsx)
- [ ] `@tanstack/react-virtual` mock needed (virtualizer returns 0 items in jsdom without geometry)
- [ ] `@tanstack/react-table` install: `npm install @tanstack/react-table@^8.21.3`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@tanstack/react-table` npm download count ~4M/wk (legitimacy signal) | Package Legitimacy Audit | Low — package legitimacy is not in question; TanStack is a major OSS project |
| A2 | `useVirtualizer.measureElement` triggers ResizeObserver internally in v3 | Architecture Patterns | Medium — if measurement is manual-only, the expand auto-reflow won't work; must verify with integration test |
| A3 | Split-scroll horizontal sync via `scrollLeft` event will not cause visible lag at 60fps | Architecture Patterns | Low — scroll sync is a well-established pattern; can debounce if needed |
| A4 | The estimated row heights (72px comfortable / 48px compact) match the existing PersonRow design | Code Examples | Medium — Phase 4 will set the actual values; planner should treat these as starting estimates |

---

## Open Questions

1. **Row height for PersonRow columns in Phase 4**
   - What we know: PersonRow.tsx currently uses `estimateSize: () => 72` in `useWindowVirtualizer`.
   - What's unclear: Phase 4 will redesign the row visuals. The DataTable primitive's `estimateSize` is density-driven, but the actual rendered height depends on Phase 4's row design.
   - Recommendation: Use 72px/48px as defaults. Phase 4 can override via a prop or by adjusting the density values after the row design is finalized.

2. **Whether to use `<table>/<tr>/<td>` or div-based grid for the body**
   - What we know: The TemplateMembersTable uses divs with ARIA roles. PersonRowList uses divs. The split-scroll pattern works with either.
   - What's unclear: Native `<table>` requires column-width sync (explicit `getSize()`). Div-based grid is simpler but loses native table accessibility semantics.
   - Recommendation: Use native `<table>/<thead>/<tbody>/<tr>/<td>` for accessibility. Apply `table-fixed` and sync widths via `header.getSize()` / `cell.column.getSize()`. This is the TanStack-recommended approach.

3. **Whether `pinnedColumn` is always the first column or can be any column**
   - What we know: CONTEXT.md says "pinned first column (e.g. Name)". Phase 4 will use the Name column. Phase 6's members table may not need a pinned column.
   - What's unclear: TanStack supports pinning any column. The primitive's API could accept `pinnedColumn?: string` (a column ID) or just implicitly pin column index 0.
   - Recommendation: Accept `pinnedColumn?: string` (column ID). If undefined, no column is pinned. Phase 4 passes `'name'`, Phase 6 can pass nothing.

---

## Sources

### Primary (HIGH confidence)
- `package.json` + `package-lock.json` — exact installed versions confirmed
- `components/ui/PremiumSurface.tsx` — full prop interface verified
- `components/ui/motion.ts` — full export surface verified
- `app/globals.css` — all token names and values verified
- `app/(dashboard)/users/PersonRowList.tsx` — v3 API usage confirmed
- `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx` — existing table contract verified
- `vitest.config.ts`, `vitest.setup.ts`, `components/ui/__tests__/*.test.tsx` — test patterns confirmed

### Secondary (MEDIUM confidence)
- [TanStack Table v8 Sorting Guide](https://tanstack.com/table/v8/docs/guide/sorting) — `SortingState`, `getSortedRowModel`, `enableSortingRemoval` APIs confirmed
- [TanStack Table v8 Column Pinning Guide](https://tanstack.com/table/v8/docs/guide/column-pinning) — `getIsPinned()`, `getStart('left')`, `getIsLastColumn()` confirmed
- [TanStack Table v8 Expanding Guide](https://tanstack.com/table/v8/docs/guide/expanding) — `getExpandedRowModel`, `ExpandedState`, accordion pattern confirmed
- [TanStack Virtual v3 Virtualizer API](https://tanstack.com/virtual/v3/docs/api/virtualizer) — `measureElement`, `scrollMargin`, `getVirtualItems()` confirmed
- [TanStack Virtual v3 React hook](https://tanstack.com/virtual/v3/docs/framework/react/react-virtual) — `useVirtualizer` import confirmed
- [TanStack Table v8 ColumnDef Guide](https://tanstack.com/table/v8/docs/guide/column-defs) — `createColumnHelper`, accessor patterns confirmed

### Tertiary (LOW confidence — training knowledge)
- [viprasol.com/blog/react-virtual-table](https://viprasol.com/blog/react-virtual-table/) — split-scroll pattern (architecture cross-verified against GitHub issue #640)
- [GitHub TanStack/table Discussion #4471](https://github.com/TanStack/table/discussions/4471) — sticky column z-index stack

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — packages confirmed via npm + package.json
- Phase 1 APIs: HIGH — read directly from repo files
- Virtualization pattern: MEDIUM-HIGH — confirmed via official docs + cross-verified against two community sources + existing repo usage
- Test patterns: HIGH — read from all existing `components/ui/__tests__/` files

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (TanStack is actively maintained; check for minor version updates on install)
