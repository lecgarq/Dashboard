# Company Pie Charts (Users + Activity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two donuts to `/access-analysis` sliced by company — **Users by company** (membership composition) and **Activity by company** (activity volume + drill-into-people).

**Architecture:** Two pure aggregators (`companyCounts.ts`, `companyActivityCounts.ts`) plus two client components that are faithful copies of the existing `RolesPieChart` / `ActivityByRolePieChart`, with `role`→`company` renames. The `company` field already exists on every instance-view row; `page.tsx` simply stops discarding it. No new DB query, index, or ingestion.

**Tech Stack:** Next.js (App Router, RSC), React client components, ECharts (via `echarts-for-react`, mocked in tests), Vitest + Testing Library, TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-16-company-pie-charts-design.md`

> **Branch hygiene:** This is the long-lived WIP branch `feat/access-analysis-redesign` with lots of uncommitted work. **Stage only the explicit paths each task names** (`git add -- <path>`); never `git add -A`/`.`. Before each commit run `git diff --cached --name-only` and confirm it lists only this task's files.

---

## File structure

**New files**
- `app/(dashboard)/access-analysis/companyCounts.ts` — pure: `summarizeCompanies`, `collapseCompanySlices`, `UNKNOWN_COMPANY`.
- `app/(dashboard)/access-analysis/companyActivityCounts.ts` — pure: `summarizeActivityByCompany` + types.
- `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx` — copy of `RolesPieChart.tsx`.
- `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx` — copy of `ActivityByRolePieChart.tsx`.
- `app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts`
- `app/(dashboard)/access-analysis/__tests__/companyActivityCounts.test.ts`
- `app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx`
- `app/(dashboard)/access-analysis/__tests__/CompaniesActivityPieChart.test.tsx`

**Modified files**
- `app/(dashboard)/access-analysis/projectFilter.ts` — add optional `company` to `ProjectRoleRow`.
- `app/(dashboard)/access-analysis/roleActivityCounts.ts` — add optional `company` to `MembershipRolesInput`.
- `app/(dashboard)/access-analysis/page.tsx` — keep `company` when slimming rows.
- `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — two new sections + Companies KPI.
- `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx` — assert the new donuts.
- `app/(dashboard)/access-analysis/page.test.tsx` — select the roles donut among multiple echarts.

**Test command (single file):** `npx vitest run "<path>"`
**Test command (whole surface):** `npx vitest run "app/(dashboard)/access-analysis/"`
**Typecheck:** `npx tsc --noEmit`

---

## Task 1: `companyCounts.ts` — Users-by-company aggregator

**Files:**
- Create: `app/(dashboard)/access-analysis/companyCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeCompanies, collapseCompanySlices, UNKNOWN_COMPANY } from "../companyCounts";

describe("summarizeCompanies", () => {
  it("returns an empty summary for no rows", () => {
    expect(summarizeCompanies([])).toEqual({ slices: [], distinctCompanies: 0, total: 0 });
  });

  it("buckets memberships by company and tallies counts", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo" }, { company: "Hermosillo" },
      { company: "Estructure" },
      { company: null },   // -> Unknown company
      { company: "  " },   // blank -> Unknown company
    ]);
    expect(s.total).toBe(5);
    expect(s.slices).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: UNKNOWN_COMPANY, value: 2 },
      { name: "Estructure", value: 1 },
    ]);
  });

  it("counts distinct real company names, excluding Unknown company", () => {
    const s = summarizeCompanies([
      { company: "Hermosillo" }, { company: "Estructure" }, { company: "PICSA" }, { company: null },
    ]);
    expect(s.distinctCompanies).toBe(3);
  });

  it("treats undefined company as Unknown company", () => {
    const s = summarizeCompanies([{}, { company: undefined }]);
    expect(s.slices).toEqual([{ name: UNKNOWN_COMPANY, value: 2 }]);
    expect(s.distinctCompanies).toBe(0);
  });
});

describe("collapseCompanySlices", () => {
  const slices = [
    { name: UNKNOWN_COMPANY, value: 100 },
    { name: "A", value: 30 },
    { name: "B", value: 20 },
    { name: "C", value: 10 },
    { name: "D", value: 5 },
    { name: "E", value: 1 },
  ];

  it("pins Unknown company, keeps the top N, folds the rest into Others", () => {
    expect(collapseCompanySlices(slices, 2)).toEqual([
      { name: UNKNOWN_COMPANY, value: 100 },
      { name: "A", value: 30 },
      { name: "B", value: 20 },
      { name: "Others (3 companies)", value: 16 }, // C+D+E
    ]);
  });

  it("never folds the Unknown company bucket, even at top 1", () => {
    const out = collapseCompanySlices(slices, 1);
    // Kept: A (30). Others = B+C+D+E = 36, which outranks A.
    expect(out.map((s) => s.name)).toEqual([UNKNOWN_COMPANY, "Others (4 companies)", "A"]);
  });

  it("adds no Others slice when topN covers every company", () => {
    const out = collapseCompanySlices(slices, 10);
    expect(out.some((s) => s.name.startsWith("Others"))).toBe(false);
    expect(out).toHaveLength(slices.length);
  });

  it("uses singular wording for a single leftover company", () => {
    expect(collapseCompanySlices(slices, 4).find((s) => s.name.startsWith("Others"))).toEqual({
      name: "Others (1 company)",
      value: 1,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts"`
Expected: FAIL — `Failed to resolve import "../companyCounts"`.

- [ ] **Step 3: Write minimal implementation**

Create `app/(dashboard)/access-analysis/companyCounts.ts`:

