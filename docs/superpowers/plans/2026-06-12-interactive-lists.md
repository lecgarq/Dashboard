# Interactive Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add subtle, professional motion and real list interactivity (sort/search/filter members table + shared Users profile sidebar, animated expand/stagger on the coordination list and project picker) to `/access-analysis` and `/template-mty`.

**Architecture:** One small shared toolkit (`components/ui/animated-list.tsx`) provides capped-stagger entrance props, an `<AnimatedExpand>` height wrapper, and an in-view `<Reveal>`. Pure sort/filter logic for the members table lives in its own module and is unit-tested. The members table becomes a client ARIA-grid that opens the existing `AuthorProfileDrawer` (the Users-directory sidebar) on row click. No new dependencies, no server/data changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, framer-motion v12 (already installed), vitest + @testing-library/react (jsdom), tRPC.

**Spec:** `docs/superpowers/specs/2026-06-12-interactive-lists-design.md`

**Conventions:**
- `cn` util is at `@/lib/core/utils`.
- Component tests start with `// @vitest-environment jsdom` (the global env is `node`).
- Run a single test file: `npx vitest run <path>`. Run all unit tests: `npm test`.
- Surgical commits: stage by explicit path only; never `git add -A`/`.`. Before each commit run `git diff --cached --name-only` and confirm only the intended files are staged.

---

## File structure

- **Create** `components/ui/animated-list.tsx` — shared motion primitives (`useEntrance`, `AnimatedExpand`, `Reveal`).
- **Create** `components/ui/__tests__/animated-list.test.tsx` — smoke tests.
- **Create** `app/(dashboard)/template-mty/templateMembersTable.ts` — pure `filterMembers` / `sortMembers`.
- **Create** `app/(dashboard)/template-mty/__tests__/templateMembersTable.test.ts` — logic unit tests.
- **Modify** `vitest.setup.ts` — add an `IntersectionObserver` stub (for `whileInView`).
- **Modify** `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx` — interactive client ARIA-grid.
- **Modify** `app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx` — extend for search/sort/filter/row-click.
- **Modify** `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` — lift `profileEmail`, mount `AuthorProfileDrawer`, wrap sections in `<Reveal>`.
- **Modify** `app/(dashboard)/access-analysis/components/CoordinationByProject.tsx` — grow bars, `AnimatedExpand`, stagger clash cards.
- **Modify** `app/(dashboard)/access-analysis/components/ProjectPicker.tsx` — stagger rows, `AnimatedExpand` group collapse.
- **Modify** `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` — wrap sections in `<Reveal>`.

---

## Task 1: Test infra — IntersectionObserver stub

`<Reveal>` uses framer-motion's `whileInView`, which needs `IntersectionObserver`. jsdom doesn't provide it, so add a no-op stub so wrapped components still render in tests.

**Files:**
- Modify: `vitest.setup.ts`

- [ ] **Step 1: Add the stub at the end of `vitest.setup.ts`**

```ts
// jsdom has no IntersectionObserver; framer-motion's whileInView needs it.
// A no-op stub keeps in-view-animated components renderable under test.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
vi.stubGlobal("IntersectionObserver", IntersectionObserverStub);
```

- [ ] **Step 2: Verify the suite still passes**

Run: `npm test`
Expected: same pass count as before (no regressions).

- [ ] **Step 3: Commit**

```bash
git add vitest.setup.ts
git commit -m "test(ui): stub IntersectionObserver for whileInView in jsdom"
```

---

## Task 2: Shared motion toolkit

**Files:**
- Create: `components/ui/animated-list.tsx`
- Test: `components/ui/__tests__/animated-list.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnimatedExpand, Reveal } from "../animated-list";

describe("animated-list", () => {
  it("AnimatedExpand renders children when open", () => {
    render(<AnimatedExpand open><p>visible body</p></AnimatedExpand>);
    expect(screen.getByText("visible body")).toBeTruthy();
  });

  it("AnimatedExpand renders nothing when closed", () => {
    render(<AnimatedExpand open={false}><p>hidden body</p></AnimatedExpand>);
    expect(screen.queryByText("hidden body")).toBeNull();
  });

  it("Reveal renders its children", () => {
    render(<Reveal><span>panel</span></Reveal>);
    expect(screen.getByText("panel")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run components/ui/__tests__/animated-list.test.tsx`
