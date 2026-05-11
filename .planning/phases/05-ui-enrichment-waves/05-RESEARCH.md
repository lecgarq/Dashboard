# Phase 5: UI Enrichment Waves - Research

**Researched:** 2026-05-11 (RE-RESEARCH pass — overwrites prior version)
**Domain:** React/Next.js dashboard enrichment — tRPC/Prisma data bridge, TanStack user list, cosmos.gl 3D graph, dashboard widgets (framer-motion orbit/bubble, echarts heatmap, d3 calendar)
**Confidence:** HIGH for stack, patterns, and verified codebase state. MEDIUM for cosmos.gl 3-tier shape-per-tier sequencing (API verified but no precedent in repo for multi-tier divergence). LOW for Phase 4 folder-detail tRPC procedure (Phase 4 not yet shipped).

## Summary

Phase 5 is **not greenfield**. Every requirement enriches an existing surface: the user list (`UsersDirectoryClient.tsx`, 1,527 lines), the cosmos.gl graph (`AccUsersGraph.tsx`, 3,068 lines), or the 9 dashboard widgets under `app/(dashboard)/users/dashboard/widgets/`. The hard work is not UI — it is **bridging data from the new Prisma tables (`AccProjectMember`, `AccProject`, `AccRole`, `AccProjectRole`) into the UI layer**, because `bulkAccSummary` currently reads exclusively from `accMemberCache` and does NOT yet touch any v2.0 table.

Three sub-phases are locked: **5.1 GRAPH** (highest risk, runs first), **5.2 LIST**, **5.3 DASH**. GRAPH-04 is the only requirement gated on Phase 4. The interactivity contract (DASH-18: hover-detail → click-through → cross-widget spotlight) must be baked into every task from line one — the v1.0 Phase 4.1 lesson.

**Critical new finding (vs prior research):** The Refresh button in `DashboardClient.tsx:88-95` is **already removed** (confirmed by codebase scan — no `handleRefresh`, no `RefreshCw` import exists). The prior research tracked it as a live issue; it is resolved. Also: `HOVER_OPACITY_DIM` in `dashboardTokens.ts` is **0.4 (40%)**, not 0.2 (20%) as stated in CONTEXT.md. CONTEXT says "dim to ~20% opacity" — plan must decide whether to change the token or interpret CONTEXT loosely.

**Primary recommendation:** For each sub-phase, sequence tasks as **(a) new tRPC procedure from v2.0 tables → (b) UI binding + render → (c) hover detail → (d) click-through → (e) cross-widget spotlight**. The data bridge step (a) is the most novel work in Phase 5; the rest extends proven patterns.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wave sequencing & split**
- Split into 5.1 / 5.2 / 5.3 — three sub-phases, each with its own PLAN.md and UAT gate.
- Order: GRAPH (5.1) → LIST (5.2) → DASH (5.3) — highest-risk wave goes first to de-risk early.
- Run in parallel with Phase 4 — only GRAPH-04 (folder nodes in 3D) is blocked by Phase 4 perf pre-flight. LIST and DASH waves do not depend on Phase 4 and start immediately. GRAPH wave starts but **carves out GRAPH-04** until Phase 4 returns.
- Interactivity contract is a hard gate on every widget — modified AND new widgets must pass hover-detail / click-through / cross-widget spotlight before that sub-phase's UAT closes. No exceptions, baked in from task 1 of each sub-phase (per v1.0 feedback memory).
- Separate UAT session per sub-phase — each of 5.1/5.2/5.3 closes with its own `/gsd:verify-work`. Faster feedback loop; issues caught before next wave starts.

**LIST wave (5.2)**
- **Status column**: dedicated column with active/pending/disabled pill + multi-select filter facet in the toolbar (matches existing filter pattern).
- **projectAdmin indicator**: small "Admin" pill inline next to the user's name in the row.
- **last-file-activity column (lazy)**: on-scroll batched fetch with skeleton shimmer in the cell while loading. No user action required.
  - Empty state: em-dash `—` with tooltip "No activity in 90d". Signals intentional empty vs loading.
- **Per-module products tier**: new dedicated collapsible "Module Access" section in the side panel, listing each ACC module + tier (e.g. "Docs: Editor", "Build: Member").

**GRAPH wave (5.1)**
- **Hover detail**: rich tooltip card on hover — name, status, company, accessLevels, last sign-in, last file activity. No click required (information-dense per feedback memory).
- **3-tier admin overlay**:
  - Visual: **shape change per tier** (e.g. circle / diamond / star glyphs). Hub admin tier: **star glyph + gold halo + ~1.5× base node size** so hub admins (rare, important) are unmistakable at any zoom.
  - Activation: **toggle button in graph toolbar, OFF by default**. Single "Show admin tiers" toggle — keeps default graph clean, on-demand for audits.
- **Per-project role filter**:
  - Behavior: **AND with existing filters** (intersect with status/module).
  - UI: new collapsible "Role" group in the existing graph filter sidebar, alongside status/module.
- **Folder nodes (GRAPH-04, conditional on Phase 4 GO)**:
  - Visual: separate **cluster region** of the 3D space — "users live here, folders live there". Connected to user nodes by edges that cross the gap.
  - Selection: clicking a folder node spotlights all users with access AND opens side panel with folder path, role breakdown, members-assigned counts, orphan-role flags.
  - Edges (user → folder): **thin translucent, color-coded by permission tier** (View / Download / Edit / Full).
- **Orphan roles**: subtle **amber warning halo** on folder nodes when orphan roles exist, AND a Recommendations entry surfacing the specific orphan. Two surfaces, one signal.
- **Selection spotlight (cross-widget)**: dim non-selected nodes to ~20% opacity, add bright halo on selected set. Reuses v1 spotlight pattern.
- **Labels**: keep current UAT-approved polish curve unchanged — `pow(zoom, 0.2)` clamped `[0.85, 1.4]`, pill backgrounds, 11px floor / 18px ceiling.

**DASH wave (5.3)**
- **KpiStrip tiles** (pending invites / project admins / folders crawled): **append to existing strip** at the end. Natural growth, no layout disruption. May wrap on narrow screens.
- **Recommendations new findings** (stale invite, orphan role): **severity-based interleave** with existing findings. Orphan role = high severity, stale invite = medium. Single ranked list, users see the most important regardless of finding type.
- **AdminConstellation 3-tier reskin**: **mirrors the GRAPH wave admin overlay styling** (same star/glyph/halo conventions). One visual language across surfaces — supports cross-widget consistency.
- **RolesModulesHeatmap hub vs per-project**: single header toggle "Hub view / Project view". Default = Hub view (preserves current behavior).
- **Folder fallback contract (if Phase 4 NO-GO on GRAPH-04)**:
  - Folder × role matrix widget (already required by Phase 4) becomes the canonical folder surface.
  - Clicking a folder cell in the matrix opens a **dedicated folder detail panel** with path, roles, member counts, orphan flags.
  - No graph integration, but full interactivity (DASH-18 contract) preserved.
  - GRAPH-04 logged as contingency in roadmap backlog if NO-GO.

**Cross-cutting**
- **Performance budget**: **minimum 60 FPS** on UAT hardware with all overlays + filters active. Hard floor — below that, planner must defer or simplify a feature.
- **Accessibility**: color encoding is never the sole signal. Status pills carry text, permission edges use thin/thick variants in addition to color, admin tiers use shape change in addition to color. Pattern: **color enhances, never solely encodes**.

**Plan-Phase Locked Decisions (2026-05-11)**
- **Status reduction rule (LIST-01)**: `any-active → active; else any-pending → pending; else deleted`. Single pill per user row reflects most permissive membership.
- **AdminConstellation 3-tier shapes (GRAPH-03 + DASH-16)**: **Hub admin = star + gold halo + 1.5× size**, **Project admin = diamond**, **Executive = circle-with-ring**. Same visual language reused across GRAPH wave overlay and DashConstellation widget.
- **DashboardClient Refresh button cleanup**: **Already removed** (confirmed 2026-05-11 codebase scan — `DashboardClient.tsx` has no `handleRefresh`, no `RefreshCw` import). Prior RESEARCH.md tracking this as an open issue is now resolved.

