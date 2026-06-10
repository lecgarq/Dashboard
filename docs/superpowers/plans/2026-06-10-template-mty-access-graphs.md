# Template MTY — Access Graphs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `/template-mty` tab to mirror `/access-analysis`'s concept for the single MTY template's **19 Project Members**: keep the members table + roles donut + folder terrain, drop the Access-Levels donut, and add two new graphs — a **permission-tier access** graph (which roles/users hold each folder tier, built from the live crawl) and an **ACC module access** graph (which of the 19 has each module, from a new roster field with a clean empty state).

**Architecture:** Two new pure summarizers (`permissionAccess.ts`, `moduleAccess.ts`) feed two new ECharts client components. `lib/server/templateView.ts` gains an async DB loader for the tier join and swaps `accessLevels` for a module summary. The 4 API "Template Members" stay out of the UI (they remain in the DB feeding the terrain only). Everything reuses existing helpers: `summarizeRoles`, `rankForTier`/`TIER_COLORS`/`TIER_LEGEND`, `moduleLabelById`, the `EChart` wrapper, and `FolderPermissionTerrain`.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma 7 (`@prisma/adapter-pg`, `$queryRaw`), ECharts (`echarts-for-react`), Vitest + Testing Library (jsdom), TypeScript.

**Conventions for every task:**
- Run one test file: `npx vitest run "<path>"`
- Typecheck: `npx tsc --noEmit`
- Stage by EXPLICIT PATH only (this branch has large uncommitted WIP). Before every commit run `git diff --cached --name-only` and confirm it lists ONLY the files named in that task.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Add a `modules` field to the roster (+ fill-in guide)

