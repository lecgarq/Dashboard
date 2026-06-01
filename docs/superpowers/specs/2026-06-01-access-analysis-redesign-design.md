# Access Analysis — Ground-Up Redesign (Design Spec)

- **Date:** 2026-06-01
- **Route:** `/access-analysis`
- **Branch:** `feat/access-analysis-redesign`
- **Status:** Design approved in brainstorming; awaiting written-spec review before planning.

> **Source decision (2026-06-01):** Canonical source = the **DC snapshot** (`AccDcProjectUser`
> + normalized product/role/company tables), chosen for broader coverage (428 projects vs the live
> table's 300) and clean SQL aggregation. Supersedes an earlier draft that used `AccProjectMember`.

---

## 1. Goal

Delete the current `/access-analysis` experience (cosmos.gl WebGL graph + DuckDB-in-browser
+ Mosaic + dimension/slider system, ~100 files) and rebuild a fast, conventional analytics
dashboard. The page reads top-down: headline counts → composition → modules → risk → rankings →
trends → drill-down table. It must feel instant, always reflect the latest daily sync, and offer a
premium, minimalist interaction layer (filter / search / group / multi-select / expand-collapse).

**Non-goals:** No network/graph visualization. No in-browser SQL engine. No live streaming.

---

## 2. Stack & data flow (approved: "Approach A")

```
Prisma (server only)
  -> Server builds a cached denormalized "access instance" view (join of the DC snapshot tables)
    -> Server aggregation under the active filter set
      -> small typed JSON DTO  ({ category, value } shaped rows)
        -> TanStack Query (client cache, keyed on the active filter set)
          -> ECharts (charts)  +  TanStack Table (detail grid)
Zustand = single source of truth for the active filter set (UI intent)
Server Component prefetches the default (unfiltered) view -> instant first paint; client revalidates.
```

- **No new dependencies.** Already in `package.json`: `echarts` + `echarts-for-react`,
  `@tanstack/react-query`, `@tanstack/react-table` + `react-virtual`, `zustand`, `@visx/visx`,
  `lightweight-charts`, `framer-motion`, `radix-ui` (for accessible combobox/popover primitives).
- **Denormalized cache:** the canonical instance set is small (16,942 rows). The server joins
  `AccDcProjectUser` + `AccDcUser` (email) + `AccDcProjectUserProduct` (modules/admin) +
  `AccDcProjectUserRole` (roles) + `AccDcProjectUserCompany` (company) into one cached array,
  revalidated on ingest (or short TTL). All overview aggregations are JS reductions over that array
  under the active filter (sub-50ms). The detail table pages from the same array; activity trends
  query `AccActivity` directly. This keeps everything server-side with tiny client payloads.
- "Real-time / ultra fast" = **instant load + always fresh on open**, not live streaming.
- Browser-only chart renderers are imported via `next/dynamic` (`ssr: false`) from a Client wrapper.

---

## 3. Canonical data source & verified facts

**Source = the DC snapshot.** Tables: `AccDcProjectUser` (one row per user×project), joined to
`AccDcUser` (email/name), `AccDcProjectUserProduct` (per-module access level), `AccDcProjectUserRole`
(roles), `AccDcProjectUserCompany` (company), `AccDcProject` (project name). Verified 2026-06-01:

| Fact | Value | Notes |
|---|---|---|
| Access instances (`AccDcProjectUser`) | **16,942** | one row per (user, project) |
| Distinct projects covered | **428** | of 1,152 total; union ceiling = 550 |
| Email resolution (for internal/external) | **0 unresolved** | via `AccDcUser` join |
| Internal (`@hermosillo.com`) | **12,690 (74.9%)** | |
| External | **4,252 (25.1%)** | |
| Project-admin instances | **4,626** | has `project_admin` on ≥1 product |
| Companies (`AccDcProjectUserCompany`) | **319** | |
| Roles (`AccRole`) | **155** | account-wide baseline |
| Users (`AccDcUser`) | **3,367** | |

### Known data limitations (designed around, not hidden)

1. **No sign-in data anywhere** (`lastSignIn` null across all tables) → Active/Dormant chart and
   sign-in-based risk cards are **removed**.
2. **Engagement lives only in `AccActivity`** — 929,217 actions, 2025-09-23 → 2026-05-31, 1,209
   distinct active users (853/30d, 1,061/90d). Powers the Trends row only.
3. **Datum has 0 grants** in any source (entitlement exists, nobody enabled). Shown honestly as an
   empty bar — it's a real adoption insight.
4. **Coverage = 428 projects** (of 1,152). The other ~724 are locked behind Autodesk 403s and need
   an ACC **Account Admin** to unblock (external blocker). The "Projects" KPI is defined as
   *projects present in the access data*, with total shown as context.

---

## 4. Page layout (final)

```
┌─ STICKY FILTER BAR ─ Project · Company · Internal/External · Role · Module · Admin/Member · Date · [search] · [Clear all] ┐
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ ROW 1  COUNTS        Users · Projects · Access · Roles · Companies            (5 KPI tiles)     │
│ ROW 2  COMPOSITION   Internal/External (donut) · Permission mix Admin/Member (donut)           │
│ ROW 3  MODULE ACCESS All 9 modules, sorted by adoption, stacked Admin/Member (horizontal bars) │
│ ROW 4  RISK CARDS    External members · External project admins · Project admins · Pending      │
│ ROW 5  RANKINGS      Top projects by members · Members per role · Top companies (horizontal bars)│
│ ROW 6  TRENDS        Activity events / week (AccActivity) · Access added / month (addedOn)       │
│ ROW 7  DETAIL TABLE  Member rows + search/group/multi-select/expand + CSV export (TanStack Table)│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Premium interaction layer (minimalist, professional)

A first-class UX requirement, not an afterthought. Aesthetic: zinc dark palette (`#09090B`),
hairline borders, generous spacing, subtle `framer-motion` transitions, no chrome clutter.

- **Filtering:** each dimension (Project, Company, Role, Module, Internal/External, Admin/Member) is
  a compact, **searchable multi-select combobox** (Radix popover + input + checkbox list, virtualized
  for long lists like 428 projects / 319 companies). Selected values render as removable chips.
- **Global search:** one search box that fuzzy-matches across people, projects, and companies and
  narrows the whole page.
- **Cross-filter by click:** clicking a donut slice, module segment, or ranking bar adds that value
  to the same filter set.
- **Grouping (detail table):** group rows by Project / Company / Role / Module, with **expand /
  collapse** group headers showing per-group counts.
- **Multi-select (detail table):** row checkboxes + select-all; selection drives "Export selected"
  and a selection summary bar.
- **Expand/collapse:** group rows expand/collapse; the advanced filters and each chart card can
  collapse to keep the page calm.
- **State:** all interaction state in Zustand; everything is keyboard-accessible and debounced.

---

## 6. Cross-filter & state

- **Zustand store** holds: `{ projectId[], company[], internalExternal?, role[], module[],
  adminMember?, dateRange?, search? }` (multi-select arrays).
- Two ways to filter: the filter bar, and clicking chart elements. Active filters render as removable
  chips; **Clear all** resets the store.
- On any change, every TanStack Query re-keys (filter set is part of the key) and the server
  recomputes that section from the cached instance view under the filter.
- React Query owns server data; Zustand owns user intent.

---

## 7. Section-by-section spec

All aggregations run **server-side** over the cached denormalized instance view (§2), under the
active filters. Activity trends and CSV export query `AccActivity` / page the view directly.

### Row 1 — Counts (5 KPI tiles)
Users (distinct user) · Projects (distinct `projectId`; label "of 1,152") · Access (instance count) ·
Roles (distinct roles; baseline 155) · Companies (distinct company). All recompute under filters.

### Row 2 — Composition (2 donuts)
- **Internal vs External:** `AccDcUser.email` ends `@hermosillo.com` → Internal (12,690), else
  External (4,252).
- **Permission mix:** instance has `project_admin` on ≥1 product → Administrator (4,626), else Member
  (12,316). (Coarse by design — data distinguishes admin vs regular; the 5-rung folder-permission
  ladder is a future drill-down.)

### Row 3 — Module Access (stacked horizontal bars, sorted by adoption)
One bar per module (§8), stacked **Administrator** (`project_admin`) / **Member** (`project_user`),
sorted most-adopted → least. Empty modules (Datum) render as labeled empty bars. Clicking a segment
filters the page.

### Row 4 — Risk highlight cards (clickable → filter)
External members (4,252) · External project admins (external ∧ admin, computed) · Project admins
(4,626) · Pending memberships (`status = pending`). *(Sign-in-based cards removed — no data. Optional
future card: activity-based "no activity in 90d" from `AccActivity`.)*

### Row 5 — Rankings (horizontal bars, top-N)
Top projects by instance count · Members per role · Top companies by member count. Top ~15 with a
"show all" affordance.

### Row 6 — Trends (line/area)
- **Activity events / week:** `AccActivity` bucketed by `date_trunc('week', createdAt)`; joins the
  member filter by `userEmail` (+ `projectId` where present).
- **Access added / month:** `AccDcProjectUser.addedOn` bucketed by month.
- ECharts line default; `lightweight-charts` optional for a denser timeline.

### Row 7 — Detail table (TanStack Table)
Columns: name, email, project, role, Admin/Member, Internal/External, company, status, addedOn.
Search + per-column filter, grouping + expand/collapse, multi-select rows, virtualized, sortable,
filter-aware. **Export CSV** of the filtered set or the current selection.

---

## 8. The 9 modules (authoritative mapping — DC `productKey`)

Tiers `project_admin` / `project_user` (labeled Admin / Member). Real access counts verified
2026-06-01. Label map extends `lib/acc/modules.ts`; keys outside this set are hidden.

| # | Module (business name) | DC `productKey`(s) | With access | Admin | Member |
|---|---|---|--:|--:|--:|
| 1 | Data Management | `docs` | 13,689 | 4,615 | 9,074 |
| 2 | Insight | `insight` | 13,689 | 4,624 | 9,065 |
| 3 | Build | `build` | 8,814 | 3,238 | 5,576 |
| 4 | Model Coordination | `modelCoordination` | 2,128 | 1,758 | 370 |
| 5 | Design Collaboration | `designCollaboration` | 1,318 | 953 | 365 |
| 6 | Preconstruction (Forma Takeoff + Estimate) | `takeoff` ∪ `cost` | ~427 | ~325 | ~102 |
| 7 | Design (Forma Site Design) | `forma` | 115 | 113 | 2 |
| 8 | AutoSpecs | `autoSpecs` | 14 | 12 | 2 |
| 9 | Datum | `datum` | 0 | 0 | 0 |

Display order = by adoption (above). Instance counts a module if it has any mapped product row;
tier = Admin if any mapped product row is `project_admin`.

---

## 9. File structure (all new; old graph files deleted after import-check)

```
app/(dashboard)/access-analysis/
  page.tsx                      # Server Component: prefetch default view + HydrationBoundary
  AccessAnalysisDashboard.tsx   # Client shell: layout + QueryClient + Zustand provider
  store.ts                      # Zustand filter store (multi-select arrays)
  queries.ts                    # TanStack Query hooks + query-key factory
  filters.ts                    # pure: filter set -> predicate over the instance view (unit-tested)
  modules.ts                    # 9-module mapping + tier reducer (extends lib/acc/modules.ts)
  components/
    FilterBar.tsx  MultiSelectCombobox.tsx  ActiveFilterChips.tsx  GlobalSearch.tsx
    CountTiles.tsx  CompositionDonuts.tsx  ModuleAccessChart.tsx  RiskCards.tsx
    Rankings.tsx  Trends.tsx  DetailTable.tsx
    EChart.tsx                  # dynamic(ssr:false) ECharts wrapper
lib/server/
  accessInstanceView.ts         # builds + caches the denormalized instance array from DC tables
app/api/access-analysis/
  summary/route.ts              # counts + composition + modules + rankings + risk (filtered)
  trends/route.ts               # activity-by-week + access-added-by-month
  members/route.ts              # paged detail rows + CSV export
```

Reuse existing `chartColors.ts` tokens and the zinc dark-mode palette.

---

## 10. Performance

- Cached instance view (~17k rows) → all overview aggregations sub-50ms server-side.
- `AccActivity` (929k) trend query uses `date_trunc` GROUP BY; verify indexes on `(createdAt)` and
  `(userEmail)`.
- Detail table paged; CSV export streams the filtered set.
- Targets: first paint < 300ms; filter change < 100ms on localhost.

---

## 11. Testing

- **Unit (vitest):** `filters.ts` predicate, 9-module tier reducer, internal/external classifier
  (`@hermosillo.com`), instance-view join builder, CSV formatting, query-key factory.
- **E2E (Playwright, :3100, `NEXT_PUBLIC_ACC_GRAPH_TEST`):** page loads + counts render; donut click
  cross-filters every section + table; module segment click filters; combobox multi-select filters;
  table group expand/collapse; multi-select + CSV export; Clear-all resets.

---

## 12. Removal / migration plan (surgical)

1. Build the new dashboard alongside the old code.
2. Repoint `app/(dashboard)/access-analysis/page.tsx` to render the new dashboard.
3. For each old graph file under `app/(dashboard)/users/access-analysis/`, verify no other route
   (notably the `/users` profile panel) imports it **before** deleting. Delete only orphans; confirm
   with `knip`.
4. Stage commits by explicit path (this branch carries large pre-existing WIP); check
   `git diff --cached --name-only` before every commit.

---

## 13. Open items for spec review (your call)

1. **Projects KPI label** — "428 (with access data)" vs "1,152 (all)". Default: 428, total in tooltip.
2. **Risk cards** — confirm the 4 (External members, External admins, Project admins, Pending);
   optionally add an activity-based "no activity in 90d" card.
3. **Trends renderer** — ECharts line (default) vs `lightweight-charts`.
4. **Blend to 550 later?** — DC (428) ships first; add the 122 live-only projects as a follow-up if needed.
