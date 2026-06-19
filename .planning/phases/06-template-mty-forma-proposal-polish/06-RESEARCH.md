# Phase 6: /template-mty & /forma-proposal Polish — Research

**Researched:** 2026-06-19
**Domain:** Presentation-layer polish — wiring existing primitives into two remaining pages
**Confidence:** HIGH (all findings verified from codebase; no external web research needed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Members table (TPL-01):**
- Migrate the custom members grid to the premium `DataTable` primitive (from Phase 3).
- Preserve all current toolbar function: search box and the four filter chips (All / Internal / External / Admin). No loss of capability.
- Keep the same 5 columns: Member, Role, Company, Access, Origin.
- Row interaction: click → slide-in only. No inline row-expand (keeps one clear action per row).
- Member click opens the shared `UserProfilePanel` — the same profile /users and /access-analysis already open.
- Members without an email stay non-clickable and subtly de-emphasized (no pointer, slightly muted).

**Role-similarity graph (TPL-02):**
- Node click → slide-in "role overview": role name, folders reached, tier breakdown, and list of members who hold that role. Member rows in that panel clickable through to their own `UserProfilePanel`. All sourced from data already loaded on the page (no new query — passes NA-01).
- Click drills, drag still moves. Movement threshold separates click from drag.
- Hover labels clamped in-bounds — node labels and hover tooltip card must never clip past the panel edge.
- Physics: settle then freeze. Force simulation runs briefly on mount, then freezes; reheats only on node drag.
- Reduced-motion: snap to settled layout.
- Reveal with the page's staggered entrance, then settle.

**Role / module / permission charts (TPL-02, TPL-03):**
- Display-only (no click-to-drill).
- Full /access-analysis donut treatment: gradient fills, rounded segments, selected-segment glow.
- All three charts move to the shared themed `EChart` wrapper — single source of truth, auto light/dark.
- Keep each chart's current form (pie stays pie, bars stay bars).
- Hover = lift + glow on the segment with a tooltip — does NOT imply a click-through.

**Panels & reveal (TPL-03):**
- All panels wrapped in `PremiumSurface` with staggered reveal + skeleton (PERF-01 ~200ms).
- Empty states get light premium polish (icon + message inside a `PremiumSurface`).

**Forma background accent (FRM-02):**
- Motif: drifting particle field that matches the /users header accent (same R3F engine/style).
- Placement: faint full-bleed background behind the whole editor, `pointer-events:none`.
- Intensity: barely-there ambient — very low opacity, slow drift.
- Color: brand indigo/violet, using shared ambient-glow tokens.
- Renders with `frameloop="demand"`; no WebGL context on a data surface.

**Editor depth (FRM-02):**
- Restrained depth. Subtle elevation on outer containers only — role rail, editor section, hierarchy view. Folder-tree rows and tier chips stay flat and dense.
- Top bar (mode switch, JSON/CSV export, reset): light polish only — keep compact.
- Loading: layout-shaped skeleton (rail + tree placeholders) replaces plain "Loading your draft…" text.

**HierarchyView split + deferred d3 (FRM-01):**
- Split into layout hook + canvas render + thin shell, public API unchanged.
- While d3 bundle loads (on switching to hierarchy mode): a layout-shaped skeleton.
- Prefetch d3 bundle in idle background after first paint.

**Cross-cutting:**
- Single shared slide-in `Sheet` (INT-01) is the one drill target for every click source.
- Both pages fully legible in light and dark (zinc) themes.

### Claude's Discretion
- Exact skeleton shapes/timing, stagger curve, and reveal durations (within the motion budget).
- The movement-threshold value that separates a "click" from a "drag" on graph nodes.
- Precise particle count/opacity/drift speed for the Forma accent (tune to "barely-there" + GPU < 400MB).
- Exact `DataTable` column widths / density defaults for the members table.
- Tier-breakdown layout inside the role-overview panel.

### Deferred Ideas (OUT OF SCOPE)
- Drillable role pies (click a pie slice → role members) — pies stay display-only this phase.
- Forma role-permission diff view — v2 (FRM-V2-01); needs a new `template.getBaseline(roleId)` tRPC query.
- Unifying all template charts into donuts — declined; current chart forms retained.
- Reactive / interaction-driven 3D accent (drifts on role switch) — declined.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TPL-01 | The members table uses the premium `DataTable` (sort + row-click → slide-in profile) | DataTable.tsx fully mapped; column adapter pattern documented below; search+filter chips must be preserved as a toolbar wrapper outside DataTable |
| TPL-02 | Role pies use shared depth/glow theming; the role-similarity graph shows non-clipped hover labels and node-click → slide-in role members | EChart wrapper + mergeEChartsTheme documented; graph settle-and-freeze + click-vs-drag pattern documented; RoleSimilarityGraph current state mapped |
| TPL-03 | All panels use `PremiumSurface` + staggered reveal + skeleton | PremiumSurface.tsx fully mapped; Reveal + useEntrance from animated-list.tsx documented; loading.tsx pattern documented |
| FRM-01 | `HierarchyView` split (layout hook + canvas render + thin shell) with public API unchanged; heavy d3 bundle deferred via `dynamic(ssr:false)` | HierarchyView.tsx fully read (316 lines); exact split boundary identified; dynamic(ssr:false) pattern confirmed from UsersTableHeader and TemplateAnalysisCharts |
| FRM-02 | Permission-editor panels use `PremiumSurface` depth; a selective real-3D background accent with `frameloop="demand"` and `pointer-events:none` | HeaderParticleAccent.tsx fully mapped (canonical R3F accent); FormaProposalClient.tsx structure documented |
</phase_requirements>

---

## Summary

This is a **codebase-mapping and primitive-wiring phase**, not an external research phase. All the components needed — `DataTable`, `PremiumSurface`, `DrillSheet`/`UserProfilePanel`, the themed `EChart` wrapper, `HeaderParticleAccent`, the motion facade, and the `Reveal`/`useEntrance` primitives — were built in Phases 1–5 and verified from source. The only new code this phase writes is: (a) a `ColumnDef<MemberRow>[]` adapter for the DataTable migration, (b) a toolbar wrapper that preserves the search box + filter chips above the DataTable, (c) PremiumSurface wrapping + skeleton across all panels on both pages, (d) the donut treatment upgrade on the three template-mty EChart components, (e) the settle-and-freeze + click-vs-drag + in-bounds clamping upgrades on `RoleSimilarityGraph`, (f) the `HierarchyView` three-file split, (g) the `FormaParticleAccent` component (direct clone of `HeaderParticleAccent` with lower opacity/count tuned for full-bleed), and (h) `loading.tsx` files for both routes.

The biggest technical complexity is the `HierarchyView` split (FRM-01): the file is 316 lines and its d3-hierarchy + d3-force-free layout hook is tightly coupled to the canvas rendering. The split boundary is clear: `useMemo` blocks (collapsed state, visible walk, stratify, tree layout) → hook; SVG/DOM render + zoom/pan state → canvas render component; the external prop surface (8 props) stays unchanged. The `dynamic(ssr:false)` + loading skeleton pattern is established by `UsersTableHeader.tsx` (HeaderParticleAccent) and `TemplateAnalysisCharts.tsx` (AuthorProfileDrawer).

There is one important discovery: **the `TemplateMembersTable` currently uses a role-TABLE pattern (ARIA role="table" with divs), not a real `<table>` or TanStack Table**. Migrating to the `DataTable` primitive requires (1) defining `ColumnDef<MemberRow>[]` using TanStack column helpers, (2) keeping the toolbar (search + filter chips + count badge) as a wrapper div OUTSIDE the DataTable, and (3) passing the pre-filtered `rows` array to DataTable (DataTable does not own the filter chips — the parent does).

**Primary recommendation:** Wire in primitives top-down — `PremiumSurface` + `loading.tsx` first (fastest win, TPL-03), then `DataTable` migration (TPL-01), then chart upgrades (TPL-02 partial), then graph settle-and-freeze + click-drill (TPL-02), then `HierarchyView` split (FRM-01), then `FormaParticleAccent` + editor depth (FRM-02).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Members table with search/filter | Client (TemplateMembersTable) | — | Filter state is client-local; data arrives as RSC prop |
| Row-click → UserProfilePanel | Client | — | Slide-in sheet is client-side; email lookup is in-memory |
| Role pies EChart theming | Client | — | Theme is browser-resolved; `mergeEChartsTheme` is a pure function |
| Role-similarity graph layout | Client (d3-force) | — | Physics sim runs in browser; no server data beyond page props |
| Graph settle-and-freeze | Client | — | sim.stop() after alphaMin reached; event-driven reheat on drag |
| Hover label clamping | Client (SVG) | — | SVG viewBox + clamped text position; no server involvement |
| Node-click → DrillSheet | Client | — | Opens shared SheetContent with role data from page props |
| PremiumSurface + Reveal wrapping | Client (RSC-safe PremiumSurface) | — | Pure CSS + Framer Motion; RSC-compatible (no useState) |
| HierarchyView layout computation | Client hook | — | d3-hierarchy.stratify + tree layout must run in browser |
| HierarchyView canvas render | Client | — | SVG + div-based; fully browser-rendered |
| FormaParticleAccent (R3F) | Client (dynamic ssr:false) | — | WebGL; must be excluded from SSR |
| loading.tsx skeletons | RSC (Next.js) | — | Route-level Suspense fallback; no client hooks needed |

---

## Existing Primitive Inventory

### 1. DataTable — `components/ui/DataTable.tsx` [VERIFIED: codebase]

**Import:** `import { DataTable, type DataTableProps } from "@/components/ui/DataTable"`

**Public props:**
```typescript
interface DataTableProps<T> {
  data: T[];                                    // pre-filtered array — parent owns filtering
  columns: ColumnDef<T>[];                      // TanStack v8 ColumnDef array
  onRowClick?: (row: Row<T>) => void;           // opens DrillSheet/UserProfilePanel
  onRowHover?: (row: Row<T>) => void;           // prefetch on hover
  onRowHoverEnd?: (row: Row<T>) => void;        // cancel prefetch
  renderExpanded?: (row: Row<T>) => ReactNode;  // inline expand — NOT used for TPL-01 (click-only)
  pinnedColumn?: string;                        // column ID to pin left (use 'name' for members)
  defaultSort?: SortingState;                   // [{id:'name',desc:false}] on first mount
  hasActiveFilter?: boolean;                    // drives empty-state message
  onClearFilters?: () => void;
  emptyMessage?: string;
  filteredEmptyMessage?: string;
  className?: string;
}
```

**Key behaviors:**
- Wraps itself in `PremiumSurface variant="base"` — no additional wrapping needed.
- Sticky glass header via `bg-surface-2 backdrop-blur-md`.
- Accordion expand is one-at-a-time; for TPL-01, `renderExpanded` is omitted (click-only per CONTEXT.md).
- Density toggle reads/writes localStorage under key `"datatable-density"`.
- Virtualizer uses `@tanstack/react-virtual` v3 — already installed at `^3.13.24`.

**Planning risk:** The `DataTable` does NOT own the search box or filter chips. The current `TemplateMembersTable` renders these in its own toolbar. The migration plan must keep a wrapper component (`TemplateMembersTableShell`) that renders the toolbar above and passes pre-filtered data into `DataTable`. The `data` prop to `DataTable` must be the result of `filterMembers(members, query, filter)` computed in the wrapper.

**Existing column contract for TPL-01:**
```
COLUMNS: Member (name+email), Role, Company, Access (accessLevel badge), Origin (Internal/External pill)
GRID: grid-cols-[2.2fr_1.3fr_1.3fr_auto_auto]
```
The DataTable uses `table-fixed` layout; column widths are set via `size` on each `ColumnDef`. Recommended: Member=240, Role=160, Company=160, Access=100, Origin=120 (px). Adjust at Claude's discretion.

**Non-clickable row pattern:** Members without `email` must be visually de-emphasized. `onRowClick` receives the full `Row<T>` — the callback in the parent checks `row.original.email` and no-ops if falsy. De-emphasis (lower opacity, `cursor-default`) is applied via a custom `meta` field on the ColumnDef or a conditional class on the row render.

### 2. PremiumSurface — `components/ui/PremiumSurface.tsx` [VERIFIED: codebase]

**Import:** `import { PremiumSurface } from "@/components/ui/PremiumSurface"`

**Props:**
```typescript
interface PremiumSurfaceProps extends React.ComponentProps<"div"> {
  variant?: "base" | "float" | "glass" | "inset";  // defaults to "base"
  glow?: boolean;   // adds --glow-primary ring (use sparingly)
  className?: string;
  children: React.ReactNode;
}
```

**Variant guide for this phase:**
- `"base"` (default): `panel-elevated` class → dual-theme catch-light + layered shadow. Use for all content panels on both pages.
- `"glass"`: `bg-surface-2 border border-surface-border backdrop-blur-md`. Use for the DrillSheet interior (already used there), role rail outer container.
- `"float"`: `shadow-[var(--depth-float)]`. Use for the FormaProposalClient top bar.
- `"inset"`: Recessed. Use for empty states inside panels.

**RSC-safe:** No React hooks — safe to import from RSC. The `DataTable` already wraps itself in PremiumSurface; do NOT double-wrap DataTable.

### 3. DrillSheet + UserProfilePanel [VERIFIED: codebase]

**DrillSheet:** `components/ui/DrillSheet.tsx`
```typescript
import { DrillSheet } from "@/components/ui/DrillSheet"

interface DrillSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;   // only content seam
}
```
Width: `w-[480px] sm:w-[480px]` (hard override on shadcn `sm:max-w-sm`).
Animation: slide-in-from-right at ~350ms (reduced from shadcn default 500ms).

**UserProfilePanel:** `app/(dashboard)/users/UserProfilePanel.tsx`
```typescript
import { UserProfilePanel } from "@/app/(dashboard)/users/UserProfilePanel"

interface UserProfilePanelProps {
  user: BulkAccUser | null;    // in-memory user — null shows "Not synced" state
  email: string;               // required; drives the Refresh path
  onClose?: () => void;
  variant?: "dialog" | "rail"; // "dialog" = fetches full bulkUser; "rail" = lean in-memory only
  person?: OrgPerson;          // optional person chrome header (dialog variant only)
}
```

**How /access-analysis opens it:** `AuthorProfileDrawer` is `dynamic(ssr:false)` in `TemplateAnalysisCharts.tsx` already — the same pattern applies for the role-overview DrillSheet. The template-mty page will have TWO drill entry points: (a) member row click → open `AuthorProfileDrawer` with the member's email, (b) graph node click → open a new `RoleOverviewSheet` showing role details with clickable member rows that open `AuthorProfileDrawer` for each member.

**For TPL-01 (members table):** The existing `AuthorProfileDrawer` dynamic import in `TemplateAnalysisCharts.tsx` is already wired — just trigger it from `onRowClick` instead of the custom `onSelectMember` prop. The email is `row.original.email`.

**For TPL-02 (graph node click):** A new `RoleOverviewSheet` component wraps `DrillSheet`. It receives role data from `graph.nodes` (already in page props). Member rows within it call `setProfileEmail(email)` on the same `AuthorProfileDrawer` — no new query.

### 4. Canonical EChart Wrapper — `components/ui/EChart.tsx` [VERIFIED: codebase]

**Import:** `import { EChart } from "@/components/ui/EChart"`

**Props:**
```typescript
interface EChartProps {
  option: EChartsOption;
  height?: number;                    // default 280px
  onEvents?: Record<string, (params) => void>;
  notMerge?: boolean;                 // default true; pass false for animated updates
  className?: string;
}
```

**Theme injection:** Calls `mergeEChartsTheme(option, dark)` internally. The theme hook `useTheme()` is called once. Canvas remounts on theme switch via `key={resolvedTheme}`.

**IMPORTANT:** The template-mty charts currently import from `@/app/(dashboard)/access-analysis/components/EChart` (the old wrapper — no `mergeEChartsTheme`). They must be migrated to `@/components/ui/EChart` (the canonical wrapper from Phase 1). Check each file:
- `RoleAccessPie.tsx` line 4: `import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart"` → needs updating
- `PermissionAccessChart.tsx` — check same (likely same import)
- `ModuleAccessChart.tsx` — check same

**Full donut treatment recipe (from `RolesPieChart.tsx` in /access-analysis):**
```typescript
// Series config for the "full donut treatment":
{
  type: "pie",
  radius: ["54%", "80%"],      // inner/outer ring ratio
  padAngle: 2,
  minAngle: 2,
  itemStyle: {
    borderColor: cSlice,        // card background color (blends gap)
    borderWidth: 3,
    borderRadius: 7,            // rounded segment ends
    shadowBlur: 14,
    shadowColor: cShadow,
  },
  emphasis: {
    focus: "self",
    scaleSize: 12,
    itemStyle: {
      shadowBlur: 28,            // glow on hover
      shadowColor: cShadowHover,
    },
    label: { show: true, ... },
  },
  blur: { itemStyle: { opacity: 0.22 } },
  universalTransition: true,
  animationType: "scale",
  animationEasing: "elasticOut",
  // Per-slice gradient:
  data: slices.map(s => ({
    name: s.name, value: s.value,
    itemStyle: {
      color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: lighten(base, 0.22) }, { offset: 1, color: base }] },
      shadowBlur: isActive ? 24 : 0,
      shadowColor: isActive ? base + "99" : undefined,
    }
  })),
}
```
`cSlice` is `dark ? "#18181b" : "#ffffff"` (matches card background). `cShadow` is `dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)"`.

For display-only pies (no click-to-drill), set `selectedMode: false` and remove the `onSliceClick` callback. The hover lift + glow (`emphasis.scaleSize` + `emphasis.itemStyle.shadowBlur`) still applies.

### 5. HeaderParticleAccent — `app/(dashboard)/users/HeaderParticleAccent.tsx` [VERIFIED: codebase]

**This is the canonical R3F accent to clone for the Forma background.**

**Config:**
- `PARTICLE_COUNT = 180`
- `SPREAD_X = 8`, `SPREAD_Y = 1.5`, `SPREAD_Z = 0.5`
- `DRIFT_SPEED = 0.00012`
- `PARTICLE_COLOR = new THREE.Color(0x6366f1)` (brand indigo)
- `opacity={0.35}` on `pointsMaterial`
- `frameloop="demand"` + `setInterval(() => invalidate(), 80)` (drives ~12fps gentle drift)
- `gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}`
- Canvas: `position:absolute, inset:0, pointerEvents:"none", zIndex:0`

**For FormaParticleAccent (full-bleed background):**
- Clone as `app/(dashboard)/forma-proposal/components/FormaParticleAccent.tsx`
- Change `position:absolute` → `position:fixed` (or keep absolute; the parent container is `flex h-full` so absolute+inset works)
- Reduce opacity to ~0.18–0.22 (tune to "barely-there")
- Reduce `PARTICLE_COUNT` to ~100–120 (smaller viewport context)
- Keep `frameloop="demand"`, `powerPreference:"low-power"`, `pointerEvents:"none"`
- Dynamic import in `FormaProposalClient.tsx` with `ssr:false`

**GPU budget note:** 180 particles at 12fps is well under 400MB GPU. 100–120 at lower opacity is even lighter. [VERIFIED: codebase comment on HeaderParticleAccent + PERF-05 requirement]

**Dynamic import pattern (canonical from UsersTableHeader.tsx):**
```typescript
const FormaParticleAccent = dynamic(
  () => import("./FormaParticleAccent"),
  { ssr: false }
)
```

### 6. Motion Facade — `components/ui/motion.ts` [VERIFIED: codebase]

**Import:** `import { motion, AnimatePresence, fadeUp, stagger, useSafeVariants } from "@/components/ui/motion"`

**Key presets:**
- `fadeUp` — `{ hidden: {opacity:0, y:8}, visible: {opacity:1, y:0, transition:{duration:0.35}} }` — use for panel entrances
- `stagger` — `{ hidden:{}, visible:{transition:{staggerChildren:0.05, delayChildren:0.05}} }` — use for the parent container
- `useSafeVariants(variants)` — zeroes durations under `prefers-reduced-motion`

**Reveal from animated-list.tsx:**
```typescript
import { Reveal, useEntrance } from "@/components/ui/animated-list"
// Reveal: whileInView fade+slide (once:true); for sections
// useEntrance(): per-index stagger factory; for list rows
```

`TemplateAnalysisCharts.tsx` already uses `<Reveal>` wrapping each section — the DataTable migration preserves this. The `<PremiumSurface>` wrapping goes inside the existing `<Reveal>` (Reveal is the outer; PremiumSurface is the inner).

---

## RoleSimilarityGraph — Current State & Required Changes

**File:** `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx`
**Current size:** 244 lines

**Current physics setup:**
- `d3-force` simulation with `forceLink + forceManyBody + forceCenter + forceCollide`
- Simulation starts on mount, runs perpetually via `.on("tick", frame)` — this is the problem: it never freezes.
- `simRef.current` stores the live simulation.

**Current hover-label behavior:** Labels are rendered as SVG `<text>` elements at `y = n.y + n.r + 9/v.k`. There is no bounds clamping — they clip outside the SVG viewBox / panel edge when nodes are near the edges.

**Current node-click behavior:** There is NO click handler — `onPointerDown` on nodes starts drag only. A click (no movement) currently does nothing.

**Required changes for TPL-02:**

1. **Settle-and-freeze:** After sim reaches `alphaMin`, call `sim.stop()`. Reheat only on `onNodeDown` (drag). Pattern:
   ```typescript
   .on("end", () => sim.stop())
   // In onNodeDown: simRef.current?.alphaTarget(0.3).restart()
   // In onUp (after drag): simRef.current?.alphaTarget(0); sim.stop()
   ```

2. **Click-vs-drag threshold:** Track `totalMovement` in the pointer event sequence. If movement < `CLICK_THRESHOLD_PX` (suggest 4px at Claude's discretion) on `onUp`, treat as click → open role overview. If movement >= threshold, treat as drag → release node (current behavior).
   ```typescript
   const CLICK_THRESHOLD_PX = 4;
   // ix.current gains: totalMovement: number
   // In onMove: ix.current.totalMovement += Math.hypot(dx, dy)
   // In onUp: if (totalMovement < CLICK_THRESHOLD_PX) openRoleOverview(node)
   ```

3. **In-bounds label clamping:** Clamp SVG text position so labels stay within the panel:
   ```typescript
   // Label x: clamp(n.x, margin, width - margin)
   // Label y: clamp((n.y ?? 0) + n.r + 9/v.k, 12, H - 12)
   // For the hover tooltip card (absolute div): use CSS clamp via style
   //   left: clamp(labelX_screen, 0, panelWidth - 260)
   //   top: clamp(labelY_screen, 0, panelHeight - 80)
   ```

4. **Reduced-motion:** Under `useReducedMotion()`, skip the simulation entirely — use the initial circle-seed positions directly as the final layout (no animation). Accomplished by `if (reduced) { sim.stop(); return; }` after creating the simulation.

5. **Role overview DrillSheet:** A new `RoleOverviewSheet` component (separate file) receives `{ role: PNode, members: TemplateMember[], graph: GraphData, onMemberClick: (email) => void }` and renders inside `<DrillSheet>`. The `members` prop is derived from page-level data already in `TemplateAnalysisCharts`.

---

## HierarchyView Split — Exact Boundary (FRM-01)

**Current file:** `app/(dashboard)/forma-proposal/components/HierarchyView.tsx`
**Current size:** 316 lines

**Public API (must remain UNCHANGED):**
```typescript
export function HierarchyView({
  index, explicit, rootLabel, roles, activeRoleId, activeRoleLabel,
  onPickRole, onSetTier, onApplySubtree, onClear,
}: {
  index: FolderIndex;
  explicit: ExplicitMap;
  rootLabel: string;
  roles: FormaRole[];
  activeRoleId: string;
  activeRoleLabel: string;
  onPickRole: (roleId: string) => void;
  onSetTier: (folderId: string, tier: FormaTier) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
})
```

**Proposed file layout (3 files):**

```
app/(dashboard)/forma-proposal/components/
├── HierarchyView.tsx          ← thin shell (public API unchanged; imports hook + canvas)
├── useHierarchyLayout.ts      ← layout hook (d3-hierarchy computation)
└── HierarchyCanvas.tsx        ← pure SVG/DOM render + zoom/pan state
```

**What moves to `useHierarchyLayout.ts`:**
- `collapsed` state + `toggle` callback
- The `useMemo` block: `visible` walk → `stratify` → `tree` layout → `{ nodes, links, bbox }` result
- `fit` callback + `fitted` ref
- Types: `VNode`, `VLink`, `curve()` function, `initialCollapsed()`, `sortFolders()`
- Constants: `ROOT`, `NODE_W`, `NODE_H`, `MIN_SCALE`, `MAX_SCALE`, `clamp`

**Hook signature:**
```typescript
export function useHierarchyLayout(index: FolderIndex, explicit: ExplicitMap) {
  // Returns: { nodes, links, bbox, collapsed, toggle, fit }
}
```

**What moves to `HierarchyCanvas.tsx`:**
- `containerRef`, `view` state + `setView`
- Wheel zoom + pan event listeners
- `pan` ref + pointermove/pointerup handlers
- `zoomBy`, `rolesByGroup`, `groupOrder` memos
- The full JSX tree (the `<div ref={containerRef}>` + SVG links + node divs + role picker + hint + controls)

**Canvas props:**
```typescript
interface HierarchyCanvasProps {
  nodes: VNode[];
  links: VLink[];
  bbox: { minX: number; maxX: number; minY: number; maxY: number };
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  fit: () => void;
  index: FolderIndex;
  explicit: ExplicitMap;
  rootLabel: string;
  roles: FormaRole[];
  activeRoleId: string;
  activeRoleLabel: string;
  onPickRole: (roleId: string) => void;
  onSetTier: (folderId: string, tier: FormaTier) => void;
  onApplySubtree: (folderId: string, tier: FormaTier) => void;
  onClear: (folderId: string) => void;
}
```

**Thin shell (new `HierarchyView.tsx`):**
```typescript
// app/(dashboard)/forma-proposal/components/HierarchyView.tsx
"use client";
import { useHierarchyLayout } from "./useHierarchyLayout";
import { HierarchyCanvas } from "./HierarchyCanvas";
// ... (all props same as before)
export function HierarchyView(props) {
  const layout = useHierarchyLayout(props.index, props.explicit);
  return <HierarchyCanvas {...layout} {...props} />;
}
```

**d3 imports that constitute the "heavy bundle":**
- `stratify` and `tree` from `d3-hierarchy` — these are the layout-only imports. They are NOT WebGL; they are data transformation.
- In the current file: `import { stratify, tree } from "d3-hierarchy"` (line 3)
- The rest of the imports (`Maximize2`, `Plus`, `Minus`, etc.) are lucide-react and shadcn — lightweight.

**Deferred d3 strategy:** The `useHierarchyLayout` hook is the boundary. The shell renders a skeleton until the hook has computed layout. The `dynamic(ssr:false)` import of `HierarchyCanvas` (which contains the hook call) defers both the d3 bundle AND the layout computation.

**Canonical `dynamic(ssr:false)` + loading skeleton pattern (from codebase):**
```typescript
// In FormaProposalClient.tsx — replaces: import { HierarchyView } from "./HierarchyView"
const HierarchyView = dynamic(
  () => import("./HierarchyView").then((m) => m.HierarchyView),
  {
    ssr: false,
    loading: () => <HierarchyViewSkeleton />,  // layout-shaped skeleton
  }
)
```

**Idle prefetch pattern:** No existing `requestIdleCallback` pattern found in the codebase (the search returned 0 matches). Implement the idle prefetch as follows in `FormaProposalClient.tsx`:
```typescript
// After first paint, prefetch the HierarchyView bundle in idle background
useEffect(() => {
  const id = typeof requestIdleCallback !== "undefined"
    ? requestIdleCallback(() => { import("./HierarchyView"); })
    : setTimeout(() => { import("./HierarchyView"); }, 2000);
  return () => {
    if (typeof cancelIdleCallback !== "undefined") cancelIdleCallback(id as number);
    else clearTimeout(id as number);
  };
}, []); // once after first render
```
This means the first mode-switch to "hierarchy" feels instant (bundle already loaded).

**`TierMenuItems` component (lines 54–76):** Internal to `HierarchyView.tsx` — moves to `HierarchyCanvas.tsx` since it is render-only.

---

## Standard Stack

No new npm packages required for this phase. All dependencies are already installed.

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|------------------|
| `@tanstack/react-table` | `^8.21.3` | DataTable columns | Yes — Phase 3 |
| `@tanstack/react-virtual` | `^3.13.24` | DataTable virtualizer | Yes — Phase 3 |
| `@react-three/fiber` | `^9.6.1` | FormaParticleAccent R3F | Yes — Phase 4 |
| `three` | `^0.184.0` | Three.js geometry/materials | Yes — Phase 4 |
| `framer-motion` | `^12.40.0` | Motion facade + Reveal | Yes — Phase 1 |
| `echarts-for-react` | `^3.0.6` | EChart wrapper | Yes — Phase 1 |
| `d3-hierarchy` | `^3.1.2` | HierarchyView layout | Yes — existing |
| `d3-force` | `^3.0.0` | RoleSimilarityGraph sim | Yes — existing |

**Installation:** None required.

---

## Architecture Patterns

### Pattern 1: DataTable Migration with External Toolbar

The `DataTable` primitive does NOT own filter chips or search boxes — it only owns sort and expand. The toolbar (search + chips + count) stays in a parent wrapper component.

```typescript
// app/(dashboard)/template-mty/components/TemplateMembersTableShell.tsx
"use client";
import { useState, useMemo } from "react";
import { DataTable } from "@/components/ui/DataTable";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { filterMembers, sortMembers } from "../templateMembersTable";
// ...

export function TemplateMembersTableShell({ members, onSelectMember }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");

  const rows = useMemo(
    () => filterMembers(members, query, filter),  // pre-filter; DataTable handles sort
    [members, query, filter]
  );

  const columns: ColumnDef<MemberRow>[] = [
    { id: "name", header: "Member", accessorFn: ..., size: 240, enableSorting: true, ... },
    // ... 4 more columns
  ];

  return (
    <div className="flex flex-col gap-0 overflow-hidden">
      {/* Toolbar: preserved exactly */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        {/* Search box */}
        {/* Filter chips: All / Internal / External / Admin */}
        {/* Count badge: {rows.length} of {members.length} */}
      </div>
      {/* DataTable owns sort + virtualization */}
      <DataTable
        data={rows}
        columns={columns}
        pinnedColumn="name"
        defaultSort={[{ id: "name", desc: false }]}
        hasActiveFilter={filter !== "all" || query.length > 0}
        onRowClick={(row) => {
          if (row.original.email) onSelectMember?.(row.original.email);
        }}
      />
    </div>
  );
}
```

Note: Remove the old `TemplateMembersTable` component entirely, or keep it as a re-export alias. The outer `TemplateAnalysisCharts.tsx` passes `onSelectMember` — this prop name stays unchanged.

### Pattern 2: PremiumSurface + Reveal Wrapping

```typescript
// Current pattern in TemplateAnalysisCharts.tsx (already has <Reveal>):
<Reveal>
  <section className="flex flex-col gap-3">
    <SectionHeader title="..." subtitle="..." />
    <RoleAccessPie nodes={roleTree} />   // ← currently returns div.panel-elevated
  </section>
</Reveal>

// After migration (PremiumSurface replaces panel-elevated inside each component):
// Each component changes its root from <div className="panel-elevated p-5"> to:
<PremiumSurface variant="base" className="p-5">
  {/* component content */}
</PremiumSurface>
```

Do NOT wrap `<DataTable>` in an additional `<PremiumSurface>` — DataTable already wraps itself.

### Pattern 3: dynamic(ssr:false) with Loading Skeleton

```typescript
// Canonical pattern — UsersTableHeader.tsx line 27-30:
const HeaderParticleAccent = dynamic(
  () => import("./HeaderParticleAccent"),
  { ssr: false }
);

// With skeleton — HomeClient.tsx line 11-15:
const DashboardCalendar = dynamic(
  () => import("@/components/dashboard/DashboardCalendar").then((m) => m.DashboardCalendar),
  {
    ssr: false,
    loading: () => <div className="h-80 rounded-xl bg-muted/20 animate-pulse" />,
  }
);
```

### Pattern 4: Graph Settle-and-Freeze

```typescript
// Replace perpetual tick with settle-then-freeze:
useEffect(() => {
  const sim = forceSimulation<PNode>(pnodes)
    // ... forces unchanged ...
    .on("tick", frame)
    .on("end", () => { sim.stop(); });  // freeze after settling

  simRef.current = sim;
  return () => { sim.stop(); };
}, [pnodes, pedges, width]);

// In onNodeDown (drag starts): reheat
const onNodeDown = (n: PNode) => (e: React.PointerEvent) => {
  // ... existing logic ...
  simRef.current?.alphaTarget(0.3).restart();
};

// In onUp (drag ends): cool and freeze
const onUp = () => {
  const s = ix.current;
  if (s.mode === "node" && s.node) {
    s.node.fx = null; s.node.fy = null;
    simRef.current?.alphaTarget(0);
    // Let sim coast to alphaMin then auto-freeze via the "end" listener
  }
  ix.current = { ... };
};
```

### Anti-Patterns to Avoid

- **Double-wrapping DataTable in PremiumSurface:** DataTable already wraps itself. Adding another PremiumSurface creates visual double-elevation.
- **Using the old `EChart` wrapper** (`app/(dashboard)/access-analysis/components/EChart`): The old wrapper has no `mergeEChartsTheme` call. Always use `@/components/ui/EChart` from Phase 1.
- **Importing R3F directly in FormaProposalClient:** Must be dynamic+ssr:false. Any file that imports `@react-three/fiber` directly (not via dynamic) will fail SSR.
- **Putting filter logic inside DataTable:** DataTable's `data` prop must be pre-filtered by the parent. DataTable handles sort only.
- **Perpetually-ticking graph simulation:** Running `sim.on("tick", ...)` without calling `sim.stop()` on "end" drains GPU/CPU continuously. Always settle-and-freeze.
- **Hover tooltip cards without clamping:** SVG text and absolute-positioned div tooltips overflow the container on edge nodes. Always clamp to panel bounds.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Virtualized table with sort | Custom div-table | `DataTable` (`components/ui/DataTable`) | Already built + tested; handles scroll sync, density |
| Theme-aware EChart colors | Per-component theme branch | `EChart` from `@/components/ui/EChart` + `mergeEChartsTheme` | Single source; auto light/dark; key={resolvedTheme} remount |
| Slide-in panel | Custom drawer | `DrillSheet` + `UserProfilePanel` | Already built; 480px width; glass surface; one drill-target rule |
| Gradient donut fills | Custom SVG | ECharts `itemStyle.color` linear gradient | Already in `RolesPieChart.tsx`; copy the recipe |
| Reduced-motion gating | Manual `window.matchMedia` | `useSafeVariants` from `@/components/ui/motion` | Enforced at a single point; already tested |
| R3F particle accent | New 3D engine | Clone `HeaderParticleAccent` → `FormaParticleAccent` | Same engine; GPU budget already verified |
| d3-hierarchy layout | Custom tree algorithm | `stratify` + `tree` from `d3-hierarchy` — already used in `HierarchyView.tsx` | Proven; handles collapse/expand; just extract to hook |
| Idle prefetch | setInterval polling | `requestIdleCallback` with setTimeout fallback | Zero-cost prefetch; first mode-switch feels instant |

---

## Common Pitfalls

### Pitfall 1: WebGL Context on a Data Surface (PERF-05)

**What goes wrong:** `FormaParticleAccent` (R3F Canvas) placed inside the permission editor grid, creating a WebGL context over the FolderTreeAssign data region.
**Why it happens:** Placing the Canvas inside the scrollable editor section rather than as a fixed/absolute background layer.
**How to avoid:** Place the Canvas as `position:absolute; inset:0; z-index:0; pointer-events:none` inside the `FormaProposalClient`'s outermost `flex h-full flex-col` container. The editor content is `position:relative; z-index:1`. This ensures the particle field is truly behind the editor, not competing with it.
**Verification grep:** `grep -r "Canvas" app/\(dashboard\)/forma-proposal` should return ONE file only (`FormaParticleAccent.tsx`). No Canvas in `HierarchyCanvas.tsx`, `FolderTreeAssign.tsx`, or `FormaProposalClient.tsx` directly.

### Pitfall 2: Old EChart Wrapper on Template-MTY Charts

**What goes wrong:** Charts render correctly but don't auto-theme because they still import the old `access-analysis/components/EChart.tsx` which has no `mergeEChartsTheme` call.
**Why it happens:** The old wrapper file exists and is a valid import. Three files import it.
**How to avoid:** In the same commit that upgrades chart options, update the import to `@/components/ui/EChart`. Check: `RoleAccessPie.tsx`, `PermissionAccessChart.tsx`, `ModuleAccessChart.tsx`.
**Verification:** `grep -r "access-analysis/components/EChart" app/(dashboard)/template-mty` must return 0 after the migration.

### Pitfall 3: Double-Wrapping DataTable in PremiumSurface

**What goes wrong:** `<PremiumSurface><DataTable .../></PremiumSurface>` creates visual double-elevation (two sets of panel shadows).
**Why it happens:** Planner or executor doesn't notice DataTable already wraps itself.
**How to avoid:** Do NOT wrap DataTable in PremiumSurface. The wrapper component (`TemplateMembersTableShell`) should include the toolbar div and the DataTable as direct siblings without any outer PremiumSurface.

### Pitfall 4: TypeScript Error from `tsc --noEmit` on Test Files

**What goes wrong:** `next build` typechecks the whole tree including test files. Adding a new prop shape to a component without updating the test fixture causes a tsc error that blocks the build.
**Why it happens:** Test files import the component under test with specific prop shapes. If `TemplateMembersTable` is replaced by `TemplateMembersTableShell`, the test file must be updated in the same commit.
**How to avoid:** Every commit that changes a component's exported API must update the corresponding test file in the same commit. Run `npx tsc --noEmit` before declaring a task complete.

### Pitfall 5: HierarchyView Split Breaking Public API

**What goes wrong:** The caller `FormaProposalClient.tsx` passes 8 props to `HierarchyView`. If the thin shell doesn't forward all 8 props to `HierarchyCanvas`, TypeScript shows errors at the call site.
**Why it happens:** Partial refactor leaves some props unused in the new shell.
**How to avoid:** The thin shell must pass ALL 8 public props through to `HierarchyCanvas`. The hook only receives `index` and `explicit` (the two props needed for layout computation).

### Pitfall 6: Graph Simulation Re-running on Each Render

**What goes wrong:** Adding `useSafeVariants` or theme state to `RoleSimilarityGraph` causes a re-render that recreates `pnodes`/`pedges`, which triggers a new simulation, causing the graph to jitter on every theme switch or hover.
**Why it happens:** `pnodes` and `pedges` are created in a `useMemo` that depends on `graph`, `width`, and `radius` — these are stable. Adding theme dependencies (`dark`) to the memo would cause re-layout on theme switch.
**How to avoid:** Theme colors (`ink`, `sub`, `edgeColor`) must be read inside render, NOT added to the `useMemo` dependency array for `pnodes`/`pedges`. Colors are just passed to SVG attributes at render time.

### Pitfall 7: Missing `loading.tsx` Files (PERF-01)

**What goes wrong:** `/template-mty` and `/forma-proposal` show a blank screen for the full SSR time before hydration because there is no route-level Suspense fallback.
**Why it happens:** Neither route has a `loading.tsx` file (confirmed by glob search).
**How to avoid:** Create both `app/(dashboard)/template-mty/loading.tsx` and `app/(dashboard)/forma-proposal/loading.tsx`. The template-mty version should show a section-by-section skeleton; the forma version should show a rail + tree-shaped skeleton (matching FRM-02).

---

## HierarchyView — Current d3 Imports to Defer

From `HierarchyView.tsx` line 3:
```typescript
import { stratify, tree } from "d3-hierarchy";
```

These are the ONLY heavy imports that matter for code-splitting. The rest of the imports in `HierarchyView.tsx` (lucide-react, shadcn dropdown, OrgNode, inheritance/tiers/roles) are either small or already shared bundles.

After the split:
- `useHierarchyLayout.ts` contains `import { stratify, tree } from "d3-hierarchy"` — this file is ONLY imported by `HierarchyCanvas.tsx`
- `HierarchyCanvas.tsx` is the `dynamic(ssr:false)` import target
- The d3-hierarchy bundle (~15KB gzipped) is deferred until the canvas chunk loads

**Note:** `d3-force` (used in `RoleSimilarityGraph`) is separate from `d3-hierarchy`. No deferral needed for `RoleSimilarityGraph` — it is already a client component that loads on page navigation.

---

## Code Examples

### EChart "Full Donut Treatment" Applied to RoleAccessPie

```typescript
// Source: RolesPieChart.tsx in /access-analysis (verified from codebase)
// Apply to RoleAccessPie.tsx — change from <div className="panel-elevated p-5"> to:

import { EChart } from "@/components/ui/EChart";  // ← swap old import
import { PremiumSurface } from "@/components/ui/PremiumSurface";

// In the option:
itemStyle: {
  borderColor: dark ? "#18181b" : "#ffffff",  // matches card background
  borderWidth: 3,
  borderRadius: 7,    // rounded segment ends
  shadowBlur: 14,
  shadowColor: dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)",
},
emphasis: {
  focus: "self",
  scaleSize: 12,
  itemStyle: {
    shadowBlur: 28,
    shadowColor: dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)",
  },
  label: { show: true, ... },
},
universalTransition: true,
animationType: "scale",
animationEasing: "elasticOut",

// Per-slice linear gradient:
data: slices.map(s => ({
  name: s.name, value: s.value,
  itemStyle: {
    color: {
      type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: lighten(s.color, 0.22) },
        { offset: 1, color: s.color },
      ]
    }
  }
}))

// Outer wrapper — replace <div className="panel-elevated p-5">:
return (
  <PremiumSurface variant="base" className="p-5">
    <EChart option={option} height={360} notMerge={false} />
    {/* ... legend stays flat, not wrapped */}
  </PremiumSurface>
);
```

### FormaParticleAccent (clone of HeaderParticleAccent, lower intensity)

```typescript
// app/(dashboard)/forma-proposal/components/FormaParticleAccent.tsx
"use client";
import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 120;          // fewer than header (180)
const SPREAD_X = 12;                 // wider (full-bleed)
const SPREAD_Y = 8;                  // taller (full-bleed)
const SPREAD_Z = 0.5;
const DRIFT_SPEED = 0.00008;         // slower drift (more ambient)
const PARTICLE_COLOR = new THREE.Color(0x6366f1);  // same brand indigo

// ... ParticleField identical to HeaderParticleAccent ...
// except opacity = 0.18 (was 0.35) in pointsMaterial

export default function FormaParticleAccent() {
  return (
    <Canvas
      frameloop="demand"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
      camera={{ position: [0, 0, 3], fov: 60 }}
      gl={{ antialias: false, alpha: true, powerPreference: "low-power" }}
    >
      <ParticleField />
    </Canvas>
  );
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npm test -- --reporter=verbose app/\\(dashboard\\)/template-mty` |
| Full suite command | `npm test` (excludes e2e) |
| Type check | `npx tsc --noEmit` (checks WHOLE tree incl. test files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TPL-01 | DataTable renders 5 columns with sort | unit | `npm test -- TemplateMembersTable` | Yes — needs update |
| TPL-01 | Search box filters rows | unit | `npm test -- TemplateMembersTable` | Yes — needs update |
| TPL-01 | Filter chips (All/Internal/External/Admin) work | unit | `npm test -- TemplateMembersTable` | Yes — needs update |
| TPL-01 | Row-click calls onSelectMember with email | unit | `npm test -- TemplateMembersTable` | Yes — needs update |
| TPL-01 | Members without email are non-clickable | unit | `npm test -- TemplateMembersTable` | No — Wave 0 gap |
| TPL-02 | Graph renders empty state with no nodes | unit | `npm test -- RoleSimilarityGraph` | Yes — passes |
| TPL-02 | Node click fires onNodeClick with roleId | unit | `npm test -- RoleSimilarityGraph` | No — Wave 0 gap |
| TPL-03 | All panels wrapped in PremiumSurface | visual/manual | projector UAT | — |
| TPL-03 | loading.tsx renders within ~200ms | manual/e2e | browser DevTools | — |
| FRM-01 | HierarchyView renders with same props as before | unit | `npm test -- HierarchyView` | No — Wave 0 gap |
| FRM-01 | Deferred import: dynamic loads | manual | browser Network tab | — |
| FRM-02 | No WebGL context in data region | verification grep | `grep -r "Canvas" app/\(dashboard\)/forma-proposal` | — |
| FRM-02 | FormaParticleAccent renders without SSR error | build check | `npx tsc --noEmit` | — |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` + `npm test -- <affected-file>`
- **Per wave merge:** `npm test` (full suite, ~2015+ tests)
- **Phase gate:** Full suite green + `npx tsc --noEmit` exits 0 before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx` — needs update for DataTable API (current tests use ARIA role="table" / custom role="row" — DataTable uses real `<table>` with TanStack; selectors will change)
- [ ] New test: non-clickable member row (no email) is not `cursor-pointer` and onSelectMember not called
- [ ] New test: `RoleSimilarityGraph` — node click fires onNodeClick (new prop) after small movement
- [ ] New test: `HierarchyView` thin shell — renders HierarchyCanvas with all 8 props forwarded

---

## Security Domain

This phase is presentation-layer only. No new API routes, no authentication, no new data sources. Applicable ASVS categories:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | No | All data comes from page RSC props; no user-submitted data |
| V6 Cryptography | No | No new crypto |
| V2 Authentication | No | No new auth |
| V3 Session Management | No | No session changes |

No new threat patterns introduced.

---

## Planning Risk Register

### Risk 1: `TemplateMembersTable` test fixture mismatch (HIGH risk)

**Assumption:** The existing test file (`TemplateMembersTable.test.tsx`) uses ARIA selectors that match the current custom div-table (`role="table"`, `role="row"`, `role="columnheader"`). DataTable uses real `<table>`, `<thead>`, `<th>`, `<tr>`, `<td>` — but it also uses some virtual scroll divs. Test queries like `screen.getByRole("table")` will find different elements.

**Planner action:** Wave 0 task must update the test file to match the new DataTable structure. The test for "sorts by Member name" uses `within(grid).getAllByRole("row")` — this will need adjustment since the virtualizer renders rows in a `<div>` canvas, not standard `<tr>` elements accessible by role.

**Alternative:** The existing tests can be rewritten as integration tests on the `TemplateMembersTableShell` (the outer component that includes both toolbar and DataTable). The behavior under test (search, filter, sort, click) is the same; only the internal structure differs.

### Risk 2: HierarchyView split increases bundle at initial load [LOW risk]

**Assumption:** Moving `stratify` and `tree` imports into a lazy-loaded chunk defers them from the initial `forma-proposal` page load. However, `forma-proposal` currently imports `HierarchyView` eagerly (not dynamic). After the split, the thin shell (`HierarchyView.tsx`) is synchronous but `HierarchyCanvas` (containing d3) is dynamic.

**Planner action:** In `FormaProposalClient.tsx`, replace the static `import { HierarchyView }` with `const HierarchyView = dynamic(...)`. This is the correct structure per CONTEXT.md FRM-01.

### Risk 3: Graph node-click fires on touchscreens during scroll [LOW risk]

**Assumption:** The click-vs-drag threshold (4px movement) may be too small on touch devices where scroll gestures start with small initial movements.

**Planner action:** Use `CLICK_THRESHOLD_PX = 6` (Claude's discretion) and also gate the node-click on `e.pointerType !== "touch"` OR on `totalMovement < threshold AND duration < 200ms`. The latter approach is safer.

---

## Open Questions

1. **Role-overview drill data source for TPL-02**
   - What we know: `RoleSimilarityGraph` receives `graph: RoleSimilarityGraph` (nodes with `roleId`, `roleName`, `folderCount`, `maxRank`). The members table data (`overview.members`) is passed separately to `TemplateMembersTable`.
   - What's unclear: The `RoleOverviewSheet` needs to show "members who hold this role" — it must filter `overview.members` by `role === roleName`. This requires passing `overview.members` down to `TemplateAnalysisCharts` and then to `RoleSimilarityGraph` or to a sibling state handler.
   - Recommendation: Add `members: TemplateMember[]` prop to `TemplateAnalysisCharts` (it already receives `overview` which contains `overview.members`) — no new data fetch. Pass `members` alongside `graph` to `RoleSimilarityGraph`, or hoist the `selectedRoleId` state to `TemplateAnalysisCharts` and render `RoleOverviewSheet` there (consistent with how `profileEmail` is hoisted).

2. **`PermissionAccessChart.tsx` and `ModuleAccessChart.tsx` — confirm old EChart import**
   - What we know: `RoleAccessPie.tsx` imports from the old path. The other two files were not read.
   - What's unclear: Whether they also import the old wrapper.
   - Recommendation: Planner should read both files at task start to confirm, then update imports in the same commit.

---

## Verification Checklist (per requirement)

### TPL-01 Verification
- [ ] `npm test -- TemplateMembersTable` green
- [ ] `npx tsc --noEmit` exits 0
- [ ] DataTable renders: Member / Role / Company / Access / Origin columns (5 total)
- [ ] Search box present and functional (filters `data` prop passed to DataTable)
- [ ] Four filter chips: All / Internal / External / Admin — functional
- [ ] Count badge: "{filtered} of {total}" visible in toolbar
- [ ] Row with email: cursor-pointer, click opens `AuthorProfileDrawer` with correct email
- [ ] Row without email: cursor-default, no pointer, click is no-op
- [ ] Sort: click column header → sort ascending; click again → descending

### TPL-02 Verification (charts)
- [ ] `grep -r "access-analysis/components/EChart" app/(dashboard)/template-mty` returns 0
- [ ] All three charts use `@/components/ui/EChart`
- [ ] Gradient fills visible on pie/donut segments in both light and dark themes
- [ ] Rounded segment ends visible (`borderRadius: 7`)
- [ ] Hover: segment lifts + glow; no click-through affordance (no cursor:pointer)

### TPL-02 Verification (graph)
- [ ] Graph settles and freezes on mount (no perpetual tick after alphaMin)
- [ ] Drag: node can be dragged; simulation reheats; freezes on release
- [ ] Click (< threshold movement): `RoleOverviewSheet` opens with correct role data
- [ ] Hover label: label text does not clip outside SVG panel bounds at any node position
- [ ] Hover tooltip card: does not clip outside panel at edge nodes
- [ ] `npx tsc --noEmit` exits 0

### TPL-03 Verification
- [ ] `app/(dashboard)/template-mty/loading.tsx` exists
- [ ] All chart panels: root div is `PremiumSurface variant="base"` (not plain `panel-elevated`)
- [ ] `Reveal` wrapping unchanged (sections already have it)
- [ ] Empty states: `PremiumSurface variant="inset"` with icon + message

### FRM-01 Verification
- [ ] `HierarchyView.tsx` exports `HierarchyView` function — same 8-prop signature as before
- [ ] `FormaProposalClient.tsx` HierarchyView import is `dynamic(ssr:false, loading: <HierarchyViewSkeleton/>)`
- [ ] Switching to "hierarchy" mode: skeleton appears while bundle loads
- [ ] All 8 public props: `index, explicit, rootLabel, roles, activeRoleId, activeRoleLabel, onPickRole, onSetTier, onApplySubtree, onClear` — all passed through and functional
- [ ] Idle prefetch `useEffect` in FormaProposalClient.tsx
- [ ] `npx tsc --noEmit` exits 0

### FRM-02 Verification
- [ ] `grep -r "Canvas" app/(dashboard)/forma-proposal` — returns ONLY `FormaParticleAccent.tsx`
- [ ] `FormaParticleAccent` imported via `dynamic(ssr:false)` in `FormaProposalClient.tsx`
- [ ] Canvas: `frameloop="demand"`, `pointerEvents:"none"`, `position:"absolute"`, `inset:0`, `zIndex:0`
- [ ] Editor content: `position:relative`, `zIndex:1` (renders above particle layer)
- [ ] PremiumSurface: role rail outer container, editor section outer container, hierarchy view container
- [ ] Folder-tree rows and tier chips remain flat (no PremiumSurface on individual rows)
- [ ] Loading state: `HierarchyViewSkeleton` replaces plain "Loading your draft…" text
- [ ] `app/(dashboard)/forma-proposal/loading.tsx` exists

### WebGL Context Guardrail (PERF-05)
- [ ] `grep -r "Canvas" app/(dashboard)/forma-proposal` — ONE file (`FormaParticleAccent.tsx`)
- [ ] `grep -r "Canvas" app/(dashboard)/template-mty` — ZERO files
- [ ] Chrome DevTools → Performance tab: GPU memory < 400MB on `/forma-proposal`

### Type + Build Gate
- [ ] `npx tsc --noEmit` exits 0 (run BEFORE `npm run build`)
- [ ] `npm test` — full suite green (no regressions)

---

## Sources

### Primary (HIGH confidence)
- `components/ui/DataTable.tsx` — read in full; all props and behaviors verified
- `components/ui/PremiumSurface.tsx` — read in full; all variants verified
- `components/ui/DrillSheet.tsx` — read in full; props and width override verified
- `components/ui/EChart.tsx` — read in full; mergeEChartsTheme call verified
- `components/ui/motion.ts` — read in full; all presets and useSafeVariants verified
- `components/ui/animated-list.tsx` — read in full; Reveal + useEntrance verified
- `app/(dashboard)/users/UserProfilePanel.tsx` — read in full; props and variants verified
- `app/(dashboard)/users/HeaderParticleAccent.tsx` — read in full; all config constants verified
- `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx` — read in full; toolbar structure verified
- `app/(dashboard)/template-mty/components/RoleSimilarityGraph.tsx` — read in full; 244 lines; physics + hover + click state verified
- `app/(dashboard)/template-mty/components/RoleAccessPie.tsx` — read in full; old EChart import confirmed
- `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` — read in full; structure and dynamic import verified
- `app/(dashboard)/forma-proposal/components/HierarchyView.tsx` — read in full; 316 lines; all state + effects verified
- `app/(dashboard)/forma-proposal/components/FormaProposalClient.tsx` — read in full; HierarchyView call site and props verified
- `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` — read in full; full donut treatment recipe verified
- `app/(dashboard)/access-analysis/components/AuthorProfileDrawer.tsx` — read in full; dynamic+ssr:false pattern verified
- `lib/colors/echartsTheme.ts` — read in full; mergeEChartsTheme pure function verified
- `app/(dashboard)/users/UsersTableHeader.tsx` — read in full; R3F dynamic import pattern verified
- Glob scan of `loading.tsx` files — confirmed template-mty and forma-proposal have NO loading.tsx
- `package.json` — versions of all key dependencies verified

### Secondary (MEDIUM confidence)
- Phase 1–5 ROADMAP.md and REQUIREMENTS.md — phase history and primitive build order verified

---

## Metadata

**Confidence breakdown:**
- Primitive locations and APIs: HIGH — read from source
- HierarchyView split boundary: HIGH — 316-line file fully read; split is straightforward
- Full donut treatment recipe: HIGH — copied from RolesPieChart.tsx source
- R3F accent clone strategy: HIGH — HeaderParticleAccent.tsx fully read
- dynamic(ssr:false) pattern: HIGH — 8+ usages confirmed in codebase
- Idle prefetch pattern: MEDIUM — no `requestIdleCallback` found in repo; pattern is well-known browser API with setTimeout fallback
- Test fixture migration: MEDIUM — DataTable uses virtualizer divs; exact test selector changes require execution to confirm

**Research date:** 2026-06-19
**Valid until:** 2026-07-19 (stable stack, no external dependencies)
