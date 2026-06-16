# Donut drill-downs + Dormant companies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every Access-Analysis donut's drill-down to a full-width panel above the legend, make the Role-distribution and Users-by-company donuts drill into their people (replacing click-to-hide), and add an account-wide "Dormant companies" panel.

**Architecture:** Five donuts share one extracted `PeopleDrillList` component rendered immediately above each legend. The two membership donuts gain a per-slice people map (`usersByRole` / `usersByCompany`) computed in the existing pure aggregators, mirroring the activity donuts that already do this. A new pure `summarizeDormantCompanies` diff's the full `AccDcCompany` roster against the companies that have users/activity, surfaced by a new `DormantCompaniesPanel`. No schema or ingestion changes.

**Tech Stack:** Next.js (App Router) client components, React + ECharts (`echarts-for-react`), TypeScript, Vitest + Testing Library (`@vitest-environment jsdom`), Prisma (`AccDcCompany`).

**Source spec:** `docs/superpowers/specs/2026-06-16-donut-drilldowns-and-dormant-companies-design.md`

**Conventions for every task:**
- Run a single test file by substring, e.g. `npx vitest run roleCounts.test` (avoids quoting the `(dashboard)` path on Windows).
- The full type gate is `npx tsc --noEmit`; the full unit suite is `npm test`. Both run in the final task.
- Commit after each task with the shown message. Stage only the listed paths (this branch carries unrelated WIP — never `git add -A`/`.`; verify `git diff --cached --name-only` before committing).

---

### Task 1: `DrillPerson` type + `usersByRole` on `summarizeRoles`

**Files:**
- Modify: `app/(dashboard)/access-analysis/roleCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/roleCounts.test.ts`

- [ ] **Step 1: Update the empty-summary test and add new `usersByRole` tests**

In `roleCounts.test.ts`, replace the existing empty-summary assertion (line 13) so it expects the new map, and append three new tests inside the `describe("summarizeRoles", …)` block.

Replace:

```ts
  it("returns an empty summary for no rows", () => {
    expect(summarizeRoles([])).toEqual({ slices: [], distinctRoles: 0, total: 0 });
  });
```

with:

```ts
  it("returns an empty summary for no rows", () => {
    expect(summarizeRoles([])).toEqual({ slices: [], distinctRoles: 0, total: 0, usersByRole: new Map() });
  });
```

Then add these tests just before the closing `});` of the `describe("summarizeRoles", …)` block:

```ts
  it("collects the people behind each role bucket (seat count per person)", () => {
    const s = summarizeRoles([
      { roles: ["Member"], name: "Ana", email: "ana@x.com" },
      { roles: ["Member"], name: "Ana", email: "ana@x.com" }, // same person, 2nd seat
      { roles: ["Member"], name: "Bo", email: "bo@x.com" },
      { roles: ["Admin", "Member"], name: "Cy", email: "cy@x.com" }, // -> Multiple roles
      { roles: [], name: "Di", email: "di@x.com" }, // -> Unknown
    ]);
    expect(s.usersByRole.get("Member")).toEqual([
      { email: "ana@x.com", name: "Ana", count: 2 },
      { email: "bo@x.com", name: "Bo", count: 1 },
    ]);
    expect(s.usersByRole.get("Multiple roles")).toEqual([{ email: "cy@x.com", name: "Cy", count: 1 }]);
    expect(s.usersByRole.get("Unknown")).toEqual([{ email: "di@x.com", name: "Di", count: 1 }]);
    // Seat counts sum to the slice value.
    const memberSeats = s.usersByRole.get("Member")!.reduce((n, p) => n + p.count, 0);
    expect(memberSeats).toBe(s.slices.find((x) => x.name === "Member")!.value);
  });

  it("leaves the people list empty when rows carry no email (back-compat)", () => {
    const s = summarizeRoles([{ roles: ["Member"] }, { roles: ["Member"] }]);
    expect(s.slices).toEqual([{ name: "Member", value: 2 }]);
    expect(s.usersByRole.size).toBe(0);
  });

  it("falls back to the email as the display name when name is absent", () => {
    const s = summarizeRoles([{ roles: ["Member"], email: "noname@x.com" }]);
    expect(s.usersByRole.get("Member")).toEqual([{ email: "noname@x.com", name: "noname@x.com", count: 1 }]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run roleCounts.test`
Expected: FAIL — `usersByRole` is undefined on the result (the empty-summary `toEqual` and the three new tests all fail).

- [ ] **Step 3: Add the `DrillPerson` type, extend `RoleSummary`, and populate `usersByRole`**

In `roleCounts.ts`, add the shared type at the very top of the file (above `RoleSlice`):

```ts
/** One contributing person within a drilled slice. Shared by every people-donut. */
export interface DrillPerson {
  email: string;
  name: string;
  count: number;
}
```

Add the map to `RoleSummary` (after the existing `total` field):

```ts
export interface RoleSummary {
  /** Unknown + "Multiple roles" + one entry per single role, sorted by count desc. */
  slices: RoleSlice[];
  /** Count of distinct role names across all memberships (the "how many roles" answer). */
  distinctRoles: number;
  /** Total number of (user, project) memberships. */
  total: number;
  /** Slice label -> the people in that bucket (merged across memberships), sorted by seat count desc. */
  usersByRole: Map<string, DrillPerson[]>;
}
```

Replace the whole `summarizeRoles` function body with the version that also aggregates people:

```ts
export function summarizeRoles(
  rows: ReadonlyArray<{ roles: string[]; name?: string; email?: string }>,
): RoleSummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged person), so one person spanning memberships collapses.
  const usersAgg = new Map<string, Map<string, DrillPerson>>();
  for (const row of rows) {
    const uniqueRoles = [...new Set(row.roles)];
    for (const r of uniqueRoles) distinct.add(r);
    const label =
      uniqueRoles.length === 0 ? UNKNOWN_ROLE
        : uniqueRoles.length === 1 ? uniqueRoles[0]
          : MULTIPLE_ROLES;
    counts.set(label, (counts.get(label) ?? 0) + 1);

    // Attribute the seat to its person. No email -> not attributable, so it stays
    // out of the drill list (slice value still counts the membership).
    if (row.email) {
      const byEmail = usersAgg.get(label) ?? usersAgg.set(label, new Map()).get(label)!;
      const cur = byEmail.get(row.email);
      if (cur) cur.count += 1;
      else byEmail.set(row.email, { email: row.email, name: row.name ?? row.email, count: 1 });
    }
  }
  const slices = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  const usersByRole = new Map<string, DrillPerson[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByRole.set(
      label,
      [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    );
  }
  return { slices, distinctRoles: distinct.size, total, usersByRole };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run roleCounts.test`
Expected: PASS (all `summarizeRoles` + `collapseToTopSlices` tests green).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/roleCounts.ts" "app/(dashboard)/access-analysis/__tests__/roleCounts.test.ts"
git commit -m "feat(access-analysis): add DrillPerson + usersByRole to summarizeRoles"
```

---

### Task 2: `usersByCompany` on `summarizeCompanies`

**Files:**
- Modify: `app/(dashboard)/access-analysis/companyCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts`

- [ ] **Step 1: Update the empty-summary test and add `usersByCompany` tests**

In `companyCounts.test.ts`, replace the empty-summary assertion (line 6):

```ts
  it("returns an empty summary for no rows", () => {
    expect(summarizeCompanies([])).toEqual({ slices: [], distinctCompanies: 0, total: 0, usersByCompany: new Map() });
  });