### Claude's Discretion
- Exact gold/silver/bronze (or chosen) color ramp for admin tiers — pick from existing brand palette.
- Specific severity scoring algorithm for stale-invite vs orphan-role Recommendations findings.
- Skeleton shimmer animation timing for lazy `last-file-activity` cells.
- Default sort and column order in the enriched user list.
- Side-panel collapsible default state for the new "Module Access" section.
- KpiStrip wrap behavior on narrow viewports.
- Hover tooltip card layout/typography details.

### Deferred Ideas (OUT OF SCOPE)
- Holistic a11y polish phase (high-contrast mode toggle, keyboard nav pass).
- Mobile-specific responsive treatment.
- GRAPH-04 if Phase 4 NO-GO — deferred to a future phase pending different rendering strategy. Dashboard-only fallback (matrix + drill panel) ships either way.
- Per-project filter via right-click context menu on project nodes — sidebar group pattern chosen instead.
</user_constraints>

<phase_requirements>
## Phase Requirements

### Wave 5.1 — GRAPH (4 reqs)

| ID | Description | Research Support |
|----|-------------|-----------------|
| GRAPH-01 | Per-project industry-role assignments become a graph filter dimension. | `accGraphFilters.ts` has `roles: string[]` but it maps to hub master roles only. Must add `perProjectRoles: string[]` dimension to `GraphFilters`. New tRPC procedure `accGraph.perProjectRoleFacets` queries `AccProjectRole` (exists in Prisma). Add "Role" collapsible group in graph filter sidebar; `nodeMatchesFilters` extends with AND-intersect. |
| GRAPH-02 | User node hover shows enriched detail (status, companyName, accessLevels, last sign-in, last file activity). | No `@radix-ui/react-tooltip` installed yet (confirmed). Install via `npx shadcn@latest add tooltip`. Hover data: `status`/`companyName`/`projectAdmin`/`executive` come from `AccProjectMember`; last file activity from `accActivity.getFileActivityForUser` (lazy). Tooltip anchored to invisible 1×1 div at cosmos hover coords (existing hover callback at AccUsersGraph.tsx:975). |
| GRAPH-03 | 3-tier admin overlay (hub / project / executive) via shape change + gold halo on hub. | `setPointShapes` ALREADY USED in `graphRenderers.ts` (lines 734, 1352–1367). Shape 0 = Circle, Shape 8 = None. Diamond and Star are cosmos.gl `PointShape` enum values — must verify enum values from `@cosmos.gl/graph` source or Context7 before coding. Overlay is a new boolean state (`showAdminTiers`) stored in graph toolbar state, triggers `setPointShapes` + `setPointSizes` + `setPointColors` rebuild for the overlay pass. |
| GRAPH-04 | Folder nodes — conditional on Phase 4 GO. Separate cluster region, edges color-coded by permission tier. | `AccFolder` and `AccFolderPermission` tables exist in Prisma (verified). No `accFolder` tRPC router exists yet. Cluster separation via offset initial positions. Folder nodes added to existing node array with a `kind: "folder"` type distinction (mirrors existing user/project/role/module node kinds in `accGraph3d.ts`). |

### Wave 5.2 — LIST (4 reqs)

| ID | Description | Research Support |
|----|-------------|-----------------|
| LIST-01 | `status` column (active/pending/deleted) + multi-select filter facet. | `AccProjectMember.status` is `String` (active/pending/deleted, verified schema:460). `bulkAccSummary` currently reads from `accMemberCache` only — does NOT query `AccProjectMember`. Must add a new lookup or extend the summary. Status reduction rule locked: any-active wins. Extend `BulkAccUser` with `aggregatedStatus`. |
| LIST-02 | `projectAdmin` indicator inline + filter facet. | `AccProjectMember.projectAdmin` is `Boolean` (verified schema:465). Same data-bridge gap as LIST-01 — must come from `AccProjectMember`, not the legacy cache. The `BulkAccUser.isAccountAdmin` field exists for hub-level admin; project admin needs a new field. |
| LIST-03 | Last-file-activity column lazy-loaded post-paint. | `accActivity.getFileActivityForUser` exists (verified acc-activity.ts:40). Phase 03-03 uses 250ms hover-prefetch; LIST-03 extends this to auto-fire via `IntersectionObserver` on row scroll visibility. Pattern: hand-roll `IntersectionObserver` hook (~25 lines, no new dep) — existing graph code already uses IntersectionObserver patterns. ACTV-03 explicitly forbids eager-load into `BulkAccUser`. |
| LIST-04 | Side-panel shows per-module `products` access tier. | `AccProjectMember.products` is `Json` (schema:467). `moduleLabel()` exists in `lib/acc/modules.ts` (verified). `AccUserSidePanel.tsx` is the mount point. Must add Zod parser at tRPC boundary; add collapsible "Module Access" section. |

### Wave 5.3 — DASH (5 reqs)

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-14 | KpiStrip: pending-invite tile + project-admin tile + folders-crawled tile. | `KpiStripWidget.tsx` uses `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6` (verified line 82). Append 3 tiles: bump to `lg:grid-cols-9` or allow 2-row wrap via `flex-wrap`. Count queries come from new tRPC procedure querying `AccProjectMember` (pending count, projectAdmin count) and `AccFolder` (crawled count). |
| DASH-15 | Recommendations gains "stale invite" + "orphan role" findings. | `DashboardFindings` interface in `dashboardAnalytics.ts:72-78` has 4 fields. Extend with `staleInvites` + `orphanRoles`. `detectStaleInvites` reads from `AccProjectMember` (status=pending + addedOn > 30d). `detectOrphanRoles` reads from `AccFolder`/`AccFolderPermission` + `AccProjectRole.memberId`. Severity locked: orphan=HIGH, stale=MEDIUM. Interleave at sort time in `RecommendationsWidget`. |
| DASH-16 | AdminConstellation 3-tier (hub admin / project admin / executive). | `AdminAccessWidget.tsx` filters on `u.isAccountAdmin === true` only (line 78). Extend to pull project admins + executives from `AccProjectMember`. Uses framer-motion orbit math already in place. `useHoverSpotlight` already imported. Shapes: star (hub admin) / diamond (project admin) / circle-with-ring (executive). |
| DASH-17 | RolesModulesHeatmap hub vs per-project toggle. | `RolesModulesHeatmapWidget.tsx` calls `aggregate(users)` (line 101) which maps `user.allRoles` (hub-level). Add `aggregateProjectRoles` function querying `AccProjectRole` from tRPC. Header toggle state selects the aggregation function. Default = Hub view. ECharts dataset swap triggers re-render. |
| DASH-18 | Interactivity contract — UAT gate enforced on every modified widget. | `useHoverSpotlight` hook exists in `_shared/HoverSpotlight.tsx` (verified). `HOVER_OPACITY_DIM = 0.4` in `dashboardTokens.ts` (verified — CONTEXT says "~20%" but actual token is 40%). Selection context union at `selectionContext.tsx:32-40` has 7 kinds. Add 3 new kinds: `folder`, `staleInvite`, `adminTier`. `DashboardSidePanel.tsx` adds render branches for each. |

**Phase 4 contingency:** If Phase 4 returns NO-GO on GRAPH-04, the dashboard-only folder fallback (DASH-14 folders-crawled tile + folder-detail panel reachable from Phase 4 matrix widget) ships regardless. Wave 5.3 plans must sequence the matrix-click → `<FolderDetailPanel>` hookup before GRAPH-04 work begins.
</phase_requirements>

## Standard Stack

