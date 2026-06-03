# Roles Pie Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entire `/access-analysis` page with a single server-computed pie chart of roles (slice = one role, size = people-per-role assignments), and delete the now-dead dashboard/table/API island.

**Architecture:** `page.tsx` (server component) calls the existing `loadInstanceView()`, runs a new pure `roleCounts()` aggregator, and passes a small `{name,value}[]` array to a new `RolesPieChart` client component built on the existing `EChart` wrapper. No API route, no client store, no query layer.

**Tech Stack:** Next.js App Router (server components), React 19, ECharts via `echarts-for-react`, Vitest + Testing Library, Tailwind (dark zinc theme).

**Build first, delete second.** Tasks 1–3 add the new pie and rewire the page while the old code still sits on disk (tests stay green). Task 4 deletes the dead island. Task 5 trims orphaned types. Task 6 runs gates + deploy.

**Commit discipline (this WIP branch):** Always stage by explicit path (`git add -- <path>`), never `git add -A`/`.`. Before every commit run `git diff --cached --name-only` and confirm only intended files are staged (the branch has unrelated WIP: `tsconfig.json`, `.next-bak/`, `LOOK AND FEEL *.jpg`).

---

### Task 1: `roleCounts` pure aggregator

**Files:**
- Create: `app/(dashboard)/access-analysis/roleCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/roleCounts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/roleCounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { roleCounts } from "../roleCounts";
import type { AccessInstance } from "../types";

const mk = (roles: string[]): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles, modules: [], adminModules: [],
});

describe("roleCounts", () => {
  it("returns [] for no rows", () => {
    expect(roleCounts([])).toEqual([]);
  });
  it("counts one assignment per role per instance", () => {
    const out = roleCounts([mk(["Member"]), mk(["Member"]), mk(["Admin"])]);
    expect(out).toEqual([
      { name: "Member", value: 2 },
      { name: "Admin", value: 1 },
    ]);
  });
  it("counts each role of a multi-role instance", () => {
    const out = roleCounts([mk(["Admin", "Member"])]);
    expect(out).toEqual([
      { name: "Admin", value: 1 },
      { name: "Member", value: 1 },
    ]);
  });
  it("sorts descending by count", () => {
    const out = roleCounts([mk(["A"]), mk(["B"]), mk(["B"]), mk(["C"]), mk(["C"]), mk(["C"])]);
    expect(out.map((r) => r.name)).toEqual(["C", "B", "A"]);
  });
  it("skips instances with no roles", () => {
    expect(roleCounts([mk([])])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run roleCounts`
Expected: FAIL — cannot resolve `../roleCounts`.

- [ ] **Step 3: Write minimal implementation**

Create `app/(dashboard)/access-analysis/roleCounts.ts`:

```ts
import type { AccessInstance } from "./types";

export interface RoleSlice {
  name: string;
  value: number;
}

/**
 * Count role assignments across every (user, project) instance.
 * One increment per role per instance: an instance with N roles contributes to
 * N slices, and the same role name across instances accumulates. Sorted
 * descending by count. Mirrors the legacy `roleCount` semantics from the
 * removed aggregations.ts so "people per role" stays consistent.
 */
export function roleCounts(rows: AccessInstance[]): RoleSlice[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const role of row.roles) {
      counts.set(role, (counts.get(role) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run roleCounts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/roleCounts.ts" "app/(dashboard)/access-analysis/__tests__/roleCounts.test.ts"
git diff --cached --name-only   # confirm ONLY the two files above
git commit -m "feat(acc-redesign): roleCounts pure aggregator (people-per-role)"
```

---

### Task 2: `RolesPieChart` client component

