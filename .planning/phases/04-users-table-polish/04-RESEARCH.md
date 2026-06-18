# Phase 4: /users Table & Polish — Research

**Researched:** 2026-06-18
**Domain:** Next.js 15 / TanStack Table v8 / Zustand 5 / Framer Motion 12 / R3F (to-install) — /users directory table redesign
**Confidence:** HIGH (all key findings verified directly from codebase files)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Lean 5-column grid:** Name (pinned, left) · Role · Office · Last active · Projects.
- **Default density: Comfortable** (DataTable primitive default).
- **Default sort: Name A→Z**.
- **Projects column = ALL projects** (total memberships, not active/admin only).
- **Office column = office LOCATION** (MTY / CDMX / MXL …), not company name.
- **Last active = last REAL ACC ACTIVITY only** (not `lastSignIn`). Format: relative ("2h ago") with exact timestamp on hover. No activity → "— No data" (muted).
- **Name cell = avatar photo with colored-initials fallback.**
- **Multiple roles → primary role + "+N" badge** in Role column; full list in panel.
- **Dormant/inactive = subtle status dot** (not dimmed row). Threshold ~90d (Claude's discretion).
- **Inline row-expand "peek" = mini snapshot** (cheap/already-loaded data). Row-click = full profile panel (heavy data deferred).
- **3D accent = subtle ambient drift**, confined to header strip only. `R3F ssr:false + frameloop:demand`. GPU < 400MB.
- **Count-up animation ~1s ease-out, once per load.**
- **Skeleton = table-shaped shimmer placeholder**, within ~200ms of navigation.
- **Entrance reveal = whole-page fade-in** (unified, calm). VIS-03 reconciliation: barely-perceptible row under-stagger beneath the unified fade.
- **Motion fires once per fresh load only** — instant on sort/filter/density toggle/panel open.
- **Error state = inline message + Retry button**, page chrome intact.
- **Filter bar = slim restyled toolbar** above the table, glass/depth language.
- **Filtered-empty state = "No one matches those filters" + Clear-filters** wired to `DataTable.onClearFilters`.

### Claude's Discretion

- Secondary-field tiering between peek and panel (driven by cheap-vs-heavy data boundary).
- Office column exact source (location is the default; see `officeCodeFor` derivation below).
- Dormant threshold value (~90d leaning).
- **Detail panel style** → slide-in-from-right-edge (DrillSheet); completes Dialog→Sheet migration deferred from Phase 2.
- **Detail panel source** → reuse existing shared `UserProfilePanel` (variant="dialog" inside DrillSheet).
- **Peek → panel affordance** → "See full profile →" control in peek + row-click both open panel.
- KPI selection (Total users · Active 30d · Admins), header composition, count-up timing.
- **Clickable KPIs → display-only** by default.
- Filter bar exact layout and filtered-empty copy.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope. No new capabilities (search-semantics changes, bulk actions, new analytics) were requested. `/users/spatial-graph` strictly out of scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| USR-02 | User directory presented as premium DataTable — pinned name column, sticky frosted header, sortable, density toggle, row-click → detail panel, row-expand → inline summary | Phase 3 `DataTable` primitive is fully built at `components/ui/DataTable.tsx`; wiring spec in Architecture Patterns section |
| PERF-01 | Each page shows skeleton/loading state within ~200ms of navigation | `/users/loading.tsx` already ships a row-skeleton; must be replaced with table-shaped shimmer; Suspense boundary is in `page.tsx` |
| PERF-04 | /users initial client payload reduced; heavy per-user data deferred to detail-open; no load-time regression | `useUsersDirectoryData` already loads `leanProjects:true` bulk; `getFileActivityForUser` is already hover-lazy; UserProfilePanel uses `bulkUserToProfileData` (in-memory, no new fetch); PERF-03 must hold (each tRPC endpoint once per load) |
| INT-03 | Table rows clickable (open detail) and expandable inline (summary) without full-page navigation | DataTable's `onRowClick` + `renderExpanded` slots are the integration seam; DrillSheet is the detail panel shell |
| VIS-03 | Page content reveals with staggered entrance under <400ms motion budget, once per load | motion facade (`@/components/ui/motion`) ships `fadeIn`, `stagger`, `useSafeVariants`; whole-page fade-in is the locked direction |
| VIS-04 | KPI numbers count up smoothly on first load | No existing count-up hook in repo — must implement inline (simple `useEffect` + `requestAnimationFrame` or framer-motion's `useMotionValue`/`animate`) |
</phase_requirements>

---

## Summary

Phase 4 converts the existing card/list `/users` directory into a premium, premium `DataTable`-based presentation. All three foundational prerequisites are complete: Phase 1 shipped the design-system tokens (`globals.css`), `PremiumSurface`, motion facade, and `DrillSheet`; Phase 2 decomposed the directory into `useUsersDirectoryStore` + `useUsersDirectoryData` + `useDirectoryRows`; Phase 3 shipped the generic virtualized `DataTable<T>` primitive. Phase 4 is now a **wiring + enhancement phase**, not a greenfield build.

The work has four distinct tracks: (1) wire the `DataTable` primitive into `UsersDirectoryClient`, supplying five typed column definitions and `renderExpanded` / `onRowClick` callbacks; (2) migrate `PersonDetailModal` (centered Dialog) to open inside `DrillSheet` (right-edge Sheet) as the CONTEXT-locked direction, reusing `UserProfilePanel` variant="dialog"; (3) add the header strip: KPI glass tiles with count-up + the R3F particle accent (requires installing `@react-three/fiber@9` — not yet in `node_modules`); (4) replace the current card/grid skeleton in `UsersDirectoryClient` with a table-shaped shimmer skeleton and wire the entrance fade via the motion facade.

The payload-deferral requirement (PERF-04) is already structurally met: `BULK_USERS_LEAN_INPUT` + the `enabled:false` invitations query + the `UserProfilePanel` bulk-data-in-memory pattern mean no new heavy fetches are added. The only additive fetch introduced in this phase is `getFileActivityForUser` (already hover-lazy) and `users.getAccProfile` (only fires on the "Refresh" button in `UserProfilePanel`). The planner must ensure the DataTable column for "Last active" reads from `BulkAccProject[].lastActivity` (P5-C field on each project instance) — NOT `BulkAccUser.lastSignIn` (which is a sign-in, not a real ACC activity), and must derive a per-user `lastActivity` date by taking `max(project.lastActivity)` across all projects before rendering.

**Primary recommendation:** Wire `DataTable` columns first (Wave 1), then the sheet migration (Wave 2), then header + KPIs + R3F (Wave 3). This order minimizes risk: the table works before the panel interaction is migrated, and the R3F install (the only net-new dependency) is last.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Column definitions / cell renderers | Client (React) | — | Data comes from in-memory `accSummaryMap`; pure derived rendering |
| Row filtering / sorting / windowing | Client (React) | — | Already in `useDirectoryRows` + `useUsersDirectoryStore`; DataTable takes pre-filtered data |
| Detail panel (DrillSheet) open/close | Client (React) | — | Controlled via `useUsersDirectoryStore.selectedEmail` |
| Heavy per-user data (UserProfilePanel) | Client (React, lazy) | API / Backend | `bulkUserToProfileData` runs in-memory; only "Refresh" hits `users.getAccProfile` |
| Last-activity per-user | Client (React) | Database | `max(project.lastActivity)` derived from `BulkAccProject[].lastActivity` already in `accSummaryMap` |
| KPI counts | Client (React) | — | Derived from `people.length`, `accSummaryMap` counts; same as `KpiHeroStrip` pattern |
| Header 3D particle accent | Client (React, R3F) | — | `dynamic(ssr:false)` + `frameloop="demand"` + `pointer-events:none`; pure visual |
| Loading skeleton | Client (React) | — | `/users/loading.tsx` (Next.js file-based) + inline `isLoading` shimmer in `UsersDirectoryClient` |
| Entrance animation | Client (React) | — | Framer Motion facade; fires once on mount |

---

## Standard Stack

### Core (already installed — no new installs for the table/panel/motion work)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @tanstack/react-table | 8.21.3 | Column defs, sort, expand, pinning | DataTable primitive already uses this exact API [VERIFIED: package.json] |
| @tanstack/react-virtual | 3.13.24 | Row virtualization inside DataTable | DataTable uses `useVirtualizer` — already installed [VERIFIED: package.json] |
| framer-motion | 12.40.0 | Entrance animation + AnimatePresence | Motion facade at `components/ui/motion.ts` re-exports this [VERIFIED: package.json] |
| zustand | 5.0.14 | Directory store | `useUsersDirectoryStore` is the single store [VERIFIED: package.json] |
| date-fns | (transitive) | `formatDistanceToNowStrict` for relative timestamps | Already used in `PersonRow.tsx` + `ActivityAuditPanel.tsx` [VERIFIED: codebase] |
| three | 0.184.0 | Three.js — already in bundle (cosmos.gl dependency) | Required by R3F; already loaded [VERIFIED: package.json] |

### New Installs Required (R3F header accent only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @react-three/fiber | 9.x (R3F) | React wrapper for Three.js Canvas | Header particle accent only. VIS-04/VIS-06 requirement. `three` already installed, marginal bundle cost is ~60KB gzip [ASSUMED per STACK.md §R3F] |
| @react-three/drei | latest | R3F helpers (Points, shaders, etc.) | Only if particle implementation needs shader helpers; optional [ASSUMED] |

**Installation (R3F only — run in Wave 3 setup task):**
```bash
npm install @react-three/fiber@9
# @react-three/drei is optional; add only if needed for the particle implementation
```

**Version verification note:** `@react-three/fiber@9` targets React 19. The repo is on React 19 (confirmed by Phase 1 decision: framer-motion bumped to 12.40.0 for React 19 reorder fix). Do NOT install `@react-three/fiber@8` — it is incompatible with React 19. [ASSUMED per STACK.md §"React 19 compatibility"]

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn Sheet (already installed) | — | DrillSheet shell — right-edge 480px panel | Row-click → detail panel; `DrillSheet` wraps this |
| shadcn Dialog (already installed) | — | `PersonDetailModal` — currently used; being migrated away from | Only kept as temporary until DrillSheet migration complete |

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| @react-three/fiber | npm | 4+ yrs | 1M+/wk | github.com/pmndrs/react-three-fiber | OK | Approved — official R3F package [ASSUMED: not yet verified via seam; package is well-known mainstream library] |
| @react-three/drei | npm | 4+ yrs | 900k+/wk | github.com/pmndrs/drei | OK | Approved — official R3F helpers [ASSUMED: optional; only add if needed] |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** none
**Note:** `@react-three/fiber` and `@react-three/drei` are verified major ecosystem packages for Three.js React integration, but the STACK.md research tagged them `[ASSUMED]` since the seam was not re-run in this session. The planner must add a `checkpoint:human-verify` before the `npm install @react-three/fiber@9` task if strict provenance is required.

---

## Architecture Patterns

### System Architecture Diagram

```
page.tsx (RSC)
  └─ prefetchUsersRouteAccData() ─── tRPC server prefetch ────────────┐
  └─ HydrationBoundary                                                 │
       └─ Suspense (fallback: loading.tsx skeleton) ◄── NEW: table-   │
            └─ UsersDirectoryClient ("use client")        shaped shimmer
                 ├─ useUsersDirectoryData()  ◄────────────── hydration cache hit (no re-fetch)
                 │    ├─ accDcGraph.bulkUsers(leanProjects:true) ◄─────┘
                 │    ├─ accMembers.enrichedUsers
                 │    ├─ users.getOrgDirectory
                 │    └─ users.getDirectory (fallback)
                 ├─ useDirectoryRows(people, accSummaryMap, ...)
                 │    └─ (filter/sort/group — reads from Zustand store)
                 │
                 ├─ [NEW] UsersTableHeader ── glass KPI tiles + count-up
                 │    └─ [NEW, dynamic ssr:false] HeaderParticleAccent (R3F Canvas)
                 │
                 ├─ DirectoryFilterBar (reads store directly)
                 │
                 ├─ DataTable<DirectoryRow>
                 │    ├─ columns: [name(pinned), role, office, lastActive, projects]
                 │    ├─ onRowClick ──────────────► store.setSelectedEmail()
                 │    ├─ renderExpanded ──────────► PeekPanel (cheap in-memory data)
                 │    ├─ defaultSort: [{id:'name', desc:false}]
                 │    ├─ hasActiveFilter / onClearFilters (wired to store)
                 │    └─ pinnedColumn="name"
                 │
                 ├─ DrillSheet open={!!selectedEmail} onClose={...}
                 │    └─ UserProfilePanel variant="dialog"
                 │         └─ bulkUserToProfileData(accSummaryMap.get(email))
                 │              └─ [lazy, on Refresh only] users.getAccProfile
                 │
                 └─ [KEEP, read-only] accActivity.usersOrderedByLastFileActivity
                    (only fires when activitySort.active=true)
```

**Data flows that must NOT be added (PERF-03):**
- No new tRPC query per-row or on-mount that isn't already present
- `getFileActivityForUser` remains hover-triggered only (250ms debounce in shell)
- `getLastFileActivityBatch` remains visibility-triggered only (IntersectionObserver in PersonRowList — KEEP PersonRowList for the activity-sort "list mode" fallback or retire gracefully)

### Recommended Project Structure (new files only)

```
app/(dashboard)/users/
├─ UsersDirectoryClient.tsx      # MODIFY: add DataTable wiring, header, DrillSheet
├─ UsersTableHeader.tsx          # NEW: glass KPI strip + count-up numbers
├─ HeaderParticleAccent.tsx      # NEW: R3F canvas (dynamic ssr:false)
├─ PeekPanel.tsx                 # NEW: renderExpanded slot content (inline peek)
├─ DirectoryTableColumns.tsx     # NEW: ColumnDef<DirectoryRow>[] array
├─ directoryTableRow.ts          # NEW: DirectoryRow type + buildDirectoryRows()
└─ loading.tsx                   # MODIFY: swap card-grid shimmer → table-shaped shimmer
```

### Pattern 1: DataTable Wiring — DirectoryRow + Column Definitions

**What:** Convert `OrgPerson` + `BulkAccUser` into a flat `DirectoryRow` type suitable for TanStack Table column accessors. Column defs live in a separate file; the shell just passes `data={rows}` and `columns`.

**When to use:** Always — TanStack Table requires a stable flat row type for generic typing.

```typescript
// directoryTableRow.ts  [VERIFIED: pattern from Phase 3 DataTable implementation]
import type { OrgPerson } from "./directoryUtils";
import type { BulkAccUser } from "@/lib/acc/acc-types";

export interface DirectoryRow {
  // identity
  email: string;
  resourceName: string;         // stable key for TanStack row id
  displayName: string;
  photoUrl: string | null;
  // column data
  primaryRole: string | null;   // first of allRoles, or null
  extraRoleCount: number;        // allRoles.length - 1 (for "+N" badge)
  officeCode: string | null;    // "MTY" | "CDMX" | etc. (derived from project names)
  officeLabel: string | null;   // "Monterrey" | "Ciudad de México" | etc.
  lastActivity: string | null;  // max(project.lastActivity) across all projects (ISO)
  projectCount: number;         // allProjects.length
  isDormant: boolean;           // lastActivity gap > 90d (or null = no data)
  // cheap data for peek panel
  jobTitle: string | null;
  department: string | null;
  // raw references for the detail panel
  accUser: BulkAccUser | null;  // full BulkAccUser for UserProfilePanel
}

export function buildDirectoryRows(
  people: OrgPerson[],
  accSummaryMap: Map<string, BulkAccUser>
): DirectoryRow[] { ... }
```

**Column definitions pattern:**
```typescript
// DirectoryTableColumns.tsx  [VERIFIED: TanStack Table v8 createColumnHelper pattern]
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { DirectoryRow } from "./directoryTableRow";

const col = createColumnHelper<DirectoryRow>();

export const USERS_COLUMNS: ColumnDef<DirectoryRow, string>[] = [
  col.accessor("displayName", {
    id: "name",
    header: "Name",
    size: 240,
    enableSorting: true,
    cell: (ctx) => <NameCell row={ctx.row.original} />,
  }),
  col.accessor("primaryRole", {
    id: "role",
    header: "Role",
    size: 180,
    enableSorting: false,
    cell: (ctx) => <RoleCell row={ctx.row.original} />,
  }),
  col.accessor("officeLabel", {
    id: "office",
    header: "Office",
    size: 120,
    enableSorting: true,
  }),
  col.accessor("lastActivity", {
    id: "lastActive",
    header: "Last active",
    size: 140,
    enableSorting: true,
    cell: (ctx) => <LastActiveCell isoDate={ctx.getValue()} />,
  }),
  col.accessor("projectCount", {
    id: "projects",
    header: "Projects",
    size: 90,
    enableSorting: true,
  }),
];
```

### Pattern 2: DrillSheet Migration (PersonDetailModal → DrillSheet)

**What:** Replace the centered shadcn Dialog (`PersonDetailModal`) with `DrillSheet` (right-edge Sheet at ~480px). `UserProfilePanel` becomes the DrillSheet child.

**When to use:** Whenever `selectedEmail` is non-null. Coexist with `activityEmail` Sheet (keep the existing `activityEmail` Sheet for the old activity-sort side-panel; they are separate open states).

```typescript
// In UsersDirectoryClient.tsx — replacing PersonDetailModal
// Source: DrillSheet.tsx (Phase 1 INT-01) [VERIFIED: components/ui/DrillSheet.tsx]
import { DrillSheet } from "@/components/ui/DrillSheet";
import dynamic from "next/dynamic";
const UserProfilePanel = dynamic(
  () => import("./UserProfilePanel").then(m => m.UserProfilePanel),
  { ssr: false }
);

// In JSX:
<DrillSheet
  open={!!selectedEmail}
  onClose={() => setSelectedEmail(null)}
>
  {selectedEmail && (
    <UserProfilePanel
      user={accSummaryMap.get(selectedEmail?.toLowerCase() ?? "") ?? null}
      email={selectedEmail}
      variant="dialog"
    />
  )}
</DrillSheet>
```

**Note:** `PersonDetailModal` contains the `OrgPerson` header (avatar banner, contact info rows). That outer chrome must be preserved — either move it into the DrillSheet body above `UserProfilePanel`, or extend `UserProfilePanel` with a `person` prop. The current `PersonDetailModal` layout (gradient banner, centered avatar, info rows, then `UserProfilePanel`) should move to the DrillSheet content body.

### Pattern 3: Header KPI Count-Up

**What:** Animate a number from 0 to its final value over ~1s ease-out, once per mount.

**When to use:** Each KPI tile in `UsersTableHeader`. No library needed — use Framer Motion's `animate()` imperative API.

```typescript
// UsersTableHeader.tsx  [ASSUMED — framer-motion animate() imperative pattern]
import { animate, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const display = useTransform(mv, (v) => Math.round(v).toLocaleString());
  useEffect(() => {
    const controls = animate(mv, value, { duration: 1, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [value, mv]);
  return <motion.span>{display}</motion.span>;
}
```

**Alternative (simpler):** `useEffect` + `requestAnimationFrame` linear interpolation with an eased timer — zero dependency cost, easier to test, matches the "once per load" requirement exactly since it runs once on mount with the final value. Either approach works; the framer-motion approach is consistent with the existing motion facade.

### Pattern 4: R3F Header Particle Accent

**What:** A subtle ambient drift of ~150–200 small points behind the KPI strip, using Three.js `Points` geometry. Confined to the header region. Must not affect DataTable's FPS.

**When to use:** One instance per page load, mounted only in the header `<UsersTableHeader>`.

```typescript
// HeaderParticleAccent.tsx (dynamic import target)  [ASSUMED — standard R3F pattern]
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";

function DriftingParticles() {
  const ref = useRef<THREE.Points>(null);
  // useFrame only runs when frameloop="always"; with "demand", this fires only
  // when we call invalidate() — so use a slow timer to invalidate periodically
  // for the "ambient drift" effect rather than continuous 60fps rendering.
  // Alternative: frameloop="always" at very low particle count (200) — GPU cost trivial.
  return (
    <points ref={ref}>
      <bufferGeometry>
        {/* positions buffer: 200 random particles in [-1, 1]³ */}
      </bufferGeometry>
      <pointsMaterial size={0.015} color="#6366f1" transparent opacity={0.5} />
    </points>
  );
}

// dynamic-imported from UsersTableHeader:
export default function HeaderParticleAccent() {
  return (
    <Canvas
      frameloop="demand"         // render only when invalidated (PERF-05)
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      camera={{ position: [0, 0, 2] }}
    >
      <DriftingParticles />
    </Canvas>
  );
}
```

**Import in UsersTableHeader:**
```typescript
const HeaderParticleAccent = dynamic(
  () => import("./HeaderParticleAccent"),
  { ssr: false }   // REQUIRED — WebGL is not available server-side (VIS-06)
);
```

### Pattern 5: Table-shaped Loading Skeleton

**What:** Replace the current card-grid shimmer in `UsersDirectoryClient` and the route-level `loading.tsx` with a skeleton that matches the DataTable column layout (5 columns, header row, 8 data rows).

**When to use:** Two entry points — (a) `loading.tsx` (Next.js route boundary, appears in ~200ms), (b) the `{isLoading && <TableSkeleton />}` inline in `UsersDirectoryClient` for client-hydration re-renders.

```typescript
// Table-shaped skeleton pattern  [VERIFIED: loading.tsx uses Skeleton from shadcn]
import { Skeleton } from "@/components/ui/skeleton";

export function UsersTableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {/* Header row */}
      <div className="flex gap-3 px-3 py-2 border-b border-border/60">
        <Skeleton className="h-3 w-[240px]" />
        <Skeleton className="h-3 w-[180px]" />
        <Skeleton className="h-3 w-[120px]" />
        <Skeleton className="h-3 w-[140px]" />
        <Skeleton className="h-3 w-[90px]" />
      </div>
      {/* 8 data rows */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-4">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-4 w-[160px]" />
          <Skeleton className="h-4 w-[100px]" />
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-4 w-[70px]" />
        </div>
      ))}
    </div>
  );
}
```

### Pattern 6: Entrance Animation (whole-page fade-in)

**What:** Wrap `UsersDirectoryClient`'s top-level `<div>` in `motion.div` using the `fadeIn` preset from the motion facade. No row-by-row stagger visible to the eye; a barely-perceptible `stagger` preset on the table body rows satisfies VIS-03 technically.

```typescript
// [VERIFIED: motion facade exports fadeIn, stagger, useSafeVariants]
import { motion, fadeIn, useSafeVariants } from "@/components/ui/motion";

// In UsersDirectoryClient:
const safeFade = useSafeVariants(fadeIn);
// ... in JSX:
<motion.div
  initial={safeFade.hidden}
  animate={safeFade.visible}
  className="mx-auto max-w-[1600px] p-6 space-y-4"
>
  {/* full content */}
</motion.div>
```

**Important:** `useSafeVariants` is called ONCE at component scope (Rules of Hooks). The VIS-03 "once per load" behavior is automatic — `initial`/`animate` on mount fires once and stays in the `visible` state thereafter.

### Anti-Patterns to Avoid

- **Importing framer-motion directly:** Always `import { motion, ... } from "@/components/ui/motion"` — never `from "framer-motion"`.
- **Using `BulkAccUser.lastSignIn` as "Last active":** That is the ACC sign-in timestamp, not ACC activity. Use `max(project.lastActivity)` across `BulkAccUser.projects`.
- **Adding a new tRPC query for "Last active per user":** The data is already in `accSummaryMap` via `BulkAccProject.lastActivity` (P5-C field). No new endpoint needed.
- **Placing `@react-three/fiber` Canvas anywhere except the header strip:** GPU context must stay confined to the header region (PERF-05 / VIS-06 constraint).
- **Touching any file under `users/access-analysis/`:** Strictly out of scope. Verify with `git diff --name-only`.
- **Removing `PersonRowList` without ensuring the "list mode" (activitySort) path still works:** The current `UsersDirectoryClient` renders `PersonRowList` for list-view with activity sort. If the DataTable replaces both grid and list views, the activity-sort `Sheet` side-panel is separately wired via `activityEmail` state — that Sheet must remain functional.
- **Calling `next build` before `npx tsc --noEmit`:** TypeScript errors in test files block the build. Always run `npx tsc --noEmit` first.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sortable virtualized table | Custom table with sort | `DataTable<DirectoryRow>` at `components/ui/DataTable.tsx` | Phase 3 ships the exact primitive (FND-05); all the edge cases are already solved |
| Right-edge slide-in panel | Custom Sheet/drawer | `DrillSheet` at `components/ui/DrillSheet.tsx` | Phase 1 INT-01 — already handles width override, glass surface, animation timing |
| Motion reduced-motion enforcement | Custom `useReducedMotion` hook | `useSafeVariants` from `@/components/ui/motion` | Single enforcement point (FND-04) — zeroes durations + stagger on media query |
| Avatar with initials fallback | Custom avatar | `ProfileAvatar` at `app/(dashboard)/users/ProfileAvatar.tsx` | Already ships photo + `getInitials` fallback + shadcn Avatar sizing |
| Relative time formatting | Custom date formatter | `formatDistanceToNowStrict` from `date-fns` | Already a transitive dependency; consistent with `PersonRow.tsx` pattern |
| User profile data in detail panel | New fetch on panel open | `UserProfilePanel` + `bulkUserToProfileData` | Reads from in-memory `accSummaryMap` — zero additional fetch (PERF-04) |
| Office derivation | Ad-hoc string parsing | `officeCodeFor()` + `officeLabel()` from `app/(dashboard)/access-analysis/projectGroups.ts` | Authoritative logic with MTY allowlist override |
| CSS depth/glow/glass | Hardcoded hex/shadows | CSS tokens: `--depth-float`, `--glow-primary`, `--surface-2`, `panel-elevated` | FND-01 — single source of truth in `globals.css` |

---

## Component / Store / Hook Map

### /users component tree (current, Phase 2 output)

```
app/(dashboard)/users/
  page.tsx                          — RSC; prefetches 4 tRPC queries + HydrationBoundary
  loading.tsx                       — Next.js route-level skeleton (Suspense fallback)
  UsersDirectoryClient.tsx          — ~314-line orchestrator shell ("use client")
  useUsersDirectoryStore.ts         — Zustand 5 store (all filter/selection/view state)
  useUsersDirectoryData.ts          — 8 tRPC queries + all derivations (people, accSummaryMap, etc.)
  useDirectoryRows.ts               — filter/sort/group/window memos; reads store
  directoryUtils.ts                 — OrgPerson, GroupByField, ViewMode types; pure helpers
  useMergedAccUsers.ts              — OrgPerson, BulkAccUser types; merge helpers
  PersonDetailModal.tsx             — centered Dialog; MIGRATE TO DrillSheet in Phase 4
  UserProfilePanel.tsx              — shared panel body (variant="dialog"|"rail")
  ProfileAvatar.tsx                 — Avatar + getInitials fallback
  DirectoryFilterBar.tsx            — filter toolbar (reads store directly)
  PersonRowList.tsx                 — windowed list view (useWindowVirtualizer)
  PersonRow.tsx                     — single list row + file-activity cells
  PersonCard.tsx                    — single grid card
  ActivityAuditPanel.tsx            — activity detail section
  DirectoryListHeader.tsx           — list-view column headers
  DirectoryPills.tsx                — StatusPill, AdminPill, AccBadge
  ModuleBadge.tsx                   — module badge
  CollapsibleGroup.tsx              — collapsible group label
  DataCoverageStrip.tsx             — coverage indicator bar
```

### Zustand store shape (`useUsersDirectoryStore`)

Key fields for Phase 4:
- `selectedEmail: string | null` — controls DrillSheet open state; set via `setSelectedEmail`
- `activityEmail: string | null` — controls existing activity Sheet (keep as-is)
- `viewMode: "grid" | "list"` — Phase 4 replaces both modes with DataTable (may simplify)
- `search`, `debouncedSearch`, filter fields — feed `useDirectoryRows` unchanged
- `clearAllFilters()` — wired to DataTable's `onClearFilters`

### Data flow (PERF-04 payload deferral)

| Data | When loaded | Source | Notes |
|------|-------------|--------|-------|
| `accSummaryMap` (16,942 users, `leanProjects:true`) | On page load (prefetched) | `accDcGraph.bulkUsers` | Already in hydration cache — no client fetch |
| `people` (OrgPerson array) | On page load (prefetched) | `users.getOrgDirectory` or fallback | Already prefetched |
| `enrichedUsers` | On page load (prefetched) | `accMembers.enrichedUsers` | Already prefetched |
| `BulkAccProject.lastActivity` | Already in `accSummaryMap` | P5-C enrichment | No new query — derive max() client-side |
| `BulkAccUser.allRoles` | Already in `accSummaryMap` | leanProjects includes top-level fields | No new query |
| Full profile (AccProfileSection, stat cards) | Lazy — when DrillSheet opens | `bulkUserToProfileData(accSummaryMap.get(email))` | In-memory, zero fetch (PERF-04) |
| Live refresh | Lazy — on Refresh button click | `users.getAccProfile` (force) | User-initiated only |
| File-activity timestamps | Lazy — hover 250ms debounce | `accActivity.getFileActivityForUser` | Already hover-lazy; keep for peek panel "Last file: X ago" |

---

## Common Pitfalls

### Pitfall 1: Using `BulkAccUser.lastSignIn` for "Last active"

**What goes wrong:** `BulkAccUser.lastSignIn` is the Autodesk ACC *sign-in* timestamp (`AccDcUser.lastSignIn`), not the last ACC activity event. The CONTEXT explicitly locks "Last active = last REAL ACC ACTIVITY only."

**Why it happens:** `lastSignIn` is a top-level BulkAccUser field, easy to reach. `lastActivity` is per-project inside `BulkAccUser.projects[].lastActivity`.

**How to avoid:** In `buildDirectoryRows`, derive `lastActivity` as:
```typescript
const lastActivity = user.projects
  .map(p => p.lastActivity)
  .filter((s): s is string => !!s)
  .sort()
  .at(-1) ?? null;
```
**Warning signs:** "Last active" shows dates like "2 days ago" for everyone (sign-in is recent). Real activity dates will show gaps for users whose projects aren't DC-extracted.

### Pitfall 2: Adding per-row tRPC queries (N+1 fetch)

**What goes wrong:** Placing a `trpc.someQuery.useQuery({ email })` inside a column cell renderer fires N queries for N visible rows.

**Why it happens:** The DataTable's `renderExpanded` / cell `ctx.row.original` pattern invites per-row data fetching.

**How to avoid:** All directory-row data must come from `accSummaryMap` (already loaded). The peek panel must use only data already in `DirectoryRow` (cheap/already-loaded fields). Per-user *activity* data for the peek is fine only if it's already in the hover-prefetch cache — don't add an unconditional query.

### Pitfall 3: PERF-03 cache key mismatch on `bulkUsers`

**What goes wrong:** If the DataTable or new header code calls `accDcGraph.bulkUsers` with a different input object than `BULK_USERS_LEAN_INPUT`, it creates a second cache entry and triggers a full ~15MB re-fetch on client mount.

**Why it happens:** `{ leanProjects: true }` must be the exact same *object reference* (exported from `useUsersDirectoryData.ts`). Creating a new `{ leanProjects: true }` literal in a new file silently creates a different cache key.

**How to avoid:** Any code that calls `accDcGraph.bulkUsers` must import and use `BULK_USERS_LEAN_INPUT` from `@/app/(dashboard)/users/useUsersDirectoryData`. Verify with `npm run repo-map:check` after implementation.

### Pitfall 4: WebGL context on the DataTable region

**What goes wrong:** The R3F `<Canvas>` drifts from the header into the body region (e.g., wrong CSS `position:absolute` parent), violating PERF-05 / VIS-06. Two WebGL contexts on one page are problematic on mobile GPUs.

**Why it happens:** CSS absolute positioning relative to a non-header ancestor.

**How to avoid:** The header container must have `position: relative` and the Canvas must be `position: absolute; inset: 0; pointer-events: none; z-index: 0` scoped to the header's bounding rect. The DataTable is rendered BELOW the header in DOM order with no shared WebGL ancestor.

### Pitfall 5: `PersonDetailModal` Dialog vs DrillSheet — two panels open simultaneously

**What goes wrong:** If the migration is incomplete — `PersonDetailModal` is still mounted and `DrillSheet` is also added — both can open at once (Dialog + Sheet on the same `selectedEmail`).

**Why it happens:** Incremental migration that forgets to remove the Dialog.

**How to avoid:** Remove `PersonDetailModal` from `UsersDirectoryClient`'s JSX in the same commit that adds `DrillSheet`. The migration is an atomic replace.

### Pitfall 6: `@react-three/fiber@8` vs `@react-three/fiber@9` (React 19 incompatibility)

**What goes wrong:** R3F v8 uses React 18's `ReactDOM.render` internally and throws errors under React 19.

**Why it happens:** `npm install @react-three/fiber` without a version pin may resolve to v8 if v9 is RC.

**How to avoid:** Always `npm install @react-three/fiber@9` (or `@react-three/fiber@rc` if v9 hasn't shipped to stable). The STACK.md research confirms this.

### Pitfall 7: `tsc` failures from test fixture prop-shape drift

**What goes wrong:** Adding a prop to `UserProfilePanel` or `DataTable` without updating test fixture mocks causes `npx tsc --noEmit` to fail and blocks `next build`.

**Why it happens:** Test files are in the TypeScript compilation scope (`next build` checks all files).

**How to avoid:** Every prop-shape change must update the corresponding test fixture in the same commit. Run `npx tsc --noEmit` before any build attempt. The integration test at `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` uses `vi.hoisted()` — if `UserProfilePanel`'s type signature changes, the dynamic mock type must also update.

### Pitfall 8: `setMounted` scroll-hack in PersonRowList

**What goes wrong:** If `PersonRowList` is refactored/replaced without preserving the `const [, setMounted] = useState(false); useEffect(() => setMounted(true), [])` hack, scroll position resets.

**Why it happens:** `useWindowVirtualizer` needs `parentRef.current?.offsetTop` which is only valid after mount.

**How to avoid:** If `PersonRowList` is retired (DataTable replaces the list view), this pitfall is moot. But if `PersonRowList` is kept for any fallback view, preserve the hack verbatim.

---

## PERF-04: Payload Deferral Seam

The /users page currently loads cleanly without heavy redundant fetches, thanks to Phase 2 work. Phase 4 must preserve this.

**What is already deferred (do not regress):**
- `users.bulkAccSummary` (~7MB) — `enabled: !dcLoading && dcUsersRaw.length === 0` (never fires in production)
- `accActivity.listInvitations` — `enabled: false` (intentionally disabled)
- `accActivity.getFileActivityForUser` — hover-lazy (250ms debounce)
- `accActivity.getLastFileActivityBatch` — IntersectionObserver visibility-gated

**What Phase 4 must NOT add:**
- A new unconditional query for last-activity-per-user (derive from `accSummaryMap` instead)
- A new unconditional query inside the DataTable column renderers
- A second call to `accDcGraph.bulkUsers` with a different input

**What Phase 4 correctly adds (acceptable):**
- `users.getAccProfile` on Refresh button click (user-initiated, already in UserProfilePanel)
- The R3F Canvas (no tRPC queries — pure Three.js compute)

**Verification:** After implementation, run `npm run repo-map:check`. The check ratchets against known fetch/effect counts; any new unconditional `useQuery` not present before will surface as a violation.

---

## Office Column: Derivation Logic

The `officeLabel` for a user is NOT a direct field on `OrgPerson` or `BulkAccUser`. It must be derived from the user's project memberships.

**Source:** `app/(dashboard)/access-analysis/projectGroups.ts` — `officeCodeFor(project, mtyIds)` + `officeLabel(code)`.

**Algorithm:** For each project in `BulkAccUser.projects`, call `officeCodeFor({id, name}, mtyIds?)`. Take the most common office code across all projects (mode). If no projects → `null`.

**Practical simplification:** Since `leanProjects:true` strips `roles[]` and `modules[]` per project but keeps `id` and `name`, the derivation works with the lean payload.

**Note:** `mtyIds` is a curated allowlist loaded from `app/(dashboard)/access-analysis/mty-allowlist.json`. The planner must decide whether to import this JSON or derive office from project name alone (simpler, slightly less accurate for MTY-branded projects). Recommended: use the name-token-only path (`officeCodeFor` without `mtyIds`) for Phase 4 — accuracy is "good enough" for the directory display column.

---

## Last Active: Data Coverage Honesty

The CONTEXT mandates "— No data" (muted, not "Never") for users with no activity records. This is because `AccActivity` covers ~428 of 1,152 active projects (DC-extractable). A user on a non-DC project will have `BulkAccProject.lastActivity = null` for all their projects even if they're highly active.

**Implementation:** In `buildDirectoryRows`:
- If `max(project.lastActivity)` is `null` (all null) → set `lastActivity: null`, render "— No data" in muted text
- If a date → render relative time via `formatDistanceToNowStrict` with tooltip showing exact ISO

**Dormant logic:** `isDormant = lastActivity !== null && daysSince(lastActivity) > 90`. Users with `lastActivity === null` are NOT marked dormant — they are "unknown", shown with no status dot (the dot only appears when status is knowable).

---

## R3F Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| three | R3F peer dep | YES | 0.184.0 (installed) | — |
| @react-three/fiber | VIS-04/VIS-06 header accent | NO (not installed) | Needs v9 | CSS-only pulsing gradient (acceptable fallback if R3F install blocked) |
| @react-three/drei | Optional R3F helpers | NO | N/A | Implement particle geometry without drei |
| Node.js GPU / WebGL | R3F Canvas | YES (browser-only, ssr:false) | N/A | dynamic(ssr:false) guard |

**Missing dependencies with fallback:**
- `@react-three/fiber@9` — must be installed in Wave 3 setup task. If install fails or is blocked, the particle accent falls back to a CSS `@keyframes` pulsing radial gradient behind the KPIs (achieves ambient depth at zero GPU cost). The planner should include a CSS-fallback variant task.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + Testing Library (jsdom) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npx vitest run --reporter=verbose app/\(dashboard\)/users` |
| Full suite command | `npx vitest run` |
| TSC gate | `npx tsc --noEmit` (mandatory before any rebuild) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| USR-02 | DataTable renders with 5 columns (name pinned, sortable) | unit | `npx vitest run app/\\(dashboard\\)/users/DirectoryTableColumns` | No — Wave 0 gap |
| USR-02 | Row-click fires `setSelectedEmail` | integration | `npx vitest run app/\\(dashboard\\)/users/__tests__/UsersDirectoryClient.integration` | Yes (needs new test case) |
| USR-02 | Row expand shows PeekPanel | integration | same file | Yes (needs new test case) |
| INT-03 | DrillSheet opens on row-click | integration | same file | Yes (needs new test case) |
| PERF-04 | bulkUsers called once with leanProjects:true, no second query | integration | same file (bulkUsersQuerySpy) | Yes (needs assertion) |
| PERF-01 | loading.tsx renders skeleton rows | unit | `npx vitest run app/\\(dashboard\\)/users/loading` | No — Wave 0 gap |
| VIS-03 | useSafeVariants zeroes durations under reduced-motion | unit | `npx vitest run components/ui/__tests__/motion` | Yes — passes (15/15) |
| VIS-04 | AnimatedNumber reaches target value after animation | unit | new file | No — Wave 0 gap |

### Wave 0 Gaps
- [ ] `app/(dashboard)/users/directoryTableRow.test.ts` — unit-tests `buildDirectoryRows()` (lastActivity derivation, office derivation, dormant flag, "+N" badge count)
- [ ] `app/(dashboard)/users/DirectoryTableColumns.test.tsx` — renders column cells in isolation, verifies "— No data" renders for null lastActivity
- [ ] `app/(dashboard)/users/UsersTableHeader.test.tsx` — KPI values derive from people/accSummaryMap; AnimatedNumber reaches target
- [ ] `app/(dashboard)/users/__tests__/UsersDirectoryClient.integration.test.tsx` — new test cases for row-click → DrillSheet, row-expand → PeekPanel, PERF-04 assertion

### Sampling Rate
- **Per task commit:** `npx vitest run app/\\(dashboard\\)/users` (< 30s subset)
- **Per wave merge:** `npx vitest run` (full suite, baseline ≥ 2015 pass)
- **Phase gate:** Full suite green + `npx tsc --noEmit` exits 0 before `/gsd-verify-work`

---

## Security Domain

VIS-04/VIS-06: The R3F Canvas is `ssr:false` + `pointer-events:none` — no attack surface. No new tRPC endpoints are added in this phase. No user-supplied data is rendered unsanitized (all column values come from the existing `accSummaryMap`/`people` pipeline which has no new query exposure).

ASVS categories: not newly applicable in Phase 4 (presentation layer only; auth, session, and access control are handled upstream).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PersonDetailModal` (centered Dialog) | `DrillSheet` (right-edge Sheet, 480px) | Phase 4 (this phase) | Keeps table visible; scroll position preserved; matches INT-01 pattern |
| Card grid + window-virtualized list | Virtualized `DataTable<T>` | Phase 4 (this phase) | Single rendering path; pinned column; sort built in |
| Inline `isLoading` card-grid shimmer | Table-shaped skeleton + `loading.tsx` | Phase 4 (this phase) | Perceived <200ms (Next.js Suspense fires before hydration) |
| Static KPI numbers in header | Count-up animated KPIs + R3F particle accent | Phase 4 (this phase) | Premium feel; VIS-04 |
| `animate-fade-up` CSS class on `UsersDirectoryClient` | `motion.div` with `fadeIn` preset from facade | Phase 4 (this phase) | Reduced-motion enforcement via `useSafeVariants` |

**Deprecated / needs removal:**
- `PersonDetailModal` component — replaced by DrillSheet + UserProfilePanel. File can be retained for its sub-components (`PersonAvatar`, `CopyButton`, `InfoRow`) which should be moved or re-exported.
- `viewMode: "grid"` card rendering path in `UsersDirectoryClient` — the DataTable replaces both grid and list views. The `viewMode` toggle in the header also goes away (DataTable's density toggle serves that purpose). Clean up the `viewMode` state from the store or leave it inert (simpler — leave as dead code, don't remove from store to avoid test churn).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `@react-three/fiber@9` is compatible with React 19 and available on npm | Standard Stack, Pitfall 6 | If v9 is still in RC, pin to `@react-three/fiber@rc`; if incompatible, fall back to raw Three.js imperative canvas or CSS particle fallback |
| A2 | `@react-three/drei` is optional for the particle accent | Standard Stack | If particle shader requires drei helpers, add the install; otherwise omit |
| A3 | `officeCodeFor()` without the `mtyIds` allowlist gives "good enough" accuracy for the directory column | Office Column section | A few MTY-branded projects will show "OTHER" instead of "MTY"; functionally acceptable for directory display |
| A4 | Framer Motion `animate()` imperative API is the right count-up pattern | Pattern 3 | Alternative: `useEffect` + rAF — equally valid; either approach satisfies VIS-04 |
| A5 | `BulkAccProject.lastActivity` (P5-C field) is present on all `accSummaryMap` entries in production | PERF-04 section | If P5-C enrichment is not running or partially stale, many users show "— No data" — acceptable per CONTEXT honesty rule |

---

## Open Questions (RESOLVED)

> All three resolved during planning (2026-06-18): Q1 → Plan 04-02 (optional `person?: OrgPerson` prop on `UserProfilePanel`); Q2 → Plan 04-03 (retire grid/list toggle UI, leave store `viewMode` field inert); Q3 → Plan 04-03 (`useDirectoryRows` emits pre-filtered/sorted `displayRows`; DataTable column-sort stays independent). The recommendations below were adopted as-is.

1. **`PersonDetailModal` header chrome migration**
   - What we know: `PersonDetailModal` has its own avatar banner, contact-info rows, quick-action buttons. `UserProfilePanel` has only the ACC profile body (AccProfileFull).
   - What's unclear: Should the person header chrome (name, job title, email row, phone row) move into `DrillSheet`'s body ABOVE `UserProfilePanel`, or should `UserProfilePanel` receive an optional `person: OrgPerson` prop to render it inline?
   - Recommendation: Add an optional `person?: OrgPerson` prop to `UserProfilePanel` (minimal diff, single component handles all chrome). The test fixture for `UserProfilePanel.test.tsx` must be updated.

2. **`viewMode` grid/list toggle fate**
   - What we know: DataTable replaces both views; the `viewMode` Zustand field + view-toggle button are no longer needed for the directory.
   - What's unclear: Is `viewMode` read anywhere outside `/users`? (Unlikely — it's in `useUsersDirectoryStore` which is directory-specific.)
   - Recommendation: Leave `viewMode` in the store (avoid test churn); remove the view-toggle button from the shell header; let DataTable be the only rendering path.

3. **Activity sort "list mode" integration with DataTable**
   - What we know: `activitySort.active` switches to an infinite-query-ordered list. DataTable has its own sort state.
   - What's unclear: Should DataTable's built-in sort override the activity-sort, or should the activity-sort be a special "pre-sort" that DataTable receives as `data` (already ordered)?
   - Recommendation: Activity sort produces `orderedActivityEmails` → `useDirectoryRows` produces a pre-sorted `displayRows` → DataTable receives `displayRows` as `data`. DataTable's own column sort is independent. When activity sort is active, the Name column sort arrow should be visually reset. This is the cleanest seam — DataTable always receives pre-filtered, pre-sorted data.

---

## Sources

### Primary (HIGH confidence — verified directly from codebase)

- `components/ui/DataTable.tsx` — full prop interface verified line-by-line
- `components/ui/DrillSheet.tsx` — DrillSheet props + Sheet width override confirmed
- `components/ui/motion.ts` — all exports verified (`fadeIn`, `stagger`, `slideFromRight`, `useSafeVariants`)
- `components/ui/PremiumSurface.tsx` — all 4 variants confirmed
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — full shell topology mapped
- `app/(dashboard)/users/useUsersDirectoryStore.ts` — full state shape verified
- `app/(dashboard)/users/useUsersDirectoryData.ts` — all 8 tRPC queries + BULK_USERS_LEAN_INPUT confirmed
- `app/(dashboard)/users/useDirectoryRows.ts` — filter/sort/group logic confirmed
- `app/(dashboard)/users/UserProfilePanel.tsx` — `UserProfilePanelProps` interface verified
- `app/(dashboard)/users/PersonDetailModal.tsx` — current Dialog structure mapped
- `app/(dashboard)/users/loading.tsx` — current skeleton confirmed
- `lib/acc/acc-types.ts` — `BulkAccUser`, `BulkAccProject` full shapes verified; `lastActivity` is P5-C on BulkAccProject
- `lib/server/acc-route-hydration.ts` — prefetch list confirmed (4 endpoints)
- `app/(dashboard)/access-analysis/projectGroups.ts` — `officeCodeFor` / `officeLabel` logic confirmed
- `app/globals.css` — CSS tokens confirmed: `--depth-float`, `--glow-primary`, `--surface-2`, `.panel-elevated`
- `package.json` — confirmed `@tanstack/react-table@8.21.3`, `@tanstack/react-virtual@3.13.24`, `framer-motion@12.40.0`, `zustand@5.0.14`, `three@0.184.0`; confirmed `@react-three/fiber` is NOT installed

### Secondary (MEDIUM confidence — from planning documents)

- `.planning/research/STACK.md` — R3F v9 / React 19 compatibility note; marginal bundle cost; `frameloop="demand"` pattern
- `.planning/phases/01-shared-design-foundation/01-05-PLAN.md` — VIS-06 facade contract; R3F NOT installed in Phase 1 (deferred to Phase 4)
- `.planning/ROADMAP.md` — Phase 4 R3F requirement; `npm run repo-map:check` tooling confirmed

### Tertiary (LOW confidence — training knowledge)

- `@react-three/fiber@9` React 19 compatibility: [ASSUMED] per STACK.md
- Framer Motion `animate()` imperative API for count-up: [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard stack (existing): HIGH — verified directly from `package.json` and source files
- Architecture / component map: HIGH — verified from all key source files
- R3F installation requirement: HIGH — confirmed `@react-three/fiber` absent from `node_modules`
- R3F v9 React 19 compatibility: MEDIUM — per STACK.md research (not independently re-verified)
- Pitfalls: HIGH — derived from existing code comments, Phase 2/3 decisions, and Zustand store constraints

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stable stack; no fast-moving dependencies except R3F RC status)