```ts
import type { RoleSlice } from "./roleCounts";

export interface CompanySummary {
  /** Company -> membership count, desc; includes the "Unknown company" bucket. */
  slices: RoleSlice[];
  /** Count of distinct real company names (excludes "Unknown company"). */
  distinctCompanies: number;
  /** Total number of (user, project) memberships. */
  total: number;
}

/** Bucket for memberships with no resolvable company name. */
export const UNKNOWN_COMPANY = "Unknown company";

/** A membership carries exactly one company; blank/null/undefined -> Unknown company. */
const labelFor = (company?: string | null): string => {
  const name = (company ?? "").trim();
  return name.length > 0 ? name : UNKNOWN_COMPANY;
};

/**
 * Summarise company distribution across (user, project) memberships. Each
 * membership lands in exactly one bucket — its company, or "Unknown company"
 * when none is recorded — so slice values sum to the membership total and donut
 * percentages add to 100%. `distinctCompanies` counts only real company names.
 */
export function summarizeCompanies(
  rows: ReadonlyArray<{ company?: string | null }>,
): CompanySummary {
  const counts = new Map<string, number>();
  const distinct = new Set<string>();
  for (const row of rows) {
    const label = labelFor(row.company);
    if (label !== UNKNOWN_COMPANY) distinct.add(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const slices = [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  return { slices, distinctCompanies: distinct.size, total };
}

/**
 * Reduce the slice list to the top `topN` companies plus a single
 * "Others (k companies)" bucket for the remainder. "Unknown company" is pinned
 * (a data-quality marker) and never folds into Others. Mirrors
 * `collapseToTopSlices` in roleCounts.ts but with a single pinned bucket.
 */
export function collapseCompanySlices(slices: RoleSlice[], topN: number): RoleSlice[] {
  const limit = Math.max(0, topN);
  const pinned = new Set<string>([UNKNOWN_COMPANY]);
  const special = slices.filter((s) => pinned.has(s.name));
  const singles = slices.filter((s) => !pinned.has(s.name)); // already sorted desc
  const kept = singles.slice(0, limit);
  const rest = singles.slice(limit);

  const result = [...special, ...kept];
  if (rest.length > 0) {
    const value = rest.reduce((sum, d) => sum + d.value, 0);
    const noun = rest.length === 1 ? "company" : "companies";
    result.push({ name: `Others (${rest.length} ${noun})`, value });
  }
  return result.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts"`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/companyCounts.ts" "app/(dashboard)/access-analysis/__tests__/companyCounts.test.ts"
git diff --cached --name-only   # confirm ONLY these two files
git commit -m "feat(access-analysis): summarizeCompanies aggregator + Top-N fold"
```

---

## Task 2: `companyActivityCounts.ts` — Activity-by-company aggregator

**Files:**
- Create: `app/(dashboard)/access-analysis/companyActivityCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/companyActivityCounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/companyActivityCounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizeActivityByCompany } from "../companyActivityCounts";
import { UNKNOWN_COMPANY } from "../companyCounts";

type Activity = { projectId: string; userEmail: string; userName: string; count: number };
type Membership = { projectId: string; email: string; company: string | null };

const act = (projectId: string, userEmail: string, count: number, userName = userEmail): Activity => ({ projectId, userEmail, userName, count });
const mem = (projectId: string, email: string, company: string | null): Membership => ({ projectId, email, company });

