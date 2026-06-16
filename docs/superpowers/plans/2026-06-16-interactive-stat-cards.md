# Interactive Profile Stat Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the user-profile Admin / Roles / Modules stat cards clickable — Admin reveals the admin-project list inline, Roles and Modules reveal compact donuts — all from already-loaded client data.

**Architecture:** A pure helper (`statCardDetails.ts`) aggregates the profile's `projects` into an admin list + role/module counts. A small `StatCardDetail` component renders either the admin list or a compact donut (built on the existing `EChart` wrapper). `AccProfileFull` gets a single `activeCard` state; the three cards become buttons that toggle it.

**Tech Stack:** React client components, Vitest + @testing-library/react (jsdom), `echarts-for-react` via the existing `EChart` wrapper, next-themes, Tailwind.

---

## File structure

- **Create** `app/(dashboard)/users/statCardDetails.ts` — pure: `adminProjects`, `roleCounts`, `moduleCounts`, `moduleLabel`, `CountSlice`.
- **Create** `app/(dashboard)/users/statCardDetails.test.ts` — Vitest unit tests.
- **Create** `app/(dashboard)/users/StatCardDetail.tsx` — the inline detail panel (admin list or donut).
- **Create** `app/(dashboard)/users/StatCardDetail.test.tsx` — render test (mocks `EChart`).
- **Modify** `app/(dashboard)/users/AccProfileSection.tsx` — `StatCard` props + `activeCard` state + render `StatCardDetail`.
- **Modify** `app/(dashboard)/users/UserProfilePanel.test.tsx` — toggle + disabled tests.

---

## Task 1: Pure aggregation helper (TDD)

**Files:**
- Create: `app/(dashboard)/users/statCardDetails.ts`
- Test: `app/(dashboard)/users/statCardDetails.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/users/statCardDetails.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { adminProjects, roleCounts, moduleCounts, moduleLabel } from "./statCardDetails";
import type { ProjectData } from "./AccProfileSection";

function p(over: Partial<ProjectData>): ProjectData {
  return { id: "x", name: "P", status: "active", isAdmin: false, roles: [], modules: [], ...over };
}

describe("statCardDetails", () => {
  it("adminProjects keeps only admins, active-first then by name", () => {
    const out = adminProjects([
      p({ id: "1", name: "Zeta", isAdmin: true, status: "active" }),
      p({ id: "2", name: "Alpha", isAdmin: false }),
      p({ id: "3", name: "Beta", isAdmin: true, status: "inactive" }),
      p({ id: "4", name: "Acme", isAdmin: true, status: "active" }),
    ]);
    expect(out.map((x) => x.name)).toEqual(["Acme", "Zeta", "Beta"]);
  });

  it("roleCounts counts projects per role, desc then name", () => {
    const out = roleCounts([
      p({ id: "1", roles: ["Admin", "BIM"] }),
      p({ id: "2", roles: ["Admin"] }),
      p({ id: "3", roles: ["BIM"] }),
    ]);
    expect(out).toEqual([
      { name: "Admin", value: 2 },
      { name: "BIM", value: 2 },
    ]);
  });

  it("roleCounts dedupes a role repeated within one project", () => {
    expect(roleCounts([p({ roles: ["Admin", "Admin"] })])).toEqual([{ name: "Admin", value: 1 }]);
  });

  it("moduleCounts maps module keys to friendly labels", () => {
    const out = moduleCounts([
      p({ id: "1", modules: ["documentManagement"] }),
      p({ id: "2", modules: ["documentManagement", "build"] }),
    ]);
    expect(out).toEqual([
      { name: "Forma Data Management", value: 2 },
      { name: "Build", value: 1 },
    ]);
  });

  it("moduleLabel falls back to the key for unknown modules", () => {
    expect(moduleLabel("somethingNew")).toBe("somethingNew");
  });

  it("empty input → empty arrays", () => {
    expect(adminProjects([])).toEqual([]);
    expect(roleCounts([])).toEqual([]);
    expect(moduleCounts([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/statCardDetails.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/(dashboard)/users/statCardDetails.ts`:

