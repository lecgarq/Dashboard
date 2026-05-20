# Access Graph — Workstream 1: Data Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-source the access-analysis graph from the Data Connector snapshot (`AccDc*`) and feed every approved dimension (project, model/product, role, firm, admin/member, internal/external, account status, permission tier + coverage) into the existing similarity/feature pipeline — without yet changing edge rendering, clustering, or layout.

**Architecture:** The graph's data chain is: `trpc.users.bulkAccSummary` (server, reads `AccMemberCache`) → `BulkAccUser[]` → `buildGraphArrowTables` + `buildSimilarityInputFromUsers` (client, `graphTables.ts`) → DuckDB Arrow tables/views (`graphSql.ts`) → `featureSnapshot.ts` → predicate engine. This plan swaps the server source to `AccDc*`, extends `BulkAccUser` with the new fields, and stops dropping `moduleIds/isAdmin/isExternal/firm/activity` in the similarity input. Edge/cluster/layout consumers are out of scope (Workstreams 2+).

**Tech Stack:** Next.js (App Router), tRPC, Prisma (Postgres), DuckDB-wasm + Apache Arrow (browser), Vitest.

**Spec:** `docs/superpowers/specs/2026-05-20-access-graph-dimension-model-design.md`

> **Source correction:** The user brief said "read from AccDc* instead of the empty AccProjectMember." The graph does NOT currently read `AccProjectMember` (which is empty AND unused). It reads `AccMemberCache` JSON blobs via `users.bulkAccSummary` (`server/routers/users.ts:809`). The real migration is **`AccMemberCache` → `AccDc*`**.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `lib/acc/acc-types.ts` | `BulkAccUser` shape | Add `firmId/firmName`, `accountStatus`, `permissionCoverage`, per-project `crawlStatus`, `permissionContexts[]` + `PermissionContext` type; keep additive |
| `server/routers/acc-dc-graph.ts` | NEW: assemble `BulkAccUser[]` from `AccDc*` + folder permissions | Create `accDcGraphRouter.bulkUsers` |
| `server/routers/root.ts` | Router registration | Register `accDcGraph` |
| `lib/acc/dcUserAssembly.ts` | NEW: pure assembler `rows → BulkAccUser[]` incl. permission contexts + tier normalization | Pure, fully unit-tested |
| `app/(dashboard)/users/access-analysis/graphTables.ts` | Similarity input + Arrow tables | Populate dropped inputs; add firm + coverage columns |
| `lib/acc/userSimilarity.ts` | Similarity dims | Add `firm-affiliation` dim + `firmId` on `SimilarityUser` |
| `app/(dashboard)/users/access-analysis/interactionTypes.ts` | `NodeFeatureSnapshot` | Add `permissionCoverage`, `firmName`, `accountStatus` |
| `app/(dashboard)/users/access-analysis/featureSnapshot.ts` | DuckDB read → snapshot | Surface coverage/firm/status |
| `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` | Page wiring | Point feed at new `bulkUsers` query |

---

## Task 1: Reconcile node population (spike + decision gate)

**Goal:** Decide which users are graph nodes — the `AccMemberCache`-derived 1,223 (882 ACC + 341 directory) or the DC universe of 3,367 — before writing the assembler. This blocks all later tasks.

**Files:**
- Create: `docs/superpowers/plans/notes/ws1-population-decision.md` (findings + decision)

- [ ] **Step 1: Run the population comparison queries**

Use a throwaway script in the project root (so `pg` resolves), then delete it:

```js
// _pop.cjs
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:5432/dashboard' });
  await c.connect();
  const q = async (l, s) => { const r = await c.query(s); console.log('\n###', l); console.table(r.rows); };
  await q('AccMemberCache found-vs-total', `SELECT COUNT(*) total FROM "AccMemberCache"`);
  await q('AccDcUser', `SELECT COUNT(*) n, COUNT(*) FILTER (WHERE status='active') active FROM "AccDcUser"`);
  await q('In DC not in cache', `SELECT COUNT(*) n FROM "AccDcUser" d LEFT JOIN "AccMemberCache" m ON lower(m.email)=lower(d.email) WHERE m.email IS NULL`);
  await q('In cache not in DC', `SELECT COUNT(*) n FROM "AccMemberCache" m LEFT JOIN "AccDcUser" d ON lower(d.email)=lower(m.email) WHERE d.email IS NULL`);
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
```

Run: `node _pop.cjs && rm -f _pop.cjs`

- [ ] **Step 2: Apply the decision rule**