describe("summarizeActivityByCompany", () => {
  it("returns an empty summary for no activity", () => {
    const s = summarizeActivityByCompany([], []);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.distinctCompanies).toBe(0);
    expect(s.usersByCompany.size).toBe(0);
  });

  it("attributes a user's activity to their company on that project", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 40, "Ana")],
      [mem("p1", "a@x.com", "Hermosillo")],
    );
    expect(s.slices).toEqual([{ name: "Hermosillo", value: 40 }]);
    expect(s.total).toBe(40);
    expect(s.distinctCompanies).toBe(1);
    expect(s.usersByCompany.get("Hermosillo")).toEqual([{ email: "a@x.com", name: "Ana", count: 40 }]);
  });

  it("buckets activity with no membership into Unknown company", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "ghost@x.com", 7)],
      [mem("p1", "a@x.com", "Hermosillo")],
    );
    expect(s.slices).toEqual([{ name: UNKNOWN_COMPANY, value: 7 }]);
    expect(s.distinctCompanies).toBe(0);
    expect(s.usersByCompany.get(UNKNOWN_COMPANY)).toEqual([{ email: "ghost@x.com", name: "ghost@x.com", count: 7 }]);
  });

  it("buckets activity whose membership has a null company into Unknown company", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 7)],
      [mem("p1", "a@x.com", null)],
    );
    expect(s.slices).toEqual([{ name: UNKNOWN_COMPANY, value: 7 }]);
  });

  it("matches company per project: same person, different company in each project", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 10), act("p2", "a@x.com", 5)],
      [mem("p1", "a@x.com", "Hermosillo"), mem("p2", "a@x.com", "Estructure")],
    );
    expect(new Map(s.slices.map((x) => [x.name, x.value]))).toEqual(
      new Map([["Hermosillo", 10], ["Estructure", 5]]),
    );
  });

  it("sums one company across projects and merges a user active in several projects", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 10, "Ana"), act("p2", "a@x.com", 6, "Ana"), act("p1", "b@x.com", 4, "Ben")],
      [mem("p1", "a@x.com", "Hermosillo"), mem("p2", "a@x.com", "Hermosillo"), mem("p1", "b@x.com", "Hermosillo")],
    );
    expect(s.slices).toEqual([{ name: "Hermosillo", value: 20 }]);
    expect(s.total).toBe(20);
    expect(s.usersByCompany.get("Hermosillo")).toEqual([
      { email: "a@x.com", name: "Ana", count: 16 },
      { email: "b@x.com", name: "Ben", count: 4 },
    ]);
  });

  it("sorts slices by activity volume descending and they sum to total", () => {
    const s = summarizeActivityByCompany(
      [act("p1", "a@x.com", 3), act("p1", "b@x.com", 9), act("p1", "c@x.com", 5)],
      [mem("p1", "a@x.com", "Low"), mem("p1", "b@x.com", "High"), mem("p1", "c@x.com", "Mid")],
    );
    expect(s.slices.map((x) => x.name)).toEqual(["High", "Mid", "Low"]);
    expect(s.slices.reduce((sum, x) => sum + x.value, 0)).toBe(s.total);
    expect(s.total).toBe(17);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/companyActivityCounts.test.ts"`
Expected: FAIL — `Failed to resolve import "../companyActivityCounts"`.

- [ ] **Step 3: Write minimal implementation**

Create `app/(dashboard)/access-analysis/companyActivityCounts.ts`:

```ts
/**
 * Pure aggregation for the "Activity by company" donut. Mirrors
 * `roleActivityCounts.ts`, bucketing activity volume by the actor's COMPANY on
 * each project instead of their role. Company is per-(project, user), looked up
 * by `email::projectId`; activity with no membership, or a membership with no
 * company, falls into "Unknown company". No React/DOM/IO; safe on server + client.
 */
import { UNKNOWN_COMPANY } from "./companyCounts";
import type { RoleSlice } from "./roleCounts";

/** One contributing person within a company slice (the drill-down "from whom"). */
export interface CompanyActivityUser {
  email: string;
  name: string;
  count: number;
}

export interface CompanyActivitySummary {
  /** Company -> total activity, desc; includes "Unknown company". */
  slices: RoleSlice[];
  /** Sum of all slice values (= total attributed activity in scope). */
  total: number;
  /** Count of distinct real company names credited to a slice. */
  distinctCompanies: number;
  /** Slice label -> contributing users (merged across projects), sorted by count desc. */
  usersByCompany: Map<string, CompanyActivityUser[]>;
}

/** One shipped row: total activity for a (project, actor) pair. */
export interface ActivityActorInput {
  projectId: string;
  userEmail: string;
  userName: string;
  count: number;
}

/** One shipped membership: the actor's company on a project. */
export interface MembershipCompanyInput {
  projectId: string;
  email: string;
  company?: string | null;
}

const key = (email: string, projectId: string) => `${email}::${projectId}`;
const labelFor = (company?: string | null): string => {
  const name = (company ?? "").trim();
  return name.length > 0 ? name : UNKNOWN_COMPANY;
};

/**
 * Bucket each (project, actor) activity total by the actor's company on that
 * project, then roll up to company slices plus a per-company list of
 * contributing users. A user active in several projects under the same company
 * is merged into one drill-down row (counts summed). Slice values sum to `total`.
 */
export function summarizeActivityByCompany(
  activity: ReadonlyArray<ActivityActorInput>,
  memberships: ReadonlyArray<MembershipCompanyInput>,
): CompanyActivitySummary {
  const companyByActor = new Map<string, string | null | undefined>();
  for (const m of memberships) companyByActor.set(key(m.email, m.projectId), m.company);

  const volume = new Map<string, number>();
  const distinct = new Set<string>();
  // label -> (email -> merged user row), so one person spanning projects collapses.
  const usersAgg = new Map<string, Map<string, CompanyActivityUser>>();

  for (const a of activity) {
    // Absent key -> get() returns undefined -> labelFor -> "Unknown company".
    const label = labelFor(companyByActor.get(key(a.userEmail, a.projectId)));
    if (label !== UNKNOWN_COMPANY) distinct.add(label);

    volume.set(label, (volume.get(label) ?? 0) + a.count);

    const byEmail = usersAgg.get(label) ?? usersAgg.set(label, new Map()).get(label)!;
    const cur = byEmail.get(a.userEmail);
    if (cur) cur.count += a.count;
    else byEmail.set(a.userEmail, { email: a.userEmail, name: a.userName, count: a.count });
  }

  const slices: RoleSlice[] = [...volume.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((x, y) => y.value - x.value || x.name.localeCompare(y.name));

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const usersByCompany = new Map<string, CompanyActivityUser[]>();
  for (const [label, byEmail] of usersAgg) {
    usersByCompany.set(
      label,
      [...byEmail.values()].sort((x, y) => y.count - x.count || x.name.localeCompare(y.name)),
    );
  }

  return { slices, total, distinctCompanies: distinct.size, usersByCompany };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/companyActivityCounts.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/companyActivityCounts.ts" "app/(dashboard)/access-analysis/__tests__/companyActivityCounts.test.ts"
git diff --cached --name-only
git commit -m "feat(access-analysis): summarizeActivityByCompany aggregator"
```

---

## Task 3: `CompaniesPieChart.tsx` — Users-by-company donut

This component is a copy of `RolesPieChart.tsx` with `role`→`company` renames and a single warning bucket. Create the test first.

**Files:**
- Create: `app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-active={series.filter((d: any) => d.value > 0).length}
        data-names={series.map((d: any) => d.name).join("|")}
      />
    );
  },
}));

import { CompaniesPieChart } from "../components/CompaniesPieChart";
import { UNKNOWN_COMPANY } from "../companyCounts";

const data = [
  { name: "Hermosillo", value: 50 },
  { name: UNKNOWN_COMPANY, value: 30 },
  { name: "Estructure", value: 25 },
  { name: "PICSA", value: 20 },
  { name: "PROLOGIS", value: 15 },
  { name: "SOLUTEC", value: 10 },
];

describe("CompaniesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<CompaniesPieChart data={[]} distinctCompanies={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no company data/i)).toBeTruthy();
  });

  it("shows all companies by default with no Others", () => {
    const { getByTestId, queryByText } = render(<CompaniesPieChart data={data} distinctCompanies={5} />);
    const legend = getByTestId("company-legend");
    expect(legend.textContent).toContain("Hermosillo");
    expect(legend.textContent).toContain("SOLUTEC");
    expect(queryByText(/Others \(/)).toBeNull();
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });

  it("flags Unknown company as the only warning", () => {
    const { getAllByTestId } = render(<CompaniesPieChart data={data} distinctCompanies={5} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(1);
  });

  it("typing a top-N collapses the rest into Others (companies)", () => {
    const { getByTestId, within: _w } = render(<CompaniesPieChart data={data} distinctCompanies={5} />) as any;
    fireEvent.change(getByTestId("company-topn-input"), { target: { value: "2" } });
    const legend = getByTestId("company-legend");
    expect(within(legend).getByText(/Others \(3 companies\)/)).toBeTruthy();
    // Donut shows Unknown company, Hermosillo, Estructure, Others = 4 slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
  });

  it("toggles a company off from the legend", () => {
    const { getByTestId } = render(<CompaniesPieChart data={data} distinctCompanies={5} />);
    const legend = getByTestId("company-legend");
    const top = within(legend).getByRole("button", { name: /Hermosillo/ });
    fireEvent.click(top);
    expect(top.getAttribute("aria-pressed")).toBe("false");
    expect(getByTestId("echart").getAttribute("data-active")).toBe("5"); // 6 shown, 1 hidden
    expect(getByTestId("company-metrics").textContent).toContain("100 users"); // 150 - 50
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx"`
Expected: FAIL — cannot resolve `../components/CompaniesPieChart`.

- [ ] **Step 3: Create the component by copying RolesPieChart, then apply the substitutions**

First copy the file verbatim:

```bash
cp "app/(dashboard)/access-analysis/components/RolesPieChart.tsx" "app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx"
```

Then apply EVERY substitution below to `CompaniesPieChart.tsx` (each `old` block appears exactly once in the copied file). After applying them, no occurrence of `role`, `RoleSlice`-only imports aside, `UNKNOWN_ROLE`, `MULTIPLE_ROLES`, `MULTIPLE_COLOR`, or `collapseToTopSlices` should remain.

**S1 — import (line ~6):**
old:
```tsx
import { UNKNOWN_ROLE, MULTIPLE_ROLES, collapseToTopSlices, type RoleSlice } from "../roleCounts";
```
new:
```tsx
import { type RoleSlice } from "../roleCounts";
import { UNKNOWN_COMPANY, collapseCompanySlices } from "../companyCounts";
```

**S2 — warning colors (remove the now-unused MULTIPLE_COLOR):**
old:
```tsx
const UNKNOWN_COLOR = "#f59e0b"; // amber — warning: membership has no role
const MULTIPLE_COLOR = "#fb7185"; // rose — warning: membership has several roles
const OTHERS_COLOR = "#71717a";   // zinc-500 — the folded tail
```
new:
```tsx
const UNKNOWN_COLOR = "#f59e0b"; // amber — warning: membership has no company
const OTHERS_COLOR = "#71717a";   // zinc-500 — the folded tail
```

**S3 — isWarning:**
old:
```tsx
const isWarning = (name: string) => name === UNKNOWN_ROLE || name === MULTIPLE_ROLES;
```
new:
```tsx
const isWarning = (name: string) => name === UNKNOWN_COMPANY;
```

**S4 — signature:**
old:
```tsx
export function RolesPieChart({ data, distinctRoles }: { data: RoleSlice[]; distinctRoles: number }) {
```
new:
```tsx
export function CompaniesPieChart({ data, distinctCompanies }: { data: RoleSlice[]; distinctCompanies: number }) {
```

**S5 — color assignment ternary:**
old:
```tsx
      m.set(
        d.name,
        d.name === UNKNOWN_ROLE ? UNKNOWN_COLOR
          : d.name === MULTIPLE_ROLES ? MULTIPLE_COLOR
            : PALETTE[hue++ % PALETTE.length],
      );
```
new:
```tsx
      m.set(
        d.name,
        d.name === UNKNOWN_COMPANY ? UNKNOWN_COLOR : PALETTE[hue++ % PALETTE.length],
      );
```

**S6 — empty-state text:**
old:
```tsx
        No role assignments found.
```
new:
```tsx
        No company data found.
```

**S7 — collapse call:**
old:
```tsx
  const displaySlices = expanded ? data : collapseToTopSlices(data, topN);
```
new:
```tsx
  const displaySlices = expanded ? data : collapseCompanySlices(data, topN);
```

**S8 — subtext:**
old:
```tsx
        subtext: `${distinctRoles.toLocaleString()} roles · ${grandTotal.toLocaleString()} user–project memberships`,
```
new:
```tsx
        subtext: `${distinctCompanies.toLocaleString()} companies · ${grandTotal.toLocaleString()} user–project memberships`,
```

**S9 — series name:**
old:
```tsx
        name: "Roles",
```
new:
```tsx
        name: "Companies",
```

**S10 — controls testid:**
old:
```tsx
        <div data-testid="role-controls" className="flex flex-wrap items-center gap-3 text-muted-foreground">
```
new:
```tsx
        <div data-testid="company-controls" className="flex flex-wrap items-center gap-3 text-muted-foreground">
```

**S11 — slider testid:**
old:
```tsx
            data-testid="topn-input"
```
new:
```tsx
            data-testid="company-topn-input"
```

**S12 — slider aria-label:**
old:
```tsx
            aria-label="Number of top roles to show"
```
new:
```tsx
            aria-label="Number of top companies to show"
```

**S13 — "All" button aria-label:**
old:
```tsx
            <button type="button" aria-label="Show all roles" onClick={() => setExpanded(true)} className={chip(expanded)}>
```
new:
```tsx
            <button type="button" aria-label="Show all companies" onClick={() => setExpanded(true)} className={chip(expanded)}>
```

**S14 — "of N roles" caption:**
old:
```tsx
          <span className="text-muted-foreground">of {singleCount} roles</span>
```
new:
```tsx
          <span className="text-muted-foreground">of {singleCount} companies</span>
```

**S15 — metrics testid:**
old:
```tsx
        <div data-testid="role-metrics" className="flex flex-wrap items-center gap-2 text-muted-foreground">
```
new:
```tsx
        <div data-testid="company-metrics" className="flex flex-wrap items-center gap-2 text-muted-foreground">
```

**S16 — legend testid:**
old:
```tsx
        data-testid="role-legend"
```
new:
```tsx
        data-testid="company-legend"
```

**S17 — "Expand others" tooltip:**
old:
```tsx
                  title="Show every folded role"
```
new:
```tsx
                  title="Show every folded company"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx" "app/(dashboard)/access-analysis/__tests__/CompaniesPieChart.test.tsx"
git diff --cached --name-only
git commit -m "feat(access-analysis): CompaniesPieChart (Users by company donut)"
```

---

## Task 4: `CompaniesActivityPieChart.tsx` — Activity-by-company donut

Copy of `ActivityByRolePieChart.tsx` with `role`→`company` renames. Test first.

**Files:**
- Create: `app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/CompaniesActivityPieChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/CompaniesActivityPieChart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={series.map((d: any) => d.name).join("|")}
      />
    );
  },
}));

import { CompaniesActivityPieChart } from "../components/CompaniesActivityPieChart";
import { UNKNOWN_COMPANY } from "../companyCounts";
import type { CompanyActivitySummary } from "../companyActivityCounts";

const summary: CompanyActivitySummary = {
  slices: [
    { name: "Hermosillo", value: 100 },
    { name: "Estructure", value: 60 },
    { name: UNKNOWN_COMPANY, value: 20 },
    { name: "PICSA", value: 15 },
    { name: "PROLOGIS", value: 5 },
  ],
  total: 200,
  distinctCompanies: 4,
  usersByCompany: new Map([
    ["Hermosillo", [
      { email: "ana@x.com", name: "Ana", count: 70 },
      { email: "al@x.com", name: "Al", count: 30 },
    ]],
    ["Estructure", [{ email: "ben@x.com", name: "Ben", count: 60 }]],
  ]),
};

const empty: CompanyActivitySummary = { slices: [], total: 0, distinctCompanies: 0, usersByCompany: new Map() };

describe("CompaniesActivityPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<CompaniesActivityPieChart summary={empty} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no company activity/i)).toBeTruthy();
  });

  it("renders one legend row per slice", () => {
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    const legend = getByTestId("activity-company-legend");
    expect(legend.textContent).toContain("Hermosillo");
    expect(legend.textContent).toContain("PROLOGIS");
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("5");
  });

  it("flags Unknown company as the only warning", () => {
    const { getAllByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(1);
  });

  it("opens a drill-down of the people behind a company when its legend row is clicked", () => {
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    fireEvent.click(within(getByTestId("activity-company-legend")).getByRole("button", { name: /Hermosillo/ }));
    const drill = getByTestId("activity-company-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Al");
    expect(drill.textContent).toContain("70");
  });

  it("calls onUserClick with the person's email when a drilled user is clicked", () => {
    const onUserClick = vi.fn();
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} onUserClick={onUserClick} />);
    fireEvent.click(within(getByTestId("activity-company-legend")).getByRole("button", { name: /Hermosillo/ }));
    fireEvent.click(within(getByTestId("activity-company-drilldown")).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });

  it("collapses to a top-N with an Others bucket", () => {
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    fireEvent.change(getByTestId("activity-company-topn-input"), { target: { value: "2" } });
    const legend = getByTestId("activity-company-legend");
    expect(within(legend).getByText(/Others \(2 companies\)/)).toBeTruthy();
    // Kept: Hermosillo, Estructure + pinned Unknown company + Others = 4 slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/CompaniesActivityPieChart.test.tsx"`
Expected: FAIL — cannot resolve `../components/CompaniesActivityPieChart`.

- [ ] **Step 3: Create the component by copying ActivityByRolePieChart, then apply the substitutions**

```bash
cp "app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx" "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx"
```

Apply EVERY substitution below to `CompaniesActivityPieChart.tsx`:

**A1 — imports:**
old:
```tsx
import { UNKNOWN_ROLE, MULTIPLE_ROLES, collapseToTopSlices } from "../roleCounts";
import type { RoleActivitySummary } from "../roleActivityCounts";
```
new:
```tsx
import { collapseCompanySlices, UNKNOWN_COMPANY } from "../companyCounts";
import type { CompanyActivitySummary } from "../companyActivityCounts";
```

**A2 — warning colors (remove unused MULTIPLE_COLOR):**
old:
```tsx
const UNKNOWN_COLOR = "#f59e0b"; // amber — activity by someone with no role on that project
const MULTIPLE_COLOR = "#fb7185"; // rose — activity by someone holding several roles
const OTHERS_COLOR = "#71717a"; // zinc-500 — the folded tail
```
new:
```tsx
const UNKNOWN_COLOR = "#f59e0b"; // amber — activity by someone with no company on that project
const OTHERS_COLOR = "#71717a"; // zinc-500 — the folded tail
```

**A3 — isWarning:**
old:
```tsx
const isWarning = (name: string) => name === UNKNOWN_ROLE || name === MULTIPLE_ROLES;
```
new:
```tsx
const isWarning = (name: string) => name === UNKNOWN_COMPANY;
```

**A4 — doc comment above the component:**
old:
```tsx
/**
 * "Activity by role" donut: each slice is a role sized by the total activity its
 * holders performed (summed across projects). Clicking a role drills into the
 * people behind it — the "from whom" view. Mirrors RolesPieChart's Top-N collapse
 * and palette, and ModulesPieChart's click-to-drill legend.
 */
```
new:
```tsx
/**
 * "Activity by company" donut: each slice is a company sized by the total activity
 * its people performed (summed across projects). Clicking a company drills into the
 * people behind it — the "from whom" view. Mirrors CompaniesPieChart's Top-N collapse
 * and palette, and ModulesPieChart's click-to-drill legend.
 */
```

**A5 — signature + props type:**
old:
```tsx
export function ActivityByRolePieChart({
  summary,
  onUserClick,
}: {
  summary: RoleActivitySummary;
```
new:
```tsx
export function CompaniesActivityPieChart({
  summary,
  onUserClick,
}: {
  summary: CompanyActivitySummary;
```

**A6 — destructure:**
old:
```tsx
  const { slices, total, distinctRoles, usersByRole } = summary;
```
new:
```tsx
  const { slices, total, distinctCompanies, usersByCompany } = summary;
```

**A7 — color assignment ternary:**
old:
```tsx
      m.set(
        d.name,
        d.name === UNKNOWN_ROLE ? UNKNOWN_COLOR
          : d.name === MULTIPLE_ROLES ? MULTIPLE_COLOR
            : PALETTE[hue++ % PALETTE.length],
      );
```
new:
```tsx
      m.set(
        d.name,
        d.name === UNKNOWN_COMPANY ? UNKNOWN_COLOR : PALETTE[hue++ % PALETTE.length],
      );
```

**A8 — empty-state text:**
old:
```tsx
        No activity found.
```
new:
```tsx
        No company activity found.
```

**A9 — collapse call:**
old:
```tsx
  const displaySlices = expanded ? slices : collapseToTopSlices(slices, topN);
```
new:
```tsx
  const displaySlices = expanded ? slices : collapseCompanySlices(slices, topN);
```

**A10 — subtext:**
old:
```tsx
        subtext: `${distinctRoles.toLocaleString()} roles · ${total.toLocaleString()} activities attributed to a role`,
```
new:
```tsx
        subtext: `${distinctCompanies.toLocaleString()} companies · ${total.toLocaleString()} activities attributed to a company`,
```

**A11 — series name:**
old:
```tsx
        name: "Activity by role",
```
new:
```tsx
        name: "Activity by company",
```

**A12 — drill source map:**
old:
```tsx
  const drillUsers = drill ? usersByRole.get(drill) ?? [] : [];
```
new:
```tsx
  const drillUsers = drill ? usersByCompany.get(drill) ?? [] : [];
```

**A13 — controls testid:**
old:
```tsx
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="activity-role-controls">
```
new:
```tsx
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="activity-company-controls">
```

**A14 — slider testid:**
old:
```tsx
          data-testid="activity-topn-input"
```
new:
```tsx
          data-testid="activity-company-topn-input"
```

**A15 — slider aria-label:**
old:
```tsx
          aria-label="Number of top roles to show"
```
new:
```tsx
          aria-label="Number of top companies to show"
```

**A16 — "All" button aria-label:**
old:
```tsx
          <button type="button" aria-label="Show all roles" onClick={() => setExpanded(true)} className={chip(expanded)}>
```
new:
```tsx
          <button type="button" aria-label="Show all companies" onClick={() => setExpanded(true)} className={chip(expanded)}>
```

**A17 — "of N roles" caption:**
old:
```tsx
        <span className="text-muted-foreground">of {singleCount} roles</span>
```
new:
```tsx
        <span className="text-muted-foreground">of {singleCount} companies</span>
```

**A18 — legend testid:**
old:
```tsx
        data-testid="activity-role-legend"
```
new:
```tsx
        data-testid="activity-company-legend"
```

**A19 — per-row user count source:**
old:
```tsx
          const userCount = usersByRole.get(s.name)?.length ?? 0;
```
new:
```tsx
          const userCount = usersByCompany.get(s.name)?.length ?? 0;
```

**A20 — "Others" tooltip:**
old:
```tsx
                    ? "Show every folded role"
```
new:
```tsx
                    ? "Show every folded company"
```

**A21 — warning-icon tooltip:**
old:
```tsx
                  <span data-testid="warning-icon" title="Activity that can't be tied to a single project role" className="relative shrink-0 text-warning">
```
new:
```tsx
                  <span data-testid="warning-icon" title="Activity that can't be tied to a single project company" className="relative shrink-0 text-warning">
```

**A22 — drilldown testid:**
old:
```tsx
        <div data-testid="activity-role-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
```
new:
```tsx
        <div data-testid="activity-company-drilldown" className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
```

After applying, confirm no `usersByRole`, `distinctRoles`, `UNKNOWN_ROLE`, `MULTIPLE_ROLES`, `MULTIPLE_COLOR`, `collapseToTopSlices`, or `RoleActivitySummary` remains:

Run: `grep -nE "usersByRole|distinctRoles|UNKNOWN_ROLE|MULTIPLE_ROLES|MULTIPLE_COLOR|collapseToTopSlices|RoleActivitySummary" "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx"`
Expected: no output.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/CompaniesActivityPieChart.test.tsx"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx" "app/(dashboard)/access-analysis/__tests__/CompaniesActivityPieChart.test.tsx"
git diff --cached --name-only
git commit -m "feat(access-analysis): CompaniesActivityPieChart (Activity by company donut)"
```

---

## Task 5: Plumb the `company` field through types and `page.tsx`

Add `company` to the two slim row types and stop discarding it in the route. No test of its own — Task 6's tests exercise it; this task ends with a typecheck.

**Files:**
- Modify: `app/(dashboard)/access-analysis/projectFilter.ts`
- Modify: `app/(dashboard)/access-analysis/roleActivityCounts.ts`
- Modify: `app/(dashboard)/access-analysis/page.tsx`

- [ ] **Step 1: Add `company` to `ProjectRoleRow`**

In `app/(dashboard)/access-analysis/projectFilter.ts`:
old:
```ts
export interface ProjectRoleRow {
  projectId: string;
  projectName: string;
  roles: string[];
}
```
new:
```ts
export interface ProjectRoleRow {
  projectId: string;
  projectName: string;
  roles: string[];
  /** The member's company on this project (null/blank → "Unknown company"); drives the Users-by-company donut. */
  company?: string | null;
}
```

- [ ] **Step 2: Add `company` to `MembershipRolesInput`**

In `app/(dashboard)/access-analysis/roleActivityCounts.ts`:
old:
```ts
/** One shipped membership: the roles an actor holds on a project. */
export interface MembershipRolesInput {
  projectId: string;
  email: string;
  roles: string[];
}
```
new:
```ts
/** One shipped membership: the roles an actor holds on a project (and their company). */
export interface MembershipRolesInput {
  projectId: string;
  email: string;
  roles: string[];
  /** The actor's company on this project; feeds the Activity-by-company donut. */
  company?: string | null;
}
```

- [ ] **Step 3: Keep `company` when slimming rows in `page.tsx`**

In `app/(dashboard)/access-analysis/page.tsx`:

old:
```tsx
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
  }));
