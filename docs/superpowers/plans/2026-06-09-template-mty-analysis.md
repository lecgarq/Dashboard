# Template MTY Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/template-mty` dashboard tab that mirrors `/access-analysis` but scoped to one ACC project template (ACC Template MTY, `def5fdea-8035-4b56-be60-66b36ba45149`): members table, roles donut, provisioned-modules donut, and the folder-permission terrain.

**Architecture:** Reuse the existing extractors (`extractAndPersistProjectData`, `extractAndPersistFolders`) to seed the template into the shared `AccProject*`/`AccFolder*` tables under a `type:"template"` marker, isolated from the main page by two surgical guards. The tab reads the seeded data from the DB. New pure code: a provisioned-modules summarizer and a template-overview builder; everything else reuses `summarizeRoles`, `RolesPieChart`, `FolderPermissionTerrain`, and `loadFolderPermissionTerrain`.

**Tech Stack:** Next.js App Router (server components + server actions), Prisma 7 (`@prisma/adapter-pg`), ECharts (`echarts-for-react`), Vitest, TypeScript. APS ACC Admin API via a 2-legged token.

**Conventions for every task:**
- Run one test file: `npx vitest run <path>`
- Typecheck: `npx tsc --noEmit`
- Stage by EXPLICIT PATH only (this branch has large uncommitted WIP). Before every commit run `git diff --cached --name-only` and confirm it lists ONLY the files named in that task.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Template constants

**Files:**
- Create: `lib/acc/template-mty.ts`

- [ ] **Step 1: Write the constants module**

```typescript
// lib/acc/template-mty.ts
//
// The single ACC project template this dashboard tab analyzes.
// A template is an Account-Admin "project template" (classification:"template"),
// reachable via the ACC Admin API like any project, but absent from the standard
// "list projects" sync — so it is seeded explicitly (see lib/acc/templateSync.ts).

/** ACC Template MTY — project-admin/template-settings/projects/<id>. */
export const TEMPLATE_MTY_ID = "def5fdea-8035-4b56-be60-66b36ba45149";
export const TEMPLATE_MTY_NAME = "ACC Template MTY";
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add lib/acc/template-mty.ts
git commit -m "feat(template-mty): add template id/name constants

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Provisioned-modules summarizer (pure)

Counts, for each ACC module, how many of the template's members are provisioned for it. Reuses `reduceModules` so the product-key → module mapping stays DRY.

**Files:**
- Create: `app/(dashboard)/template-mty/provisionedModules.ts`
- Test: `app/(dashboard)/template-mty/__tests__/provisionedModules.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// app/(dashboard)/template-mty/__tests__/provisionedModules.test.ts
import { describe, it, expect } from "vitest";
import { summarizeProvisionedModules } from "../provisionedModules";

