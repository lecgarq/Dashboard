# Architecture Patterns — Premium UI/UX Overhaul

**Domain:** Front-end presentation layer on existing Next.js 16 / React 19 app
**Researched:** 2026-06-17
**Confidence:** HIGH — based on direct codebase inspection of all four target pages

---

## Recommended Architecture

The overhaul is a **presentation layer surgery** on an already healthy server-driven hybrid. The backend (RSC page loaders → view functions → Prisma) is correct and must not change. All five axes (speed, depth, interactivity, cohesion, motion) are addressed by work in exactly three zones: a shared design-language foundation, the `/users` monolith decomposition, and per-page polish applied uniformly on top.

```
┌─────────────────────────────────────────────────────────────┐
│                  Shared Design Foundation                    │
│  CSS vars  │  PremiumSurface  │  EChartWrapper  │  motion  │
│  (already seeded in globals.css)   +  new tokens +  hooks  │
├──────────────┬──────────────┬──────────────┬───────────────┤
│  /users      │ /access-     │ /template-   │ /forma-       │
│  decomposed  │ analysis     │ mty polish   │ proposal      │
│  UsersDirCtx │ (cleanest)   │              │ HierarchyView │
│  + DataTable │ depth + new  │ depth only   │ split         │
│  + panels    │ analytics    │              │               │
├──────────────┴──────────────┴──────────────┴───────────────┤
│               RSC page loaders (UNCHANGED)                  │
│      view functions → Prisma → PostgreSQL (UNCHANGED)       │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Component Decomposition

### 1a. The `/users` Monolith (2,474 lines → ~8 files)

`UsersDirectoryClient.tsx` is a single `"use client"` boundary carrying: 6+ tRPC queries, 15+ `useState` declarations, a virtual window list, a data grid, a detail modal, an activity audit panel, filter pills, a toolbar, and multiple pure helper functions. It must be split without breaking the existing behavior contracts.

**Extraction boundaries — recommended file map:**

| New File | Lines extracted from | Responsibility |
|---|---|---|
| `useDirectoryStore.ts` | lines 1252–1295 (state) | Zustand store: search, groupBy, filters, activitySort, viewMode |
| `useDirectoryData.ts` | lines 1386–1494 (queries) | All tRPC query calls — returns merged user objects |
| `DirectoryToolbar.tsx` | lines ~1330–1380 | Search input, view-mode toggle, group-by, filter popover |
| `ActiveFilterStrip.tsx` | lines 1033–1085 | Active filter chips (already mostly isolated: `ActiveFilterPill`) |
| `PersonCard.tsx` | lines 742–802 | Grid-mode card (already named, extract file) |
| `PersonRow.tsx` | lines 803–904 | List-mode row + `FileActivityCell` + `LastFileActivityCell` |
| `PersonRowList.tsx` | lines 904–998 | Window-virtualized list wrapper (already named) |
| `PersonDetailModal.tsx` | lines 513–621 | Detail dialog (already named) |
| `ActivityAuditPanel.tsx` | lines 1105–1246 | Side panel content |
| `DataCoverageStrip.tsx` | lines 1086–1104 | Coverage pill row |
| `UsersDirectoryClient.tsx` (shell) | remaining ~200 lines | Orchestrator: imports data hook, renders toolbar + list/grid + panels |

**Key rules for the split:**
- The Zustand store (`useDirectoryStore`) must be created FIRST — everything else reads from it instead of passing callbacks down 4 levels.
- `useDirectoryData` owns ALL tRPC calls; sub-components receive data via props or context. This prevents the React Query hydration duplication bug (the prior `undefined → { permSummary, activityMix }` cache-key mismatch).
- `PersonCard` and `PersonRow` receive `activatedEmails` set + `onHoverEnter/Leave` via context, not prop-drilled from the shell.
- `ModuleBadge` and `MODULE_BADGE_COLORS` move to `components/ui/ModuleBadge.tsx` — they are already reused by `DashboardSidePanel` and belong in the shared layer.

### 1b. HierarchyView (315 lines) — `/forma-proposal`

This file is a contained SVG canvas with pan/zoom + d3-hierarchy layout. It is less of a "monolith" problem and more a "depth + interactivity" problem. The split is surgical:

| New File | Responsibility |
|---|---|
| `useHierarchyLayout.ts` | Pure hook: d3-hierarchy computation + collapse state; no rendering |
| `HierarchyCanvas.tsx` | SVG pan/zoom + node/link rendering; receives layout from hook |
| `HierarchyView.tsx` (shell) | Thin: wires hook → canvas, exports the public API unchanged |

`TierMenuItems` and `OrgNode` already in separate files — leave them.

---

## 2. Shared Design-Language Foundation

All four pages must feel like one product. The required shared layer is:

### 2a. Design Token Extension (globals.css — already partially done)

The existing `globals.css` already has:
- Full light/dark semantic tokens (`--background`, `--card`, `--muted`, `--chart-1..5`)
- Surface glass layers (`--surface-1..3`, `--surface-border`)
- Motion timing vars (`--motion-fast`, `--motion-normal`, `--motion-slow`, `--motion-ease`)
- Shadow tokens (`--shadow-soft-sm..xl`, `--shadow-elevated`)

**Gaps to add — depth tokens:**

```css
/* 2.5D depth enhancement tokens */
--glow-primary: 0 0 24px -4px rgba(59, 130, 246, 0.35);        /* light: tint glow */
--glow-accent: 0 0 32px -8px rgba(124, 58, 237, 0.28);
--depth-card: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px -4px rgba(0,0,0,0.08); /* layered */
--depth-float: 0 8px 40px -8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.08);
--glass-fill-light: rgba(255,255,255,0.62);
--glass-fill-dark: rgba(24,24,27,0.72);
--gradient-border: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.04) 100%);
```

### 2b. PremiumSurface Primitive

Create `components/ui/PremiumSurface.tsx` — a single reusable card primitive that all four pages use. It is the "one design language" carrier.

```typescript
// components/ui/PremiumSurface.tsx
// "use client" NOT needed — pure CSS composition, RSC-safe