```ts
import type { ProjectData } from "./AccProfileSection";

export interface CountSlice {
  name: string;
  value: number;
}

/** ACC module key → friendly label. Mirrors ALL_MODULES in AccProfileSection.tsx. */
const MODULE_LABELS: Record<string, string> = {
  datum: "Datum",
  documentManagement: "Forma Data Management",
  designCollaboration: "Forma Design Collaboration",
  modelCoordination: "Model Coordination",
  preconstruction: "Preconstruction",
  autoSpecs: "AutoSpecs",
  build: "Build",
  insight: "Insight",
  design: "Design",
};

export function moduleLabel(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

/** Projects where the user is an admin: active-first, then by name. */
export function adminProjects(projects: readonly ProjectData[]): ProjectData[] {
  return projects
    .filter((p) => p.isAdmin)
    .sort(
      (a, b) =>
        (a.status === "active" ? 0 : 1) - (b.status === "active" ? 0 : 1) ||
        a.name.localeCompare(b.name),
    );
}

function countBy(
  projects: readonly ProjectData[],
  pick: (p: ProjectData) => readonly string[] | undefined,
  label: (s: string) => string,
): CountSlice[] {
  const counts = new Map<string, number>();
  for (const p of projects) {
    const seen = new Set<string>(); // a project counts at most once per name
    for (const raw of pick(p) ?? []) {
      const name = label(raw);
      if (seen.has(name)) continue;
      seen.add(name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** One slice per distinct role; value = number of projects carrying that role. */
export function roleCounts(projects: readonly ProjectData[]): CountSlice[] {
  return countBy(projects, (p) => p.roles, (s) => s);
}

/** One slice per distinct module (friendly label); value = number of projects using it. */
export function moduleCounts(projects: readonly ProjectData[]): CountSlice[] {
  return countBy(projects, (p) => p.modules, moduleLabel);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/statCardDetails.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/statCardDetails.ts" "app/(dashboard)/users/statCardDetails.test.ts"
git commit -m "feat(profile): statCardDetails pure aggregation (admin list + role/module counts)"
```

---

## Task 2: StatCardDetail component (render test, EChart mocked)

