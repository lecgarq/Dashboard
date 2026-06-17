# Phase 1: Shared Design Foundation — Research

**Researched:** 2026-06-17
**Domain:** Codebase inventory — CSS tokens, ECharts call sites, framer-motion usage, shadcn Sheet, card/panel patterns
**Confidence:** HIGH — all findings from direct codebase grep + file reads, not training data

> SCOPE NOTE: This is a scoped internal codebase inventory, NOT broad external research. All
> standard patterns are already specified in `.planning/research/STACK.md` and
> `.planning/research/ARCHITECTURE.md`. This document locates every existing call site and
> pattern that the shared foundation will replace or consume, so the planner can write
> precise tasks with exact file paths and line numbers.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Balanced premium** — layered shadow + top-edge catch-light; frosted-glass panels as default surface; glow only on selected/accent elements.
- **Accent / glow color: indigo → violet** (`#6366f1 → #8b5cf6`) — for premium glow + selected/active highlight only. Charts keep their multi-color palettes.
- **Motion personality: smooth & flowing** — eased fade-up + gentle stagger, ~0.3–0.4s, soft ease-out. Hard <400ms total entrance budget. Fires once per load (mount/drill only, never on filter change). Must zero out under `prefers-reduced-motion` (content still appears, just instantly).
- **Both themes equal** — tokens, glass, glow, and catch-light dialed against both `:root` (light) and `.dark` (zinc) in lockstep. No single-theme shortcut.
- **Sheet slides from the right, ~480px (medium-wide)**. Single shell is THE drill-target for all four pages. Built empty here; drill sources wired per-page.
- **Subtle global ambient glow** — very faint indigo/violet glow in the page background (pure CSS), so frosted glass has a backdrop to blur against. Must be theme-aware and faint in light mode.
- **Catch-light strength: subtle sheen** — soft low-opacity top-edge highlight. Reads "premium and physical" without looking glossy.

### Claude's Discretion
- Corner roundness of surfaces / panels / Sheet (use existing app convention, e.g. `rounded-xl`, unless reason to change).
- The default `PremiumSurface` variant when a caller doesn't specify one.
- Skeleton / loading-state shimmer styling.
- Exact token alpha values, blur radii, shadow offsets, and easing bezier coefficients (within "balanced premium" + "smooth & flowing").
- Sheet open/close animation specifics (shadcn `Sheet` default animation is acceptable).

### Deferred Ideas (OUT OF SCOPE)
None — Phase 1 context discussion stayed within foundation scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FND-01 | Shared depth/glow/glass design-token set lives in `globals.css`, drives all 4 pages, no hardcoded hex in TSX | Token gap analysis (§1); what's missing identified precisely |
| FND-02 | Reusable `PremiumSurface` card primitive (base / float / glass / inset) replaces ad-hoc panel styling | Ad-hoc card inventory (§2); all existing `panel-elevated` / `bg-card rounded` sites catalogued |
| FND-03 | Single shared `EChart` wrapper auto-applies correct light/dark theme via `resolvedTheme` | 11 `useTheme` call sites located (§3); current `EChart.tsx` is theme-blind |
| FND-04 | Central motion facade exposes reveal/stagger presets, disables motion under `prefers-reduced-motion` | Existing framer-motion usage audited (§4); partial facade already exists in `animated-list.tsx` |
| INT-01 | Single shared slide-in `Sheet` panel mountable as one drill-target for all four pages | `components/ui/sheet.tsx` already exists (§5); no shared DrillSheet wrapper exists yet |
| VIS-06 | Selective real-3D hero accents facade contract; reduced-motion enforcement; framer-motion bump to 12.39.0+ | Motion version confirmed (§4); R3F not yet installed |
</phase_requirements>

---

## Summary

Phase 1 delivers five shared design-language primitives (tokens, PremiumSurface, EChart wrapper, motion facade, Sheet shell) that every subsequent phase imports instead of reinventing. The research confirms the build order and exact scope.

The existing codebase has a rich `globals.css` with surface/shadow/motion tokens already in place, but is **missing the depth/glow/glass tokens** the ARCHITECTURE.md specifies (`--glow-primary`, `--glow-accent`, `--depth-card`, `--depth-float`, `--glass-fill-light/dark`, `--gradient-border`). These must be added in both `:root` and `.dark` blocks — the indigo→violet accent colors align with the CONTEXT.md locked decision.

The existing `EChart.tsx` at `app/(dashboard)/access-analysis/components/EChart.tsx` is a thin pass-through with **no theme awareness** (11 chars of wrapper, no `useTheme`). Every chart component calls `useTheme()` independently — 11 call sites total, across access-analysis, template-mty, and users. The shared wrapper will centralize this.

The shadcn `Sheet` component (`components/ui/sheet.tsx`) already exists and is already used in several places — but there is **no shared "DrillSheet" wrapper** that all four pages share. INT-01 creates that wrapper (empty shell, right slide, ~480px width) that per-page phases populate.

