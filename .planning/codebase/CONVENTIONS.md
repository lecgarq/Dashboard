# Coding Conventions

**Analysis Date:** 2026-06-23 (original full scan)
**Refreshed:** 2026-07-02 — post v2.1/v2.2 update (boundary fix, shared-query/projection/characterization conventions)

## TypeScript & Next.js App Router Idioms

**Server vs Client boundary:**
- Page files (`page.tsx`) are async RSC by default. Mark `export const dynamic = "force-dynamic"` when server-side data must not be cached at the route level.
- Interactive client components require `"use client"` as the first line.
- Server actions (data mutations / heavy server reads triggered lazily) use `"use server"` as the first line. Examples: `app/(dashboard)/access-analysis/coordinationActions.ts`, `folderTerrainActions.ts`, `folderActivityActions.ts`.
- Pure transform/compute modules (`roleCounts.ts`, `companyCounts.ts`, etc.) carry no directive — they are safe for both client and server imports.
- The `EChart` wrapper (`app/(dashboard)/access-analysis/components/EChart.tsx`) is `"use client"` because `echarts-for-react` relies on the DOM.

**RSC data loading pattern (`access-analysis`, `template-mty`):**
```tsx
// page.tsx — async RSC, no hooks, no state
export default async function AccessAnalysisRoute() {
  return (
    <div className="h-full overflow-y-auto text-foreground">
      <Suspense fallback={<...Skeleton />}>
        <MainCharts />   {/* async RSC — fetches data */}
      </Suspense>
    </div>
  );
}

// mainCharts.tsx — async RSC, parallel fetches
export async function MainCharts() {
  const [view, moduleRows, ...] = await Promise.all([
    loadInstanceView(),
    loadModuleActivity(),
    ...
  ]);
  return <AccessAnalysisCharts {...props} />;  // client component, receives all data
}
```

**`/users` prefetch pattern:**
```tsx
// page.tsx — server-side TanStack Query prefetch
const helpers = await createAccRouteHelpers();
await prefetchUsersRouteAccData(helpers);
return (
  <HydrationBoundary state={helpers.dehydrate()}>
    <Suspense ...><UsersDirectoryClient /></Suspense>
  </HydrationBoundary>
);
```

**Import path aliases:**
- Always use `@/` alias, not relative `../../../` for cross-zone imports.
- Examples: `@/lib/server/accessInstanceView`, `@/components/ui/PremiumSurface`, `@/server/db`.
- In-route relative imports (`./roleCounts`, `../types`) are acceptable within the same route subtree.

## Naming Patterns

**Files:**
- Route pages: `page.tsx`, `loading.tsx` (Next.js conventions).
- RSC data bridges co-located with the route: `mainCharts.tsx`, `templateTerrainActions.ts`.
- Pure domain transforms: camelCase, descriptive noun — `roleCounts.ts`, `companyCounts.ts`, `moduleCounts.ts`, `folderTerrain.ts`.
- Type contracts: `types.ts` per route or component directory.
- Tests: `__tests__/` folder adjacent to the code, or co-located `*.test.ts(x)` (both patterns exist).

**Functions:**
- Named exports only — no default exports for logic modules.
- Loaders follow `load*` convention: `loadInstanceView()`, `loadModuleActivity()`, `loadTemplateOverview()`.
- Summarizers follow `summarize*`: `summarizeRoles()`, `summarizeFolders()`.
- Builders follow `build*`: `buildUserRows()`.

**Variables:**
- camelCase throughout.
- Boolean flags: `dark`, `isInternal`, `isAdmin`, `isPrimaryAdmin`.
- Env vars read by name with `process.env.NAME`.

**Types & Interfaces:**
- PascalCase. Interfaces preferred over `type` aliases for object shapes.
- Prisma-generated types imported from `@prisma/client`. Do not redefine model shapes from scratch.

## Component/Boundary Rules

**Components must NOT reach into Prisma or `server/db` directly.** Database access belongs in:
1. `lib/server/` view functions (e.g., `lib/server/accessInstanceView.ts`)
2. `server/routers/` tRPC procedures
3. `"use server"` actions co-located in the route (lazy/on-demand only)

(Historical note: `coordinationActions.ts` used to be a documented exception importing `{ db }` directly; v2.1 Ph10 (BND-01) moved the query behind `server/routers/acc-coordination.ts` — the action is now a thin delegate and the `direct-prisma-in-ui` ast-grep rule returns 0 matches. There are no sanctioned exceptions anymore.)