Decision rule (record the outcome in the notes file):
- **Use the DC project-member universe** — defined as **"DC users with project membership"**: a user is a node only if they exist in `AccDcUser` AND have ≥1 `AccDcProjectUser` row. This is NOT simply "all 3,367 AccDcUser rows"; orphan DC users (no project membership) are excluded.
- Rationale: every approved dimension (products, roles, company, status) is keyed on DC `userId`, and a user with no project membership has no relationships to draw.
- Keep registered-but-non-ACC `User` rows OUT of the graph (they have no ACC relationships); they belong to the directory list, not the relationship graph.
- Expected node count = "DC users with ≥1 project membership" — report the actual figure from Step 1, do **not** assert ~3,367.

- [ ] **Step 3: Write the decision note and commit**

Record counts + the chosen population in `ws1-population-decision.md`.

```bash
git add docs/superpowers/plans/notes/ws1-population-decision.md
git commit -m "docs(access-graph): record WS1 node-population decision (DC universe)"
```

**Checkpoint:** Confirm the decision with the user before proceeding (population choice changes every downstream count).

---

## Task 2: Extend the `BulkAccUser` type (additive)

**Files:**
- Modify: `lib/acc/acc-types.ts`

- [ ] **Step 1: Add the new optional fields**

In `BulkAccUser`, add (keep all additive so existing consumers compile):

```ts
  /** DC company affiliation (firm), not the free-text job title. */
  firmId?: string | null;
  firmName?: string | null;
  /** AccDcUser.status — account status, NOT recent activity. */
  accountStatus?: "active" | "inactive" | null;
  /**
   * Folder-permission crawl coverage for THIS user, aggregated across their projects:
   * "known"   = all their projects are folder-crawled
   * "partial" = some crawled, some not
   * "unknown" = none crawled
   */
  permissionCoverage?: "known" | "partial" | "unknown";
```

In the per-project type (`projects[]` element), add:

```ts
  /** AccProject.folderCrawlStatus for this project: "ok" | "never" | "partial" | "failed" | "inaccessible". */
  crawlStatus?: string;
```

Add a `PermissionContext` type and a user-level array (the raw contextual permission facts WS2 needs to build shared folder + permission-tier edges — coverage alone is insufficient):

```ts
export interface PermissionContext {
  projectId: string;
  folderId: string;
  folderPath: string;
  /** Raw APS value, e.g. "View Only" | "View+Download+Upload+Edit" | "Full Controller". */
  permType: string;
  /** Normalized rank: "view" | "download" | "upload" | "edit" | "control". */
  permissionTier: string;
  /** Raw APS actions array if available. */
  actions: string[];
  /** Folder-crawl status for the owning project. */
  crawlStatus: string;
  /** The role that granted this permission (permissions attach to roles, not users directly). */
  roleId: string;
}
```

And on `BulkAccUser`:

```ts
  /** Raw contextual permission facts (one per user-role-folder grant). Empty when uncrawled. */
  permissionContexts?: PermissionContext[];
```

- [ ] **Step 2: Verify type compiles**

Run: `npx tsc --noEmit`
Expected: no NEW errors referencing `acc-types.ts` (pre-existing unrelated warnings may remain).

- [ ] **Step 3: Commit**

```bash
git add lib/acc/acc-types.ts
git commit -m "feat(access-graph): extend BulkAccUser with firm, account status, permission coverage"
```

---

## Task 3: Pure DC assembler (`dcUserAssembly.ts`)

**Goal:** A pure function turning DC query rows into `BulkAccUser[]`, fully unit-testable with no DB.