### Core (already in repo — DO NOT introduce alternatives)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^16.2.6 | RSC + client islands | Project foundation |
| React | 19.2.6 | Widget components | Project foundation |
| tRPC | ^11.17.0 | Data plumbing (Prisma → React Query) | All ACC routers use it |
| @tanstack/react-query | ^5.100.10 (via tRPC) | Query cache, staleTime, lazy fetch | Drives `bulkAccSummary` + `accActivity` |
| Prisma | ^7.8.0 | DB access | `AccProjectMember`, `AccProjectRole`, `AccFolder`, etc. |
| Tailwind | ^4.3.0 | Styling | Project convention |
| shadcn/ui (Radix-backed) | ^4.7.0 | Pills, sheets, badges, skeletons | `components/ui/*` — 22 components already installed |
| framer-motion | ^12.38.0 | Widget entrance + spring + orbit | Used by AdminAccess, Recommendations, Outliers |
| ECharts (echarts-for-react) | ^6.0.0 / ^3.0.6 | Heatmap | `RolesModulesHeatmapWidget` |
| d3-hierarchy / d3-scale / d3-time | current | Bubble pack, calendar | Recommendations, RecentlyAdded |
| @cosmos.gl/graph | **3.0.0-beta.9** (pinned) | GPU spatial graph | DO NOT upgrade in Phase 5; patches in `patches/` |
| sonner | ^2.0.7 | Toasts | Imported by AccUsersGraph |
| Vitest | ^4.1.6 | Unit tests | `vitest.config.ts` present; 5+ test files active |
| date-fns | current | Date arithmetic | Used in `dashboardAnalytics.ts` for 90d inactive calc |

### Supporting — NEW dependencies needed

| Library | Version | Purpose | Install |
|---------|---------|---------|---------|
| `@radix-ui/react-tooltip` | shadcn-managed | Hover tooltip card for GRAPH-02 hover detail + LIST-03 em-dash tooltip | `npx shadcn@latest add tooltip` — NOT in repo yet (confirmed) |
| `@radix-ui/react-popover` | shadcn-managed | Filter group expand / inline popovers | `npx shadcn@latest add popover` — NOT in repo yet (confirmed). Check if `dropdown-menu.tsx` covers the use-case first — it uses Radix DropdownMenu which may suffice for the filter Role group. |

**Note:** `react-intersection-observer` npm package NOT needed — hand-roll `IntersectionObserver` (~25 lines) following the existing pattern in `graphRenderers.ts`. Keeps dep count stable.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shadcn Tooltip (Radix-backed) | Custom portal+positioning | Shadcn is ~30 lines of glue; handles edge collision, escape key, ARIA. Don't hand-roll. |
| `accMemberCache` data bridge | Read directly from `AccProjectMember` in existing `bulkAccSummary` | Extending `bulkAccSummary` adds Prisma joins; alternatively create a new `accMembers.getEnrichedSummary` procedure alongside the legacy one. Recommended: new procedure, keep legacy cache-based one for graph snapshot path to avoid breaking it. |
| URL param for `showAdminTiers` toggle | localStorage | URL param enables shareable audit links — consistent with existing `writeGraphDisplayMode`. Recommend URL param. |
| Top-level `accGraph` router | Extend `users` router | `users.ts` is already 1,500+ lines; create `server/routers/acc-graph.ts` and register as `accGraph` in `root.ts`. Clean separation. |
| Top-level `accFolder` router | Extend `acc-activity` router | Naming clarity: `server/routers/acc-folder.ts` → registered as `accFolder`. Check Phase 4 output first — it may ship this. |

**Installation:**
```bash
npx shadcn@latest add tooltip popover
```

## Architecture Patterns

### Recommended Sub-phase Structure

```
.planning/phases/05-ui-enrichment-waves/
├── 05-CONTEXT.md                  (exists)
├── 05-RESEARCH.md                 (this file)
├── 05.1-graph-wave/
│   ├── 05.1-01-PLAN.md            (GRAPH-01 per-project role filter + data bridge)
│   ├── 05.1-02-PLAN.md            (GRAPH-02 hover detail + tooltip install)
│   ├── 05.1-03-PLAN.md            (GRAPH-03 3-tier admin overlay)
│   └── 05.1-04-PLAN.md            (GRAPH-04 folder nodes — CONDITIONAL on Phase 4 GO)
├── 05.2-list-wave/
│   ├── 05.2-01-PLAN.md            (LIST-01 status column + facet + data bridge)
│   ├── 05.2-02-PLAN.md            (LIST-02 projectAdmin indicator + facet)
│   ├── 05.2-03-PLAN.md            (LIST-03 lazy last-file-activity column)
│   └── 05.2-04-PLAN.md            (LIST-04 side-panel Module Access section)
└── 05.3-dash-wave/
    ├── 05.3-01-PLAN.md            (DASH-14 KpiStrip tiles + count queries)
    ├── 05.3-02-PLAN.md            (DASH-15 Recommendations stale/orphan findings)
    ├── 05.3-03-PLAN.md            (DASH-16 AdminConstellation 3-tier)
    ├── 05.3-04-PLAN.md            (DASH-17 Heatmap hub/project toggle)
    └── 05.3-05-PLAN.md            (DASH-18 interactivity contract gate — test matrix)
```

### Pattern 0: Data Bridge — v2.0 Tables to UI (NEW — critical)

**What:** Every Phase 5 requirement that surfaces v2.0 data (status, projectAdmin, executive, products, companyName) needs a tRPC procedure that queries `AccProjectMember` + joins, since `bulkAccSummary` reads only from `accMemberCache`. This is the common first task in each sub-phase plan.

**How:** Create `server/routers/acc-members.ts` (or `acc-graph.ts` for graph-specific facets). Register in `root.ts`. Design for graceful no-data state: Phase 4 may not have completed its first Quick Sync when 5.1 begins.

**Per-wave bridge shape:**
```typescript
// server/routers/acc-members.ts (NEW)
export const accMembersRouter = router({
  // LIST wave: per-user aggregated status, projectAdmin flag, products
  enrichedUsers: protectedProcedure.query(async ({ ctx }) => {
    const members = await ctx.db.accProjectMember.findMany({
      where: { project: { status: "active" } },
      select: {
        email: true, status: true, projectAdmin: true,
        executive: true, companyName: true, products: true,
        addedOn: true, lastSignIn: true,
      },
    });
    // Aggregate per email — status reduction: any-active wins
    const byEmail = new Map<string, AggregatedMember>();
    for (const m of members) {
      const prior = byEmail.get(m.email);
      byEmail.set(m.email, mergeAccProjectMember(prior, m));
    }
    return Array.from(byEmail.values());
  }),

  // GRAPH wave: distinct per-project role names for filter facet
  perProjectRoleFacets: protectedProcedure.query(async ({ ctx }) => {
    const roles = await ctx.db.accRole.findMany({
      where: { projectRoles: { some: { memberId: { not: null } } } },
      select: { name: true },
      distinct: ["name"],
      orderBy: { name: "asc" },
    });
    return roles.map(r => r.name);
  }),

  // DASH wave: KPI counts
  dashboardCounts: protectedProcedure.query(async ({ ctx }) => {
    const [pending, projectAdmins, folders] = await Promise.all([
      ctx.db.accProjectMember.count({ where: { status: "pending" } }),
      ctx.db.accProjectMember.count({ where: { projectAdmin: true }, distinct: ["email"] }),
      ctx.db.accFolder.count(),
    ]);
    return { pendingInvites: pending, projectAdmins, foldersCrawled: folders };
  }),
});
```

**Graceful empty state:** If `accProjectMember` table has zero rows (Phase 4 not yet run), return empty arrays/zeros — UI renders "—" rather than erroring. Add `staleTime: 5 * 60 * 1000` so counts don't re-fetch every render.

### Pattern 1: Interactivity Contract — bake in from task 1

**What:** Every widget task ships hover → click → spotlight in the SAME plan, not retrofitted.
**When to use:** Every modified or new widget in Phase 5.
**Why:** v1.0 Phase 4.1 lesson — widgets retrofitted with interactivity after the fact lost UAT.