Expected: FAIL — cannot resolve `../animated-list`.

- [ ] **Step 3: Implement the toolkit**

```tsx
"use client";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** Shared easing — matches --motion-ease in app/globals.css. */
export const EASE = [0.22, 1, 0.36, 1] as const;
const STAGGER = 0.025;
const STAGGER_CAP = 16; // beyond this index, items appear together (bounded entrance)

/**
 * Returns a function that produces framer-motion props for a list item so it
 * fades + slides up on mount, with a capped stagger by index. No-ops under
 * prefers-reduced-motion. Usage:
 *   const entrance = useEntrance();
 *   <motion.li {...entrance(i)}>…</motion.li>
 */
export function useEntrance(): (index: number) => Record<string, unknown> {
  const reduce = useReducedMotion();
  return (index: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: {
            duration: 0.18,
            ease: EASE,
            delay: Math.min(index, STAGGER_CAP) * STAGGER,
          },
        };
}

/** Height-eased open/close wrapper. Replaces instant `{open && …}` snaps. */
export function AnimatedExpand({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="expand"
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** In-view fade-up for a panel/section. Settles content as the user scrolls. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run components/ui/__tests__/animated-list.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add components/ui/animated-list.tsx components/ui/__tests__/animated-list.test.tsx
git commit -m "feat(ui): shared animated-list toolkit (entrance, expand, reveal)"
```

---

## Task 3: Members-table pure logic

**Files:**
- Create: `app/(dashboard)/template-mty/templateMembersTable.ts`
- Test: `app/(dashboard)/template-mty/__tests__/templateMembersTable.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { filterMembers, sortMembers } from "../templateMembersTable";
import type { TemplateMember } from "@/lib/server/templateView";

const m = (over: Partial<TemplateMember>): TemplateMember => ({
  name: "X", email: "x@x.com", company: "Co", role: "R",
  accessLevel: "Project Member", isInternal: true, isAdmin: false, ...over,
});

const members: TemplateMember[] = [
  m({ name: "Alberto", email: "alberto@hermosillo.com", company: "Hermosillo", role: "Core", isInternal: true, isAdmin: true, accessLevel: "Project Admin" }),
  m({ name: "Beatriz", email: "bea@outside.com", company: "Outside", role: "Designer", isInternal: false, isAdmin: false }),
  m({ name: "Carlos", email: "carlos@hermosillo.com", company: "Hermosillo", role: "Modeler", isInternal: true, isAdmin: false }),
];

describe("filterMembers", () => {
  it("matches name/email/role/company on search (case-insensitive)", () => {
    expect(filterMembers(members, "alberto", "all").map((x) => x.name)).toEqual(["Alberto"]);
    expect(filterMembers(members, "DESIGNER", "all").map((x) => x.name)).toEqual(["Beatriz"]);
    expect(filterMembers(members, "hermosillo", "all").map((x) => x.name)).toEqual(["Alberto", "Carlos"]);
  });
  it("internal/external/admin chips filter", () => {
    expect(filterMembers(members, "", "internal").map((x) => x.name)).toEqual(["Alberto", "Carlos"]);
    expect(filterMembers(members, "", "external").map((x) => x.name)).toEqual(["Beatriz"]);
    expect(filterMembers(members, "", "admin").map((x) => x.name)).toEqual(["Alberto"]);
  });
  it("combines chip + search", () => {
    expect(filterMembers(members, "carlos", "internal").map((x) => x.name)).toEqual(["Carlos"]);
    expect(filterMembers(members, "carlos", "external")).toEqual([]);
  });
});

describe("sortMembers", () => {
  it("sorts by name asc and desc without mutating input", () => {
    const asc = sortMembers(members, "name", "asc").map((x) => x.name);
    expect(asc).toEqual(["Alberto", "Beatriz", "Carlos"]);
    expect(sortMembers(members, "name", "desc").map((x) => x.name)).toEqual(["Carlos", "Beatriz", "Alberto"]);
    expect(members[0].name).toBe("Alberto"); // input untouched
  });
  it("sorts by origin (internal/external)", () => {
    const byOrigin = sortMembers(members, "origin", "asc").map((x) => x.isInternal);
    expect(byOrigin[0]).toBe(true); // "External" > "Internal"? localeCompare: External < Internal → asc puts External first
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run app/(dashboard)/template-mty/__tests__/templateMembersTable.test.ts`
Expected: FAIL — cannot resolve `../templateMembersTable`.