```

Add these tests just before the closing `});` of the `describe("summarizeCompanies", …)` block:

```ts
  it("collects the people behind each company bucket (seat count per person)", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo", name: "Ana", email: "ana@x.com" },
      { company: "Hermosillo", name: "Ana", email: "ana@x.com" }, // same person, 2nd seat
      { company: "Hermosillo", name: "Bo", email: "bo@x.com" },
      { company: null, name: "Di", email: "di@x.com" }, // -> Unknown company
    ]);
    expect(s.usersByCompany.get("Hermosillo")).toEqual([
      { email: "ana@x.com", name: "Ana", count: 2 },
      { email: "bo@x.com", name: "Bo", count: 1 },
    ]);
    expect(s.usersByCompany.get(UNKNOWN_COMPANY)).toEqual([{ email: "di@x.com", name: "Di", count: 1 }]);
    const seats = s.usersByCompany.get("Hermosillo")!.reduce((n, p) => n + p.count, 0);
    expect(seats).toBe(s.slices.find((x) => x.name === "Hermosillo")!.value);
  });

  it("leaves the people list empty when rows carry no email (back-compat)", () => {
    const s = summarizeCompanies([{ company: "Hermosillo" }, { company: "Hermosillo" }]);
    expect(s.slices).toEqual([{ name: "Hermosillo", value: 2 }]);
    expect(s.usersByCompany.size).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run companyCounts.test`
Expected: FAIL — `usersByCompany` is undefined on the result.

- [ ] **Step 3: Extend `CompanySummary` and populate `usersByCompany`**

In `companyCounts.ts`, add `DrillPerson` to the existing import line:

```ts
import type { RoleSlice, DrillPerson } from "./roleCounts";
```

Add the map to `CompanySummary` (after the existing `total` field):

```ts
export interface CompanySummary {
  /** Company -> membership count, desc; includes the "Unknown company" bucket. */
  slices: RoleSlice[];
  /** Count of distinct real company names (excludes "Unknown company"). */
  distinctCompanies: number;
  /** Total number of (user, project) memberships. */
  total: number;
  /** Company label -> the people in that bucket (merged across memberships), sorted by seat count desc. */
  usersByCompany: Map<string, DrillPerson[]>;
}
```

Replace the whole `summarizeCompanies` function body:

```ts
export function summarizeCompanies(
  rows: ReadonlyArray<{ company?: string | null; name?: string; email?: string }>,
): CompanySummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged person), so one person spanning memberships collapses.
  const usersAgg = new Map<string, Map<string, DrillPerson>>();
  for (const row of rows) {
    const label = labelFor(row.company);
    if (label !== UNKNOWN_COMPANY) distinct.add(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);

    if (row.email) {
      const byEmail = usersAgg.get(label) ?? usersAgg.set(label, new Map()).get(label)!;
      const cur = byEmail.get(row.email);
      if (cur) cur.count += 1;
      else byEmail.set(row.email, { email: row.email, name: row.name ?? row.email, count: 1 });
    }
  }
  const slices = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  const usersByCompany = new Map<string, DrillPerson[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByCompany.set(
      label,
      [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    );
  }
  return { slices, distinctCompanies: distinct.size, total, usersByCompany };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run companyCounts.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/companyCounts.ts" "app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts"
git commit -m "feat(access-analysis): add usersByCompany to summarizeCompanies"
```

---

### Task 3: Thread `name`/`email` through `ProjectRoleRow` → `page.tsx`

This carries each membership's person into the membership donuts so their new drill lists can populate. Pure plumbing — no behavior change yet.

**Files:**
- Modify: `app/(dashboard)/access-analysis/projectFilter.ts:10-16`
- Modify: `app/(dashboard)/access-analysis/page.tsx:39-44`

- [ ] **Step 1: Add optional `name`/`email` to `ProjectRoleRow`**

In `projectFilter.ts`, extend the interface:

```ts
export interface ProjectRoleRow {
  projectId: string;
  projectName: string;
  roles: string[];
  /** The member's company on this project (null/blank → "Unknown company"); drives the Users-by-company donut. */
  company?: string | null;
  /** The member's display name; drives the membership-donut people drill-downs. */
  name?: string;
  /** The member's lowercased email; the drill-down's profile-drawer key + merge key. */
  email?: string;
}
```

- [ ] **Step 2: Thread the fields in `page.tsx`**

In `page.tsx`, update the `rows` map (lines 39-44) to include `name` and `email`:

```ts
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
    company: v.company,
    name: v.name,
    email: v.email,
  }));
```

(`v.name` and `v.email` already exist on every `AccessInstance` — see `lib/server/accessInstanceView.ts:73-74`.)

- [ ] **Step 3: Verify types + existing tests still pass**

Run: `npx vitest run projectFilter.test`
Expected: PASS (the existing project-picker tests are unaffected by the optional fields).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/access-analysis/projectFilter.ts" "app/(dashboard)/access-analysis/page.tsx"
git commit -m "feat(access-analysis): thread member name/email into ProjectRoleRow"
```

---

### Task 4: Shared `PeopleDrillList` component

Extract the people-drill panel currently duplicated in the two activity donuts into one component, parameterized by `unitNoun`/`title`/`color`/`testId`.

**Files:**
- Create: `app/(dashboard)/access-analysis/components/PeopleDrillList.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/PeopleDrillList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/PeopleDrillList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { PeopleDrillList } from "../components/PeopleDrillList";

const people = [
  { email: "ana@x.com", name: "Ana", count: 70 },
  { email: "al@x.com", name: "Al", count: 30 },
];

describe("PeopleDrillList", () => {
  it("renders the header, ranked rows, and the unit noun", () => {
    const { getByTestId } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onClose={() => {}} />,
    );
    const panel = getByTestId("role-drilldown");
    expect(panel.textContent).toContain("Hermosillo");
    expect(panel.textContent).toContain("2 people");
    expect(panel.textContent).toContain("100 members");
    expect(panel.textContent).toContain("Ana");
    expect(panel.textContent).toContain("Al");
    expect(panel.textContent).toContain("70");
  });

  it("fires onUserClick with the person's email when a row is clicked", () => {
    const onUserClick = vi.fn();
    const { getByTestId } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onUserClick={onUserClick} onClose={() => {}} />,
    );
    fireEvent.click(within(getByTestId("role-drilldown")).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });

  it("does not make rows clickable when onUserClick is absent", () => {
    const { getByTestId } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onClose={() => {}} />,
    );
    expect(within(getByTestId("role-drilldown")).getByRole("button", { name: /Ana/ })).toBeDisabled();
  });

  it("fires onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <PeopleDrillList testId="role-drilldown" title="Hermosillo" color="#6366f1" people={people} total={100} unitNoun="members" onClose={onClose} />,
    );
    fireEvent.click(getByLabelText(/close breakdown/i));
    expect(onClose).toHaveBeenCalled();
  });

  it("uses singular 'person' for a single contributor", () => {
    const { getByTestId } = render(
      <PeopleDrillList testId="x" title="Solo" color="#000" people={[people[0]]} total={70} unitNoun="activities" onClose={() => {}} />,
    );
    expect(getByTestId("x").textContent).toContain("1 person");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run PeopleDrillList.test`
Expected: FAIL — `Cannot find module '../components/PeopleDrillList'`.

- [ ] **Step 3: Create the component**

Create `app/(dashboard)/access-analysis/components/PeopleDrillList.tsx`:

```tsx
"use client";
import type { DrillPerson } from "../roleCounts";

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/**
 * The ranked "people behind a slice" panel shared by all four people-donuts
 * (Role distribution, Users by company, Activity by role, Activity by company).
 * Pure presentation: the donut owns open/close state and passes the already-sorted
 * people for the open slice. Each row is a proportion bar + name + count + share,
 * optionally clickable through to the profile drawer. Rendered immediately above
 * each donut's legend so the detail sits next to the donut, not after a long scroll.
 */
export function PeopleDrillList({
  title,
  color,
  people,
  total,
  unitNoun,
  onUserClick,
  onClose,
  testId,
}: {
  /** The slice label, e.g. "Hermosillo". */
  title: string;
  /** Slice color for the header dot + row bars. */
  color: string;
  /** Already sorted desc by count. */
  people: DrillPerson[];
  /** The slice value, used for each person's share. */
  total: number;
  /** "activities" | "members" — plural noun for the header total. */
  unitNoun: string;
  /** Open a person's profile (same drawer Model Coordination uses). */
  onUserClick?: (email: string) => void;
  onClose: () => void;
  /** Preserves each donut's existing drill-down test id (e.g. "activity-role-drilldown"). */
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden />
          {title}
          <span className="text-xs font-normal text-muted-foreground">
            {people.length} {people.length === 1 ? "person" : "people"} · {total.toLocaleString()} {unitNoun}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close breakdown"
          className="rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <ul className="max-h-80 list-none space-y-0.5 overflow-auto pr-1" style={{ columnWidth: "260px", columnGap: "1.5rem" }}>
        {people.map((u) => {
          const barPct = total > 0 ? (u.count / total) * 100 : 0;
          const clickable = !!(u.email && onUserClick);
          return (
            <li key={u.email} className="break-inside-avoid">
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onUserClick!(u.email)}
                title={clickable ? `View ${u.name}'s profile` : u.email}
                className={`group/u relative flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors ${
                  clickable ? "cursor-pointer hover:bg-accent" : "cursor-default"
                }`}
              >
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${barPct}%`, background: color, opacity: 0.12 }} />
                <span
                  className={`relative flex-1 truncate ${
                    clickable ? "text-foreground/90 group-hover/u:text-primary group-hover/u:underline underline-offset-2" : "text-foreground/85"
                  }`}
                >
                  {u.name}
                </span>
                <span className="relative shrink-0 tabular-nums text-foreground">{u.count.toLocaleString()}</span>
                <span className="relative w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(u.count, total)}</span>
                {clickable && (
                  <span aria-hidden className="relative shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/u:opacity-100">›</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run PeopleDrillList.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/PeopleDrillList.tsx" "app/(dashboard)/access-analysis/__tests__/PeopleDrillList.test.tsx"
git commit -m "feat(access-analysis): extract shared PeopleDrillList component"
```

---

### Task 5: Activity donuts use `PeopleDrillList`, rendered above the legend

Swap the inline drill markup in both activity donuts for `<PeopleDrillList>` and move it from below the legend to immediately above it. Test ids are preserved, so the existing tests stay green.

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx`
- Modify: `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx`

- [ ] **Step 1: `ActivityByRolePieChart` — add the import**

At the top, after the `EChart` import, add:

```ts
import { PeopleDrillList } from "./PeopleDrillList";
```

- [ ] **Step 2: `ActivityByRolePieChart` — insert the drill above the legend**

The variables `drillUsers` and `drillSlice` are already computed before `return` (currently lines 188-189) — keep them. Insert the panel between the "Show top" controls `</div>` and the legend `<ul data-testid="activity-role-legend" …>`. Add this block immediately before that `<ul>`:

```tsx
      {/* Drill-down: the people behind the selected role, busiest first — above the legend. */}
      {drill && drillSlice && (
        <PeopleDrillList
          testId="activity-role-drilldown"
          title={drill}
          color={colorFor(drill)}
          people={drillUsers}
          total={drillSlice.value}
          unitNoun="activities"
          onUserClick={onUserClick}
          onClose={() => setDrill(null)}
        />
      )}

```

- [ ] **Step 3: `ActivityByRolePieChart` — delete the old bottom drill block**

Delete the entire old block that starts with the comment `{/* Drill-down: the people behind the selected role, busiest first. */}` and the following `{drill && drillSlice && ( … )}` (the panel that previously rendered AFTER the legend, ending with its closing `)}` just before the component's final `</div>`). The file should now end with the legend `</ul>` followed by the component's closing `</div>` and `);`.

- [ ] **Step 4: `CompaniesActivityPieChart` — repeat the same three edits**

Add the import after `EChart`:

```ts
import { PeopleDrillList } from "./PeopleDrillList";
```

Insert immediately before `<ul data-testid="activity-company-legend" …>`:

```tsx
      {/* Drill-down: the people behind the selected company, busiest first — above the legend. */}
      {drill && drillSlice && (
        <PeopleDrillList
          testId="activity-company-drilldown"
          title={drill}
          color={colorFor(drill)}
          people={drillUsers}
          total={drillSlice.value}
          unitNoun="activities"
          onUserClick={onUserClick}
          onClose={() => setDrill(null)}
        />
      )}

```

Delete the old below-the-legend block beginning `{/* Drill-down: the people behind the selected company, busiest first. */}`.

- [ ] **Step 5: Run both donut tests**

Run: `npx vitest run ActivityByRolePieChart.test CompaniesActivityPieChart.test`
Expected: PASS — the drill-downs render the same names/counts under the same test ids; only their DOM position changed (the tests assert content, not order).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx" "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx"
git commit -m "refactor(access-analysis): activity donuts drill via shared PeopleDrillList above legend"
```

---

### Task 6: Module donut — move its drill above the legend

The module donut keeps its own category-grouped drill content; only its position changes.

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/ModulesPieChart.tsx`

- [ ] **Step 1: Cut the drill block and paste it above the legend**

Move the entire block `{/* Drill-down: every activity type that maps into the selected module. */}` + `{drill && drillSlice && ( … )}` (currently rendered after the `module-legend` `<ul>`) so it sits **between** the `<EChart … />` element and the `<ul data-testid="module-legend" …>`. The `drillTypes`/`drillSlice` consts before `return` stay put. After the edit the render order is: EChart → drill block → legend `<ul>` → `module-zero` block.

- [ ] **Step 2: Run the module test**

Run: `npx vitest run ModulesPieChart.test`
Expected: PASS — the test opens `module-drilldown` by clicking the legend and checks its content; position is not asserted.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/ModulesPieChart.tsx"
git commit -m "refactor(access-analysis): module donut drill renders above the legend"
```

---

### Task 7: `RolesPieChart` — click-to-drill into people (replaces click-to-hide)

Rewrite the membership Role donut to the click-to-drill pattern (mirroring `ActivityByRolePieChart`): clicking a role opens `<PeopleDrillList unitNoun="members">` above the legend. The hide/Reset/`role-metrics` feature is removed; the donut center reverts to the plain membership total.

**Files:**
- Rewrite: `app/(dashboard)/access-analysis/components/RolesPieChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/RolesPieChart.test.tsx`

- [ ] **Step 1: Update the test — replace the hide test with a drill test, fix the Others-expand test**

In `RolesPieChart.test.tsx`:

Replace the `"expands Others (+) back to every role…"` test with a version that expands via the Others legend row (the standalone `+` button is gone):

```ts
  it("expands Others back to every role, in legend and on the pie", () => {
    const { getByTestId, queryByText } = render(<RolesPieChart data={data} distinctRoles={4} />);
    fireEvent.change(getByTestId("topn-input"), { target: { value: "2" } });
    const legend = getByTestId("role-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Others \(2 roles\)/ }));
    expect(within(legend).getByRole("button", { name: /Charlie/ })).toBeTruthy();
    expect(within(legend).getByRole("button", { name: /Delta/ })).toBeTruthy();
    expect(queryByText(/Others \(/)).toBeNull();
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });
```

Replace the `"toggles a role off from the legend"` test entirely with a drill test:

```ts
  it("drills into the people behind a role and fires onUserClick", () => {
    const onUserClick = vi.fn();
    const usersByRole = new Map([
      ["Alpha", [
        { email: "ana@x.com", name: "Ana", count: 3 },
        { email: "al@x.com", name: "Al", count: 1 },
      ]],
    ]);
    const { getByTestId } = render(
      <RolesPieChart data={data} distinctRoles={4} usersByRole={usersByRole} onUserClick={onUserClick} />,
    );
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Alpha/ }));
    const drill = getByTestId("role-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Al");
    fireEvent.click(within(drill).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });
```