A partial motion facade already exists in `components/ui/animated-list.tsx` (`useEntrance`, `AnimatedExpand`, `Reveal`), but it is not the canonical facade. The new `motion.ts` at `components/ui/motion.ts` supersedes it and sets the import contract.

**Primary recommendation:** Build in this order within Phase 1: (1) add tokens to `globals.css`, (2) create `lib/colors/echartsTheme.ts`, (3) create `components/ui/EChart.tsx` (move + enhance), (4) create `components/ui/PremiumSurface.tsx`, (5) create `components/ui/motion.ts`, (6) create `components/ui/DrillSheet.tsx`. Then `npx tsc --noEmit` to confirm zero TypeScript errors before calling phase complete.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CSS design tokens (depth/glow/glass) | Browser / Client CSS | — | CSS vars resolve in the browser; no server involvement |
| PremiumSurface card primitive | Browser / Client (RSC-safe) | — | Pure CSS composition; no `"use client"` needed |
| EChart wrapper (theme detection) | Browser / Client | — | `useTheme()` is a client hook; canvas rendering is browser |
| Motion facade (framer-motion) | Browser / Client | — | Framer Motion is client-only |
| DrillSheet shell | Browser / Client | — | Radix Dialog (Sheet) requires client state (open/close) |
| `lib/colors/echartsTheme.ts` | Shared (pure TS) | Browser + Server | Pure constants, importable from both RSC and client |

---

## 1. Token Gap Analysis (FND-01)

### What Already Exists in `globals.css`

The file is at `app/globals.css` (650 lines). Currently defined:

**Motion timing tokens** (`:root` only, no dark override needed):
- `--motion-fast: 120ms`
- `--motion-normal: 200ms`
- `--motion-ease: cubic-bezier(0.22, 1, 0.36, 1)`
- `--motion-slow: 480ms`

**Shadow tokens** (in `@theme inline` block, lines 48–51):
- `--shadow-soft-sm`, `--shadow-soft-md`, `--shadow-soft-lg`, `--shadow-soft-xl`
- `--shadow-elevated` (light: line 130, dark: line 218) — the main card elevation shadow

**Surface (glass layer) tokens** — already exist in both `:root` and `.dark`:
- `--surface-1`, `--surface-2`, `--surface-3` (translucent fills, theme-aware)
- `--surface-border` (theme-aware border alpha)

**Status colors**, **chart palette vars** (`--chart-1..5`), **page background** (`--page-bg` with radial gradients already).

**Existing CSS classes** that partially cover depth:
- `.panel-elevated` — solid analytics card with layered shadow + `::after` top-edge catch-light (lines 430–474). This is already the right pattern, but it's a CSS class, not a token set, and it's not parameterized by variant.
- `.ui-paper`, `.glass-card`, `.surface-card`, `.surface-panel` — further surface classes.

### What Is MISSING (must be added)

None of the following tokens exist in `globals.css` today:

```
--glow-primary       (indigo glow for selected/accent)
--glow-accent        (violet glow for secondary accent)
--depth-card         (layered shadow for base card)
--depth-float        (elevated shadow with catch-light inset)
--glass-fill-light   (glass card fill for :root)
--glass-fill-dark    (glass card fill for .dark)
--gradient-border    (gradient border overlay)
--ambient-glow-*     (the page-level indigo/violet background glow blobs — context decision)
```

**Where to add them:**

- Depth/glow tokens with no theme variation: add to `@theme inline` block (lines 6–67) as static values.
- Theme-varying tokens (`--glow-primary`, `--glass-fill-*`, etc.): add at the bottom of `:root` block (after line 159) and the corresponding dark overrides at the bottom of `.dark` block (after line 247).

**Exact insertion points:**

| Token | `:root` insert after | `.dark` insert after |
|-------|---------------------|---------------------|
| `--glow-primary` | line 159 (`--particle-line-alpha`) | line 247 (`--particle-line-alpha`) |
| `--glow-accent` | same | same |
| `--depth-card` | same | same |
| `--depth-float` | same | same |
| `--glass-fill-light/dark` | `:root` only | `.dark` only |
| `--gradient-border` | same | same |

**Ambient background glow** (the context decision for subtle indigo/violet pooling behind all content): the current `--page-bg` in `.dark` already uses near-neutral `rgba(161,161,170,0.05)` blobs. The indigo/violet glow must be swapped in — `rgba(99,102,241,0.06)` top-left, `rgba(139,92,246,0.04)` bottom-right — while keeping it under 8% opacity to not muddy light mode.

**Gotcha — `@theme inline` vs raw `:root`:** Tailwind 4 reads the `@theme inline` block to generate utility classes. Tokens that need Tailwind utilities (e.g., `bg-glow-primary`) must be registered there. Shadow and glow values used only in CSS classes (not Tailwind utilities) can stay in `:root` only.

**Design token recipe** (from ARCHITECTURE.md §2a, adjusted for indigo→violet accent decision):

