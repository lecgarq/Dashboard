# Access Analysis Charts UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the `/access-analysis` chart dashboard into a calm, executive-first enterprise dashboard with consistent chrome, token-based color, promoted "so what" insights, and visible/clearable crossfilter interactivity — without changing any data, queries, or metrics.

**Architecture:** Approach A — lay a thin shared foundation (`ChartPanel` shell + `chartColors` token module), then migrate panels in executive-first priority order, then reorganize the page into labeled sections. Both render paths (DuckDB-Wasm "ready" and CSS "fallback") route through the same `ChartPanel`.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, Tailwind v4 with CSS custom-property tokens in `app/globals.css`, `@uwdata/vgplot` + `@uwdata/mosaic-core` for crossfilter charts, Vitest + Testing Library (jsdom) for unit tests.

**Spec:** `docs/superpowers/specs/2026-05-21-access-analysis-charts-redesign-design.md`

**Conventions for every task:**
- Working dir: `C:\LECG\Dashboard`. All paths below are repo-relative.
- Run a single test file: `npx vitest run "app/(dashboard)/users/access-analysis/<file>.test.tsx"` (quotes required — the path contains parentheses).
- **Surgical staging (branch rule):** stage commits by **explicit path only**. Never `git add -A` or `git add .` — the branch carries large unrelated WIP.
- End commit messages with `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.

---

## File Structure

**New files (all in `app/(dashboard)/users/access-analysis/`):**
- `chartColors.ts` — pure token→color resolver (semantic roles + curated sequence). Single source of truth for chart color.
- `chartColors.test.ts` — unit tests for the resolver.
- `ChartPanel.tsx` — the one card shell every chart sits in (header: title/subtitle/insight/affordance).
- `ChartPanel.test.tsx` — unit tests for the shell.
- `HeadlineInsights.tsx` — executive "so what" band built from `buildExecutiveFindings`.
- `HeadlineInsights.test.tsx` — unit tests.
- `selectionFilters.ts` — pure helpers to describe + clear Mosaic crossfilter clauses.
- `selectionFilters.test.ts` — unit tests using a fake selection.
- `ActiveFiltersBar.tsx` — chip row driven by `selectionFilters`.

**Modified files:**
- `DonutPanel.tsx`, `DistributionPanel.tsx`, `HistogramPanel.tsx`, `HeatmapPanel.tsx` — adopt `ChartPanel`.
- `KpiHeroStrip.tsx` — semantic accents via `chartColors`.
- `HybridAnalyticsSurface.tsx` — token-based donut/data colors, headline-insights band, active-filters bar, section reorder, route `FallbackBarPanel` through `ChartPanel`.

---

## Task 1: Chart color token module

**Files:**
- Create: `app/(dashboard)/users/access-analysis/chartColors.ts`
- Test: `app/(dashboard)/users/access-analysis/chartColors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chartColor, sequenceColor } from "./chartColors";