Leave the other four tests (empty state, "shows all roles by default", warnings, "typing a top-N collapses") unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run RolesPieChart.test`
Expected: FAIL — `role-drilldown` does not exist yet; the Others-expand click finds no matching button.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `app/(dashboard)/access-analysis/components/RolesPieChart.tsx` with:

```tsx
"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import { PeopleDrillList } from "./PeopleDrillList";
import { UNKNOWN_ROLE, MULTIPLE_ROLES, collapseToTopSlices, type RoleSlice, type DrillPerson } from "../roleCounts";

// Vibrant, cohesive palette for the role slices. These are data colors and
// read well on both the light and dark card surfaces.
const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#10b981", "#3b82f6", "#a78bfa",
  "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80", "#818cf8",
  "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac", "#67e8f9",
  "#fde047", "#f0abfc", "#a5b4fc", "#bef264", "#7dd3fc", "#fca5a5",
];
const UNKNOWN_COLOR = "#f59e0b"; // amber — warning: membership has no role
const MULTIPLE_COLOR = "#fb7185"; // rose — warning: membership has several roles
const OTHERS_COLOR = "#71717a";   // zinc-500 — the folded tail

const DEFAULT_TOP = 8;

// Range-slider chrome. Token-driven so the thumb and fill follow the active theme.
const PIE_CSS = `
.rp-range { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 9999px; cursor: pointer; }
.rp-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; border-radius: 9999px; background: var(--card); border: 3px solid var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,.35); transition: transform .12s ease; }
.rp-range:hover::-webkit-slider-thumb { transform: scale(1.15); }
.rp-range:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--ring); outline-offset: 2px; }
.rp-range::-moz-range-thumb { width: 15px; height: 15px; border: 3px solid var(--primary); border-radius: 9999px; background: var(--card); }
.rp-range::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
.rp-range:disabled { opacity: .45; cursor: not-allowed; }
`;

const isWarning = (name: string) => name === UNKNOWN_ROLE || name === MULTIPLE_ROLES;
const isOthers = (name: string) => name.startsWith("Others (");

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/**
 * "Role distribution" donut: each slice is a role sized by how many (user, project)
 * memberships hold it. Clicking a role drills into the people behind it — the same
 * click-to-drill pattern the activity donuts use. The Top-N slider trims the long tail.
 */