**Template task structure for any widget plan:**
```
Task 1: Data bridge (new tRPC procedure → React Query → prop/context)
Task 2: Render new field (column / pill / overlay)
Task 3: Hover detail (Tooltip or useHoverSpotlight + dim siblings at HOVER_OPACITY_DIM=0.4)
Task 4: Click handler → setSelected({ kind, ... }) via selectionContext
Task 5: DashboardSidePanel branch for the new selection kind
Task 6: Cross-widget verification — click in widget A dims non-matching in widget B
```

**Opacity note:** `HOVER_OPACITY_DIM` is **0.4** in `dashboardTokens.ts` (not 0.2 as CONTEXT states). CONTEXT says "dim to ~20%". The planner must decide: update the token to 0.2, or treat CONTEXT's "~20%" as approximate and keep 0.4. Recommend flagging to user at plan-phase — changing the token changes ALL existing widgets that use it.

### Pattern 2: Cosmos.gl Per-Point Attribute API (VERIFIED)

**What:** `setPointColors(Float32Array)`, `setPointSizes(Float32Array)`, `setPointShapes(Float32Array)` on the cosmos graph instance. ALL THREE are already called in `graphRenderers.ts`.

**Shape encoding (verified from graphRenderers.ts):**
- Shape `0` = Circle (default for all visible nodes)
- Shape `8` = None (used to hide filtered-out nodes)
- Diamond / Star values are cosmos.gl PointShape enum — must verify numeric values from the patched `@cosmos.gl/graph` source or Context7 before GRAPH-03 implementation. The patches directory has `@cosmos.gl+graph+3.0.0-beta.9.patch` — read it to extract the enum.

**Critical — size buffer interaction with shape overlay:**
The existing `setVisibleIndices` rebuilds size+shape buffers together (graphRenderers.ts:1345-1368). The admin overlay toggle must NOT bypass this — it must compose with the visibility filter:

```typescript
// Admin overlay composing with visibility filter
function buildAdminOverlaySizeBuffer(
  nodes: GraphRenderNode[],
  visibleSet: Set<number>,
  showAdminTiers: boolean,
  BASE_SIZE: number,
): Float32Array {
  const buf = new Float32Array(nodes.length);
  for (let i = 0; i < nodes.length; i++) {
    if (!visibleSet.has(i)) { buf[i] = 0; continue; }
    const n = nodes[i];
    buf[i] = showAdminTiers && n.isHubAdmin ? BASE_SIZE * 1.5 : BASE_SIZE;
  }
  return buf;
}
// After building: this.graph.setPointSizes(buf); this.graph.setPointShapes(shapes);
```

**Alpha gate — DO NOT re-invert:**
`getSimulationAlpha()` in cosmos.gl v3 returns `1 - progress` (inverted from d3). The stability detector in `graphRenderers.ts:1323-1324` uses `alpha < 0.005` as "stable". Any new rAF gate for admin overlay visibility must mirror this pattern, not derive a new expression.

### Pattern 3: Lazy Column Fetch on Row Visibility (LIST-03)

**What:** Hand-roll `IntersectionObserver` per row; when row scrolls into viewport, fire `accActivity.getFileActivityForUser` for that email.

**Why hand-roll:** No `react-intersection-observer` in repo. The graph already uses equivalent DOM-observation patterns. ~25 lines, no new dep.

```typescript
// app/(dashboard)/users/lib/useVisibleRowEmails.ts (new)
import { useEffect, useRef, useState } from "react";

export function useVisibleRowEmails(emails: string[]): string[] {
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const refsRef = useRef<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        setVisible(prev => {
          const next = new Set(prev);
          for (const e of entries) {
            const email = (e.target as HTMLElement).dataset.email;
            if (!email) continue;
            if (e.isIntersecting) next.add(email);
            else next.delete(email);
          }
          return next;
        });
      },
      { rootMargin: "200px" }, // prefetch slightly off-screen
    );
    for (const [, el] of refsRef.current) observer.observe(el);
    return () => observer.disconnect();
  }, [emails.join(",")]); // re-observe when email set changes

  return Array.from(visible);
}
```

**Empty state:** Render em-dash `—` with `<Tooltip>` "No activity in 90d" when `getFileActivityForUser` returns empty (matches existing `FileActivityCell` empty-state pattern from Phase 03-03).

**Sticky activation pattern from Phase 03-03:** Once a row's activity is fetched, set `enabled: true` permanently for that email (`useState` + `useEffect`). Prevents re-firing on scroll back.

### Pattern 4: Selection Context Extension

**What:** Extend `SelectedFinding` discriminated union (`selectionContext.tsx:32-40`) with new Phase 5 kinds.
**Current state (verified):** 7 kinds: junk, duplicate, outlier, role, admin, day, userActivity.

**New kinds to add:**
```typescript
// app/(dashboard)/users/dashboard/selectionContext.tsx
export type SelectedFinding =
  // ... existing 7 kinds unchanged ...
  | { kind: "folder"; folderUrn: string }           // GRAPH-04 folder click + DASH matrix cell click
  | { kind: "staleInvite"; email: string }          // DASH-15 stale invite click
  | { kind: "adminTier"; tier: "hub" | "project" | "executive" }  // DASH-16 tier ring click
  | null;
```

Also extend `isSelectionValid()` — `folder`/`staleInvite` validate against new findings shapes; `adminTier` always valid.

`DashboardSidePanel.tsx` gains corresponding render branches:
```typescript
case "folder":    return <FolderDetailPanel folderUrn={selected.folderUrn} />;
case "staleInvite": return <StaleInvitePanel email={selected.email} users={users} />;
case "adminTier": return <AdminTierPanel tier={selected.tier} users={users} />;
```

### Pattern 5: Findings Extension (DASH-15)

**What:** Add `staleInvites` + `orphanRoles` to `DashboardFindings`; severity-interleave at sort step.
**Where:** `lib/acc/dashboardAnalytics.ts`.

```typescript
// lib/acc/dashboardAnalytics.ts — extend interface
export interface StaleInviteFinding {
  email: string;
  daysPending: number;
  severity: "MEDIUM"; // CONTEXT lock
}

export interface OrphanRoleFinding {
  folderUrn: string;
  folderPath: string;
  roleName: string;
  severity: "HIGH"; // CONTEXT lock
}

export interface DashboardFindings {
  junkRoles: JunkRoleFinding[];
  duplicateRoles: DuplicateRoleFinding[];
  outlierCombos: OutlierFinding[];
  roleSeverityIndex: Map<string, Severity>;
  // Phase 5 additions:
  staleInvites: StaleInviteFinding[];
  orphanRoles: OrphanRoleFinding[];
}

export function detectStaleInvites(
  members: { email: string; status: string; addedOn: Date | null }[],
  now = new Date(),
): StaleInviteFinding[] {
  return members
    .filter(m => m.status === "pending" && m.addedOn != null &&
      differenceInDays(now, m.addedOn) > 30)
    .map(m => ({
      email: m.email,
      daysPending: differenceInDays(now, m.addedOn!),
      severity: "MEDIUM" as const,
    }));
}
```

**`detectOrphanRoles`** needs `AccFolderPermission` + `AccProjectRole.memberId` data — reads from tRPC, not pure-function over `BulkAccUser`. Either pass raw data through `FindingsProvider` or make it a server-side computed field in a new procedure. **Recommend: server-side — add `orphanRoles` to `accMembers.dashboardCounts` response** so orphan detection doesn't run client-side.

### Pattern 6: `BulkAccUser` Extension Strategy

**Critical:** `BulkAccUser` in `lib/acc/acc-types.ts` does NOT have `aggregatedStatus`, `projectAdmin`, `executive`, `products`, `companyName` — these are on `AccProjectMember` in Prisma but the existing `bulkAccSummary` reads only from `accMemberCache`.