**Files:**
- Create: `app/(dashboard)/access-analysis/components/RolesPieChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/RolesPieChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/RolesPieChart.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series?: Array<{ data?: unknown[] }> } }) => (
    <div data-testid="echart" data-slices={props.option.series?.[0]?.data?.length ?? 0} />
  ),
}));

import { RolesPieChart } from "../components/RolesPieChart";

describe("RolesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<RolesPieChart data={[]} assignments={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no role assignments/i)).toBeTruthy();
  });
  it("passes one pie slice per role", () => {
    const { getByTestId } = render(
      <RolesPieChart data={[{ name: "Admin", value: 3 }, { name: "Member", value: 7 }]} assignments={10} />,
    );
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run RolesPieChart`
Expected: FAIL — cannot resolve `../components/RolesPieChart`.

- [ ] **Step 3: Write minimal implementation**

Create `app/(dashboard)/access-analysis/components/RolesPieChart.tsx`:

```tsx
"use client";
import { EChart } from "./EChart";
import type { EChartsOption } from "echarts";
import type { RoleSlice } from "../roleCounts";

export function RolesPieChart({ data, assignments }: { data: RoleSlice[]; assignments: number }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[480px] items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
        No role assignments found.
      </div>
    );
  }

  const option: EChartsOption = {
    title: {
      text: "Role distribution",
      subtext: `${assignments.toLocaleString()} assignments across ${data.length} roles`,
      left: "center",
      textStyle: { color: "#fafafa", fontSize: 16, fontWeight: 600 },
      subtextStyle: { color: "#a1a1aa", fontSize: 12 },
    },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 8,
      top: 48,
      bottom: 8,
      textStyle: { color: "#a1a1aa" },
      pageTextStyle: { color: "#a1a1aa" },
    },
    series: [
      {
        name: "Roles",
        type: "pie",
        radius: "62%",
        center: ["38%", "56%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: "#09090b", borderWidth: 1 },
        label: { show: false },
        labelLine: { show: false },
        data: data.map((d) => ({ name: d.name, value: d.value })),
      },
    ],
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <EChart option={option} height={480} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run RolesPieChart`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/components/RolesPieChart.tsx" "app/(dashboard)/access-analysis/__tests__/RolesPieChart.test.tsx"
git diff --cached --name-only   # confirm ONLY the two files above
git commit -m "feat(acc-redesign): RolesPieChart component (all roles, scroll legend)"
```

---

### Task 3: Rewire `page.tsx` to render the pie

**Files:**
- Modify (replace whole file): `app/(dashboard)/access-analysis/page.tsx`
- Modify (replace whole file): `app/(dashboard)/access-analysis/page.test.tsx`

- [ ] **Step 1: Replace the page test**

Overwrite `app/(dashboard)/access-analysis/page.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "Ana",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin", "Member"], modules: ["build"], adminModules: ["build"] },
    { projectId: "p2", projectName: "Tower B", userId: "u2", email: "b@acme.com", name: "Bob",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
  ])),
}));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series?: Array<{ data?: unknown[] }> } }) => (
    <div data-testid="echart" data-slices={props.option.series?.[0]?.data?.length ?? 0} />
  ),
}));

import AccessAnalysisRoute from "./page";