**Files:**
- Create: `lib/acc/dcUserAssembly.ts`
- Test: `lib/acc/dcUserAssembly.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { assembleDcUsers, type DcAssemblyInput } from "./dcUserAssembly";

const base: DcAssemblyInput = {
  users: [{ id: "u1", email: "a@lecg.com", name: "Ana", status: "active", companyId: "c1" }],
  projectUsers: [{ projectId: "p1", userId: "u1" }],
  projectUserRoles: [{ projectId: "p1", userId: "u1", roleId: "Architect" }],
  projectUserProducts: [{ projectId: "p1", userId: "u1", productKey: "build", accessLevel: "project_admin" }],
  companies: [{ id: "c1", name: "LECG" }],
  roleNames: { Architect: "Architect" },
  projectMeta: { p1: { name: "Proj One", status: "active", crawlStatus: "ok" } },
};

describe("assembleDcUsers", () => {
  it("assembles one BulkAccUser per DC user with project membership", () => {
    const out = assembleDcUsers(base);
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe("a@lecg.com");
    expect(out[0].firmName).toBe("LECG");
    expect(out[0].accountStatus).toBe("active");
    expect(out[0].projects[0]).toMatchObject({ id: "p1", name: "Proj One", crawlStatus: "ok" });
  });

  it("marks admin from product accessLevel=project_admin", () => {
    const out = assembleDcUsers(base);
    expect(out[0].projects[0].isAdmin).toBe(true);
    expect(out[0].adminCount).toBe(1);
  });

  it("derives permissionCoverage from project crawl status", () => {
    const partial = { ...base, projectUsers: [
      { projectId: "p1", userId: "u1" }, { projectId: "p2", userId: "u1" },
    ], projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "ok" }, p2: { name: "P2", status: "active", crawlStatus: "never" } } };
    expect(assembleDcUsers(partial)[0].permissionCoverage).toBe("partial");
    expect(assembleDcUsers(base)[0].permissionCoverage).toBe("known");
  });

  it("excludes DC users with no project membership", () => {
    const orphan = { ...base, projectUsers: [] };
    expect(assembleDcUsers(orphan)).toHaveLength(0);
  });

  it("flags external users by non-lecg email domain", () => {
    const ext = { ...base, users: [{ id: "u1", email: "x@vendor.com", name: "X", status: "active", companyId: "c1" }] };
    expect(assembleDcUsers(ext)[0].isExternal).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: FAIL — `assembleDcUsers` not defined.

- [ ] **Step 3: Implement the assembler**

```ts
import type { BulkAccUser } from "./acc-types";

export interface DcAssemblyInput {
  users: { id: string; email: string | null; name: string | null; status: string | null; companyId: string | null; lastSignIn?: string | null }[];
  projectUsers: { projectId: string; userId: string }[];
  projectUserRoles: { projectId: string; userId: string; roleId: string }[];
  projectUserProducts: { projectId: string; userId: string; productKey: string; accessLevel: string }[];
  companies: { id: string; name: string }[];
  roleNames: Record<string, string>;
  projectMeta: Record<string, { name: string; status: string; crawlStatus: string }>;
}

const BASELINE_PRODUCTS = new Set(["docs", "insight"]);

function coverageFor(statuses: string[]): "known" | "partial" | "unknown" {
  if (statuses.length === 0) return "unknown";
  const crawled = statuses.filter((s) => s === "ok" || s === "partial").length;
  if (crawled === 0) return "unknown";
  if (crawled === statuses.length) return "known";
  return "partial";
}

export function assembleDcUsers(input: DcAssemblyInput): BulkAccUser[] {
  const companyName = new Map(input.companies.map((c) => [c.id, c.name]));
  const membersByUser = new Map<string, Set<string>>();
  for (const pu of input.projectUsers) {
    const set = membersByUser.get(pu.userId) ?? new Set<string>();
    set.add(pu.projectId);
    membersByUser.set(pu.userId, set);
  }
  const rolesByUserProject = new Map<string, Set<string>>();
  for (const r of input.projectUserRoles) {
    const k = `${r.userId}::${r.projectId}`;
    const set = rolesByUserProject.get(k) ?? new Set<string>();
    set.add(input.roleNames[r.roleId] ?? r.roleId);
    rolesByUserProject.set(k, set);
  }
  const prodByUserProject = new Map<string, { key: string; admin: boolean }[]>();
  for (const p of input.projectUserProducts) {
    const k = `${p.userId}::${p.projectId}`;
    const arr = prodByUserProject.get(k) ?? [];
    arr.push({ key: p.productKey, admin: p.accessLevel === "project_admin" });
    prodByUserProject.set(k, arr);
  }

  const out: BulkAccUser[] = [];
  for (const u of input.users) {
    const projectIds = membersByUser.get(u.id);
    if (!projectIds || projectIds.size === 0) continue; // exclude orphans (Task 1 rule)
    const email = (u.email ?? "").toLowerCase();
    const projects = [...projectIds].map((pid) => {
      const meta = input.projectMeta[pid] ?? { name: pid, status: "unknown", crawlStatus: "never" };
      const prods = prodByUserProject.get(`${u.id}::${pid}`) ?? [];
      const roles = [...(rolesByUserProject.get(`${u.id}::${pid}`) ?? [])];
      const isAdmin = prods.some((p) => p.admin);
      return {
        id: pid, name: meta.name, status: meta.status, isAdmin,
        roles, modules: prods.map((p) => p.key),
        crawlStatus: meta.crawlStatus,
      };
    });
    const allModules = [...new Set(projects.flatMap((p) => p.modules))];
    const differentiatingModules = allModules.filter((m) => !BASELINE_PRODUCTS.has(m));
    out.push({
      email: u.email ?? email, name: u.name ?? "", found: true,
      projectCount: projects.length,
      activeCount: projects.filter((p) => p.status?.toLowerCase() === "active").length,
      adminCount: projects.filter((p) => p.isAdmin).length,
      hasNoProjects: false, syncedAt: "",
      allRoles: [...new Set(projects.flatMap((p) => p.roles))],
      allModules,
      projects,
      isAccountAdmin: projects.some((p) => p.isAdmin),
      addedOn: null,
      firmId: u.companyId, firmName: u.companyId ? companyName.get(u.companyId) ?? null : null,
      accountStatus: u.status === "active" ? "active" : u.status === "inactive" ? "inactive" : null,
      permissionCoverage: coverageFor(projects.map((p) => p.crawlStatus ?? "never")),
      isExternal: email.length > 0 ? !email.endsWith("@lecg.com") : true,
      lastSignIn: u.lastSignIn ?? null,
    } as BulkAccUser);
  }
  return out;
}
```

> Note: `differentiatingModules` is computed for clarity/forward use; if `tsc` flags it as unused, prefix with `void differentiatingModules;` or remove — it documents the docs/insight baseline rule from the spec.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/dcUserAssembly.ts lib/acc/dcUserAssembly.test.ts
git commit -m "feat(access-graph): pure DC->BulkAccUser assembler with coverage + firm"
```