**Recommended approach — additive merge pattern:**
1. Create `accMembers.enrichedUsers` procedure (see Pattern 0).
2. In `DashboardClient.tsx`, run BOTH `trpc.users.bulkAccSummary` (graph + legacy) AND `trpc.accMembers.enrichedUsers` in parallel.
3. Merge on email — enriched data overlays the cache-based record. Missing emails in the enriched query gracefully omit new fields.
4. Extend `BulkAccUser` interface with optional new fields:
   ```typescript
   // lib/acc/acc-types.ts
   aggregatedStatus?: "active" | "pending" | "deleted";
   projectAdmin?: boolean;
   executive?: boolean;
   companyName?: string | null;
   products?: Record<string, "administrator" | "member" | "none">;
   ```
5. Widgets that need new fields read them; widgets that don't are unaffected (optional = safe additive change).

**DO NOT modify `bulkAccSummary`** to join against `AccProjectMember` directly — it is the graph snapshot path and adds join cost to a query already called by the 3D graph.

### Pattern 7: WidgetCommonProps Extension for Phase 5 data

`WidgetCommonProps` in `widgetRegistry.ts` currently has `users: BulkAccUser[]` and `workspaceEmails: string[]`. Phase 5 DASH wave widgets need KPI counts and orphan roles that can't be derived from `BulkAccUser[]` alone.

**Approach:** Add optional Phase 5 fields to `WidgetCommonProps` rather than per-widget prop drilling:
```typescript
export interface WidgetCommonProps {
  users: BulkAccUser[];
  workspaceEmails: string[];
  // Phase 5 additions (optional — widgets that don't need them ignore them)
  dashCounts?: { pendingInvites: number; projectAdmins: number; foldersCrawled: number };
  orphanRoles?: OrphanRoleFinding[];
}
```

`DashboardClient` fetches `accMembers.dashboardCounts` and passes through `widgetProps`. No new context providers needed.

### Anti-Patterns to Avoid

- **Retrofitting interactivity after the visual reskin lands** — v1.0 Phase 4.1 feedback. Always Pattern 1 task sequence (data → render → hover → click → spotlight). Never split across plans.
- **Color as sole signal** — CONTEXT cross-cutting lock. Status pills carry text, admin tiers use shape + size + color, permission edges use thickness + color.
- **New tabs / pages / views** — REQUIREMENTS.md Out of Scope. Enrich only.
- **Adding Sync All / Refresh buttons** — Memory: "No manual sync UI". The Refresh button is already removed from `DashboardClient.tsx` (verified). Do not add new ones anywhere.
- **Mutating cosmos.gl point arrays in place** — always rebuild the typed array and call `setPointSizes`/`setPointColors`/`setPointShapes`. Verified pattern in `graphRenderers.ts`.
- **Eager-loading file activity into `BulkAccUser`** — REQUIREMENTS ACTV-03 forbids this. LIST-03 MUST stay lazy via `IntersectionObserver` + `accActivity.getFileActivityForUser`.
- **Rebuilding the label polish curve** — UAT-approved 2026-05-08, locked by memory. Do not touch `pow(zoom, 0.2)` clamp `[0.85, 1.4]`, 11/18px floor/ceiling in `AccUsersGraph.tsx`.
- **Extending `bulkAccSummary` with Prisma joins** — it serves the graph snapshot too. Create a separate `accMembers.enrichedUsers` procedure instead.
- **Creating a second cosmos.gl renderer for folder nodes** — treat folders as ordinary cosmos points with offset initial positions and a `kind: "folder"` type, NOT a second instance.
- **Changing `HOVER_OPACITY_DIM` without user awareness** — it affects ALL existing widgets. Surface as a decision, do not silently change.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hover tooltip with auto-flip/auto-shift | Custom portal + getBoundingClientRect | shadcn `Tooltip` (Radix) — install via `npx shadcn@latest add tooltip` | Handles edge collision, escape key, focus restore, ARIA |
| Cross-widget selection wiring | Custom event bus | `selectionContext.tsx` (7 existing kinds) | Verified — extend the discriminated union, add panel branches |
| Spotlight halo for selected nodes | Custom WebGL pass | Cosmos.gl `setPointColors` modulation + `useHoverSpotlight` (dashboard widgets) | Both already exist; dashboard uses `useHoverSpotlight`; graph uses color buffer |
| Lazy fetch coordinator | Custom debounce + batch | tRPC `useQuery` with `enabled` + React Query staleTime | Framework handles batching, dedup, cancellation |
| Status reduction across projects | Custom per-project join UI | Server-side aggregate in `accMembers.enrichedUsers` + extend `BulkAccUser` | Client-side join over potentially hundreds of project rows is slow |
| Folder tree visualization in side panel | Custom indented div tree | Use `AccFolder.fullPath` slash-split, render as breadcrumb | Folder hierarchy is shallow; full tree is overkill |
| Severity-interleaved finding list | Custom sort + dedupe | Extend `dashboardAnalytics.ts computeAllFindings` | Single producer keeps `RecommendationsWidget` dumb |
| Cosmos.gl shape enum values | Guess or hardcode ints | Read `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` source for `PointShape` enum | Beta version may differ from published types; enum source-of-truth is the patch |

**Key insight:** Phase 5's biggest temptation is the `bulkAccSummary` extension. Resist. The right pattern is a parallel `accMembers.enrichedUsers` query + client-side merge on email.

## Common Pitfalls

### Pitfall 1: Data Bridge Assumption (HIGH COST IF MISSED)

**What goes wrong:** Implementer assumes `BulkAccUser` already has v2.0 fields (`status`, `projectAdmin`, `products`, etc.) and writes widget code that reads them — then finds they're always `undefined` at runtime.
**Why it happens:** The prior RESEARCH.md implied the data was available; in reality `bulkAccSummary` reads only `accMemberCache`.
**How to avoid:** Task 1 in EVERY Plan file for Phase 5 must be "Verify or create tRPC procedure reading from `AccProjectMember`". Check the `accMemberCache` schema to see what fields it stores vs what's only in `AccProjectMember`.
**Warning signs:** New pills/columns render as blank or `undefined` in all rows.

### Pitfall 2: Cosmos.gl Alpha Inversion (high cost if forgotten)

**What goes wrong:** Adding a new rAF gate that uses `getSimulationAlpha()` and inverting twice → overlay never shows OR always shows.
**Why it happens:** Cosmos.gl v3 inverts d3 semantics. Stability detector at `graphRenderers.ts:1323-1325` uses `alpha < 0.005` as stable (not `> 0.995` — the inversion is already baked in at the detector level).
**How to avoid:** Mirror the existing `alpha < 0.005` pattern. Do not re-invert.
**Warning signs:** Admin tier overlay flickers, or only appears when simulation is fully cooled.

### Pitfall 3: `setPointShapes` Enum Values Unknown

**What goes wrong:** GRAPH-03 codes `shape = 1` (guessing Diamond) but cosmos.gl beta.9 uses a different numeric. Nodes render as circles or invisible.
**Why it happens:** The `PointShape` enum is internal to cosmos.gl; published TypeScript types may be stale for beta.9.
**How to avoid:** Before GRAPH-03 implementation, read `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` to extract the enum, OR query Context7 for `@cosmos.gl/graph` PointShape enum. Document the verified values in the plan.
**Warning signs:** Admin overlay shape toggle changes colors/sizes but nodes don't change shape.

### Pitfall 4: `HOVER_OPACITY_DIM` Mismatch with CONTEXT