interface PremiumSurfaceProps {
  variant?: "base" | "float" | "glass" | "inset";
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}
```

- `base`: standard card with `--depth-card` shadow + subtle `--gradient-border`
- `float`: elevated with `--depth-float` + gentle `backdrop-blur-sm`
- `glass`: `--surface-2` fill + `--surface-border` border + `backdrop-blur-md`
- `inset`: recessed look for inner panels (inverted shadow)

This primitive replaces the ad-hoc `bg-card border-border rounded-xl shadow-...` patterns scattered across all four pages.

### 2c. Shared EChart Wrapper

The current `EChart.tsx` at `access-analysis/components/EChart.tsx` does not read `resolvedTheme` — each chart component calls `useTheme()` independently. This creates drift (some charts forget). Move to `components/ui/EChart.tsx`:

```typescript
// components/ui/EChart.tsx — "use client" required
import { useTheme } from "next-themes";
import ReactECharts from "echarts-for-react";

export function EChart({ option, height, onEvents, notMerge, className }: EChartProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default dark before resolve
  // Inject theme-aware text/axis colors automatically via option merge:
  const themedOption = mergeEChartsTheme(option, dark);
  return <ReactECharts option={themedOption} ... />;
}

// mergeEChartsTheme: inject textStyle.color, axisLabel.color, splitLine.lineStyle.color
// from CSS vars resolved at call time — no per-chart useTheme() needed
```

Every chart then drops its own `useTheme` call and just passes the data option.

### 2d. Shared Data-Table Component

`/users` currently has no real table — it uses a virtualized grid/list hybrid. The premium redesign needs a proper sortable, clickable data-table primitive. Use TanStack Table (already in `@tanstack/react-query` ecosystem; TanStack Table is a sibling package — add `@tanstack/react-table`).

Create `components/ui/DataTable.tsx`:
- Column definitions typed with `ColumnDef<T>`
- Built-in click handler row prop (`onRowClick`)
- Virtualized body via `@tanstack/react-virtual` (already in `package.json`)
- Sticky header
- Sort indicators via Tailwind chevrons (no third-party icons)

Used by `/users` (main redesign) and `/template-mty` (members table).

### 2e. Motion Primitive

Create `components/ui/motion.ts` — a thin re-export facade over Framer Motion that enforces reduced-motion compliance:

```typescript
// components/ui/motion.ts
"use client";
import { useReducedMotion } from "framer-motion";
export { motion, AnimatePresence } from "framer-motion";