**Files:**
- Create: `app/(dashboard)/users/StatCardDetail.tsx`
- Test: `app/(dashboard)/users/StatCardDetail.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `app/(dashboard)/users/StatCardDetail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ECharts renders to canvas (unhappy in jsdom) — stub it to a div.
vi.mock("../access-analysis/components/EChart", () => ({
  EChart: () => <div data-testid="echart" />,
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

import { StatCardDetail } from "./StatCardDetail";
import type { ProjectData } from "./AccProfileSection";

const proj = (o: Partial<ProjectData>): ProjectData => ({
  id: "x", name: "P", status: "active", isAdmin: false, roles: [], modules: [], ...o,
});

describe("StatCardDetail", () => {
  it("admin → lists the admin projects with their role", () => {
    render(
      <StatCardDetail
        kind="admin"
        projects={[proj({ id: "1", name: "Acme Tower", isAdmin: true, roles: ["Project Admin"] })]}
      />,
    );
    expect(screen.getByTestId("stat-detail-admin")).toBeTruthy();
    expect(screen.getByText("Acme Tower")).toBeTruthy();
    expect(screen.getByText(/Project Admin/)).toBeTruthy();
  });

  it("roles → legend lists each role name", () => {
    render(
      <StatCardDetail
        kind="roles"
        projects={[proj({ id: "1", roles: ["BIM Manager"] }), proj({ id: "2", roles: ["BIM Manager"] })]}
      />,
    );
    expect(screen.getByText("BIM Manager")).toBeTruthy();
  });

  it("modules → legend maps keys to friendly labels", () => {
    render(<StatCardDetail kind="modules" projects={[proj({ modules: ["documentManagement"] })]} />);
    expect(screen.getByText("Forma Data Management")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/StatCardDetail.test.tsx"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/(dashboard)/users/StatCardDetail.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";
import { EChart } from "../access-analysis/components/EChart";
import type { ProjectData } from "./AccProfileSection";
import { adminProjects, roleCounts, moduleCounts, type CountSlice } from "./statCardDetails";

const PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#3b82f6", "#a78bfa", "#facc15",
  "#fb7185", "#2dd4bf", "#fdba74", "#c084fc", "#86efac", "#93c5fd",
];
const colorFor = (i: number) => PALETTE[i % PALETTE.length];

function Donut({ slices, label }: { slices: CountSlice[]; label: string }): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const cText = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const total = slices.reduce((s, d) => s + d.value, 0);

  const option: EChartsOption = {
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    series: [
      {
        type: "pie",
        radius: ["55%", "80%"],
        center: ["50%", "50%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 2, borderRadius: 5 },
        data: slices.map((s, i) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(i) } })),
      },
    ],
    title: {
      text: String(slices.length),
      subtext: label,
      left: "center",
      top: "center",
      textAlign: "center",
      textStyle: { color: cText, fontSize: 22, fontWeight: 700 },
      subtextStyle: { color: cSub, fontSize: 11 },
    },
  };

  return (
    <div>
      <EChart option={option} height={200} notMerge={false} />
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
        {slices.map((s, i) => (
          <li key={s.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(i) }} />
            <span className="min-w-0 flex-1 truncate text-foreground/85" title={s.name}>{s.name}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{s.value}</span>
            <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatCardDetail({
  kind,
  projects,
}: {
  kind: "admin" | "roles" | "modules";
  projects: ProjectData[];
}): React.JSX.Element {
  const admin = useMemo(() => (kind === "admin" ? adminProjects(projects) : []), [kind, projects]);
  const slices = useMemo(
    () => (kind === "roles" ? roleCounts(projects) : kind === "modules" ? moduleCounts(projects) : []),
    [kind, projects],
  );

  return (
    <div data-testid={`stat-detail-${kind}`} className="mt-3 rounded-xl border border-border/40 bg-muted/5 p-4">
      {kind === "admin" ? (
        admin.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">No admin projects.</p>
        ) : (
          <div className="space-y-1.5">
            {admin.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/20 bg-card/60 px-3 py-2 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
                  <span className="truncate font-medium text-foreground" title={p.name}>{p.name}</span>
                </span>
                <span className="shrink-0 truncate text-muted-foreground" title={(p.roles ?? []).join(", ")}>
                  {(p.roles ?? []).join(", ") || "—"}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <Donut slices={slices} label={kind} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/StatCardDetail.test.tsx"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/StatCardDetail.tsx" "app/(dashboard)/users/StatCardDetail.test.tsx"
git commit -m "feat(profile): StatCardDetail (admin list + compact role/module donuts)"
```

---

## Task 3: Make the cards clickable + wire AccProfileFull

**Files:**
- Modify: `app/(dashboard)/users/AccProfileSection.tsx` (StatCard ~line 148; AccProfileFull state ~line 383; stats grid ~line 533)
- Test: `app/(dashboard)/users/UserProfilePanel.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `app/(dashboard)/users/UserProfilePanel.test.tsx`:

(a) add `fireEvent` to the testing-library import:

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
```

(b) give the `found` user a project (so the stat grid renders), replacing the existing `found` definition:

```tsx
const found: BulkAccUser = {
  ...stub,
  email: "ada@hermosillo.com",
  name: "Ada Lovelace",
  found: true,
  syncedAt: "2026-06-16T00:00:00.000Z",
  photoUrl: null,
  costCenter: "ENG-100",
  projectCount: 1,
  activeCount: 1,
  adminCount: 1,
  hasNoProjects: false,
  projects: [
    { id: "p1", name: "Tower A", status: "active", isAdmin: true, roles: ["Project Admin"], modules: ["build"] },
  ] as BulkAccUser["projects"],
};
```

(c) add these tests inside the `describe`:

```tsx
  it("opens the Admin detail on click and toggles closed", () => {
    render(<UserProfilePanel user={found} email={found.email} variant="rail" />);
    expect(screen.queryByTestId("stat-detail-admin")).toBeNull();
    fireEvent.click(screen.getByTestId("statcard-admin"));
    expect(screen.getByTestId("stat-detail-admin")).toBeTruthy();
    expect(screen.getByText("Tower A")).toBeTruthy();
    fireEvent.click(screen.getByTestId("statcard-admin"));
    expect(screen.queryByTestId("stat-detail-admin")).toBeNull();
  });

  it("disables a zero-count stat card", () => {
    const noRoles = {
      ...found,
      projects: [
        { id: "p1", name: "Tower A", status: "active", isAdmin: true, roles: [], modules: ["build"] },
      ] as BulkAccUser["projects"],
    };
    render(<UserProfilePanel user={noRoles} email={noRoles.email} variant="rail" />);
    expect(screen.getByTestId("statcard-roles").hasAttribute("disabled")).toBe(true);
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: the two new tests FAIL (no `statcard-admin` testid yet); the existing 5 still pass.

- [ ] **Step 3: Add the import + state to AccProfileFull**

In `app/(dashboard)/users/AccProfileSection.tsx`, add the import near the other local imports (top of file, after the existing imports):

```ts
import { StatCardDetail } from "./StatCardDetail";
```

Inside `AccProfileFull`, just after `const projects = data.projects ?? [];`, add:

```ts
  const [activeCard, setActiveCard] = useState<"admin" | "roles" | "modules" | null>(null);
  const toggleCard = (k: "admin" | "roles" | "modules") =>
    setActiveCard((cur) => (cur === k ? null : k));
```

(`useState` is already imported in this file.)

- [ ] **Step 4: Make `StatCard` support click/active/disabled**

Replace the `StatCard` function (the static version, ~lines 148–170) with:

```tsx
function StatCard({
  icon: Icon,
  value,
  label,
  color,
  onClick,
  active,
  disabled,
}: {
  icon: React.ElementType;
  value: number | string;
  label: string;
  color: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const cls = cn(
    "flex flex-col items-center gap-1 px-4 py-3 rounded-xl border transition-colors",
    active ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30" : "border-border/40 bg-card",
    onClick && !disabled && "cursor-pointer hover:border-primary/40 hover:bg-accent/40",
    disabled && "opacity-50 cursor-not-allowed",
  );
  const inner = (
    <>
      <Icon size={16} className={color} />
      <span className="text-xl font-extrabold tabular-nums text-foreground leading-none">{value}</span>
      <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        data-testid={`statcard-${label.toLowerCase()}`}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={active}
        className={cls}
      >
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
```

- [ ] **Step 5: Wire the grid + render the detail**

Replace the aggregate-stats block (~lines 533–542) — the `{projects.length > 0 && ( <div className="grid grid-cols-5 gap-2"> ... </div> )}` — with:

```tsx
      {/* ── Aggregate Stats (Admin / Roles / Modules are clickable) ── */}
      {projects.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-5 gap-2">
            <StatCard icon={FolderOpen} value={stats.total} label="Projects" color="text-blue-500" />
            <StatCard icon={Layers} value={stats.active} label="Active" color="text-green-500" />
            <StatCard
              icon={Crown} value={stats.admin} label="Admin" color="text-amber-500"
              onClick={() => toggleCard("admin")} active={activeCard === "admin"} disabled={stats.admin === 0}
            />
            <StatCard
              icon={Shield} value={stats.roles} label="Roles" color="text-violet-500"
              onClick={() => toggleCard("roles")} active={activeCard === "roles"} disabled={stats.roles === 0}
            />
            <StatCard
              icon={Package} value={stats.modules} label="Modules" color="text-cyan-500"
              onClick={() => toggleCard("modules")} active={activeCard === "modules"} disabled={stats.modules === 0}
            />
          </div>
          {activeCard && <StatCardDetail kind={activeCard} projects={projects} />}
        </div>
      )}
```

- [ ] **Step 6: Run the tests + typecheck**

Run: `npx vitest run "app/(dashboard)/users/UserProfilePanel.test.tsx"`
Expected: PASS (7 tests — 5 existing + 2 new).
Run: `npx tsc --noEmit`
Expected: exit 0.

> Note: the toggle test clicks only the **Admin** card (the list path), so ECharts never mounts in `UserProfilePanel.test.tsx` — no EChart mock is needed there. If importing `StatCardDetail` (which transitively imports `echarts-for-react`) ever breaks that suite, add the same `vi.mock("../access-analysis/components/EChart", ...)` stub used in Task 2.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/AccProfileSection.tsx" "app/(dashboard)/users/UserProfilePanel.test.tsx"
git commit -m "feat(profile): clickable Admin/Roles/Modules stat cards open inline detail"
```

---

## Final verification

- [ ] Run `npx vitest run "app/(dashboard)/users"` then `npx tsc --noEmit` — all green, tsc 0.
- [ ] **Visual check (owner, at rebuild):** open a profile in the access-analysis right sidebar → Admin/Roles/Modules show a hover/pointer affordance; clicking Admin lists the admin projects, Roles/Modules show a donut + legend; clicking the active card closes it; a 0-count card is dimmed and unclickable. Rebuild via the safe side-dist swap (`NEXT_DIST_DIR=.next-new` → swap → `npm start`).

---

## Self-review notes

- **Spec coverage:** Admin list (Task 2 admin branch), Roles/Modules donuts (Task 2 Donut), project-count sizing (`countBy`, Task 1), inline-below-grid + one-at-a-time toggle + active highlight (Task 3 grid + `activeCard`), 0-count disabled (Task 3 StatCard `disabled` + grid `disabled={stats.x === 0}`), Projects/Active static (Task 3 — no onClick), no server calls (all from `projects`), friendly module names (`moduleLabel`), no heavy chart chrome (compact `Donut`, no slider). All spec sections mapped.
- **Type consistency:** `CountSlice {name,value}` defined in Task 1, consumed in Task 2. `ProjectData` imported as a type in both new files. `kind: "admin" | "roles" | "modules"` identical in `StatCardDetail` props, `activeCard` state, and `toggleCard`. `statcard-${label.toLowerCase()}` test ids match the Task 3 component and Task 3 tests (`statcard-admin`, `statcard-roles`). `stat-detail-${kind}` matches between component and tests.
- **jsdom caveat:** ECharts is mocked in `StatCardDetail.test.tsx`; the panel toggle test exercises only the chart-free Admin path.