export function RolesPieChart({
  data,
  distinctRoles,
  usersByRole,
  onUserClick,
}: {
  data: RoleSlice[];
  distinctRoles: number;
  /** Slice label -> the people in that role (from summarizeRoles); empty when unavailable. */
  usersByRole?: ReadonlyMap<string, DrillPerson[]>;
  /** Open a person's profile (same drawer the activity donuts use). */
  onUserClick?: (email: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  // Stable color per role name (kept across collapse/expand).
  const colorByName = useMemo(() => {
    const m = new Map<string, string>();
    let hue = 0;
    for (const d of data) {
      m.set(
        d.name,
        d.name === UNKNOWN_ROLE ? UNKNOWN_COLOR
          : d.name === MULTIPLE_ROLES ? MULTIPLE_COLOR
            : PALETTE[hue++ % PALETTE.length],
      );
    }
    return m;
  }, [data]);
  const singleCount = useMemo(() => data.filter((d) => !isWarning(d.name)).length, [data]);

  const [topN, setTopN] = useState(DEFAULT_TOP);
  const [expanded, setExpanded] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No role assignments found.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const grandTotal = data.reduce((sum, d) => sum + d.value, 0);
  const displaySlices = expanded ? data : collapseToTopSlices(data, topN);
  const colorFor = (name: string) => (isOthers(name) ? OTHERS_COLOR : colorByName.get(name) ?? "#888");

  const toggleDrill = (name: string) => {
    if (isOthers(name)) { setExpanded(true); return; }
    setDrill((cur) => (cur === name ? null : name));
  };
  const changeTopN = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    setTopN(n);
    setExpanded(false);
  };

  const sliderMax = Math.max(singleCount, 1);
  const effectiveTop = Math.min(topN, sliderMax);
  const sliderValue = expanded ? sliderMax : effectiveTop;
  const trackPct = sliderMax > 1 ? ((sliderValue - 1) / (sliderMax - 1)) * 100 : 100;
  const presets = [10, 25].filter((n) => n < singleCount);
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
      active
        ? "border-primary/60 bg-primary/15 text-primary"
        : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  // ECharts colors are baked into the JS option (not CSS), so branch on theme.
  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cSlice = dark ? "#18181b" : "#ffffff"; // matches the card so gaps blend
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const option: EChartsOption = {
    title: [
      {
        text: "",
        subtext: `${distinctRoles.toLocaleString()} roles · ${grandTotal.toLocaleString()} user–project memberships`,
        left: "center",
        top: 0,
        subtextStyle: { color: cSub, fontSize: 12 },
      },
      {
        text: grandTotal.toLocaleString(),
        subtext: "users",
        left: "center",
        top: "45%",
        textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: cTipBg,
      borderColor: cTipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: cTipText },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} users · <b style='color:${cTipText}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: {
          focus: "self",
          scaleSize: 12,
          itemStyle: { shadowBlur: 28, shadowColor: cShadowHover },
          label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: cTitle },
        },
        blur: { itemStyle: { opacity: 0.22 } },
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 16,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        data: displaySlices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(s.name) } })),
      },
    ],
  };

  const drillUsers = drill ? usersByRole?.get(drill) ?? [] : [];
  const drillSlice = drill ? data.find((s) => s.name === drill) : undefined;

  return (
    <div className="panel-elevated p-5">
      <style>{PIE_CSS}</style>

      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name) }}
      />

      {/* Show top: slider + presets. */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="role-controls">
        <span className="font-medium text-foreground">Show</span>
        <input
          data-testid="topn-input"
          type="range"
          min={1}
          max={sliderMax}
          value={sliderValue}
          onChange={(e) => changeTopN(e.target.value)}
          disabled={singleCount <= 1}
          aria-label="Number of top roles to show"
          className="rp-range w-36"
          style={{ background: `linear-gradient(to right, var(--primary) ${trackPct}%, var(--border) ${trackPct}%)` }}
        />
        <span className="min-w-[3.5rem] rounded-md border border-border bg-muted px-2 py-0.5 text-center font-semibold tabular-nums text-foreground">
          {expanded ? `All ${singleCount}` : `Top ${effectiveTop}`}
        </span>
        <div className="flex items-center gap-1.5">
          {presets.map((n) => (
            <button key={n} type="button" onClick={() => { setTopN(n); setExpanded(false); }} className={chip(!expanded && topN === n)}>
              Top {n}
            </button>
          ))}
          <button type="button" aria-label="Show all roles" onClick={() => setExpanded(true)} className={chip(expanded)}>
            All
          </button>
        </div>
        <span className="text-muted-foreground">of {singleCount} roles</span>
      </div>

      {/* Drill-down: the people behind the selected role — above the legend. */}
      {drill && drillSlice && (
        <PeopleDrillList
          testId="role-drilldown"
          title={drill}
          color={colorFor(drill)}
          people={drillUsers}
          total={drillSlice.value}
          unitNoun="members"
          onUserClick={onUserClick}
          onClose={() => setDrill(null)}
        />
      )}

      {/* Ranked legend — click a role to drill into the people behind it. */}
      <ul
        data-testid="role-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {displaySlices.map((s) => {
          const warn = isWarning(s.name);
          const others = isOthers(s.name);
          const open = drill === s.name;
          const barPct = grandTotal > 0 ? (s.value / grandTotal) * 100 : 0;
          const color = colorFor(s.name);
          const userCount = usersByRole?.get(s.name)?.length ?? 0;
          return (
            <li key={s.name} data-warning={warn || undefined} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.name)}
                title={
                  others
                    ? "Show every folded role"
                    : `${s.name} — ${s.value.toLocaleString()} users (${fmtPct(s.value, grandTotal)}) · ${userCount} ${userCount === 1 ? "person" : "people"} — click to ${open ? "collapse" : "expand"}`
                }
                className={`group relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                  open ? "bg-accent text-foreground" : "text-foreground/85"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                  style={{ width: `${barPct}%`, background: color, opacity: open ? 0.24 : 0.16 }}
                />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
                {warn && (
                  <span data-testid="warning-icon" title="Data-quality warning" className="relative shrink-0 text-warning">
                    ⚠
                  </span>
                )}
                <span className={`relative flex-1 truncate ${warn ? "text-warning" : ""}`}>{s.name}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{s.value.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, grandTotal)}</span>
                {!others && (
                  <span
                    aria-hidden
                    className={`relative shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run RolesPieChart.test`
Expected: PASS (all six tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/RolesPieChart.tsx" "app/(dashboard)/access-analysis/__tests__/RolesPieChart.test.tsx"
git commit -m "feat(access-analysis): Role donut drills into people (replaces click-to-hide)"
```

---

### Task 8: `CompaniesPieChart` — click-to-drill into people (replaces click-to-hide)

Same transformation as Task 7, for the Users-by-company donut.

**Files:**
- Rewrite: `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx`

- [ ] **Step 1: Update the test — replace the hide test with a drill test**

In `CompaniesPieChart.test.tsx`, replace the `"toggles a company off from the legend"` test with:

```ts
  it("drills into the people behind a company and fires onUserClick", () => {
    const onUserClick = vi.fn();
    const usersByCompany = new Map([
      ["Hermosillo", [
        { email: "ana@x.com", name: "Ana", count: 3 },
        { email: "al@x.com", name: "Al", count: 1 },
      ]],
    ]);
    const { getByTestId } = render(
      <CompaniesPieChart data={data} distinctCompanies={5} usersByCompany={usersByCompany} onUserClick={onUserClick} />,
    );
    fireEvent.click(within(getByTestId("company-legend")).getByRole("button", { name: /Hermosillo/ }));
    const drill = getByTestId("company-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Al");
    fireEvent.click(within(drill).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });
```

Leave the other four tests (empty, "shows all companies by default", warning, "typing a top-N") unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run CompaniesPieChart.test`
Expected: FAIL — `company-drilldown` does not exist yet.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx` with:

```tsx
"use client";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import { PeopleDrillList } from "./PeopleDrillList";
import { type RoleSlice, type DrillPerson } from "../roleCounts";
import { UNKNOWN_COMPANY, collapseCompanySlices } from "../companyCounts";

// Vibrant, cohesive palette for the company slices. These are data colors and
// read well on both the light and dark card surfaces.
const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#10b981", "#3b82f6", "#a78bfa",
  "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80", "#818cf8",
  "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac", "#67e8f9",
  "#fde047", "#f0abfc", "#a5b4fc", "#bef264", "#7dd3fc", "#fca5a5",
];
const UNKNOWN_COLOR = "#f59e0b"; // amber — warning: membership has no company
const OTHERS_COLOR = "#71717a";   // zinc-500 — the folded tail

const DEFAULT_TOP = 8;

// Range-slider chrome. Token-driven so the thumb and fill follow the active theme.
const PIE_CSS = `
.cp-range { -webkit-appearance: none; appearance: none; height: 6px; border-radius: 9999px; cursor: pointer; }
.cp-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px; border-radius: 9999px; background: var(--card); border: 3px solid var(--primary); box-shadow: 0 1px 4px rgba(0,0,0,.35); transition: transform .12s ease; }
.cp-range:hover::-webkit-slider-thumb { transform: scale(1.15); }
.cp-range:focus-visible::-webkit-slider-thumb { outline: 2px solid var(--ring); outline-offset: 2px; }
.cp-range::-moz-range-thumb { width: 15px; height: 15px; border: 3px solid var(--primary); border-radius: 9999px; background: var(--card); }
.cp-range::-moz-range-track { height: 6px; border-radius: 9999px; background: transparent; }
.cp-range:disabled { opacity: .45; cursor: not-allowed; }
`;

const isWarning = (name: string) => name === UNKNOWN_COMPANY;
const isOthers = (name: string) => name.startsWith("Others (");

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/**
 * "Users by company" donut: each slice is a company sized by how many (user, project)
 * memberships its people hold. Clicking a company drills into the people behind it —
 * the same click-to-drill pattern the activity donuts use. The Top-N slider trims the tail.
 */
export function CompaniesPieChart({
  data,
  distinctCompanies,
  usersByCompany,
  onUserClick,
}: {
  data: RoleSlice[];
  distinctCompanies: number;
  /** Company label -> the people in it (from summarizeCompanies); empty when unavailable. */
  usersByCompany?: ReadonlyMap<string, DrillPerson[]>;
  /** Open a person's profile (same drawer the activity donuts use). */
  onUserClick?: (email: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light"; // default to dark before next-themes resolves

  // Stable color per company name (kept across collapse/expand).
  const colorByName = useMemo(() => {
    const m = new Map<string, string>();
    let hue = 0;
    for (const d of data) {
      m.set(d.name, d.name === UNKNOWN_COMPANY ? UNKNOWN_COLOR : PALETTE[hue++ % PALETTE.length]);
    }
    return m;
  }, [data]);
  const singleCount = useMemo(() => data.filter((d) => !isWarning(d.name)).length, [data]);

  const [topN, setTopN] = useState(DEFAULT_TOP);
  const [expanded, setExpanded] = useState(false);
  const [drill, setDrill] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-[460px] flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 opacity-40" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
          <path d="M12 3v9h9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        No company data found.
        <span className="text-xs opacity-70">Select at least one project above.</span>
      </div>
    );
  }

  const grandTotal = data.reduce((sum, d) => sum + d.value, 0);
  const displaySlices = expanded ? data : collapseCompanySlices(data, topN);
  const colorFor = (name: string) => (isOthers(name) ? OTHERS_COLOR : colorByName.get(name) ?? "#888");

  const toggleDrill = (name: string) => {
    if (isOthers(name)) { setExpanded(true); return; }
    setDrill((cur) => (cur === name ? null : name));
  };
  const changeTopN = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw) || 1));
    setTopN(n);
    setExpanded(false);
  };

  const sliderMax = Math.max(singleCount, 1);
  const effectiveTop = Math.min(topN, sliderMax);
  const sliderValue = expanded ? sliderMax : effectiveTop;
  const trackPct = sliderMax > 1 ? ((sliderValue - 1) / (sliderMax - 1)) * 100 : 100;
  const presets = [10, 25].filter((n) => n < singleCount);
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
      active
        ? "border-primary/60 bg-primary/15 text-primary"
        : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  // ECharts colors are baked into the JS option (not CSS), so branch on theme.
  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cSlice = dark ? "#18181b" : "#ffffff"; // matches the card so gaps blend
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";
  const cShadowHover = dark ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.2)";

  const option: EChartsOption = {
    title: [
      {
        text: "",
        subtext: `${distinctCompanies.toLocaleString()} companies · ${grandTotal.toLocaleString()} user–project memberships`,
        left: "center",
        top: 0,
        subtextStyle: { color: cSub, fontSize: 12 },
      },
      {
        text: grandTotal.toLocaleString(),
        subtext: "users",
        left: "center",
        top: "45%",
        textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: cTipBg,
      borderColor: cTipBorder,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: cTipText },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} users · <b style='color:${cTipText}'>{d}%</b></div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Companies",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: {
          focus: "self",
          scaleSize: 12,
          itemStyle: { shadowBlur: 28, shadowColor: cShadowHover },
          label: { show: true, formatter: "{b}\n{c} ({d}%)", fontSize: 13, fontWeight: 700, color: cTitle },
        },
        blur: { itemStyle: { opacity: 0.22 } },
        animationType: "scale",
        animationEasing: "elasticOut",
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 16,
        animationDurationUpdate: 550,
        animationEasingUpdate: "cubicInOut",
        data: displaySlices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(s.name) } })),
      },
    ],
  };

  const drillUsers = drill ? usersByCompany?.get(drill) ?? [] : [];
  const drillSlice = drill ? data.find((s) => s.name === drill) : undefined;

  return (
    <div className="panel-elevated p-5">
      <style>{PIE_CSS}</style>

      <EChart
        option={option}
        height={400}
        notMerge={false}
        onEvents={{ click: (p) => p.name && toggleDrill(p.name) }}
      />

      {/* Show top: slider + presets. */}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="company-controls">
        <span className="font-medium text-foreground">Show</span>
        <input
          data-testid="company-topn-input"
          type="range"
          min={1}
          max={sliderMax}
          value={sliderValue}
          onChange={(e) => changeTopN(e.target.value)}
          disabled={singleCount <= 1}
          aria-label="Number of top companies to show"
          className="cp-range w-36"
          style={{ background: `linear-gradient(to right, var(--primary) ${trackPct}%, var(--border) ${trackPct}%)` }}
        />
        <span className="min-w-[3.5rem] rounded-md border border-border bg-muted px-2 py-0.5 text-center font-semibold tabular-nums text-foreground">
          {expanded ? `All ${singleCount}` : `Top ${effectiveTop}`}
        </span>
        <div className="flex items-center gap-1.5">
          {presets.map((n) => (
            <button key={n} type="button" onClick={() => { setTopN(n); setExpanded(false); }} className={chip(!expanded && topN === n)}>
              Top {n}
            </button>
          ))}
          <button type="button" aria-label="Show all companies" onClick={() => setExpanded(true)} className={chip(expanded)}>
            All
          </button>
        </div>
        <span className="text-muted-foreground">of {singleCount} companies</span>
      </div>

      {/* Drill-down: the people behind the selected company — above the legend. */}
      {drill && drillSlice && (
        <PeopleDrillList
          testId="company-drilldown"
          title={drill}
          color={colorFor(drill)}
          people={drillUsers}
          total={drillSlice.value}
          unitNoun="members"
          onUserClick={onUserClick}
          onClose={() => setDrill(null)}
        />
      )}

      {/* Ranked legend — click a company to drill into the people behind it. */}
      <ul
        data-testid="company-legend"
        className="mt-3 list-none border-t border-border pt-3"
        style={{ columnWidth: "248px", columnGap: "1.5rem" }}
      >
        {displaySlices.map((s) => {
          const warn = isWarning(s.name);
          const others = isOthers(s.name);
          const open = drill === s.name;
          const barPct = grandTotal > 0 ? (s.value / grandTotal) * 100 : 0;
          const color = colorFor(s.name);
          const userCount = usersByCompany?.get(s.name)?.length ?? 0;
          return (
            <li key={s.name} data-warning={warn || undefined} className="mb-1 break-inside-avoid">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleDrill(s.name)}
                title={
                  others
                    ? "Show every folded company"
                    : `${s.name} — ${s.value.toLocaleString()} users (${fmtPct(s.value, grandTotal)}) · ${userCount} ${userCount === 1 ? "person" : "people"} — click to ${open ? "collapse" : "expand"}`
                }
                className={`group relative flex min-w-0 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-accent ${
                  open ? "bg-accent text-foreground" : "text-foreground/85"
                }`}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-md transition-all duration-300"
                  style={{ width: `${barPct}%`, background: color, opacity: open ? 0.24 : 0.16 }}
                />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color, boxShadow: `0 0 6px ${color}66` }} />
                {warn && (
                  <span data-testid="warning-icon" title="Data-quality warning" className="relative shrink-0 text-warning">
                    ⚠
                  </span>
                )}
                <span className={`relative flex-1 truncate ${warn ? "text-warning" : ""}`}>{s.name}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{s.value.toLocaleString()}</span>
                <span className="relative w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, grandTotal)}</span>
                {!others && (
                  <span
                    aria-hidden
                    className={`relative shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run CompaniesPieChart.test`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx" "app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx"
git commit -m "feat(access-analysis): Company donut drills into people (replaces click-to-hide)"
```

