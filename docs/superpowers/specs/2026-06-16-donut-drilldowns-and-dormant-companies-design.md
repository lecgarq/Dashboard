# Donut drill-downs + Dormant companies — design

**Date:** 2026-06-16
**Branch:** `feat/access-analysis-redesign`
**Surface:** `/access-analysis`

## Goal

Three changes to the Access Analysis donuts, driven by owner feedback:

1. **Move every drill-down out of the bottom of the section to a full-width panel
   directly above the legend** — so the detail appears near the donut, not after a
   long scroll past the company/role list. Applies to all five donuts (Role
   distribution, Users by company, Activity by role, Activity by company, Activity
   by module).
2. **Make Role distribution and Users by company collapsible** — click a role/company
   to reveal the people behind it (name · count · share, each click-through to the
   profile drawer), exactly like the two Activity donuts already do.
3. **Add a "Dormant companies" panel** — surface companies that never appear in the
   donuts because they have no users, or have users but no recorded activity.

## Confirmed decisions

- **Drill placement = a full-width panel directly above the legend** (between the
  controls and the ranked legend list). Chosen over a literal inline-under-the-row
  accordion because the legends are CSS multi-column; an in-row expansion would be
  trapped in one ~250px column. This panel placement honors the owner's wording
  ("right above the collapsible field, not at the bottom") and is layout-safe.
- **Click semantics on the membership donuts become click-to-drill.** Role
  distribution and Users by company currently use click-a-legend-row to *hide* that
  slice; that is replaced by click-to-drill so all five donuts behave identically.
  The Top-N slider still trims the long tail. (The hide/un-hide feature is dropped.)
- **Dormant companies panel is account-wide** — it reflects the full company roster
  and does NOT change when projects are ticked in the picker (unlike the donuts).
- **Tombstones filtered** — the ~17 Autodesk `"removed at <date> <uuid>"` deleted-
  company rows are excluded from the "No users" list.
- **The drill people-list is one shared component** reused by the four people-donuts,
  so the placement/markup is defined once. The module donut keeps its own
  (activity-type) drill content but moves to the same above-the-legend slot.

## Measured data (live DB, 2026-06-16, read-only)

- `AccDcCompany` roster: **431** names (431 distinct).
- Companies with ≥1 membership: **374** → **57 companies have zero users** (~40 real
  names + ~17 `"removed at…"` tombstones).
- Of the 374 with users, **~124 have zero recorded activity** (people assigned, no
  attributed actions). The Activity-by-company donut shows 238 companies with
  activity in the current selection; the dormant calc uses the account-wide sets.

## Change 1 — Drill placement + shared people-list

### `DrillPerson` type location

The shared person shape is defined ONCE in a pure module — `roleCounts.ts` (already
the shared base for `RoleSlice`, imported by `companyCounts.ts`):

```ts
export interface DrillPerson { email: string; name: string; count: number; }
```

The pure aggregators return `Map<string, DrillPerson[]>`; `PeopleDrillList` imports
the type from `roleCounts.ts`. This keeps the dependency direction correct (the
component depends on the pure module, never the reverse). The existing
`RoleActivityUser` / `CompanyActivityUser` (also `{ email; name; count }`) are
structurally identical, so the activity summaries' `usersByRole` / `usersByCompany`
satisfy `PeopleDrillList`'s `people` prop without changing their types.

### `components/PeopleDrillList.tsx` (new, client)

The ranked people list that all four people-donuts render when a slice is open.
Pure presentation; no data fetching. Imports `DrillPerson` from `../roleCounts`.

```ts
function PeopleDrillList(props: {
  title: string;             // the slice label, e.g. "Hermosillo"
  color: string;             // slice color for the header dot + bars
  people: DrillPerson[];     // already sorted desc
  total: number;             // slice value, for per-person share
  unitNoun: string;          // "activities" | "members" (singular handled internally)
  onUserClick?: (email: string) => void;
  onClose: () => void;
}): JSX.Element;
```

It renders the bordered panel currently duplicated at the bottom of the activity
donuts (header with color dot + "N people · M <unit>" + close button, then the
ranked rows with proportion bars, count, share, and optional profile click). This
is a straight extraction of the existing `activity-role-drilldown` markup,
parameterized by `unitNoun` and given a `title`/`color`.

### Placement change (all five donuts)

Each donut moves its `{drill && …}` block from **after** the legend `<ul>` to
**before** it (immediately under the Top-N controls), so the open detail is full
width and adjacent to the donut. The legend stays multi-column and unchanged.
Test ids are preserved (`activity-role-drilldown`, `activity-company-drilldown`,
`module-drilldown`, plus new `role-drilldown`, `company-drilldown`).

- Activity by role / Activity by company: swap their inline drill markup for
  `<PeopleDrillList unitNoun="activities" …>` and render it above the legend.
- Module: relocate its existing (activity-type) drill block above the legend; it
  keeps its own category-grouped content (not PeopleDrillList).

## Change 2 — Collapsible Role distribution & Users by company

### Data: people per slice

Both membership donuts need the people behind each slice. The instance view already
carries `name` and `email`; today's slim rows drop them. We thread them through and
aggregate.

- `projectFilter.ts`: `ProjectRoleRow` gains optional `name?: string` and
  `email?: string` (alongside the existing `company?`).
- `page.tsx`: include `name: v.name, email: v.email` when building `rows`.
- `roleCounts.ts`: `summarizeRoles` returns an added `usersByRole: Map<string,
  DrillPerson[]>`. Each membership contributes its person to the bucket it lands in
  (a single role, `Multiple roles`, or `Unknown`); a person spanning projects merges
  by email with `count` = number of memberships (seats). Input rows gain optional
  `name`/`email`; when absent the person list is simply empty (back-compat for
  existing callers/tests).