**What goes wrong:** CONTEXT.md says "dim non-selected nodes to ~20% opacity" but `dashboardTokens.ts:78` has `HOVER_OPACITY_DIM = 0.4` (40%). Changing the constant to 0.2 would affect ALL existing widgets (AdminAccess, OutlierCombos, Recommendations). Not changing it means the graph spotlight (cosmos `setPointColors` with alpha modulation) may use 20% while dashboard widgets use 40%.
**Why it happens:** The CONTEXT decision was made before the token value was verified.
**How to avoid:** Surface this mismatch to the user at plan-phase. Options: (a) keep 0.4 and treat CONTEXT as approximate, (b) change token to 0.2 and re-UAT all spotlight widgets, (c) use separate constants for graph vs dashboard spotlight.
**Warning signs:** Graph spotlight looks much darker than dashboard spotlight.

### Pitfall 5: `BulkAccUser` Optional Field Spread Breaking TypeScript

**What goes wrong:** Adding optional fields to `BulkAccUser` triggers TS errors in widgets that destructure `BulkAccUser` with exact shapes, or in tests that construct synthetic `BulkAccUser` objects.
**Why it happens:** `BulkAccUser` is used by ~15 files across graph, dashboard, and test fixtures.
**How to avoid:** Mark all Phase 5 additions as `field?: type` (optional). Add them to the end of the interface. Run `tsc --noEmit` after the interface change and fix all type errors before writing widget code.
**Warning signs:** Compile errors in `dashboardAnalytics.test.ts`, `quick-sync-extraction.test.ts`, `cosmosUtils.test.ts`.

### Pitfall 6: Phase 4 GO/NO-GO Timing

**What goes wrong:** GRAPH-04 plan is drafted assuming GO; Phase 4 returns NO-GO mid-implementation.
**Why it happens:** Phase 5 starts in parallel with Phase 4 (CONTEXT lock).
**How to avoid:**
1. Plan GRAPH-04 LAST in Wave 5.1.
2. Build `<FolderDetailPanel>` as a shared component used by BOTH GRAPH-04 click AND DASH matrix click — single source of truth.
3. Plan the dashboard fallback (matrix → `<FolderDetailPanel>`) in Wave 5.3 BEFORE GRAPH-04.
**Warning signs:** Two diverging folder-detail code paths in graph vs dashboard.

### Pitfall 7: Per-Module Products JSON Shape

**What goes wrong:** `AccProjectMember.products` is `Json` type — opaque to TypeScript. Side panel renders raw JSON string `{"docs":"member","build":"administrator"}`.
**Why it happens:** Prisma `Json` type is `unknown` at the boundary.
**How to avoid:** Add a Zod parser in the tRPC procedure:
```typescript
const ProductsTierSchema = z.record(z.string(), z.enum(["administrator", "member", "none"]));
// Then: ProductsTierSchema.safeParse(member.products)
```
Use `moduleLabel()` from `lib/acc/modules.ts` for display names. The label map already handles both snake_case and camelCase keys.
**Warning signs:** Side panel "Module Access" section renders `"[object Object]"` or the raw JSON.

### Pitfall 8: Status Aggregation — Distinct vs Count

**What goes wrong:** The `dashboardCounts.projectAdmins` query uses `count({ where: { projectAdmin: true } })` without `distinct: ["email"]` — counts project×member rows, not distinct users. A single user who is admin on 10 projects contributes 10.
**Why it happens:** `AccProjectMember` is per-project — a user appears once per project.
**How to avoid:** Use `groupBy` or a subquery to count DISTINCT emails with `projectAdmin: true`. Prisma `count` with `distinct` works on single fields: `ctx.db.accProjectMember.groupBy({ by: ['email'], where: { projectAdmin: true }, _count: true })` then `result.length`.
**Warning signs:** "Project Admins" KPI tile shows a number 5-50× higher than expected.

### Pitfall 9: 60 FPS Budget on Folder Cluster (GRAPH-04)

**What goes wrong:** Folder cluster adds 5,000+ extra points + 50,000+ edges; FPS drops below 60.
**Why it happens:** Cosmos.gl GPU simulation cost for extra points + edges is non-trivial.
**How to avoid:** Phase 4 perf pre-flight produces the GO/NO-GO artifact. If GO, cap edges to 1 per user-folder pair (most-restrictive tier only) to reduce edge count. Test with perf HUD enabled (existing perfGpu/perfSimAlpha HUD in AccUsersGraph).
**Warning signs:** Perf HUD shows simAlpha never reaching ~0; pan/zoom janky; frame budget red.

### Pitfall 10: `AccProjectMember` May Be Empty at Phase 5 Start

**What goes wrong:** Phase 5 runs in parallel with Phase 4. If Phase 4's Quick Sync hasn't run yet on Railway when Wave 5.1 starts UAT, `AccProjectMember` is empty → all new UI shows blank/zero.
**Why it happens:** Railway Quick Sync (release command) populates `AccProjectMember`; Phase 5 development may outrun the data.
**How to avoid:** Each new procedure must return graceful empty state ([] or 0), not null/undefined. Add a "Data not yet synced — run a Quick Sync to populate" empty state message in new UI surfaces. Do NOT block shipping Phase 5 code on data availability.
**Warning signs:** Status column shows all "—" during development.

## Code Examples

### Example 1: New tRPC Router Registration

```typescript
// server/routers/root.ts — ADD:
import { accMembersRouter } from "./acc-members";
import { accGraphRouter } from "./acc-graph";     // for GRAPH-01 perProjectRoleFacets

export const appRouter = router({
  // ... existing routers unchanged ...
  accSync: accSyncRouter,
  accActivity: accActivityRouter,
  accMembers: accMembersRouter,   // Phase 5 addition
  accGraph: accGraphRouter,       // Phase 5 addition
});
```

### Example 2: Extend SelectedFinding for Phase 5 Kinds

```typescript
// app/(dashboard)/users/dashboard/selectionContext.tsx
export type SelectedFinding =
  | { kind: "junk"; finding: JunkRoleFinding }
  | { kind: "duplicate"; finding: DuplicateRoleFinding }
  | { kind: "outlier"; finding: OutlierFinding }
  | { kind: "role"; role: string; severity: Severity | undefined }
  | { kind: "admin"; email: string }
  | { kind: "day"; dateIso: string; emails: string[] }
  | { kind: "userActivity"; email: string }
  // Phase 5 additions:
  | { kind: "folder"; folderUrn: string }
  | { kind: "staleInvite"; email: string }
  | { kind: "adminTier"; tier: "hub" | "project" | "executive" }
  | null;
```

### Example 3: Cosmos.gl Admin Tier Overlay (GRAPH-03)

```typescript
// In CosmosGraphRenderer — new method alongside setVisibleIndices
setAdminTierOverlay(
  nodes: readonly GraphRenderNode[],
  showAdminTiers: boolean,
  visibleSet: ReadonlySet<number>,
  adminTierByIndex: Map<number, "hub" | "project" | "executive" | null>,
): void {
  if (!this.graph) return;
  const nodeCount = nodes.length;
  const sizes = new Float32Array(nodeCount);
  const shapes = new Float32Array(nodeCount);
  const colors = this.baseColorBuffer
    ? new Float32Array(this.baseColorBuffer)
    : buildNodeColorBuffer(nodes);

  for (let i = 0; i < nodeCount; i++) {
    if (!visibleSet.has(i)) { sizes[i] = 0; shapes[i] = 8; continue; }
    const tier = showAdminTiers ? adminTierByIndex.get(i) : null;
    if (tier === "hub") {
      sizes[i] = 4 * 1.5; // BASE_SIZE * 1.5 per CONTEXT lock
      shapes[i] = STAR_SHAPE; // verify enum value from cosmos beta.9
      // Gold halo: encode as bright amber in RGBA
      const off = i * 4;
      colors[off] = 1.0; colors[off+1] = 0.84; colors[off+2] = 0.0; colors[off+3] = 1.0;
    } else if (tier === "project") {
      sizes[i] = 4; // base size
      shapes[i] = DIAMOND_SHAPE; // verify enum value
    } else if (tier === "executive") {
      sizes[i] = 4;
      shapes[i] = 0; // Circle with programmatic ring — cosmos doesn't natively do ring; use color ring hack
    } else {
      sizes[i] = buildNodeSizeBuffer(1, null)[0]; // fallback to default
      shapes[i] = 0; // Circle
    }
  }
  try {
    this.graph.setPointSizes(sizes);
    this.graph.setPointShapes(shapes);
    this.graph.setPointColors(colors);
    this.graph.render?.();
  } catch { /* non-fatal */ }
}
```