describe("summarizeProvisionedModules", () => {
  it("returns an empty summary for no members", () => {
    expect(summarizeProvisionedModules([])).toEqual({ slices: [], total: 0, memberCount: 0 });
  });

  it("counts distinct members per module and maps keys to friendly names", () => {
    const s = summarizeProvisionedModules([
      { products: { docs: "member", build: "administrator" } },
      { products: { docs: "member", forma: "member" } },
    ]);
    expect(s.memberCount).toBe(2);
    // docs -> Data Management (2 members), build -> Build (1), forma -> Design (1)
    expect(s.slices).toEqual([
      { id: "dataManagement", name: "Data Management", value: 2 },
      { id: "build", name: "Build", value: 1 },
      { id: "design", name: "Design", value: 1 },
    ]);
    expect(s.total).toBe(4); // sum of member-grants across modules
  });

  it("ignores products with no access", () => {
    const s = summarizeProvisionedModules([{ products: { docs: "none", build: "" } }]);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.memberCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/provisionedModules.test.ts"`
Expected: FAIL — cannot find module `../provisionedModules`.

- [ ] **Step 3: Write the implementation**

```typescript
// app/(dashboard)/template-mty/provisionedModules.ts
import { reduceModules, moduleLabelById } from "@/app/(dashboard)/access-analysis/modules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

export interface ProvisionedModuleSlice {
  id: ModuleId;
  name: string;
  value: number; // number of members provisioned for this module
}

export interface ProvisionedModuleSummary {
  /** One slice per module that ≥1 member can access, sorted by member count desc. */
  slices: ProvisionedModuleSlice[];
  /** Sum of slice values (module-grants across all members) — donut percentage base. */
  total: number;
  /** Distinct members considered (the donut's centre figure). */
  memberCount: number;
}

/**
 * Summarise which ACC modules the template's members are provisioned for.
 *
 * `products` is the per-member tier map (e.g. `{ docs:"member", build:"administrator" }`)
 * stored on AccProjectMember. A product counts as "provisioned" when its tier is
 * anything other than none/empty (delegated to reduceModules). Each member is
 * counted once per module, so slice values are member counts.
 */
export function summarizeProvisionedModules(
  members: ReadonlyArray<{ products: Record<string, string> }>,
): ProvisionedModuleSummary {
  const counts = new Map<ModuleId, number>();
  for (const m of members) {
    const productRows = Object.entries(m.products ?? {}).map(([productKey, accessLevel]) => ({
      productKey,
      accessLevel: String(accessLevel ?? ""),
    }));
    const { modules } = reduceModules(productRows);
    for (const id of modules) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const slices = [...counts.entries()]
    .map(([id, value]) => ({ id, name: moduleLabelById(id), value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  return { slices, total, memberCount: members.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/provisionedModules.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/template-mty/provisionedModules.ts" "app/(dashboard)/template-mty/__tests__/provisionedModules.test.ts"
git commit -m "feat(template-mty): provisioned-modules summarizer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Template overview builder + loader

A pure `buildTemplateOverview()` (tested) plus a thin `loadTemplateOverview()` that runs the Prisma query and feeds the builder.

**Files:**
- Create: `lib/server/templateView.ts`
- Test: `lib/server/__tests__/templateView.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/server/__tests__/templateView.test.ts
import { describe, it, expect } from "vitest";
import { buildTemplateOverview, type TemplateMemberRow } from "@/lib/server/templateView";

const rows: TemplateMemberRow[] = [
  { name: "Alberto", email: "alberto.sanchez@hermosillo.com", companyName: "Hermosillo",
    products: { docs: "member", build: "administrator" }, projectAdmin: false, roleNames: ["Core"] },
  { name: "Luis", email: "luis.cortes@hermosillo.com", companyName: "Hermosillo",
    products: { docs: "member" }, projectAdmin: true, roleNames: ["VDC Innovacion"] },
  { name: "Guest", email: "guest@outside.com", companyName: "Outside Co",
    products: {}, projectAdmin: false, roleNames: [] },
];

describe("buildTemplateOverview", () => {
  it("assembles members, role/module summaries, company counts, and counts", () => {
    const o = buildTemplateOverview(rows, "2026-06-09T00:00:00.000Z");

    expect(o.memberCount).toBe(3);
    expect(o.syncedAt).toBe("2026-06-09T00:00:00.000Z");

    // internal/external derived from @hermosillo.com
    expect(o.members.map((m) => m.isInternal)).toEqual([true, true, false]);
    // admin from projectAdmin flag
    expect(o.members.map((m) => m.isAdmin)).toEqual([false, true, false]);

    // role summary: Core, VDC Innovacion, and one role-less -> Unknown
    expect(o.distinctRoles).toBe(2);
    expect(o.roleSummary.total).toBe(3);

    // companies grouped + counted, sorted by count desc
    expect(o.companies).toEqual([
      { name: "Hermosillo", value: 2 },
      { name: "Outside Co", value: 1 },
    ]);
    expect(o.companyCount).toBe(2);

    // module summary delegates to summarizeProvisionedModules
    expect(o.moduleSummary.memberCount).toBe(3);
    expect(o.moduleSummary.slices.find((s) => s.id === "dataManagement")?.value).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "lib/server/__tests__/templateView.test.ts"`
Expected: FAIL — cannot find module `@/lib/server/templateView`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/server/templateView.ts
import "server-only";
import { db } from "@/server/db";
import { summarizeRoles, type RoleSummary } from "@/app/(dashboard)/access-analysis/roleCounts";
import { reduceModules } from "@/app/(dashboard)/access-analysis/modules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";
import {
  summarizeProvisionedModules,
  type ProvisionedModuleSummary,
} from "@/app/(dashboard)/template-mty/provisionedModules";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

const INTERNAL_DOMAIN = "@hermosillo.com";

/** Raw per-member row as read from AccProjectMember (+ joined role names). */
export interface TemplateMemberRow {
  name: string;
  email: string;
  companyName: string | null;
  products: Record<string, string>;
  projectAdmin: boolean;
  roleNames: string[];
}

export interface TemplateMember {
  name: string;
  email: string;
  company: string | null;
  roleNames: string[];
  modules: ModuleId[];
  isInternal: boolean;
  isAdmin: boolean;
}

export interface TemplateOverview {
  members: TemplateMember[];
  roleSummary: RoleSummary;
  distinctRoles: number;
  moduleSummary: ProvisionedModuleSummary;
  companies: Array<{ name: string; value: number }>;
  memberCount: number;
  companyCount: number;
  syncedAt: string | null;
}

/** Pure assembly — unit-tested. No I/O. */
export function buildTemplateOverview(
  rows: TemplateMemberRow[],
  syncedAt: string | null,
): TemplateOverview {
  const members: TemplateMember[] = rows.map((r) => {
    const productRows = Object.entries(r.products ?? {}).map(([productKey, accessLevel]) => ({
      productKey,
      accessLevel: String(accessLevel ?? ""),
    }));
    const { modules } = reduceModules(productRows);
    return {
      name: r.name,
      email: r.email,
      company: r.companyName,
      roleNames: r.roleNames,
      modules,
      isInternal: r.email.toLowerCase().endsWith(INTERNAL_DOMAIN),
      isAdmin: r.projectAdmin,
    };
  });

  const roleSummary = summarizeRoles(rows.map((r) => ({ roles: r.roleNames })));
  const moduleSummary = summarizeProvisionedModules(rows);

  const companyCounts = new Map<string, number>();
  for (const r of rows) {
    const name = r.companyName ?? "Unknown company";
    companyCounts.set(name, (companyCounts.get(name) ?? 0) + 1);
  }
  const companies = [...companyCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  return {
    members,
    roleSummary,
    distinctRoles: roleSummary.distinctRoles,
    moduleSummary,
    companies,
    memberCount: rows.length,
    companyCount: companies.length,
    syncedAt,
  };
}

/** DB-backed loader: reads the seeded template members + roles, then builds. */
export async function loadTemplateOverview(): Promise<TemplateOverview> {
  const members = await db.accProjectMember.findMany({
    where: { projectId: TEMPLATE_MTY_ID },
    select: {
      name: true,
      email: true,
      companyName: true,
      products: true,
      projectAdmin: true,
      syncedAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
    orderBy: { name: "asc" },
  });

  const rows: TemplateMemberRow[] = members.map((m) => ({
    name: m.name,
    email: m.email,
    companyName: m.companyName,
    products: (m.products ?? {}) as Record<string, string>,
    projectAdmin: m.projectAdmin,
    roleNames: m.roles.map((r) => r.role.name),
  }));

  const syncedAt =
    members.reduce<Date | null>((max, m) => (!max || m.syncedAt > max ? m.syncedAt : max), null)?.toISOString() ?? null;

  return buildTemplateOverview(rows, syncedAt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "lib/server/__tests__/templateView.test.ts"`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/server/templateView.ts lib/server/__tests__/templateView.test.ts
git commit -m "feat(template-mty): template overview builder + loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Isolation guard #1 — soft-delete never deactivates templates

`extractAndPersistProjects` soft-deletes any active `AccProject` not in the live project list. Templates are never in that list, so the seeded row would be auto-deactivated on the next account sync. Exclude `type="template"` from the stale sweep.

**Files:**
- Modify: `lib/acc/quick-sync-extraction.ts` (the `findMany` in `extractAndPersistProjects`, ~line 132)
- Modify: `lib/acc/quick-sync-extraction.test.ts` (update existing expectation + add a new one)

- [ ] **Step 1: Update the existing test expectation and add a template-exclusion test**

In `lib/acc/quick-sync-extraction.test.ts`, find the assertion inside `it("calls updateMany with set-difference of stale IDs", …)`:

```typescript
    expect(prisma.accProject.findMany).toHaveBeenCalledWith({
      where: { status: "active", id: { notIn: ["p1", "p2"] } },
      select: { id: true },
    });
```

Replace it with (adds the template exclusion):

```typescript
    expect(prisma.accProject.findMany).toHaveBeenCalledWith({
      where: { status: "active", type: { not: "template" }, id: { notIn: ["p1", "p2"] } },
      select: { id: true },
    });
```

Then add this new test immediately after that `it(...)` block, still inside the `describe("extractAndPersistProjects soft-delete", …)`:

```typescript
  it("excludes type='template' rows from the stale sweep", async () => {
    const fresh = [makeProject("p1")];
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ results: fresh })));
    const prisma = buildPrismaMock([]);

    await extractAndPersistProjects(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-xyz",
      "token",
    );

    const whereArg = (prisma.accProject.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(whereArg).toMatchObject({ type: { not: "template" } });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/quick-sync-extraction.test.ts`
Expected: FAIL — `findMany` was called without `type: { not: "template" }`.

- [ ] **Step 3: Make the implementation change**

In `lib/acc/quick-sync-extraction.ts`, inside `extractAndPersistProjects`, find:

```typescript
  const staleRows = await prisma.accProject.findMany({
    where: { status: "active", id: { notIn: Array.from(freshIds) } },
    select: { id: true },
  });
```

Replace with (add `type: { not: "template" }`, plus a comment):

```typescript
  // Templates are seeded manually (lib/acc/templateSync.ts) and are never in the
  // live project list, so they must be excluded from the soft-delete sweep —
  // otherwise this would deactivate the template row on every account sync.
  const staleRows = await prisma.accProject.findMany({
    where: { status: "active", type: { not: "template" }, id: { notIn: Array.from(freshIds) } },
    select: { id: true },
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/quick-sync-extraction.test.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/quick-sync-extraction.ts lib/acc/quick-sync-extraction.test.ts
git commit -m "fix(template-mty): exclude templates from project soft-delete sweep

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Isolation guard #2 — keep templates off the main terrain picker

`loadTerrainProjects` (main Access Analysis page) lists every project with folder permissions. Add a SQL filter so the seeded template never appears there. This is a raw-SQL change verified by the post-seed manual check in Task 7 (no unit test — `$queryRaw` is not unit-testable without a DB).

**Files:**
- Modify: `lib/server/folderPermissionTerrainView.ts` (the `loadTerrainProjects` query, ~line 30)

- [ ] **Step 1: Make the change**

In `lib/server/folderPermissionTerrainView.ts`, inside `loadTerrainProjects`, find the first `$queryRaw` and its `JOIN "AccProject" p ON p.id = f."projectId"` line. Add a `WHERE` clause excluding templates. The full query becomes:

```typescript
    db.$queryRaw<Array<{ id: string; name: string; folder_count: number; perm_count: number }>>`
      SELECT p.id, p.name,
             COUNT(DISTINCT f.id)::int  AS folder_count,
             COUNT(DISTINCT fp.id)::int AS perm_count
      FROM "AccFolder" f
      JOIN "AccFolder" parent ON f."parentId" = parent.id AND parent.name = 'Project Files'
      JOIN "AccProject" p ON p.id = f."projectId"
      LEFT JOIN "AccFolderPermission" fp ON fp."folderId" = f.id
      WHERE p.type IS DISTINCT FROM 'template'
      GROUP BY p.id, p.name
      HAVING COUNT(DISTINCT fp.id) > 0
      ORDER BY perm_count DESC
    `,
```

(The only change is the new `WHERE p.type IS DISTINCT FROM 'template'` line before `GROUP BY`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/server/folderPermissionTerrainView.ts
git commit -m "fix(template-mty): exclude templates from main terrain project list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Template sync orchestrator

A small, testable orchestrator that seeds the template row and runs the existing member/role + folder extractors. It deliberately does NOT write the member cache (keeps `/users` clean).

**Files:**
- Create: `lib/acc/templateSync.ts`
- Test: `lib/acc/__tests__/templateSync.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/acc/__tests__/templateSync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the heavy extractors so the test exercises only the orchestration.
vi.mock("@/lib/acc/quick-sync-extraction", () => ({
  extractAndPersistProjectData: vi.fn(async () => {}),
}));
vi.mock("@/lib/acc/folderCrawl", () => ({
  extractAndPersistFolders: vi.fn(async () => ({ folderCount: 7, permissionCount: 21, status: "ok" })),
}));

import { syncTemplate } from "@/lib/acc/templateSync";
import { extractAndPersistProjectData } from "@/lib/acc/quick-sync-extraction";
import { extractAndPersistFolders } from "@/lib/acc/folderCrawl";
import { TEMPLATE_MTY_ID } from "@/lib/acc/template-mty";

describe("syncTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seeds the AccProject row as a template and runs both extractors", async () => {
    const upsert = vi.fn(async () => ({}));
    const prisma = { accProject: { upsert } };
    const refreshAccessToken = vi.fn(async () => "tok");

    const res = await syncTemplate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      "acct-1",
      "b.acct-1",
      "tok",
      { refreshAccessToken },
    );

    // AccProject seeded with the isolation marker
    const args = upsert.mock.calls[0][0] as {
      where: { id: string };
      create: { type: string; status: string };
      update: { type: string; status: string };
    };
    expect(args.where.id).toBe(TEMPLATE_MTY_ID);
    expect(args.create.type).toBe("template");
    expect(args.create.status).toBe("active");
    expect(args.update.type).toBe("template");

    // both extractors invoked for the template id
    expect(extractAndPersistProjectData).toHaveBeenCalledOnce();
    expect((extractAndPersistProjectData as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][2])
      .toMatchObject({ id: TEMPLATE_MTY_ID });
    expect(extractAndPersistFolders).toHaveBeenCalledOnce();

    expect(res).toEqual({ folders: 7, perms: 21 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/__tests__/templateSync.test.ts`
Expected: FAIL — cannot find module `@/lib/acc/templateSync`.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/acc/templateSync.ts
//
// Seeds ACC Template MTY into the shared AccProject*/AccFolder* tables and runs
// the existing member/role + folder extractors against it. The template is
// marked type:"template" so the two isolation guards (quick-sync soft-delete +
// loadTerrainProjects) keep it out of the main Access Analysis surfaces.
//
// Intentionally does NOT call writeMemberCacheFromAggregator — the template's
// members must not leak into /users / the access graph.

import type { PrismaClient } from "@prisma/client";
import {
  extractAndPersistProjectData,
  type MemberAggregator,
} from "@/lib/acc/quick-sync-extraction";
import { extractAndPersistFolders } from "@/lib/acc/folderCrawl";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";

export interface SyncTemplateResult {
  folders: number;
  perms: number;
}

export async function syncTemplate(
  prisma: PrismaClient,
  accountId: string,
  hubId: string,
  accessToken: string,
  opts: { refreshAccessToken: () => Promise<string> },
): Promise<SyncTemplateResult> {
  // 1. Seed/refresh the AccProject row (type:"template" = isolation marker).
  await prisma.accProject.upsert({
    where: { id: TEMPLATE_MTY_ID },
    create: { id: TEMPLATE_MTY_ID, accountId, name: TEMPLATE_MTY_NAME, type: "template", status: "active" },
    update: { accountId, name: TEMPLATE_MTY_NAME, type: "template", status: "active" },
  });

  // 2. Members + roles -> AccRole, AccProjectRole, AccProjectMember(products).
  const aggregator: MemberAggregator = new Map();
  await extractAndPersistProjectData(
    prisma,
    accountId,
    { id: TEMPLATE_MTY_ID, name: TEMPLATE_MTY_NAME },
    accessToken,
    aggregator,
  );

  // 3. Folders + permissions -> AccFolder, AccFolderPermission.
  const folderRes = await extractAndPersistFolders(
    prisma,
    hubId,
    { id: TEMPLATE_MTY_ID, accountId, name: TEMPLATE_MTY_NAME },
    accessToken,
    opts,
  );

  return { folders: folderRes.folderCount, perms: folderRes.permissionCount };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/acc/__tests__/templateSync.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add lib/acc/templateSync.ts lib/acc/__tests__/templateSync.test.ts
git commit -m "feat(template-mty): template sync orchestrator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Sync script + seed the real data

A CJS runner that resolves the hub/account id + 2-legged token and invokes `syncTemplate`. Then run it once to populate the DB and verify.

**Files:**
- Create: `scripts/template-sync.cjs`

- [ ] **Step 1: Write the script**

```javascript
// scripts/template-sync.cjs
//
// Seed + refresh ACC Template MTY (members, roles, companies, folders, perms).
// Uses a 2-legged APS token (no interactive login). Re-runnable any time.
//
//   node scripts/template-sync.cjs

require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";

function ts() { return new Date().toISOString(); }
function log(...a) { console.log(`[template-sync ${ts()}]`, ...a); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function fetchToken() {
  const clientId = process.env.APS_CLIENT_ID && process.env.APS_CLIENT_ID.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET && process.env.APS_CLIENT_SECRET.trim();
  if (!clientId || !clientSecret) throw new Error("APS_CLIENT_ID / APS_CLIENT_SECRET not configured");
  const body = new URLSearchParams({
    grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret,
    scope: "account:read data:read data:create",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) throw new Error(`Autodesk token fetch failed: HTTP ${res.status} ${raw}`);
  return json.access_token;
}

async function main() {
  const prisma = createPrisma();
  try {
    const hubRow = await prisma.project.findFirst({ select: { apsHubId: true } });
    if (!hubRow || !hubRow.apsHubId) throw new Error("Project.apsHubId is not configured");
    const hubId = String(hubRow.apsHubId);          // b.-prefixed (Data Management)
    const accountId = hubId.replace(/^b\./, "");     // bare UUID (ACC Admin)
    log(`hubId=${hubId} accountId=${accountId}`);

    const token = await fetchToken();
    log("token acquired.");

    const { syncTemplate } = require("../lib/acc/templateSync.ts");
    const res = await syncTemplate(prisma, accountId, hubId, token, { refreshAccessToken: fetchToken });
    log(`done: folders=${res.folders} perms=${res.perms}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error("[template-sync] fatal:", e && e.message ? e.message : e); process.exit(1); });
```

- [ ] **Step 2: Run the sync to seed real data**

Run: `node scripts/template-sync.cjs`
Expected: log lines ending with `done: folders=<N> perms=<M>` and exit 0. (N may be 0 if the template has no configured folder tree — acceptable; the page still renders members + pies.)

- [ ] **Step 3: Verify the seeded data and isolation**

Run:
```bash
node -e "const {Client}=require('pg');(async()=>{const c=new Client({connectionString:'postgresql://postgres@127.0.0.1:5432/dashboard'});await c.connect();const ID='def5fdea-8035-4b56-be60-66b36ba45149';for(const[l,q]of[['proj','SELECT type,status FROM \"AccProject\" WHERE id=$1'],['members','SELECT count(*)::int n FROM \"AccProjectMember\" WHERE \"projectId\"=$1'],['roles','SELECT count(*)::int n FROM \"AccProjectRole\" WHERE \"projectId\"=$1'],['folders','SELECT count(*)::int n FROM \"AccFolder\" WHERE \"projectId\"=$1']]){const r=await c.query(q,[ID]);console.log(l,JSON.stringify(r.rows[0]||null));}await c.end();})().catch(e=>{console.error(e.message);process.exit(1);});"
```
Expected: `proj {"type":"template","status":"active"}`, `members {"n":4}`, `roles` ≥ 2, `folders` ≥ 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/template-sync.cjs
git commit -m "feat(template-mty): sync script (2-leg seed of members/roles/folders)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `singleProject` prop on FolderPermissionTerrain

Lets the template tab reuse the terrain without the Single/Compare/Overview chrome (those need multiple projects). Additive + backwards-compatible (default `false`).

**Files:**
- Modify: `app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx` (props ~line 181-188; header controls ~line 291, 294)

- [ ] **Step 1: Add the prop**

Find the component signature:

```typescript
export function FolderPermissionTerrain({
  projects, initial, loadTerrain, loadOverview,
}: {
  projects: TerrainProjectOption[];
  initial: FolderTerrainData | null;
  loadTerrain: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
}) {
```

Replace with:

```typescript
export function FolderPermissionTerrain({
  projects, initial, loadTerrain, loadOverview, singleProject = false,
}: {
  projects: TerrainProjectOption[];
  initial: FolderTerrainData | null;
  loadTerrain: (projectId: string) => Promise<FolderTerrainData | null>;
  loadOverview?: () => Promise<FolderTerrainData | null>;
  // When true: lock to single-project mode and hide the mode toggle + project
  // picker (used by the Template MTY tab, which has exactly one "project").
  singleProject?: boolean;
}) {
```

- [ ] **Step 2: Hide the mode toggle when singleProject**

Find (header block, ~line 291):

```typescript
          <ModeToggle mode={mode} hasOverview={!!loadOverview} onChange={(m) => { clear(); setMode(m); }} />
```

Replace with:

```typescript
          {!singleProject && (
            <ModeToggle mode={mode} hasOverview={!!loadOverview} onChange={(m) => { clear(); setMode(m); }} />
          )}
```

- [ ] **Step 3: Hide the project picker when singleProject**

Find (~line 294):

```typescript
              <ProjectSelect projects={projects} value={singleId} onChange={(id) => { clear(); setSingleId(id); }} disabled={busy} />
```

Replace with:

```typescript
              {!singleProject && (
                <ProjectSelect projects={projects} value={singleId} onChange={(id) => { clear(); setSingleId(id); }} disabled={busy} />
              )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Confirm no existing terrain test broke**

Run: `npx vitest run "app/(dashboard)/access-analysis/__tests__/FolderPermissionTerrain.test.tsx"`
Expected: PASS (the prop is optional; existing callers unaffected).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/access-analysis/components/FolderPermissionTerrain.tsx"
git commit -m "feat(template-mty): singleProject mode for FolderPermissionTerrain

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Provisioned-modules donut component

A focused donut on the generic `EChart` wrapper (the activity-specific `ModulesPieChart` is not reused — its summary shape is activity-bound).

**Files:**
- Create: `app/(dashboard)/template-mty/components/ProvisionedModulesPieChart.tsx`

- [ ] **Step 1: Write the component**

```typescript
// app/(dashboard)/template-mty/components/ProvisionedModulesPieChart.tsx
"use client";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { EChart } from "@/app/(dashboard)/access-analysis/components/EChart";
import type { EChartsOption } from "echarts";
import type { ProvisionedModuleSummary } from "../provisionedModules";
import type { ModuleId } from "@/app/(dashboard)/access-analysis/types";

// One stable colour per module id (matches the activity donut's palette).
const MODULE_COLORS: Record<ModuleId, string> = {
  dataManagement: "#6366f1",
  insight: "#facc15",
  build: "#f59e0b",
  modelCoordination: "#38bdf8",
  designCollaboration: "#34d399",
  preconstruction: "#a78bfa",
  design: "#2dd4bf",
  autospecs: "#c084fc",
  datum: "#fb7185",
};
const colorFor = (id: ModuleId) => MODULE_COLORS[id] ?? "#888";

function fmtPct(value: number, total: number): string {
  if (!total) return "0%";
  const p = (value / total) * 100;
  if (p > 0 && p < 0.1) return "<0.1%";
  return `${p.toFixed(1)}%`;
}

export function ProvisionedModulesPieChart({ summary }: { summary: ProvisionedModuleSummary }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme !== "light";
  const { slices, total, memberCount } = summary;

  const cTitle = dark ? "#fafafa" : "#111827";
  const cSub = dark ? "#a1a1aa" : "#6b7280";
  const cTipBg = dark ? "rgba(24,24,27,0.96)" : "rgba(255,255,255,0.98)";
  const cTipBorder = dark ? "#3f3f46" : "#e5e7eb";
  const cTipText = dark ? "#e4e4e7" : "#374151";
  const cSlice = dark ? "#18181b" : "#ffffff";
  const cShadow = dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.12)";

  const option = useMemo<EChartsOption>(() => ({
    title: [
      {
        text: "",
        subtext: `${slices.length} modules · ${memberCount} members`,
        left: "center", top: 0, subtextStyle: { color: cSub, fontSize: 12 },
      },
      {
        text: memberCount.toLocaleString(),
        subtext: "members",
        left: "center", top: "45%", textAlign: "center",
        textStyle: { color: cTitle, fontSize: 32, fontWeight: 700 },
        subtextStyle: { color: cSub, fontSize: 13 },
      },
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: cTipBg, borderColor: cTipBorder, borderWidth: 1, padding: [8, 12],
      textStyle: { color: cTipText },
      extraCssText: "border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.35);",
      formatter: `<div style='font-weight:700;color:${cTitle};margin-bottom:2px'>{b}</div><div style='color:${cSub}'>{c} members</div>`,
    },
    legend: { show: false },
    series: [
      {
        name: "Modules",
        type: "pie",
        radius: ["56%", "80%"],
        center: ["50%", "52%"],
        padAngle: 2,
        minAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: cSlice, borderWidth: 3, borderRadius: 7, shadowBlur: 14, shadowColor: cShadow },
        emphasis: { focus: "self", scaleSize: 12, label: { show: true, formatter: "{b}\n{c}", fontSize: 13, fontWeight: 700, color: cTitle } },
        data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: colorFor(s.id) } })),
      },
    ],
  }), [slices, memberCount, cTitle, cSub, cTipBg, cTipBorder, cTipText, cSlice, cShadow]);

  if (slices.length === 0) {
    return (
      <div className="flex h-[460px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
        No module access found.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft-xl">
      <EChart option={option} height={400} notMerge={false} />
      <ul data-testid="provisioned-module-legend" className="mt-3 list-none border-t border-border pt-3"
          style={{ columnWidth: "248px", columnGap: "1.5rem" }}>
        {slices.map((s) => {
          const barPct = total > 0 ? (s.value / total) * 100 : 0;
          const color = colorFor(s.id);
          return (
            <li key={s.id} className="mb-1 break-inside-avoid">
              <div className="relative flex min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-xs text-foreground/85"
                   title={`${s.name} — ${s.value} members provisioned`}>
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-md"
                      style={{ width: `${barPct}%`, background: color, opacity: 0.16 }} />
                <span className="relative h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} />
                <span className="relative flex-1 truncate">{s.name}</span>
                <span className="relative shrink-0 tabular-nums text-foreground">{s.value}</span>
                <span className="relative w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                  {fmtPct(s.value, total)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add "app/(dashboard)/template-mty/components/ProvisionedModulesPieChart.tsx"
git commit -m "feat(template-mty): provisioned-modules donut

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Members table component

**Files:**
- Create: `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx`
- Test: `app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TemplateMembersTable } from "../components/TemplateMembersTable";
import type { TemplateMember } from "@/lib/server/templateView";

const members: TemplateMember[] = [
  { name: "Alberto", email: "alberto.sanchez@hermosillo.com", company: "Hermosillo",
    roleNames: ["Core"], modules: ["dataManagement", "build"], isInternal: true, isAdmin: true },
  { name: "Guest", email: "guest@outside.com", company: "Outside Co",
    roleNames: [], modules: [], isInternal: false, isAdmin: false },
];

describe("TemplateMembersTable", () => {
  it("renders one row per member with name, email, role, and company", () => {
    render(<TemplateMembersTable members={members} />);
    expect(screen.getByText("Alberto")).toBeInTheDocument();
    expect(screen.getByText("alberto.sanchez@hermosillo.com")).toBeInTheDocument();
    expect(screen.getByText("Core")).toBeInTheDocument();
    expect(screen.getAllByText("Hermosillo").length).toBeGreaterThan(0);
    expect(screen.getByText("Guest")).toBeInTheDocument();
    // role-less member shows the placeholder
    expect(screen.getByText("No role")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx"`
Expected: FAIL — cannot find module `../components/TemplateMembersTable`.

- [ ] **Step 3: Write the component**

```typescript
// app/(dashboard)/template-mty/components/TemplateMembersTable.tsx
import type { TemplateMember } from "@/lib/server/templateView";

export function TemplateMembersTable({ members }: { members: TemplateMember[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
        No members found for this template.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft-xl">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2 font-medium">Member</th>
            <th className="px-4 py-2 font-medium">Role(s)</th>
            <th className="px-4 py-2 font-medium">Company</th>
            <th className="px-4 py-2 font-medium">Origin</th>
            <th className="px-4 py-2 text-right font-medium">Modules</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.email} className="border-b border-border/60 last:border-0 hover:bg-accent/40">
              <td className="px-4 py-2">
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {m.name}
                    {m.isAdmin && (
                      <span className="ml-2 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Admin
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.email}</span>
                </div>
              </td>
              <td className="px-4 py-2 text-foreground/90">
                {m.roleNames.length > 0 ? m.roleNames.join(", ") : <span className="text-muted-foreground">No role</span>}
              </td>
              <td className="px-4 py-2 text-foreground/90">{m.company ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  m.isInternal ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}>
                  {m.isInternal ? "Internal" : "External"}
                </span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{m.modules.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx"`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/template-mty/components/TemplateMembersTable.tsx" "app/(dashboard)/template-mty/__tests__/TemplateMembersTable.test.tsx"
git commit -m "feat(template-mty): members table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Client shell

Composes the header + members table + two donuts + folder terrain.

**Files:**
- Create: `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx`

- [ ] **Step 1: Write the component**

```typescript
// app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx
"use client";
import { RolesPieChart } from "@/app/(dashboard)/access-analysis/components/RolesPieChart";
import { FolderPermissionTerrain } from "@/app/(dashboard)/access-analysis/components/FolderPermissionTerrain";
import { loadTerrainForProject } from "@/app/(dashboard)/access-analysis/folderTerrainActions";
import type { FolderTerrainData, TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import type { TemplateOverview } from "@/lib/server/templateView";
import { ProvisionedModulesPieChart } from "./ProvisionedModulesPieChart";
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
  overview, terrain, terrainOption,
}: {
  overview: TemplateOverview;
  terrain: FolderTerrainData | null;
  terrainOption: TerrainProjectOption;
}) {
  const freshness = overview.syncedAt
    ? new Date(overview.syncedAt).toLocaleString()
    : "not synced yet";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-primary">Template</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.memberCount}</b> members</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.distinctRoles}</b> roles</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5"><b className="text-foreground">{overview.companyCount}</b> companies</span>
        <span className="rounded-md bg-muted/50 px-2 py-0.5">synced {freshness}</span>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Project members" subtitle="Everyone configured on this template, with their roles, company, and module access." />
        <TemplateMembersTable members={overview.members} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Role distribution" subtitle="Roles held across the template's members." />
        <RolesPieChart data={overview.roleSummary.slices} distinctRoles={overview.distinctRoles} />
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Provisioned modules" subtitle="How many members are granted each ACC tool in the template." />
        <ProvisionedModulesPieChart summary={overview.moduleSummary} />
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

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: PASS.

```bash
git add "app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx"
git commit -m "feat(template-mty): client shell composing the tab

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Route page + nav entry + final verification

**Files:**
- Create: `app/(dashboard)/template-mty/page.tsx`
- Modify: `components/layout/navigation.ts` (imports + `MODULE_NAV_ITEMS`)
- Modify: `components/layout/navigation.test.ts` (add assertion for the new item)

- [ ] **Step 1: Write the page**

```typescript
// app/(dashboard)/template-mty/page.tsx
import { loadTemplateOverview } from "@/lib/server/templateView";
import { loadFolderPermissionTerrain } from "@/lib/server/folderPermissionTerrainView";
import { TEMPLATE_MTY_ID, TEMPLATE_MTY_NAME } from "@/lib/acc/template-mty";
import type { TerrainProjectOption } from "@/app/(dashboard)/access-analysis/folderTerrain";
import { TemplateAnalysisCharts } from "./components/TemplateAnalysisCharts";

export const metadata = { title: "Template MTY" };
export const dynamic = "force-dynamic";

export default async function TemplateMtyRoute() {
  const [overview, terrain] = await Promise.all([
    loadTemplateOverview(),
    loadFolderPermissionTerrain(TEMPLATE_MTY_ID),
  ]);

  const terrainOption: TerrainProjectOption = {
    id: TEMPLATE_MTY_ID,
    name: TEMPLATE_MTY_NAME,
    office: terrain?.office ?? "",
    folderCount: terrain?.folders.length ?? 0,
    permCount: terrain?.cells.length ?? 0,
    userRoleCount: terrain?.maxUserCount ?? 0,
  };

  const notSynced = overview.memberCount === 0;

  return (
    <div className="h-full overflow-y-auto text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
            ACC · Template Analysis
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{TEMPLATE_MTY_NAME}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Members, roles, companies, provisioned modules, and folder permissions for the
            ACC Template MTY project template.
          </p>
        </header>

        {notSynced ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            This template hasn&apos;t been synced yet. Run <code className="rounded bg-muted px-1.5 py-0.5">node scripts/template-sync.cjs</code> to populate its data.
          </div>
        ) : (
          <TemplateAnalysisCharts overview={overview} terrain={terrain} terrainOption={terrainOption} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the nav item**

In `components/layout/navigation.ts`, add `LayoutTemplate` to the lucide import block:

```typescript
import {
  Building2,
  ClipboardCheck,
  LayoutDashboard,
  LayoutTemplate,
  PieChart,
  Ruler,
  Settings,
  Kanban,
  RefreshCw,
  Zap,
  Cpu,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";
```

Then add this item to `MODULE_NAV_ITEMS`, immediately after the `/access-analysis` entry:

```typescript
  { href: "/template-mty", label: "Template MTY", icon: LayoutTemplate, group: "Organization" },
```

- [ ] **Step 3: Extend the nav test**

In `components/layout/navigation.test.ts`, add this assertion inside the existing `it(...)`'s `arrayContaining([...])` list (after the spatial-graph line):

```typescript
        expect.objectContaining({ href: "/template-mty", label: "Template MTY" }),
```

- [ ] **Step 4: Run the nav test**

Run: `npx vitest run components/layout/navigation.test.ts`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run each and confirm:
- `npx tsc --noEmit` → PASS (0 errors)
- `npm test` → PASS (whole suite green, including the 4 new test files)
- `npx eslint "app/(dashboard)/template-mty" lib/acc/templateSync.ts lib/server/templateView.ts` → no errors

- [ ] **Step 6: Manual check (real app)**

Per project deploy mechanics, rebuild and load the app, then:
- Navigate to **Template MTY** in the Organization nav group.
- Confirm: header counts (4 members / 2 roles / 1 company), members table lists the 4 members, Role distribution donut shows Core + VDC Innovacion, Provisioned modules donut shows the ACC tools, folder terrain renders (or shows its empty state if the template has no folder tree) with NO Single/Compare/Overview toggle.
- Navigate to **Access Analysis** and confirm the template does NOT appear in its folder-terrain project picker.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/template-mty/page.tsx" components/layout/navigation.ts components/layout/navigation.test.ts
git commit -m "feat(template-mty): route page + nav entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes for the implementer

- **Surgical staging:** this branch carries large uncommitted WIP. NEVER `git add -A`/`git add .`. Stage only the explicit paths in each task and check `git diff --cached --name-only` before committing.
- **`AccProjectMember.products`** is a Prisma `Json` column; it returns the per-member tier map (`{ docs:"member", … }`). The loader coerces it with `as Record<string, string>`.
- **Folder count may be 0** if the template has no configured folder tree — that is acceptable; the page still renders members + both donuts, and the terrain shows its own empty state.
- **Re-running the sync** (`node scripts/template-sync.cjs`) refreshes all template data; the weekly folder-crawl cron also keeps the template's folders fresh once seeded (it crawls active `AccProject` rows, and the template is active).
