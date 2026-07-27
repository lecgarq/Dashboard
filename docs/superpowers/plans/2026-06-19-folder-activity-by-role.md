# Folder Activity by Role — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Folder Activity by Role" panel to `/access-analysis` — a collapsible tree (folder → activity count → role → user) scoped by the page's existing project selection.

**Architecture:** The server stays "dumb": one query returns per-project folder-activity totals, another returns one project's `(folder, user)` counts. The client attributes each user to the role they hold on that project using the `membershipRows` it already has in memory (same shape as the existing "Activity by role" donut), folds the rows into a folder→role→user tree, and renders it in a lazy "expand to load" panel modeled on `TerrainReveal`.

**Tech Stack:** Next.js App Router (RSC + server actions), Prisma (`$queryRaw` against Postgres), React client components, Vitest + Testing Library, Playwright (e2e on `:3100`).

## Global Constraints

- **Activity source:** `AccActivityAccds` only — it is the only table with `folderId`/`folderName`. Count only rows where `folderName IS NOT NULL AND folderName <> ''` (folder-scoped/file activity; ~86% of accds rows). Never read folder data from `AccActivity` (it has none).
- **Folder keying:** across projects, never merge (folders nest under their project); within one project, **merge same-name folders** by `folderName`.
- **Role bucketing:** reuse `UNKNOWN_ROLE` ("Unknown") and `MULTIPLE_ROLES` ("Multiple roles") from `roleCounts.ts` exactly — 0 roles → Unknown, 1 → that role, 2+ → Multiple roles.
- **Theme:** colors that aren't data-driven must use CSS-var tokens (`text-foreground`, `bg-muted`, …); read `resolvedTheme` via `useTheme` only where a value must branch on theme. No hardcoded zinc (per the dashboard theme-token rule).
- **Tests:** Vitest. Do NOT use jest-dom matchers (`toBeInTheDocument`, `toHaveAttribute`); assert with `.textContent`, `.hasAttribute()`, `getByTestId`, etc. (the repo has no jest-dom; `next build` typechecks tests).
- **Gates before any rebuild:** `npx tsc --noEmit` (whole tree incl. tests) AND the unit suite must be green. Do NOT run `npm run build` while the `:3000` instance is live.
- **Every commit message ends with the trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Stage by explicit path only (never `git add -A`/`.`); run `git diff --cached --name-only` before each commit (this branch carries large uncommitted WIP).

## File Structure

| File | Responsibility |
|---|---|
| `app/(dashboard)/access-analysis/folderActivityCounts.ts` (new) | Pure fold: `(folder×user rows, memberships) → folders[{name,total,roleSlices,usersByRole}]`. No React/IO. |
| `app/(dashboard)/access-analysis/__tests__/folderActivityCounts.test.ts` (new) | Unit tests for the fold. |
| `app/(dashboard)/access-analysis/roleColors.ts` (new) | Shared role palette + `buildRoleColorMap(names)`; stable color per role name. |
| `app/(dashboard)/access-analysis/__tests__/roleColors.test.ts` (new) | Unit tests for the color map. |
| `lib/server/folderActivityView.ts` (new) | Two cached `server-only` loaders: per-project totals + one project's `(folder,user)` rows. |
| `app/(dashboard)/access-analysis/folderActivityActions.ts` (new) | `"use server"` auth-gated wrappers around the two loaders. |
| `app/(dashboard)/access-analysis/components/FolderActivityByRole.tsx` (new) | Presentational tree for ONE project: folder rows + stacked role bar, expand → roles, expand → users, Top-N, user click. |
| `app/(dashboard)/access-analysis/__tests__/FolderActivityByRole.test.tsx` (new) | Component tests (in-memory summary). |
| `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx` (new) | Lazy "expand to load" wrapper; adaptive single/multi-project; wires loaders + memberships→summary. |
| `app/(dashboard)/access-analysis/__tests__/FolderActivityReveal.test.tsx` (new) | Component tests with mocked loaders. |
| `app/(dashboard)/access-analysis/mainCharts.tsx` (modify) | Pass the two loaders as props (no new blocking fetch). |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` (modify) | Render `<FolderActivityReveal>` in a `Reveal`, passing `selected`, `membershipRows`, loaders. |
| `tests/e2e/folder-activity-by-role.spec.ts` (new) | Smoke: expand panel → tree renders. |
| `scripts/diag-folder-activity-coverage.cjs` (delete) | Throwaway feasibility probe. |

---

### Task 1: Pure fold — `folderActivityCounts.ts`

**Files:**
- Create: `app/(dashboard)/access-analysis/folderActivityCounts.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/folderActivityCounts.test.ts`

**Interfaces:**
- Consumes: `RoleSlice`, `DrillPerson`, `UNKNOWN_ROLE`, `MULTIPLE_ROLES` from `./roleCounts`; `MembershipRolesInput` from `./roleActivityCounts`.
- Produces:
  - `interface FolderActivityRow { folderName: string; userEmail: string; userName: string; count: number }`
  - `interface FolderActivityNode { name: string; total: number; roleSlices: RoleSlice[]; usersByRole: Map<string, DrillPerson[]> }`
  - `interface FolderActivitySummary { folders: FolderActivityNode[]; total: number; distinctRoles: number }`
  - `function rolesByEmailForProject(memberships: ReadonlyArray<MembershipRolesInput>, projectId: string): Map<string, string[]>`
  - `function summarizeFolderActivity(rows: ReadonlyArray<FolderActivityRow>, rolesByEmail: ReadonlyMap<string, string[]>): FolderActivitySummary`

- [ ] **Step 1: Write the failing tests**

Create `app/(dashboard)/access-analysis/__tests__/folderActivityCounts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  summarizeFolderActivity,
  rolesByEmailForProject,
  type FolderActivityRow,
} from "../folderActivityCounts";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

const row = (folderName: string, userEmail: string, count: number, userName = userEmail): FolderActivityRow =>
  ({ folderName, userEmail, userName, count });

describe("rolesByEmailForProject", () => {
  it("keeps only memberships for the given project, keyed by email", () => {
    const m = rolesByEmailForProject(
      [
        { projectId: "p1", email: "a@x.com", roles: ["Manager"] },
        { projectId: "p2", email: "a@x.com", roles: ["Viewer"] },
      ],
      "p1",
    );
    expect(m.get("a@x.com")).toEqual(["Manager"]);
    expect(m.size).toBe(1);
  });
});