```
new:
```tsx
  const rows: ProjectRoleRow[] = view.map((v) => ({
    projectId: v.projectId,
    projectName: v.projectName,
    roles: v.roles,
    company: v.company,
  }));
```

old:
```tsx
  const membershipRows = view.map((v) => ({
    projectId: v.projectId,
    email: v.email,
    roles: v.roles,
  }));
```
new:
```tsx
  const membershipRows = view.map((v) => ({
    projectId: v.projectId,
    email: v.email,
    roles: v.roles,
    company: v.company,
  }));
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0). The optional `company` keeps every existing call site and test fixture valid.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/projectFilter.ts" "app/(dashboard)/access-analysis/roleActivityCounts.ts" "app/(dashboard)/access-analysis/page.tsx"
git diff --cached --name-only
git commit -m "feat(access-analysis): carry company through slim membership rows"
```

---

## Task 6: Wire both donuts + Companies KPI into `AccessAnalysisCharts`

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`

- [ ] **Step 1: Extend the test to expect both new donuts**

In `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`, add this test to the first `describe("AccessAnalysisCharts (one picker, both donuts)", …)` block (after the existing "shows both donuts…" test):

```tsx
  it("renders a Users-by-company donut driven by the shared selection", () => {
    const { getByTestId } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    // The test roleRows carry no company, so every membership lands in Unknown company.
    expect(getByTestId("company-legend").textContent).toContain("Unknown company");
  });
```

