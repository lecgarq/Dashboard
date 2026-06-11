# Activity by Role donut — design

**Date:** 2026-06-11
**Branch:** `feat/access-analysis-redesign`
**Surface:** `/access-analysis`

## Goal

Add a third donut to the Access Analysis page: **Activity by role**. Each slice is
a role, sized by the total volume of activity performed by users holding that role,
summed across all projects. Clicking a role reveals the users behind it ("from whom
the activity came"). This answers: *which roles are the most active across ACC?*

It complements the two existing donuts:

- **Role distribution** — roles sized by *membership count* (how many hold each role).
- **Activity by module** — activity sized by *ACC module*.

The new donut is the missing cross: roles sized by *activity volume*. Placing the
three together reads as a story — how many hold each role → how much each role
actually does → which modules that work lands in.

## Confirmed product decisions

- **Slice size = total activity count** (raw number of activities by users in that
  role). Same unit as the module donut. (Not distinct-active-user count.)
- **Drill-down = the users behind the role**: each person with that role, their
  activity count, and their share of the role, sorted high→low. No profile
  click-through (kept simple; the AuthorProfileDrawer wiring is out of scope).
- **Multi-role and roleless activity** reuse the existing donut's warning buckets,
  for direct comparability with Role distribution.

## Data model & attribution

Role is a **per-project** concept in ACC: a user may be "BIM Manager" on one
project and "Viewer" on another. So each project's activity is attributed to the
role that user held *on that project*, then summed per role across projects.
"Across all projects" means we aggregate per-project attributions — not that we
pick one global role per person.

### The join

```
AccActivity (userEmail, projectId, count)
   └─ key (email::projectId) ─→ membership roles  (from the instance view)
                                  └─ 0 roles  → "Unknown"        (amber warning)
                                  └─ 1 role   → that role        (a real slice)
                                  └─ >1 roles → "Multiple roles" (rose warning)
```

- `AccActivity.userEmail` is stored lowercased; the instance view email is also
  lowercased — keys align.
- **Scope: project activity only.** Account-level / unattributed activity
  (`projectId` empty or `userEmail` null) has no project membership and therefore
  no role, so it is excluded. The donut subtitle states this so the total is honest.

### Measured prevalence (live DB, 2026-06-11)

Attributable project activity ≈ 656,944 actions:

| Bucket | Activities | Share |
|---|---|---|
| Single role | 607,346 | 92.4% |
| Unknown (no role on that project) | 28,356 | 4.3% |
| Multiple roles | 21,242 | 3.2% |

Memberships: 16,855 of 17,189 (98.1%) hold exactly one role. Multi-role is a rare
edge case, so the "Multiple roles" bucket will not distort the volume donut. The
two warning buckets are identical in name/color to the Role distribution donut,
keeping the two role donuts visually comparable.

## Components & data flow

All four units mirror existing siblings; none introduces a new pattern.

### 1. `lib/server/activityByActorView.ts` (new)

One cached query (5-min TTL, like `moduleActivityView`):

```ts
db.accActivity.groupBy({
  by: ["projectId", "userEmail"],
  _count: { id: true },
  where: { projectId: { not: "" }, userEmail: { not: null } },
})
```

Joins `AccDcUser` (email → name) for the drill-down label. Yields ~2,700 compact
rows:

```ts
interface ActivityActorRow {
  projectId: string;
  projectName: string;
  userEmail: string;   // lowercased
  userName: string;    // from AccDcUser, falls back to email
  count: number;       // activities by this actor in this project
}
```

Performance parity with the module donut: the `(projectId, userEmail)` groupBy has
no dedicated composite index, same as the existing `(projectId, rawAction)` groupBy
(~218 ms over ~1M rows). Account-level/null rows are filtered in SQL.

### 2. `app/(dashboard)/access-analysis/roleActivityCounts.ts` (new, pure)

No React/DOM/IO. Reuses `roleCounts.ts` for the `RoleSlice` type and the
`UNKNOWN_ROLE` / `MULTIPLE_ROLES` constants and `collapseToTopSlices` helper.

```ts
interface RoleActivityUser { email: string; name: string; count: number; }

interface RoleActivitySummary {
  slices: RoleSlice[];                          // role → activity volume, desc; incl. Unknown + Multiple roles
  total: number;                                // sum of slice values (activities in scope)
  distinctRoles: number;                        // unique single-role names credited
  usersByRole: Map<string, RoleActivityUser[]>; // label → contributing users, desc
}

function summarizeActivityByRole(
  activity: ReadonlyArray<{ projectId: string; userEmail: string; userName: string; count: number }>,
  memberships: ReadonlyArray<{ projectId: string; email: string; roles: string[] }>,
): RoleActivitySummary;
```

Bucketing, per activity actor row:

1. `roles = membershipRoles.get(`${email}::${projectId}`) ?? []` (deduped).
2. `label = 0 → UNKNOWN_ROLE · 1 → roles[0] · >1 → MULTIPLE_ROLES`.
3. Add `count` to `slices[label]`; merge the actor into `usersByRole[label]` by
   email (summing counts if the same person appears via multiple projects).
4. `distinctRoles` counts unique single-role names.

Slice values sum to `total`, so donut percentages add to 100%.

### 3. `components/ActivityByRolePieChart.tsx` (new, client)

A donut modeled on `RolesPieChart` (rotating palette + amber `Unknown` / rose
`Multiple roles` warning colors, Top-N slider + "Others (k roles)" fold +
hide-toggle, theme-aware ECharts colors via `useTheme`) **plus** the
`ModulesPieChart` drill-down: clicking a role slice or its legend row opens an
expandable list of `usersByRole[label]` — `name · count · share`, sorted desc.
Empty state mirrors the others ("No activity found · Select at least one project").

### 4. Wiring

- **`page.tsx`**: add `loadActivityByActor()` to the existing `Promise.all`; derive
  a slim membership row from the instance `view` it *already loads* (no extra DB
  hit) — `{ projectId, email: v.email, roles: v.roles }`. Pass both new arrays to
  `AccessAnalysisCharts`.
- **`AccessAnalysisCharts.tsx`**: accept `activityActorRows` + `membershipRows`;
  `useMemo` → `summarizeActivityByRole(filterRowsBySelection(activityActorRows,
  selected), filterRowsBySelection(membershipRows, selected))`; render a new
  `<section>` titled **"Activity by role"** between Role distribution and Activity
  by module. `filterRowsBySelection` is already generic over `{ projectId }`, so it
  filters both arrays unchanged.

## Testing

- `__tests__/roleActivityCounts.test.ts` (new): single-role attribution;
  multi-role → Multiple roles; no membership / no role → Unknown; same role summed
  across two projects; `usersByRole` merges one person across projects; empty
  input; slice values sum to total.
- `__tests__/ActivityByRolePieChart.test.tsx` (new): renders slices, opens a
  drill-down on click, shows the empty state. Mirrors `RolesPieChart.test.tsx`.
- Update `AccessAnalysisCharts.test.tsx` / `page.test.tsx` only if they assert the
  panel set (add the new section; pass the new props).

## Out of scope (YAGNI)

- Account-level / unattributed activity attribution.
- Profile drawer click-through from the drill-down.
- Date-range / time filtering (the page has none today).
- Any change to the existing two donuts.