describe("chartColors", () => {
  it("resolves semantic roles to light-theme fallback hex in jsdom", () => {
    // jsdom returns "" for CSS custom properties, so the fallback map is used.
    expect(chartColor("good")).toBe("#059669");
    expect(chartColor("watch")).toBe("#D97706");
    expect(chartColor("risk")).toBe("#EF4444");
    expect(chartColor("info")).toBe("#2563EB");
    expect(chartColor("neutral")).toBe("#6B7280");
  });

  it("returns curated sequence colors and wraps after five", () => {
    expect(sequenceColor(0)).toBe("#2563EB");
    expect(sequenceColor(4)).toBe("#EA580C");
    expect(sequenceColor(5)).toBe("#2563EB"); // wraps
    expect(sequenceColor(-1)).toBe("#EA580C"); // negative wraps
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/chartColors.test.ts"`
Expected: FAIL — cannot find module `./chartColors`.

- [ ] **Step 3: Write minimal implementation**

```ts
// chartColors.ts
// Single source of truth for chart color. Resolves a semantic role or
// sequence index to a concrete color string, reading the live CSS custom
// property at runtime (so dark mode works) and falling back to the
// light-theme hex when unavailable (SSR + jsdom tests).

export type ChartRole =
  | "good"
  | "watch"
  | "risk"
  | "info"
  | "neutral"
  | "seq1"
  | "seq2"
  | "seq3"
  | "seq4"
  | "seq5";

const VAR_NAME: Record<ChartRole, string> = {
  good: "--success",
  watch: "--warning",
  risk: "--destructive",
  info: "--info",
  neutral: "--muted-foreground",
  seq1: "--chart-1",
  seq2: "--chart-2",
  seq3: "--chart-3",
  seq4: "--chart-4",
  seq5: "--chart-5",
};

// Light-theme values from app/globals.css :root. Used when getComputedStyle
// cannot resolve the custom property (jsdom, SSR).
const FALLBACK_HEX: Record<ChartRole, string> = {
  good: "#059669",
  watch: "#D97706",
  risk: "#EF4444",
  info: "#2563EB",
  neutral: "#6B7280",
  seq1: "#2563EB",
  seq2: "#0F766E",
  seq3: "#D97706",
  seq4: "#7C3AED",
  seq5: "#EA580C",
};

const SEQUENCE: ChartRole[] = ["seq1", "seq2", "seq3", "seq4", "seq5"];

export function chartColor(role: ChartRole): string {
  const fallback = FALLBACK_HEX[role];
  if (typeof window === "undefined" || typeof getComputedStyle !== "function") {
    return fallback;
  }
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(VAR_NAME[role])
    .trim();
  return resolved || fallback;
}

/** Nth color from the curated 5-color sequence, wrapping (and handling negatives). */
export function sequenceColor(index: number): string {
  const n = SEQUENCE.length;
  return chartColor(SEQUENCE[((index % n) + n) % n]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/chartColors.test.ts"`
Expected: PASS (5 assertions across 2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/chartColors.ts" "app/(dashboard)/users/access-analysis/chartColors.test.ts"
git commit -m "feat(acc-analysis): chart color token resolver

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: ChartPanel shell

**Files:**
- Create: `app/(dashboard)/users/access-analysis/ChartPanel.tsx`
- Test: `app/(dashboard)/users/access-analysis/ChartPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartPanel } from "./ChartPanel";

describe("ChartPanel", () => {
  it("renders title, subtitle, insight, affordance, and children", () => {
    render(
      <ChartPanel
        title="User status"
        subtitle="Aggregated across project memberships"
        insight={{ text: "3 members are stale.", severity: "risk" }}
        affordance="click-to-filter"
      >
        <div data-testid="body">chart</div>
      </ChartPanel>,
    );

    expect(screen.getByRole("heading", { name: "User status" })).toBeTruthy();
    expect(screen.getByText("Aggregated across project memberships")).toBeTruthy();
    expect(screen.getByText("3 members are stale.")).toBeTruthy();
    expect(screen.getByText("click to filter")).toBeTruthy();
    expect(screen.getByTestId("body")).toBeTruthy();
  });

  it("omits optional regions when not provided", () => {
    render(
      <ChartPanel title="Bare">
        <div>body</div>
      </ChartPanel>,
    );

    expect(screen.getByRole("heading", { name: "Bare" })).toBeTruthy();
    expect(screen.queryByText("click to filter")).toBeNull();
    expect(screen.queryByText("drag to filter")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/ChartPanel.test.tsx"`
Expected: FAIL — cannot find module `./ChartPanel`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// ChartPanel.tsx
"use client";

import type { ReactNode } from "react";
import { chartColor } from "./chartColors";

export type InsightSeverity = "good" | "watch" | "risk" | "info";

export interface ChartPanelProps {
  title: string;
  subtitle?: string;
  insight?: { text: string; severity?: InsightSeverity };
  affordance?: "drag-to-filter" | "click-to-filter";
  className?: string;
  children: ReactNode;
}

const AFFORDANCE_LABEL: Record<NonNullable<ChartPanelProps["affordance"]>, string> = {
  "drag-to-filter": "drag to filter",
  "click-to-filter": "click to filter",
};

export function ChartPanel({
  title,
  subtitle,
  insight,
  affordance,
  className,
  children,
}: ChartPanelProps) {
  return (
    <section
      className={`rounded-lg border bg-card p-5 shadow-[var(--shadow-soft-sm)] ${className ?? ""}`}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
          {insight ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-foreground/80">
              {insight.severity ? (
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: chartColor(insight.severity) }}
                />
              ) : null}
              <span className="min-w-0">{insight.text}</span>
            </p>
          ) : null}
        </div>
        {affordance ? (
          <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
            {AFFORDANCE_LABEL[affordance]}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/ChartPanel.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/ChartPanel.tsx" "app/(dashboard)/users/access-analysis/ChartPanel.test.tsx"
git commit -m "feat(acc-analysis): shared ChartPanel shell

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Migrate DonutPanel onto ChartPanel

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/DonutPanel.tsx`
- Test (existing, keep green): `app/(dashboard)/users/access-analysis/DonutPanel.test.tsx`

The `finding` prop becomes the ChartPanel `insight`. The donut SVG + legend body stays exactly the same. The empty state ("No data") moves inside the panel body so the chrome is consistent.

- [ ] **Step 1: Update the import block and component shell**

Replace the top of `DonutPanel.tsx` (the existing `"use client";` line) by adding the import directly under it:

```tsx
"use client";

import { ChartPanel } from "./ChartPanel";
```

- [ ] **Step 2: Replace the returned markup**

Replace the entire `return ( ... );` block (currently `<section className="rounded-lg border bg-card p-4 shadow-sm">` … `</section>`) with:

```tsx
  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      insight={finding ? { text: finding } : undefined}
      affordance={onSliceClick ? "click-to-filter" : undefined}
    >
      {total === 0 ? (
        <div className="flex h-[200px] items-center justify-center text-xs text-muted-foreground">
          No data
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="shrink-0"
            role="img"
            aria-label={title}
          >
            {slices.map((s, i) => (
              <path
                key={`${s.label}-${i}`}
                d={s.path}
                fill={s.color}
                fillRule="evenodd"
                stroke="var(--background, white)"
                strokeWidth={1.5}
                onClick={() => onSliceClick?.(s)}
                className={onSliceClick ? "cursor-pointer hover:opacity-85 transition-all" : ""}
              >
                <title>{`${s.label}: ${s.value.toLocaleString()} (${(s.share * 100).toFixed(1)}%)`}</title>
              </path>
            ))}
            {centerValue !== undefined ? (
              <>
                <text
                  x={CX}
                  y={CY - 4}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: 22, fontWeight: 600 }}
                >
                  {centerValue}
                </text>
                {centerLabel ? (
                  <text
                    x={CX}
                    y={CY + 16}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}
                  >
                    {centerLabel}
                  </text>
                ) : null}
              </>
            ) : null}
          </svg>
          <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
            {slices.map((s, i) => (
              <li
                key={`${s.label}-${i}`}
                onClick={() => onSliceClick?.(s)}
                className={`flex items-center justify-between gap-2 rounded-sm p-0.5 ${
                  onSliceClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate font-medium" title={s.label}>{s.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.value.toLocaleString()}</span>
                  <span> · {(s.share * 100).toFixed(0)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartPanel>
  );
```

- [ ] **Step 3: Run the existing DonutPanel test**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/DonutPanel.test.tsx"`
Expected: PASS — the empty state, the `role="img"` chart, the legend label `title` attribute, and the finding text all still render.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/DonutPanel.tsx"
git commit -m "refactor(acc-analysis): DonutPanel onto ChartPanel shell

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Token-based colors for KPIs and donut data

Replaces hardcoded hex palettes with semantic/sequence tokens. No new tests — covered by existing `HybridAnalyticsSurface.fallback.test.tsx` (must stay green).

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/KpiHeroStrip.tsx`
- Modify: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx`

- [ ] **Step 1: KpiHeroStrip — import the resolver**

Add under the existing imports in `KpiHeroStrip.tsx`:

```tsx
import { chartColor } from "./chartColors";
```

- [ ] **Step 2: KpiHeroStrip — replace the six accent hex values**

In the returned `<KpiCard ... />` list, change each `accent` prop:
- Total members: `accent={chartColor("info")}`
- Active (30d): `accent={chartColor("good")}`
- Active admins: `accent={chartColor("watch")}`
- Stale members: `accent={chartColor("risk")}`
- Access changes: `accent={chartColor("neutral")}`
- Folder grants: `accent={chartColor("info")}`

(Replace the literal strings `"#3b82f6"`, `"#10b981"`, `"#f59e0b"`, `"#ef4444"`, `"#8b5cf6"`, `"#ec4899"` respectively.)

- [ ] **Step 3: HybridAnalyticsSurface — import the resolvers**

Add to the import block in `HybridAnalyticsSurface.tsx`:

```tsx
import { chartColor, sequenceColor } from "./chartColors";
```

- [ ] **Step 4: Replace the donut color constants with token-based maps**

Delete these constants near the top of the file:
```tsx
const STATUS_COLORS: Record<string, string> = { ... };
const RECENCY_COLORS = [ ... ];
const PERM_TIER_COLORS = [ ... ];
const ADMIN_MIX_COLORS = [ ... ];
```

Replace with:
```tsx
const STATUS_ROLE: Record<string, Parameters<typeof chartColor>[0]> = {
  active: "good",
  pending: "watch",
  deleted: "risk",
  unknown: "neutral",
};
const RECENCY_ROLES = ["good", "info", "watch", "neutral"] as const;
const ADMIN_MIX_ROLES = ["risk", "watch", "info", "neutral"] as const;
```

- [ ] **Step 5: Update the donut compute functions to resolve tokens**

In `computeUserStatus`, change the slice color to:
```tsx
      color: chartColor(STATUS_ROLE[label] ?? "neutral"),
```

In `computeActivityRecency`, change the final map to:
```tsx
  return buckets.map((b, i) => ({ ...b, color: chartColor(RECENCY_ROLES[i]) }));
```

In `computeAdminMix`, change the returned slices to use `chartColor(ADMIN_MIX_ROLES[0..3])` in place of `ADMIN_MIX_COLORS[0..3]`.

In `computePermTiers`, change the mapped color to:
```tsx
    .map(([label, value], i) => ({ label, value, color: sequenceColor(i) }));
```

- [ ] **Step 6: Run the fallback regression test**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx"`
Expected: PASS (the test asserts structure/labels, not specific hex, so token colors are compatible).

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/KpiHeroStrip.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx"
git commit -m "feat(acc-analysis): token-based colors for KPIs and donuts

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Headline insights band

A clickable executive "so what" band built from `buildExecutiveFindings`. Each item carries a severity and an `onClick` to open the matching existing drill-down.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/HeadlineInsights.tsx`
- Test: `app/(dashboard)/users/access-analysis/HeadlineInsights.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeadlineInsights, type HeadlineInsightItem } from "./HeadlineInsights";

const items: HeadlineInsightItem[] = [
  { id: "stale", label: "Stale members", text: "12 members are stale.", severity: "risk" },
  { id: "active", label: "Active", text: "40 members signed in within 30 days.", severity: "good" },
];

describe("HeadlineInsights", () => {
  it("renders each insight's text", () => {
    render(<HeadlineInsights items={items} />);
    expect(screen.getByText("12 members are stale.")).toBeTruthy();
    expect(screen.getByText("40 members signed in within 30 days.")).toBeTruthy();
  });

  it("invokes onSelect with the item id when clicked", () => {
    const onSelect = vi.fn();
    render(<HeadlineInsights items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("12 members are stale."));
    expect(onSelect).toHaveBeenCalledWith("stale");
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<HeadlineInsights items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HeadlineInsights.test.tsx"`
Expected: FAIL — cannot find module `./HeadlineInsights`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// HeadlineInsights.tsx
"use client";

import { chartColor } from "./chartColors";
import type { InsightSeverity } from "./ChartPanel";

export interface HeadlineInsightItem {
  id: string;
  label: string;
  text: string;
  severity: InsightSeverity;
}

export interface HeadlineInsightsProps {
  items: HeadlineInsightItem[];
  onSelect?: (id: string) => void;
}

export function HeadlineInsights({ items, onSelect }: HeadlineInsightsProps) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id)}
          className="group flex flex-col gap-1 rounded-lg border bg-card p-4 text-left shadow-[var(--shadow-soft-sm)] transition-colors hover:bg-muted/40"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: chartColor(item.severity) }}
            />
            {item.label}
          </span>
          <span className="text-sm font-medium text-foreground/90">{item.text}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HeadlineInsights.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the band into HybridAnalyticsSurface**

In `HybridAnalyticsSurface.tsx`, add to the import block:
```tsx
import { HeadlineInsights, type HeadlineInsightItem } from "./HeadlineInsights";
```

After `const findings = useMemo(...)` (already present), add a derived list. The `staleMembers` count for severity is already available via `summary?.staleMembers` / the KPI logic; use the finding strings directly with fixed severities:
```tsx
  const headlineItems = useMemo<HeadlineInsightItem[]>(
    () => [
      { id: "stale", label: "Stale access", text: findings.staleMembers, severity: "risk" },
      { id: "active", label: "Active members", text: findings.activeMembers, severity: "good" },
      { id: "admins", label: "Admin concentration", text: findings.adminConcentration, severity: "watch" },
      { id: "breadth", label: "Access breadth", text: findings.projectBreadth, severity: "info" },
    ],
    [findings],
  );
```

Add a click handler that reuses existing drill-downs (placed near `handleVgPlotClick`):
```tsx
  const handleHeadlineSelect = (id: string) => {
    const now = Date.now();
    if (id === "stale") {
      setDetailFilter({
        title: "Stale or never signed-in members",
        subtitle: "Members with no sign-in in over 90 days (or never).",
        filterFn: (u) => {
          const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
          if (!Number.isFinite(t)) return true;
          return (now - t) / 86_400_000 > 90;
        },
      });
    } else if (id === "active") {
      setDetailFilter({
        title: "Members active in the last 30 days",
        subtitle: "Members who signed in within the last 30 days.",
        filterFn: (u) => {
          const t = u.lastSignIn ? Date.parse(u.lastSignIn) : NaN;
          return Number.isFinite(t) && (now - t) / 86_400_000 <= 30;
        },
      });
    } else if (id === "admins") {
      setDetailFilter({
        title: "Admins",
        subtitle: "Members with account or project admin access.",
        filterFn: (u) => u.isAccountAdmin || u.adminCount > 0,
      });
    } else if (id === "breadth") {
      setDetailFilter({
        title: "Members with 10+ projects",
        subtitle: "Broad-access members who belong to ten or more projects.",
        filterFn: (u) => u.projectCount >= 10,
      });
    }
  };
```

Render the band immediately after `<KpiHeroStrip ... />`:
```tsx
      <HeadlineInsights items={headlineItems} onSelect={handleHeadlineSelect} />
```

- [ ] **Step 6: Run the surface regression test**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/HeadlineInsights.tsx" "app/(dashboard)/users/access-analysis/HeadlineInsights.test.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx"
git commit -m "feat(acc-analysis): executive headline insights band

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Active-filters bar (visible crossfilter)

Surfaces current Mosaic crossfilter clauses as removable chips with Clear all. The describe/clear logic lives in a pure, testable module; the component is a thin wrapper that subscribes to selection changes.

**Files:**
- Create: `app/(dashboard)/users/access-analysis/selectionFilters.ts`
- Test: `app/(dashboard)/users/access-analysis/selectionFilters.test.ts`
- Create: `app/(dashboard)/users/access-analysis/ActiveFiltersBar.tsx`
- Modify: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx`

- [ ] **Step 1: Write the failing test for the pure helpers**

```ts
import { describe, expect, it, vi } from "vitest";
import { describeActiveFilters, clearAllFilters, type SelectionLike } from "./selectionFilters";

function fakeSelection(clauses: Array<{ source: unknown; predicate: unknown }>): SelectionLike {
  return {
    clauses,
    update: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe("selectionFilters", () => {
  it("describes active clauses with a label and source", () => {
    const sel = fakeSelection([
      { source: "users:project_count", predicate: { toString: () => '"project_count" BETWEEN 4 AND 10' } },
    ]);
    const result = describeActiveFilters([{ selection: sel, scope: "Users" }]);
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("Users");
    expect(result[0].label).toContain("project_count");
  });

  it("ignores clauses with an empty predicate", () => {
    const sel = fakeSelection([{ source: "users:x", predicate: null }]);
    expect(describeActiveFilters([{ selection: sel, scope: "Users" }])).toHaveLength(0);
  });

  it("clears each active clause by re-issuing a null predicate for its source", () => {
    const clause = { source: "users:project_count", predicate: { toString: () => "x" } };
    const sel = fakeSelection([clause]);
    clearAllFilters([{ selection: sel, scope: "Users" }]);
    expect(sel.update).toHaveBeenCalledWith({ source: clause.source, predicate: null, value: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/selectionFilters.test.ts"`
Expected: FAIL — cannot find module `./selectionFilters`.

- [ ] **Step 3: Write minimal implementation of the pure helpers**

```ts
// selectionFilters.ts
// Pure helpers for reading + clearing Mosaic crossfilter selections, kept
// free of React so they are unit-testable with a fake selection. The runtime
// Mosaic Selection satisfies SelectionLike structurally.

export interface ClauseLike {
  source: unknown;
  predicate: { toString(): string } | null | undefined;
}

export interface SelectionLike {
  clauses: ClauseLike[];
  update(clause: { source: unknown; predicate: null; value: null }): void;
  addEventListener(type: "value", cb: () => void): void;
  removeEventListener(type: "value", cb: () => void): void;
}

export interface ScopedSelection {
  selection: SelectionLike;
  scope: string;
}

export interface ActiveFilter {
  key: string;
  scope: string;
  label: string;
  source: unknown;
  selection: SelectionLike;
}

function predicateText(clause: ClauseLike): string {
  const p = clause.predicate;
  if (p === null || p === undefined) return "";
  const text = String(p).trim();
  return text;
}

export function describeActiveFilters(scoped: ScopedSelection[]): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  for (const { selection, scope } of scoped) {
    for (const clause of selection.clauses ?? []) {
      const label = predicateText(clause);
      if (!label) continue;
      out.push({
        key: `${scope}:${String(clause.source)}`,
        scope,
        label,
        source: clause.source,
        selection,
      });
    }
  }
  return out;
}

export function clearFilter(filter: ActiveFilter): void {
  filter.selection.update({ source: filter.source, predicate: null, value: null });
}

export function clearAllFilters(scoped: ScopedSelection[]): void {
  for (const filter of describeActiveFilters(scoped)) {
    clearFilter(filter);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/selectionFilters.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the ActiveFiltersBar component**

```tsx
// ActiveFiltersBar.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearAllFilters,
  clearFilter,
  describeActiveFilters,
  type ScopedSelection,
} from "./selectionFilters";

export function ActiveFiltersBar({ scoped }: { scoped: ScopedSelection[] }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    for (const { selection } of scoped) selection.addEventListener("value", bump);
    return () => {
      for (const { selection } of scoped) selection.removeEventListener("value", bump);
    };
  }, [scoped]);

  // version forces recompute when any selection emits "value".
  void version;
  const filters = describeActiveFilters(scoped);
  if (filters.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2 text-xs shadow-[var(--shadow-soft-sm)]">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">Filters</span>
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => { clearFilter(f); setVersion((v) => v + 1); }}
          className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 font-medium transition-colors hover:bg-muted"
          title={`${f.scope}: ${f.label}`}
        >
          <span className="max-w-[16rem] truncate">{f.label}</span>
          <X size={12} className="shrink-0" />
        </button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-6 px-2 text-xs"
        onClick={() => { clearAllFilters(scoped); setVersion((v) => v + 1); }}
      >
        Clear all
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Wire the bar into HybridAnalyticsSurface**

Add to the import block:
```tsx
import { ActiveFiltersBar } from "./ActiveFiltersBar";
import type { ScopedSelection } from "./selectionFilters";
```

After the `usersSelection` / `projectsSelection` memos, add:
```tsx
  const scopedSelections = useMemo<ScopedSelection[]>(
    () => [
      { selection: usersSelection as unknown as ScopedSelection["selection"], scope: "Users" },
      { selection: projectsSelection as unknown as ScopedSelection["selection"], scope: "Projects" },
    ],
    [usersSelection, projectsSelection],
  );
```

Render `<ActiveFiltersBar scoped={scopedSelections} />` directly under the latest-extraction status bar (before `<KpiHeroStrip ... />`), so applied filters are visible above the charts.

- [ ] **Step 7: Run the surface regression test**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx"`
Expected: PASS (bar renders nothing when no clauses are active).

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/selectionFilters.ts" "app/(dashboard)/users/access-analysis/selectionFilters.test.ts" "app/(dashboard)/users/access-analysis/ActiveFiltersBar.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx"
git commit -m "feat(acc-analysis): visible, clearable crossfilter bar

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Migrate vgplot panels and fallback panel onto ChartPanel

Unifies chrome and affordances across the remaining chart types. vgplot accent colors move to tokens.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/DistributionPanel.tsx`
- Modify: `app/(dashboard)/users/access-analysis/HistogramPanel.tsx`
- Modify: `app/(dashboard)/users/access-analysis/HeatmapPanel.tsx`
- Modify: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx` (FallbackBarPanel + the `ACCENTS` map)

- [ ] **Step 1: DistributionPanel — adopt ChartPanel**

Add import under `"use client";`:
```tsx
import { ChartPanel } from "./ChartPanel";
import { chartColor } from "./chartColors";
```
Change the default accent param from `accent = "#8b5cf6"` to `accent = chartColor("seq4")`.
Replace the returned `<section>…</section>` with:
```tsx
  return (
    <ChartPanel title={title} subtitle={subtitle} affordance="drag-to-filter">
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </ChartPanel>
  );
```

- [ ] **Step 2: HistogramPanel — adopt ChartPanel**

Add import under `"use client";`:
```tsx
import { ChartPanel } from "./ChartPanel";
```
Replace the returned `<section>…</section>` with (the `groupLabel` becomes the subtitle; bars keep their per-category tableau scheme):
```tsx
  return (
    <ChartPanel title={title} subtitle={groupLabel} affordance="click-to-filter">
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </ChartPanel>
  );
```
The `accent` prop is now unused for chrome; leave the prop in the interface for compatibility but it no longer renders a dot.

- [ ] **Step 3: HeatmapPanel — adopt ChartPanel**

Add import under `"use client";`:
```tsx
import { ChartPanel } from "./ChartPanel";
```
Replace the returned `<section>…</section>` with:
```tsx
  return (
    <ChartPanel title={title} subtitle={subtitle} affordance="drag-to-filter">
      <div className="mb-2 text-right text-[11px] uppercase tracking-wide text-muted-foreground">
        darker = more
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */}
      <VgPlotChart plot={plotRef.current!} />
    </ChartPanel>
  );
```

- [ ] **Step 4: FallbackBarPanel — adopt ChartPanel**

In `HybridAnalyticsSurface.tsx`, replace the `FallbackBarPanel` returned `<section>…</section>` wrapper and its `<header>` with a `ChartPanel`, keeping the bar-list body. The new body of `FallbackBarPanel`:
```tsx
  const max = rows.reduce((largest, row) => Math.max(largest, row.value), 0);
  return (
    <ChartPanel
      title={title}
      subtitle={subtitle}
      insight={finding ? { text: finding } : undefined}
      affordance={onRowClick ? "click-to-filter" : undefined}
    >
      {rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => (
            <div
              key={row.label}
              onClick={() => onRowClick?.(row)}
              className={`grid grid-cols-[minmax(0,1fr)_minmax(7rem,45%)] items-center gap-3 text-xs p-1 rounded transition-colors ${
                onRowClick ? "cursor-pointer hover:bg-muted/70" : ""
              }`}
            >
              <span className="truncate font-medium text-foreground/90" title={row.label}>{row.label}</span>
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full animate-in slide-in-from-left duration-500 ease-out"
                    style={{
                      backgroundColor: accent,
                      width: `${max ? Math.max(4, (row.value / max) * 100) : 0}%`,
                    }}
                  />
                </div>
                <span className="w-10 text-right tabular-nums font-semibold">{row.value.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ChartPanel>
  );
```
Add `import { ChartPanel } from "./ChartPanel";` if not already imported in this file (it is, from Task 4/5 — verify before adding to avoid a duplicate import).

- [ ] **Step 5: Replace the `ACCENTS` hex map with tokens**

In `HybridAnalyticsSurface.tsx`, change the `ACCENTS` constant to resolve from tokens:
```tsx
const ACCENTS = {
  distribution: chartColor("seq4"),
  distributionAdmin: chartColor("watch"),
  heatmap: chartColor("seq2"),
  membership: chartColor("good"),
  role: chartColor("seq4"),
  company: chartColor("seq1"),
} as const;
```
(`chartColor` is already imported from Task 4. These values now feed the vgplot `fill` and remaining accents consistently.)

- [ ] **Step 6: Run the affected tests**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx" "app/(dashboard)/users/access-analysis/VgplotFacetChart.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/DistributionPanel.tsx" "app/(dashboard)/users/access-analysis/HistogramPanel.tsx" "app/(dashboard)/users/access-analysis/HeatmapPanel.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx"
git commit -m "refactor(acc-analysis): vgplot + fallback panels onto ChartPanel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: Page sectioning / information architecture

Reorganize `HybridAnalyticsSurface` into labeled, executive-first sections with breathing room. This is markup grouping only — the panels and their props are unchanged from prior tasks.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx`

- [ ] **Step 1: Add a small section-heading helper**

Near the other local components in `HybridAnalyticsSurface.tsx`, add:
```tsx
function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mt-2 flex items-baseline gap-3">
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
```

- [ ] **Step 2: Group the body into ordered sections**

Within the top-level `<section className="flex flex-col gap-6">`, arrange children in this order, inserting a `<SectionHeading>` before each group:
1. (existing header, status bar) — unchanged
2. `<ActiveFiltersBar … />`
3. `SectionHeading "Executive summary"` → `<KpiHeroStrip … />` + `<HeadlineInsights … />`
4. `SectionHeading "Access posture"` → the 4-up `<DonutPanel>` grid
5. `SectionHeading "Access breadth"` → the projects-per-user + admin-grants distributions (the existing `isReady`/`isFallback` blocks)
6. `SectionHeading "Rankings"` → the top projects/roles/companies histogram grid
7. `SectionHeading "Activity & risk"` → `<AccessEventsChart />`, `<ComplianceScanPanel />`, `<PermissionRiskPanel />`

Keep all existing conditional `isReady` / `isFallback` / loading branches intact within each group — only their grouping and order change. Keep the drill-down `<Dialog>` and the `<style>` block at the end.

- [ ] **Step 3: Run the surface regression test**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.fallback.test.tsx"`
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Start the dev server (`npm run dev:next`), open `http://localhost:3000/access-analysis`, and confirm: sections appear in order; KPIs use semantic colors; headline insights are clickable into the drill-down; charts still brush/click; the filters bar appears with chips and Clear all works.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx"
git commit -m "feat(acc-analysis): executive-first page sectioning

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full access-analysis unit suite**

Run: `npx vitest run "app/(dashboard)/users/access-analysis"`
Expected: PASS — all existing and new tests green.

- [ ] **Step 2: Lint the touched files**

Run: `npx eslint "app/(dashboard)/users/access-analysis/ChartPanel.tsx" "app/(dashboard)/users/access-analysis/chartColors.ts" "app/(dashboard)/users/access-analysis/HeadlineInsights.tsx" "app/(dashboard)/users/access-analysis/selectionFilters.ts" "app/(dashboard)/users/access-analysis/ActiveFiltersBar.tsx" "app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx" "app/(dashboard)/users/access-analysis/DonutPanel.tsx" "app/(dashboard)/users/access-analysis/DistributionPanel.tsx" "app/(dashboard)/users/access-analysis/HistogramPanel.tsx" "app/(dashboard)/users/access-analysis/HeatmapPanel.tsx" "app/(dashboard)/users/access-analysis/KpiHeroStrip.tsx"`
Expected: no errors.

- [ ] **Step 3: Report results**

Summarize pass/fail counts and any follow-ups. Do not claim completion unless both Step 1 and Step 2 pass.

---

## Self-Review Notes

- **Spec coverage:** Foundation §1 → Tasks 1–2; color tokens → Tasks 1,4,7; Executive zone §2 → Tasks 4,5; Access posture §3 → Tasks 3,4; Distributions/rankings + interactivity §4 → Tasks 6,7; Page flow §5 → Task 8; both render paths through ChartPanel → Tasks 3,7. All covered.
- **Risk (active-filters API):** isolated in pure `selectionFilters.ts` with structural typing + fake-selection tests, so it is verifiable without the real Mosaic runtime; if `update({predicate:null})` proves insufficient at runtime, the fallback is to reset by reconstructing the crossfilter selection — contained to one module.
- **Type consistency:** `InsightSeverity` defined in `ChartPanel.tsx` and reused by `HeadlineInsights`; `chartColor`/`sequenceColor` signatures stable across tasks; `ScopedSelection`/`SelectionLike` defined once in `selectionFilters.ts`.