And add this test to the `describe("AccessAnalysisCharts — Activity by role donut", …)` block:

```tsx
  it("renders the Activity-by-company donut and drills into its people", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    const legend = getByTestId("activity-company-legend");
    // membershipRows carry no company → Unknown company holds all the activity.
    expect(legend.textContent).toContain("Unknown company");
    fireEvent.click(within(legend).getByRole("button", { name: /Unknown company/ }));
    expect(getByTestId("activity-company-drilldown").textContent).toContain("Ana");
  });
```

- [ ] **Step 2: Run the test to verify the new cases fail**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"`
Expected: FAIL — `Unable to find an element by: [data-testid="company-legend"]` (and `activity-company-legend`). The existing tests in the file still pass.

- [ ] **Step 3: Add imports**

In `AccessAnalysisCharts.tsx`, after the existing component/aggregator imports (right after the `ActivityByRolePieChart` import and the `summarizeActivityByRole` import), add:

old:
```tsx
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
```
new:
```tsx
import { ActivityByRolePieChart } from "./ActivityByRolePieChart";
import { CompaniesPieChart } from "./CompaniesPieChart";
import { CompaniesActivityPieChart } from "./CompaniesActivityPieChart";
```

old:
```tsx
import { summarizeActivityByRole, type MembershipRolesInput } from "../roleActivityCounts";
```
new:
```tsx
import { summarizeActivityByRole, type MembershipRolesInput } from "../roleActivityCounts";
import { summarizeCompanies } from "../companyCounts";
import { summarizeActivityByCompany } from "../companyActivityCounts";
```