```css
/* Add to :root (light theme values) */
--glow-primary: 0 0 24px -4px rgba(99, 102, 241, 0.30);    /* indigo glow, light */
--glow-accent:  0 0 32px -8px rgba(139, 92, 246, 0.22);    /* violet glow, light */
--depth-card:   0 1px 3px rgba(0,0,0,0.06), 0 4px 16px -4px rgba(0,0,0,0.08);
--depth-float:  0 8px 40px -8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08);
--glass-fill:   rgba(255,255,255,0.62);                     /* light glass fill */
--gradient-border: linear-gradient(135deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 100%);

/* Add to .dark (dark/zinc override values) */
--glow-primary: 0 0 24px -4px rgba(99, 102, 241, 0.55);    /* indigo glow, stronger on dark */
--glow-accent:  0 0 32px -8px rgba(139, 92, 246, 0.45);
--depth-card:   0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.35);
--depth-float:  0 8px 40px -8px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.07);
--glass-fill:   rgba(24,24,27,0.72);                        /* dark glass fill */
--gradient-border: linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 100%);
```

**Verification contract:** After adding tokens, run `npx tsc --noEmit` — no type errors expected from CSS-only changes.

---

## 2. PremiumSurface Card Primitive (FND-02)

### Existing Ad-hoc Card Patterns to Replace

The following sites use inline class combinations that `PremiumSurface` will consolidate. These are NOT call sites to update in Phase 1 — Phase 1 only creates the primitive. Per-page phases (5, 6) will swap these in. Listed here so the planner knows the scope.

**`/access-analysis` — uses `.panel-elevated` wrapper (already the best pattern):**

| File | Line | Pattern |
|------|------|---------|
| `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` | 197 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` | 138 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx` | 192 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/ModulesPieChart.tsx` | 167 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx` | 198 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx` | 195 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/CoordinationByProject.tsx` | 212 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` | 313 | `<div className="panel-elevated overflow-hidden">` |
| `app/(dashboard)/access-analysis/page.tsx` | 61 | `<header className="surface-card relative overflow-hidden rounded-3xl p-6">` |

**`/template-mty` — also uses `.panel-elevated`:**

| File | Line | Pattern |
|------|------|---------|
| `app/(dashboard)/template-mty/components/ModuleAccessChart.tsx` | 65 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/template-mty/components/PermissionAccessChart.tsx` | 89 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx` | 157 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/template-mty/components/RoleAccessPie.tsx` | 97 | `<div className="panel-elevated p-5">` |
| `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx` | 69 | `<div className="panel-elevated overflow-hidden">` |
| `app/(dashboard)/template-mty/page.tsx` | 38 | `<header className="surface-card relative overflow-hidden rounded-3xl p-6">` |

**`/users` — mixes ad-hoc `bg-card rounded-xl border` patterns:**

Many instances in `app/(dashboard)/users/UsersDirectoryClient.tsx` (lines ~529, ~754, ~848, ~1074, ~1092, ~1153, ~1184, ~1216, ~1234) use `bg-card border-border rounded-xl` with various shadow and hover combinations.

**`/forma-proposal` — sparse, mostly `bg-card` inline:**

`app/(dashboard)/forma-proposal/components/HierarchyView.tsx` lines 263, 279, 303, 309–311 use `bg-card rounded-md border` inline.

### `PremiumSurface` API Contract (from ARCHITECTURE.md §2b)

**File to create:** `components/ui/PremiumSurface.tsx`
- No `"use client"` directive — pure CSS composition, RSC-safe
- Variants: `base` | `float` | `glass` | `inset`
- Optional `glow?: boolean` for indigo glow ring on selected surfaces

**Variant → token mapping:**
- `base` → `--depth-card` shadow + `--gradient-border` pseudo-overlay + `bg-card`
- `float` → `--depth-float` shadow + `backdrop-blur-sm` + `bg-card`
- `glass` → `--surface-2` fill + `--surface-border` border + `backdrop-blur-md`
- `inset` → inverted shadow (recessed panel, `bg-muted/30`)

**Relationship to existing `.panel-elevated`:** `PremiumSurface` variant `base` is the successor to `.panel-elevated`. The CSS class `.panel-elevated` is already well-crafted (includes catch-light `::after`, dual-theme hover) and can be the implementation of `base` variant. Do not delete `.panel-elevated` from `globals.css` — it stays as the backing utility; `PremiumSurface` is the React wrapper.

**Catch-light implementation:** The `.panel-elevated::after` pseudo-element (lines 445–454 in `globals.css`) already implements the catch-light via `background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)` (light) and 0.10 opacity dark version. This is the "subtle sheen" per the CONTEXT.md locked decision. The `PremiumSurface` component must use `position: relative` so the `::after` pseudo renders correctly — or it inherits this from `.panel-elevated`.

---

## 3. EChart Wrapper — Consolidated `useTheme` Call Site Inventory (FND-03)

### Current State of `EChart.tsx`

**File:** `app/(dashboard)/access-analysis/components/EChart.tsx` (24 lines)

The current wrapper is entirely theme-blind:

```typescript
// CURRENT — no theme awareness
export function EChart({ option, height = 280, onEvents, notMerge = true }) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge={notMerge}
      lazyUpdate
      onEvents={onEvents}
    />
  );
}
```