---

### Task 9: `companyRosterView` loader (account-wide roster)

**Files:**
- Create: `lib/server/companyRosterView.ts`

(No unit test — this is a thin IO loader, like the sibling `*View.ts` files. Its only logic — tombstone filtering — lives in the pure `dormantCompanies.ts`, which is tested in Task 10.)

- [ ] **Step 1: Create the loader**

Create `lib/server/companyRosterView.ts`:

```ts
import "server-only";
import { db } from "@/server/db";

let cache: { at: number; names: string[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/**
 * The full company roster: every distinct `AccDcCompany.name`, cached 5 min
 * (mirrors the other access-analysis view loaders). Returns names verbatim —
 * tombstone (`"removed at …"`) filtering is the pure function's job
 * (summarizeDormantCompanies), so it stays testable.
 */
export async function loadCompanyRoster(force = false): Promise<string[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.names;
  const rows = await db.accDcCompany.findMany({ select: { name: true } });
  const names = [...new Set(rows.map((r) => r.name))].sort((a, b) => a.localeCompare(b));
  cache = { at: Date.now(), names };
  return names;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/server/companyRosterView.ts
git commit -m "feat(access-analysis): add loadCompanyRoster view loader"
```

---

### Task 10: `summarizeDormantCompanies` pure module

**Files:**
- Create: `app/(dashboard)/access-analysis/dormantCompanies.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/dormantCompanies.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/dormantCompanies.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeDormantCompanies } from "../dormantCompanies";
import { UNKNOWN_COMPANY } from "../companyCounts";

const usersByCompany = new Map<string, Array<{ email: string }>>([
  ["Hermosillo", [{ email: "a@x.com" }, { email: "b@x.com" }]],
  ["Estructure", [{ email: "c@x.com" }]],
  ["PICSA", [{ email: "d@x.com" }, { email: "e@x.com" }, { email: "f@x.com" }]],
  [UNKNOWN_COMPANY, [{ email: "g@x.com" }]], // must never count as a real company
]);

describe("summarizeDormantCompanies", () => {
  it("lists roster companies with no users, excluding tombstones, sorted", () => {
    const roster = ["Hermosillo", "Estructure", "PICSA", "Zeta", "Acme", "removed at 2024-01-01 abc-uuid"];
    const out = summarizeDormantCompanies(roster, usersByCompany, new Set(["Hermosillo", "Estructure", "PICSA"]));
    expect(out.noUsers).toEqual(["Acme", "Zeta"]); // Zeta + Acme have no users; tombstone dropped
  });

  it("ignores the Unknown company bucket when deriving companies-with-users", () => {
    const roster = ["Hermosillo"];
    const out = summarizeDormantCompanies(roster, usersByCompany, new Set(["Hermosillo"]));
    // Unknown company is not a roster name and never appears in noUsers/noActivity.
    expect(out.noUsers).toEqual([]);
    expect(out.noActivity.some((d) => d.company === UNKNOWN_COMPANY)).toBe(false);
  });

  it("lists companies that have users but no activity, with user counts, sorted desc", () => {
    // Only Hermosillo has activity → Estructure (1 user) and PICSA (3 users) are dormant.
    const out = summarizeDormantCompanies(["Hermosillo", "Estructure", "PICSA"], usersByCompany, new Set(["Hermosillo"]));
    expect(out.noActivity).toEqual([
      { company: "PICSA", userCount: 3 },
      { company: "Estructure", userCount: 1 },
    ]);
  });

  it("sorts equal user counts alphabetically", () => {
    const ubc = new Map<string, Array<{ email: string }>>([
      ["Beta", [{ email: "x@x.com" }]],
      ["Alpha", [{ email: "y@y.com" }]],
    ]);
    const out = summarizeDormantCompanies(["Alpha", "Beta"], ubc, new Set());
    expect(out.noActivity.map((d) => d.company)).toEqual(["Alpha", "Beta"]);
  });

  it("de-duplicates roster names and handles empty inputs", () => {
    expect(summarizeDormantCompanies([], new Map(), new Set())).toEqual({ noUsers: [], noActivity: [] });
    const out = summarizeDormantCompanies(["Acme", "Acme"], new Map(), new Set());
    expect(out.noUsers).toEqual(["Acme"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run dormantCompanies.test`
