# Access-Analysis Cross-Filter Clarity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/access-analysis` donut cross-filter legible at a glance — clear cause→effect, discoverability, reversibility, and mode separation — without touching the `applySliceFilters` engine.

**Architecture:** A presentational feedback layer over the existing engine. A new `FilterBanner` replaces the tiny pill row as the primary "you are filtering" surface (names the filter + shows "N of M projects" + one prominent Clear). An idle tip occupies the same slot when nothing is filtered. The four filterable donuts get an explicit pointer cursor, and the "View N people" affordance becomes a distinct icon button so it reads as separate from the filter gesture.

**Tech Stack:** Next.js (App Router) client components, React, TypeScript, ECharts (via mocked `echarts-for-react` in tests), the `@/components/ui/motion` facade (`useSafeVariants`), Vitest + @testing-library/react.

## Global Constraints

- **Explicit-path staging only** — `git add <exact file>`; NEVER `git add -A` / `.` / `-u`. Before every commit run `git diff --cached --name-only` and confirm only this task's files are staged.
- **`npx tsc --noEmit` must exit 0** after each task (the build typechecks the whole tree). NEVER run `npm run build` — it 500s the live `:3000` server.
- **Scope = `app/(dashboard)/access-analysis/` only.** `git diff --name-only` must touch zero files under `app/(dashboard)/users/access-analysis/` or `app/(dashboard)/users/spatial-graph/`.
- **Do not touch the engine** (`applySliceFilters`, the donut memos) or the locked decisions: a slice click must NOT open the people panel and must NOT re-animate the KPI count; `Clear filters` clears only `sliceFilters`, never the Project Picker `selected`.
- **Baseline:** the 2 pre-existing `FolderPermissionTerrain` test failures (unrelated concurrent WIP) are the ONLY known failures and must remain the only failures.
- **No new queries.** All numbers derive from in-memory rows already passed as props.
- **No jest-dom matchers** (project convention) — assert with plain DOM (`.textContent`, `.querySelector`, `container.firstChild`, `toBeTruthy/Falsy`, `toHaveLength`, `toHaveBeenCalledWith`).
- Filter values are server-origin DB strings — render as React text nodes, never `dangerouslySetInnerHTML`.

## File Structure

| File | Responsibility |
|------|----------------|
| `components/FilterBanner.tsx` (new) | Presentational banner: 🔍 + active-filter chips (per-chip ×) + "N of M projects" scope + prominent "Clear filters". Renders null when no filter. |
| `__tests__/FilterBanner.test.tsx` (new) | Unit tests for the banner (null state, scope text, chip remove, clear). |
| `components/AccessAnalysisCharts.tsx` (modify) | Swap the `PillBar` row for `{idle-tip OR FilterBanner}`; compute `shown`/`total`; restyle the "View N people" button (Task 3). |
| `__tests__/AccessAnalysisCharts.test.tsx` (modify) | Re-point `slice-pill-bar`→`filter-banner`, `clear all`→`clear filters`; add idle-tip + scope + people-icon assertions. |
| `components/RolesPieChart.tsx`, `CompaniesPieChart.tsx`, `ActivityByRolePieChart.tsx`, `CompaniesActivityPieChart.tsx` (modify) | Explicit `cursor: "pointer"` on the pie series (Task 4). |
| `components/PillBar.tsx` | Superseded — import + render removed from the page. File and its test stay in place (unused) to preserve the test baseline. |

---

### Task 1: `FilterBanner` component

**Files:**
- Create: `app/(dashboard)/access-analysis/components/FilterBanner.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/FilterBanner.test.tsx`

**Interfaces:**
- Consumes: `SliceFilters` from `../projectFilter` (a `{ [dim: string]: string }` map; `Object.entries` yields `[string, string]`).
- Produces: `export function FilterBanner(props: FilterBannerProps)` and `export interface FilterBannerProps { filters: SliceFilters; shown: number; total: number; onRemove: (dim: string) => void; onClear: () => void; labels?: Partial<Record<string, string>> }`. Testids: `filter-banner`, `filter-scope`, `filter-clear`; each chip remove button has `aria-label="Remove <Label> filter"`.

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/access-analysis/__tests__/FilterBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBanner } from "../components/FilterBanner";