- [ ] **Step 3: Implement the logic**

```ts
import type { TemplateMember } from "@/lib/server/templateView";

export type MemberSortKey = "name" | "role" | "company" | "accessLevel" | "origin";
export type SortDir = "asc" | "desc";
export type MemberFilter = "all" | "internal" | "external" | "admin";

/** Search across name/email/role/company + an internal/external/admin chip. */
export function filterMembers(
  members: TemplateMember[],
  query: string,
  filter: MemberFilter,
): TemplateMember[] {
  const q = query.trim().toLowerCase();
  return members.filter((m) => {
    if (filter === "internal" && !m.isInternal) return false;
    if (filter === "external" && m.isInternal) return false;
    if (filter === "admin" && !m.isAdmin) return false;
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.role.toLowerCase().includes(q) ||
      m.company.toLowerCase().includes(q)
    );
  });
}

function sortValue(m: TemplateMember, key: MemberSortKey): string {
  switch (key) {
    case "name": return m.name;
    case "role": return m.role;
    case "company": return m.company;
    case "accessLevel": return m.accessLevel;
    case "origin": return m.isInternal ? "Internal" : "External";
  }
}

/** Locale-aware, non-mutating sort. */
export function sortMembers(
  members: TemplateMember[],
  key: MemberSortKey,
  dir: SortDir,
): TemplateMember[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...members].sort(
    (a, b) =>
      sign * sortValue(a, key).localeCompare(sortValue(b, key), undefined, { sensitivity: "base" }),
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run app/(dashboard)/template-mty/__tests__/templateMembersTable.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/template-mty/templateMembersTable.ts app/(dashboard)/template-mty/__tests__/templateMembersTable.test.ts
git commit -m "feat(template-mty): pure filter/sort logic for members table"
```

---

## Task 4: Interactive members table

Rewrite `TemplateMembersTable` as a client ARIA-grid with toolbar (search + filter chips + count), sortable headers, sticky header, staggered rows, hover-reveal, and a row-click callback.

**Files:**
- Modify: `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx`
- Modify: `app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx`

- [ ] **Step 1: Replace the component file entirely**