Expected: FAIL — `Cannot find module '../dormantCompanies'`.

- [ ] **Step 3: Create the pure module**

Create `app/(dashboard)/access-analysis/dormantCompanies.ts`:

```ts
/**
 * Pure account-wide "dormant companies" diff for the Access Analysis page. A
 * company is dormant when it never shows up in the donuts: either it has no
 * users at all, or it has users but no recorded activity. Computed from the full
 * roster (every AccDcCompany name) against the account-wide membership and
 * activity sets — so it does NOT react to the project picker. No React/DOM/IO.
 */
import { UNKNOWN_COMPANY } from "./companyCounts";

export interface DormantSummary {
  /** Roster names with zero memberships, tombstones removed, sorted alphabetically. */
  noUsers: string[];
  /** Companies that have users but zero attributed activity, sorted by user count desc then name. */
  noActivity: Array<{ company: string; userCount: number }>;
}

/** Autodesk soft-deletes companies as `"removed at <date> <uuid>"`; these are not real roster entries. */
const TOMBSTONE_PREFIX = "removed at ";
const isTombstone = (name: string) => name.startsWith(TOMBSTONE_PREFIX);

export function summarizeDormantCompanies(
  roster: ReadonlyArray<string>,
  /** Account-wide: company label -> its members. From summarizeCompanies(all rows). */
  usersByCompany: ReadonlyMap<string, ReadonlyArray<{ email: string }>>,
  /** Account-wide: companies with ≥1 attributed activity. From summarizeActivityByCompany(all). */
  companiesWithActivity: ReadonlySet<string>,
): DormantSummary {
  const companiesWithUsers = new Set([...usersByCompany.keys()].filter((c) => c !== UNKNOWN_COMPANY));

  const noUsers = [...new Set(roster)]
    .filter((name) => !companiesWithUsers.has(name) && !isTombstone(name))
    .sort((a, b) => a.localeCompare(b));

  const noActivity = [...companiesWithUsers]
    .filter((company) => !companiesWithActivity.has(company))
    .map((company) => ({ company, userCount: usersByCompany.get(company)!.length }))
    .sort((a, b) => b.userCount - a.userCount || a.company.localeCompare(b.company));

  return { noUsers, noActivity };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run dormantCompanies.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/dormantCompanies.ts" "app/(dashboard)/access-analysis/__tests__/dormantCompanies.test.ts"
git commit -m "feat(access-analysis): add summarizeDormantCompanies pure module"
```

---

### Task 11: `DormantCompaniesPanel` component

**Files:**
- Create: `app/(dashboard)/access-analysis/components/DormantCompaniesPanel.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/DormantCompaniesPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/DormantCompaniesPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { DormantCompaniesPanel } from "../components/DormantCompaniesPanel";

const summary = {
  noUsers: ["Acme", "Zeta"],
  noActivity: [
    { company: "PICSA", userCount: 3 },
    { company: "Estructure", userCount: 1 },
  ],
};

describe("DormantCompaniesPanel", () => {
  it("renders both tabs with counts and defaults to the No-activity tab", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={summary} />);
    expect(getByTestId("dormant-tab-no-users").textContent).toContain("2");
    expect(getByTestId("dormant-tab-no-activity").textContent).toContain("2");
    // Default tab = No activity (both populated) → shows PICSA.
    expect(getByTestId("dormant-panel").textContent).toContain("PICSA");
  });

  it("switches to the No-users tab and lists those companies", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={summary} />);
    fireEvent.click(getByTestId("dormant-tab-no-users"));
    const panel = getByTestId("dormant-panel");
    expect(panel.textContent).toContain("Acme");
    expect(panel.textContent).toContain("Zeta");
  });

  it("defaults to the No-users tab when there is no dormant activity", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={{ noUsers: ["Acme"], noActivity: [] }} />);
    expect(getByTestId("dormant-panel").textContent).toContain("Acme");
  });

  it("shows an empty state when a tab has no entries", () => {
    const { getByTestId } = render(<DormantCompaniesPanel summary={{ noUsers: [], noActivity: [] }} />);
    const panel = getByTestId("dormant-panel");
    fireEvent.click(getByTestId("dormant-tab-no-users"));
    expect(within(panel).getByText(/every company has users/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run DormantCompaniesPanel.test`
Expected: FAIL — `Cannot find module '../components/DormantCompaniesPanel'`.

- [ ] **Step 3: Create the component**

