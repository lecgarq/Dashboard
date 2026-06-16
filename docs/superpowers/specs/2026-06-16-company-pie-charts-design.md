# Company pie charts (Users + Activity) — design

**Date:** 2026-06-16
**Branch:** `feat/access-analysis-redesign`
**Surface:** `/access-analysis`

## Goal

Add two donuts to the Access Analysis page, both sliced by **company** (the user's
employer/organization as recorded in ACC):

1. **Users by company** — companies sized by *membership count* (how many
   user–project seats belong to each company). Answers: *which companies hold
   access across our projects?* Mirrors the existing **Role distribution** donut.
2. **Activity by company** — companies sized by *activity volume* (how much work
   the people from each company performed, summed across projects). Clicking a
   company drills into the people behind it. Answers: *which companies actually do
   the work?* Mirrors the existing **Activity by role** donut.

Together with the existing donuts they extend the page's story — role composition
and module activity now gain a *company* lens on both access and activity.

## Confirmed product decisions

- **Users by company unit = memberships (project seats)**, not distinct people.
  Consistent with the Role distribution donut and the "Memberships" KPI. A person
  on 10 projects counts 10 times.
- **No internal/external toggle.** Hermosillo (the internal company, ~64% of
  memberships) is shown like any other slice; the existing **Top-N slider** folds
  the long tail of ~366 small companies into "Others (k companies)". This keeps both
  donuts identical in interaction to their siblings.
- **Activity by company drills into people** (name · count · share, busiest first),
  each clickable to open the shared `AuthorProfileDrawer` — same as Activity by role.
- **Users by company does NOT drill into people** — it mirrors Role distribution,
  which has no people drill-down. (Activity by company already provides the
  "who from this company" view.)
- **No company → "Unknown company"** slice (amber warning color), mirroring the
  "Unknown" role bucket. There is **no "Multiple companies"** bucket: a membership
  carries exactly one company.

## Data model & attribution

`company` is a **per-(project, user)** attribute, already resolved on every row of
the instance view (`AccessInstance.company`) from
`AccDcProjectUserCompany` → `AccDcCompany`. No new DB query and no new ingestion:
the page already loads this data and currently discards the field when slimming
rows. We stop discarding it.

### Users by company

Each membership row (one per user–project) buckets by its single `company`:

```
membership.company
   └─ null / "" → "Unknown company"   (amber warning)
   └─ name      → that company         (a real slice)
```

### Activity by company

Same join shape as Activity by role, swapping the role lookup for a company lookup:

```
activity (userEmail, projectId, count)
   └─ key (email::projectId) ─→ membership company  (from the instance view)
                                  └─ no company → "Unknown company" (amber warning)
                                  └─ a company  → that company       (a real slice)
```

Activity is attributed to the company the actor was tagged with **on that
project**, then summed per company across projects. Scope = project activity only
(account-level / unattributed rows have no membership, hence no company), identical
to the Activity-by-role donut.

### Measured prevalence (live DB, 2026-06-16, read-only check)

| Metric | Value |
|---|---|
| Memberships total | 22,835 |
| ...with a resolvable company name | 18,329 (**80.3%**) |
| ...with no company → "Unknown company" | 4,506 (19.7%) |
| Distinct company names | 374 |
| Hermosillo (internal) | 14,605 memberships (**~64%**) |
| Long tail | Global Mechanical (174), Estructure (174), MM-Engineers (141), PICSA (128), PROLOGIS (99)… |

80% coverage and a 374-deep company tail make both donuts meaningful. Hermosillo's
dominance is handled honestly by the Top-N fold (it stays as the largest slice; the
tail collapses into "Others").

## Components & data flow

All units mirror existing siblings; none introduces a new pattern.

### 1. `app/(dashboard)/access-analysis/companyCounts.ts` (new, pure)

Mirror of `roleCounts.ts`. No React/DOM/IO.

```ts
interface CompanySummary {
  slices: RoleSlice[];      // company → membership count, desc; incl. "Unknown company"
  distinctCompanies: number; // unique real company names (excludes "Unknown company")
  total: number;            // sum of slice values = membership total
}

const UNKNOWN_COMPANY = "Unknown company";

function summarizeCompanies(
  rows: ReadonlyArray<{ company: string | null }>,
): CompanySummary;

// Company-specific Top-N fold: pins only UNKNOWN_COMPANY, folds the rest into
// "Others (k companies)". Kept here rather than generalizing the shared
// collapseToTopSlices, so the two live role donuts are untouched.
function collapseCompanySlices(slices: RoleSlice[], topN: number): RoleSlice[];
```

Bucketing: `label = company?.trim() || UNKNOWN_COMPANY`; tally per label;
`distinctCompanies` counts labels other than `UNKNOWN_COMPANY`. Reuses the
`RoleSlice` type from `roleCounts.ts`.