```tsx
// app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
"use client";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { TemplateMember } from "@/lib/server/templateView";
import { cn } from "@/lib/core/utils";
import { useEntrance } from "@/components/ui/animated-list";
import {
  filterMembers,
  sortMembers,
  type MemberFilter,
  type MemberSortKey,
  type SortDir,
} from "../templateMembersTable";

const FILTERS: { key: MemberFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "internal", label: "Internal" },
  { key: "external", label: "External" },
  { key: "admin", label: "Admin" },
];

const COLUMNS: { key: MemberSortKey; label: string }[] = [
  { key: "name", label: "Member" },
  { key: "role", label: "Role" },
  { key: "company", label: "Company" },
  { key: "accessLevel", label: "Access" },
  { key: "origin", label: "Origin" },
];

const GRID =
  "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto_auto] items-center gap-3";

export function TemplateMembersTable({
  members,
  onSelectMember,
}: {
  members: TemplateMember[];
  onSelectMember?: (email: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [sortKey, setSortKey] = useState<MemberSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const entrance = useEntrance();

  const rows = useMemo(
    () => sortMembers(filterMembers(members, query, filter), sortKey, sortDir),
    [members, query, filter, sortKey, sortDir],
  );

  function toggleSort(key: MemberSortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No members found for this template.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft-xl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="relative min-w-[12rem] flex-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            aria-label="Search members"
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary/70 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
        </div>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
                  on
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
          {rows.length} of {members.length}
        </span>
      </div>

      <div role="table" aria-label="Template members" className="text-sm">
        {/* Header */}
        <div
          role="row"
          className={cn(
            GRID,
            "sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur",
          )}
        >
          {COLUMNS.map((c) => {
            const active = sortKey === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="columnheader"
                aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                onClick={() => toggleSort(c.key)}
                className="group/col flex items-center gap-1 text-left font-medium transition-colors hover:text-foreground"
              >
                {c.label}
                <span
                  aria-hidden
                  className={cn(
                    "text-[9px] transition-all duration-200",
                    active ? "opacity-100" : "opacity-0 group-hover/col:opacity-40",
                    active && sortDir === "desc" ? "rotate-180" : "",
                  )}
                >
                  ▲
                </span>
              </button>
            );
          })}
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No members match your search.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {rows.map((mem, i) => {
              const clickable = !!(mem.email && onSelectMember);
              return (
                <motion.div
                  key={mem.email || mem.name}
                  layout
                  role="row"
                  tabIndex={clickable ? 0 : undefined}
                  onClick={() => clickable && onSelectMember!(mem.email)}
                  onKeyDown={(e) => {
                    if (clickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onSelectMember!(mem.email);
                    }
                  }}
                  {...entrance(i)}
                  className={cn(
                    GRID,
                    "group/row border-b border-border/60 px-4 py-2 transition-colors last:border-0",
                    clickable ? "cursor-pointer hover:bg-accent/50" : "",
                  )}
                >
                  <div role="cell" className="flex min-w-0 flex-col">
                    <span className="truncate font-medium text-foreground">{mem.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{mem.email}</span>
                  </div>
                  <div role="cell" className="truncate text-foreground/90">
                    {mem.role ? mem.role : <span className="text-muted-foreground">No role</span>}
                  </div>
                  <div role="cell" className="truncate text-foreground/90">
                    {mem.company ? mem.company : <span className="text-muted-foreground">—</span>}
                  </div>
                  <div role="cell">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        mem.isAdmin
                          ? "border border-primary/40 bg-primary/10 text-primary"
                          : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      {mem.accessLevel}
                    </span>
                  </div>
                  <div role="cell" className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        mem.isInternal
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {mem.isInternal ? "Internal" : "External"}
                    </span>
                    {clickable && (
                      <span
                        aria-hidden
                        className="text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100"
                      >
                        ›
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace the test file with extended coverage**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TemplateMembersTable } from "../components/TemplateMembersTable";
import type { TemplateMember } from "@/lib/server/templateView";

const members: TemplateMember[] = [
  { name: "Alberto", email: "alberto@hermosillo.com", company: "Hermosillo",
    role: "Core", accessLevel: "Project Admin", isInternal: true, isAdmin: true },
  { name: "Guest", email: "guest@outside.com", company: "Outside Co",
    role: "Designer", accessLevel: "Project Member", isInternal: false, isAdmin: false },
];

describe("TemplateMembersTable", () => {
  it("renders one row per member with name, email, role, company, and access level", () => {
    render(<TemplateMembersTable members={members} />);
    expect(screen.getByText("Alberto")).toBeTruthy();
    expect(screen.getByText("alberto@hermosillo.com")).toBeTruthy();
    expect(screen.getByText("Core")).toBeTruthy();
    expect(screen.getByText("Project Admin")).toBeTruthy();
    expect(screen.getAllByText("Hermosillo").length).toBeGreaterThan(0);
    expect(screen.getByText("Guest")).toBeTruthy();
    expect(screen.getByText("Project Member")).toBeTruthy();
    expect(screen.getByText("External")).toBeTruthy();
  });

  it("filters rows by the search box", () => {
    render(<TemplateMembersTable members={members} />);
    fireEvent.change(screen.getByLabelText("Search members"), { target: { value: "guest" } });
    expect(screen.queryByText("Alberto")).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("filters rows by the External chip", () => {
    render(<TemplateMembersTable members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "External" }));
    expect(screen.queryByText("Alberto")).toBeNull();
    expect(screen.getByText("Guest")).toBeTruthy();
  });

  it("sorts by Member name when the header is clicked", () => {
    render(<TemplateMembersTable members={members} />);
    const grid = screen.getByRole("table");
    // default asc → Alberto first; click toggles to desc → Guest first
    fireEvent.click(screen.getByRole("columnheader", { name: /Member/i }));
    const rows = within(grid).getAllByRole("row");
    // rows[0] is the header row; rows[1] is the first data row
    expect(within(rows[1]).getByText("Guest")).toBeTruthy();
  });

  it("calls onSelectMember with the row's email on click", () => {
    const onSelectMember = vi.fn();
    render(<TemplateMembersTable members={members} onSelectMember={onSelectMember} />);
    fireEvent.click(screen.getByText("Alberto"));
    expect(onSelectMember).toHaveBeenCalledWith("alberto@hermosillo.com");
  });
});
```