// Shared variant presets — import from here, not inline in components
export const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } },
};
export const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.18 } },
};
export const stagger = { visible: { transition: { staggerChildren: 0.04 } } };

// Hook: returns variants that are instant when user prefers reduced motion
export function useSafeVariants<T extends object>(variants: T): T { ... }
```

Rule: **never import from `framer-motion` directly in page components** — always import from `@/components/ui/motion`. This makes reduced-motion enforcement a single-point change.

---

## 3. Perceived-Speed Architecture

### 3a. /access-analysis — 7 Parallel Loaders (most critical)

**Current:** All 7 loaders fire in a single `Promise.all` in the RSC page. The page only renders after ALL complete — the slowest loader (terrain, ~9s on first hit) blocks everything.

**Fix: split into two Suspense tiers.**

```tsx
// app/(dashboard)/access-analysis/page.tsx
// Tier 1 — fast (< 500ms): KPIs, role donut, module donut, activity donut
// Tier 2 — medium (500ms–3s): timeline, coverage badges
// Tier 3 — slow (3s+): terrain (lazy), coordination panel (lazy)

export default async function AccessAnalysisRoute() {
  // Tier 1: fire immediately, smallest data
  const tier1 = Promise.all([loadInstanceView(), loadModuleActivity(), loadActivityByActor()]);

  return (
    <div className="h-full overflow-y-auto">
      <Suspense fallback={<KPIStripSkeleton />}>
        <Tier1Charts promise={tier1} />
      </Suspense>
      <Suspense fallback={<TimelineSkeleton />}>
        <ActivityTimeline /> {/* separate RSC that loads its own view */}
      </Suspense>
      <Suspense fallback={<TerrainSkeleton />}>
        <FolderPermissionTerrainPanel /> {/* separate RSC, loads terrain */}
      </Suspense>
    </div>
  );
}
```

Each `Suspense`-wrapped RSC fires its own data load — the first tier renders in ~300–500ms, the terrain renders when ready (~9s), and the user sees progressive content rather than a blank page.

**Skeleton budget:** KPIStrip (4 boxes), DonutRow (3 circles), Timeline (bar chart outline), TerrainPanel (grid outline). All in `loading.tsx` and inline `fallback` props.

### 3b. /users — React Query Hydration Without Redundant Refetch

The previously diagnosed bug: `prefetch` called with `undefined` while client called with `{ permSummary, activityMix }` → cache key mismatch → redundant heavy refetch. The fix is structural in `useDirectoryData`:

```typescript
// useDirectoryData.ts — define query keys as constants
const BULK_USERS_KEY = ["accDcGraph", "bulkUsers"] as const;