- [ ] **Step 4: Add the two memoized summaries**

After the `activityByRoleSummary` `useMemo` block and before the `coordSummary` `useMemo`, add:

```tsx
  const companySummary = useMemo(
    () => summarizeCompanies(filterRowsBySelection(roleRows, selected)),
    [roleRows, selected],
  );
  const activityByCompanySummary = useMemo(
    () =>
      summarizeActivityByCompany(
        filterRowsBySelection(activityActorRows ?? [], selected),
        filterRowsBySelection(membershipRows ?? [], selected),
      ),
    [activityActorRows, membershipRows, selected],
  );
```

- [ ] **Step 5: Add the Companies KPI tile**

In the `kpis` array, insert the Companies tile right after the "Distinct roles" entry:

old:
```tsx
    { label: "Distinct roles", value: roleSummary.distinctRoles, accent: "violet" },
    { label: "Activities", value: moduleSummary.total, accent: "amber" },
```
new:
```tsx
    { label: "Distinct roles", value: roleSummary.distinctRoles, accent: "violet" },
    { label: "Companies", value: companySummary.distinctCompanies, accent: "primary" },
    { label: "Activities", value: moduleSummary.total, accent: "amber" },
```

- [ ] **Step 6: Add the "Users by company" section after Role distribution**

old:
```tsx
      <Reveal><section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across all project memberships." />
        <RolesPieChart data={roleSummary.slices} distinctRoles={roleSummary.distinctRoles} />
      </section></Reveal>
```
new:
```tsx
      <Reveal><section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across all project memberships." />
        <RolesPieChart data={roleSummary.slices} distinctRoles={roleSummary.distinctRoles} />
      </section></Reveal>

      <Reveal><section className="flex flex-col gap-3">
        <SectionHeader title="Users by company" subtitle="Project memberships grouped by each member's company." />
        <CompaniesPieChart data={companySummary.slices} distinctCompanies={companySummary.distinctCompanies} />
      </section></Reveal>
```