### 2. `app/(dashboard)/access-analysis/companyActivityCounts.ts` (new, pure)

Mirror of `roleActivityCounts.ts`. No React/DOM/IO.

```ts
interface CompanyActivityUser { email: string; name: string; count: number; }

interface CompanyActivitySummary {
  slices: RoleSlice[];                              // company → activity volume, desc; incl. "Unknown company"
  total: number;                                    // sum of slice values
  distinctCompanies: number;                        // unique real company names credited
  usersByCompany: Map<string, CompanyActivityUser[]>; // label → contributing users, desc
}

function summarizeActivityByCompany(
  activity: ReadonlyArray<{ projectId: string; userEmail: string; userName: string; count: number }>,
  memberships: ReadonlyArray<{ projectId: string; email: string; company: string | null }>,
): CompanyActivitySummary;
```

Per activity row: look up the actor's company by `email::projectId`; `label =
company?.trim() || UNKNOWN_COMPANY`; add `count` to that slice; merge the actor
into `usersByCompany[label]` by email (summing counts when a person spans
projects). Slice values sum to `total`.

### 3. `components/CompaniesPieChart.tsx` (new, client)

Copy of `RolesPieChart.tsx`: rotating palette + amber "Unknown company" warning
color, Top-N slider + "Others (k companies)" fold + hide-toggle, theme-aware
ECharts colors via `useTheme`, ranked legend with proportion bars. Labels say
"companies"/"memberships" instead of "roles"/"users". No people drill-down (matches
its sibling). Empty state: "No company data found · Select at least one project".

### 4. `components/CompaniesActivityPieChart.tsx` (new, client)

Copy of `ActivityByRolePieChart.tsx`: same Top-N controls + palette, **plus** the
click-to-drill-into-people list (`usersByCompany[label]` — name · count · share,
desc) with `onUserClick` opening the shared `AuthorProfileDrawer`. Single warning
bucket "Unknown company" (no "Multiple" bucket).

### 5. Wiring

- **`page.tsx`**: keep `company` when slimming the instance view —
  - membership rows for the roles/companies donuts gain `company: v.company`;
  - activity-attribution membership rows gain `company: v.company`.
  No new `loadX()` call; both new donuts ride on data already loaded.
- **`projectFilter.ts`**: add `company: string | null` to `ProjectRoleRow` (the
  per-membership row). The Role donut ignores the extra field; the Company donut
  reads it. `filterRowsBySelection` is already generic over `{ projectId }`.
- **`roleActivityCounts.ts` / `MembershipRolesInput`**: add `company: string | null`
  so the same membership array feeds both the role and company activity aggregators.
  Activity-by-role ignores `company`.
- **`AccessAnalysisCharts.tsx`**:
  - `useMemo` → `summarizeCompanies(filterRowsBySelection(roleRows, selected))` and
    `summarizeActivityByCompany(filterRowsBySelection(activityActorRows, selected),
    filterRowsBySelection(membershipRows, selected))`.
  - Render **"Users by company"** `<section>` immediately after **Role
    distribution**, and **"Activity by company"** immediately after **Activity by
    role**.
  - Add a **"Companies"** KPI tile (`companySummary.distinctCompanies`) to the
    `StatStrip`.

## Testing

- `__tests__/companyCounts.test.ts` (new): single-company tally; null/blank →
  "Unknown company"; `distinctCompanies` excludes Unknown; `collapseCompanySlices`
  pins Unknown and folds the rest into "Others (k companies)"; slice values sum to
  total; empty input.
- `__tests__/companyActivityCounts.test.ts` (new): company attribution by
  `email::projectId`; no membership / no company → "Unknown company"; same company
  summed across two projects; `usersByCompany` merges one person across projects;
  empty input; slices sum to total.
- `__tests__/CompaniesPieChart.test.tsx` (new): renders slices, Top-N fold, empty
  state. Mirrors `RolesPieChart.test.tsx`.
- `__tests__/CompaniesActivityPieChart.test.tsx` (new): renders slices, opens a
  people drill-down on click, fires `onUserClick`, empty state. Mirrors
  `ActivityByRolePieChart.test.tsx`.
- Update `AccessAnalysisCharts.test.tsx` / `page.test.tsx` only where they assert
  the panel set or KPI tiles (add the two sections, the Companies KPI, and the new
  props).

## Out of scope (YAGNI)

- Internal/external (Hermosillo) toggle or any company exclusion.
- Distinct-people unit for Users by company (memberships chosen).
- People drill-down on the Users-by-company donut.
- Any new DB query, index, or ingestion change.
- Any change to the existing Role / Activity-by-role / module donuts.
- Date-range / time filtering (the page has none today).