---

## Task 4: Server procedure `accDcGraph.bulkUsers`

**Goal:** Query the `AccDc*` tables and run them through `assembleDcUsers`.

**Files:**
- Create: `server/routers/acc-dc-graph.ts`
- Modify: `server/routers/root.ts`

- [ ] **Step 0: Validate the actual Prisma client accessors before writing the route**

Do NOT trust the model names below blindly. Confirm each accessor exists on `ctx.db` and that the role-name join target is correct (`AccRole` vs `AccDcRole` for `AccDcProjectUserRole.roleId`).

Run: `npx prisma validate` then inspect generated names:
```bash
grep -oE "accDc[A-Za-z]+|accRole|accProjectRole|accFolderPermission|accFolder|accProject" node_modules/.prisma/client/index.d.ts | sort -u
```
Confirm: `accDcUser`, `accDcProjectUser`, `accDcProjectUserRole`, `accDcProjectUserProduct`, `accDcCompany`, `accProject`, `accFolderPermission`, `accFolder` all exist. **Determine whether `AccDcProjectUserRole.roleId` resolves to `AccRole.id` or `AccDcRole.id`** by checking which table actually contains those ids:
```bash
node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:'postgresql://postgres@127.0.0.1:5432/dashboard'});await c.connect();const r=await c.query('SELECT (SELECT COUNT(*) FROM \"AccRole\" a JOIN \"AccDcProjectUserRole\" d ON d.\"roleId\"=a.id) acc, (SELECT COUNT(*) FROM \"AccDcRole\" a JOIN \"AccDcProjectUserRole\" d ON d.\"roleId\"=a.id) dc');console.table(r.rows);await c.end();})()"
```
Use whichever table (`accRole` or `accDcRole`) returns the non-zero join count for the `roleNames` map in Step 1. Record the choice.

- [ ] **Step 1: Create the router**

```ts
import { router, adminProcedure } from "../trpc";
import { assembleDcUsers } from "@/lib/acc/dcUserAssembly";

export const accDcGraphRouter = router({
  bulkUsers: adminProcedure.query(async ({ ctx }) => {
    const [users, projectUsers, projectUserRoles, projectUserProducts, companies, roles, projects] =
      await Promise.all([
        ctx.db.accDcUser.findMany({ select: { id: true, email: true, name: true, status: true, companyId: true, lastSignIn: true } }),
        ctx.db.accDcProjectUser.findMany({ select: { projectId: true, userId: true } }),
        ctx.db.accDcProjectUserRole.findMany({ select: { projectId: true, userId: true, roleId: true } }),
        ctx.db.accDcProjectUserProduct.findMany({ select: { projectId: true, userId: true, productKey: true, accessLevel: true } }),
        ctx.db.accDcCompany.findMany({ select: { id: true, name: true } }),
        ctx.db.accRole.findMany({ select: { id: true, name: true } }),
        ctx.db.accProject.findMany({ select: { id: true, name: true, status: true, folderCrawlStatus: true } }),
      ]);

    return assembleDcUsers({
      users: users.map((u) => ({ ...u, lastSignIn: u.lastSignIn ? u.lastSignIn.toISOString() : null })),
      projectUsers,
      projectUserRoles,
      projectUserProducts,
      companies,
      roleNames: Object.fromEntries(roles.map((r) => [r.id, r.name])),
      projectMeta: Object.fromEntries(projects.map((p) => [p.id, { name: p.name, status: p.status, crawlStatus: p.folderCrawlStatus }])),
    });
  }),
});
```