- `companyCounts.ts`: `summarizeCompanies` returns an added `usersByCompany:
  Map<string, DrillPerson[]>`, built the same way, keyed by company label (company
  name or `Unknown company`).

`DrillPerson.count` for the membership donuts = seat count (number of project
memberships the person holds in that role/company), so the per-person values sum to
the slice's membership total.

### Behavior

- `RolesPieChart` / `CompaniesPieChart`: a legend-row (or pie) click sets the open
  slice and renders `<PeopleDrillList unitNoun="members" people={usersByX.get(label)}
  …>` above the legend, with `onUserClick` wired to the page's profile drawer. The
  prior click-to-hide state (`hidden`/toggle/Reset/`*-metrics` "shown/hidden"
  counts) is removed. `data-testid` for the new panels: `role-drilldown`,
  `company-drilldown`. The donut center figure reverts to the plain slice total
  (no "users shown" variant, since hiding is gone).
- These two donuts gain `onUserClick?: (email: string) => void`, passed from
  `AccessAnalysisCharts` (same `setProfileEmail` the activity donuts use).

## Change 3 — Dormant companies panel

### `lib/server/companyRosterView.ts` (new)

`loadCompanyRoster(): Promise<string[]>` — distinct `AccDcCompany.name`, cached 5 min
(mirrors the other view loaders). Returns every roster name; tombstone filtering is
done in the pure function so it stays testable.

### `dormantCompanies.ts` (new, pure)

```ts
interface DormantSummary {
  noUsers: string[];                                  // roster names with 0 memberships, tombstones removed, sorted
  noActivity: Array<{ company: string; userCount: number }>; // have users, 0 activity, sorted by userCount desc
}

function summarizeDormantCompanies(
  roster: ReadonlyArray<string>,
  usersByCompany: ReadonlyMap<string, ReadonlyArray<{ email: string }>>, // account-wide, from summarizeCompanies(all)
  companiesWithActivity: ReadonlySet<string>,                            // account-wide, from summarizeActivityByCompany(all)
): DormantSummary;
```

- A name is a **tombstone** when it starts with `"removed at "` — excluded from
  `noUsers`.
- `companiesWithUsers` = keys of `usersByCompany` excluding `UNKNOWN_COMPANY`.
- `noUsers` = roster − companiesWithUsers (tombstones removed), sorted alphabetically.
- `noActivity` = companiesWithUsers − companiesWithActivity, each with `userCount =
  usersByCompany.get(name).length`, sorted by `userCount` desc then name.

### `components/DormantCompaniesPanel.tsx` (new, client)

A `panel-elevated` card with two tabs:
- **No users (N)** — chip/grid of company names (read-only).
- **No activity (N)** — list of `company · N users`.
Empty states per tab ("Every company has users." / "Every company with users is
active."). Tab state is local; default to whichever tab is non-empty (No activity
first if both have content). `data-testid`: `dormant-panel`, `dormant-tab-no-users`,
`dormant-tab-no-activity`.

### Wiring (`AccessAnalysisCharts.tsx`, `page.tsx`)

- `page.tsx`: add `loadCompanyRoster()` to the existing `Promise.all`; pass `roster`
  to `AccessAnalysisCharts`.
- `AccessAnalysisCharts.tsx`: compute **account-wide** (unfiltered) summaries once —
  `summarizeCompanies(roleRows)` and `summarizeActivityByCompany(activityActorRows,
  membershipRows)` over the *raw* props (memoized on the props, not on `selected`) —
  feed them to `summarizeDormantCompanies(roster, …)`, and render
  `<DormantCompaniesPanel>` after the Model Coordination section. The existing
  selection-filtered summaries that drive the donuts are unchanged.

## Components & data flow (summary)

New: `PeopleDrillList.tsx`, `DormantCompaniesPanel.tsx`, `dormantCompanies.ts`,
`lib/server/companyRosterView.ts`.
Modified: `roleCounts.ts`, `companyCounts.ts`, `projectFilter.ts`, `page.tsx`,
`RolesPieChart.tsx`, `CompaniesPieChart.tsx`, `ActivityByRolePieChart.tsx`,
`CompaniesActivityPieChart.tsx`, `ModulesPieChart.tsx`, `AccessAnalysisCharts.tsx`.

## Testing

- `roleCounts.test.ts` / `companyCounts.test.ts`: extend for `usersByRole` /
  `usersByCompany` — single bucket, merge across projects (seat counts sum to slice
  total), empty when name/email absent.
- `dormantCompanies.test.ts` (new): tombstone exclusion; noUsers = roster − users;
  noActivity with userCount + sort; empty roster / empty inputs.
- `PeopleDrillList.test.tsx` (new): renders ranked rows, fires `onUserClick`, close.
- `DormantCompaniesPanel.test.tsx` (new): two tabs, counts, switch, empty states.
- Update `RolesPieChart.test.tsx` / `CompaniesPieChart.test.tsx`: drill opens above
  the legend; click-to-hide assertions removed. Update the activity donut tests for
  the relocated (above-legend) drill if they assert ordering. Update
  `AccessAnalysisCharts.test.tsx` for the new props + Dormant panel presence.

## Out of scope (YAGNI)

- Literal inline-under-the-row accordion (would require converting every legend from
  CSS multi-column to grid; the above-legend panel meets the need).
- Project-filtering the Dormant panel (it is intentionally account-wide).
- Drilling into the dormant lists' members (read-only lists).
- Any new ingestion or schema change; `AccDcCompany` already holds the roster.
- Changing the donut aggregation math, palettes, or Top-N behavior.