It passes `option` directly to `ReactECharts` with no theme injection. Each consumer must manually handle theme colors.

### Complete `useTheme` Call Site Table

Every file that calls `useTheme()` for ECharts chart coloring — these are the call sites the shared wrapper will eliminate:

| # | File | useTheme line | resolvedTheme usage | Pattern |
|---|------|---------------|---------------------|---------|
| 1 | `app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx` | 3 (import) / 63 (call) | `dark = resolvedTheme !== "light"` | dark flag → PALETTE colors |
| 2 | `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx` | 3 / 62 | `dark = resolvedTheme !== "light"` | dark flag → colors |
| 3 | `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx` | 3 / 62 | `dark = resolvedTheme !== "light"` | dark flag → colors |
| 4 | `app/(dashboard)/access-analysis/components/ActivityTimelineChart.tsx` | 3 / 11 | `dark = resolvedTheme !== "light"` | dark flag → axis/text |
| 5 | `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` | 3 / 62 | `dark = resolvedTheme !== "light"` | dark flag → colors |
| 6 | `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` | 3 / 208 | `dark = resolvedTheme !== "light"` | dark flag → full `Theme` object (NOT ECharts; this is a custom canvas) |
| 7 | `app/(dashboard)/access-analysis/components/ModulesPieChart.tsx` | 3 / 46 | `dark = resolvedTheme !== "light"` | dark flag → `cTitle`, `cSub` tooltip colors |
| 8 | `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx` | 3 / 22 | `dark = resolvedTheme !== "light"` | dark flag → SVG ink/edge colors (NOT ECharts; d3 SVG) |
| 9 | `app/(dashboard)/template-mty/components/RoleAccessPie.tsx` | 3 / 25 | `dark = resolvedTheme !== "light"` | dark flag → ECharts tooltip + slice colors |
| 10 | `app/(dashboard)/template-mty/components/PermissionAccessChart.tsx` | 3 / 19 | `dark = resolvedTheme !== "light"` | dark flag → ECharts axis/tooltip colors |
| 11 | `app/(dashboard)/template-mty/components/ModuleAccessChart.tsx` | 3 / 9 | `dark = resolvedTheme !== "light"` | dark flag → ECharts axis/tooltip colors |
| 12 | `app/(dashboard)/users/StatCardDetail.tsx` | 4 / 17 | `dark = resolvedTheme !== "light"` | dark flag → ECharts donut colors |
| 13 | `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | 22 / 137 | `resolvedTheme` | cosmos.gl graph colors (NOT ECharts; spatial graph) |
| 14 | `app/(dashboard)/users/access-analysis/GraphCanvas.tsx` | 22 / 147 | `resolvedTheme` | cosmos.gl graph colors (NOT ECharts; spatial graph) |
| 15 | `app/(dashboard)/users/access-analysis/MapClusterLabels.tsx` | 22 / 71 | `resolvedTheme` | canvas label colors (NOT ECharts; custom canvas) |
| 16 | `components/dashboard/MailPanel.tsx` | 13 / 942 | `resolvedTheme` | UI theming (NOT ECharts) |

**Sites the EChart wrapper will replace (rows 1–5, 7, 9–12):** These are ECharts components that use `dark` to inject inline hex colors into the `option` object.

**Sites NOT affected by the EChart wrapper (rows 6, 8, 13–16):** These are non-ECharts uses of `useTheme()` — custom canvas, SVG, cosmos.gl, and UI components. They keep their own `useTheme()` calls.

**Additional raw `ReactECharts` usage (not through the shared wrapper):**
- `app/(dashboard)/users/access-analysis/AccessEventsChart.tsx` line 86 — uses `ReactECharts` directly, no `useTheme`. Needs wrapper.
- `app/(dashboard)/users/access-analysis/ComplianceScanPanel.tsx` line 338 — uses `ReactECharts` directly, no `useTheme`. Needs wrapper.

> NOTE: Phase 1 only **creates** the shared `EChart` wrapper at `components/ui/EChart.tsx`. Updating each call site (removing per-component `useTheme`) is Phase 5 work (per-page polish), not Phase 1.

### `EChart` Wrapper Contract (from ARCHITECTURE.md §2c)

**File to create:** `components/ui/EChart.tsx` (new canonical location)
**Old file to keep:** `app/(dashboard)/access-analysis/components/EChart.tsx` stays in place until Phase 5 redirects its consumers. Do NOT delete it in Phase 1.

The new wrapper:
1. Imports `useTheme` from `next-themes` once.
2. Calls `mergeEChartsTheme(option, dark)` — a pure function that injects axis/text colors from `lib/colors/echartsTheme.ts`.
3. Passes `key={resolvedTheme}` to force clean remount on theme switch (prevents stale canvas).
4. Accepts `className` for layout control.

**New file to create:** `lib/colors/echartsTheme.ts` — palette constants. The existing dark theme colors already scattered across chart files are:
- Dark text: `#fafafa` / `#e4e4e7` / `#a1a1aa`
- Dark axis: `#3f3f46`
- Dark tooltip bg: `rgba(24,24,27,0.96)`, border: `#3f3f46`
- Light text: `#111827` / `#374151`
- Light axis: `#e5e7eb`
- Light tooltip bg: `rgba(255,255,255,0.98)`, border: `#e5e7eb`