**Note:** "circle-with-ring" for executive tier may not be a native cosmos.gl shape. If the `PointShape` enum doesn't include it, implement by: (a) using Circle shape + an outer ring drawn in the label Canvas2D overlay pass (existing overlay at AccUsersGraph.tsx:1678), or (b) choosing a different shape. Verify enum before committing to circle-with-ring.

### Example 4: Tooltip Card for Graph Hover (GRAPH-02)

```typescript
// Anchor approach: cosmos hover callback provides screen coords
// Track hovered position in state, anchor invisible div, mount Tooltip on it
const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
const [hoveredNodeData, setHoveredNodeData] = useState<HoverNodeDetail | null>(null);

// In AccUsersGraph useEffect — extend existing onNodeHoverCallback (line ~975):
renderer.onNodeHoverCallback = (index, event) => {
  if (index === null) { setHoverPos(null); setHoveredNodeData(null); return; }
  const rect = containerRef.current?.getBoundingClientRect();
  if (event && rect) setHoverPos({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  // Lazy fetch: accActivity.getFileActivityForUser + data from enrichedUsers merge
  setHoveredNodeData(buildHoverDetail(nodes[index]));
};

// JSX: absolute-positioned anchor div + Tooltip
{hoverPos && (
  <Tooltip open delayDuration={0}>
    <TooltipTrigger asChild>
      <div style={{ position: "absolute", left: hoverPos.x, top: hoverPos.y, width: 1, height: 1 }} />
    </TooltipTrigger>
    <TooltipContent side="right" className="max-w-xs">
      <HoverNodeCard data={hoveredNodeData} />
    </TooltipContent>
  </Tooltip>
)}
```

### Example 5: KpiStrip Grid Layout (DASH-14)