The 19-person roster has no per-person ACC-module data (ACC's API doesn't expose it for a template's project-members list). Add an optional `modules` field the owner fills by hand, with a legend.

**Files:**
- Modify: `lib/acc/template-mty-roster.ts`

- [ ] **Step 1: Add the import + field + legend comment**

At the top of `lib/acc/template-mty-roster.ts`, after the existing header comment block (before `type TemplateAccessLevel`), add:

```typescript
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

// ACC module ids (fill `modules` per member from the ACC web UI — Project Admin →
// the member's product access). Legend:
//   dataManagement = Docs/Files   build = Build           modelCoordination = Model Coordination
//   designCollaboration = Design Collaboration            insight = Insight
//   preconstruction = Takeoff/Cost  design = Forma         autospecs = AutoSpecs   datum = Datum
// Example: modules: ["dataManagement", "build", "modelCoordination"]
```

In the `TemplateRosterMember` interface, add the field after `accessLevel`:

```typescript
export interface TemplateRosterMember {
  name: string;
  email: string;
  company: string;
  role: string;
  accessLevel: TemplateAccessLevel;
  /** ACC modules this member is provisioned for. Empty until captured by hand. */
  modules?: ModuleId[];
}
```

Leave the 19 data rows unchanged (no `modules` yet → the module graph shows its empty state).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (the field is optional; nothing else changes).

- [ ] **Step 3: Commit**

```bash
git add lib/acc/template-mty-roster.ts
git commit -m "feat(template-mty): optional per-member modules field on the roster

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `summarizeModuleAccess` (pure) + test

Counts, per ACC module, how many of the 19 are provisioned for it, with the contributing users and roles.

**Files:**
- Create: `app/(dashboard)/template-mty/moduleAccess.ts`
- Test: `app/(dashboard)/template-mty/__tests__/moduleAccess.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/(dashboard)/template-mty/__tests__/moduleAccess.test.ts
import { describe, it, expect } from "vitest";
import { summarizeModuleAccess } from "../moduleAccess";

describe("summarizeModuleAccess", () => {
  it("returns hasData=false for members without modules", () => {
    const s = summarizeModuleAccess([
      { name: "A", role: "Designer" },
      { name: "B", role: "Architect", modules: [] },
    ]);
    expect(s).toEqual({ slices: [], total: 0, memberCount: 2, hasData: false });
  });

  it("counts distinct members per module with users + roles, sorted desc", () => {
    const s = summarizeModuleAccess([
      { name: "A", role: "Architect", modules: ["dataManagement", "build"] },
      { name: "B", role: "Designer", modules: ["dataManagement"] },
    ]);
    expect(s.hasData).toBe(true);
    expect(s.memberCount).toBe(2);
    expect(s.total).toBe(3);
    expect(s.slices).toEqual([
      { id: "dataManagement", name: "Data Management", userCount: 2, users: ["A", "B"], roles: ["Architect", "Designer"] },
      { id: "build", name: "Build", userCount: 1, users: ["A"], roles: ["Architect"] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/moduleAccess.test.ts"`
Expected: FAIL — cannot find module `../moduleAccess`.

- [ ] **Step 3: Write the implementation**

```typescript
// app/(dashboard)/template-mty/moduleAccess.ts
import { moduleLabelById } from "@/app/(dashboard)/access-analysis/modules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

export interface ModuleAccessSlice {
  id: ModuleId;
  name: string;
  userCount: number;
  users: string[]; // member names provisioned for this module
  roles: string[]; // distinct roles among those members
}

export interface ModuleAccessSummary {
  /** One slice per module ≥1 member has, sorted by member count desc. */
  slices: ModuleAccessSlice[];
  /** Sum of slice user counts (module-grants across members). */
  total: number;
  /** Members considered (the 19). */
  memberCount: number;
  /** False when no member carries any module — drives the empty state. */
  hasData: boolean;
}

/**
 * Which ACC modules the template's project members are provisioned for. Each
 * member is counted once per module; `users`/`roles` carry the breakdown for the
 * chart tooltip. `modules` is empty until the owner fills it in the roster.
 */
export function summarizeModuleAccess(
  members: ReadonlyArray<{ name: string; role: string; modules?: ModuleId[] }>,
): ModuleAccessSummary {
  const acc = new Map<ModuleId, { users: string[]; roles: Set<string> }>();
  for (const m of members) {
    for (const id of m.modules ?? []) {
      const e = acc.get(id) ?? { users: [], roles: new Set<string>() };
      e.users.push(m.name);
      if (m.role) e.roles.add(m.role);
      acc.set(id, e);
    }
  }
  const slices: ModuleAccessSlice[] = [...acc.entries()]
    .map(([id, e]) => ({
      id,
      name: moduleLabelById(id),
      userCount: e.users.length,
      users: e.users,
      roles: [...e.roles],
    }))
    .sort((a, b) => b.userCount - a.userCount || a.name.localeCompare(b.name));
  const total = slices.reduce((s, x) => s + x.userCount, 0);
  return { slices, total, memberCount: members.length, hasData: slices.length > 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/moduleAccess.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/template-mty/moduleAccess.ts" "app/(dashboard)/template-mty/__tests__/moduleAccess.test.ts"
git commit -m "feat(template-mty): module-access summarizer (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `summarizePermissionAccess` (pure) + test

For each folder permission tier, which roles (and how many of the 19 users in them) hold that tier. Roles with no folder permissions fall into `noAccess`.

**Files:**
- Create: `app/(dashboard)/template-mty/permissionAccess.ts`
- Test: `app/(dashboard)/template-mty/__tests__/permissionAccess.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/(dashboard)/template-mty/__tests__/permissionAccess.test.ts
import { describe, it, expect } from "vitest";
import { summarizePermissionAccess } from "../permissionAccess";

// rank legend: 1 View only · 2 View/download · 3 +Upload · 4 +Edit · 5 Full control
describe("summarizePermissionAccess", () => {
  const members = [
    { name: "Cain", role: "Architect" },    // Full Control + View only
    { name: "Elisa", role: "Architect" },
    { name: "Diego", role: "Designer" },     // View only + +Upload + +Edit
    { name: "Maria", role: "Contabilidad" }, // no folder perms
  ];
  const rolePermRanks = {
    Architect: [5, 1],
    Designer: [1, 3, 4],
    // Contabilidad intentionally absent
  };

  it("buckets members per tier (rank desc) with role breakdown, and a no-access bucket", () => {
    const s = summarizePermissionAccess(members, rolePermRanks);
    expect(s.memberCount).toBe(4);

    // tiers ordered rank desc; present ranks here: 5,4,3,1
    expect(s.tiers.map((t) => t.rank)).toEqual([5, 4, 3, 1]);

    const full = s.tiers.find((t) => t.rank === 5)!;
    expect(full.label).toBe("Full control");
    expect(full.userCount).toBe(2); // 2 Architects
    expect(full.roles).toEqual([{ role: "Architect", userCount: 2 }]);

    const view = s.tiers.find((t) => t.rank === 1)!;
    expect(view.userCount).toBe(3); // 2 Architects + 1 Designer
    expect(view.roles).toEqual([
      { role: "Architect", userCount: 2 },
      { role: "Designer", userCount: 1 },
    ]);

    // Contabilidad has no perms → no-access bucket
    expect(s.noAccess).toEqual({ userCount: 1, roles: ["Contabilidad"] });
  });

  it("handles empty members", () => {
    expect(summarizePermissionAccess([], {})).toEqual({
      tiers: [],
      noAccess: { userCount: 0, roles: [] },
      memberCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/permissionAccess.test.ts"`
Expected: FAIL — cannot find module `../permissionAccess`.

- [ ] **Step 3: Write the implementation**

```typescript
// app/(dashboard)/template-mty/permissionAccess.ts
import { TIER_LEGEND } from "@/app/(dashboard)/access-analysis/folderTerrain";

export interface TierRoleBreakdown {
  role: string;
  userCount: number;
}

export interface TierAccess {
  rank: number; // 1..5
  label: string; // from TIER_LEGEND
  userCount: number; // distinct members whose role grants this tier ≥ once
  roles: TierRoleBreakdown[]; // contributing roles, desc by user count
}

export interface PermissionAccessSummary {
  /** Present tiers, ordered by rank desc (Full control → View only). */
  tiers: TierAccess[];
  /** Members whose role holds no folder permission at all. */
  noAccess: { userCount: number; roles: string[] };
  memberCount: number;
}

const RANK_LABEL = new Map(TIER_LEGEND.map((t) => [t.rank, t.label]));

/**
 * For each permission tier, which roles — and how many of the given members in
 * them — hold that tier somewhere in the template's folder tree.
 *
 * `rolePermRanks` maps a role NAME to the tier ranks it holds anywhere. A role
 * can grant several tiers, so a member is counted under every tier their role
 * grants — these are per-tier reach counts, not a partition (the panel says so).
 */
export function summarizePermissionAccess(
  members: ReadonlyArray<{ name: string; role: string }>,
  rolePermRanks: Record<string, number[]>,
): PermissionAccessSummary {
  const byRank = new Map<number, Map<string, number>>();
  const noAccessRoles = new Set<string>();
  let noAccessUsers = 0;

  for (const m of members) {
    const ranks = rolePermRanks[m.role] ?? [];
    if (ranks.length === 0) {
      noAccessUsers += 1;
      if (m.role) noAccessRoles.add(m.role);
      continue;
    }
    for (const rank of new Set(ranks)) {
      const roleMap = byRank.get(rank) ?? new Map<string, number>();
      roleMap.set(m.role, (roleMap.get(m.role) ?? 0) + 1);
      byRank.set(rank, roleMap);
    }
  }

  const tiers: TierAccess[] = [...byRank.entries()]
    .map(([rank, roleMap]) => {
      const roles = [...roleMap.entries()]
        .map(([role, userCount]) => ({ role, userCount }))
        .sort((a, b) => b.userCount - a.userCount || a.role.localeCompare(b.role));
      const userCount = roles.reduce((s, r) => s + r.userCount, 0);
      return { rank, label: RANK_LABEL.get(rank) ?? `Tier ${rank}`, userCount, roles };
    })
    .sort((a, b) => b.rank - a.rank);

  return {
    tiers,
    noAccess: { userCount: noAccessUsers, roles: [...noAccessRoles].sort((a, b) => a.localeCompare(b)) },
    memberCount: members.length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/permissionAccess.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/template-mty/permissionAccess.ts" "app/(dashboard)/template-mty/__tests__/permissionAccess.test.ts"
git commit -m "feat(template-mty): permission-tier access summarizer (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Update `templateView.ts` (drop accessLevels, add module summary + tier loader)

**Files:**
- Modify: `lib/server/templateView.ts` (full new content below)
- Modify: `lib/server/__tests__/templateView.test.ts`

- [ ] **Step 1: Update the test first**

Replace the whole body of `lib/server/__tests__/templateView.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import { buildTemplateOverview } from "@/lib/server/templateView";
import type { TemplateRosterMember } from "@/lib/acc/template-mty-roster";

const roster: TemplateRosterMember[] = [
  { name: "Cain", email: "cain@hermosillo.com", company: "Hermosillo", role: "Architect", accessLevel: "Project Admin", modules: ["dataManagement", "build"] },
  { name: "Diego", email: "diego@hermosillo.com", company: "Hermosillo", role: "Designer", accessLevel: "Project Member", modules: ["dataManagement"] },
  { name: "Guest", email: "guest@outside.com", company: "Outside Co", role: "Designer", accessLevel: "Project Member" },
];

describe("buildTemplateOverview", () => {
  it("builds members, role/company breakdowns, module summary, and counts from the roster", () => {
    const o = buildTemplateOverview(roster, "2026-06-09");

    expect(o.memberCount).toBe(3);
    expect(o.updatedAt).toBe("2026-06-09");

    // internal/external + admin derived from email + accessLevel, order preserved
    expect(o.members.map((m) => m.isInternal)).toEqual([true, true, false]);
    expect(o.members.map((m) => m.isAdmin)).toEqual([true, false, false]);
    expect(o.adminCount).toBe(1);

    // roles: Designer 2, Architect 1
    expect(o.distinctRoles).toBe(2);
    expect(o.roleSummary.slices).toEqual([
      { name: "Designer", value: 2 },
      { name: "Architect", value: 1 },
    ]);

    // module summary delegates to summarizeModuleAccess
    expect(o.moduleSummary.hasData).toBe(true);
    expect(o.moduleSummary.memberCount).toBe(3);
    expect(o.moduleSummary.slices.find((s) => s.id === "dataManagement")?.userCount).toBe(2);

    // companies, sorted by count desc
    expect(o.companies).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: "Outside Co", value: 1 },
    ]);
    expect(o.companyCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "lib/server/__tests__/templateView.test.ts"`
Expected: FAIL — `o.moduleSummary` is undefined (and the old `accessLevels` assertion is gone).

- [ ] **Step 3: Replace `lib/server/templateView.ts` with**

```typescript
import "server-only";
import { db } from "@/server/db";
import { summarizeRoles, type RoleSummary } from "@/app/(dashboard)/access-analysis/roleCounts";
import { rankForTier } from "@/app/(dashboard)/access-analysis/folderTerrain";
import {
  TEMPLATE_MTY_ROSTER,
  TEMPLATE_MTY_ROSTER_UPDATED,
  type TemplateRosterMember,
} from "@/lib/acc/template-mty-roster";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";
import {
  summarizeModuleAccess,
  type ModuleAccessSummary,
} from "@/app/(dashboard)/template-mty/moduleAccess";
import {
  summarizePermissionAccess,
  type PermissionAccessSummary,
} from "@/app/(dashboard)/template-mty/permissionAccess";

const INTERNAL_DOMAIN = "@hermosillo.com";

export interface TemplateMember {
  name: string;
  email: string;
  company: string;
  role: string;
  accessLevel: string;
  isInternal: boolean;
  isAdmin: boolean;
}

export interface CategorySlice {
  name: string;
  value: number;
}

export interface TemplateOverview {
  members: TemplateMember[];
  roleSummary: RoleSummary;
  distinctRoles: number;
  /** Per-module provisioning across the 19 (empty until the roster is filled). */
  moduleSummary: ModuleAccessSummary;
  companies: CategorySlice[];
  memberCount: number;
  adminCount: number;
  companyCount: number;
  /** Date the roster was last captured from ACC (it has no API to refresh). */
  updatedAt: string;
}

function tally(items: string[]): CategorySlice[] {
  const counts = new Map<string, number>();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/** Pure assembly from the committed roster — unit-tested. No I/O. */
export function buildTemplateOverview(
  roster: TemplateRosterMember[],
  updatedAt: string,
): TemplateOverview {
  const members: TemplateMember[] = roster.map((r) => ({
    name: r.name,
    email: r.email,
    company: r.company,
    role: r.role,
    accessLevel: r.accessLevel,
    isInternal: r.email.toLowerCase().endsWith(INTERNAL_DOMAIN),
    isAdmin: r.accessLevel === "Project Admin",
  }));

  const roleSummary = summarizeRoles(roster.map((r) => ({ roles: [r.role] })));
  const moduleSummary = summarizeModuleAccess(
    roster.map((r) => ({ name: r.name, role: r.role, modules: r.modules })),
  );
  const companies = tally(roster.map((r) => r.company));

  return {
    members,
    roleSummary,
    distinctRoles: roleSummary.distinctRoles,
    moduleSummary,
    companies,
    memberCount: roster.length,
    adminCount: members.filter((m) => m.isAdmin).length,
    companyCount: companies.length,
    updatedAt,
  };
}

/** Build the template overview from the committed roster. */
export function loadTemplateOverview(): TemplateOverview {
  return buildTemplateOverview(TEMPLATE_MTY_ROSTER, TEMPLATE_MTY_ROSTER_UPDATED);
}

/**
 * Permission-tier access for the 19 project members: join each member's role to
 * the folder-permission tiers that role holds on the template (live DB). Roles
 * absent from the folder permissions (e.g. Dirección, Contabilidad) land in the
 * summary's `noAccess` bucket.
 */
export async function loadTemplatePermissionAccess(): Promise<PermissionAccessSummary> {
  const rows = await db.$queryRaw<Array<{ role_name: string; perm_type: string }>>`
    SELECT DISTINCT r.name AS role_name, fp."permType" AS perm_type
    FROM "AccFolderPermission" fp
    JOIN "AccRole" r ON r.id = fp."roleId"
    JOIN "AccFolder" f ON f.id = fp."folderId"
    WHERE f."projectId" = ${TEMPLATE_MTY_ID}
  `;
  const rolePermRanks: Record<string, number[]> = {};
  for (const row of rows) {
    (rolePermRanks[row.role_name] ??= []).push(rankForTier(row.perm_type));
  }
  return summarizePermissionAccess(
    TEMPLATE_MTY_ROSTER.map((r) => ({ name: r.name, role: r.role })),
    rolePermRanks,
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run "lib/server/__tests__/templateView.test.ts"`
Expected: PASS (1 test).
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/templateView.ts lib/server/__tests__/templateView.test.ts
git commit -m "feat(template-mty): templateView serves module summary + tier-access loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `ModuleAccessChart` component (+ empty-state test)

A horizontal bar chart (one bar per ACC module) with a user/role tooltip, and a clear empty state until the roster carries module data.

**Files:**
- Create: `app/(dashboard)/template-mty/components/ModuleAccessChart.tsx`
- Test: `app/(dashboard)/template-mty/__tests__/ModuleAccessChart.test.tsx`

- [ ] **Step 1: Write the failing test (empty state — no ECharts/canvas)**

```typescript
// app/(dashboard)/template-mty/__tests__/ModuleAccessChart.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModuleAccessChart } from "../components/ModuleAccessChart";

describe("ModuleAccessChart", () => {
  it("shows the add-data empty state when there is no module data", () => {
    render(<ModuleAccessChart summary={{ slices: [], total: 0, memberCount: 19, hasData: false }} />);
    expect(screen.getByText(/no module access captured yet/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/ModuleAccessChart.test.tsx"`
Expected: FAIL — cannot find module `../components/ModuleAccessChart`.

- [ ] **Step 3: Write the component**

```typescript
// app/(dashboard)/template-mty/components/ModuleAccessChart.tsx
"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart";
import type { EChartsOption } from "echarts";
import type { ModuleAccessSummary } from "../moduleAccess";

export function ModuleAccessChart({ summary }: { summary: ModuleAccessSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const cText = dark ? "#e4e4e7" : "#374151";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";
  const cBar = "#6366f1";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";

  const slices = summary.slices;
  const byName = useMemo(() => new Map(slices.map((s) => [s.name, s])), [slices]);

  const option = useMemo<EChartsOption>(() => {
    // Category axis renders bottom-up, so reverse to put the largest bar on top.
    const names = slices.map((s) => s.name).reverse();
    const values = slices.map((s) => s.userCount).reverse();
    return {
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: cTipBg,
        borderColor: cAxis,
        borderWidth: 1,
        textStyle: { color: cText },
        extraCssText: "border-radius:10px;",
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          const name = (p as { name?: string }).name;
          const s = name ? byName.get(name) : undefined;
          if (!s) return "";
          const roles = s.roles.length ? s.roles.join(", ") : "—";
          return `<b>${s.name}</b><br/>${s.userCount} members<br/><span style="opacity:.7">${roles}</span>`;
        },
      },
      xAxis: { type: "value", minInterval: 1, axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText }, splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } } },
      yAxis: { type: "category", data: names, axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText } },
      series: [
        {
          type: "bar",
          data: values,
          itemStyle: { color: cBar, borderRadius: [0, 5, 5, 0] },
          barWidth: "58%",
          label: { show: true, position: "right", color: cText, formatter: "{c}" },
        },
      ],
    };
  }, [slices, byName, cText, cAxis, cTipBg]);

  if (!summary.hasData) {
    return (
      <div className="flex min-h-[160px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        <span className="font-medium text-foreground">No module access captured yet</span>
        <span>Add <code className="rounded bg-muted px-1.5 py-0.5">modules</code> to each member in <code className="rounded bg-muted px-1.5 py-0.5">lib/acc/template-mty-roster.ts</code>.</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <EChart option={option} height={Math.max(160, slices.length * 34 + 24)} notMerge={false} />
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/ModuleAccessChart.test.tsx"`
Expected: PASS (1 test).
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/template-mty/components/ModuleAccessChart.tsx" "app/(dashboard)/template-mty/__tests__/ModuleAccessChart.test.tsx"
git commit -m "feat(template-mty): module-access bar chart + empty state

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `PermissionAccessChart` component

A horizontal bar per permission tier (Full control → View only) plus a "No folder access" row, colored by the terrain's tier palette, with a role/user breakdown tooltip.

**Files:**
- Create: `app/(dashboard)/template-mty/components/PermissionAccessChart.tsx`

- [ ] **Step 1: Write the component**

```typescript
// app/(dashboard)/template-mty/components/PermissionAccessChart.tsx
"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart";
import { TIER_COLORS } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { EChartsOption } from "echarts";
import type { PermissionAccessSummary } from "../permissionAccess";

const NO_ACCESS = "#71717a"; // zinc — the "no folder access" row

interface Row {
  label: string;
  value: number;
  color: string;
  roles: Array<{ role: string; userCount: number }>;
}

export function PermissionAccessChart({ summary }: { summary: PermissionAccessSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const cText = dark ? "#e4e4e7" : "#374151";
  const cAxis = dark ? "#3f3f46" : "#e5e7eb";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";

  const rows = useMemo<Row[]>(() => {
    const tierRows: Row[] = summary.tiers.map((t) => ({
      label: t.label,
      value: t.userCount,
      color: TIER_COLORS[t.rank] ?? NO_ACCESS,
      roles: t.roles,
    }));
    if (summary.noAccess.userCount > 0) {
      tierRows.push({
        label: "No folder access",
        value: summary.noAccess.userCount,
        color: NO_ACCESS,
        roles: summary.noAccess.roles.map((role) => ({ role, userCount: 0 })),
      });
    }
    return tierRows;
  }, [summary]);

  const byLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);

  const option = useMemo<EChartsOption>(() => {
    const ordered = [...rows].reverse(); // category axis is bottom-up
    return {
      grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: cTipBg,
        borderColor: cAxis,
        borderWidth: 1,
        textStyle: { color: cText },
        extraCssText: "border-radius:10px;",
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          const name = (p as { name?: string }).name;
          const r = name ? byLabel.get(name) : undefined;
          if (!r) return "";
          const lines = r.roles.length
            ? r.roles.map((x) => `${x.role}${x.userCount ? ` (${x.userCount})` : ""}`).join("<br/>")
            : "—";
          return `<b>${r.label}</b><br/>${r.value} members<br/><span style="opacity:.7">${lines}</span>`;
        },
      },
      xAxis: { type: "value", minInterval: 1, axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText }, splitLine: { lineStyle: { color: cAxis, opacity: 0.4 } } },
      yAxis: { type: "category", data: ordered.map((r) => r.label), axisLine: { lineStyle: { color: cAxis } }, axisLabel: { color: cText } },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => ({ value: r.value, itemStyle: { color: r.color, borderRadius: [0, 5, 5, 0] } })),
          barWidth: "58%",
          label: { show: true, position: "right", color: cText, formatter: "{c}" },
        },
      ],
    };
  }, [rows, byLabel, cText, cAxis, cTipBg]);

  if (rows.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No folder permission data for this template.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <EChart option={option} height={Math.max(180, rows.length * 38 + 24)} notMerge={false} />
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        A role can grant several tiers across folders, so a member is counted under every tier their role grants.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/template-mty/components/PermissionAccessChart.tsx"
git commit -m "feat(template-mty): permission-tier access bar chart

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Wire the shell + page; remove the Access-Levels donut

**Files:**
- Modify: `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` (full new content)
- Modify: `app/(dashboard)/template-mty/page.tsx` (full new content)
- Delete: `app/(dashboard)/template-mty/components/AccessLevelPieChart.tsx`

- [ ] **Step 1: Replace `TemplateAnalysisCharts.tsx` with**

```typescript
// app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
"use client";
import { RolesPieChart } from "@/app/(dashboard)/access-analysis/components/RolesPieChart";
import { FolderPermissionTerrain } from "@/app/(dashboard)/access-analysis/components/FolderPermissionTerrain";
import { loadTerrainForProject } from "@/app/(dashboard)/access-analysis/folderTerrainActions";
import type { FolderTerrainData, TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { TemplateOverview } from "@/lib/server/templateView";
import type { PermissionAccessSummary } from "../permissionAccess";
import { PermissionAccessChart } from "./PermissionAccessChart";
import { ModuleAccessChart } from "./ModuleAccessChart";
import { TemplateMembersTable } from "./TemplateMembersTable";

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function TemplateAnalysisCharts({
  overview, terrain, terrainOption, permissionAccess,
}: {
  overview: TemplateOverview;
  terrain: FolderTerrainData | null;
  terrainOption: TerrainProjectOption;
  permissionAccess: PermissionAccessSummary;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">Template</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.memberCount}</b> members</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.adminCount}</b> admins</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.distinctRoles}</b> roles</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.companyCount}</b> companies</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5">roster updated {overview.updatedAt}</span>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Project members" subtitle="The roster that projects created from this template inherit — with each member's role, company, and access level." />
        <TemplateMembersTable members={overview.members} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across the template's member roster." />
        <RolesPieChart data={overview.roleSummary.slices} distinctRoles={overview.distinctRoles} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Folder access by tier" subtitle="Which roles — and how many of the members in them — hold each folder permission tier." />
        <PermissionAccessChart summary={permissionAccess} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="ACC module access" subtitle="Which ACC modules the template's members are provisioned for." />
        <ModuleAccessChart summary={overview.moduleSummary} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Folder permission terrain" subtitle="Each Level-2 folder × role, coloured by permission tier and raised by users in that role." />
        <FolderPermissionTerrain
          projects={[terrainOption]}
          initial={terrain}
          loadTerrain={loadTerrainForProject}
          singleProject
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Replace `page.tsx` with**

```typescript
// app/(dashboard)/template-mty/page.tsx
import { loadTemplateOverview, loadTemplatePermissionAccess } from "@/lib/server/templateView";
import { loadFolderPermissionTerrain } from "@/lib/server/folderPermissionTerrainView";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import type { TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import { TemplateAnalysisCharts } from "./components/TemplateAnalysisCharts";

export const metadata = { title: "Template MTY" };
export const dynamic = "force-dynamic";

export default async function TemplateMtyRoute() {
  const [overview, terrain, permissionAccess] = await Promise.all([
    loadTemplateOverview(),
    loadFolderPermissionTerrain(TEMPLATE_MTY_ID),
    loadTemplatePermissionAccess(),
  ]);

  const terrainOption: TerrainProjectOption = {
    id: TEMPLATE_MTY_ID,
    name: TEMPLATE_MTY_NAME,
    office: terrain?.office ?? "",
    folderCount: terrain?.folders.length ?? 0,
    permCount: terrain?.cells.length ?? 0,
    userRoleCount: terrain?.maxUserCount ?? 0,
  };

  return (
    <div className="h-full overflow-y-auto text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
            ACC · Template Analysis
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{TEMPLATE_MTY_NAME}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Members, roles, folder access, and module provisioning for the ACC Template MTY project template.
          </p>
        </header>

        <TemplateAnalysisCharts
          overview={overview}
          terrain={terrain}
          terrainOption={terrainOption}
          permissionAccess={permissionAccess}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Delete the now-unused Access-Levels donut**

```bash
git rm "app/(dashboard)/template-mty/components/AccessLevelPieChart.tsx"
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no references to `AccessLevelPieChart` or `overview.accessLevels` remain).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx" "app/(dashboard)/template-mty/page.tsx"
git commit -m "feat(template-mty): wire access graphs into the tab; drop access-levels donut

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Full verification + manual UAT

- [ ] **Step 1: Whole-suite checks**

Run each and confirm:
- `npx tsc --noEmit` → PASS (0 errors)
- `npx vitest run "app/(dashboard)/template-mty" "lib/server/__tests__/templateView.test.ts"` → PASS (all template tests, including the 3 new files)
- `npm test` → whole suite green
- `npx eslint "app/(dashboard)/template-mty" lib/server/templateView.ts lib/acc/template-mty-roster.ts` → no errors

- [ ] **Step 2: Rebuild safely and load the app**

Per the project deploy mechanics (do NOT `npm run build` under the running :3000 — it 500s the live app). Build into a side dir, then swap:

```bash
# from C:\LECG\Dashboard (Bash tool)
NEXT_DIST_DIR=.next-new npm run build && echo BUILD_OK
```
Then (owner or careful swap): stop the running server, replace `.next` with `.next-new`, `npm start`.

- [ ] **Step 3: Manual check (real app)**

Navigate to **Template MTY** in the Organization nav group and confirm:
- Header: 19 members · N admins · roles · companies · roster date.
- Members table lists the 19 project members.
- Role distribution donut renders.
- **Folder access by tier** bar chart shows Full control / +Edit / +Upload / View+download / View only bars, plus a **No folder access** row (Dirección + Contabilidad members), with role breakdowns on hover.
- **ACC module access** shows the "add module data" empty state (until the roster is filled).
- Folder permission terrain renders (206 folders) with NO Single/Compare/Overview toggle.
- Access Analysis tab still does NOT list the template in its terrain picker.

---

## Notes for the implementer

- **Surgical staging:** this branch carries large uncommitted WIP. NEVER `git add -A`/`git add .`. Stage only the explicit paths in each task and check `git diff --cached --name-only` before committing.
- **Module graph is intentionally empty** until the owner fills `modules` in `lib/acc/template-mty-roster.ts`. The empty state is the expected v1 state; the rest of the tab is unaffected.
- **Role-name join:** the permission-tier loader joins the in-code roster role names to DB `AccRole` names. Verified for the current roster (Architect, Designer, Core, VDC Innovacion, Gerente De Desarrollo, Gerente De Construccion have perms; Dirección, Contabilidad don't → "No folder access").
- **ECharts in jsdom:** only the empty-state branch of `ModuleAccessChart` is unit-tested (plain DOM); the chart-rendering branches are covered by the manual UAT, matching the repo's existing chart-test scope.