These are consistent across all components and should be the canonical values in `echartsTheme.ts`.

**Gotcha — notMerge vs key:** Current `EChart.tsx` uses `notMerge={true}` by default. The wrapper should preserve this default. Adding `key={resolvedTheme}` forces full remount; `notMerge` governs update behavior WITHIN a theme. Both are needed.

**Test to verify:** `app/(dashboard)/access-analysis/__tests__/EChart.test.tsx` already exists and mocks `echarts-for-react`. The new wrapper needs its own test at `components/ui/__tests__/EChart.test.tsx` that verifies theme prop is passed and `key` changes on theme switch.

---

## 4. Motion Facade (FND-04, VIS-06)

### Current Framer-Motion State

**Installed version:** `framer-motion: ^12.38.0` (from `package.json` line 104)

**Required version:** `12.39.0+` — the 12.39.0 release fixed "Preserve in-flight motion value animations across React 19 reorder unmount/remount." Without this, layout animations on the users table re-render flicker. React 19 is confirmed installed (`"react": "19.2.6"`, line 116).

**Action required: bump framer-motion from `^12.38.0` to `^12.39.0`** (or `^12.39.0` will resolve to latest 12.x patch). Run `npm install framer-motion@^12.39.0` in Phase 1 Wave 0.

### Existing Framer-Motion Usage Inventory