**`components/` is Prisma-free.** `PremiumSurface`, `DrillSheet`, `EChart`, and all shadcn/Radix-derived primitives must import only from `react`, `@/lib/core/utils`, or other pure-UI packages.

## Zinc Dark Theme & CSS Variable Tokens

**Background color:** `#09090B` (zinc-950). Never `slate`, never hardcoded `#18181B` or other overrides without a token.

**Semantic token usage (Tailwind classes):**
- `bg-background` / `bg-card` / `bg-muted` — surface layers
- `text-foreground` / `text-muted-foreground` — primary / secondary text
- `border-border` — all dividers
- `text-primary` / `bg-primary` — accent color
- CSS var direct usage: `var(--card)`, `var(--primary)`, `var(--border)`, `var(--ring)` in inline styles and `<style>` blocks.

**Never hardcode zinc hex values** in Tailwind classes or inline styles where a semantic token exists.

**Page root scroll ownership:**
Every dashboard page root owns its own vertical scroll:
```tsx
<div className="h-full overflow-y-auto text-foreground">
  {/* content */}
</div>
```
The `<main>` wrapper in the dashboard layout is `overflow-hidden`. Pages must NOT use `min-h-screen` or add their own `overflow-hidden` at the root.

**surface-card and surface-panel CSS classes** are utility classes from `globals.css` used on auth pages and some shells. On dashboard data pages, prefer `PremiumSurface` or semantic Tailwind tokens.

## ECharts Theme Resolution

All ECharts components read `resolvedTheme` from `next-themes` before building the chart `option`:

```tsx
// Every chart component that needs theme-aware colors:
import { useTheme } from "next-themes";

export function ActivityTimelineChart({ summary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  const cAxis = dark ? "#a1a1aa" : "#52525b";  // zinc-400 / zinc-600
  // ...build option using cAxis, cTitle, etc.
}
```

**Do not hardcode chart colors for a single theme.** Always derive from `resolvedTheme`. The `EChart` wrapper itself (`components/ui/EChart.tsx`) is theme-agnostic — callers build the option.

**EChart wrapper signature:**
```tsx
<EChart
  option={option}           // EChartsOption
  height={280}              // pixels
  onEvents={handlers}       // optional
  notMerge={true}           // default; pass false to animate diffs
/>
```

## UI Primitives

**PremiumSurface** (`components/ui/PremiumSurface.tsx`) — RSC-safe card shell with 4 depth variants:
- `variant="base"` — `.panel-elevated` (default, catch-light + layered shadow)
- `variant="float"` — floating card with `--depth-float` shadow
- `variant="glass"` — frosted surface via `--surface-2` and `backdrop-blur-md`
- `variant="inset"` — recessed panel with inset shadow
- Optional `glow` prop adds `--glow-primary` shadow for selected/accent state.
- Do NOT stack card-inside-card (`PremiumSurface` inside `PremiumSurface`) without a clear visual need.

**DrillSheet** (`components/ui/DrillSheet.tsx`) — shared right-slide ~480px drill panel for all four pages. Is an empty shell that takes arbitrary `children`. Wire `UserProfilePanel` or list content as children.

**FilterBanner** (`app/(dashboard)/access-analysis/components/FilterBanner.tsx`) — cross-filter clarity bar showing active named filters + N-of-M project scope. Shows nothing when `filters={}`.

## Motion Budget

- `<=200ms` for drill interactions (transitions, slide-in panels).
- Use `tw-animate-css` Tailwind classes (`animate-fadeIn`, `animate-fade-up`) for entry animations.
- Respect `prefers-reduced-motion` — do not run motion unconditionally.
- Keep motion short and purposeful; no decorative scroll or parallax on data surfaces.

## Card Usage Rules

- Use `PremiumSurface` or `surface-card` to frame repeated items, panels, dialogs, or genuinely grouped controls.
- Do not stack card-inside-card (`PremiumSurface` inside `PremiumSurface` with identical backgrounds).
- Data surfaces stay flat. Only `/users` header and `/forma-proposal` background use R3F/3D accents.

## Error, Empty, and Under-Covered Data Handling

**Empty state pattern (inline, with icon):**
```tsx
if (points.length === 0) {
  return (
    <div className="flex h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
      <svg .../>
      No activity found.
      <span className="text-xs opacity-70">Select at least one project above.</span>
    </div>
  );
}
```