// In the hook, use staleTime matching the prefetch:
const { data: dcUsersRaw } = trpc.accDcGraph.bulkUsers.useQuery(undefined, {
  staleTime: ACC_SNAPSHOT_STALE_TIME_MS,
  refetchOnWindowFocus: false,
});
```

Key rule: every tRPC call's `staleTime` must match its prefetch `staleTime`. Mismatched stale times cause the "stale + refetch on mount" double-fetch.

For `/users` the 7–15MB payload comes from 6 parallel tRPC calls (`bulkUsers`, `bulkAccSummary`, `enrichedUsers`, `listInvitations`, `getCoverage`, `folderCoverage`, `getOrgDirectory`, `getDirectory`). The payload reduction strategy is:

1. `getOrgDirectory` and `getDirectory` return full org People objects — add `select` to return only fields needed for grid rendering (name, email, department, jobTitle, photoUrl). This alone likely halves the payload.
2. `enrichedUsers` is the fattest — check if its full payload is needed at mount or only for the profile panel. If profile-only, move to lazy fetch on panel open.
3. `activitySort` queries fire only when `activitySort.active === true` — this is already deferred correctly.

### 3c. Page Loading Skeletons

Each page needs a `loading.tsx` skeleton that:
- Matches the exact layout of the real page (same height/column proportions)
- Uses `animate-pulse` on muted shapes
- Renders entirely server-side (no JS required)

Current state: `/access-analysis` has `loading.tsx`; `/users` has none; `/template-mty` has none; `/forma-proposal` has none.

**Add:** `loading.tsx` for `/users`, `/template-mty`, `/forma-proposal`. The skeleton for `/users` is a toolbar row + 12 ghost cards (grid) or 20 ghost rows (list). Use the same Tailwind layout classes as the real page so there is no layout shift on hydration.

### 3d. Dynamic Import Boundaries (already partially done)

`UserProfilePanel` and `UserActivityBody` are already `next/dynamic` with `ssr: false`. Keep this pattern for any heavy component that is:
- Not needed at initial render
- Contains complex client state
- Uses browser-only APIs

Add `next/dynamic` for: `FolderPermissionTerrain` (canvas-heavy), `CoordinationByProject` (lazy drill), `HierarchyView` (d3 + SVG).

---

## 4. Theming Architecture

### 4a. Principle

The existing `globals.css` has a correct dual-theme structure: CSS vars in `:root` (light) and `.dark` (dark). The zinc palette for dark is already set (`#09090B` background). Do not change these fundamentals.

**The single remaining problem:** ECharts renders onto a `<canvas>`, which cannot read CSS vars. Each chart must resolve CSS vars to hex/rgba values at render time via `useTheme`.

**Centralized fix via the shared `EChart` wrapper** (see §2c above): `mergeEChartsTheme(option, dark)` is a pure function that substitutes a fixed dark palette and a fixed light palette — no `getComputedStyle` needed at runtime. The dark palette maps to the zinc tokens; the light palette maps to the light tokens. Both palettes are defined once in `lib/colors/echartsTheme.ts`.

```typescript
// lib/colors/echartsTheme.ts
export const ECHARTS_DARK = {
  text: "#A1A1AA",       // --muted-foreground dark
  axis: "#3F3F46",       // --border dark
  background: "transparent",
  chart: ["#60A5FA","#34D399","#FBBF24","#A78BFA","#FB923C"],
};
export const ECHARTS_LIGHT = {
  text: "#6B7280",       // --muted-foreground light
  axis: "#E5E7EB",       // --border light
  background: "transparent",
  chart: ["#2563EB","#0F766E","#D97706","#7C3AED","#EA580C"],
};
```

### 4b. Page Root Scroll Contract

Existing convention (from DARK_MODE.md + prior bug fix): page roots use `h-full overflow-y-auto`, NOT `min-h-screen overflow-hidden`. Dashboard `<main>` is `overflow-hidden`. Every redesigned page must open with:

```tsx
<div className="h-full overflow-y-auto text-foreground">
  ...
</div>
```

`/access-analysis/page.tsx` already does this correctly. `/users` page does not (it delegates scroll to the virtualized list). After decomposition, wrap the whole `UsersDirectoryClient` shell in `h-full overflow-y-auto`.

### 4c. Tailwind Dark-Mode Classes

The codebase correctly uses Tailwind v4 with semantic tokens (`bg-card`, `text-muted-foreground`, etc.) — these automatically switch via the CSS var layer. For the depth additions (glass, glow), use the custom surface tokens (`bg-surface-1`, `border-surface-border`) which are already in `globals.css`. No inline hex or rgba in TSX — always CSS vars.

---

## 5. Motion Architecture

### 5a. Where Framer Motion Lives