- [ ] **Step 7: Add the "Activity by company" section after Activity by role**

old:
```tsx
          <ActivityByRolePieChart
            summary={activityByRoleSummary}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section></Reveal>
      ) : null}
```
new:
```tsx
          <ActivityByRolePieChart
            summary={activityByRoleSummary}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section></Reveal>
      ) : null}

      {activityActorRows ? (
        <Reveal><section className="flex flex-col gap-3">
          <SectionHeader
            title="Activity by company"
            subtitle="Project activity attributed to each person's company. Click a company to see who did the work."
          />
          <CompaniesActivityPieChart
            summary={activityByCompanySummary}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section></Reveal>
      ) : null}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"`
Expected: PASS (all cases, old and new).

- [ ] **Step 9: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"
git diff --cached --name-only
git commit -m "feat(access-analysis): wire company donuts + Companies KPI into the page"
```

---

## Task 7: Fix `page.test.tsx` for the second always-on echart

The "Users by company" donut now always renders, so the page has two echarts. The route test's singular `getByTestId("echart")` must select the roles donut by its subtext.

**Files:**
- Modify: `app/(dashboard)/access-analysis/page.test.tsx`

- [ ] **Step 1: Run the route test to see it break**

Run: `npx vitest run "app/(dashboard)/access-analysis/page.test.tsx"`
Expected: FAIL — `Found multiple elements by: [data-testid="echart"]`.

- [ ] **Step 2: Select the roles donut among the echarts**

old:
```tsx
    const ui = await AccessAnalysisRoute();
    const { getByTestId, getByText } = render(ui);
    const el = getByTestId("echart");
    expect(el.getAttribute("data-slices")).toBe("3");