**Under-covered data rule:** Label under-covered analytics sources honestly. Do not hide data gaps behind silent zeros. Examples: DC-only data without activity history, AccDcRole permanently empty (roles sourced from `AccRole`).

**Loading/skeleton pattern:** Co-locate skeleton components in the same folder as the route and export named exports: `KpiStripSkeleton`, `DonutGridSkeleton`, `TimelineSkeleton` (`app/(dashboard)/access-analysis/components/DonutSkeletons.tsx`).

## Prisma & Database Access Patterns

**Single Prisma client** exported from `server/db.ts` as `{ db }`. Pool tuned via env vars:
- `PG_POOL_MAX` (default: 5 prod / 10 dev)
- `PG_IDLE_TIMEOUT_MS`
- `PG_CONNECTION_TIMEOUT_MS`

**Prefer Prisma ORM calls** (`findMany`, `groupBy`, `count`) for straightforward queries.

**Use `$queryRaw` for GROUP BY aggregates** where the result set must be small (e.g., aggregating 623k+ `AccActivity` rows to ~21k). Returning raw rows from large tables into the Node process causes OOM. Example in `server/routers/acc-activity.ts`:
```ts
// Heavy GROUP BY → use $queryRaw, not findMany
const rows = await ctx.db.$queryRaw`
  SELECT email, COUNT(*)::int AS rows
  FROM "AccActivity"
  GROUP BY email
`;
```

**Prisma `.groupBy()`** is used for moderate aggregations (`acc-folders.ts`):
```ts
await db.accProjectRole.groupBy({
  by: ["projectId"],
  _count: { roleId: true },
  where: { projectId: { in: projectIds } },
});
```

**Shared query owner (v2.2 Ph15):** When two or more surfaces need the same base join, extract a single owner module in `lib/server/` (pattern: `lib/server/folderPermQuery.ts` — `loadFolderPermRows(projectId, {l2Only?})` with static, byte-identical tagged-template `$queryRaw` branches so test mocks stay stable). Do **not** add single-use queries to a shared owner, and do not duplicate its join inline in a view file.

**Materialized projection pattern (v2.2 Ph18):** For analytics over very large tables (e.g., ~6M-row `AccFolderPermission`), materialize a small projection model (`AccFolderPermissionSummary`: per project×role `folderCount`/`totalBytes`/`permTypes[]`), backfill server-side with `INSERT .. SELECT .. GROUP BY` (idempotent), reconcile counts against the source, and refresh it from the ingest cron success branch. Consumers read the projection; the raw-scan path is guarded behind an explicit env flag (`ACC_ALLOW_RAW_PERMISSION_SCAN=1`).

**`$transaction` timeout for long server-side writes (Ph18 deviation):** Prisma's default interactive-transaction timeout is 5s — widen it (v2.2 used 300s) when a transaction wraps a long server-side `INSERT .. SELECT` backfill.

**Characterization-before-split (v2.1 Ph14 / v2.2):** Never split a large module or move a query owner without first pinning current behavior with byte-identical characterization tests (see `TESTING.md` — TEST-01/02/03). The pins stay in the suite as standing regression guards after the split ships.

## Comments

**When to comment:**
- Architectural decisions and tradeoffs (e.g., why `MainCharts` is a single Suspense boundary, why `coordinationActions.ts` imports `db` directly).
- Gotchas and traps (e.g., lean-payload trap on `/users`, `next build` typechecking test files).
- Non-obvious data authority (e.g., "AccDcRole is permanently empty — source from AccRole").

**Format:** Block comment at top of module for module-level context. Inline `//` for local decisions.

**JSDoc:** Not enforced across the codebase. Use for exported utility functions in `lib/` that need parameter/return docs.

## Import Organization

**Order (observed pattern):**
1. Framework imports: `react`, `next/*`
2. Third-party packages: `echarts`, `@tanstack/*`, etc.
3. Internal `@/` aliases: `@/lib/*`, `@/components/*`, `@/server/*`
4. Route-relative imports: `./roleCounts`, `../types`

Blank line between groups. No barrel `index.ts` re-exports observed in route-level code.

---

**Dashboard self-check:**
- Context: SKILL.md, source files in `app/`, `components/ui/`, `server/db.ts`, `vitest.setup.ts`, direct file reads.
- Evidence: all patterns verified from actual source files listed above.
- Constraints: zinc theme, semantic tokens, no Prisma in components/, h-full overflow-y-auto page root.
- VERIFY: none — all claims grounded in verified source.