- [ ] **Step 3: Run the test file**

Run: `npx vitest run app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 4: Typecheck the touched files**

Run: `npx tsc --noEmit`
Expected: no errors. (If `tsc` reports unrelated pre-existing errors in other files, confirm none reference the files in this task.)

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/template-mty/components/TemplateMembersTable.tsx app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx
git commit -m "feat(template-mty): interactive members table (search/sort/filter, row-click)"
```

---

## Task 5: Wire the Users sidebar + Reveal into template-mty

Lift `profileEmail` state into the (already-client) `TemplateAnalysisCharts`, mount the lazy `AuthorProfileDrawer`, pass `onSelectMember` to the table, and wrap each `<section>` in `<Reveal>`.

**Files:**
- Modify: `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx`

- [ ] **Step 1: Add imports at the top of the file (after the existing imports)**

```tsx
import { useState } from "react";
import dynamic from "next/dynamic";
import { Reveal } from "@/components/ui/animated-list";

// Lazy: keeps the heavy shared users-profile + tRPC chain out of the initial
// template-mty bundle — loads only once a member row is first clicked. Mirrors
// AccessAnalysisCharts' use of the same drawer.
const AuthorProfileDrawer = dynamic(
  () => import("@/app/(dashboard)/access-analysis/components/AuthorProfileDrawer").then((m) => m.AuthorProfileDrawer),
  { ssr: false },
);
```

- [ ] **Step 2: Add state at the top of the `TemplateAnalysisCharts` function body**

```tsx
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
```

- [ ] **Step 3: Pass the handler to the members table**

Change:
```tsx
        <TemplateMembersTable members={overview.members} />
```
to:
```tsx
        <TemplateMembersTable
          members={overview.members}
          onSelectMember={(email) => setProfileEmail(email.toLowerCase())}
        />
```

- [ ] **Step 4: Wrap each `<section>` in `<Reveal>` and mount the drawer**

Wrap every `<section className="flex flex-col gap-3"> … </section>` block in `<Reveal>…</Reveal>` (there are 7 sections: Project members, Role distribution, Folder access by tier, ACC module access, Folder permission terrain, Role access, Role similarity). Then, immediately before the final closing `</div>` of the returned tree, add:

```tsx
      {profileEmail && (
        <AuthorProfileDrawer email={profileEmail} onClose={() => setProfileEmail(null)} />
      )}
```

Example for the first section:
```tsx
      <Reveal>
        <section className="flex flex-col gap-3">
          <SectionHeader title="Project members" subtitle="The roster that projects created from this template inherit — with each member's role, company, and access level." />
          <TemplateMembersTable
            members={overview.members}
            onSelectMember={(email) => setProfileEmail(email.toLowerCase())}
          />
        </section>
      </Reveal>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Run any template-mty tests**

Run: `npx vitest run app/(dashboard)/template-mty`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
git commit -m "feat(template-mty): open Users profile sidebar on member click; reveal sections"
```

