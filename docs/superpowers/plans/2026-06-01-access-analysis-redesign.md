# Access Analysis Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cosmos.gl/DuckDB graph at `/access-analysis` with a fast, server-aggregated ECharts + TanStack Table dashboard (counts → composition → modules → risk → rankings → trends → drill-down), cross-filtered via Zustand, sourced from the DC snapshot.

**Architecture:** The server joins the DC snapshot tables (`AccDcProjectUser` + `AccDcUser` + `AccDcProjectUserProduct`/`Role`/`Company` + `AccDcProject`) into a small (~16,942-row) cached `AccessInstance[]` view. Pure aggregation functions reduce that array under an active filter set into tiny JSON DTOs. Route handlers serve those DTOs; TanStack Query caches them keyed on the filter set; ECharts/TanStack Table render them; Zustand holds the filter set; chart clicks and comboboxes both mutate it.

**Tech Stack:** Next.js App Router (React 19), Prisma 7 (`@/server/db`), `@tanstack/react-query`, `@tanstack/react-table` + `react-virtual`, `zustand`, `echarts` + `echarts-for-react`, `radix-ui`, `framer-motion`, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-01-access-analysis-redesign-design.md`

**Conventions:**
- All new files live under `app/(dashboard)/access-analysis/` unless noted. Tests sit next to source as `*.test.ts(x)` or under `__tests__/`.
- Run a single unit test: `npx vitest run <path>`. Full unit suite: `npm test`. E2E: `npm run test:e2e`.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Stage by explicit path only (branch carries large WIP). Before every commit run `git diff --cached --name-only` and confirm only intended files are staged.

---

## Shared types (defined in Task 1, referenced everywhere — names are authoritative)

```ts
// app/(dashboard)/access-analysis/types.ts
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

export interface FilterState {
  projectId: string[];
  company: string[];
  role: string[];
  module: ModuleId[];
  internalExternal: "internal" | "external" | null;
  adminMember: "admin" | "member" | null;
  dateFrom: string | null;   // ISO; filters addedOn >=
  dateTo: string | null;     // ISO; filters addedOn <=
  search: string;            // fuzzy over name/email/projectName/company
}

export const EMPTY_FILTERS: FilterState = {
  projectId: [], company: [], role: [], module: [],
  internalExternal: null, adminMember: null, dateFrom: null, dateTo: null, search: "",
};

export interface Category { label: string; value: number; key?: string }

export interface SummaryDTO {
  counts: { users: number; projects: number; access: number; roles: number; companies: number };
  composition: {
    internalExternal: { internal: number; external: number };
    permission: { admin: number; member: number };
  };
  modules: Array<{ id: ModuleId; label: string; admin: number; member: number; total: number }>;
  rankings: { topProjects: Category[]; membersPerRole: Category[]; topCompanies: Category[] };
  risk: { externalMembers: number; externalAdmins: number; projectAdmins: number; pending: number };
}
```

---

## Task 1: Module mapping + tier reducer

**Files:**
- Create: `app/(dashboard)/access-analysis/types.ts` (paste the Shared types block above verbatim)
- Create: `app/(dashboard)/access-analysis/modules.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/modules.test.ts`

- [ ] **Step 1: Create `types.ts`** with the exact Shared types block above.

- [ ] **Step 2: Write the failing test** `__tests__/modules.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { MODULES, reduceModules, moduleLabelById } from "../modules";

describe("MODULES", () => {
  it("declares the 9 business modules in adoption order", () => {
    expect(MODULES.map((m) => m.id)).toEqual([
      "dataManagement", "insight", "build", "modelCoordination",
      "designCollaboration", "preconstruction", "design", "autospecs", "datum",
    ]);
  });
});

describe("reduceModules", () => {
  it("maps product keys to modules and flags admin", () => {
    const r = reduceModules([
      { productKey: "docs", accessLevel: "project_user" },
      { productKey: "build", accessLevel: "project_admin" },
      { productKey: "datum", accessLevel: "project_user" },
    ]);
    expect(r.modules.sort()).toEqual(["build", "datum", "dataManagement"].sort());
    expect(r.adminModules).toEqual(["build"]);
  });

  it("treats takeoff OR cost as Preconstruction", () => {
    expect(reduceModules([{ productKey: "cost", accessLevel: "project_user" }]).modules)
      .toEqual(["preconstruction"]);
  });

  it("ignores unknown keys and de-dupes", () => {
    const r = reduceModules([
      { productKey: "takeoff", accessLevel: "project_admin" },
      { productKey: "cost", accessLevel: "project_user" },
      { productKey: "mysteryKey", accessLevel: "project_admin" },
    ]);
    expect(r.modules).toEqual(["preconstruction"]);
    expect(r.adminModules).toEqual(["preconstruction"]); // admin on takeoff
  });
});

describe("moduleLabelById", () => {
  it("returns business labels", () => {
    expect(moduleLabelById("dataManagement")).toBe("Data Management");
    expect(moduleLabelById("design")).toBe("Design");
  });
});
```

- [ ] **Step 3: Run it, expect FAIL** — `npx vitest run app/(dashboard)/access-analysis/__tests__/modules.test.ts` → "Cannot find module '../modules'".

- [ ] **Step 4: Implement `modules.ts`**

```ts
import type { ModuleId } from "./types";

export const MODULES: ReadonlyArray<{ id: ModuleId; label: string; keys: string[] }> = [
  { id: "dataManagement",      label: "Data Management",     keys: ["docs", "documentManagement"] },
  { id: "insight",             label: "Insight",             keys: ["insight"] },
  { id: "build",               label: "Build",               keys: ["build"] },
  { id: "modelCoordination",   label: "Model Coordination",  keys: ["modelCoordination", "model_coordination"] },
  { id: "designCollaboration", label: "Design Collaboration", keys: ["designCollaboration", "design_collaboration"] },
  { id: "preconstruction",     label: "Preconstruction",     keys: ["takeoff", "cost"] },
  { id: "design",              label: "Design",              keys: ["forma"] },
  { id: "autospecs",           label: "AutoSpecs",           keys: ["autoSpecs", "autospecs"] },
  { id: "datum",               label: "Datum",               keys: ["datum"] },
];

const KEY_TO_ID = new Map<string, ModuleId>();
for (const m of MODULES) for (const k of m.keys) KEY_TO_ID.set(k.toLowerCase(), m.id);

export function moduleLabelById(id: ModuleId): string {
  return MODULES.find((m) => m.id === id)?.label ?? id;
}

/** A product row counts as "has access" when accessLevel is anything other than a none/empty value. */
function hasAccess(level: string): boolean {
  const l = level.toLowerCase();
  return l !== "" && l !== "none";
}
function isAdminLevel(level: string): boolean {
  const l = level.toLowerCase();
  return l === "project_admin" || l === "administrator";
}

export function reduceModules(
  products: Array<{ productKey: string; accessLevel: string }>,
): { modules: ModuleId[]; adminModules: ModuleId[] } {
  const modules = new Set<ModuleId>();
  const adminModules = new Set<ModuleId>();
  for (const p of products) {
    const id = KEY_TO_ID.get((p.productKey ?? "").toLowerCase());
    if (!id || !hasAccess(p.accessLevel)) continue;
    modules.add(id);
    if (isAdminLevel(p.accessLevel)) adminModules.add(id);
  }
  return { modules: [...modules], adminModules: [...adminModules] };
}
```

- [ ] **Step 5: Run it, expect PASS** — `npx vitest run app/(dashboard)/access-analysis/__tests__/modules.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/types.ts" "app/(dashboard)/access-analysis/modules.ts" "app/(dashboard)/access-analysis/__tests__/modules.test.ts"
git diff --cached --name-only   # confirm ONLY these 3 files
git commit -m "feat(acc-redesign): module mapping + tier reducer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Filter predicate

**Files:**
- Create: `app/(dashboard)/access-analysis/filters.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/filters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchesFilters } from "../filters";
import { EMPTY_FILTERS, type AccessInstance } from "../types";

const base: AccessInstance = {
  projectId: "p1", projectName: "Tower A", userId: "u1",
  email: "ana@hermosillo.com", name: "Ana", isInternal: true, isAdmin: false,
  status: "active", addedOn: "2024-03-01", company: "Hermosillo",
  roles: ["Member"], modules: ["build", "insight"], adminModules: [],
};

describe("matchesFilters", () => {
  it("passes everything with empty filters", () => {
    expect(matchesFilters(base, EMPTY_FILTERS)).toBe(true);
  });
  it("filters by internal/external", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, internalExternal: "external" })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, internalExternal: "internal" })).toBe(true);
  });
  it("filters by admin/member", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, adminMember: "admin" })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, adminMember: "member" })).toBe(true);
  });
  it("filters by module (any-of)", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, module: ["datum"] })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, module: ["datum", "build"] })).toBe(true);
  });
  it("filters by project, company, role (any-of)", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, projectId: ["p2"] })).toBe(false);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, company: ["Hermosillo"] })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, role: ["Admin"] })).toBe(false);
  });
  it("filters by addedOn date range", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, dateFrom: "2024-01-01", dateTo: "2024-12-31" })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, dateFrom: "2025-01-01" })).toBe(false);
  });
  it("fuzzy search matches name/email/project/company, case-insensitive", () => {
    expect(matchesFilters(base, { ...EMPTY_FILTERS, search: "tower" })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, search: "ANA@" })).toBe(true);
    expect(matchesFilters(base, { ...EMPTY_FILTERS, search: "zzz" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run app/(dashboard)/access-analysis/__tests__/filters.test.ts`.