- [ ] **Step 2: Register the router**

In `server/routers/root.ts`, import and add `accDcGraph: accDcGraphRouter` to the root router map (follow the existing `accMembers:` / `accFolders:` registration pattern).

- [ ] **Step 3: Verify it type-checks and the procedure registers**

Run: `npx tsc --noEmit`
Expected: no new errors in `acc-dc-graph.ts` / `root.ts`.

- [ ] **Step 4: Smoke-test the query against the live DB**

Start dev (`npm run dev` if not running), sign in, then in the browser console on any dashboard page:
```js
// adjust to your tRPC client path if needed
await window.__trpcSmoke?.()
```
If no smoke helper exists, instead verify via a temporary `node` script using `assembleDcUsers` against the Task 1 queries, OR defer hard verification to Task 8 (page wiring). Expected: the "DC users with ≥1 project membership" count from Task 1 (NOT all 3,367 AccDcUser rows), each with `firmName`, `accountStatus`, `permissionCoverage`, and `projects[].crawlStatus` populated.

- [ ] **Step 5: Commit**

```bash
git add server/routers/acc-dc-graph.ts server/routers/root.ts
git commit -m "feat(access-graph): add accDcGraph.bulkUsers sourced from DC snapshot"
```

---

## Task 4B: Build per-user permission contexts (raw contextual facts for WS2)

**Goal:** Permissions attach to **roles**, not users. For each user, emit the folder-level permission grants reachable via their (project, role) memberships, so WS2 can build shared-folder + permission-tier edges with proper context. Coverage flags alone are insufficient.

**Files:**
- Modify: `lib/acc/dcUserAssembly.ts` (+ extend `DcAssemblyInput`)
- Modify: `lib/acc/dcUserAssembly.test.ts`
- Modify: `server/routers/acc-dc-graph.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { normalizePermTier } from "./dcUserAssembly";

describe("permissionContexts", () => {
  it("normalizes permType to a tier rank", () => {
    expect(normalizePermTier("View Only")).toBe("view");
    expect(normalizePermTier("View+Download")).toBe("download");
    expect(normalizePermTier("View+Download+Upload")).toBe("upload");
    expect(normalizePermTier("View+Download+Upload+Edit")).toBe("edit");
    expect(normalizePermTier("Full Controller")).toBe("control");
  });

  it("emits a permission context per user-role-folder grant in a crawled project", () => {
    const out = assembleDcUsers({
      ...base,
      folderPermissions: [
        { folderId: "f1", roleId: "Architect", permType: "View+Download+Upload+Edit", actions: ["VIEW", "EDIT"], projectId: "p1", folderPath: "/Project/Models" },
      ],
    });
    expect(out[0].permissionContexts).toEqual([
      { projectId: "p1", folderId: "f1", folderPath: "/Project/Models", permType: "View+Download+Upload+Edit", permissionTier: "edit", actions: ["VIEW", "EDIT"], crawlStatus: "ok", roleId: "Architect" },
    ]);
  });

  it("emits no permission context for roles/folders in uncrawled projects", () => {
    const out = assembleDcUsers({
      ...base,
      projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "never" } },
      folderPermissions: [
        { folderId: "f1", roleId: "Architect", permType: "View Only", actions: [], projectId: "p1", folderPath: "/x" },
      ],
    });
    expect(out[0].permissionContexts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts -t "permissionContexts"`
Expected: FAIL — `normalizePermTier` undefined / `permissionContexts` undefined.

- [ ] **Step 3: Implement**

Add to `DcAssemblyInput`:
```ts
  folderPermissions?: { folderId: string; roleId: string; permType: string; actions: string[]; projectId: string; folderPath: string }[];
```