describe("FilterBanner", () => {
  it("renders nothing when no filters are active", () => {
    const { container } = render(
      <FilterBanner filters={{}} shown={1152} total={1152} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows the N-of-M project scope", () => {
    render(
      <FilterBanner
        filters={{ role: "Architect" }}
        shown={340}
        total={1152}
        onRemove={() => {}}
        onClear={() => {}}
        labels={{ role: "Role" }}
      />,
    );
    expect(screen.getByTestId("filter-scope").textContent).toBe("Showing 340 of 1,152 projects");
  });

  it("renders one chip per dimension and removes via ×", () => {
    const onRemove = vi.fn();
    render(
      <FilterBanner
        filters={{ role: "Architect", company: "Acme" }}
        shown={120}
        total={1152}
        onRemove={onRemove}
        onClear={() => {}}
        labels={{ role: "Role", company: "Company" }}
      />,
    );
    expect(screen.getAllByRole("button", { name: /Remove .* filter/ })).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Remove Role filter" }));
    expect(onRemove).toHaveBeenCalledWith("role");
  });

  it("clears all filters via Clear filters", () => {
    const onClear = vi.fn();
    render(
      <FilterBanner
        filters={{ role: "Architect" }}
        shown={340}
        total={1152}
        onRemove={() => {}}
        onClear={onClear}
        labels={{ role: "Role" }}
      />,
    );
    fireEvent.click(screen.getByTestId("filter-clear"));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/FilterBanner.test.tsx`
Expected: FAIL — `Cannot find module '../components/FilterBanner'`.

- [ ] **Step 3: Write minimal implementation**

Create `app/(dashboard)/access-analysis/components/FilterBanner.tsx`:

```tsx
"use client";
import { AnimatePresence, motion, useSafeVariants } from "@/components/ui/motion";
import type { SliceFilters } from "../projectFilter";

export interface FilterBannerProps {
  filters: SliceFilters;
  /** Projects in view AFTER the active slice filter (N). */
  shown: number;
  /** Projects in the current Project-Picker view, before slice filtering (M). */
  total: number;
  onRemove: (dim: string) => void;
  onClear: () => void;
  /** Optional dim → human label, e.g. { role: "Role", company: "Company" } */
  labels?: Partial<Record<string, string>>;
}

const chipVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.15, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.85, transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] } },
} as const;

/**
 * FilterBanner — the primary "you are cross-filtering" surface for /access-analysis.
 * Supersedes the old tiny PillBar row: names every active slice filter, shows the
 * "N of M projects" scope, and offers ONE prominent Clear filters. Renders null when
 * no filter is active (the parent shows the idle tip in that slot instead).
 *
 * Presentational only — no engine logic. Values are server-origin DB strings rendered
 * as React text nodes (never dangerouslySetInnerHTML).
 */
export function FilterBanner({ filters, shown, total, onRemove, onClear, labels }: FilterBannerProps) {
  // Hook called unconditionally (before the early return) to satisfy rules-of-hooks.
  const safeVariants = useSafeVariants(
    chipVariants as unknown as Record<string, { transition?: Record<string, unknown>; [k: string]: unknown }>,
  );
  const entries = Object.entries(filters);
  if (entries.length === 0) return null;

  return (
    <div
      data-testid="filter-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-base">🔍</span>
        <span className="text-sm font-semibold text-foreground">Filtered:</span>
        <AnimatePresence initial={false}>
          {entries.map(([dim, value]) => {
            const label = labels?.[dim] ?? dim;
            return (
              <motion.span
                key={dim}
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={safeVariants as typeof chipVariants}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {label}
                {" = "}
                {value}
                <button
                  type="button"
                  aria-label={`Remove ${label} filter`}
                  onClick={() => onRemove(dim)}
                  className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
                >
                  ×
                </button>
              </motion.span>
            );
          })}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-3">
        <span data-testid="filter-scope" className="text-sm tabular-nums text-muted-foreground">
          Showing {shown.toLocaleString()} of {total.toLocaleString()} projects
        </span>
        <button
          type="button"
          data-testid="filter-clear"
          onClick={onClear}
          className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/FilterBanner.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FilterBanner.tsx" "app/(dashboard)/access-analysis/__tests__/FilterBanner.test.tsx"
git diff --cached --name-only   # confirm ONLY these 2 files
git commit -m "feat(access-analysis): FilterBanner — named filters + N-of-M scope + Clear filters"
```

---

### Task 2: Wire the idle-tip ↔ FilterBanner swap into the page

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (import at line 27; render block at lines 243-248)
- Test: `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`

**Interfaces:**
- Consumes: `FilterBanner` from `./FilterBanner` (Task 1); existing `sliceFilters` state, `toggleSliceFilter`, `setSliceFilters`, `selected` (a `Set<string>`), and `sliceFilteredProjectIds` (a `Set<string>`, already defined at line 140).
- Produces: testid `filter-idle-tip` (idle state) and the `filter-banner` surface (active state) in place of the retired `slice-pill-bar`.

- [ ] **Step 1: Update the existing tests to the new surface (they will fail first)**

In `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`, in the `INT-04 slice cross-filter` and `INT-02 View N people` describes, replace the retired testids/labels:
- every `getByTestId("slice-pill-bar")` → `getByTestId("filter-banner")` (lines ~165, 187, 202, 224, 253)
- every `queryByTestId("slice-pill-bar")` → `queryByTestId("filter-banner")` (lines ~191, 205)
- `getByRole("button", { name: /clear all/i })` → `getByRole("button", { name: /clear filters/i })` (line ~204)

Then add these two tests inside the `INT-04 slice cross-filter` describe:

```tsx
  it("shows the idle tip when nothing is filtered", () => {
    const { getByTestId, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    expect(getByTestId("filter-idle-tip").textContent).toContain("click any chart slice");
    expect(queryByTestId("filter-banner")).toBeFalsy();
  });

  it("swaps the idle tip for the FilterBanner with N-of-M scope on slice click", () => {
    const { getByTestId, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }));
    expect(queryByTestId("filter-idle-tip")).toBeFalsy();
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    expect(getByTestId("filter-scope").textContent).toMatch(/Showing \d+ of \d+ projects/);
  });
```

- [ ] **Step 2: Run the updated tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`
Expected: FAIL — `filter-idle-tip` / `filter-banner` not found (page still renders `slice-pill-bar`).

- [ ] **Step 3: Swap the import**

In `AccessAnalysisCharts.tsx` line 27, replace:

```tsx
import { PillBar } from "./PillBar";
```

with:

```tsx
import { FilterBanner } from "./FilterBanner";
```

- [ ] **Step 4: Replace the render block**

Replace the `<PillBar ... />` block (lines 243-248):

```tsx
      <PillBar
        filters={sliceFilters}
        onRemove={(d) => toggleSliceFilter(d, sliceFilters[d])}
        onClear={() => setSliceFilters({})}
        labels={{ role: "Role", company: "Company" }}
      />
```

with the idle-tip ↔ banner swap (same slot; mutually exclusive):

```tsx
      {Object.keys(sliceFilters).length === 0 ? (
        <p data-testid="filter-idle-tip" className="text-sm text-muted-foreground">
          <span aria-hidden>💡 </span>Tip — click any chart slice to filter the dashboard.
        </p>
      ) : (
        <FilterBanner
          filters={sliceFilters}
          shown={sliceFilteredProjectIds.size}
          total={selected.size}
          onRemove={(d) => toggleSliceFilter(d, sliceFilters[d])}
          onClear={() => setSliceFilters({})}
          labels={{ role: "Role", company: "Company" }}
        />
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`
Expected: PASS (all INT-04 / INT-02 tests, including the two new ones).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If `sliceFilters[d]` now reports a type error it did not before, mirror the original call exactly — it compiled in 05-02; do not change `SliceFilters`.)

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"
git diff --cached --name-only   # confirm ONLY these 2 files
git commit -m "feat(access-analysis): idle-tip + FilterBanner swap replaces tiny pill row"
```

---

### Task 3: Restyle "View N people" as a distinct icon button

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (the `SectionHeaderWithPeople` button, lines 514-523)
- Test: `app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`

**Interfaces:**
- Consumes: existing `SectionHeaderWithPeople` (`testId`, `uniquePeople`, `onViewPeople`).
- Produces: the `view-people-*` button now contains an inline people `<svg>` icon; testid and click behavior unchanged (still opens the people sheet).

- [ ] **Step 1: Add the failing assertion**

In `AccessAnalysisCharts.test.tsx`, inside the `INT-02 View N people` describe, add:

```tsx
  it("renders the View people control as a distinct icon button", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    const btn = getByTestId("view-people-role");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.querySelector("svg")).toBeTruthy(); // people icon present
    expect(btn.textContent).toContain("View");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx -t "distinct icon button"`
Expected: FAIL — no `<svg>` inside the button yet.

- [ ] **Step 3: Add the icon + sharpen the button styling**

In `SectionHeaderWithPeople`, replace the button (lines 514-523) with an icon-led button that reads as a distinct action (drop the trailing `→`, add a people glyph, slightly stronger affordance):

```tsx
      {uniquePeople.length > 0 && (
        <button
          type="button"
          data-testid={testId}
          onClick={() => onViewPeople(uniquePeople)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary shadow-sm transition hover:bg-primary/20"
        >
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          View {uniquePeople.length} {uniquePeople.length === 1 ? "person" : "people"}
        </button>
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`
Expected: PASS (new test + the existing `view-people-role` open-sheet test still green).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx"
git diff --cached --name-only   # confirm ONLY these 2 files
git commit -m "feat(access-analysis): View-people becomes a distinct icon button (mode separation)"
```

---

### Task 4: Explicit pointer cursor on the four filterable donuts

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/RolesPieChart.tsx`, `CompaniesPieChart.tsx`, `ActivityByRolePieChart.tsx`, `CompaniesActivityPieChart.tsx`

**Interfaces:** none changed — adds `cursor: "pointer"` to each pie series option.

**Note:** ECharts pie series already default `cursor` to `pointer`; this makes the click affordance explicit and guards against any theme/global override. It has no jsdom-observable behavior (the test mock only reads `series[0].data` names), so it is verified by `tsc` + the owner's visual recheck rather than a contrived unit test — consistent with how chart-visual concerns are handled in this codebase.

- [ ] **Step 1: Add `cursor: "pointer"` to each pie series**

In each of the four files, locate the `series: [{ name: ..., type: "pie", ... }]` option object and add `cursor: "pointer",` as a series-level key (sibling of `radius`/`center`). Example for `RolesPieChart.tsx` (the series begins at line 178):

```tsx
      {
        name: "Roles",
        type: "pie",
        cursor: "pointer",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        // ...unchanged...
```

Apply the identical one-line addition to the pie series in `CompaniesPieChart.tsx`, `ActivityByRolePieChart.tsx`, and `CompaniesActivityPieChart.tsx`. Do NOT change `ModulesPieChart.tsx` or `ActivityTimelineChart.tsx` (non-filterable).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (`cursor` is a valid `PieSeriesOption` key).

- [ ] **Step 3: Run the access-analysis suite to confirm no regression**

Run: `npx vitest run app/\(dashboard\)/access-analysis`
Expected: PASS — all green except the 2 pre-existing `FolderPermissionTerrain` failures (baseline, unchanged).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/RolesPieChart.tsx" "app/(dashboard)/access-analysis/components/CompaniesPieChart.tsx" "app/(dashboard)/access-analysis/components/ActivityByRolePieChart.tsx" "app/(dashboard)/access-analysis/components/CompaniesActivityPieChart.tsx"
git diff --cached --name-only   # confirm ONLY these 4 files
git commit -m "feat(access-analysis): explicit pointer cursor on filterable donut slices"
```

---

## Final Verification

- [ ] `npx tsc --noEmit` exits 0.
- [ ] `npx vitest run app/\(dashboard\)/access-analysis` — all green except the 2 known `FolderPermissionTerrain` failures.
- [ ] `git diff --name-only <base>..HEAD` touches only files under `app/(dashboard)/access-analysis/` — zero under `users/access-analysis/` or `users/spatial-graph/`.
- [ ] Owner visual recheck on a rebuilt `:3000`: idle tip shows when unfiltered; clicking a slice swaps it for the banner naming the filter + "N of M projects"; `Clear filters` returns to the full view in one click; the "View people" button reads as a separate action; donut slices show a pointer cursor.

## Self-Review

**Spec coverage:**
- FilterBanner (icon + chips + scope + Clear) → Task 1 + wired in Task 2. ✓
- Idle tip mutually exclusive with banner → Task 2. ✓
- "N of M projects" scope from `sliceFilteredProjectIds.size` / `selected.size` → Task 2. ✓
- Reversibility (prominent Clear filters) → Task 1 (`filter-clear`) + Task 2. ✓
- Discoverability cursor on 4 filterable donuts → Task 4. ✓
- Mode separation (distinct View-people icon button) → Task 3. ✓
- PillBar retired from the page (import + render removed), file left unused → Task 2. ✓
- Engine + locked decisions untouched; slice-click-no-panel test preserved (INT-02 "does NOT open the people sheet", re-pointed to `filter-banner`). ✓

**Placeholder scan:** none — every code/test step shows complete code and exact commands.

**Type consistency:** `FilterBannerProps` (`filters/shown/total/onRemove/onClear/labels`) is defined in Task 1 and consumed verbatim in Task 2. Testids (`filter-banner`, `filter-scope`, `filter-clear`, `filter-idle-tip`, `view-people-role`) are consistent across tasks. `sliceFilteredProjectIds` and `selected` are existing `Set<string>` values (`.size` used for scope).