describe("summarizeFolderActivity", () => {
  it("returns an empty summary for no rows", () => {
    const s = summarizeFolderActivity([], new Map());
    expect(s.folders).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.distinctRoles).toBe(0);
  });

  it("merges same-name folders within the project and sums their activity", () => {
    const s = summarizeFolderActivity(
      [row("PDF", "a@x.com", 10), row("PDF", "b@x.com", 5)],
      new Map([["a@x.com", ["Manager"]], ["b@x.com", ["Manager"]]]),
    );
    expect(s.folders).toHaveLength(1);
    expect(s.folders[0].name).toBe("PDF");
    expect(s.folders[0].total).toBe(15);
  });

  it("attributes each folder's activity to the actor's role and lists users per role", () => {
    const s = summarizeFolderActivity(
      [row("ARQ", "a@x.com", 8, "Ana"), row("ARQ", "b@x.com", 2, "Ben")],
      new Map([["a@x.com", ["Manager"]], ["b@x.com", ["Viewer"]]]),
    );
    const arq = s.folders[0];
    expect(arq.roleSlices).toEqual([
      { name: "Manager", value: 8 },
      { name: "Viewer", value: 2 },
    ]);
    expect(arq.usersByRole.get("Manager")).toEqual([{ email: "a@x.com", name: "Ana", count: 8 }]);
    expect(arq.usersByRole.get("Viewer")).toEqual([{ email: "b@x.com", name: "Ben", count: 2 }]);
  });

  it("buckets no-role and multi-role actors into Unknown / Multiple roles", () => {
    const s = summarizeFolderActivity(
      [row("F", "ghost@x.com", 3), row("F", "multi@x.com", 4)],
      new Map([["multi@x.com", ["Admin", "Member"]]]),
    );
    const f = s.folders[0];
    const byName = new Map(f.roleSlices.map((r) => [r.name, r.value]));
    expect(byName.get(UNKNOWN_ROLE)).toBe(3);
    expect(byName.get(MULTIPLE_ROLES)).toBe(4);
  });

  it("sorts folders by total desc, role slices by value desc, and users by count desc", () => {
    const s = summarizeFolderActivity(
      [
        row("Big", "a@x.com", 9, "A"),
        row("Big", "b@x.com", 1, "B"),
        row("Small", "a@x.com", 2, "A"),
      ],
      new Map([["a@x.com", ["Role"]], ["b@x.com", ["Role"]]]),
    );
    expect(s.folders.map((f) => f.name)).toEqual(["Big", "Small"]);
    expect(s.folders[0].usersByRole.get("Role")).toEqual([
      { email: "a@x.com", name: "A", count: 9 },
      { email: "b@x.com", name: "B", count: 1 },
    ]);
    expect(s.total).toBe(12);
  });

  it("counts distinctRoles as the number of single-role names credited", () => {
    const s = summarizeFolderActivity(
      [row("F", "a@x.com", 1), row("F", "b@x.com", 1), row("F", "c@x.com", 1)],
      new Map([["a@x.com", ["Manager"]], ["b@x.com", ["Manager"]], ["c@x.com", ["Viewer"]]]),
    );
    expect(s.distinctRoles).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/folderActivityCounts.test.ts`
Expected: FAIL — `Cannot find module '../folderActivityCounts'`.

- [ ] **Step 3: Write the implementation**

Create `app/(dashboard)/access-analysis/folderActivityCounts.ts`:

```ts
/**
 * Pure aggregation for the "Folder Activity by Role" tree. Each input row is a
 * (folder, actor) activity total within ONE project. Rows fold into folders
 * (same-name folders merged within the project), each folder's activity is
 * attributed to the role the actor holds on that project, and each role lists
 * the users behind it. Role bucketing mirrors roleActivityCounts exactly so the
 * panel and the "Activity by role" donut agree. No React/DOM/IO.
 */
import { UNKNOWN_ROLE, MULTIPLE_ROLES, type RoleSlice, type DrillPerson } from "./roleCounts";
import type { MembershipRolesInput } from "./roleActivityCounts";

/** One shipped row: total folder-scoped activity for a (folder, actor) pair. */
export interface FolderActivityRow {
  folderName: string;
  userEmail: string;
  userName: string;
  count: number;
}

export interface FolderActivityNode {
  /** Folder leaf name (same-name folders merged within the project). */
  name: string;
  /** Total activity in this folder across all roles. */
  total: number;
  /** Role → activity in this folder, sorted desc; includes Unknown / Multiple roles. */
  roleSlices: RoleSlice[];
  /** Role label → contributing users, sorted by count desc. */
  usersByRole: Map<string, DrillPerson[]>;
}

export interface FolderActivitySummary {
  /** Folders sorted by total activity desc. */
  folders: FolderActivityNode[];
  /** Sum of all folder totals (= folder-scoped activity in scope). */
  total: number;
  /** Distinct single-role names credited anywhere in this project. */
  distinctRoles: number;
}

/** Build an email → roles lookup for one project from the in-memory memberships. */
export function rolesByEmailForProject(
  memberships: ReadonlyArray<MembershipRolesInput>,
  projectId: string,
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const mem of memberships) {
    if (mem.projectId === projectId) m.set(mem.email, mem.roles);
  }
  return m;
}

/** Bucket a person's roles into a single slice label (Unknown / role / Multiple). */
function labelFor(roles: string[] | undefined): { label: string; single: string | null } {
  const unique = [...new Set(roles ?? [])];
  if (unique.length === 0) return { label: UNKNOWN_ROLE, single: null };
  if (unique.length === 1) return { label: unique[0], single: unique[0] };
  return { label: MULTIPLE_ROLES, single: null };
}

export function summarizeFolderActivity(
  rows: ReadonlyArray<FolderActivityRow>,
  rolesByEmail: ReadonlyMap<string, string[]>,
): FolderActivitySummary {
  // folderName -> { total, role -> value, role -> (email -> person) }
  const folders = new Map<
    string,
    { total: number; roleValue: Map<string, number>; usersAgg: Map<string, Map<string, DrillPerson>> }
  >();
  const distinct = new Set<string>();

  for (const r of rows) {
    const { label, single } = labelFor(rolesByEmail.get(r.userEmail));
    if (single) distinct.add(single);

    const f =
      folders.get(r.folderName) ??
      folders.set(r.folderName, { total: 0, roleValue: new Map(), usersAgg: new Map() }).get(r.folderName)!;
    f.total += r.count;
    f.roleValue.set(label, (f.roleValue.get(label) ?? 0) + r.count);

    const byEmail = f.usersAgg.get(label) ?? f.usersAgg.set(label, new Map()).get(label)!;
    const cur = byEmail.get(r.userEmail);
    if (cur) cur.count += r.count;
    else byEmail.set(r.userEmail, { email: r.userEmail, name: r.userName || r.userEmail, count: r.count });
  }

  const nodes: FolderActivityNode[] = [...folders.entries()].map(([name, f]) => {
    const roleSlices = [...f.roleValue.entries()]
      .map(([rn, value]) => ({ name: rn, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const usersByRole = new Map<string, DrillPerson[]>();
    for (const [rn, byEmail] of f.usersAgg) {
      usersByRole.set(
        rn,
        [...byEmail.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      );
    }
    return { name, total: f.total, roleSlices, usersByRole };
  });

  nodes.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const total = nodes.reduce((s, n) => s + n.total, 0);
  return { folders: nodes, total, distinctRoles: distinct.size };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/folderActivityCounts.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/folderActivityCounts.ts" "app/(dashboard)/access-analysis/__tests__/folderActivityCounts.test.ts"
git diff --cached --name-only
git commit -m "feat(acc): pure fold for folder-activity-by-role tree"
```

---

### Task 2: Shared role colors — `roleColors.ts`

**Files:**
- Create: `app/(dashboard)/access-analysis/roleColors.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/roleColors.test.ts`

**Interfaces:**
- Consumes: `UNKNOWN_ROLE`, `MULTIPLE_ROLES` from `./roleCounts`.
- Produces: `function buildRoleColorMap(roleNames: ReadonlyArray<string>): Map<string, string>` (stable color per role; Unknown=amber, Multiple=rose, others cycle a fixed palette in input order).

- [ ] **Step 1: Write the failing tests**

Create `app/(dashboard)/access-analysis/__tests__/roleColors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildRoleColorMap } from "../roleColors";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";

describe("buildRoleColorMap", () => {
  it("assigns fixed warning colors to Unknown and Multiple roles", () => {
    const m = buildRoleColorMap([UNKNOWN_ROLE, MULTIPLE_ROLES]);
    expect(m.get(UNKNOWN_ROLE)).toBe("#f59e0b");
    expect(m.get(MULTIPLE_ROLES)).toBe("#fb7185");
  });

  it("gives a stable, distinct palette color to each normal role", () => {
    const m = buildRoleColorMap(["Manager", "Viewer", "Admin"]);
    const colors = ["Manager", "Viewer", "Admin"].map((r) => m.get(r));
    expect(new Set(colors).size).toBe(3);
    // Re-building with the same input yields the same assignment.
    const m2 = buildRoleColorMap(["Manager", "Viewer", "Admin"]);
    expect(m2.get("Viewer")).toBe(m.get("Viewer"));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/roleColors.test.ts`
Expected: FAIL — `Cannot find module '../roleColors'`.

- [ ] **Step 3: Write the implementation**

Create `app/(dashboard)/access-analysis/roleColors.ts`:

```ts
/**
 * Stable role → color assignment shared by the role visuals. The palette + the
 * Unknown/Multiple warning hues match ActivityByRolePieChart, so a role reads
 * the same color in the donut legend and in the Folder Activity bars.
 */
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "./roleCounts";

export const ROLE_PALETTE = [
  "#6366f1", "#22d3ee", "#34d399", "#10b981", "#3b82f6", "#a78bfa",
  "#2dd4bf", "#facc15", "#38bdf8", "#c084fc", "#4ade80", "#818cf8",
  "#5eead4", "#fdba74", "#93c5fd", "#d8b4fe", "#86efac", "#67e8f9",
  "#fde047", "#f0abfc", "#a5b4fc", "#bef264", "#7dd3fc", "#fca5a5",
];
export const UNKNOWN_ROLE_COLOR = "#f59e0b"; // amber
export const MULTIPLE_ROLES_COLOR = "#fb7185"; // rose

/** Map each role name to a stable color, cycling ROLE_PALETTE in input order. */
export function buildRoleColorMap(roleNames: ReadonlyArray<string>): Map<string, string> {
  const m = new Map<string, string>();
  let hue = 0;
  for (const name of roleNames) {
    if (m.has(name)) continue;
    m.set(
      name,
      name === UNKNOWN_ROLE ? UNKNOWN_ROLE_COLOR
        : name === MULTIPLE_ROLES ? MULTIPLE_ROLES_COLOR
          : ROLE_PALETTE[hue++ % ROLE_PALETTE.length],
    );
  }
  return m;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/roleColors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/roleColors.ts" "app/(dashboard)/access-analysis/__tests__/roleColors.test.ts"
git diff --cached --name-only
git commit -m "feat(acc): shared role color map for folder-activity bars"
```

---

### Task 3: Server loaders + actions — `folderActivityView.ts`, `folderActivityActions.ts`

**Files:**
- Create: `lib/server/folderActivityView.ts`
- Create: `app/(dashboard)/access-analysis/folderActivityActions.ts`
- Verify: ad-hoc DB smoke (node one-liner)

**Interfaces:**
- Consumes: `db` from `@/server/db`; `auth` from `@/server/auth`; `FolderActivityRow` from `@/app/(dashboard)/access-analysis/folderActivityCounts`.
- Produces:
  - `interface ProjectActivityTotal { projectId: string; projectName: string; activity: number; folders: number }`
  - `function loadFolderActivityProjects(projectIds: string[]): Promise<ProjectActivityTotal[]>` (sorted by activity desc)
  - `function loadFolderActivityTree(projectId: string): Promise<FolderActivityRow[]>`
  - server actions `loadFolderActivityProjectsAction(projectIds: string[])` and `loadFolderActivityTreeAction(projectId: string)` (auth-gated; return `[]` when unauthenticated).

- [ ] **Step 1: Write the view**

Create `lib/server/folderActivityView.ts`:

```ts
import "server-only";
import { db } from "@/server/db";
import type { FolderActivityRow } from "@/app/(dashboard)/access-analysis/folderActivityCounts";

/** Per-project folder-scoped activity totals, for the project ranking / level. */
export interface ProjectActivityTotal {
  projectId: string;
  projectName: string;
  activity: number;
  folders: number;
}

interface RawProjectRow {
  projectId: string;
  activity: number;
  folders: number;
}

const TTL_MS = 5 * 60 * 1000;
let projectsCache: { at: number; key: string; rows: ProjectActivityTotal[] } | null = null;
const treeCache = new Map<string, { at: number; rows: FolderActivityRow[] }>();

/**
 * Folder-scoped activity totals per project, for the given project ids. One
 * grouped index scan over AccActivityAccds (folder rows only), names merged from
 * AccDcProject in JS (mirrors moduleActivityView). Sorted by activity desc.
 */
export async function loadFolderActivityProjects(projectIds: string[]): Promise<ProjectActivityTotal[]> {
  if (projectIds.length === 0) return [];
  const key = [...projectIds].sort().join(",");
  if (projectsCache && projectsCache.key === key && Date.now() - projectsCache.at < TTL_MS) {
    return projectsCache.rows;
  }

  const [raw, projects] = await Promise.all([
    db.$queryRaw<RawProjectRow[]>`
      SELECT "projectId" AS "projectId",
             COUNT(*)::int AS activity,
             COUNT(DISTINCT "folderName")::int AS folders
      FROM "AccActivityAccds"
      WHERE "projectId" = ANY(${projectIds})
        AND "folderName" IS NOT NULL AND "folderName" <> ''
      GROUP BY "projectId"
    `,
    db.accDcProject.findMany({ select: { id: true, name: true } }),
  ]);
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const rows: ProjectActivityTotal[] = raw
    .map((r) => ({
      projectId: r.projectId,
      projectName: nameById.get(r.projectId) ?? r.projectId,
      activity: r.activity,
      folders: r.folders,
    }))
    .sort((a, b) => b.activity - a.activity || a.projectName.localeCompare(b.projectName));

  projectsCache = { at: Date.now(), key, rows };
  return rows;
}

/**
 * One project's folder-scoped activity, grouped to (folder, actor) totals. Bounded
 * per project; cached per projectId. userName comes from the accds row (fallback to
 * email at fold time). Used by the client fold summarizeFolderActivity.
 */
export async function loadFolderActivityTree(projectId: string): Promise<FolderActivityRow[]> {
  if (!projectId) return [];
  const hit = treeCache.get(projectId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  const rows = await db.$queryRaw<FolderActivityRow[]>`
    SELECT "folderName" AS "folderName",
           "userEmail" AS "userEmail",
           MAX(COALESCE(NULLIF("userName", ''), "userEmail")) AS "userName",
           COUNT(*)::int AS count
    FROM "AccActivityAccds"
    WHERE "projectId" = ${projectId}
      AND "folderName" IS NOT NULL AND "folderName" <> ''
      AND "userEmail" IS NOT NULL
    GROUP BY "folderName", "userEmail"
  `;

  treeCache.set(projectId, { at: Date.now(), rows });
  return rows;
}
```

- [ ] **Step 2: Write the server actions**

Create `app/(dashboard)/access-analysis/folderActivityActions.ts`:

```ts
"use server";
import { auth } from "@/server/auth";
import {
  loadFolderActivityProjects,
  loadFolderActivityTree,
  type ProjectActivityTotal,
} from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "./folderActivityCounts";

/** Auth-gated: per-project folder-activity totals for the selected projects. */
export async function loadFolderActivityProjectsAction(projectIds: string[]): Promise<ProjectActivityTotal[]> {
  const session = await auth();
  if (!session || projectIds.length === 0) return [];
  return loadFolderActivityProjects(projectIds);
}

/** Auth-gated: one project's (folder, actor) activity rows. */
export async function loadFolderActivityTreeAction(projectId: string): Promise<FolderActivityRow[]> {
  const session = await auth();
  if (!session || !projectId) return [];
  return loadFolderActivityTree(projectId);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from these two files (pre-existing unrelated errors, if any, are out of scope — but the new files must not add errors).

- [ ] **Step 4: DB smoke (proves the SQL runs + returns folder rows)**

Run (PowerShell or bash; uses the same Prisma adapter pattern as `scripts/diag-*.cjs`):

```bash
node -e "require('tsx/cjs');require('dotenv').config();const{PrismaClient}=require('@prisma/client');const{PrismaPg}=require('@prisma/adapter-pg');const url=(process.env.DIRECT_URL||process.env.DATABASE_URL).trim();const p=new PrismaClient({adapter:new PrismaPg({connectionString:url,max:2})});(async()=>{const top=await p.\$queryRaw\`SELECT \"projectId\", COUNT(*)::int activity, COUNT(DISTINCT \"folderName\")::int folders FROM \"AccActivityAccds\" WHERE \"folderName\" IS NOT NULL AND \"folderName\"<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 3\`;console.log('top projects by folder activity:',top);const pid=top[0].projectId;const tree=await p.\$queryRaw\`SELECT \"folderName\", \"userEmail\", COUNT(*)::int count FROM \"AccActivityAccds\" WHERE \"projectId\"=\${pid} AND \"folderName\" IS NOT NULL AND \"folderName\"<>'' AND \"userEmail\" IS NOT NULL GROUP BY 1,2 ORDER BY 3 DESC LIMIT 3\`;console.log('sample tree rows for',pid,':',tree);await p.\$disconnect();})().catch(e=>{console.error(e);process.exit(1);});"
```
Expected: prints 3 projects with non-zero `activity`/`folders`, then 3 `(folderName, userEmail, count)` rows for the busiest project. (This validates the exact SQL the loaders run.)

- [ ] **Step 5: Commit**

```bash
git add "lib/server/folderActivityView.ts" "app/(dashboard)/access-analysis/folderActivityActions.ts"
git diff --cached --name-only
git commit -m "feat(acc): server loaders + actions for folder activity by project"
```

---

### Task 4: Tree component — `FolderActivityByRole.tsx`

**Files:**
- Create: `app/(dashboard)/access-analysis/components/FolderActivityByRole.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/FolderActivityByRole.test.tsx`

**Interfaces:**
- Consumes: `FolderActivitySummary`, `FolderActivityNode` from `../folderActivityCounts`; `buildRoleColorMap` from `../roleColors`; `DrillPerson` from `../roleCounts`.
- Produces: `function FolderActivityByRole(props: { summary: FolderActivitySummary; onUserClick?: (email: string) => void; defaultTopN?: number }): JSX.Element`. Test ids: `folder-activity-tree`, `folder-row` (per folder), `role-row` (per role), `user-row` (per user), `folder-activity-showall`.

- [ ] **Step 1: Write the failing tests**

Create `app/(dashboard)/access-analysis/__tests__/FolderActivityByRole.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";
import { FolderActivityByRole } from "../components/FolderActivityByRole";
import type { FolderActivitySummary } from "../folderActivityCounts";

const summary: FolderActivitySummary = {
  total: 30,
  distinctRoles: 2,
  folders: [
    {
      name: "01_Arquitectura",
      total: 20,
      roleSlices: [
        { name: "Manager", value: 14 },
        { name: "Viewer", value: 6 },
      ],
      usersByRole: new Map([
        ["Manager", [
          { email: "ana@x.com", name: "Ana", count: 9 },
          { email: "al@x.com", name: "Al", count: 5 },
        ]],
        ["Viewer", [{ email: "ben@x.com", name: "Ben", count: 6 }]],
      ]),
    },
    {
      name: "00_PDF",
      total: 10,
      roleSlices: [{ name: "Manager", value: 10 }],
      usersByRole: new Map([["Manager", [{ email: "ana@x.com", name: "Ana", count: 10 }]]]),
    },
  ],
};

describe("FolderActivityByRole", () => {
  it("renders one row per folder, sorted as given, with totals", () => {
    const { getByTestId, getAllByTestId } = render(<FolderActivityByRole summary={summary} />);
    const tree = getByTestId("folder-activity-tree");
    expect(tree.textContent).toContain("01_Arquitectura");
    expect(tree.textContent).toContain("00_PDF");
    expect(getAllByTestId("folder-row")).toHaveLength(2);
  });

  it("expands a folder to reveal its role rows", () => {
    const { getAllByTestId, getByTestId } = render(<FolderActivityByRole summary={summary} />);
    fireEvent.click(within(getAllByTestId("folder-row")[0]).getByRole("button"));
    const roles = getByTestId("folder-activity-tree").querySelectorAll('[data-testid="role-row"]');
    expect(roles.length).toBe(2); // Manager + Viewer
  });

  it("expands a role to reveal its user rows", () => {
    const { getAllByTestId } = render(<FolderActivityByRole summary={summary} />);
    fireEvent.click(within(getAllByTestId("folder-row")[0]).getByRole("button"));
    fireEvent.click(within(getAllByTestId("role-row")[0]).getByRole("button"));
    const users = getAllByTestId("user-row");
    expect(users.some((u) => u.textContent?.includes("Ana"))).toBe(true);
    expect(users.some((u) => u.textContent?.includes("Al"))).toBe(true);
  });

  it("calls onUserClick with the email when a user row is clicked", () => {
    const onUserClick = vi.fn();
    const { getAllByTestId } = render(<FolderActivityByRole summary={summary} onUserClick={onUserClick} />);
    fireEvent.click(within(getAllByTestId("folder-row")[0]).getByRole("button"));
    fireEvent.click(within(getAllByTestId("role-row")[0]).getByRole("button"));
    fireEvent.click(within(getAllByTestId("user-row").find((u) => u.textContent?.includes("Ana"))!).getByRole("button"));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });

  it("collapses folders beyond Top-N behind a show-all control", () => {
    const { getByTestId, getAllByTestId } = render(<FolderActivityByRole summary={summary} defaultTopN={1} />);
    expect(getAllByTestId("folder-row")).toHaveLength(1); // only the busiest folder
    fireEvent.click(getByTestId("folder-activity-showall"));
    expect(getAllByTestId("folder-row")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/FolderActivityByRole.test.tsx`
Expected: FAIL — `Cannot find module '../components/FolderActivityByRole'`.

- [ ] **Step 3: Write the implementation**

Create `app/(dashboard)/access-analysis/components/FolderActivityByRole.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import { buildRoleColorMap } from "../roleColors";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import type { FolderActivitySummary, FolderActivityNode } from "../folderActivityCounts";

const DEFAULT_TOP = 8;
const isWarn = (name: string) => name === UNKNOWN_ROLE || name === MULTIPLE_ROLES;

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

/** Stacked role-distribution bar for one folder row. */
function RoleBar({ node, colorFor }: { node: FolderActivityNode; colorFor: (r: string) => string }) {
  return (
    <span className="relative ml-2 hidden h-2.5 w-28 shrink-0 overflow-hidden rounded-full bg-muted sm:flex" aria-hidden>
      {node.roleSlices.map((s) => (
        <span
          key={s.name}
          style={{ width: `${node.total > 0 ? (s.value / node.total) * 100 : 0}%`, background: colorFor(s.name) }}
          className="h-full"
        />
      ))}
    </span>
  );
}

/**
 * Presentational folder → role → user tree for ONE project. Folders (Top-N, with
 * a show-all toggle) carry a stacked role-distribution bar; expanding a folder
 * reveals role rows, expanding a role reveals the users (clickable to the profile
 * drawer). Role colors come from the shared buildRoleColorMap so they match the
 * "Activity by role" donut.
 */
export function FolderActivityByRole({
  summary,
  onUserClick,
  defaultTopN = DEFAULT_TOP,
}: {
  summary: FolderActivitySummary;
  onUserClick?: (email: string) => void;
  defaultTopN?: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [openRoles, setOpenRoles] = useState<Set<string>>(new Set()); // key = `${folder} ${role}`

  // Stable color per role across every folder bar in this project.
  const colorMap = useMemo(() => {
    const names: string[] = [];
    for (const f of summary.folders) for (const s of f.roleSlices) if (!names.includes(s.name)) names.push(s.name);
    return buildRoleColorMap(names);
  }, [summary]);
  const colorFor = (r: string) => colorMap.get(r) ?? "#888";

  if (summary.folders.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No folder activity found for this selection.
      </div>
    );
  }

  const folders = showAll ? summary.folders : summary.folders.slice(0, defaultTopN);
  const hidden = summary.folders.length - folders.length;
  const toggle = (set: Set<string>, key: string, upd: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    upd(next);
  };

  return (
    <div data-testid="folder-activity-tree" className="flex flex-col gap-1">
      {folders.map((f) => {
        const fOpen = openFolders.has(f.name);
        return (
          <div key={f.name} data-testid="folder-row" className="rounded-lg border border-border/60 bg-card/40">
            <button
              type="button"
              aria-expanded={fOpen}
              onClick={() => toggle(openFolders, f.name, setOpenFolders)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
            >
              <span className={`shrink-0 text-muted-foreground transition-transform ${fOpen ? "rotate-90" : ""}`}>›</span>
              <span className="flex-1 truncate font-medium text-foreground">{f.name}</span>
              <RoleBar node={f} colorFor={colorFor} />
              <span className="shrink-0 tabular-nums text-foreground">{f.total.toLocaleString()}</span>
              <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(f.total, summary.total)}</span>
            </button>

            {fOpen && (
              <div className="border-t border-border/60 px-2 py-1.5">
                {f.roleSlices.map((s) => {
                  const rKey = `${f.name} ${s.name}`;
                  const rOpen = openRoles.has(rKey);
                  const users = f.usersByRole.get(s.name) ?? [];
                  return (
                    <div key={s.name} data-testid="role-row">
                      <button
                        type="button"
                        aria-expanded={rOpen}
                        onClick={() => toggle(openRoles, rKey, setOpenRoles)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                      >
                        <span className={`shrink-0 text-muted-foreground transition-transform ${rOpen ? "rotate-90" : ""}`}>›</span>
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: colorFor(s.name) }} aria-hidden />
                        <span className={`flex-1 truncate ${isWarn(s.name) ? "text-warning" : "text-foreground/90"}`}>
                          {isWarn(s.name) ? `⚠ ${s.name}` : s.name}
                        </span>
                        <span className="shrink-0 tabular-nums text-foreground">{s.value.toLocaleString()}</span>
                        <span className="w-14 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(s.value, f.total)}</span>
                      </button>

                      {rOpen && (
                        <ul className="list-none py-0.5 pl-8 pr-1">
                          {users.map((u) => {
                            const clickable = !!(u.email && onUserClick);
                            return (
                              <li key={u.email} data-testid="user-row">
                                <button
                                  type="button"
                                  disabled={!clickable}
                                  onClick={() => clickable && onUserClick!(u.email)}
                                  title={clickable ? `View ${u.name}'s profile` : u.email}
                                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors ${
                                    clickable ? "cursor-pointer text-foreground/85 hover:bg-accent hover:text-primary" : "cursor-default text-foreground/70"
                                  }`}
                                >
                                  <span className="flex-1 truncate">{u.name}</span>
                                  <span className="shrink-0 tabular-nums text-foreground">{u.count.toLocaleString()}</span>
                                  <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">{fmtPct(u.count, s.value)}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {hidden > 0 && !showAll && (
        <button
          type="button"
          data-testid="folder-activity-showall"
          onClick={() => setShowAll(true)}
          className="mt-1 self-start rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Show all {summary.folders.length} folders ({hidden} more)
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/FolderActivityByRole.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderActivityByRole.tsx" "app/(dashboard)/access-analysis/__tests__/FolderActivityByRole.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc): folder activity tree component (folder -> role -> user)"
```

---

### Task 5: Lazy wrapper — `FolderActivityReveal.tsx`

**Files:**
- Create: `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/FolderActivityReveal.test.tsx`

**Interfaces:**
- Consumes: `FolderActivityByRole` (Task 4); `summarizeFolderActivity`, `rolesByEmailForProject`, `type FolderActivityRow` from `../folderActivityCounts`; `type MembershipRolesInput` from `../roleActivityCounts`; `type ProjectActivityTotal` from `@/lib/server/folderActivityView`; `PremiumSurface`.
- Produces: `function FolderActivityReveal(props: { selectedProjectIds: string[]; memberships: MembershipRolesInput[]; loadProjects: (ids: string[]) => Promise<ProjectActivityTotal[]>; loadTree: (projectId: string) => Promise<FolderActivityRow[]> }): JSX.Element`. Test ids: `folder-activity-expand`, `folder-activity-panel`, `fa-project-row`.

**Behavior:** Collapsed by default (heavy load deferred). On expand → `loadProjects(selectedProjectIds)`. If exactly one project returns, auto-render its tree (no project header). If several, render ranked project rows (Top-N); expanding a project lazy-loads + caches its tree and renders `<FolderActivityByRole>` beneath it. Re-fetches the project list if `selectedProjectIds` changes while open.

- [ ] **Step 1: Write the failing tests**

Create `app/(dashboard)/access-analysis/__tests__/FolderActivityReveal.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/react";
import { FolderActivityReveal } from "../components/FolderActivityReveal";
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "../folderActivityCounts";

const memberships = [
  { projectId: "p1", email: "ana@x.com", roles: ["Manager"] },
  { projectId: "p2", email: "ben@x.com", roles: ["Viewer"] },
];
const treeP1: FolderActivityRow[] = [{ folderName: "ARQ", userEmail: "ana@x.com", userName: "Ana", count: 9 }];
const treeP2: FolderActivityRow[] = [{ folderName: "EST", userEmail: "ben@x.com", userName: "Ben", count: 4 }];

describe("FolderActivityReveal", () => {
  it("does not load until expanded", () => {
    const loadProjects = vi.fn(async () => [] as ProjectActivityTotal[]);
    const loadTree = vi.fn(async () => [] as FolderActivityRow[]);
    render(<FolderActivityReveal selectedProjectIds={["p1"]} memberships={memberships} loadProjects={loadProjects} loadTree={loadTree} />);
    expect(loadProjects).not.toHaveBeenCalled();
  });

  it("auto-renders the single project's tree when one project is selected", async () => {
    const loadProjects = vi.fn(async () => [{ projectId: "p1", projectName: "Torre", activity: 9, folders: 1 }]);
    const loadTree = vi.fn(async () => treeP1);
    const { getByTestId } = render(
      <FolderActivityReveal selectedProjectIds={["p1"]} memberships={memberships} loadProjects={loadProjects} loadTree={loadTree} />,
    );
    fireEvent.click(getByTestId("folder-activity-expand"));
    await waitFor(() => expect(getByTestId("folder-activity-tree").textContent).toContain("ARQ"));
    expect(loadTree).toHaveBeenCalledWith("p1");
  });

  it("renders project rows for multiple projects and lazy-loads a tree on expand", async () => {
    const loadProjects = vi.fn(async () => [
      { projectId: "p1", projectName: "Torre", activity: 9, folders: 1 },
      { projectId: "p2", projectName: "Hospital", activity: 4, folders: 1 },
    ]);
    const loadTree = vi.fn(async (id: string) => (id === "p1" ? treeP1 : treeP2));
    const { getByTestId, getAllByTestId } = render(
      <FolderActivityReveal selectedProjectIds={["p1", "p2"]} memberships={memberships} loadProjects={loadProjects} loadTree={loadTree} />,
    );
    fireEvent.click(getByTestId("folder-activity-expand"));
    await waitFor(() => expect(getAllByTestId("fa-project-row")).toHaveLength(2));
    expect(loadTree).not.toHaveBeenCalled(); // not loaded until a project is expanded
    fireEvent.click(within(getAllByTestId("fa-project-row")[1]).getByRole("button"));
    await waitFor(() => expect(getByTestId("folder-activity-panel").textContent).toContain("EST"));
    expect(loadTree).toHaveBeenCalledWith("p2");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/FolderActivityReveal.test.tsx`
Expected: FAIL — `Cannot find module '../components/FolderActivityReveal'`.

- [ ] **Step 3: Write the implementation**

Create `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { PremiumSurface } from "@/components/ui/PremiumSurface";
import { FolderActivityByRole } from "./FolderActivityByRole";
import {
  summarizeFolderActivity,
  rolesByEmailForProject,
  type FolderActivitySummary,
  type FolderActivityRow,
} from "../folderActivityCounts";
import type { MembershipRolesInput } from "../roleActivityCounts";
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";

const PROJECT_TOP = 8;

/**
 * Lazy "expand to load" panel for Folder Activity by Role. Defers all querying
 * until the user expands. One project selected → its tree directly; several →
 * ranked project rows, each lazy-loading its own tree on expand. Reads the page's
 * project selection (selectedProjectIds) and the in-memory memberships for role
 * attribution, so it stays consistent with the donuts above.
 */
export function FolderActivityReveal({
  selectedProjectIds,
  memberships,
  loadProjects,
  loadTree,
}: {
  selectedProjectIds: string[];
  memberships: MembershipRolesInput[];
  loadProjects: (ids: string[]) => Promise<ProjectActivityTotal[]>;
  loadTree: (projectId: string) => Promise<FolderActivityRow[]>;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectActivityTotal[] | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [openProject, setOpenProject] = useState<Set<string>>(new Set());
  const [summaries, setSummaries] = useState<Map<string, FolderActivitySummary>>(new Map());

  const idsKey = useMemo(() => [...selectedProjectIds].sort().join(","), [selectedProjectIds]);

  // (Re)load the project list whenever the panel is open and the selection changes.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingProjects(true);
    setProjects(null);
    setOpenProject(new Set());
    loadProjects(selectedProjectIds)
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
    // idsKey captures selection identity; loadProjects is a stable server-action ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey]);

  const buildSummary = async (projectId: string) => {
    if (summaries.has(projectId)) return;
    const rows = await loadTree(projectId);
    const summary = summarizeFolderActivity(rows, rolesByEmailForProject(memberships, projectId));
    setSummaries((prev) => new Map(prev).set(projectId, summary));
  };

  const toggleProject = (projectId: string) => {
    setOpenProject((prev) => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
    void buildSummary(projectId);
  };

  // Single-project selection → load + render its tree directly (no project header).
  const single = projects && projects.length === 1 ? projects[0] : null;
  useEffect(() => {
    if (single) void buildSummary(single.projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single?.projectId]);

  const visibleProjects = projects
    ? showAllProjects
      ? projects
      : projects.slice(0, PROJECT_TOP)
    : [];

  return (
    <PremiumSurface variant="base" className="flex flex-col gap-0 overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between gap-4 p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">Folder Activity by Role</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            File activity per folder, broken down by the role each person held and then by user.
            Folder-scoped activity only (~86% of all activity); ticks above set the projects.
          </p>
        </div>
        <button
          type="button"
          data-testid="folder-activity-expand"
          onClick={() => setOpen((p) => !p)}
          aria-expanded={open}
          className="shrink-0 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/20"
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div data-testid="folder-activity-panel" className="px-5 pb-5">
          {loadingProjects && <p className="py-6 text-center text-sm text-muted-foreground">Loading folder activity…</p>}

          {!loadingProjects && projects && projects.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No folder activity for the selected projects.</p>
          )}

          {!loadingProjects && single && (
            summaries.get(single.projectId) ? (
              <FolderActivityByRole summary={summaries.get(single.projectId)!} onUserClick={undefined} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading {single.projectName}…</p>
            )
          )}

          {!loadingProjects && projects && projects.length > 1 && (
            <div className="flex flex-col gap-1.5">
              {visibleProjects.map((p) => {
                const pOpen = openProject.has(p.projectId);
                const summary = summaries.get(p.projectId);
                return (
                  <div key={p.projectId} data-testid="fa-project-row" className="rounded-xl border border-border bg-card/40">
                    <button
                      type="button"
                      aria-expanded={pOpen}
                      onClick={() => toggleProject(p.projectId)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <span className={`shrink-0 text-muted-foreground transition-transform ${pOpen ? "rotate-90" : ""}`}>›</span>
                      <span className="flex-1 truncate font-semibold text-foreground">{p.projectName}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.folders.toLocaleString()} folders</span>
                      <span className="shrink-0 tabular-nums text-foreground">{p.activity.toLocaleString()}</span>
                    </button>
                    {pOpen && (
                      <div className="border-t border-border px-3 py-2">
                        {summary ? (
                          <FolderActivityByRole summary={summary} onUserClick={undefined} />
                        ) : (
                          <p className="py-4 text-center text-xs text-muted-foreground">Loading {p.projectName}…</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {!showAllProjects && projects.length > PROJECT_TOP && (
                <button
                  type="button"
                  onClick={() => setShowAllProjects(true)}
                  className="mt-1 self-start rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  Show all {projects.length} projects ({projects.length - PROJECT_TOP} more)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </PremiumSurface>
  );
}
```

> **Note for the implementer:** the `onUserClick={undefined}` placeholders are replaced in Task 6, where `AccessAnalysisCharts` passes a real `onUserClick` down through this component to open the profile drawer. Add an optional `onUserClick?: (email: string) => void` prop to `FolderActivityReveal` in Task 6 and thread it into both `<FolderActivityByRole>` call sites. (Kept out of this task so the component is testable in isolation first.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run app/\(dashboard\)/access-analysis/__tests__/FolderActivityReveal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx" "app/(dashboard)/access-analysis/__tests__/FolderActivityReveal.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc): lazy expand-to-load wrapper for folder activity panel"
```

---

### Task 6: Wire into the page — `mainCharts.tsx` + `AccessAnalysisCharts.tsx`

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx` (add `onUserClick` prop)
- Modify: `app/(dashboard)/access-analysis/mainCharts.tsx`
- Modify: `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx`

**Interfaces:**
- Consumes: `loadFolderActivityProjectsAction`, `loadFolderActivityTreeAction` from `../folderActivityActions`; existing `membershipRows`, `selected`, `setProfileEmail` in `AccessAnalysisCharts`.
- Produces: a rendered `<FolderActivityReveal>` wired to live loaders, selection, memberships, and the profile drawer.

- [ ] **Step 1: Thread `onUserClick` through `FolderActivityReveal`**

In `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx`, add the prop to the signature and destructure it:

```tsx
export function FolderActivityReveal({
  selectedProjectIds,
  memberships,
  loadProjects,
  loadTree,
  onUserClick,
}: {
  selectedProjectIds: string[];
  memberships: MembershipRolesInput[];
  loadProjects: (ids: string[]) => Promise<ProjectActivityTotal[]>;
  loadTree: (projectId: string) => Promise<FolderActivityRow[]>;
  onUserClick?: (email: string) => void;
}) {
```

Then replace both `onUserClick={undefined}` occurrences with `onUserClick={onUserClick}`.

- [ ] **Step 2: Pass loaders from `mainCharts.tsx`**

In `app/(dashboard)/access-analysis/mainCharts.tsx`, add the import near the other action imports (after line 23):

```tsx
import { loadFolderActivityProjectsAction, loadFolderActivityTreeAction } from "./folderActivityActions";
```

Add the two props to the `<AccessAnalysisCharts … />` element (alongside `loadOverview={loadOverviewTerrain}`):

```tsx
      loadFolderActivityProjects={loadFolderActivityProjectsAction}
      loadFolderActivityTree={loadFolderActivityTreeAction}
```

- [ ] **Step 3: Accept the props + render the panel in `AccessAnalysisCharts.tsx`**

Add the import near the other component imports (after the `TerrainReveal` import, line 14):

```tsx
import { FolderActivityReveal } from "./FolderActivityReveal";
```

Add the type imports near the other server-view type imports (after line 36):

```tsx
import type { ProjectActivityTotal } from "@/lib/server/folderActivityView";
import type { FolderActivityRow } from "../folderActivityCounts";
```

Add to the destructured props (after `loadOverview,`):

```tsx
  loadFolderActivityProjects,
  loadFolderActivityTree,
```

Add to the props type block (after `loadOverview?: () => Promise<FolderTerrainData | null>;`):

```tsx
  loadFolderActivityProjects?: (ids: string[]) => Promise<ProjectActivityTotal[]>;
  loadFolderActivityTree?: (projectId: string) => Promise<FolderActivityRow[]>;
```

Render the panel right after the `TerrainReveal` block (after its closing `)}` near line 281). `selected` is a `Set<string>`; convert to an array:

```tsx
      {/* Folder Activity by Role — full-width, collapsed by default (lazy load) */}
      {loadFolderActivityProjects && loadFolderActivityTree && (
        <Reveal>
          <FolderActivityReveal
            selectedProjectIds={[...selected]}
            memberships={membershipRows ?? []}
            loadProjects={loadFolderActivityProjects}
            loadTree={loadFolderActivityTree}
            onUserClick={(email) => setProfileEmail(email.toLowerCase())}
          />
        </Reveal>
      )}
```

- [ ] **Step 4: Typecheck + full unit suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run app/\(dashboard\)/access-analysis`
Expected: all access-analysis unit tests PASS (existing + the new folderActivity ones).

- [ ] **Step 5: Update the existing page test if it asserts a fixed section count**

Check `app/(dashboard)/access-analysis/page.test.tsx` and `__tests__/AccessAnalysisCharts.test.tsx` for assertions that would break by adding a section (e.g. a hardcoded count of `Reveal`/section headings). If present, update them to account for the new panel; if absent, no change.

Run: `npx vitest run app/\(dashboard\)/access-analysis/page.test.tsx app/\(dashboard\)/access-analysis/__tests__/AccessAnalysisCharts.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/mainCharts.tsx" "app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx" "app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx"
git diff --cached --name-only
git commit -m "feat(acc): mount Folder Activity by Role panel on /access-analysis"
```

---

### Task 7: E2E smoke + cleanup + final gates

**Files:**
- Create: `tests/e2e/folder-activity-by-role.spec.ts`
- Delete: `scripts/diag-folder-activity-coverage.cjs`

**Interfaces:**
- Consumes: the rendered panel test ids (`folder-activity-expand`, `folder-activity-panel`).

- [ ] **Step 1: Write the e2e smoke spec**

Create `tests/e2e/folder-activity-by-role.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

/**
 * Smoke: the Folder Activity by Role panel mounts on /access-analysis, and
 * expanding it loads the tree (or a valid empty state) without error. Auth comes
 * from the minted storageState (playwright/global-setup.ts); server runs on :3100.
 */
test("Folder Activity by Role expands and renders", async ({ page }) => {
  await page.goto("/access-analysis");
  await page.waitForLoadState("networkidle");

  const expand = page.getByTestId("folder-activity-expand");
  await expect(expand).toBeVisible();
  await expand.click();

  const panel = page.getByTestId("folder-activity-panel");
  await expect(panel).toBeVisible();

  // Either the tree renders, or a project row, or a valid empty/loading-resolved state.
  await expect
    .poll(async () => {
      const tree = await page.getByTestId("folder-activity-tree").count();
      const projectRow = await page.getByTestId("fa-project-row").count();
      const empty = (await panel.textContent())?.includes("No folder activity") ? 1 : 0;
      return tree + projectRow + empty;
    }, { timeout: 30_000 })
    .toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the e2e smoke (owner / idle machine)**

> Per the project's e2e reality, this runs on an idle machine against `:3100`. Do NOT run `npm run build` while `:3000` is live.

Run: `npx playwright test tests/e2e/folder-activity-by-role.spec.ts`
Expected: 1 passed. (If the machine is under load and the global 120 s budget trips, re-run on an idle machine — a load flake, not a regression.)

- [ ] **Step 3: Delete the throwaway diagnostic**

Run: `git rm scripts/diag-folder-activity-coverage.cjs`
Expected: file removed from the working tree + staged for deletion.

- [ ] **Step 4: Final gates**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npx vitest run`
Expected: full unit suite green.

- [ ] **Step 5: Commit**

```bash
git add "tests/e2e/folder-activity-by-role.spec.ts"
git diff --cached --name-only   # should show the new spec + the deleted diag script
git commit -m "test(acc): e2e smoke for Folder Activity by Role; drop diag probe"
```

---

## Self-Review

**1. Spec coverage:**
- Tree table + role bars → Task 4 (`FolderActivityByRole` with `RoleBar`). ✓
- Follows page project ticks → Task 6 passes `[...selected]`. ✓
- Adaptive 1 vs 2+ projects → Task 5 (`single` path vs `fa-project-row` list). ✓
- Same-name merge within project / separate across projects → Task 1 (`folders` keyed by `folderName`) + Task 3 (tree query per `projectId`). ✓
- Source = `AccActivityAccds`, folder rows only, ~86% → Task 3 SQL `WHERE folderName IS NOT NULL AND <> ''`; sublabel in Task 5. ✓
- Role attribution via in-memory memberships, Unknown/Multiple buckets → Task 1 (`labelFor`, `rolesByEmailForProject`). ✓
- Lazy expand-to-load → Task 5 (`open` gate + `useEffect`). ✓
- User click → profile drawer → Task 6 (`onUserClick` → `setProfileEmail`). ✓
- Activity-desc sort + Top-N + show-all → Task 4 (folders) + Task 5 (projects). ✓
- Shared role colors → Task 2 (`buildRoleColorMap`). ✓
- Coverage badge / clear labeling → Task 5 sublabel names it as folder-scoped (~86%). *(The `ActivityCoverageBadge` mentioned in the spec is optional polish; the sublabel satisfies the "explain the subset" requirement. If desired, add the badge in Task 6 alongside the SectionHeader — left out to avoid coupling to coverage props.)*
- Tests: unit (Tasks 1,2,4,5), e2e smoke (Task 7). ✓
- Cleanup of diag script → Task 7. ✓

**2. Placeholder scan:** No TBD/TODO; the only "replaced later" is the explicit `onUserClick` thread-through, fully specified in Task 6 Step 1. ✓

**3. Type consistency:** `FolderActivityRow` defined in Task 1, imported by Tasks 3/5. `FolderActivitySummary`/`FolderActivityNode` from Task 1 used in Tasks 4/5. `ProjectActivityTotal` defined in Task 3, imported by Tasks 5/6. `buildRoleColorMap` (Task 2) used in Task 4. Server actions named `loadFolderActivityProjectsAction`/`loadFolderActivityTreeAction` consistently in Tasks 3/6. Component prop `onUserClick` consistent. ✓

**Note on the `selected` default:** the page initializes `selected` to **all** project ids, so on first expand with no ticks changed, the panel ranks all projects with folder activity (Top-8 + show-all). This is intended and matches the "0/all selected → ranked projects" decision.