Create `app/(dashboard)/access-analysis/components/DormantCompaniesPanel.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { DormantSummary } from "../dormantCompanies";

type Tab = "no-activity" | "no-users";

/**
 * Account-wide "dormant companies" card: companies that never surface in the
 * donuts because they have no users, or have users but no recorded activity.
 * Independent of the project picker (it reflects the full roster). Two tabs;
 * defaults to whichever has content (No activity first when both do).
 */
export function DormantCompaniesPanel({ summary }: { summary: DormantSummary }) {
  const { noUsers, noActivity } = summary;
  const [tab, setTab] = useState<Tab>(noActivity.length > 0 ? "no-activity" : "no-users");

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-accent hover:text-foreground"
    }`;

  return (
    <div data-testid="dormant-panel" className="panel-elevated p-5">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          data-testid="dormant-tab-no-activity"
          onClick={() => setTab("no-activity")}
          aria-pressed={tab === "no-activity"}
          className={tabClass(tab === "no-activity")}
        >
          No activity ({noActivity.length})
        </button>
        <button
          type="button"
          data-testid="dormant-tab-no-users"
          onClick={() => setTab("no-users")}
          aria-pressed={tab === "no-users"}
          className={tabClass(tab === "no-users")}
        >
          No users ({noUsers.length})
        </button>
      </div>

      {tab === "no-activity" ? (
        noActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every company with users is active.</p>
        ) : (
          <ul className="list-none space-y-1" style={{ columnWidth: "240px", columnGap: "1.5rem" }}>
            {noActivity.map((d) => (
              <li
                key={d.company}
                className="flex items-center justify-between gap-3 break-inside-avoid rounded-md bg-muted/40 px-2.5 py-1.5 text-sm"
              >
                <span className="truncate text-foreground/90" title={d.company}>{d.company}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {d.userCount} {d.userCount === 1 ? "user" : "users"}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : noUsers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every company has users.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {noUsers.map((name) => (
            <span
              key={name}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              title={name}
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run DormantCompaniesPanel.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/DormantCompaniesPanel.tsx" "app/(dashboard)/access-analysis/__tests__/DormantCompaniesPanel.test.tsx"
git commit -m "feat(access-analysis): add DormantCompaniesPanel component"
```

---

### Task 12: Wire membership-donut people + Dormant panel into the page

Feed the new `usersByRole`/`usersByCompany`/`onUserClick` into the two membership donuts, compute the account-wide dormant summary, render `<DormantCompaniesPanel>` after Model Coordination, and load the roster in `page.tsx`. Update the container test.

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`
- Modify: `app/(dashboard)/access-analysis/page.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`

- [ ] **Step 1: Add a Dormant-panel test to the container**

Append this `describe` block to the end of `AccessAnalysisCharts.test.tsx` (the existing `roleRows`/`activityActorRows`/`membershipRows` fixtures are declared above in the file and are in scope):

```tsx
describe("AccessAnalysisCharts — Dormant companies panel", () => {
  it("does not render the dormant panel without a roster", () => {
    const { queryByTestId } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    expect(queryByTestId("dormant-panel")).toBeNull();
  });

  it("renders the account-wide dormant panel from the roster", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
        roster={["Acme", "Globex"]}
      />,
    );
    // roleRows carry no company → no company has members → Acme + Globex are "No users".
    const panel = getByTestId("dormant-panel");
    expect(panel).toBeTruthy();
    expect(getByTestId("dormant-tab-no-users").textContent).toContain("2");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run AccessAnalysisCharts.test`
Expected: FAIL — `roster` is not a prop yet; `dormant-panel` never renders.

- [ ] **Step 3: Wire `AccessAnalysisCharts`**

Add the imports near the other component/aggregator imports:

```ts
import { DormantCompaniesPanel } from "./DormantCompaniesPanel";
import { summarizeDormantCompanies } from "../dormantCompanies";
import { UNKNOWN_COMPANY } from "../companyCounts";
```

Add `roster` to the prop list and its type. In the destructured params (after `loadOverview,`) add `roster,`; in the props type (after `loadOverview?: () => Promise<FolderTerrainData | null>;`) add:

```ts
  /** Full company roster (distinct AccDcCompany names) for the account-wide Dormant panel. */
  roster?: string[];
```

Pass the new props to the two membership donuts. Replace the `RolesPieChart` usage:

```tsx
        <RolesPieChart
          data={roleSummary.slices}
          distinctRoles={roleSummary.distinctRoles}
          usersByRole={roleSummary.usersByRole}
          onUserClick={(email) => setProfileEmail(email.toLowerCase())}
        />
```

Replace the `CompaniesPieChart` usage:

```tsx
        <CompaniesPieChart
          data={companySummary.slices}
          distinctCompanies={companySummary.distinctCompanies}
          usersByCompany={companySummary.usersByCompany}
          onUserClick={(email) => setProfileEmail(email.toLowerCase())}
        />
```

Compute the **account-wide** (unfiltered) dormant summary. Add these memos after the existing `coordSummary` memo (these run over the raw props, NOT `selected`, so the panel is account-wide):

```ts
  // Account-wide (picker-independent) inputs for the Dormant companies panel.
  const accountCompanies = useMemo(() => summarizeCompanies(roleRows), [roleRows]);
  const accountActivityByCompany = useMemo(
    () => summarizeActivityByCompany(activityActorRows ?? [], membershipRows ?? []),
    [activityActorRows, membershipRows],
  );
  const dormant = useMemo(
    () =>
      summarizeDormantCompanies(
        roster ?? [],
        accountCompanies.usersByCompany,
        new Set(accountActivityByCompany.slices.map((s) => s.name).filter((n) => n !== UNKNOWN_COMPANY)),
      ),
    [roster, accountCompanies, accountActivityByCompany],
  );
```

Render the panel after the Model Coordination `{coordinationData ? (…) : null}` block and before the `{profileEmail && …}` drawer. Gate it on a non-empty roster:

```tsx
      {roster && roster.length > 0 ? (
        <Reveal><section className="flex flex-col gap-3">
          <SectionHeader
            title="Dormant companies"
            subtitle="Account-wide: companies on the roster that never appear in the donuts — no users at all, or users with no recorded activity. Not affected by the project picker."
          />
          <DormantCompaniesPanel summary={dormant} />
        </section></Reveal>
      ) : null}
```

- [ ] **Step 4: Run the container test**

Run: `npx vitest run AccessAnalysisCharts.test`
Expected: PASS (existing tests + the two new dormant-panel tests).

- [ ] **Step 5: Load the roster in `page.tsx` and pass it down**

Add the import next to the other view-loader imports:

```ts
import { loadCompanyRoster } from "@/lib/server/companyRosterView";
```

Add `loadCompanyRoster()` to the `Promise.all` and capture it. Change the destructure + array:

```ts
  const [view, moduleRows, activityActorRows, coordinationData, coverage, terrainProjects, timelineRows, roster] = await Promise.all([
    loadInstanceView(),
    loadModuleActivity(),
    loadActivityByActor(),
    loadCoordinationByProject(),
    loadProjectCoverage(),
    loadTerrainProjects(),
    loadActivityTimeline(),
    loadCompanyRoster(),
  ]);
```

Pass `roster` to the component (add the prop alongside the others in the `<AccessAnalysisCharts …>` element):

```tsx
          roster={roster}
```

- [ ] **Step 6: Full type + suite gate**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

Run: `npm test`
Expected: PASS — full unit suite green (every access-analysis test above plus the rest of the repo).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/page.tsx" "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"
git commit -m "feat(access-analysis): wire membership-donut people + account-wide Dormant panel"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
| --- | --- |
| Move all five drill-downs above the legend | Activity donuts T5; Module T6; Role T7; Company T8 |
| `DrillPerson` defined once in `roleCounts.ts` | T1 |
| Shared `PeopleDrillList` reused by the four people-donuts | T4 (create); T5/T7/T8 (use) |
| Module keeps its own drill content, moved above legend | T6 |
| Role distribution & Users-by-company drill into people; hide removed | T7, T8 |
| `summarizeRoles.usersByRole` / `summarizeCompanies.usersByCompany` | T1, T2 |
| `ProjectRoleRow` gains `name`/`email`; `page.tsx` threads them | T3 |
| `companyRosterView.loadCompanyRoster` | T9 |
| `dormantCompanies.summarizeDormantCompanies` (tombstones, noUsers, noActivity) | T10 |
| `DormantCompaniesPanel` (two tabs, counts, empty states, default tab) | T11 |
| Account-wide wiring in `AccessAnalysisCharts` + `page.tsx` | T12 |
| Test ids preserved (`activity-role-drilldown`, `activity-company-drilldown`, `module-drilldown`) + new (`role-drilldown`, `company-drilldown`, `dormant-*`) | T4–T12 |
| Tests: roleCounts/companyCounts extended; dormant; PeopleDrillList; DormantCompaniesPanel; Roles/Companies hide-assertions removed; container updated | T1, T2, T4, T7, T8, T10, T11, T12 |

Out-of-scope items (inline accordion, project-filtering the Dormant panel, drilling dormant members, ingestion/schema changes, donut math changes) are not implemented — correct per spec.

**Type consistency**

- `DrillPerson { email; name; count }` defined in `roleCounts.ts` (T1); imported by `companyCounts.ts` (T2), `PeopleDrillList.tsx` (T4), `RolesPieChart.tsx` (T7), `CompaniesPieChart.tsx` (T8).
- `RoleSummary.usersByRole: Map<string, DrillPerson[]>` (T1) → consumed as `roleSummary.usersByRole` (T12); `RolesPieChart` prop typed `ReadonlyMap<string, DrillPerson[]>` (T7) — `Map` is assignable to `ReadonlyMap`. ✔
- `CompanySummary.usersByCompany` parallel. ✔
- `summarizeDormantCompanies(roster, usersByCompany, companiesWithActivity)` (T10) called with exactly those three args in T12; `usersByCompany` element type `{ email: string }` is satisfied by `DrillPerson[]`. ✔
- `DormantSummary { noUsers: string[]; noActivity: {company; userCount}[] }` (T10) → `DormantCompaniesPanel` prop (T11) → `dormant` memo (T12). ✔
- `PeopleDrillList` prop set (`title,color,people,total,unitNoun,onUserClick,onClose,testId`) identical at every call site (T5, T7, T8). ✔

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N" — every code step shows full content. ✔