describe("AccessAnalysisRoute (roles pie)", () => {
  it("renders a pie with one slice per distinct role", async () => {
    const ui = await AccessAnalysisRoute();
    const { getByTestId, getByText } = render(ui);
    // Across the two instances: Admin x1, Member x2 -> 2 distinct slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("2");
    expect(getByText("Access Analysis")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run -t "roles pie"`
Expected: FAIL — current `page.tsx` still imports `AccessAnalysisDashboard` and has no `data-slices`/"Access Analysis" heading wired to a pie.

- [ ] **Step 3: Replace the page**

Overwrite `app/(dashboard)/access-analysis/page.tsx` with:

```tsx
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { roleCounts } from "./roleCounts";
import { RolesPieChart } from "./components/RolesPieChart";

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const view = await loadInstanceView();
  const data = roleCounts(view);
  const assignments = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <h1 className="text-lg font-semibold text-zinc-100">Access Analysis</h1>
        <RolesPieChart data={data} assignments={assignments} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run -t "roles pie"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/page.tsx" "app/(dashboard)/access-analysis/page.test.tsx"
git diff --cached --name-only   # confirm ONLY the two files above
git commit -m "feat(acc-redesign): /access-analysis renders roles pie only"
```

---

### Task 4: Delete the dead dashboard/table/API island

At this point the page no longer imports any of these files. They were grepped during design and have no importers outside this island.

**Files to delete (exact paths):**

UI / dashboard:
- `app/(dashboard)/access-analysis/AccessAnalysisDashboard.tsx`
- `app/(dashboard)/access-analysis/__tests__/AccessAnalysisDashboard.test.tsx`
- `app/(dashboard)/access-analysis/components/FilterBar.tsx`
- `app/(dashboard)/access-analysis/components/UserTable.tsx`
- `app/(dashboard)/access-analysis/components/CountTiles.tsx`
- `app/(dashboard)/access-analysis/__tests__/CountTiles.test.tsx`
- `app/(dashboard)/access-analysis/components/CompositionDonuts.tsx`
- `app/(dashboard)/access-analysis/components/RiskCards.tsx`
- `app/(dashboard)/access-analysis/__tests__/RiskCards.test.tsx`
- `app/(dashboard)/access-analysis/components/ModuleAccessChart.tsx`
- `app/(dashboard)/access-analysis/components/Rankings.tsx`
- `app/(dashboard)/access-analysis/__tests__/Rankings.test.tsx`
- `app/(dashboard)/access-analysis/components/Trends.tsx`
- `app/(dashboard)/access-analysis/components/MultiSelectCombobox.tsx`
- `app/(dashboard)/access-analysis/__tests__/MultiSelectCombobox.test.tsx`
- `app/(dashboard)/access-analysis/components/ActiveFilterChips.tsx`
- `app/(dashboard)/access-analysis/components/DetailTable.tsx`
- `app/(dashboard)/access-analysis/__tests__/DetailTable.test.tsx`

Helpers:
- `app/(dashboard)/access-analysis/queries.ts`
- `app/(dashboard)/access-analysis/__tests__/queries.test.ts`
- `app/(dashboard)/access-analysis/store.ts`
- `app/(dashboard)/access-analysis/__tests__/store.test.ts`
- `app/(dashboard)/access-analysis/filters.ts`
- `app/(dashboard)/access-analysis/__tests__/filters.test.ts`
- `app/(dashboard)/access-analysis/filterParams.ts`
- `app/(dashboard)/access-analysis/__tests__/filterParams.test.ts`
- `app/(dashboard)/access-analysis/aggregations.ts`
- `app/(dashboard)/access-analysis/__tests__/aggregations.test.ts`
- `app/(dashboard)/access-analysis/trends.ts`
- `app/(dashboard)/access-analysis/__tests__/trends.test.ts`
- `app/(dashboard)/access-analysis/csv.ts`
- `app/(dashboard)/access-analysis/__tests__/csv.test.ts`
- `app/(dashboard)/access-analysis/userRows.ts`
- `app/(dashboard)/access-analysis/__tests__/userRows.test.ts`

API routes:
- `app/api/access-analysis/summary/route.ts`
- `app/api/access-analysis/summary/__tests__/route.test.ts`
- `app/api/access-analysis/members/route.ts`
- `app/api/access-analysis/trends/route.ts`
- `app/api/access-analysis/users/route.ts`

E2E:
- `tests/e2e/access-analysis-redesign.spec.ts`

- [ ] **Step 1: Confirm nothing live still imports the island**

Run (PowerShell-safe; should return NO matches in `app/`, `lib/`, `tests/` outside the files being deleted):

```
npx vitest run --reporter=dot   # snapshot of current green count before deletion (optional)
```

Then verify importers with Grep over the repo (exclude `.next*`): search for
`access-analysis/components/`, `access-analysis/queries`, `access-analysis/store`,
`access-analysis/aggregations`, `access-analysis/trends`, `access-analysis/csv`,
`access-analysis/userRows`, `access-analysis/filters`, and `/api/access-analysis`.
Expected: matches only inside the delete list above (plus `docs/`). If anything
else references them, STOP and reassess.

- [ ] **Step 2: Delete the files**

```bash
git rm -- \
  "app/(dashboard)/access-analysis/AccessAnalysisDashboard.tsx" \
  "app/(dashboard)/access-analysis/__tests__/AccessAnalysisDashboard.test.tsx" \
  "app/(dashboard)/access-analysis/components/FilterBar.tsx" \
  "app/(dashboard)/access-analysis/components/UserTable.tsx" \
  "app/(dashboard)/access-analysis/components/CountTiles.tsx" \
  "app/(dashboard)/access-analysis/__tests__/CountTiles.test.tsx" \
  "app/(dashboard)/access-analysis/components/CompositionDonuts.tsx" \
  "app/(dashboard)/access-analysis/components/RiskCards.tsx" \
  "app/(dashboard)/access-analysis/__tests__/RiskCards.test.tsx" \
  "app/(dashboard)/access-analysis/components/ModuleAccessChart.tsx" \
  "app/(dashboard)/access-analysis/components/Rankings.tsx" \
  "app/(dashboard)/access-analysis/__tests__/Rankings.test.tsx" \
  "app/(dashboard)/access-analysis/components/Trends.tsx" \
  "app/(dashboard)/access-analysis/components/MultiSelectCombobox.tsx" \
  "app/(dashboard)/access-analysis/__tests__/MultiSelectCombobox.test.tsx" \
  "app/(dashboard)/access-analysis/components/ActiveFilterChips.tsx" \
  "app/(dashboard)/access-analysis/components/DetailTable.tsx" \
  "app/(dashboard)/access-analysis/__tests__/DetailTable.test.tsx" \
  "app/(dashboard)/access-analysis/queries.ts" \
  "app/(dashboard)/access-analysis/__tests__/queries.test.ts" \
  "app/(dashboard)/access-analysis/store.ts" \
  "app/(dashboard)/access-analysis/__tests__/store.test.ts" \
  "app/(dashboard)/access-analysis/filters.ts" \
  "app/(dashboard)/access-analysis/__tests__/filters.test.ts" \
  "app/(dashboard)/access-analysis/filterParams.ts" \
  "app/(dashboard)/access-analysis/__tests__/filterParams.test.ts" \
  "app/(dashboard)/access-analysis/aggregations.ts" \
  "app/(dashboard)/access-analysis/__tests__/aggregations.test.ts" \
  "app/(dashboard)/access-analysis/trends.ts" \
  "app/(dashboard)/access-analysis/__tests__/trends.test.ts" \
  "app/(dashboard)/access-analysis/csv.ts" \
  "app/(dashboard)/access-analysis/__tests__/csv.test.ts" \
  "app/(dashboard)/access-analysis/userRows.ts" \
  "app/(dashboard)/access-analysis/__tests__/userRows.test.ts" \
  "app/api/access-analysis/summary/route.ts" \
  "app/api/access-analysis/summary/__tests__/route.test.ts" \
  "app/api/access-analysis/members/route.ts" \
  "app/api/access-analysis/trends/route.ts" \
  "app/api/access-analysis/users/route.ts" \
  "tests/e2e/access-analysis-redesign.spec.ts"
```

(If `git rm` line-continuation is awkward in PowerShell, delete with the Bash tool or run `git rm` per file. Confirm each path exists first.)

- [ ] **Step 3: Run the full unit suite to confirm nothing broke**

Run: `npm test`
Expected: PASS, with a lower total test count than before (the deleted tests are gone). No failures, no unresolved imports.

- [ ] **Step 4: Commit**

```bash
git diff --cached --name-only   # confirm ONLY deletions from the list above are staged
git commit -m "refactor(acc-redesign): delete dead dashboard/table/API island"
```

---

### Task 5: Trim orphaned types from `types.ts`

After Task 4, `types.ts` exports `FilterState`, `EMPTY_FILTERS`, `Category`, and `SummaryDTO`, which only the deleted files used. The live consumers are `accessInstanceView.ts` (`AccessInstance`) and `roleCounts.ts` (`AccessInstance`), plus `modules.ts` uses `ModuleId`.

**Files:**
- Modify (replace whole file): `app/(dashboard)/access-analysis/types.ts`

- [ ] **Step 1: Verify the orphaned exports have no live importers**

Use Grep over the repo (exclude `.next*`, exclude `docs/`) for `FilterState`,
`EMPTY_FILTERS`, `SummaryDTO`, and `Category` imported from this `types` module.
Expected: zero matches in `app/`, `lib/`, `tests/`. If any remain, STOP.

- [ ] **Step 2: Replace `types.ts`**

Overwrite `app/(dashboard)/access-analysis/types.ts` with:

```ts
export type ModuleId =
  | "dataManagement" | "insight" | "build" | "modelCoordination"
  | "designCollaboration" | "preconstruction" | "design" | "autospecs" | "datum";

export interface AccessInstance {
  projectId: string;
  projectName: string;
  userId: string;
  email: string;
  name: string;
  isInternal: boolean;       // email ends with "@hermosillo.com"
  isAdmin: boolean;          // any product accessLevel === "project_admin"
  status: string | null;     // membership status (e.g. "active" | "pending")
  addedOn: string | null;    // ISO date string or null
  company: string | null;    // company display name
  roles: string[];           // role display names
  modules: ModuleId[];       // modules this instance has (any non-none product)
  adminModules: ModuleId[];  // modules where this instance is project_admin
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors. (If `tsc` reports an unused/ missing reference to a removed type, that file was missed in Task 4 — fix before continuing.)

- [ ] **Step 4: Commit**

```bash
git add -- "app/(dashboard)/access-analysis/types.ts"
git diff --cached --name-only   # confirm ONLY types.ts
git commit -m "refactor(acc-redesign): trim types.ts to AccessInstance + ModuleId"
```

---

### Task 6: Final gates, debt doc, deploy

**Files:**
- Modify: `.gsd/TECHNICAL_DEBT.md`

- [ ] **Step 1: Full typecheck + unit suite**

Run: `npx tsc --noEmit`  → exit 0
Run: `npm test`           → all green

- [ ] **Step 2: Update the technical-debt doc**

Append an entry to `.gsd/TECHNICAL_DEBT.md` recording that `/access-analysis`
was reduced to a single roles pie chart on 2026-06-03; the dashboard, user
table, analytics panels, four `/api/access-analysis/*` routes, supporting
helpers, and the `access-analysis-redesign` e2e spec were removed (recoverable
in git history); `loadInstanceView`, `modules.ts`, trimmed `types.ts`, and the
`EChart` wrapper were kept. Note that no e2e coverage remains for this route
(unit + render tests only) — a smoke spec is a possible future follow-up.

- [ ] **Step 3: Commit the debt doc**

```bash
git add -- ".gsd/TECHNICAL_DEBT.md"
git diff --cached --name-only   # confirm ONLY the debt doc
git commit -m "docs(acc-redesign): record access-analysis reduction in TECHNICAL_DEBT"
```

- [ ] **Step 4: Deploy (production rebuild) — coordinate timing**

Deploy on this machine = rebuild the current checkout's `.next` and restart.
CAUTION (from project notes): do NOT run `npm run build` while the site is
actively serving on :3000 — it can 500 the running app. Stop the running
app (or run during a quiet window), then:

Run: `npm run build`  → completes with no errors
Then restart the local server (Task Scheduler `start-local.ps1`, or `npm start`).

- [ ] **Step 5: Eyeball verification**

Open `http://localhost:3000/access-analysis`. Confirm: a single pie chart titled
"Role distribution" with a scrollable legend of role names, hover tooltips
showing `role: count (percent)`, and no filter bar / user table.

---

## Notes for the executor
- All test commands use Vitest name/file filters (`-t`, bare filename) to avoid
  PowerShell choking on the `(dashboard)` parentheses in raw paths.
- The `EChart` wrapper, `loadInstanceView`, `modules.ts`, and `loading.tsx` are
  intentionally kept — do not delete them.
- If any `git rm` path does not exist, it was already removed or misnamed —
  re-list the directory before forcing.