---

## Task 6: CoordinationByProject motion

Grow the per-project count bars from 0 on mount, animate the expand drill-down height, and stagger the clash cards.

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/CoordinationByProject.tsx`

- [ ] **Step 1: Add imports (after the existing imports at the top)**

```tsx
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedExpand, useEntrance } from "@/components/ui/animated-list";
```

- [ ] **Step 2: Stagger the clash cards — change `ClashCard` to a motion item**

In `ClashCard`, change the signature and the root element:

```tsx
function ClashCard({
  c,
  index,
  onAuthorClick,
}: {
  c: ClashIssue;
  index: number;
  onAuthorClick?: (email: string) => void;
}) {
  const entrance = useEntrance();
  return (
    <motion.li {...entrance(index)} className="rounded-lg border border-border bg-card/60 p-2.5">
```

Close it with `</motion.li>` instead of `</li>`. Update the call site in the expanded list:

```tsx
                        <ul className="space-y-1.5">
                          {list.map((c, i) => (
                            <ClashCard key={`${c.displayId ?? "x"}-${i}`} c={c} index={i} onAuthorClick={onAuthorClick} />
                          ))}
```

- [ ] **Step 3: Grow the per-project bar from 0**

Inside the `byProject.map`, replace the static bar span:

```tsx
                  <span aria-hidden className="absolute inset-y-0 left-0 rounded-md bg-primary/10" style={{ width: `${pct}%` }} />
```
with a motion span (add `const reduce = useReducedMotion();` once near the top of the `CoordinationByProject` body, before the `return`):

```tsx
                  <motion.span
                    aria-hidden
                    className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  />
```

- [ ] **Step 4: Animate the expand drill-down**

Replace `{isOpen && (` … `)}` around the drill-down `<div className="border-t border-border bg-muted/20 px-2.5 py-2">…</div>` with:

```tsx
                <AnimatedExpand open={isOpen}>
                  <div className="border-t border-border bg-muted/20 px-2.5 py-2">
                    {/* …existing drill-down content unchanged… */}
                  </div>
                </AnimatedExpand>
```

- [ ] **Step 5: Run the existing test (must stay green)**

Run: `npx vitest run app/(dashboard)/access-analysis/__tests__/CoordinationByProject.test.tsx`
Expected: PASS (all existing tests — expand still reveals clash cards, author click still fires).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/access-analysis/components/CoordinationByProject.tsx
git commit -m "feat(access-analysis): grow bars, animate expand + stagger clashes in coordination list"
```

---

## Task 7: ProjectPicker motion

Stagger the project rows when the dropdown opens and height-animate the office-group collapse.

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/ProjectPicker.tsx`

- [ ] **Step 1: Add imports (after the existing imports)**

```tsx
import { motion } from "framer-motion";
import { AnimatedExpand, useEntrance } from "@/components/ui/animated-list";
```

- [ ] **Step 2: Create the entrance fn near the top of the component body**

Just after the existing `const containerRef = useRef<HTMLDivElement>(null);`:

```tsx
  const entrance = useEntrance();
```

- [ ] **Step 3: Make `renderRow` a motion item that staggers by index**

Change the signature from `const renderRow = (o: ProjectOption) => {` to `const renderRow = (o: ProjectOption, idx: number) => {` and change the returned root `<li …>` to a `<motion.li>` with entrance props:

```tsx
    return (
      <motion.li key={o.id} {...entrance(idx)} className="relative px-1.5">
```
Close it with `</motion.li>`. (`Array.prototype.map` already passes the index as the second arg, so the existing `g.options.map(renderRow)` and `visible.map(renderRow)` calls need no change.)

- [ ] **Step 4: Height-animate the group collapse**

Replace:
```tsx
                    {!isCollapsed && <ul className="list-none">{g.options.map(renderRow)}</ul>}
```
with:
```tsx
                    <AnimatedExpand open={!isCollapsed}>
                      <ul className="list-none">{g.options.map(renderRow)}</ul>
                    </AnimatedExpand>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Run access-analysis tests**

Run: `npx vitest run app/(dashboard)/access-analysis`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/access-analysis/components/ProjectPicker.tsx
git commit -m "feat(access-analysis): stagger picker rows + animate group collapse"
```

---

## Task 8: Reveal on access-analysis sections

Wrap the `<section>` blocks in `AccessAnalysisCharts` with `<Reveal>` for the same settle-on-scroll cohesion as template-mty.

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`

- [ ] **Step 1: Add the import**

```tsx
import { Reveal } from "@/components/ui/animated-list";
```

- [ ] **Step 2: Wrap each `<section className="flex flex-col gap-3">…</section>` in `<Reveal>…</Reveal>`**

There are 5 conditional/unconditional sections (Activity over time, Folder permission terrain, Role distribution, Activity by role, Activity by module, Model Coordination). Do NOT wrap the `ProjectPicker` (it owns an absolutely-positioned dropdown — a transform parent would clip it) or the `AuthorProfileDrawer`. Example:

```tsx
      {timelineRows ? (
        <Reveal>
          <section className="flex flex-col gap-3">
            <SectionHeader title="Activity over time" subtitle="…" />
            <ActivityTimelineChart summary={timelineSummary} />
          </section>
        </Reveal>
      ) : null}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the access-analysis suite**

Run: `npx vitest run app/(dashboard)/access-analysis`
Expected: PASS (page.test.tsx + AccessAnalysisCharts.test.tsx green — IntersectionObserver stub from Task 1 keeps Reveal-wrapped content rendered).

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx
git commit -m "feat(access-analysis): settle panels into view on scroll"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the entire unit suite**

Run: `npm test`
Expected: all pass; total count = prior baseline + new tests (animated-list 3, templateMembersTable logic ~5, members table +4).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors introduced by this work.

- [ ] **Step 3: Manual verification on the live build**

The dashboard runs in production mode on `:3000`. Do NOT `npm run build` against the running server (it 500s the live site). Use the safe swap pattern (run the build into an alternate dist dir, then start):

```bash
# build into an alternate dir so the running :3000 keeps serving
NEXT_DIST_DIR=.next-new npm run build
```
Then (owner step) stop the running server, swap `.next-new` → `.next`, and `npm start`. Verify in the browser:
- `/template-mty`: members table searches, filter chips, header sort, rows stagger in, hover highlight, **clicking a member opens the Users profile sidebar**; sections fade in on scroll.
- `/access-analysis`: project picker rows stagger when opened, office groups animate collapse; coordination bars grow, a project expands smoothly with staggered clash cards; sections fade in on scroll.
- Toggle OS "reduce motion" → animations no-op, everything still works.

- [ ] **Step 4: Record completion**

Update the spec status to "Implemented" and note any deviations in `docs/superpowers/specs/2026-06-12-interactive-lists-design.md`.

---

## Self-review notes

- **Spec coverage:** toolkit (Task 2) ✓; members table full upgrade incl. sidebar (Tasks 3–5) ✓; coordination motion (Task 6) ✓; project picker motion (Task 7) ✓; cohesion Reveal both pages (Tasks 5, 8) ✓; reduced-motion (Task 2, used throughout) ✓; tests (Tasks 2,3,4,6,7,8,9) ✓.
- **Type consistency:** `MemberSortKey`/`SortDir`/`MemberFilter` defined in Task 3, imported unchanged in Task 4. `useEntrance`/`AnimatedExpand`/`Reveal` defined in Task 2, used identically in Tasks 4,5,6,7,8. `onSelectMember(email: string)` defined in Task 4, wired in Task 5.
- **Decisions locked:** div-grid ARIA table (not `<table>`) so framer `layout` reflow works; existing TemplateMembersTable text-based assertions still pass under default name-sort, so only additive test changes are needed.