- [ ] **Step 3: Implement `filters.ts`**

```ts
import type { AccessInstance, FilterState } from "./types";

const anyOf = <T>(sel: T[], has: (v: T) => boolean) => sel.length === 0 || sel.some(has);

export function matchesFilters(i: AccessInstance, f: FilterState): boolean {
  if (f.internalExternal === "internal" && !i.isInternal) return false;
  if (f.internalExternal === "external" && i.isInternal) return false;
  if (f.adminMember === "admin" && !i.isAdmin) return false;
  if (f.adminMember === "member" && i.isAdmin) return false;
  if (!anyOf(f.projectId, (p) => p === i.projectId)) return false;
  if (!anyOf(f.company, (c) => c === i.company)) return false;
  if (!anyOf(f.role, (r) => i.roles.includes(r))) return false;
  if (!anyOf(f.module, (m) => i.modules.includes(m))) return false;
  if (f.dateFrom && (!i.addedOn || i.addedOn < f.dateFrom)) return false;
  if (f.dateTo && (!i.addedOn || i.addedOn > f.dateTo)) return false;
  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    const hay = `${i.name} ${i.email} ${i.projectName} ${i.company ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function filterInstances(rows: AccessInstance[], f: FilterState): AccessInstance[] {
  return rows.filter((r) => matchesFilters(r, f));
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** (explicit paths; check `git diff --cached --name-only`)

```bash
git add "app/(dashboard)/access-analysis/filters.ts" "app/(dashboard)/access-analysis/__tests__/filters.test.ts"
git commit -m "feat(acc-redesign): pure filter predicate over access instances

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Aggregations (counts, composition, modules, rankings, risk)

**Files:**
- Create: `app/(dashboard)/access-analysis/aggregations.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/aggregations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSummary } from "../aggregations";
import type { AccessInstance } from "../types";

const mk = (o: Partial<AccessInstance>): AccessInstance => ({
  projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com",
  name: "A", isInternal: true, isAdmin: false, status: "active", addedOn: "2024-01-01",
  company: "Hermosillo", roles: ["Member"], modules: [], adminModules: [], ...o,
});

const rows: AccessInstance[] = [
  mk({ userId: "u1", projectId: "p1", isInternal: true, isAdmin: true, modules: ["build"], adminModules: ["build"], company: "Hermosillo", roles: ["Admin"] }),
  mk({ userId: "u2", projectId: "p1", email: "b@acme.com", isInternal: false, isAdmin: false, status: "pending", modules: ["build", "insight"], company: "Acme", roles: ["Member"] }),
  mk({ userId: "u3", projectId: "p2", email: "c@acme.com", isInternal: false, isAdmin: true, modules: ["insight"], adminModules: ["insight"], company: "Acme", roles: ["Member"] }),
];

describe("buildSummary", () => {
  const s = buildSummary(rows);
  it("counts distinct users/projects/companies and total access + roles", () => {
    expect(s.counts.access).toBe(3);
    expect(s.counts.users).toBe(3);
    expect(s.counts.projects).toBe(2);
    expect(s.counts.companies).toBe(2);
    expect(s.counts.roles).toBe(2); // Admin, Member
  });
  it("computes composition", () => {
    expect(s.composition.internalExternal).toEqual({ internal: 1, external: 2 });
    expect(s.composition.permission).toEqual({ admin: 2, member: 1 });
  });
  it("computes module admin/member split sorted by total desc", () => {
    const build = s.modules.find((m) => m.id === "build")!;
    expect(build).toMatchObject({ admin: 1, member: 1, total: 2 });
    const datum = s.modules.find((m) => m.id === "datum")!;
    expect(datum.total).toBe(0); // present but empty
    expect(s.modules[0].total).toBeGreaterThanOrEqual(s.modules[1].total);
  });
  it("computes rankings", () => {
    expect(s.rankings.topProjects[0]).toEqual({ label: "Tower A", value: 2, key: "p1" });
    expect(s.rankings.topCompanies.find((c) => c.label === "Acme")?.value).toBe(2);
  });
  it("computes risk", () => {
    expect(s.risk.projectAdmins).toBe(2);
    expect(s.risk.externalAdmins).toBe(1); // u3
    expect(s.risk.externalMembers).toBe(2); // u2, u3
    expect(s.risk.pending).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `aggregations.ts`**

```ts
import type { AccessInstance, Category, SummaryDTO } from "./types";
import { MODULES } from "./modules";

function topN(map: Map<string, { value: number; key?: string }>, n = 15): Category[] {
  return [...map.entries()]
    .map(([label, v]) => ({ label, value: v.value, key: v.key }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

export function buildSummary(rows: AccessInstance[]): SummaryDTO {
  const users = new Set<string>();
  const projects = new Set<string>();
  const companies = new Set<string>();
  const roles = new Set<string>();
  let internal = 0, external = 0, admin = 0, member = 0;
  let externalMembers = 0, externalAdmins = 0, projectAdmins = 0, pending = 0;

  const moduleAcc = new Map(MODULES.map((m) => [m.id, { admin: 0, member: 0 }]));
  const projectCount = new Map<string, { value: number; key?: string }>();
  const roleCount = new Map<string, { value: number; key?: string }>();
  const companyCount = new Map<string, { value: number; key?: string }>();

  for (const r of rows) {
    users.add(r.userId);
    projects.add(r.projectId);
    if (r.company) { companies.add(r.company); }
    for (const role of r.roles) roles.add(role);

    if (r.isInternal) internal++; else { external++; externalMembers++; }
    if (r.isAdmin) { admin++; projectAdmins++; if (!r.isInternal) externalAdmins++; } else member++;
    if ((r.status ?? "").toLowerCase() === "pending") pending++;

    for (const id of r.modules) {
      const acc = moduleAcc.get(id)!;
      if (r.adminModules.includes(id)) acc.admin++; else acc.member++;
    }

    const pc = projectCount.get(r.projectName) ?? { value: 0, key: r.projectId };
    pc.value++; projectCount.set(r.projectName, pc);
    for (const role of r.roles) {
      const rc = roleCount.get(role) ?? { value: 0 };
      rc.value++; roleCount.set(role, rc);
    }
    if (r.company) {
      const cc = companyCount.get(r.company) ?? { value: 0 };
      cc.value++; companyCount.set(r.company, cc);
    }
  }

  const modules = MODULES.map((m) => {
    const a = moduleAcc.get(m.id)!;
    return { id: m.id, label: m.label, admin: a.admin, member: a.member, total: a.admin + a.member };
  }).sort((x, y) => y.total - x.total);

  return {
    counts: { users: users.size, projects: projects.size, access: rows.length, roles: roles.size, companies: companies.size },
    composition: { internalExternal: { internal, external }, permission: { admin, member } },
    modules,
    rankings: { topProjects: topN(projectCount), membersPerRole: topN(roleCount), topCompanies: topN(companyCount) },
    risk: { externalMembers, externalAdmins, projectAdmins, pending },
  };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/aggregations.ts" "app/(dashboard)/access-analysis/__tests__/aggregations.test.ts"
git commit -m "feat(acc-redesign): pure summary aggregations over access instances

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Instance view builder + cached loader

**Files:**
- Create: `lib/server/accessInstanceView.ts`
- Test: `lib/server/__tests__/accessInstanceView.test.ts`

The builder is a **pure** function over raw DC rows (testable without a DB). The loader wraps it with Prisma + an in-process cache.

- [ ] **Step 1: Write the failing test** (pure builder only)

```ts
import { describe, it, expect } from "vitest";
import { buildInstanceView, type RawDc } from "../accessInstanceView";

const raw: RawDc = {
  projectUsers: [
    { projectId: "p1", userId: "u1", status: "active", addedOn: new Date("2024-01-01") },
    { projectId: "p1", userId: "u2", status: "pending", addedOn: null },
  ],
  users: [
    { id: "u1", email: "ANA@hermosillo.com", name: "Ana" },
    { id: "u2", email: "bob@acme.com", name: "Bob" },
  ],
  projects: [{ id: "p1", name: "Tower A" }],
  products: [
    { projectId: "p1", userId: "u1", productKey: "build", accessLevel: "project_admin" },
    { projectId: "p1", userId: "u2", productKey: "docs", accessLevel: "project_user" },
  ],
  roles: [{ projectId: "p1", userId: "u1", roleId: "r1" }],
  roleNames: [{ id: "r1", name: "Project Admin" }],
  companies: [{ projectId: "p1", userId: "u1", companyId: "c1" }],
  companyNames: [{ id: "c1", name: "Hermosillo" }],
};

describe("buildInstanceView", () => {
  const view = buildInstanceView(raw);
  it("creates one instance per project-user with joined fields", () => {
    expect(view).toHaveLength(2);
    const ana = view.find((v) => v.userId === "u1")!;
    expect(ana).toMatchObject({
      projectName: "Tower A", name: "Ana", isInternal: true, isAdmin: true,
      company: "Hermosillo", roles: ["Project Admin"], modules: ["build"], adminModules: ["build"],
    });
    expect(ana.email).toBe("ana@hermosillo.com"); // lowercased
    expect(ana.addedOn).toBe("2024-01-01");
  });
  it("flags external + non-admin correctly and tolerates missing joins", () => {
    const bob = view.find((v) => v.userId === "u2")!;
    expect(bob).toMatchObject({ isInternal: false, isAdmin: false, company: null, roles: [], modules: ["dataManagement"] });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `lib/server/accessInstanceView.ts`**

```ts
import "server-only";
import { db } from "@/server/db";
import { reduceModules } from "@/app/(dashboard)/access-analysis/modules";
import type { AccessInstance } from "@/app/(dashboard)/access-analysis/types";

const INTERNAL_DOMAIN = "@hermosillo.com";

export interface RawDc {
  projectUsers: Array<{ projectId: string; userId: string; status: string | null; addedOn: Date | null }>;
  users: Array<{ id: string; email: string | null; name: string | null }>;
  projects: Array<{ id: string; name: string }>;
  products: Array<{ projectId: string; userId: string; productKey: string; accessLevel: string }>;
  roles: Array<{ projectId: string; userId: string; roleId: string }>;
  roleNames: Array<{ id: string; name: string }>;
  companies: Array<{ projectId: string; userId: string; companyId: string }>;
  companyNames: Array<{ id: string; name: string }>;
}

export function buildInstanceView(raw: RawDc): AccessInstance[] {
  const userById = new Map(raw.users.map((u) => [u.id, u]));
  const projectById = new Map(raw.projects.map((p) => [p.id, p]));
  const roleNameById = new Map(raw.roleNames.map((r) => [r.id, r.name]));
  const companyNameById = new Map(raw.companyNames.map((c) => [c.id, c.name]));
  const key = (projectId: string, userId: string) => `${projectId}::${userId}`;

  const productsByKey = new Map<string, Array<{ productKey: string; accessLevel: string }>>();
  for (const p of raw.products) {
    const k = key(p.projectId, p.userId);
    (productsByKey.get(k) ?? productsByKey.set(k, []).get(k)!).push({ productKey: p.productKey, accessLevel: p.accessLevel });
  }
  const rolesByKey = new Map<string, string[]>();
  for (const r of raw.roles) {
    const name = roleNameById.get(r.roleId);
    if (!name) continue;
    const k = key(r.projectId, r.userId);
    (rolesByKey.get(k) ?? rolesByKey.set(k, []).get(k)!).push(name);
  }
  const companyByKey = new Map<string, string>();
  for (const c of raw.companies) {
    const name = companyNameById.get(c.companyId);
    if (name) companyByKey.set(key(c.projectId, c.userId), name);
  }

  return raw.projectUsers.map((pu) => {
    const k = key(pu.projectId, pu.userId);
    const u = userById.get(pu.userId);
    const email = (u?.email ?? "").toLowerCase();
    const { modules, adminModules } = reduceModules(productsByKey.get(k) ?? []);
    return {
      projectId: pu.projectId,
      projectName: projectById.get(pu.projectId)?.name ?? pu.projectId,
      userId: pu.userId,
      email,
      name: u?.name ?? email ?? pu.userId,
      isInternal: email.endsWith(INTERNAL_DOMAIN),
      isAdmin: adminModules.length > 0,
      status: pu.status,
      addedOn: pu.addedOn ? pu.addedOn.toISOString().slice(0, 10) : null,
      company: companyByKey.get(k) ?? null,
      roles: rolesByKey.get(k) ?? [],
      modules,
      adminModules,
    };
  });
}

let cache: { at: number; view: AccessInstance[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadInstanceView(force = false): Promise<AccessInstance[]> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.view;
  const [projectUsers, users, projects, products, roles, roleNames, companies, companyNames] = await Promise.all([
    db.accDcProjectUser.findMany({ select: { projectId: true, userId: true, status: true, addedOn: true } }),
    db.accDcUser.findMany({ select: { id: true, email: true, name: true } }),
    db.accDcProject.findMany({ select: { id: true, name: true } }),
    db.accDcProjectUserProduct.findMany({ select: { projectId: true, userId: true, productKey: true, accessLevel: true } }),
    db.accDcProjectUserRole.findMany({ select: { projectId: true, userId: true, roleId: true } }),
    db.accDcRole.findMany({ select: { id: true, name: true } }),
    db.accDcProjectUserCompany.findMany({ select: { projectId: true, userId: true, companyId: true } }),
    db.accDcCompany.findMany({ select: { id: true, name: true } }),
  ]);
  const view = buildInstanceView({ projectUsers, users, projects, products, roles, roleNames, companies, companyNames });
  cache = { at: Date.now(), view };
  return view;
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run lib/server/__tests__/accessInstanceView.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add lib/server/accessInstanceView.ts lib/server/__tests__/accessInstanceView.test.ts
git commit -m "feat(acc-redesign): cached denormalized access-instance view from DC tables

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Filter (de)serialization for URLs/query params

**Files:**
- Create: `app/(dashboard)/access-analysis/filterParams.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/filterParams.test.ts`

Route handlers receive filters as a JSON string in one query param to keep keys simple.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseFilters, serializeFilters } from "../filterParams";
import { EMPTY_FILTERS } from "../types";

describe("filter params", () => {
  it("round-trips", () => {
    const f = { ...EMPTY_FILTERS, projectId: ["p1"], internalExternal: "external" as const, search: "x" };
    expect(parseFilters(serializeFilters(f))).toEqual(f);
  });
  it("returns EMPTY_FILTERS for null/garbage", () => {
    expect(parseFilters(null)).toEqual(EMPTY_FILTERS);
    expect(parseFilters("not json")).toEqual(EMPTY_FILTERS);
  });
  it("ignores unknown keys", () => {
    expect(parseFilters(JSON.stringify({ projectId: ["p1"], hacker: 1 }))).toMatchObject({ projectId: ["p1"] });
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `filterParams.ts`**

```ts
import { EMPTY_FILTERS, type FilterState } from "./types";

export function serializeFilters(f: FilterState): string {
  return JSON.stringify(f);
}

export function parseFilters(raw: string | null): FilterState {
  if (!raw) return { ...EMPTY_FILTERS };
  try {
    const o = JSON.parse(raw) as Partial<FilterState>;
    return {
      projectId: Array.isArray(o.projectId) ? o.projectId.map(String) : [],
      company: Array.isArray(o.company) ? o.company.map(String) : [],
      role: Array.isArray(o.role) ? o.role.map(String) : [],
      module: Array.isArray(o.module) ? (o.module as FilterState["module"]) : [],
      internalExternal: o.internalExternal === "internal" || o.internalExternal === "external" ? o.internalExternal : null,
      adminMember: o.adminMember === "admin" || o.adminMember === "member" ? o.adminMember : null,
      dateFrom: typeof o.dateFrom === "string" ? o.dateFrom : null,
      dateTo: typeof o.dateTo === "string" ? o.dateTo : null,
      search: typeof o.search === "string" ? o.search : "",
    };
  } catch {
    return { ...EMPTY_FILTERS };
  }
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/filterParams.ts" "app/(dashboard)/access-analysis/__tests__/filterParams.test.ts"
git commit -m "feat(acc-redesign): safe filter (de)serialization for query params

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `/api/access-analysis/summary` route

**Files:**
- Create: `app/api/access-analysis/summary/route.ts`
- Test: `app/api/access-analysis/summary/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test** (mock the view loader so no DB is needed)

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "A",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin"], modules: ["build"], adminModules: ["build"] },
    { projectId: "p1", projectName: "Tower A", userId: "u2", email: "b@acme.com", name: "B",
      isInternal: false, isAdmin: false, status: "pending", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
  ])),
}));

import { GET } from "../route";

const call = (filters?: object) => {
  const url = new URL("http://localhost/api/access-analysis/summary");
  if (filters) url.searchParams.set("filters", JSON.stringify(filters));
  return GET(new Request(url));
};

describe("GET /api/access-analysis/summary", () => {
  it("returns the full summary unfiltered", async () => {
    const res = await call();
    const body = await res.json();
    expect(body.counts.access).toBe(2);
    expect(body.composition.internalExternal).toEqual({ internal: 1, external: 1 });
  });
  it("applies filters", async () => {
    const res = await call({ internalExternal: "external" });
    const body = await res.json();
    expect(body.counts.access).toBe(1);
    expect(body.risk.externalMembers).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `app/api/access-analysis/summary/route.ts`**

```ts
import { NextResponse } from "next/server";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { buildSummary } from "@/app/(dashboard)/access-analysis/aggregations";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filters = parseFilters(new URL(request.url).searchParams.get("filters"));
  const view = await loadInstanceView();
  const summary = buildSummary(filterInstances(view, filters));
  return NextResponse.json(summary);
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add "app/api/access-analysis/summary/route.ts" "app/api/access-analysis/summary/__tests__/route.test.ts"
git commit -m "feat(acc-redesign): summary aggregation endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Trends builder + `/api/access-analysis/trends` route

**Files:**
- Create: `app/(dashboard)/access-analysis/trends.ts` (pure bucketers)
- Create: `app/api/access-analysis/trends/route.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/trends.test.ts`

- [ ] **Step 1: Write the failing test** (pure bucketers)

```ts
import { describe, it, expect } from "vitest";
import { bucketByWeek, bucketByMonth } from "../trends";

describe("trend bucketers", () => {
  it("buckets ISO timestamps by week (YYYY-Www) and counts", () => {
    const out = bucketByWeek(["2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "2026-01-20T00:00:00Z"]);
    const total = out.reduce((s, p) => s + p.value, 0);
    expect(total).toBe(3);
    expect(out).toEqual([...out].sort((a, b) => a.label.localeCompare(b.label)));
  });
  it("buckets by month (YYYY-MM)", () => {
    const out = bucketByMonth(["2024-01-15", "2024-01-20", "2024-03-01"]);
    expect(out).toEqual([{ label: "2024-01", value: 2 }, { label: "2024-03", value: 1 }]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `trends.ts`**

```ts
import type { Category } from "./types";

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function tally(labels: string[]): Category[] {
  const m = new Map<string, number>();
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
}

export const bucketByWeek = (isoTimestamps: string[]): Category[] =>
  tally(isoTimestamps.map((t) => isoWeek(new Date(t))));

export const bucketByMonth = (isoDates: string[]): Category[] =>
  tally(isoDates.filter(Boolean).map((d) => d.slice(0, 7)));
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Implement `app/api/access-analysis/trends/route.ts`** (no new test — covered by bucketers + E2E)

```ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";
import { bucketByWeek, bucketByMonth } from "@/app/(dashboard)/access-analysis/trends";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const filters = parseFilters(new URL(request.url).searchParams.get("filters"));
  const view = filterInstances(await loadInstanceView(), filters);

  // Access added per month, from the filtered instance view.
  const accessAdded = bucketByMonth(view.map((v) => v.addedOn ?? "").filter(Boolean));

  // Activity per week, scoped to the filtered users' emails.
  const emails = [...new Set(view.map((v) => v.email).filter(Boolean))];
  const activityRows = emails.length
    ? await db.accActivity.findMany({
        where: { userEmail: { in: emails } },
        select: { createdAt: true },
      })
    : [];
  const activityPerWeek = bucketByWeek(activityRows.map((r) => r.createdAt.toISOString()));

  return NextResponse.json({ activityPerWeek, accessAdded });
}
```

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/trends.ts" "app/(dashboard)/access-analysis/__tests__/trends.test.ts" "app/api/access-analysis/trends/route.ts"
git commit -m "feat(acc-redesign): trend bucketers + trends endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Detail rows + CSV + `/api/access-analysis/members` route

**Files:**
- Create: `app/(dashboard)/access-analysis/csv.ts` (pure CSV builder)
- Create: `app/api/access-analysis/members/route.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/csv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("emits a header and escapes commas/quotes", () => {
    const csv = toCsv([
      { name: "Ana, Q", email: "a@x.com", project: 'Tower "A"', role: "Admin", access: "Admin", type: "Internal", company: "H", status: "active", addedOn: "2024-01-01" },
    ]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toBe("Name,Email,Project,Role,Access,Type,Company,Status,Added");
    expect(row).toContain('"Ana, Q"');
    expect(row).toContain('"Tower ""A"""');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `csv.ts`**

```ts
export interface MemberRow {
  name: string; email: string; project: string; role: string;
  access: string; type: string; company: string; status: string; addedOn: string;
}

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toCsv(rows: MemberRow[]): string {
  const header = ["Name", "Email", "Project", "Role", "Access", "Type", "Company", "Status", "Added"];
  const lines = rows.map((r) =>
    [r.name, r.email, r.project, r.role, r.access, r.type, r.company, r.status, r.addedOn].map((v) => esc(String(v ?? ""))).join(","),
  );
  return [header.join(","), ...lines].join("\n") + "\n";
}

export const instanceToRow = (i: {
  name: string; email: string; projectName: string; roles: string[]; isAdmin: boolean;
  isInternal: boolean; company: string | null; status: string | null; addedOn: string | null;
}): MemberRow => ({
  name: i.name, email: i.email, project: i.projectName, role: i.roles.join("; "),
  access: i.isAdmin ? "Admin" : "Member", type: i.isInternal ? "Internal" : "External",
  company: i.company ?? "", status: i.status ?? "", addedOn: i.addedOn ?? "",
});
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Implement `app/api/access-analysis/members/route.ts`** (paged JSON; `?format=csv` streams a download)

```ts
import { NextResponse } from "next/server";
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { filterInstances } from "@/app/(dashboard)/access-analysis/filters";
import { parseFilters } from "@/app/(dashboard)/access-analysis/filterParams";
import { toCsv, instanceToRow } from "@/app/(dashboard)/access-analysis/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseFilters(url.searchParams.get("filters"));
  const rows = filterInstances(await loadInstanceView(), filters);

  if (url.searchParams.get("format") === "csv") {
    const csv = toCsv(rows.map(instanceToRow));
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="access-analysis.csv"' },
    });
  }

  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get("size") ?? 50)));
  const start = page * size;
  return NextResponse.json({
    total: rows.length,
    page,
    size,
    rows: rows.slice(start, start + size).map(instanceToRow),
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/csv.ts" "app/(dashboard)/access-analysis/__tests__/csv.test.ts" "app/api/access-analysis/members/route.ts"
git commit -m "feat(acc-redesign): paged member rows + CSV export endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Zustand filter store

**Files:**
- Create: `app/(dashboard)/access-analysis/store.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAccessFilters } from "../store";

const reset = () => useAccessFilters.getState().clearAll();

describe("useAccessFilters", () => {
  beforeEach(reset);
  it("toggles a multi-select value on and off", () => {
    useAccessFilters.getState().toggle("projectId", "p1");
    expect(useAccessFilters.getState().filters.projectId).toEqual(["p1"]);
    useAccessFilters.getState().toggle("projectId", "p1");
    expect(useAccessFilters.getState().filters.projectId).toEqual([]);
  });
  it("sets a single-select dimension", () => {
    useAccessFilters.getState().setSingle("internalExternal", "external");
    expect(useAccessFilters.getState().filters.internalExternal).toBe("external");
  });
  it("clearAll resets and activeCount reflects selections", () => {
    useAccessFilters.getState().toggle("module", "build");
    useAccessFilters.getState().setSingle("adminMember", "admin");
    expect(useAccessFilters.getState().activeCount()).toBe(2);
    useAccessFilters.getState().clearAll();
    expect(useAccessFilters.getState().activeCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `store.ts`**

```ts
import { create } from "zustand";
import { EMPTY_FILTERS, type FilterState, type ModuleId } from "./types";

type MultiKey = "projectId" | "company" | "role" | "module";
type SingleKey = "internalExternal" | "adminMember";

interface Store {
  filters: FilterState;
  toggle: (key: MultiKey, value: string) => void;
  setSingle: (key: SingleKey, value: FilterState[SingleKey]) => void;
  setSearch: (value: string) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  clearAll: () => void;
  activeCount: () => number;
}

export const useAccessFilters = create<Store>((set, get) => ({
  filters: { ...EMPTY_FILTERS },
  toggle: (key, value) =>
    set((s) => {
      const arr = s.filters[key] as string[];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { filters: { ...s.filters, [key]: next as ModuleId[] | string[] } };
    }),
  setSingle: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: s.filters[key] === value ? null : value } })),
  setSearch: (value) => set((s) => ({ filters: { ...s.filters, search: value } })),
  setDateRange: (from, to) => set((s) => ({ filters: { ...s.filters, dateFrom: from, dateTo: to } })),
  clearAll: () => set({ filters: { ...EMPTY_FILTERS } }),
  activeCount: () => {
    const f = get().filters;
    return (
      f.projectId.length + f.company.length + f.role.length + f.module.length +
      (f.internalExternal ? 1 : 0) + (f.adminMember ? 1 : 0) +
      (f.dateFrom || f.dateTo ? 1 : 0) + (f.search.trim() ? 1 : 0)
    );
  },
}));
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/store.ts" "app/(dashboard)/access-analysis/__tests__/store.test.ts"
git commit -m "feat(acc-redesign): zustand filter store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Query hooks + key factory

**Files:**
- Create: `app/(dashboard)/access-analysis/queries.ts`
- Test: `app/(dashboard)/access-analysis/__tests__/queries.test.ts`

- [ ] **Step 1: Write the failing test** (key factory is the testable pure part)

```ts
import { describe, it, expect } from "vitest";
import { accessKeys } from "../queries";
import { EMPTY_FILTERS } from "../types";

describe("accessKeys", () => {
  it("namespaces and includes the filter set so queries re-key on change", () => {
    const a = accessKeys.summary(EMPTY_FILTERS);
    const b = accessKeys.summary({ ...EMPTY_FILTERS, module: ["build"] });
    expect(a[0]).toBe("access-analysis");
    expect(a).not.toEqual(b);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `queries.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { serializeFilters } from "./filterParams";
import type { FilterState, SummaryDTO, Category } from "./types";

export const accessKeys = {
  summary: (f: FilterState) => ["access-analysis", "summary", f] as const,
  trends: (f: FilterState) => ["access-analysis", "trends", f] as const,
  members: (f: FilterState, page: number, size: number) => ["access-analysis", "members", f, page, size] as const,
};

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json() as Promise<T>;
}

export function useSummary(f: FilterState) {
  const qs = encodeURIComponent(serializeFilters(f));
  return useQuery({ queryKey: accessKeys.summary(f), queryFn: () => getJson<SummaryDTO>(`/api/access-analysis/summary?filters=${qs}`) });
}

export interface TrendsDTO { activityPerWeek: Category[]; accessAdded: Category[] }
export function useTrends(f: FilterState) {
  const qs = encodeURIComponent(serializeFilters(f));
  return useQuery({ queryKey: accessKeys.trends(f), queryFn: () => getJson<TrendsDTO>(`/api/access-analysis/trends?filters=${qs}`) });
}

export interface MembersDTO { total: number; page: number; size: number; rows: Record<string, string>[] }
export function useMembers(f: FilterState, page: number, size: number) {
  const qs = encodeURIComponent(serializeFilters(f));
  return useQuery({ queryKey: accessKeys.members(f, page, size), queryFn: () => getJson<MembersDTO>(`/api/access-analysis/members?filters=${qs}&page=${page}&size=${size}`) });
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/queries.ts" "app/(dashboard)/access-analysis/__tests__/queries.test.ts"
git commit -m "feat(acc-redesign): tanstack query hooks + key factory

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: ECharts wrapper

**Files:**
- Create: `app/(dashboard)/access-analysis/components/EChart.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/EChart.test.tsx`

A thin client wrapper that dynamically imports `echarts-for-react` (`ssr: false`) and applies shared theme defaults. Reuse `chartColors.ts` tokens already in the directory.

- [ ] **Step 1: Write the failing test** (smoke: renders without crashing; `echarts-for-react` mocked)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("echarts-for-react", () => ({ default: (props: { option: unknown }) => <div data-testid="echart" data-has-option={!!props.option} /> }));

import { EChart } from "../components/EChart";

describe("EChart", () => {
  it("renders an option", () => {
    const { getByTestId } = render(<EChart option={{ series: [] }} height={200} />);
    expect(getByTestId("echart").getAttribute("data-has-option")).toBe("true");
  });
});
```

> Note: `next/dynamic` with `ssr:false` resolves to the mocked module in jsdom. If the dynamic import complicates the test, import `echarts-for-react` directly inside `EChart.tsx` (still a client component) — the dashboard already runs client-side.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `components/EChart.tsx`**

```tsx
"use client";
import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

export function EChart({
  option, height = 280, onEvents,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (params: { name?: string; data?: unknown; seriesName?: string }) => void>;
}) {
  return (
    <ReactECharts
      option={option}
      style={{ height, width: "100%" }}
      opts={{ renderer: "canvas" }}
      notMerge
      lazyUpdate
      onEvents={onEvents}
    />
  );
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/EChart.tsx" "app/(dashboard)/access-analysis/__tests__/EChart.test.tsx"
git commit -m "feat(acc-redesign): shared ECharts canvas wrapper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 12: Count tiles + Composition donuts

**Files:**
- Create: `app/(dashboard)/access-analysis/components/CountTiles.tsx`
- Create: `app/(dashboard)/access-analysis/components/CompositionDonuts.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/CountTiles.test.tsx`

These are presentational: they take a `SummaryDTO` and the store's click handlers as props (so they are testable without network). The dashboard (Task 17) wires them to `useSummary`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CountTiles } from "../components/CountTiles";

const counts = { users: 3367, projects: 428, access: 16942, roles: 155, companies: 319 };

describe("CountTiles", () => {
  it("renders all five labelled counts with locale formatting", () => {
    const { getByText } = render(<CountTiles counts={counts} projectTotal={1152} />);
    expect(getByText("16,942")).toBeTruthy();
    expect(getByText(/Access/)).toBeTruthy();
    expect(getByText(/of 1,152/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `components/CountTiles.tsx`**

```tsx
"use client";
import type { SummaryDTO } from "../types";

const nf = (n: number) => n.toLocaleString("en-US");

function Tile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums text-zinc-100">{nf(value)}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</div>
      {sub ? <div className="text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  );
}

export function CountTiles({ counts, projectTotal }: { counts: SummaryDTO["counts"]; projectTotal: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Tile label="Users" value={counts.users} />
      <Tile label="Projects" value={counts.projects} sub={`of ${nf(projectTotal)} total`} />
      <Tile label="Access" value={counts.access} />
      <Tile label="Roles" value={counts.roles} />
      <Tile label="Companies" value={counts.companies} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/CompositionDonuts.tsx`** (two donuts; click toggles a single-select filter)

```tsx
"use client";
import { EChart } from "./EChart";
import type { SummaryDTO } from "../types";

function donut(title: string, data: { name: string; value: number; key: string }[]) {
  return {
    title: { text: title, left: "center", top: 0, textStyle: { color: "#a1a1aa", fontSize: 12, fontWeight: 500 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { color: "#a1a1aa" } },
    series: [{
      type: "pie", radius: ["55%", "78%"], center: ["50%", "52%"], avoidLabelOverlap: true,
      itemStyle: { borderColor: "#09090b", borderWidth: 2 },
      label: { show: false }, labelLine: { show: false },
      data: data.map((d) => ({ name: d.name, value: d.value, _key: d.key })),
    }],
  };
}

export function CompositionDonuts({
  composition, onPickInternalExternal, onPickAdminMember,
}: {
  composition: SummaryDTO["composition"];
  onPickInternalExternal: (v: "internal" | "external") => void;
  onPickAdminMember: (v: "admin" | "member") => void;
}) {
  const ie = composition.internalExternal;
  const perm = composition.permission;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart
          option={donut("Internal vs External", [
            { name: "Internal", value: ie.internal, key: "internal" },
            { name: "External", value: ie.external, key: "external" },
          ])}
          height={260}
          onEvents={{ click: (p) => onPickInternalExternal((p.name === "Internal" ? "internal" : "external")) }}
        />
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart
          option={donut("Permission mix", [
            { name: "Administrator", value: perm.admin, key: "admin" },
            { name: "Member", value: perm.member, key: "member" },
          ])}
          height={260}
          onEvents={{ click: (p) => onPickAdminMember((p.name === "Administrator" ? "admin" : "member")) }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run app/(dashboard)/access-analysis/__tests__/CountTiles.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/CountTiles.tsx" "app/(dashboard)/access-analysis/components/CompositionDonuts.tsx" "app/(dashboard)/access-analysis/__tests__/CountTiles.test.tsx"
git commit -m "feat(acc-redesign): count tiles + composition donuts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 13: Module access chart + Risk cards

**Files:**
- Create: `app/(dashboard)/access-analysis/components/ModuleAccessChart.tsx`
- Create: `app/(dashboard)/access-analysis/components/RiskCards.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/RiskCards.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RiskCards } from "../components/RiskCards";

describe("RiskCards", () => {
  it("renders the four risk metrics and fires the right filter on click", () => {
    const onExternal = vi.fn();
    const { getByText } = render(
      <RiskCards
        risk={{ externalMembers: 4252, externalAdmins: 63, projectAdmins: 4626, pending: 65 }}
        onExternal={onExternal} onExternalAdmins={vi.fn()} onAdmins={vi.fn()} onPending={vi.fn()}
      />,
    );
    expect(getByText("4,252")).toBeTruthy();
    expect(getByText("63")).toBeTruthy();
    fireEvent.click(getByText(/External members/i));
    expect(onExternal).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `components/RiskCards.tsx`**

```tsx
"use client";
import type { SummaryDTO } from "../types";

const nf = (n: number) => n.toLocaleString("en-US");

function Card({ label, value, accent, onClick }: { label: string; value: number; accent: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-col items-start rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left transition hover:border-zinc-600">
      <span className={`text-2xl font-semibold tabular-nums ${accent}`}>{nf(value)}</span>
      <span className="mt-0.5 text-xs font-medium text-zinc-400">{label}</span>
    </button>
  );
}

export function RiskCards({
  risk, onExternal, onExternalAdmins, onAdmins, onPending,
}: {
  risk: SummaryDTO["risk"];
  onExternal: () => void; onExternalAdmins: () => void; onAdmins: () => void; onPending: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="External members" value={risk.externalMembers} accent="text-amber-400" onClick={onExternal} />
      <Card label="External project admins" value={risk.externalAdmins} accent="text-red-400" onClick={onExternalAdmins} />
      <Card label="Project admins" value={risk.projectAdmins} accent="text-zinc-100" onClick={onAdmins} />
      <Card label="Pending memberships" value={risk.pending} accent="text-zinc-100" onClick={onPending} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/ModuleAccessChart.tsx`** (stacked horizontal bars, sorted by adoption from the DTO order)

```tsx
"use client";
import { EChart } from "./EChart";
import type { SummaryDTO, ModuleId } from "../types";

export function ModuleAccessChart({
  modules, onPickModule,
}: {
  modules: SummaryDTO["modules"];
  onPickModule: (id: ModuleId) => void;
}) {
  // DTO is sorted by total desc; reverse so the largest sits at the TOP of a horizontal bar chart.
  const ordered = [...modules].reverse();
  const option = {
    grid: { left: 140, right: 24, top: 16, bottom: 16 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0, right: 0, textStyle: { color: "#a1a1aa" } },
    xAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    yAxis: { type: "category", data: ordered.map((m) => m.label), axisLabel: { color: "#d4d4d8" } },
    series: [
      { name: "Member", type: "bar", stack: "x", itemStyle: { color: "#3f6212" }, data: ordered.map((m) => m.member) },
      { name: "Admin", type: "bar", stack: "x", itemStyle: { color: "#a3e635" }, data: ordered.map((m) => m.admin) },
    ],
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">Module access</div>
      <EChart
        option={option}
        height={360}
        onEvents={{ click: (p) => {
          const hit = ordered.find((m) => m.label === p.name);
          if (hit) onPickModule(hit.id);
        } }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run, expect PASS** — `npx vitest run app/(dashboard)/access-analysis/__tests__/RiskCards.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/ModuleAccessChart.tsx" "app/(dashboard)/access-analysis/components/RiskCards.tsx" "app/(dashboard)/access-analysis/__tests__/RiskCards.test.tsx"
git commit -m "feat(acc-redesign): module access chart + risk cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 14: Rankings + Trends charts

**Files:**
- Create: `app/(dashboard)/access-analysis/components/Rankings.tsx`
- Create: `app/(dashboard)/access-analysis/components/Trends.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/Rankings.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
vi.mock("../components/EChart", () => ({ EChart: () => <div data-testid="echart" /> }));
import { Rankings } from "../components/Rankings";

describe("Rankings", () => {
  it("renders three ranking panels", () => {
    const { getAllByTestId, getByText } = render(
      <Rankings
        rankings={{ topProjects: [{ label: "Tower A", value: 2, key: "p1" }], membersPerRole: [], topCompanies: [] }}
        onPickProject={vi.fn()} onPickRole={vi.fn()} onPickCompany={vi.fn()}
      />,
    );
    expect(getAllByTestId("echart")).toHaveLength(3);
    expect(getByText(/Top projects/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `components/Rankings.tsx`**

```tsx
"use client";
import { EChart } from "./EChart";
import type { SummaryDTO, Category } from "../types";

function barOption(rows: Category[]) {
  const ordered = [...rows].reverse();
  return {
    grid: { left: 150, right: 24, top: 8, bottom: 8 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    yAxis: { type: "category", data: ordered.map((r) => r.label), axisLabel: { color: "#d4d4d8" } },
    series: [{ type: "bar", itemStyle: { color: "#22d3ee", borderRadius: [0, 4, 4, 0] }, data: ordered.map((r) => r.value) }],
  };
}

function Panel({ title, rows, onPick }: { title: string; rows: Category[]; onPick: (label: string, key?: string) => void }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">{title}</div>
      <EChart option={barOption(rows)} height={280}
        onEvents={{ click: (p) => { const hit = rows.find((r) => r.label === p.name); onPick(p.name ?? "", hit?.key); } }} />
    </div>
  );
}

export function Rankings({
  rankings, onPickProject, onPickRole, onPickCompany,
}: {
  rankings: SummaryDTO["rankings"];
  onPickProject: (label: string, key?: string) => void;
  onPickRole: (label: string) => void;
  onPickCompany: (label: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Panel title="Top projects by people" rows={rankings.topProjects} onPick={onPickProject} />
      <Panel title="Members per role" rows={rankings.membersPerRole} onPick={(l) => onPickRole(l)} />
      <Panel title="Top companies" rows={rankings.topCompanies} onPick={(l) => onPickCompany(l)} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `components/Trends.tsx`**

```tsx
"use client";
import { EChart } from "./EChart";
import type { Category } from "../types";

function lineOption(title: string, rows: Category[], color: string) {
  return {
    title: { text: title, left: 8, top: 0, textStyle: { color: "#a1a1aa", fontSize: 12, fontWeight: 500 } },
    grid: { left: 48, right: 16, top: 36, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: rows.map((r) => r.label), axisLabel: { color: "#71717a" } },
    yAxis: { type: "value", axisLabel: { color: "#71717a" }, splitLine: { lineStyle: { color: "#27272a" } } },
    series: [{ type: "line", smooth: true, showSymbol: false, areaStyle: { opacity: 0.15 }, itemStyle: { color }, data: rows.map((r) => r.value) }],
  };
}

export function Trends({ activityPerWeek, accessAdded }: { activityPerWeek: Category[]; accessAdded: Category[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart option={lineOption("Activity events / week", activityPerWeek, "#22d3ee")} height={240} />
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <EChart option={lineOption("Access added / month", accessAdded, "#a3e635")} height={240} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run, expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/Rankings.tsx" "app/(dashboard)/access-analysis/components/Trends.tsx" "app/(dashboard)/access-analysis/__tests__/Rankings.test.tsx"
git commit -m "feat(acc-redesign): rankings + trends charts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 15: Filter bar (searchable multi-select combobox + chips + global search)

**Files:**
- Create: `app/(dashboard)/access-analysis/components/MultiSelectCombobox.tsx`
- Create: `app/(dashboard)/access-analysis/components/ActiveFilterChips.tsx`
- Create: `app/(dashboard)/access-analysis/components/FilterBar.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/MultiSelectCombobox.test.tsx`

Uses Radix popover + input. The option lists (projects, companies, roles, modules) are passed in as props from the dashboard, derived from an unfiltered summary fetch.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MultiSelectCombobox } from "../components/MultiSelectCombobox";

describe("MultiSelectCombobox", () => {
  it("filters options by the search box and toggles selection", () => {
    const onToggle = vi.fn();
    const { getByPlaceholderText, getByText, queryByText } = render(
      <MultiSelectCombobox
        label="Project" placeholder="Search projects"
        options={[{ value: "p1", label: "Tower A" }, { value: "p2", label: "Bridge" }]}
        selected={[]} onToggle={onToggle}
      />,
    );
    fireEvent.click(getByText("Project")); // open
    fireEvent.change(getByPlaceholderText("Search projects"), { target: { value: "brid" } });
    expect(queryByText("Tower A")).toBeNull();
    fireEvent.click(getByText("Bridge"));
    expect(onToggle).toHaveBeenCalledWith("p2");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `components/MultiSelectCombobox.tsx`**

```tsx
"use client";
import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";

export interface Option { value: string; label: string }

export function MultiSelectCombobox({
  label, placeholder, options, selected, onToggle,
}: {
  label: string; placeholder: string; options: Option[]; selected: string[]; onToggle: (value: string) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options;
  return (
    <Popover.Root>
      <Popover.Trigger className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-600">
        {label}{selected.length ? <span className="ml-1 rounded bg-zinc-800 px-1.5 text-xs">{selected.length}</span> : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} className="z-50 w-64 rounded-xl border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
            className="mb-2 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 outline-none" />
          <div className="max-h-64 overflow-auto">
            {filtered.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-200 hover:bg-zinc-900">
                <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {filtered.length === 0 ? <div className="px-2 py-1 text-sm text-zinc-500">No matches</div> : null}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 4: Implement `components/ActiveFilterChips.tsx`**

```tsx
"use client";
import { useAccessFilters } from "../store";

export function ActiveFilterChips() {
  const { filters, toggle, setSingle, setSearch, setDateRange, clearAll, activeCount } = useAccessFilters();
  if (activeCount() === 0) return null;
  const chip = (text: string, onRemove: () => void) => (
    <button key={text} onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-200 hover:border-zinc-500">
      {text} <span aria-hidden>×</span>
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.projectId.map((v) => chip(`Project: ${v}`, () => toggle("projectId", v)))}
      {filters.company.map((v) => chip(`Company: ${v}`, () => toggle("company", v)))}
      {filters.role.map((v) => chip(`Role: ${v}`, () => toggle("role", v)))}
      {filters.module.map((v) => chip(`Module: ${v}`, () => toggle("module", v)))}
      {filters.internalExternal ? chip(filters.internalExternal, () => setSingle("internalExternal", null)) : null}
      {filters.adminMember ? chip(filters.adminMember, () => setSingle("adminMember", null)) : null}
      {filters.dateFrom || filters.dateTo ? chip(`Dates`, () => setDateRange(null, null)) : null}
      {filters.search.trim() ? chip(`"${filters.search}"`, () => setSearch("")) : null}
      <button onClick={clearAll} className="text-xs text-zinc-400 underline hover:text-zinc-200">Clear all</button>
    </div>
  );
}
```

- [ ] **Step 5: Implement `components/FilterBar.tsx`**

```tsx
"use client";
import { useAccessFilters } from "../store";
import { MultiSelectCombobox, type Option } from "./MultiSelectCombobox";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { MODULES } from "../modules";

export interface FilterOptions { projects: Option[]; companies: Option[]; roles: Option[] }

export function FilterBar({ options }: { options: FilterOptions }) {
  const { filters, toggle, setSingle, setSearch } = useAccessFilters();
  const moduleOptions: Option[] = MODULES.map((m) => ({ value: m.id, label: m.label }));
  return (
    <div className="sticky top-0 z-40 flex flex-col gap-2 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <input value={filters.search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, projects, companies…"
          className="w-64 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-600" />
        <MultiSelectCombobox label="Project" placeholder="Search projects" options={options.projects} selected={filters.projectId} onToggle={(v) => toggle("projectId", v)} />
        <MultiSelectCombobox label="Company" placeholder="Search companies" options={options.companies} selected={filters.company} onToggle={(v) => toggle("company", v)} />
        <MultiSelectCombobox label="Role" placeholder="Search roles" options={options.roles} selected={filters.role} onToggle={(v) => toggle("role", v)} />
        <MultiSelectCombobox label="Module" placeholder="Search modules" options={moduleOptions} selected={filters.module} onToggle={(v) => toggle("module", v)} />
        <button onClick={() => setSingle("internalExternal", "internal")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${filters.internalExternal === "internal" ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>Internal</button>
        <button onClick={() => setSingle("internalExternal", "external")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${filters.internalExternal === "external" ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>External</button>
        <button onClick={() => setSingle("adminMember", "admin")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${filters.adminMember === "admin" ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>Admins</button>
      </div>
      <ActiveFilterChips />
    </div>
  );
}
```

- [ ] **Step 6: Run, expect PASS** — `npx vitest run app/(dashboard)/access-analysis/__tests__/MultiSelectCombobox.test.tsx`.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/MultiSelectCombobox.tsx" "app/(dashboard)/access-analysis/components/ActiveFilterChips.tsx" "app/(dashboard)/access-analysis/components/FilterBar.tsx" "app/(dashboard)/access-analysis/__tests__/MultiSelectCombobox.test.tsx"
git commit -m "feat(acc-redesign): premium filter bar (combobox + chips + search)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 16: Detail table (group / expand-collapse / multi-select / export)

**Files:**
- Create: `app/(dashboard)/access-analysis/components/DetailTable.tsx`
- Test: `app/(dashboard)/access-analysis/__tests__/DetailTable.test.tsx`

Uses `@tanstack/react-table` with grouping + expanded + row-selection state. Data comes from `useMembers`; the parent passes the current filter set so "Export CSV" links to the members endpoint with `format=csv`.

- [ ] **Step 1: Write the failing test** (render with injected rows; assert grouping toggle + export link)

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DetailTable } from "../components/DetailTable";

const rows = [
  { name: "Ana", email: "a@hermosillo.com", project: "Tower A", role: "Admin", access: "Admin", type: "Internal", company: "Hermosillo", status: "active", addedOn: "2024-01-01" },
  { name: "Bob", email: "b@acme.com", project: "Tower A", role: "Member", access: "Member", type: "External", company: "Acme", status: "pending", addedOn: "2024-02-01" },
];

describe("DetailTable", () => {
  it("renders rows and an export link carrying the filter querystring", () => {
    const { getByText, getByRole } = render(
      <DetailTable rows={rows} total={2} page={0} size={50} onPage={() => {}} exportHref="/api/access-analysis/members?filters=%7B%7D&format=csv" loading={false} />,
    );
    expect(getByText("Ana")).toBeTruthy();
    expect(getByText("Bob")).toBeTruthy();
    expect((getByRole("link", { name: /export/i }) as HTMLAnchorElement).getAttribute("href")).toContain("format=csv");
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `components/DetailTable.tsx`**

```tsx
"use client";
import { useState } from "react";
import {
  useReactTable, getCoreRowModel, getGroupedRowModel, getExpandedRowModel, flexRender,
  type ColumnDef, type GroupingState, type ExpandedState, type RowSelectionState,
} from "@tanstack/react-table";

export interface Row {
  name: string; email: string; project: string; role: string;
  access: string; type: string; company: string; status: string; addedOn: string;
}

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "email", header: "Email" },
  { accessorKey: "project", header: "Project" },
  { accessorKey: "role", header: "Role" },
  { accessorKey: "access", header: "Access" },
  { accessorKey: "type", header: "Type" },
  { accessorKey: "company", header: "Company" },
  { accessorKey: "status", header: "Status" },
  { accessorKey: "addedOn", header: "Added" },
];

export function DetailTable({
  rows, total, page, size, onPage, exportHref, loading,
}: {
  rows: Row[]; total: number; page: number; size: number;
  onPage: (page: number) => void; exportHref: string; loading: boolean;
}) {
  const [grouping, setGrouping] = useState<GroupingState>([]);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const table = useReactTable({
    data: rows, columns, state: { grouping, expanded, rowSelection },
    onGroupingChange: setGrouping, onExpandedChange: setExpanded, onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(), getGroupedRowModel: getGroupedRowModel(), getExpandedRowModel: getExpandedRowModel(),
  });
  const pages = Math.max(1, Math.ceil(total / size));
  const groupBy = (col: string) => setGrouping(grouping[0] === col ? [] : [col]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">Members ({total.toLocaleString("en-US")})</span>
        <span className="text-xs text-zinc-500">Group by:</span>
        {["project", "company", "role"].map((c) => (
          <button key={c} onClick={() => groupBy(c)}
            className={`rounded border px-2 py-0.5 text-xs ${grouping[0] === c ? "border-zinc-500 text-zinc-100" : "border-zinc-800 text-zinc-300"}`}>{c}</button>
        ))}
        <a href={exportHref} className="ml-auto rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-200 hover:border-zinc-500">Export CSV</a>
      </div>
      <div className="max-h-[520px] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-950 text-left text-xs text-zinc-400">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 font-medium">{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-900 text-zinc-200">
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-3 py-1.5">
                    {c.getIsGrouped() ? (
                      <button onClick={r.getToggleExpandedHandler()} className="font-medium text-zinc-100">
                        {r.getIsExpanded() ? "▾" : "▸"} {flexRender(c.column.columnDef.cell ?? c.column.columnDef.header, c.getContext())} ({r.subRows.length})
                      </button>
                    ) : c.getIsAggregated() ? null : c.getIsPlaceholder() ? null : flexRender(c.column.columnDef.cell ?? ((ctx) => ctx.getValue()), c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {loading ? <div className="px-3 py-6 text-center text-sm text-zinc-500">Loading…</div> : null}
        {!loading && rows.length === 0 ? <div className="px-3 py-6 text-center text-sm text-zinc-500">No members match these filters.</div> : null}
      </div>
      <div className="flex items-center justify-between border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <span>Page {page + 1} of {pages}</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => onPage(page - 1)} className="rounded border border-zinc-800 px-2 py-0.5 disabled:opacity-40">Prev</button>
          <button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} className="rounded border border-zinc-800 px-2 py-0.5 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS** — `npx vitest run app/(dashboard)/access-analysis/__tests__/DetailTable.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/DetailTable.tsx" "app/(dashboard)/access-analysis/__tests__/DetailTable.test.tsx"
git commit -m "feat(acc-redesign): detail table with grouping/expand/multi-select/export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 17: Dashboard shell + page wiring (route swap)

**Files:**
- Create: `app/(dashboard)/access-analysis/AccessAnalysisDashboard.tsx`
- Modify: `app/(dashboard)/access-analysis/page.tsx` (replace old import with the new dashboard)
- Test: `app/(dashboard)/access-analysis/__tests__/AccessAnalysisDashboard.test.tsx`

The current `page.tsx` imports `AccessAnalysisPage` from `../users/access-analysis/`. Replace it with a Server Component that renders the new client dashboard. (Old prefetch helpers can stay or be removed in Task 19.)

- [ ] **Step 1: Write the failing test** (mock the query hooks; assert the major sections render)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const summary = {
  counts: { users: 1, projects: 1, access: 1, roles: 1, companies: 1 },
  composition: { internalExternal: { internal: 1, external: 0 }, permission: { admin: 1, member: 0 } },
  modules: [], rankings: { topProjects: [], membersPerRole: [], topCompanies: [] },
  risk: { externalMembers: 0, externalAdmins: 0, projectAdmins: 1, pending: 0 },
};
vi.mock("../queries", () => ({
  useSummary: () => ({ data: summary, isLoading: false }),
  useTrends: () => ({ data: { activityPerWeek: [], accessAdded: [] }, isLoading: false }),
  useMembers: () => ({ data: { total: 0, page: 0, size: 50, rows: [] }, isLoading: false }),
}));
vi.mock("../components/EChart", () => ({ EChart: () => <div data-testid="echart" /> }));

import { AccessAnalysisDashboard } from "../AccessAnalysisDashboard";

describe("AccessAnalysisDashboard", () => {
  it("renders the count tiles + risk + table sections", () => {
    const { getByText } = render(
      <AccessAnalysisDashboard filterOptions={{ projects: [], companies: [], roles: [] }} projectTotal={1152} />,
    );
    expect(getByText(/Access/)).toBeTruthy();
    expect(getByText(/Members/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `AccessAnalysisDashboard.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useAccessFilters } from "./store";
import { useSummary, useTrends, useMembers } from "./queries";
import { serializeFilters } from "./filterParams";
import { FilterBar, type FilterOptions } from "./components/FilterBar";
import { CountTiles } from "./components/CountTiles";
import { CompositionDonuts } from "./components/CompositionDonuts";
import { ModuleAccessChart } from "./components/ModuleAccessChart";
import { RiskCards } from "./components/RiskCards";
import { Rankings } from "./components/Rankings";
import { Trends } from "./components/Trends";
import { DetailTable } from "./components/DetailTable";

const EMPTY_SUMMARY = {
  counts: { users: 0, projects: 0, access: 0, roles: 0, companies: 0 },
  composition: { internalExternal: { internal: 0, external: 0 }, permission: { admin: 0, member: 0 } },
  modules: [], rankings: { topProjects: [], membersPerRole: [], topCompanies: [] },
  risk: { externalMembers: 0, externalAdmins: 0, projectAdmins: 0, pending: 0 },
};

export function AccessAnalysisDashboard({ filterOptions, projectTotal }: { filterOptions: FilterOptions; projectTotal: number }) {
  const { filters, toggle, setSingle } = useAccessFilters();
  const [page, setPage] = useState(0);
  const size = 50;

  const summary = useSummary(filters).data ?? EMPTY_SUMMARY;
  const trends = useTrends(filters).data ?? { activityPerWeek: [], accessAdded: [] };
  const members = useMembers(filters, page, size);
  const exportHref = `/api/access-analysis/members?filters=${encodeURIComponent(serializeFilters(filters))}&format=csv`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <FilterBar options={filterOptions} />
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4">
        <CountTiles counts={summary.counts} projectTotal={projectTotal} />
        <CompositionDonuts composition={summary.composition}
          onPickInternalExternal={(v) => setSingle("internalExternal", v)}
          onPickAdminMember={(v) => setSingle("adminMember", v)} />
        <ModuleAccessChart modules={summary.modules} onPickModule={(id) => toggle("module", id)} />
        <RiskCards risk={summary.risk}
          onExternal={() => setSingle("internalExternal", "external")}
          onExternalAdmins={() => { setSingle("internalExternal", "external"); setSingle("adminMember", "admin"); }}
          onAdmins={() => setSingle("adminMember", "admin")}
          onPending={() => { /* status filter is a future dimension; no-op keeps the card clickable */ }} />
        <Rankings rankings={summary.rankings}
          onPickProject={(label, key) => { if (key) toggle("projectId", key); }}
          onPickRole={(label) => toggle("role", label)}
          onPickCompany={(label) => toggle("company", label)} />
        <Trends activityPerWeek={trends.activityPerWeek} accessAdded={trends.accessAdded} />
        <DetailTable
          rows={members.data?.rows as never[] ?? []}
          total={members.data?.total ?? 0}
          page={page} size={size} onPage={setPage}
          exportHref={exportHref} loading={members.isLoading} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Modify `page.tsx`** to render the new dashboard. Replace the whole file with:

```tsx
import { loadInstanceView } from "@/lib/server/accessInstanceView";
import { AccessAnalysisDashboard } from "../users/access-analysis/AccessAnalysisDashboard";
// NOTE: if you keep the new dashboard under app/(dashboard)/access-analysis/, import from "./AccessAnalysisDashboard" instead.

export const metadata = { title: "Access Analysis" };
export const dynamic = "force-dynamic";

export default async function AccessAnalysisRoute() {
  const view = await loadInstanceView();
  const projects = [...new Map(view.map((v) => [v.projectId, v.projectName])).entries()].map(([value, label]) => ({ value, label }));
  const companies = [...new Set(view.map((v) => v.company).filter(Boolean) as string[])].sort().map((c) => ({ value: c, label: c }));
  const roles = [...new Set(view.flatMap((v) => v.roles))].sort().map((r) => ({ value: r, label: r }));
  return (
    <AccessAnalysisDashboard
      filterOptions={{ projects, companies, roles }}
      projectTotal={1152}
    />
  );
}
```

> The new dashboard file lives at `app/(dashboard)/access-analysis/AccessAnalysisDashboard.tsx`, so from `app/(dashboard)/access-analysis/page.tsx` import it as `"./AccessAnalysisDashboard"`. Adjust the import line accordingly and delete the `../users/...` import.

- [ ] **Step 5: Run unit test, expect PASS** — `npx vitest run app/(dashboard)/access-analysis/__tests__/AccessAnalysisDashboard.test.tsx`.

- [ ] **Step 6: Run the full unit suite + typecheck**

Run: `npm test` → expect all green.
Run: `npx tsc --noEmit` → expect 0 errors.

- [ ] **Step 7: Manually verify in the browser**

Run the dev stack (`npm run dev:next`), open `http://localhost:3000/access-analysis`, confirm: counts populate, donuts render, module bars sorted with Datum empty, clicking a donut slice filters the whole page and a chip appears, table groups/exports.

- [ ] **Step 8: Commit**

```bash
git add "app/(dashboard)/access-analysis/AccessAnalysisDashboard.tsx" "app/(dashboard)/access-analysis/__tests__/AccessAnalysisDashboard.test.tsx" "app/(dashboard)/access-analysis/page.tsx"
git commit -m "feat(acc-redesign): assemble dashboard shell + swap route to new page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: E2E coverage

**Files:**
- Create: `tests/e2e/access-analysis-redesign.spec.ts`

- [ ] **Step 1: Write the E2E test** (follow the existing e2e auth/setup pattern in `tests/e2e/`; mirror how other specs mint the NextAuth cookie and set `NEXT_PUBLIC_ACC_GRAPH_TEST`)

```ts
import { test, expect } from "@playwright/test";

test.describe("access-analysis redesign", () => {
  test("loads, cross-filters on donut click, exports", async ({ page }) => {
    await page.goto("/access-analysis");
    await expect(page.getByText("Access")).toBeVisible();
    await expect(page.getByText("Members")).toBeVisible();

    // Cross-filter: click the External slice (canvas) via legend, expect a chip.
    await page.getByText("External", { exact: true }).first().click();
    await expect(page.getByText(/external/i)).toBeVisible();

    // Export link present and points at the CSV endpoint.
    const href = await page.getByRole("link", { name: /export csv/i }).getAttribute("href");
    expect(href).toContain("format=csv");

    // Clear all resets.
    await page.getByRole("button", { name: /clear all/i }).click();
  });
});
```

- [ ] **Step 2: Run E2E** — `npm run test:e2e` (runs on :3100; see project notes on the e2e harness). Expect the new spec to pass. If load-time flake occurs under machine load, re-run on an idle machine (known issue).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/access-analysis-redesign.spec.ts
git commit -m "test(acc-redesign): e2e load + cross-filter + export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 19: Remove the old graph surface (surgical)

**Files:**
- Delete: orphaned files under `app/(dashboard)/users/access-analysis/` that are no longer imported.
- Modify: any `../users/access-analysis/...` imports that remain.

- [ ] **Step 1: Find what the new route and the `/users` pages still import.**

Run: `npx knip --include files` and also grep:
Run: `git grep -l "users/access-analysis" -- "app" "lib" "server"`
Identify which `users/access-analysis/*` files are still referenced (e.g. by the `/users` profile panel) vs orphaned.

- [ ] **Step 2: Delete only confirmed orphans** (the cosmos.gl/DuckDB/Mosaic/slider files). Keep anything the `/users` profile panel still uses. Example (adjust to knip output):

```bash
git rm "app/(dashboard)/users/access-analysis/CosmosCanvasClient.ts" "app/(dashboard)/users/access-analysis/mathLayer.ts" # ...only confirmed orphans
```

- [ ] **Step 3: Re-run gates after deletion.**

Run: `npx tsc --noEmit` → 0 errors (proves nothing imported the deleted files).
Run: `npm test` → all green.
Run: `npx knip` → confirm no new unused-export explosions you introduced.

- [ ] **Step 4: Verify the old removed deps aren't referenced elsewhere before touching `package.json`.** Only if `knip` shows `@cosmos.gl/graph`, `@duckdb/duckdb-wasm`, `@uwdata/*`, `@sqlrooms/*`, `@nivo/*` are now fully unused AND no other route uses them, remove them in a separate, clearly-scoped commit. If unsure, leave them — dead deps are harmless; broken imports are not.

- [ ] **Step 5: Commit** (review staged paths carefully)

```bash
git diff --cached --name-only   # MUST be only intended deletions/edits
git commit -m "chore(acc-redesign): remove orphaned cosmos.gl/DuckDB graph files

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 20: Final verification

- [ ] **Step 1: Full gates.**

Run: `npm test` → all green.
Run: `npx tsc --noEmit` → 0 errors.
Run: `npm run lint` → no new errors.
Run: `npm run test:e2e` → green (or known load flake only).

- [ ] **Step 2: Manual UAT in browser** against the §13 open items (Projects label, risk cards, trend renderer) — adjust if the user wants changes.

- [ ] **Step 3: Build smoke.**

Run: `npm run build` → succeeds (this is also the deploy step — a rebuild ships the working tree).

---

## Self-review notes (author checklist — done)

- **Spec coverage:** Row 1 counts → Task 12. Row 2 composition → Task 12. Row 3 modules → Task 13. Row 4 risk → Task 13. Row 5 rankings → Task 14. Row 6 trends → Tasks 7+14. Row 7 table → Tasks 8+16. Premium interaction layer (§5) → Tasks 15+16. Cross-filter/state → Tasks 9+17. Removal → Task 19. Testing → throughout + Task 18.
- **Types consistent:** `AccessInstance`, `FilterState`, `SummaryDTO`, `ModuleId`, `Category` defined once in `types.ts` (Task 1) and used verbatim across tasks. Store keys (`toggle`/`setSingle`/`clearAll`/`activeCount`) match between Tasks 9, 15, 17. Endpoint shapes match the query hooks (Task 10) and consumers (Task 17).
- **Open items (spec §13):** Projects label defaults to "428 of 1,152" (Task 12 passes `projectTotal`); risk "Pending" card click is a no-op pending a `status` filter dimension (noted in Task 17) — add a `status` filter in a follow-up if the user wants it actionable.
```