Framer Motion is already in `package.json` at `^12.38.0`. The constraint is: **motion must not be on the critical render path**. This means:

- Animation variants must be defined outside component render functions (module-level constants in `components/ui/motion.ts`)
- `motion.div` wrappers go on interactive sub-components (cards, rows, panels) — NOT on page roots or data containers
- `AnimatePresence` is used only for mount/unmount transitions (drill panels, modals, filter pills)
- Page-level transitions use CSS `transition` properties via Tailwind, not Framer Motion (cheaper)

### 5b. Where to Apply Motion — Per Component

| Component | Motion Type | Implementation |
|---|---|---|
| `PersonCard` (grid) | Hover lift: `whileHover={{ y: -2, boxShadow: ... }}` | Framer `motion.div` |
| Filter pills appear/disappear | Slide+fade | `AnimatePresence` + `fadeUp` variant |
| Donut drill panel open | Slide in from below | `motion.div` with `fadeUp` |
| Profile rail/sheet open | Slide from right | shadcn `Sheet` already animates |
| KPI cards on page load | Stagger-in | `motion.div` with `stagger` variant |
| Timeline bars | Counter-up animation | ECharts built-in animation (no Framer) |
| Skeleton → content | Opacity crossfade | Tailwind `transition-opacity` (no Framer) |
| Terrain canvas | Redraw animation | ECharts built-in (no Framer) |

### 5c. Reduced-Motion Enforcement

```typescript
// In useSafeVariants (from components/ui/motion.ts):
export function useSafeVariants<T extends Record<string, object>>(variants: T): T {
  const shouldReduce = useReducedMotion();
  if (!shouldReduce) return variants;
  // Replace all transition durations with 0; keep opacity so content is visible
  return mapValues(variants, (v) => ({ ...v, transition: { duration: 0 } }));
}
```

All `motion.div` components call `useSafeVariants` on their variant props before passing to Framer. This is the single enforcement point — no `prefers-reduced-motion` media query needed in CSS.

---

## 6. Component Boundaries Summary

```
components/
  ui/
    PremiumSurface.tsx         ← NEW: base card primitive
    EChart.tsx                  ← MOVED from access-analysis/components/
    DataTable.tsx               ← NEW: TanStack Table wrapper
    ModuleBadge.tsx             ← MOVED from UsersDirectoryClient
    motion.ts                   ← NEW: Framer re-export + variants + hook
    page-skeleton.tsx           ← EXISTING: extend with per-page shapes

app/(dashboard)/users/
  useDirectoryStore.ts          ← NEW: Zustand store (extracted)
  useDirectoryData.ts           ← NEW: all tRPC queries (extracted)
  DirectoryToolbar.tsx          ← NEW: search + filters (extracted)
  ActiveFilterStrip.tsx         ← NEW: active filter chips (extracted)
  PersonCard.tsx                ← EXTRACTED: already named in monolith
  PersonRow.tsx                 ← EXTRACTED: already named
  PersonRowList.tsx             ← EXTRACTED: already named
  PersonDetailModal.tsx         ← EXTRACTED: already named
  ActivityAuditPanel.tsx        ← EXTRACTED: already named
  DataCoverageStrip.tsx         ← EXTRACTED: already named
  UsersDirectoryClient.tsx      ← SHELL: ~200 lines, orchestrator only

app/(dashboard)/forma-proposal/components/
  useHierarchyLayout.ts         ← NEW: d3 computation hook
  HierarchyCanvas.tsx           ← NEW: SVG rendering
  HierarchyView.tsx             ← SHELL: thin orchestrator (API unchanged)

lib/colors/
  echartsTheme.ts               ← NEW: palette constants for ECharts
```

---

## 7. Build-Order Dependencies

The following dependency graph determines phase sequencing:

```
Phase 1 — Foundation (blocks all per-page work)
  ├── globals.css: add depth/glow/glass tokens
  ├── components/ui/PremiumSurface.tsx
  ├── components/ui/EChart.tsx (moved + theme-aware)
  ├── components/ui/motion.ts
  ├── lib/colors/echartsTheme.ts
  └── components/ui/ModuleBadge.tsx (moved)

Phase 2 — /users decomposition (blocks /users polish)
  ├── useDirectoryStore.ts (Zustand store)
  ├── useDirectoryData.ts (all queries)
  ├── Extract PersonCard, PersonRow, PersonRowList
  ├── Extract PersonDetailModal, ActivityAuditPanel
  ├── Extract DirectoryToolbar, ActiveFilterStrip, DataCoverageStrip
  └── UsersDirectoryClient shell (~200 lines)
  (run full test suite — all existing tests must pass)

Phase 3 — DataTable primitive (blocks /users table redesign + /template-mty)
  └── components/ui/DataTable.tsx (@tanstack/react-table install + wrapper)

Phase 4 — Per-page polish (parallelizable after Phase 1 + 2)
  ├── /users: premium grid/list with DataTable + motion
  ├── /access-analysis: Suspense tiers + depth + new analytics panels
  ├── /template-mty: depth tokens + PremiumSurface wrapping
  └── /forma-proposal: HierarchyView split + depth

Phase 5 — Selective 3D hero accents (depends on Phase 4 stability)
  └── One or two WebGL/Three.js moments (per page decision at Phase 4 review)
```

**Critical path:** Foundation (Phase 1) → /users decomposition (Phase 2) → per-page polish (Phase 4). The DataTable (Phase 3) can run in parallel with Phase 2 after Phase 1 is done.

---

## 8. Anti-Patterns to Avoid

### Anti-Pattern: Calling useTheme() in Every Chart Component
**What:** Each of the 8+ ECharts components has its own `useTheme` + `resolvedTheme !== "light"` pattern, causing drift when a new chart is added and someone forgets.
**Fix:** Centralize in the shared `EChart` wrapper — charts receive `dark` prop or read from the wrapper.

### Anti-Pattern: tRPC Query Keys Diverging Between Prefetch and Client
**What:** Prior bug — `prefetch(undefined)` vs `useQuery({ permSummary, activityMix })` — different input shape = different cache key = double fetch.
**Fix:** Extract query input objects as named constants in `useDirectoryData`; use the same constant in both prefetch and `useQuery`.

### Anti-Pattern: Prop-Drilling Filter State 4 Levels Deep
**What:** Current monolith passes `filterDept`, `setFilterDept`, etc. from the 2,474-line root down to row components.
**Fix:** Zustand store. Sub-components read the filter they need directly; no prop-passing.

### Anti-Pattern: Framer Motion on Page Roots
**What:** Wrapping `<main>` or the page root div in `motion.div` — causes the entire page to re-render on every animation frame.
**Fix:** Motion only on leaf interactive components (cards, pills, panels). Page roots are plain `div`.

### Anti-Pattern: Single Promise.all Blocking All 7 Loaders
**What:** `/access-analysis` page waits for terrain (9s) before rendering anything.
**Fix:** Suspense tiers — Tier 1 (fast) streams first; terrain/coordination render when ready.

### Anti-Pattern: Hardcoded Hex Colors in Charts
**What:** Some chart options hardcode `#60A5FA` or `rgba(...)` bypassing the token system; chart looks wrong when theme switches.
**Fix:** All chart colors come from `echartsTheme.ts` constants, applied by `mergeEChartsTheme` in the shared wrapper.

---

## Scalability Considerations

| Concern | Current State | After Redesign |
|---|---|---|
| /users payload size | 7–15MB (6 parallel tRPC calls) | Target < 3MB via field `select` narrowing |
| /access-analysis TTFB | ~9s (terrain blocks all) | ~300ms Tier 1; terrain async |
| Framer Motion bundle | 0KB (unused) | ~30KB gzip (already in package.json) |
| DataTable re-renders | N/A (no table) | Memoized rows via `React.memo`; sort via TanStack memo |
| Theme switch flash | Some charts flash | Eliminated by shared EChart wrapper with dark default |

---

*Architecture research: 2026-06-17*