Add the exported helper:
```ts
export function normalizePermTier(permType: string): string {
  const p = permType.toLowerCase();
  if (p.includes("full") || p.includes("control")) return "control";
  if (p.includes("edit")) return "edit";
  if (p.includes("upload")) return "upload";
  if (p.includes("download")) return "download";
  return "view";
}
```

In `assembleDcUsers`, before building each user, index folder permissions by `roleId` (only for crawled projects). For each user, for each (projectId, roleId) they hold where the project's `crawlStatus` is `ok`/`partial`, collect matching `folderPermissions` whose `projectId` equals that project. Emit one `PermissionContext` per grant. Attach `permissionContexts` to the returned user (default `[]`).

> Gate strictly: only emit contexts for projects whose `crawlStatus` is `ok` or `partial`. Never synthesize a context for `never`/`failed`/`inaccessible` projects (spec §5 — missing stays missing).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: PASS.

- [ ] **Step 5: Extend the server route to supply folder permissions**

In `server/routers/acc-dc-graph.ts`, add to the `Promise.all`:
```ts
        ctx.db.accFolderPermission.findMany({ select: { folderId: true, roleId: true, permType: true, actions: true, folder: { select: { projectId: true, fullPath: true } } } }),
```
Map rows to `{ folderId, roleId, permType, actions, projectId: r.folder.projectId, folderPath: r.folder.fullPath ?? "" }` and pass as `folderPermissions` into `assembleDcUsers`.

> Scale note: `AccFolderPermission` ≈ 986k rows. This is a snapshot-build query (cached via `staleTime: 600_000`). If load time is unacceptable in Step 6 verification, scope the query to crawled projects only (`where: { folder: { project: { folderCrawlStatus: { in: ["ok", "partial"] } } } }`) — that is the only data the assembler keeps anyway.

- [ ] **Step 6: Verify server route returns contexts**

Re-run the access-analysis suite and confirm no type errors:
Run: `npx tsc --noEmit`
Expected: no new errors. (Live verification happens in Task 8.)

- [ ] **Step 7: Commit**

```bash
git add lib/acc/dcUserAssembly.ts lib/acc/dcUserAssembly.test.ts server/routers/acc-dc-graph.ts
git commit -m "feat(access-graph): emit per-user permission contexts gated by crawl coverage"
```

---

## Task 5: Populate the dropped similarity inputs

**Goal:** `buildSimilarityInputFromUsers` currently drops `moduleIds`, `isAdmin`, `isExternal`, hardcodes `activityFileIds: []`, and never sets firm. Wire the now-available fields.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/graphTables.ts:60-94`
- Test: `app/(dashboard)/users/access-analysis/graphTables.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSimilarityInputFromUsers } from "./graphTables";
import type { BulkAccUser } from "@/lib/acc/acc-types";

const u = (o: Partial<BulkAccUser>): BulkAccUser => ({
  email: "a@lecg.com", name: "A", found: true, projectCount: 1, activeCount: 1,
  adminCount: 1, hasNoProjects: false, syncedAt: "", allRoles: [], allModules: [],
  projects: [{ id: "p1", name: "P1", status: "active", isAdmin: true, roles: ["Architect"], modules: ["build"] }],
  isAccountAdmin: true, addedOn: null, isExternal: false, firmId: "c1",
  accountStatus: "active", permissionCoverage: "known", ...o,
}) as BulkAccUser;