```
new:
```tsx
    const ui = await AccessAnalysisRoute();
    const { getAllByTestId, getByText } = render(ui);
    // Two donuts now render an echart (roles + companies). Pick the roles donut
    // by its subtext, which names "roles" ("N roles · M user–project memberships").
    const el = getAllByTestId("echart").find((c) =>
      (c.getAttribute("data-subtexts") ?? "").includes("roles"),
    )!;
    expect(el).toBeTruthy();
    expect(el.getAttribute("data-slices")).toBe("3");
```

(The remaining assertions in the test continue to use `el` unchanged.)

- [ ] **Step 3: Run the route test to verify it passes**

Run: `npx vitest run "app/(dashboard)/access-analysis/page.test.tsx"`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/page.test.tsx"
git diff --cached --name-only
git commit -m "test(access-analysis): select roles donut among multiple echarts"
```

---

## Task 8: Full-surface verification

No code changes — a final gate that the whole surface is green and types are clean.

- [ ] **Step 1: Run every access-analysis test**

Run: `npx vitest run "app/(dashboard)/access-analysis/"`
Expected: PASS — all files, including the four new test files and the two updated ones.

- [ ] **Step 2: Typecheck the project**

Run: `npx tsc --noEmit`
Expected: PASS (exit 0).

- [ ] **Step 3: Lint the changed files**

Run: `npx eslint "app/(dashboard)/access-analysis/companyCounts.ts" "app/(dashboard)/access-analysis/companyActivityCounts.ts" "app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx" "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx" "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx"`
Expected: PASS (no errors). If lint flags an unused symbol, it means a substitution was missed — re-check Task 3/4.

- [ ] **Step 4: Confirm git scope is clean**

Run: `git status --porcelain`
Expected: no unexpected modified/untracked files beyond what the tasks committed. (The branch carries pre-existing WIP; confirm you did not accidentally stage or modify anything outside the file list in this plan.)

There is nothing to commit in this task. The feature ships when a `npm run build` + restart is done by the owner (deploy = rebuild, not a git merge); a visual check on `localhost:3000` confirms the two new donuts and the Companies KPI render and re-focus with the project picker.

---

## Self-review

**Spec coverage:**
- Users by company donut (memberships unit) → Tasks 1, 3, 6. ✓
- Activity by company donut (volume + people drill) → Tasks 2, 4, 6. ✓
- "Unknown company" amber bucket, no "Multiple" bucket → `UNKNOWN_COMPANY` in Tasks 1/2; single `isWarning` in Tasks 3/4. ✓
- Top-N fold, Hermosillo kept → `collapseCompanySlices` (Task 1), used in both components. ✓
- No new DB query / ingestion → only `page.tsx` row-slimming changed (Task 5). ✓
- Companies KPI tile → Task 6, Step 5. ✓
- Placement (after Role distribution; after Activity by role) → Task 6, Steps 6–7. ✓
- Existing donuts untouched → no edits to `RolesPieChart`/`ActivityByRolePieChart`/module files. ✓
- Profile drawer reuse → `onUserClick` → `setProfileEmail` (Task 6, Step 7). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code or an exact substitution. ✓

**Type consistency:** `CompanySummary.distinctCompanies`, `CompanyActivitySummary.{distinctCompanies,usersByCompany}`, `UNKNOWN_COMPANY`, `collapseCompanySlices`, `summarizeCompanies`, `summarizeActivityByCompany`, `CompaniesPieChart({data, distinctCompanies})`, `CompaniesActivityPieChart({summary, onUserClick})` are used identically across Tasks 1–6. `ProjectRoleRow.company?` / `MembershipRolesInput.company?` are optional, so existing fixtures and call sites stay valid. ✓