The following files already import from `framer-motion` directly. They will NOT be updated in Phase 1 (that's per-page work). They are inventoried here so the planner knows the scope of future migration to `components/ui/motion.ts`.

| File | Imports used | Reduced-motion handling |
|------|--------------|------------------------|
| `app/(dashboard)/access-analysis/components/AuthorProfileDrawer.tsx` | `AnimatePresence, motion` | None |
| `app/(dashboard)/access-analysis/components/ProjectPicker.tsx` | `motion` | None |
| `app/(dashboard)/access-analysis/components/CoordinationByProject.tsx` | `motion, useReducedMotion` | YES — `const reduce = useReducedMotion()` at line 174 |
| `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx` | `motion` | None |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | `motion, AnimatePresence` | None |
| `app/(dashboard)/users/access-analysis/CatalogCollapse.tsx` | `AnimatePresence, motion` | None |
| `app/(dashboard)/users/access-analysis/RightPanelStack.tsx` | `AnimatePresence, motion` | None |
| `components/ui/animated-list.tsx` | `AnimatePresence, motion, useReducedMotion` | YES — full `useReducedMotion` guard |
| `components/ui/PageTransition.tsx` | `motion` | None |
| `components/ui/stat-tile.tsx` | `motion` | None |

**Key observation:** `components/ui/animated-list.tsx` already contains `useEntrance()`, `AnimatedExpand`, and `Reveal` — these ARE reduced-motion-safe and use the same `EASE = [0.22, 1, 0.36, 1]` that ARCHITECTURE.md specifies. The new `motion.ts` must be a superset of this — it exports `motion`, `AnimatePresence`, and the variant presets (`fadeUp`, `stagger`, etc.) while `animated-list.tsx` stays as-is (it already is the right pattern).

**globals.css already handles CSS animation reduced-motion** at lines 572–620: a `@media (prefers-reduced-motion: reduce)` block zeros `animation-duration` and `transition-duration` for all elements, and separately disables the named animation classes. This covers CSS-only animations. The `motion.ts` facade handles Framer Motion component animations.

### `motion.ts` Contract (from ARCHITECTURE.md §2e)

**File to create:** `components/ui/motion.ts`
- No `"use client"` directive on the module (the hooks inside components enforce it)
- Re-exports `motion`, `AnimatePresence` from `framer-motion`
- Exports named variant presets that match the CONTEXT.md "smooth & flowing" personality:
  - `fadeUp` — `{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } } }` (within 0.3–0.4s budget)
  - `fadeIn` — opacity-only for simpler cases
  - `stagger` — `{ visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } }` (0.06s stagger × 6 items = 0.36s total < 400ms budget)
  - `slideFromRight` — for panel enter (Sheet complement)
- Exports `useSafeVariants<T>(variants: T): T` — hook that returns variants with `duration: 0` when `useReducedMotion()` is true

**Import contract:** Phase 1 establishes the rule "never import `framer-motion` directly in page components — always import from `@/components/ui/motion`." This is enforced by convention in Phase 1 and can be enforced by ESLint rule in a future phase.

**Gotcha — `motion.ts` vs `motion.tsx`:** Named `motion.ts` (not `.tsx`) because it exports variants and hooks, not JSX. If JSX is needed (e.g., a `MotionDiv` helper), use `.tsx`. Keep as `.ts` per ARCHITECTURE.md spec.

---

## 5. Shared Sheet Shell (INT-01)

### Current State

**`components/ui/sheet.tsx`** (144 lines) already exists. It is the shadcn Sheet built on `radix-ui` `Dialog`. It exports: `Sheet`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`.

The `SheetContent` component (lines 47–86) currently defaults to `side = "right"` and `sm:max-w-sm` width. The INT-01 requirement is ~480px (medium-wide), which means the shell wrapper needs to override this width.

**Existing Sheet usage in the codebase (sites the DrillSheet will eventually replace in per-page phases):**

| File | Line | Width/side | Content |
|------|------|------------|---------|
| `app/(dashboard)/users/UsersDirectoryClient.tsx` | 2458–2469 | `sm:max-w-lg` (512px), right | `UserActivityBody` |
| `app/(dashboard)/settings/users/page.tsx` | 602–731 | `w-[400px] sm:w-[540px]`, right | User profile (settings-specific) |
| `app/(dashboard)/users/dashboard/DashboardSidePanel.tsx` | 94–116 | `sm:max-w-lg` (512px), right | Multiple content types via AnimatePresence |

**No shared `DrillSheet` wrapper exists** — each of the above is a locally-owned `<Sheet>` instance.

**`UserProfilePanel.tsx`** at `app/(dashboard)/users/UserProfilePanel.tsx` is the shared content component that shows inside a Sheet/rail. It has a `variant?: "dialog" | "rail"` prop. Phase 1 creates the SHELL (`DrillSheet`); `UserProfilePanel` is the CONTENT (already exists).

### DrillSheet Contract (INT-01)

**File to create:** `components/ui/DrillSheet.tsx`

```typescript
// components/ui/DrillSheet.tsx
// "use client" required — Sheet manages open/close state

interface DrillSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
}
```

- Wraps `Sheet` + `SheetContent` with fixed `side="right"` and `className="w-[480px]"` (medium-wide per CONTEXT.md decision)
- Includes `SheetHeader` with optional title/description
- Uses `PremiumSurface` styling on the content area (`glass` variant or matching the page's surface depth)
- Open/close controlled externally (no internal toggle trigger) — page phases wire the trigger

**Phase 1 scope:** Build the empty shell. Do NOT wire any content sources. The `children` prop accepts any content; per-page phases pass `<UserProfilePanel>` or list content.

**Width decision:** `sm:max-w-sm` (384px, shadcn default) is too narrow for a profile with mini-charts + list. `sm:max-w-lg` (512px) is the current `UsersDirectoryClient` Sheet width. The CONTEXT.md decision is ~480px — use `w-[480px]` as a fixed class (not `sm:max-w-*`) to be precise.

**Animation:** The shadcn Sheet default animation (CSS `data-[state=open]:slide-in-from-right`, `data-[state=closed]:slide-out-to-right`) is explicitly acceptable per CONTEXT.md. No Framer Motion wrapping needed on the Sheet itself. The `duration-500` (500ms) on open is slightly over the "smooth & flowing" ~400ms budget — override with `data-[state=open]:duration-350` via className if needed.

**Gotcha — `radix-ui` vs `@radix-ui/*`:** `components/ui/sheet.tsx` imports from `radix-ui` (the unified package, line 5: `import { Dialog as SheetPrimitive } from "radix-ui"`). This is the correct import — `package.json` has `"radix-ui": "^1.4.3"`. Do not import from `@radix-ui/react-dialog` separately.

---

## 6. Ambient Background Glow (CONTEXT.md decision)

The CONTEXT.md locked "subtle global glow — a very faint indigo/violet glow pooling in the page background." The current `--page-bg` dark value uses neutral zinc blobs. This needs to be updated in `globals.css` to add indigo/violet tints.

**Current dark `--page-bg` (lines 238–244):**
```css
--page-bg:
  radial-gradient(circle at top left, rgba(161, 161, 170, 0.05), transparent 35%),
  radial-gradient(circle at 85% 15%, rgba(244, 244, 245, 0.03), transparent 30%),
  radial-gradient(circle at 80% 100%, rgba(113, 113, 122, 0.04), transparent 28%),
  linear-gradient(180deg, #09090B 0%, #050507 100%);
```

**Target dark `--page-bg` (add indigo/violet glow):**
```css
--page-bg:
  radial-gradient(circle at top left, rgba(99, 102, 241, 0.06), transparent 35%),   /* indigo */
  radial-gradient(circle at 85% 15%, rgba(139, 92, 246, 0.04), transparent 30%),   /* violet */
  radial-gradient(circle at 80% 100%, rgba(99, 102, 241, 0.03), transparent 28%),  /* indigo */
  linear-gradient(180deg, #09090B 0%, #050507 100%);
```

**Light mode `--page-bg` (lines 150–155):** The existing light page-bg uses blue/amber/teal radials. Keep as-is but verify the indigo hue doesn't conflict — the existing `rgba(37, 99, 235, 0.10)` is close enough to indigo; no change needed in light mode.

---

## 7. Common Pitfalls

### Pitfall 1: `EChart` wrapper in the wrong location
**What goes wrong:** Creating the wrapper inside `access-analysis/components/` again (the current wrong location) means template-mty and users imports break.
**How to avoid:** Create ONLY at `components/ui/EChart.tsx`. Leave `app/(dashboard)/access-analysis/components/EChart.tsx` intact until Phase 5 redirects consumers.

### Pitfall 2: `motion.ts` without `"use client"` guard on hooks
**What goes wrong:** `useSafeVariants()` calls `useReducedMotion()` — a React hook. Importing `motion.ts` in a Server Component will fail.
**How to avoid:** `useSafeVariants` is a hook (starts with `use`), so callers must be client components. The module-level exports (`motion`, `AnimatePresence`, `fadeUp`, etc.) are safe to import anywhere. Mark the file with `"use client"` only if needed by hooks; the `motion` re-export itself is fine without it.

### Pitfall 3: `PremiumSurface` with `position: static` breaks catch-light
**What goes wrong:** The `.panel-elevated::after` pseudo-element uses `position: absolute` — if the parent `PremiumSurface` root div has `position: static`, the pseudo renders outside the card bounds.
**How to avoid:** Always apply `position: relative` (or `className="relative"`) on the outer `PremiumSurface` div. This is already documented in the `.panel-elevated` source.

### Pitfall 4: `key={resolvedTheme}` on EChart causes flash during SSR hydration
**What goes wrong:** On first load, `resolvedTheme` is `undefined` before `next-themes` resolves. `key={undefined}` then `key="dark"` causes a remount that flashes.
**How to avoid:** Default `dark = resolvedTheme !== "light"` (which is `true` when `undefined`) — the chart renders dark by default and stays there if the user is in dark mode. Only a light-mode user sees a brief dark→light flash; acceptable tradeoff vs. the complexity of hydration suppression.

### Pitfall 5: `globals.css` Tailwind 4 `@theme inline` vs plain CSS custom properties
**What goes wrong:** Adding a CSS var inside `@theme inline` that uses another CSS var (e.g., `--depth-card: var(--shadow-soft-lg)`) breaks Tailwind 4's static analysis — `@theme inline` vars must be static values, not var references.
**How to avoid:** Token values inside `@theme inline` must be literal. Computed/var-referencing tokens go in `:root` / `.dark` as plain CSS custom properties.

### Pitfall 6: `npx tsc --noEmit` fails on test files
**What goes wrong:** The build typechecks the whole tree including test files. Any change to a component's prop interface that test files reference will fail `tsc` even if `next build` seems fine.
**How to avoid:** After creating `EChart.tsx` and `PremiumSurface.tsx`, check `app/(dashboard)/access-analysis/__tests__/EChart.test.tsx` — it imports from the OLD path. Do NOT move the old file; only CREATE the new one at `components/ui/EChart.tsx`. The old EChart test stays pointing to the old file.

### Pitfall 7: `Sheet` width conflicts with existing `sm:max-w-sm` default
**What goes wrong:** `SheetContent` defaults to `sm:max-w-sm` (lines 64–66 of `sheet.tsx`). If `DrillSheet` passes `className="w-[480px]"` without resetting the default, Tailwind's cascade may not override the responsive `sm:max-w-sm`.
**How to avoid:** Use `tailwind-merge` (`cn()`) in `DrillSheet` and explicitly pass `className="w-[480px] sm:w-[480px]"` to override the `sm:max-w-sm` default.

---

## 8. Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme-aware chart colors | Per-chart `useTheme` + inline hex | Shared `EChart` wrapper + `echartsTheme.ts` | 11 separate call sites already causing drift |
| Slide-in panel | Custom CSS `translate` + `useState` | shadcn `Sheet` (already in codebase) | Accessibility (focus trap, escape-key, aria) built in |
| Reduced-motion guard | CSS-only `prefers-reduced-motion` query | `useReducedMotion()` from framer-motion | CSS can't zero Framer Motion JS animations |
| Catch-light on cards | Manual `::after` in each component | `.panel-elevated::after` in `globals.css` (already exists) | Already dual-theme, already tested |
| Token interpolation in ECharts | `getComputedStyle()` at runtime | Static palette in `echartsTheme.ts` | `getComputedStyle` on canvas elements returns empty string |

---

## 9. Requirement Coverage

| Req ID | Deliverable | Concrete Work |
|--------|-------------|---------------|
| FND-01 | Depth/glow/glass tokens in `globals.css` | Add 7 missing tokens to `:root` + `.dark`; update `--page-bg` dark for indigo/violet ambient glow |
| FND-02 | `PremiumSurface` card primitive | Create `components/ui/PremiumSurface.tsx` (RSC-safe, 4 variants, wraps `.panel-elevated`) |
| FND-03 | Shared `EChart` wrapper | Create `components/ui/EChart.tsx` + `lib/colors/echartsTheme.ts`; leave old file intact |
| FND-04 | Motion facade | Bump framer-motion to `^12.39.0`; create `components/ui/motion.ts` with `fadeUp`/`stagger`/`useSafeVariants` |
| INT-01 | Empty `DrillSheet` shell | Create `components/ui/DrillSheet.tsx` (right, 480px, empty children); no content sources wired |
| VIS-06 | 3D facade contract + reduced-motion | `motion.ts` exports facade contract; `useSafeVariants` enforces zero-duration under reduced-motion; R3F NOT installed in Phase 1 (accents are Phase 4/6 scope) |

---

## 10. framer-motion Version Bump

**Current installed:** `^12.38.0` (resolves to `12.38.x`)
**Required:** `^12.39.0` (React 19 layout-animation fix)

**Command:**
```bash
npm install framer-motion@^12.39.0
```

This is a Wave 0 task in Phase 1 — bump before any motion facade work. The API is stable across 12.x; no migration needed.

**Why it matters for this project specifically:** The `/users` decomposition (Phase 2) will introduce layout animations on the table. If framer-motion is not at 12.39.0+, those layout animations will flicker on React 19's concurrent unmount/remount during reordering. Phase 1 bumps it preventively.

---

## 11. Build / Test Verification Contract

**After Phase 1 completion, these gates must pass:**

```bash
npx tsc --noEmit          # 0 type errors (including test files)
npm test                  # vitest run — existing tests green; new wrapper tests green
```

**No `next build` required** for Phase 1 — token additions and new primitives don't require a full build to verify. The deploy mechanism (rebuild + restart) is invoked at the phase review point.

**New tests to write in Phase 1:**
- `components/ui/__tests__/EChart.test.tsx` — renders with mock, verifies `key={resolvedTheme}` prop
- `components/ui/__tests__/PremiumSurface.test.tsx` — renders each of the 4 variants, verifies correct class names
- `components/ui/__tests__/DrillSheet.test.tsx` — renders open/closed, verifies width class, verifies children render

---

## 12. Environment Availability

No external dependencies beyond the project's own codebase. All required packages are already installed:

| Dependency | Required By | Available | Version |
|------------|------------|-----------|---------|
| framer-motion | motion facade, VIS-06 | ✓ (needs bump) | 12.38.0 → 12.39.0+ |
| echarts / echarts-for-react | EChart wrapper | ✓ | 6.1.0 / 3.0.6 |
| next-themes | EChart theme detection | ✓ | 0.4.6 |
| radix-ui (Sheet) | DrillSheet | ✓ | 1.4.3 |
| tailwindcss | token utilities | ✓ | 4.3.0 |

**NOT needed in Phase 1** (per VIS-06 scope): `@react-three/fiber`, `@react-three/drei`. R3F accents are Phase 4 (`/users` header) and Phase 6 (`/forma-proposal` background).

---

## Open Questions (RESOLVED)

1. **`PremiumSurface` default variant when unspecified**
   - What we know: CONTEXT.md leaves this to Claude's discretion.
   - RESOLVED — Recommendation: `"base"` — it's the most universally applicable (no glass blur cost, no elevation ambiguity). Callers opt into `float` or `glass` explicitly.

2. **`DrillSheet` — does the shell need a loading state?**
   - What we know: Phase 1 builds an empty shell. Per-page phases wire content.
   - RESOLVED — Recommendation: Include a minimal `Skeleton` fallback inside `DrillSheet` that renders when `children` is null or a Suspense boundary is used. Use the existing `components/ui/skeleton.tsx`.

3. **`animated-list.tsx` relationship to `motion.ts`**
   - What we know: `animated-list.tsx` already has `useEntrance`, `AnimatedExpand`, `Reveal` — all reduced-motion-safe. The new `motion.ts` is the canonical facade.
   - RESOLVED — Recommendation: Do NOT deprecate or modify `animated-list.tsx` in Phase 1. It is imported by existing components; changing it risks regressions. The new `motion.ts` is the forward-facing contract for new code only.

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `app/globals.css` — full token audit, lines 1–650
- `app/(dashboard)/access-analysis/components/EChart.tsx` — current wrapper, 24 lines
- `components/ui/sheet.tsx` — existing Sheet component, 144 lines
- `components/ui/animated-list.tsx` — existing reduced-motion utilities
- `package.json` — confirmed package versions (lines 46–132)
- All grep results for `useTheme`, `ReactECharts`, `panel-elevated`, `framer-motion` imports

### Secondary (MEDIUM confidence — planning docs authored 2026-06-17)
- `.planning/research/STACK.md` — token recipes, EChart wrapper contract, motion patterns
- `.planning/research/ARCHITECTURE.md` — component architecture, `PremiumSurface` API, motion patterns
- `.planning/phases/01-shared-design-foundation/01-CONTEXT.md` — locked decisions from user discussion

---

## Metadata

**Confidence breakdown:**
- Token gap analysis: HIGH — direct `globals.css` read; gaps confirmed by absence search
- EChart call sites: HIGH — grep verified, all 16 sites located with file:line
- framer-motion usage: HIGH — grep verified, 10 files with exact imports
- Sheet state: HIGH — `components/ui/sheet.tsx` read directly; no `DrillSheet` confirmed absent
- Architecture patterns: HIGH — specs in `.planning/research/` written day-of by deep codebase inspection

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable codebase; token gaps won't auto-fill; EChart call sites stable)