describe("buildSimilarityInputFromUsers (extended)", () => {
  it("passes moduleIds, isAdmin, isExternal, firmId into SimilarityUser", () => {
    const { users } = buildSimilarityInputFromUsers([u({})]);
    expect(users[0].moduleIds).toContain("build");
    expect(users[0].isAdmin).toBe(true);
    expect(users[0].isExternal).toBe(false);
    expect((users[0] as { firmId?: string }).firmId).toBe("c1");
  });

  it("excludes baseline products docs/insight from moduleIds", () => {
    const { users } = buildSimilarityInputFromUsers([u({ projects: [{ id: "p1", name: "P1", status: "active", isAdmin: false, roles: [], modules: ["docs", "insight", "build"] }] })]);
    expect(users[0].moduleIds).toEqual(["build"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/graphTables.test.ts -t "extended"`
Expected: FAIL — `moduleIds`/`firmId` undefined.

- [ ] **Step 3: Update `buildSimilarityInputFromUsers`**

Inside the `users.map(...)` return object (currently at `graphTables.ts:77-91`), replace the `activityFileIds: []` and add the dropped fields:

```ts
      const BASELINE = new Set(["docs", "insight"]);
      const moduleIds = [...new Set(
        (user.projects ?? []).flatMap((p) => p.modules ?? [])
      )].filter((m) => !BASELINE.has(m));
      return {
        id: userIdFor(user.email),
        projectIds: user.projects.map((project) => project.id).filter(Boolean),
        roleIds: [...roleIds],
        folderIds: [...folderIds],
        activityFileIds: [],            // still empty: activity events are insight-only (spec §5)
        coverageFlags: [/* unchanged */],
        lastSignIn: timestampMillis(user.lastSignIn),
        addedAt: timestampMillis(user.addedOn),
        isAdmin: user.isAccountAdmin === true || (user.adminCount ?? 0) > 0,
        isExternal: user.isExternal === true,
        companyRole: null,              // job-title removed (spec §4e)
        moduleIds,
        firmId: user.firmId ?? null,
      };
```

(Keep the existing `coverageFlags` array contents as-is.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/(dashboard)/users/access-analysis/graphTables.test.ts`
Expected: PASS (new + existing tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/graphTables.test.ts"
git commit -m "feat(access-graph): populate module/admin/external/firm similarity inputs"
```

---

## Task 6: Add `firm-affiliation` similarity dimension

**Goal:** Add firm as a light dimension in the engine; `SimilarityUser` needs `firmId`, and `pairSimilarity` needs a `firm-affiliation` case.

> **Default OFF.** Adding the dimension to the engine does NOT enable it. Its strength in the caller's `strengths` map MUST default to **0 (disabled)** until WS2 defines firm anti-clique rules (capping/dampening/layer-gating). This task only makes the dimension *available*; it must not influence the graph yet. Add a comment at the dim definition: `// firm-affiliation: default strength 0 until WS2 anti-clique rules — see spec §4a`.

**Files:**
- Modify: `lib/acc/userSimilarity.ts`
- Test: `lib/acc/userSimilarity.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { pairSimilarity, SIMILARITY_DIMS, type SimilarityUser } from "./userSimilarity";

const mk = (o: Partial<SimilarityUser>): SimilarityUser => ({
  id: "x", projectIds: [], roleIds: [], folderIds: [], activityFileIds: [],
  coverageFlags: [], lastSignIn: null, addedAt: null, ...o,
});

describe("firm-affiliation dim", () => {
  it("is registered", () => expect(SIMILARITY_DIMS).toContain("firm-affiliation"));
  it("scores 1 for same firm, 0 for different/missing", () => {
    expect(pairSimilarity(mk({ firmId: "c1" }), mk({ firmId: "c1" }), "firm-affiliation")).toBe(1);
    expect(pairSimilarity(mk({ firmId: "c1" }), mk({ firmId: "c2" }), "firm-affiliation")).toBe(0);
    expect(pairSimilarity(mk({ firmId: null }), mk({ firmId: null }), "firm-affiliation")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/acc/userSimilarity.test.ts`
Expected: FAIL — `firm-affiliation` not in union/dims.

- [ ] **Step 3: Implement the dim**

In `lib/acc/userSimilarity.ts`:
- Add `| "firm-affiliation"` to the `SimilarityDim` union (after `"module-mix"`).
- Append `"firm-affiliation"` to the `SIMILARITY_DIMS` array.
- Add `firmId?: string | null;` to `SimilarityUser`.
- Add to the `pairSimilarity` switch:

```ts
    case "firm-affiliation":
      // Same firm = 1, but treat missing firm as no-match (not a shared "unknown" bucket)
      // so large "no firm" groups do not form cliques. Strength is gated low by the caller.
      return a.firmId != null && a.firmId === b.firmId ? 1 : 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/acc/userSimilarity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/acc/userSimilarity.ts lib/acc/userSimilarity.test.ts
git commit -m "feat(access-graph): add light firm-affiliation similarity dimension"
```

---

## Task 7: Surface permission coverage + firm + status in the feature snapshot

**Goal:** Carry `permissionCoverage`, `firmName`, `accountStatus` to the per-node snapshot the predicate engine + UI read.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (`NodeFeatureSnapshot`)
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`

- [ ] **Step 1: Extend the `NodeFeatureSnapshot` type**

Add to `NodeFeatureSnapshot` in `interactionTypes.ts`:

```ts
  /** "known" | "partial" | "unknown" — folder-permission crawl coverage for this node. */
  permissionCoverage: "known" | "partial" | "unknown";
  /** DC firm/company name, or "" if none. */
  firmName: string;
  /** "active" | "inactive" | "" — account status (NOT recent activity). */
  accountStatus: string;
```

- [ ] **Step 2: Write the failing test**

Add to `featureSnapshot.test.ts`: assert that a snapshot row built from a feed including `permissionCoverage: "unknown"` surfaces `permissionCoverage === "unknown"` and the fallback row defaults to `"unknown"`. (Mirror the existing test's DuckDB-mock setup; add the three new columns to the mocked row and to the expected output.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"`
Expected: FAIL — property missing.

- [ ] **Step 4: Wire the columns**

The graph user-projects view needs the coverage/firm/status columns to exist. In `graphTables.ts` `buildGraphArrowTables`, add to the `userProjects` Arrow table the per-row `permission_coverage`, `firm_name`, `account_status` (from the `BulkAccUser` fields). Then in `featureSnapshot.ts` SQL, `SELECT` those columns (with `COALESCE(..., 'unknown'/'')`) and map them into the snapshot object + the `fallback()` row (default `permissionCoverage: "unknown"`, `firmName: ""`, `accountStatus: ""`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"
git commit -m "feat(access-graph): surface permission coverage, firm, account status in snapshot"
```

---

## Task 8: Point the page feed at the DC source + verify end-to-end

**Goal:** Switch `AccessAnalysisShell` (and any sibling that uses `bulkAccSummary` for this graph) to `accDcGraph.bulkUsers`, and verify the live graph.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`

- [ ] **Step 1: Swap the query**

Find the `trpc.users.bulkAccSummary.useQuery(...)` call feeding the graph and replace with `trpc.accDcGraph.bulkUsers.useQuery(undefined, { staleTime: 600_000 })`. Keep the same downstream variable name so consumers are untouched.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full access-analysis test suite**

Run: `npx vitest run "app/(dashboard)/users/access-analysis"`
Expected: all green.

- [ ] **Step 4: Manual browser verification (DevTools)**

Start dev, open `/users/access-analysis` (or wherever the shell route resolves), sign in, and confirm:
- Node count matches the Task 1 decision ("DC users with ≥1 project membership" — NOT the old 1,223, and NOT necessarily all 3,367).
- A node tooltip/inspector shows firm name + account status.
- Users in uncrawled projects carry `permissionCoverage: "unknown"` and an empty `permissionContexts` (inspect via the snapshot ref in console or a temporary debug log) and do NOT receive a fabricated permission tier.
- A user in a crawled project carries non-empty `permissionContexts` with `permissionTier` populated.
- No console errors; DuckDB views register without error.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(access-graph): feed access-analysis graph from DC snapshot source"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** project/model/role/firm/admin/external/account-status (Tasks 3,5,6,7,8) ✓; **raw permission contexts (userId/projectId/folderId/permType/tier/actions/crawlStatus) supplied for WS2 (Task 4B)** ✓; permission coverage known/partial/unknown (Tasks 3,7) ✓; coverage "unknown" rule + crawl-gated contexts (Tasks 3,4B,7,8) ✓; remove company-role/data-coverage (Task 5 sets `companyRole: null`; data-coverage flags left untouched but unused by edges — acceptable for WS1) ✓; node-population = "DC users with ≥1 project membership" (Task 1) ✓; firm dim available but default-OFF until WS2 (Task 6) ✓.
- **Deferred (correctly out of WS1):** edge thresholds/anti-hairball/contextual-edge enforcement (WS2), clustering (WS3), layout/physics (WS4), 3D (WS5), filter UI (WS6), insight panel (WS7). The contextual-edge rules (permission/role require shared project context) are ENFORCED in WS2 — WS1 supplies correctly-scoped per-(user,project) data and raw permission contexts so WS2 can enforce them. Firm-affiliation dim is wired but disabled (strength 0) until WS2 anti-clique rules.
- **Placeholder scan:** no TBD/TODO; integration steps (Tasks 4 Step 4, 7 Step 4, 8 Step 4) give concrete verification rather than fabricated unit code where a live DB/DuckDB runtime is required.
- **Type consistency:** `permissionCoverage` values `known|partial|unknown` consistent across acc-types, assembler, snapshot; `firmId`/`firmName` consistent; `SimilarityUser.firmId` matches `buildSimilarityInputFromUsers` output.

## Open items carried forward
- `executive` flag is empty in DC — not used in this plan; validate before any future use.
- Activity events remain insight-only (WS7); `activityFileIds` stays `[]` intentionally.
- WS2 must enforce contextual edges (shared project/folder), permission-coverage gating, and firm anti-clique using the data this plan supplies.
