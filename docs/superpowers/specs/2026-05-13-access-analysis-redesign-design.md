# Access Analysis Tab — Redesign Spec

**Date:** 2026-05-13
**Status:** Draft — awaiting Luis review
**Owner:** Luis Cortes (BIM dashboard owner)
**Target route:** `/users` (replaces both `/users` directory and `/users/dashboard`)

---

## Problem

The current "Users" + "Access Analysis" tabs are two separate sidebar entries that fragment the access story:

- **`/users`** — `UsersDirectoryClient`: a sortable directory table with side-panel drill-down. Useful but opaque — answers *who* but not *what's changing*.
- **`/users/dashboard`** — `DashboardClient`: a 10-widget draggable board (Coverage donut, Active Users tiers, KPI strip, Recommendations, Roles×Modules heatmap, Outlier Combos, Role Relationships, Recently Added, Account Admins, Folder Permissions). User feedback: *"lazy and not astonishing, they don't tell me that much."*

The widgets each answer a different question, none of them tell a coherent story, and the duplicate sidebar entries force the user to context-switch between "who exists" and "what's happening." The dashboard is operationally noisy without being decision-useful.

## Goal

Replace both tabs with one **Access Analysis** tab that answers a single primary question — **"how is access changing over time?"** — in a layout that an executive can read in 3 seconds and that Luis can drill into operationally.

## Audience and density

**Primary:** executives (Hermosillo leadership, occasional reviewers).
**Density target:** big numbers, simple charts, 1–2 takeaways per scroll. Detail panels only on click.
**Operational secondary:** Luis. The directory table (the entire current `/users` experience) is preserved as a collapsible drill-down, so all power-user workflows survive.

## North Star: four change streams

Every chart, KPI, and card on the new page traces back to one of four access-change streams:

1. **Membership churn** — users joined / left / activated / deactivated
2. **Permission drift** — role and permission tier changes
3. **Project access expansion** — users added to / removed from projects
4. **Admin grants** — `projectAdmin` or `accountAdmin` role assignments (subset of #2 but called out separately because it's the highest-risk class)

All four data streams come from `AccActivity` rows produced by the APS Data Connector pipeline. See "Data dependencies" below for current coverage and what tonight's 730-day backfill changes.

## Page layout (single-route, scroll-down)

```
┌───────────────────────────────────────────────────────────────┐
│  ACCESS ANALYSIS                            [30d|90d|1y|All]  │
│  Last refreshed 2 hrs ago • 1,212 members                     │
├───────────────────────────────────────────────────────────────┤
│   ┌──────────┬──────────┬──────────┬──────────┐              │
│   │ Members  │ Access   │ Active   │ Stale    │   KPI strip   │
│   │ 1,212    │ changes  │ admins   │ members  │   (Section 3) │
│   │ +47      │ 3,847    │ 28       │ 89       │              │
│   └──────────┴──────────┴──────────┴──────────┘              │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│   HERO CHART — Access Events Over Time (Section 2)            │
│   Stacked-area, 4 colored layers, ~400px tall                 │
│                                                                │
├───────────────────────────────────────────────────────────────┤
│   ┌─────────────────────┬─────────────────────┐              │
│   │ Membership churn    │ Permission drift    │  Drill-down   │
│   │ +47 / −12  ▁▃▅▂▆    │ 23 changes ▁▂▃▅▇    │  cards        │
│   │ Headline: …          │ Headline: …          │  (Section 4) │
│   │ See all →           │ See all →           │              │
│   ├─────────────────────┼─────────────────────┤              │
│   │ Project access      │ Admin grants        │              │
│   │ +112 ▁▅▇▆▃          │ +3 new admins       │              │
│   │ Headline: …          │ Headline: …          │              │
│   │ See all →           │ See all →           │              │
│   └─────────────────────┴─────────────────────┘              │
├───────────────────────────────────────────────────────────────┤
│   ▸ Browse all 1,212 members  (Section 5 — collapsed)         │
└───────────────────────────────────────────────────────────────┘
```

A single time-window selector in the header controls the KPI strip, hero chart, drill-down cards, and (when expanded) the directory table — so the whole page tells one coherent story for whichever window is selected.

## Section 2 — Hero chart spec

- **Type:** stacked-area, 4 layers.
- **X-axis bins:** auto-selected by window — `day` for 30d, `week` for 90d/1y, `month` for All.
- **Y-axis:** count of access-change events in the bin.
- **Layer order and color:**
  1. **Membership churn** — blue (`hsl(210 80% 55%)`)
  2. **Permission drift** — purple (`hsl(270 60% 55%)`)
  3. **Project access** — teal (`hsl(180 65% 45%)`)
  4. **Admin grants** — amber, hatched (`hsl(35 90% 55%)`) — drawn last and slightly darker so it pops as the riskiest class.
- **Interactivity:**
  - Hover any column → tooltip with per-layer counts + the top 3 events for that bin.
  - Click a column → scrolls the page to the matching drill-down card with the date pre-filtered.
  - Legend chips toggle layer visibility.
- **Empty-state caveat:** until the 2-year backfill completes (scheduled 2026-05-13 18:30 local), only the last ~30 days of `AccActivity` is populated. The chart draws a faint vertical "Data window starts here" line at the earliest event so the chart isn't misread as "low activity in 2024" when really we just don't have the rows. The line disappears automatically once data extends past the chart window.

## Section 3 — KPI strip spec

Four equal-width cards. Each card: huge number, ± delta vs prior equivalent window, one-word qualitative tag.

| # | Label | Number | Definition | Delta |
|---|---|---|---|---|
| 1 | Members | `count(distinct AccMemberCache)` | total directory headcount | vs window start |
| 2 | Access changes | `count(AccActivity rows in window)` | total events shown in hero chart | vs prior equivalent window |
| 3 | Active admins | `count(distinct users where projectAdmin OR accountAdmin)` | currently-effective admin count | vs window start |
| 4 | Stale members | `count(AccMemberCache rows with 0 AccActivity rows in window)` | inactive in selected window | vs window start |

Card border colors match the corresponding chart-layer colors when relevant (members → blue, admins → amber), so the eye reads top-to-bottom and the relationship between numbers and chart is obvious.

## Section 4 — Drill-down cards spec

Four cards, 2-column on desktop, 1-column on mobile. Identical shape (consistency = exec-friendly).

Each card contains:

- Color-coded dot + title matching the corresponding chart layer
- Two numbers: net positive and net negative for the window
- 60×20 px sparkline of the same time series (matching the chart layer)
- One **headline event** auto-picked by an impact-ranking heuristic (see "Headline-event ranking" below)
- "See all →" link that expands the directory table at the bottom of the page and applies the relevant filter

### Headline-event ranking heuristic

Server-side function that picks ONE event per stream per window. Impact score:

```
score = severity_weight[action_type] * recency_weight(occurred_at, window_end)
       + role_weight[new_role]  // only for permission/admin streams
       + project_weight[project_id]  // hub-priority project lookup
```

Severity weights (highest first):
- `accountAdmin grant`: 100
- `projectAdmin grant`: 60
- `user deactivated`: 50
- `user added`: 30
- `project member added`: 20
- `role change (non-admin)`: 15
- `user removed`: 25
- `user activated`: 10

Recency weight: events in the last 10% of the window get 1.0, decaying linearly to 0.3 at the window start. This biases the headline toward "recent and important" rather than "old and dramatic."

## Section 5 — Directory table (preserved, demoted)

The existing `UsersDirectoryClient` table (sortable columns, file activity column, side-panel drill-down via `DashboardSidePanel`) is moved into a collapsible accordion at the bottom of the page.

- Heading: **"▸ Browse all 1,212 members"** (with current count).
- Collapsed by default. Clicking expands inline — no route change.
- Filter state is shared with the cards: clicking "See all →" on any card auto-expands the table and applies the corresponding filter.
- The existing per-user side panel (`DashboardSidePanel` with its 4-section activity body) is preserved unchanged and opens from row clicks.

## Section 6 — Cleanup and migration

### Routing
- `/users` — new combined Access Analysis page.
- `/users/dashboard` — 308 permanent redirect to `/users` (so deep links survive).

### Navigation
Sidebar entries "Users" (`/users`) and "Access Analysis" (`/users/dashboard`) collapse into one entry: **"Access Analysis"** at `/users`, icon `PieChart` (preserved from the existing access-analysis entry).

### Components removed
- `app/(dashboard)/users/dashboard/DashboardClient.tsx`
- `app/(dashboard)/users/dashboard/widgetRegistry.ts`
- `app/(dashboard)/users/dashboard/useWidgetOrder.ts`
- `app/(dashboard)/users/dashboard/SortableWidget.tsx`
- Widget components: `CoverageDonutWidget`, `ActiveUserTiersWidget`, `KpiStripWidget`, `RecommendationsWidget`, `RolesModulesHeatmapWidget`, `OutlierCombosWidget`, `RoleRelationshipFlowWidget`, `FolderPermissionsWidget`
- `findingsContext.ts`, `selectionContext.ts` — audited first; deleted if no remaining consumers after `DashboardSidePanel` is checked.

### Components reused
- `UsersDirectoryClient` — kept whole, moved into the bottom collapsible section.
- `DashboardSidePanel` (user activity body) — kept whole, opens from directory rows.
- `RecentlyAddedWidget` logic — refactored into the membership-churn card.
- `AdminAccessWidget` logic — refactored into the admin-grants card.

### Components added
- `AccessAnalysisPage` — page-level orchestrator
- `KpiStrip` — 4-card strip with delta computation
- `AccessEventsChart` — stacked-area hero chart (likely Recharts or Visx — decision deferred to implementation plan)
- `ChangeStreamCard` — the reusable 4-card body
- `HeadlineEventPicker` — server-side ranking utility
- `accActivity.getTimeline` tRPC procedure — bins events by day/week/month for the hero chart
- `accActivity.getHeadlineEvent` tRPC procedure — applies the ranking heuristic
- `accMembers.getKpiSummary` tRPC procedure — KPI strip data including stale count

## Data dependencies and rollout sequencing

| Data need | Today (2026-05-13 17:30) | After tonight's backfill (~2026-05-14 morning) |
|---|---|---|
| `AccActivity` total rows | 2,507 | Expected tens of thousands |
| Distinct projects with activity | 16 of 382 | Expected 150–300 |
| Date range | 2026-04-14 → 2026-05-13 | 2024-05-13 → 2026-05-12 |
| Admin event rows (`sourceFile='admin'`) | 3 | Will grow proportionally |

**Rollout decision:** the new tab is built behind a feature flag (`NEXT_PUBLIC_NEW_ACCESS_ANALYSIS=1`). It can be enabled in dev/staging during build but the production sidebar entry only flips after the backfill completes and the admin-event volume passes a sanity threshold (e.g., ≥50 admin rows in `AccActivity`). If admin-event volume is too thin even after backfill, Section 2's chart and the admin-grants card downgrade gracefully (faint chart layer, card shows "no admin grants in window" empty state).

## Non-goals (explicit)

- **No role-snapshot tracking.** We don't introduce a new `RoleSnapshot` table to capture state diffs over time. The `AccActivity` event stream is the only source. If the DC CSVs don't emit a particular kind of permission change, we don't see it. This is a known limitation; addressing it would be a separate phase.
- **No real-time updates.** The page refreshes when the daily DC cron runs (11:04 local). No websockets, no polling.
- **No risk page.** The "Outlier Combos," "Roles × Modules heatmap," and "Role Relationships flow" widgets being deleted are NOT being moved to a new `/risk` page in this work. If they're wanted later, that's its own scope.
- **No graph view.** The `AccUsersGraph` 3D/2D graph on the existing users page is unrelated to this redesign — it's the Phase 6/7 deliverable and lives elsewhere.

## Open questions for review

1. Should the time-window options be `[30d, 90d, 1y, All]` as drafted, or should I add a custom date-range picker?
2. Should "Stale members" definition use 30-day inactivity regardless of selected window, or scale with the window? Drafted: scales with window. Trade-off: scaling makes the number meaningful but harder to compare across visits.
3. Should the directory table's collapsed/expanded state persist across page loads? Drafted: collapsed by default every time. Trade-off: persistence is friendlier but obscures the new hero presentation on subsequent visits.
4. Should the headline-event picker bias toward security-relevant events (admin grants) even in non-admin streams? Drafted: no — each stream's headline stays within its stream. Trade-off: a single "most-important event of the period" call-out could be more compelling than four parallel ones.

## Success criteria

- Single sidebar entry, single route, single coherent story above the fold.
- Top fold (KPI strip + chart top) renders in under 1 second on 2026-05-14 backfilled data.
- Every drill-down card's "See all →" lands the user in a filtered directory table without losing context.
- All Phase 3/4 functionality (file activity, side-panel drill-down, per-user activity body) survives the migration with zero regression — verified by manual UAT against the existing `/users` page first.
- An executive opening the page for the first time can describe the top three takeaways within 30 seconds.