```typescript
// KpiStripWidget.tsx — current:
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
// Phase 5: append 3 tiles, adjust grid
<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-9">
  {/* existing 6 tiles unchanged */}
  {/* 3 new tiles: */}
  <KpiTile label="Pending Invites" value={dashCounts?.pendingInvites ?? "—"} />
  <KpiTile label="Project Admins" value={dashCounts?.projectAdmins ?? "—"} />
  <KpiTile label="Folders Crawled" value={dashCounts?.foldersCrawled ?? "—"} />
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| One mega-PLAN.md per phase | Sub-phase PLAN.md per wave (5.1/5.2/5.3) | This phase (CONTEXT lock) | Faster UAT cycle, smaller blast radius |
| Retrofit interactivity after visual reskin | Bake-in template (data → render → hover → click → spotlight) | v1.0 Phase 4.1 retrospective | Eliminates Phase 4.1-class UAT failures |
| `Refresh` button in DashboardClient | **Already removed** (confirmed 2026-05-11) | Pre-planning cleanup | One less anti-pattern to track |
| Cosmos.gl v3 inverted alpha | `alpha < 0.005` = stable (inversion already accounted for at detector) | beta.9 patch (memory) | Don't re-invert; mirror line 1323 pattern |
| `bulkAccSummary` as sole data source | `bulkAccSummary` (graph/legacy) + `accMembers.enrichedUsers` (v2.0 tables) | Phase 5 introduces | Additive parallel query, no legacy breakage |
| `setPointShapes` for hide-only (shape=8) | `setPointShapes` extended to diamond/star for admin tiers | Phase 5 GRAPH-03 | API already proven; enum values need verification |

**Deprecated/outdated (vs prior RESEARCH.md):**
- Prior research tracked "Refresh button at DashboardClient:88-95" as an open issue — **RESOLVED** (button and imports already deleted).
- Prior research proposed `accGraph.perProjectRoleFacets` as extending `users.ts` — **UPDATE**: create separate `server/routers/acc-graph.ts` to keep `users.ts` (1,500+ lines) from growing further.
- Prior research noted "cosmos.gl per-point shape uniforms — not verified against Context7" — **PARTIALLY RESOLVED**: `setPointShapes` API is confirmed in codebase; specific enum values for diamond/star still need verification.

## Open Questions

1. **What are the cosmos.gl beta.9 `PointShape` enum values for Diamond and Star?**
   - What we know: `0` = Circle, `8` = None (verified from graphRenderers.ts). `setPointShapes` API works.
   - What's unclear: Numeric values for `Diamond`, `Star`, `Cross`, `Ring` — if they exist.
   - Recommendation: Read `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` to extract the enum before GRAPH-03 implementation. If diamond/star not in enum, fall back to pre-baked Canvas2D overlay shapes drawn in the existing label overlay pass.

2. **Does `AccProjectMember` have data when Phase 5 starts?**
   - What we know: `AccProjectMember` is populated by Phase 2 Quick Sync; Phase 5 runs in parallel with Phase 4.
   - What's unclear: Whether Phase 2 has been successfully run on Railway (STATE.md shows Phases 2+3 complete but "plans drafted" — did the actual Railway sync run?).
   - Recommendation: Plan all new procedures to return graceful empty state. Add an `isEmpty` flag or UI hint "Sync required" when zero members are found.

3. **Will Phase 4 ship an `accFolder` tRPC router?**
   - What we know: `AccFolder` + `AccFolderPermission` tables exist in Prisma (schema:504-528). No `acc-folder.ts` router exists yet.
   - What's unclear: Phase 4 PLAN.md is not yet written — it may include an `accFolder` router or not.
   - Recommendation: GRAPH-04 plan includes "Verify or create `accFolder.getDetail` tRPC procedure" as Task 1. Do not block; create it if Phase 4 doesn't.

4. **`HOVER_OPACITY_DIM` = 0.4 vs CONTEXT "~20%" — which wins?**
   - What we know: `dashboardTokens.ts:78` has `0.4`. CONTEXT says dim to "~20% opacity".
   - What's unclear: User intent — did CONTEXT's "20%" reflect the actual token, or was it a design goal that differs from the shipped token?
   - Recommendation: Surface at plan-phase. Option A: keep 0.4, CONTEXT was approximate. Option B: change to 0.2, re-UAT all widgets. Changing the constant affects 3 existing widgets (AdminAccess, OutlierCombos, Recommendations).

5. **"Circle-with-ring" for Executive tier — native cosmos shape or Canvas2D overlay?**
   - What we know: CONTEXT locks "circle-with-ring" for executive, star for hub, diamond for project.
   - What's unclear: Whether cosmos.gl beta.9 `PointShape` enum has a Ring or Donut variant.
   - Recommendation: After verifying enum values (Q1), if no ring shape exists, implement as: Circle shape (0) in cosmos + a visible outer ring drawn in the Canvas2D label overlay pass (existing `drawLabelOverlay` at AccUsersGraph.tsx:1678). Or re-propose to user at plan-phase.

6. **`detectOrphanRoles` — client-side pure function or server-side?**
   - What we know: Orphan detection needs `AccFolderPermission` + `AccProjectRole.memberId` — not in `BulkAccUser`.
   - What's unclear: Whether to compute orphans server-side (in `accMembers.dashboardCounts`) or client-side after fetching raw role data.
   - Recommendation: Server-side. Add `orphanRoles: OrphanRoleFinding[]` to `accMembers.dashboardCounts` or a dedicated `accMembers.findOrphanRoles` procedure. Avoids shipping large raw datasets to the client for analytics.

## Validation Architecture

> `workflow.nyquist_validation` not set in `.planning/config.json` — treated as disabled. Including lightweight test coverage section because Vitest is active and 5+ test files exist.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.6 |
| Config file | `C:/LECG/Dashboard/vitest.config.ts` |
| Quick run command | `npm test -- --run <pattern>` |
| Full suite command | `npm test -- --run` |

### Existing Test Files

| File | Covers |
|------|--------|
| `app/(dashboard)/users/accGraphFilters.test.ts` | `nodeMatchesFilters` — extend for `perProjectRoles` AND-intersect (GRAPH-01) |
| `app/(dashboard)/users/accGraphTopology.test.ts` | Graph topology builders |
| `app/(dashboard)/users/cosmosUtils.test.ts` | `buildNodeColorBuffer`, `buildNodeSizeBuffer` — extend for admin tier size multiplier (GRAPH-03) |
| `lib/acc/dashboardAnalytics.test.ts` | `computeAllFindings` — extend for `detectStaleInvites`, `detectOrphanRoles` (DASH-15) |
| `lib/acc/quick-sync-extraction.test.ts` | Extraction pipeline |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Command | File |
|--------|----------|-----------|---------|------|
| GRAPH-01 | perProjectRole filter AND-intersects with status/module/roles | unit | `npm test -- --run accGraphFilters` | ✅ extend |
| GRAPH-02 | Tooltip card renders enriched fields | visual UAT | manual | ❌ visual |
| GRAPH-03 | Admin tier size multiplier (1.5× for hub), shape mapping | unit | `npm test -- --run cosmosUtils` | ✅ extend |
| GRAPH-04 | Folder cluster offset + edge permission tier mapping | unit | `npm test -- --run folderCluster` | ❌ new — conditional |
| LIST-01 | Status reduction rule (any-active wins) | unit | `npm test -- --run accStatusReduction` | ❌ new |
| LIST-02 | projectAdmin facet filter | unit | extend accGraphFilters test | ✅ extend |
| LIST-03 | IntersectionObserver fires batch fetch on scroll visibility | integration/manual | manual | ❌ visual |
| LIST-04 | Products JSON → tier label via Zod + moduleLabel | unit | `npm test -- --run productsTierMap` | ❌ new |
| DASH-14 | dashboardCounts returns correct pending/admin/folder counts | unit | `npm test -- --run dashboardCounts` | ❌ new |
| DASH-15 | detectStaleInvites + detectOrphanRoles + severity interleave | unit | `npm test -- --run dashboardAnalytics` | ✅ extend |
| DASH-16 | 3-tier ring color mapping + orbit filter | unit | `npm test -- --run adminConstellationTier` | ❌ new |
| DASH-17 | Hub vs per-project aggregation toggle swap | unit | `npm test -- --run heatmapToggle` | ❌ new |
| DASH-18 | Cross-widget spotlight: click in widget A dims in widget B | manual UAT | manual | ❌ UAT gate |

### Wave 0 Gaps (new test files per sub-phase)

- **5.1:** Extend `cosmosUtils.test.ts` (admin tier size multiplier); extend `accGraphFilters.test.ts` (perProjectRoles dimension); new `adminTierShape.test.ts` (shape enum mapping)
- **5.2:** New `accStatusReduction.test.ts`; new `productsTierMap.test.ts`
- **5.3:** Extend `dashboardAnalytics.test.ts` (stale-invite + orphan-role cases); new `dashboardCounts.test.ts`; new `adminConstellationTier.test.ts`; new `heatmapToggle.test.ts`

## Sources

### Primary (HIGH confidence — verified by direct codebase read 2026-05-11)

- `C:/LECG/Dashboard/lib/acc/acc-types.ts` — `BulkAccUser` interface (no v2.0 fields yet; confirmed gap)
- `C:/LECG/Dashboard/lib/acc/dashboardAnalytics.ts:72-78` — `DashboardFindings` interface (4 existing fields)
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/selectionContext.tsx:32-40` — 7-kind discriminated union (verified)
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/DashboardClient.tsx` — Refresh button confirmed absent
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/widgets/_shared/dashboardTokens.ts:78` — `HOVER_OPACITY_DIM = 0.4` (verified — differs from CONTEXT's "~20%")
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/widgets/_shared/HoverSpotlight.tsx` — `useHoverSpotlight` API (verified)
- `C:/LECG/Dashboard/app/(dashboard)/users/graphRenderers.ts:716,733-736,1346-1368` — `setPointColors`, `setPointSizes`, `setPointShapes` API (verified; shape 0=Circle, shape 8=None)
- `C:/LECG/Dashboard/app/(dashboard)/users/cosmosUtils.ts:47-107` — `buildNodeColorBuffer`, `buildNodeSizeBuffer` (verified patterns)
- `C:/LECG/Dashboard/app/(dashboard)/users/accGraphFilters.ts` — `GraphFilters` interface (no `perProjectRoles` yet)
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/widgetRegistry.ts` — 9 widgets registered; `WidgetCommonProps` shape
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/widgets/KpiStripWidget.tsx:82` — `grid-cols-6` confirmed
- `C:/LECG/Dashboard/app/(dashboard)/users/dashboard/widgets/AdminAccessWidget.tsx:78` — single-tier `isAccountAdmin` filter (confirmed no project-admin tier yet)
- `C:/LECG/Dashboard/prisma/schema.prisma:460-474` — `AccProjectMember` fields (status, projectAdmin, executive, products, companyName, addedOn, lastSignIn)
- `C:/LECG/Dashboard/prisma/schema.prisma:504-528` — `AccFolder`, `AccFolderPermission` tables (verified)
- `C:/LECG/Dashboard/server/routers/root.ts` — no `accGraph`, no `accMembers`, no `accFolder` router (confirmed — new in Phase 5)
- `C:/LECG/Dashboard/server/routers/users.ts:809-867` — `bulkAccSummary` reads only from `accMemberCache` (confirmed gap)
- `C:/LECG/Dashboard/server/routers/acc-activity.ts:40` — `getFileActivityForUser` procedure (verified for LIST-03 lazy reuse)
- `C:/LECG/Dashboard/lib/acc/modules.ts` — `moduleLabel()` function + `ACC_MODULE_LABELS` map (verified)
- `C:/LECG/Dashboard/package.json` — confirmed: `@radix-ui/react-tooltip` NOT installed; `@radix-ui/react-popover` NOT installed; `react-intersection-observer` NOT installed
- `C:/LECG/Dashboard/.planning/STATE.md` — Phase 03-03 hover-prefetch pattern + sticky activation (verified for LIST-03 reuse)

### Secondary (MEDIUM confidence)

- v1.0 memory entries (cosmos alpha inversion, no-manual-sync, widget interactivity, label polish curve) — referenced consistently across multiple SUMMARY.md files
- Phase 4.1 retrospective lessons informing DASH-18 hard gate

### Tertiary (LOW confidence)

- Cosmos.gl beta.9 `PointShape` enum values for Diamond and Star — not verified against Context7 or patch file in this session. **Flag: read `patches/@cosmos.gl+graph+3.0.0-beta.9.patch` before GRAPH-03 coding begins.**
- Whether `detectOrphanRoles` should be server-side or client-side — depends on Phase 4 data volume. If `AccFolderPermission` has millions of rows, server-side is mandatory.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library verified in `package.json`; tooltip/popover need shadcn install.
- Data bridge pattern: HIGH — gap between `bulkAccSummary` (cache-only) and v2.0 Prisma tables is verified; bridge pattern is well-established in the codebase.
- Architecture: HIGH for selection/findings/filter extension (mirrors v1 patterns); MEDIUM for cosmos.gl admin overlay (setPointShapes API verified, enum values not); LOW for folder cluster (conditional + perf-gated).
- Pitfalls: HIGH — most pitfalls derive from verified codebase reads, not speculation.
- Tests: MEDIUM — framework + existing files verified; new test commands proposed but not yet implemented.

**Research date:** 2026-05-11
**Valid until:** 2026-06-10 (30 days — stable codebase; revisit if cosmos.gl bumps off beta.9 or if Phase 4 returns NO-GO on GRAPH-04).
