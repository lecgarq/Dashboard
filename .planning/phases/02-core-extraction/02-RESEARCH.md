# Phase 2: Core Extraction — Members, Projects, Roles - Research

**Researched:** 2026-05-11
**Domain:** APS Construction Admin v1 / HQ v2 REST extraction → Prisma relational tables + `accMemberCache` dual-write
**Confidence:** HIGH (codebase grounded; APS behavior verified via HOW_TO docs + existing v1.0 code; online APS docs non-renderable but HOW_TO docs are scraped official docs)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MEM-01 | Per-project members extracted via `/construction/admin/v1/projects/:id/users` with `?fields=` hardcoded | Verified: HOW_TO_Extract_Last_Sign_In.md confirms `?fields=name,email,lastSignIn` is mandatory. Pitfall 5 fully documents the failure mode. Existing `fetchAccPaged` in `acc-admin.ts` is reusable as the HTTP primitive. |
| MEM-02 | `status`, `companyName`, `phone`, `addedOn` persisted from the project endpoint | Verified: HOW_TO_Extract_Project_Members.md field mapping table confirms exact JSON keys: `status`, `companyName`, `phone.number`, `addedOn`. Distinct from HQ `created_at` — `addedOn` here is project-join date. |
| MEM-03 | Full `products` array persisted with per-module tier (administrator / member / none) | Verified: HOW_TO_Extract_Project_Members.md documents `products[].key` and `products[].access` shape. 9 known product keys (docs, designCollaboration, modelCoordination, build, autoSpecs, insight, cost, projectAdministration, takeoff). |
| MEM-04 | `accessLevels.projectAdmin` and `accessLevels.executive` flags persisted distinctly | Verified: HOW_TO_Extract_Project_Members.md shows `accessLevels: { projectAdmin: true, executive: false }`. Schema already has `projectAdmin Boolean` and `executive Boolean` columns on `AccProjectMember`. |
| MEM-05 | Per-project role assignments persisted in `AccProjectRole` (member × project × role) | Verified: HOW_TO_Extract_Project_Members.md shows `roles: [{ name: "Architect" }]` array on the user response. Also: HOW_TO_Extract_All_Roles.md describes how role IDs live on project industry_roles endpoint. IMPORTANT: The `/projects/:id/users` response gives role names (not IDs). Role IDs come from `/hq/v2/accounts/:id/projects/:pid/industry_roles`. Linking requires a join step — see Architecture Patterns. |
| MEM-06 | `accMemberCache` continues to be written during dual-existence window | Verified: Existing `bulkAccSync` mutation in `server/routers/users.ts` is the canonical source of the cache write contract. Phase 2 must replicate that JSON shape exactly so `buildAccGraphSnapshot` and `bulkAccSummary` continue to work unmodified. |
| PROJ-01 | All projects extracted via `/construction/admin/v1/accounts/:id/projects` with pagination; `type`, `name`, `jobNumber`, `accountId`, `createdAt` persisted | Verified: HOW_TO_Extract_Project_Info.md confirms endpoint + field names. Pagination: limit/offset with `data.results.length < limit` sentinel. Max limit: 100 documented in HOW_TO; APS web search confirms 200 is supported. |
| PROJ-02 | Project list refresh integrated into Quick Sync; deleted projects marked inactive (soft-delete) | Not a hard-delete: schema has `status String @default("active")`. Soft-delete strategy: compare fetched IDs against all AccProject rows with `status = "active"`; any ID not in the fresh list → update to `status = "inactive"`. |
| ROLE-01 | Hub master roles via `/hq/v2/accounts/:id/industry_roles` → `AccRole` | Verified: HOW_TO_Extract_All_Roles.md documents this endpoint. Response is a plain JSON array (not paginated). Bare accountId (no `b.`). |
| ROLE-02 | Per-project industry roles via `/hq/v2/accounts/:id/projects/:pid/industry_roles` → `AccProjectRole` | Verified: HOW_TO_Extract_All_Roles.md documents this endpoint and provides example Node.js loop. `projectId` here is the bare UUID (no `b.`). |
| ROLE-03 | Default access levels per role (`services.document_management.access_level`, `services.project_administration.access_level`) persisted with each `AccProjectRole` row | Verified: HOW_TO_Extract_All_Roles.md example shows `role.services?.document_management?.access_level` and `role.services?.project_administration?.access_level`. Schema already has `docsAccessLevel` and `projectAdminAccessLevel` columns on `AccProjectRole`. |
</phase_requirements>

---

## Summary

Phase 2 fills in the `runQuickSyncShell()` no-op body in `scripts/release.cjs` with real extraction logic. It is purely backend data plumbing — no UI changes. Every requirement maps to one or two APS REST endpoints whose behavior is well-documented in the HOW_TO files in this repo, and the HTTP primitive layer (`fetchWithRetry`, `fetchAccPaged`, `fetchHqUsers`) already exists in `lib/server/acc-admin.ts`.

The central design decision for this phase is **extraction order**. Projects must be fetched first (PROJ-01) because every subsequent extraction is scoped by project ID. Hub roles are fetched once (ROLE-01), then per-project industry roles (ROLE-02/03), then per-project members (MEM-01..05). The dual-write (MEM-06) happens inside the per-project member loop — each member row is written to BOTH `AccProjectMember` AND reconstructed into the `accMemberCache` JSON blob shape.

The most dangerous risk in this phase is the dual-write correctness: `buildAccGraphSnapshot` and `bulkAccSummary` are reading `accMemberCache.data` as a specific JSON shape that was hand-assembled by `bulkAccSync`. Phase 2 must produce an identical JSON shape or the existing graph and dashboard break silently. The planner must schedule a task that explicitly validates the cache JSON shape against the `BulkAccUser` interface before marking any plan complete.

**Primary recommendation:** Build a new pure TypeScript module `lib/acc/quick-sync-extraction.ts` (importable from a CJS script via `tsx` transpilation) that contains all extraction functions. The `runQuickSyncShell()` in `scripts/release.cjs` calls this module via `spawnSync('npx', ['tsx', 'lib/acc/quick-sync-extraction.ts'])` — the same pattern already used for `scripts/rebuild-graph.ts`.

---

## Standard Stack

### Core (already in repo — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `p-limit` | ^7.3.0 | Concurrency limiter for per-project API fan-out | Already in `package.json`; used by `bulkAccSync` at `pLimit(3)` |
| `@prisma/client` | ^7.8.0 | Writes to all 4 new v2.0 tables + `accMemberCache` | Repo standard; `createPrisma()` pattern from `release.cjs` is reusable |
| Native `fetch` | Node 22 built-in | APS REST calls | Already used in `acc-admin.ts`; `fetchWithRetry` handles 429 |
| `tsx` | ^4.21.0 | Run TypeScript extraction module from CJS release script | Already used in `scripts/rebuild-graph.ts` via `spawnSync` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.1.6 | Unit tests for extraction helpers | Any function with mapping/transformation logic (products normalizer, role linker, JSON shape builder) |

### No New Installs Required

Phase 2 adds zero new `npm` dependencies. All needed libraries are already in `package.json`.

---

## Architecture Patterns

### Recommended File Structure

```
lib/acc/
├── quick-sync-extraction.ts     # NEW: exported functions called by release.cjs via tsx
├── acc-types.ts                 # EXISTING: BulkAccUser / BulkAccProject interfaces
├── graphSnapshot.ts             # EXISTING: buildAccGraphSnapshot (reads accMemberCache)
scripts/
├── release.cjs                  # EXISTING: calls runQuickSyncShell() — Phase 2 fills the body
```

The extraction logic must NOT go directly in `scripts/release.cjs` because:
1. CJS cannot import TypeScript modules directly.
2. The extraction logic is complex enough to need unit tests, which require a `.ts` file.
3. The `tsx scripts/rebuild-graph.ts` pattern already proves the invocation model.

### Pattern 1: Project-First Extraction Order

**What:** Fetch all projects first, then fan out per-project for members and per-project roles.

**When to use:** Always. Projects are the foreign key that every other table references.

```typescript
// lib/acc/quick-sync-extraction.ts
// Source: HOW_TO_Extract_Project_Info.md + HOW_TO_Extract_All_Roles.md patterns

export async function runQuickSync(prisma: PrismaClient, accessToken: string): Promise<void> {
  const accountId = await getAccountId(prisma);

  // Step 1: Upsert all projects + soft-delete missing ones
  const projects = await extractAndPersistProjects(prisma, accountId, accessToken);

  // Step 2: Hub master roles — one call, no pagination
  const hubRoles = await extractAndPersistHubRoles(prisma, accountId, accessToken);

  // Step 3: Per-project fan-out (members + per-project roles)
  // pLimit(5) — each project fetches members + roles independently
  const limit = pLimit(5);
  await Promise.all(
    projects.map((project) =>
      limit(() => extractAndPersistProjectData(prisma, accountId, project, hubRoles, accessToken))
    )
  );
}
```

### Pattern 2: Soft-Delete via Set-Difference

**What:** Detect projects (or members) that no longer appear in the APS response and mark them inactive.

```typescript
// After fetching the current APS project list:
const freshIds = new Set(freshProjects.map((p) => p.id));
const staleProjects = await prisma.accProject.findMany({
  where: { status: "active", id: { notIn: Array.from(freshIds) } },
  select: { id: true },
});
if (staleProjects.length > 0) {
  await prisma.accProject.updateMany({
    where: { id: { in: staleProjects.map((p) => p.id) } },
    data: { status: "inactive" },
  });
}
```

**Warning:** `id: { notIn: [...] }` can hit Postgres parameter limits (~65535) on very large hubs. Cap at checking only against active IDs or use a raw query if project count exceeds 10,000.

### Pattern 3: `?fields=` Hardcoded URL Construction

**What:** Always embed `fields=` in the Construction Admin user endpoint URL. Never make it optional.

```typescript
// lib/acc/quick-sync-extraction.ts
// Source: HOW_TO_Extract_Last_Sign_In.md — "Crucial Note: must explicitly request lastSignIn"

const MEMBER_FIELDS = "name,email,status,companyName,phone,addedOn,lastSignIn,accessLevels,products,roles";

async function fetchProjectMembers(
  projectId: string,  // bare UUID, no b. prefix
  accessToken: string
): Promise<RawMember[]> {
  const baseUrl = `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users`;
  const all: RawMember[] = [];
  let offset = 0;
  const pageSize = 100;

  while (true) {
    const url = `${baseUrl}?limit=${pageSize}&offset=${offset}&fields=${MEMBER_FIELDS}`;
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json() as { results: RawMember[] };
    all.push(...data.results);
    if (data.results.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
```

### Pattern 4: Products Array → JSON Column

**What:** Normalize the raw `products[]` array into a stable JSON map keyed by product key.

```typescript
// Source: HOW_TO_Extract_Project_Members.md — products[].key + products[].access shape
type ProductTier = "administrator" | "member" | "none";

function normalizeProducts(raw: { key: string; access: string }[]): Record<string, ProductTier> {
  const result: Record<string, ProductTier> = {};
  for (const item of raw ?? []) {
    if (item.key && item.access) {
      result[item.key] = item.access as ProductTier;
    }
  }
  return result;
}
// Stored as AccProjectMember.products (Json column) — downstream queries use Prisma JSON path operators
```

**Rationale for Json column (not normalized table):** Products are always read and written as a unit per member. There is no requirement to query "all members with docs=administrator across all projects" in Phase 2. Normalizing into a separate table would add 9× the rows with no query benefit in this phase.

### Pattern 5: MEM-06 Dual-Write — Cache JSON Shape Must Match `BulkAccUser`

**What:** After writing to `AccProjectMember`, also write the reconstructed JSON blob to `accMemberCache`. The blob must be structurally identical to what `bulkAccSync` produces, because `buildAccGraphSnapshot` and `bulkAccSummary` both parse it.

```typescript
// Source: server/routers/users.ts:1150-1167 — canonical cache shape
// Source: lib/acc/acc-types.ts — BulkAccUser interface

function buildCacheBlob(
  member: AccProjectMember,
  allProjectsForMember: ProjectSummary[],
  isAccountAdmin: boolean,
): BulkAccUser {
  return {
    found: true,
    autodeskId: member.autodeskId,
    name: member.name,
    status: member.status,
    role: isAccountAdmin ? "account_admin" : "account_user", // matches HQ v1 role field
    company: member.companyName ?? undefined,
    addedOn: member.addedOn?.toISOString() ?? null,
    companyRole: null, // not available from project-level endpoint; HQ v1 would provide it
    lastSignIn: member.lastSignIn?.toISOString() ?? null,
    isAccountAdmin,
    projects: allProjectsForMember.map((p) => ({
      id: p.id,
      name: p.name,
      status: "active",
      isAdmin: member.projectAdmin,
      roles: p.roles,
      modules: Object.entries(member.products as Record<string, string>)
        .filter(([, v]) => v !== "none")
        .map(([k]) => k),
    })),
    syncedAt: new Date().toISOString(),
  };
}
```

**Critical constraint:** `companyRole` is NOT available from the project-level member endpoint. It comes from the HQ v1 user record (which v1.0 `bulkAccSync` fetched via `fetchAllAccUsers`). Phase 2 must decide: (a) also call HQ v1 per member to get `companyRole`, or (b) write `null` and accept this field degradation in the cache. See Open Questions #1.

### Pattern 6: Role Linking — Name-to-ID Resolution

**What:** The `/projects/:id/users` response gives role names (`roles[].name`). The `/hq/v2/accounts/:id/projects/:pid/industry_roles` response gives role objects with `id` and `name`. Linking members to roles requires a local in-memory map built from the per-project role fetch.

```typescript
// Build map after fetching per-project roles:
const roleNameToId = new Map(projectRoles.map((r) => [r.name.toLowerCase(), r.id]));

// Link member roles:
for (const roleName of member.roles.map((r) => r.name)) {
  const roleId = roleNameToId.get(roleName.toLowerCase());
  if (roleId) {
    await prisma.accProjectRole.upsert({
      where: { projectId_roleId_memberId: { projectId, roleId, memberId: savedMember.id } },
      create: { projectId, roleId, memberId: savedMember.id, docsAccessLevel: null, projectAdminAccessLevel: null },
      update: {},
    });
  }
  // If role name not found in project roles, log warning — role may be hub-level only
}
```

### Anti-Patterns to Avoid

- **Fetching members before projects:** `AccProjectMember` has a FK to `AccProject`. Prisma will throw a foreign key violation if the project row does not exist.
- **Using `getAccountId` for per-project member endpoint projectId:** The member endpoint uses the project's bare UUID, NOT the hub accountId. These are different values. The project `id` from `AccProject` is already bare (stored without `b.`).
- **Calling `/projects/:id/users` without `?fields=`:** `lastSignIn` is absent (not null) from the response if `fields=` is omitted. Store `undefined` as `null` in Prisma but log a warning if `lastSignIn` key is missing from raw response.
- **Wrapping entire sync in one Prisma transaction:** A transaction spanning thousands of rows across 5 minutes will hold DB locks and may hit Postgres's statement timeout. Use per-project upsert batches instead.
- **Reconciling accMemberCache per email from HQ v1:** The v1.0 pattern fetched all HQ users first (one sweep) then joined per email. Phase 2 is project-centric, not user-centric. The cache write must be aggregated differently — see Architecture Pattern 5 and Open Questions #1.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 429 retry with backoff | Custom retry logic | `fetchWithRetry` in `lib/server/acc-admin.ts` | Already handles `Retry-After` header + exponential backoff; battle-tested against APS |
| Pagination loop | Custom while-loop per endpoint | `fetchAccPaged` helper or the pattern in HOW_TO docs (limit/offset sentinel) | Same pattern for all Construction Admin v1 endpoints |
| `b.` prefix stripping | Inline `.replace('b.', '')` | `getAccountId(db)` for hub ID, `getProjectIdForDM(rawId)` for DM API | Named helpers make intent obvious; already have unit tests |
| JSON blob shape validation | Runtime type guards | TypeScript interface `BulkAccUser` + strict assignment | Type errors caught at compile time; no runtime guard needed |

---

## Common Pitfalls

### Pitfall 1: `lastSignIn` Silent Absence Without `?fields=`

**What goes wrong:** `/construction/admin/v1/projects/:id/users` does NOT return `lastSignIn` by default. The field is absent (not null) from the response JSON. Code that does `member.lastSignIn ?? null` will silently store null for every user.

**Why it happens:** Documented in HOW_TO_Extract_Last_Sign_In.md: "Crucial Note: you must explicitly request the `lastSignIn` field by appending `?fields=name,email,lastSignIn` to your URL." Developers copying the base URL miss this.

**How to avoid:** Hard-code the `fields` parameter as a module-level constant (see Pattern 3). Add a runtime assertion: if `"lastSignIn" in rawMember === false` (key absent vs. key present with null value), log an error — the `?fields=` was dropped.

**Warning signs:** All `AccProjectMember.lastSignIn` values are null after the first sync; the "Last Sign-In" column shows "Never" for all users including active ones.

### Pitfall 2: Dual-Write Cache Shape Drift

**What goes wrong:** `buildAccGraphSnapshot` reads `accMemberCache.data` and expects `{ found: true, name, projects: [{ id, name, isAdmin, roles, modules }] }`. If the Phase 2 cache writer produces a different shape (e.g., `modules` is absent, or `roles` is `[{ id, name }]` objects instead of `string[]`), the graph builds empty or with wrong node colors — with no visible error.

**Why it happens:** The cache shape is not enforced at the write boundary. `accMemberCache.data` is type `Json` (opaque to Prisma). Downstream consumers parse it with loose `typeof` guards.

**How to avoid:** Write the cache blob builder as a function that returns `BulkAccUser` (typed). TypeScript compile check ensures structural correctness. Run `buildAccGraphSnapshot([{ email, data: blob }])` in a unit test and assert `nodes.length > 0`.

**Warning signs:** Graph shows zero nodes or all nodes cluster at the same position after the first Phase 2 sync; `bulkAccSummary` returns empty projects arrays.

### Pitfall 3: Role ID vs Role Name Mismatch

**What goes wrong:** Members come back with `roles: [{ name: "Architect" }]`. AccRole rows use the APS role `id` as PK. If the per-project industry_roles call is not made, or fails, there is no `roleId` to link. Silently, `AccProjectRole` rows are never written.

**Why it happens:** The member endpoint gives names; the role endpoint gives IDs. The join requires both calls, in order.

**How to avoid:** Always fetch per-project industry roles BEFORE processing member roles. If the roles fetch fails for a project, log the error and skip role linking for that project (members still persist). Add a log line counting how many member role names failed to resolve to an ID.

**Warning signs:** `AccProjectRole` table empty after sync; role-based graph clustering not working.

### Pitfall 4: Quick Sync 5-Minute Timeout With Many Projects

**What goes wrong:** If the hub has 50+ projects, the per-project fan-out (members + roles per project) can exceed the 5-minute hard timeout wired in `release.cjs`. On timeout, `process.exit(1)` fires — the deploy fails. The SyncMeta records "timeout" and an alert email fires.

**Why it happens:** Each project requires 2-3 API calls (members paginated + per-project roles). With 50 projects at `pLimit(5)`, serial groups of 5 projects each take ~3-10 seconds → 30-100 seconds total. Should be fine for typical LECG hub size, but is a production risk for future hub growth.

**How to avoid:** Benchmark on first real run. If approaching timeout, implement incremental sync: only re-fetch projects whose `updatedAt` changed since last sync (detectable from PROJ-01 project list). Document the timing in the plan verification.

**Warning signs:** Railway deploy logs show `[release] Quick Sync timed out after 5 minutes`; SyncMeta shows `lastStatus: "failed"` with timeout error.

### Pitfall 5: `accMemberCache` Aggregation — Project-Centric vs User-Centric

**What goes wrong:** v1.0 `bulkAccSync` built one cache row per email by joining all projects for a user across the hub. Phase 2 processes per-project: one project → all its members. A member appears in multiple projects. If the cache write happens per-project-member without aggregation, the last project's write for a user overwrites the previous ones (because `accMemberCache` is keyed by email — one row per user).

**Why it happens:** The extraction model changed from user-centric (v1.0) to project-centric (v2.0). The cache was designed for user-centric writes.

**How to avoid:** Two options:
1. **In-memory aggregation:** After all per-project extraction, build an in-memory `Map<email, BulkAccUser>` by merging all per-project member records for each user, then write `accMemberCache` rows at the end.
2. **Deferred cache write:** Write only to new tables during extraction, then in a separate step read `AccProjectMember` grouped by email and build cache blobs.
Option 1 is simpler for Phase 2. Option 2 is more resilient if memory is a concern for large hubs.

### Pitfall 6: Per-Project Role Endpoint Uses HQ v2, Not Construction Admin v1

**What goes wrong:** The per-project industry roles endpoint is `GET /hq/v2/accounts/:id/projects/:pid/industry_roles` — this is an HQ v2 endpoint, NOT a Construction Admin v1 endpoint. It returns a plain array, not `{ pagination, results }`. Using `fetchAccPaged` (which expects `{ pagination, results }`) will fail.

**Why it happens:** The existing code (`fetchAccHubRoles` and `fetchHqUsers`) handles HQ v1 plain arrays. HQ v2 uses the same plain-array response shape. But someone pulling the pattern from `fetchAccPaged` will break it.

**How to avoid:** Use `fetchHqUsers` (plain array fetcher) for both hub roles (`/hq/v2/accounts/:id/industry_roles`) and per-project roles (`/hq/v2/accounts/:id/projects/:pid/industry_roles`). The URL base is different but the response shape is the same.

---

## Code Examples

### Hub Roles Extraction (ROLE-01)

```typescript
// Source: HOW_TO_Extract_All_Roles.md + acc-admin.ts fetchHqUsers pattern
// Note: HQ v2 industry_roles — plain JSON array, no pagination envelope

const HQ_V2_BASE = "https://developer.api.autodesk.com/hq/v2";

async function extractHubRoles(accountId: string, accessToken: string): Promise<HubRole[]> {
  const url = `${HQ_V2_BASE}/accounts/${accountId}/industry_roles`;
  // fetchHqUsers returns plain array (correct for HQ v1 AND HQ v2 plain-array endpoints)
  const items = await fetchHqUsers(url, accessToken);
  return items.map((r) => ({
    id: getString(r.id),
    name: getString(r.name),
    memberCount: typeof r.member_count === "number" ? r.member_count : 0,
  })).filter((r) => r.id && r.name);
}
```

### Per-Project Roles Extraction (ROLE-02, ROLE-03)

```typescript
// Source: HOW_TO_Extract_All_Roles.md — services.document_management.access_level shape

async function extractProjectRoles(
  accountId: string,
  projectId: string, // bare UUID — no b. prefix
  accessToken: string
): Promise<ProjectRole[]> {
  const url = `${HQ_V2_BASE}/accounts/${accountId}/projects/${projectId}/industry_roles`;
  const items = await fetchHqUsers(url, accessToken);
  return items.map((r) => {
    const services = r.services as Record<string, { access_level?: string }> | undefined;
    return {
      id: getString(r.id),
      name: getString(r.name),
      docsAccessLevel: services?.document_management?.access_level ?? null,
      projectAdminAccessLevel: services?.project_administration?.access_level ?? null,
    };
  }).filter((r) => r.id && r.name);
}
```

### Projects Extraction with Pagination (PROJ-01)

```typescript
// Source: HOW_TO_Extract_Project_Info.md — limit/offset sentinel pagination
// Max limit: 100 per HOW_TO; 200 per APS web search verification

const ACC_ADMIN_V1_BASE = "https://developer.api.autodesk.com/construction/admin/v1";

async function fetchAllProjects(accountId: string, accessToken: string): Promise<RawProject[]> {
  const all: RawProject[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${ACC_ADMIN_V1_BASE}/accounts/${accountId}/projects?limit=${limit}&offset=${offset}&fields=id,name,type,jobNumber,accountId,createdAt,status`;
    const res = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throwApsError(res, await res.text());
    const data = await res.json() as { results: RawProject[]; pagination?: { totalResults: number } };
    all.push(...data.results);
    if (data.results.length < limit) break;
    offset += limit;
  }
  return all;
}
```

### Concurrency Cap for Per-Project Fan-Out

```typescript
// Source: server/routers/users.ts:1108 — pLimit(3) for user-centric
// Phase 2 recommendation: pLimit(5) for project-centric (fewer downstream API calls per project vs per user)

import pLimit from "p-limit";

const perProjectLimit = pLimit(5);

await Promise.all(
  projects.map((project) =>
    perProjectLimit(async () => {
      try {
        await extractAndPersistProjectData(prisma, accountId, project.id, accessToken, inMemoryAggregator);
      } catch (err) {
        // skip-and-continue: log error, increment failCount, do not rethrow
        console.warn(`[quick-sync] project ${project.id} failed:`, err.message);
        failCount++;
      }
    })
  )
);
// After fan-out: write accMemberCache from inMemoryAggregator
```

### Existing `fetchWithRetry` (already in acc-admin.ts)

```typescript
// Source: lib/server/acc-admin.ts:55-68 — REUSE THIS, do not reimplement
async function fetchWithRetry(url: string, init: RequestInit, maxAttempts = 4): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= maxAttempts - 1) return res;
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const waitMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
      ? Math.min(60_000, retryAfterSec * 1000)
      : Math.min(30_000, 1000 * Math.pow(2, attempt));
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
}
```

---

## Architecture Patterns

### Recommended Project Structure for Phase 2

```
lib/acc/
├── quick-sync-extraction.ts     # NEW: all extraction + upsert logic; entry point called by release.cjs
│   ├── runQuickSync()           # top-level orchestrator
│   ├── extractAndPersistProjects()
│   ├── extractAndPersistHubRoles()
│   ├── extractAndPersistProjectData()   # per-project: members + roles
│   ├── buildCacheBlob()         # reconstructs BulkAccUser-shaped JSON for accMemberCache
│   └── normalizeProducts()      # products[] → Record<key, tier>
└── quick-sync-extraction.test.ts # NEW: unit tests for normalizeProducts, buildCacheBlob, role linking
scripts/
└── release.cjs                  # MODIFY: replace NO-OP runQuickSyncShell() body
```

### Invocation Pattern from release.cjs (pure CJS → tsx bridge)

```javascript
// scripts/release.cjs (pattern from existing rebuild-graph invocation on line 194)
const syncResult = spawnSync("npx", ["tsx", "lib/acc/quick-sync-extraction.ts"], {
  stdio: "inherit",
  timeout: TIMEOUT_MS - 30_000, // leave 30s buffer before the outer watchdog fires
  shell: process.platform === "win32",
  env: { ...process.env },
});
if (syncResult.status !== 0) {
  throw new Error(`Quick sync extraction exited ${syncResult.status}`);
}
```

**Alternative:** Export `runQuickSync` from `quick-sync-extraction.ts` and have `release.cjs` call it directly if the `PrismaClient` and `tsx` invocation overhead becomes measurable. The `tsx` bridge is simpler to test in isolation.

---

## Key Decisions for the Planner

These are gray areas NOT locked by CONTEXT.md. The planner must pick one option per decision.

### Decision 1: Failure Tolerance — Skip-and-Continue vs Abort

**Question:** If one project's member fetch fails, does Quick Sync abort the entire run or skip that project and continue?

**Options:**
- **Abort:** Fail fast, deploy fails, email alert fires. Clean semantics. Risk: one flaky APS project blocks all data freshness.
- **Skip-and-continue:** Log the failure, increment a `failCount`, continue with remaining projects. Deploy succeeds. Risk: partial data is silently committed (some projects fresh, some stale).
- **Hybrid:** Skip-and-continue, but if `failCount > threshold` (e.g., >20% of projects fail), abort and fail the deploy.

**Research finding:** The existing `bulkAccSync` uses skip-and-continue at `pLimit(3)` (see `users.ts:1175-1180`). This is the established project pattern. **Recommend: skip-and-continue** for individual project failures; abort only if the projects-list fetch itself fails (that's the entire foundation).

### Decision 2: Email Alert Threshold

**Question:** Send an alert email for any failure or only when failure rate exceeds a threshold?

**Options:**
- **Any failure:** Alert on every skipped project. May cause alert fatigue on transient APS errors.
- **Threshold:** Alert only when >5% of projects fail (or N specific critical failures). More signal, less noise.

**Research finding:** Phase 1 already emails on any Quick Sync failure. For individual project failures within a skip-and-continue model, recommend: **include failure summary in the final SyncMeta write** (count + first error message) but only fire a Resend email if `failCount > 0 && failRate > 10%`. Always log all individual failures to Railway console.

### Decision 3: `companyRole` in Cache Blob — HQ v1 Call or Null

**Question:** `BulkAccUser.companyRole` comes from HQ v1 user records. The project-centric member endpoint (`/projects/:id/users`) does not return this field. Phase 2 can:

- **Option A:** Add a HQ v1 prefetch of all hub users (one sweep, O(1) calls) and join on email to get `companyRole`. Same O(1) prefetch pattern as v1.0 `bulkAccSync`. Adds ~5-10 seconds.
- **Option B:** Write `null` for `companyRole` and accept the degradation. The existing UI shows "Unspecified" for null. Phase 3 or a later cleanup task would backfill.

**Research finding:** v1.0 already has `fetchAllAccUsers` for this O(1) prefetch. Adding one hub-level sweep adds minimal time and preserves the existing dashboard behavior. **Recommend: Option A** — call `fetchAllAccUsers` once at Quick Sync start, build `email → AccUser` map, join during cache blob construction.

### Decision 4: Dual-Write Transaction Semantics

**Question:** Should the new-table writes AND the `accMemberCache` write be wrapped in a single Prisma transaction?

**Research finding:** A transaction spanning all members of all projects could hold locks for the entire 5-minute sync window. This is unsafe. The correct pattern is:
- Write `AccProject` / `AccRole` rows outside a transaction (additive upserts, safe to repeat).
- Write each `AccProjectMember` batch in a small per-project transaction (one project's members + roles + cache blob for users in that project).
- The accMemberCache write (email-keyed upsert) happens after all per-project batches using the in-memory aggregator.

**Recommend:** No global transaction. Per-project batches (optional). `accMemberCache` upserts are independent (idempotent — upsert by email). The risk of a mid-sync failure leaving partial data is acceptable because the next deploy re-runs the full extraction.

### Decision 5: Concurrency Cap — `pLimit(5)` or `pLimit(3)`

**Question:** What concurrency cap for per-project member+role fetch fan-out?

**Research finding:** v1.0 used `pLimit(3)` for the user-centric model where each user generated 3 downstream API calls (projects + roles + products). The per-project model generates fewer downstream calls per unit (1 members call + 1 roles call = 2 calls per project vs 3 calls per user). But project-level member pages may each have 100+ users, making the total request count higher. The existing `fetchWithRetry` handles 429s, so the limiting factor is not hard-failing — it's total elapsed time.

**Recommend:** Start with `pLimit(5)`. Benchmark on first real run. If the sync exceeds 3 minutes on the LECG hub, drop to `pLimit(3)`.

### Decision 6: Dual-Write Cutover Trigger

**Question:** When can the `accMemberCache` write be removed (deferred to v2.x CLN-01)?

**Research finding:** REQUIREMENTS.md already defers this to `CLN-01` (post-v2.0). Phase 2 must keep dual-write active. The CONTEXT.md for Phase 1 says "additive-only" — no drops. The only safe trigger for removing the cache write is: (a) Phase 5 LIST/GRAPH/DASH enrichments read from new tables, (b) first v2.0 production sync confirmed, (c) `CLN-01` cleanup phase ships as a separate milestone.

**Phase 2 deliverable:** Dual-write active. No cutover. No special trigger logic needed.

### Decision 7: Stale-Data Semantics for Failing Projects

**Question:** If a project's member fetch fails, what happens to its existing `AccProjectMember` rows?

**Options:**
- **Keep stale:** Leave existing rows unchanged. The `syncedAt` column will show the old timestamp, making staleness detectable.
- **Mark stale:** Update a `syncStatus` flag on the project row to "partial".

**Recommend:** Keep stale + log. The `AccProject.updatedAt` (auto-updated by Prisma) does NOT reflect sync time — `AccProjectMember.syncedAt` is the staleness signal. No schema change needed. Downstream: Phase 5 queries that care about freshness can filter on `syncedAt > threshold`.

---

## State of the Art

| Old Approach (v1.0) | Phase 2 Approach | Reason |
|---------------------|------------------|--------|
| User-centric: fetch all hub users, then per-user projects + roles + products | Project-centric: fetch all projects, then per-project members + roles | Project-centric matches the new data model (`AccProjectMember` FK → `AccProject`) and reduces API calls (one members-per-project call covers all users, no N+1 per user) |
| `accMemberCache.data` only (JSON blob, no relational integrity) | Dual-write: relational tables primary, cache blob secondary | Enables Phase 5 UI enrichments; relational queries; foreign key integrity |
| `pLimit(3)` on per-user fan-out | `pLimit(5)` on per-project fan-out | Per-project makes fewer downstream calls per unit; higher concurrency is safe |
| HQ v1 `last_sign_in` (snake_case, returned by default) | CA v1 `lastSignIn` (camelCase, requires `?fields=`) | Endpoint switch to project-level member data; field name change is a documented breaking difference |
| Roles extracted as name strings only (no IDs, no default access levels) | Roles extracted with IDs + default access levels from per-project industry_roles endpoint | MEM-05 + ROLE-03 requirements; enables Phase 5 permission analysis |

---

## Validation Architecture

`vitest.config.ts` exists. `nyquist_validation` not in `config.json` (only `"research": true`), so formal Validation Architecture section is skipped. However, tests are needed for correctness-critical mapping logic.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.6 |
| Config file | `vitest.config.ts` (exists, `tsconfigPaths: true`, `environment: node`) |
| Quick run command | `npx vitest run lib/acc/quick-sync-extraction.test.ts` |
| Full suite command | `npx vitest run` |

### Minimum Required Tests for Phase 2

| Function | Test Type | File | Rationale |
|----------|-----------|------|-----------|
| `normalizeProducts(raw)` | unit | `quick-sync-extraction.test.ts` | Maps 9 known product keys; wrong mapping silently corrupts module access display |
| `buildCacheBlob(...)` | unit | `quick-sync-extraction.test.ts` | Must match `BulkAccUser` shape exactly; `buildAccGraphSnapshot` consumes it |
| Role name → ID linking | unit | `quick-sync-extraction.test.ts` | Mismatch means `AccProjectRole` never written |
| `?fields=` absent detection (runtime) | unit | `quick-sync-extraction.test.ts` | Prevents silent null-lastSignIn bug |
| Soft-delete detection | unit | `quick-sync-extraction.test.ts` | Set-difference logic for inactive project marking |

---

## Open Questions

1. **`companyRole` source for cache blob** — Recommended answer above: use `fetchAllAccUsers` one-time prefetch. If this is too slow, drop to null. Must be decided before Task implementation.

2. **First sync performance on LECG hub** — Unknown: how many projects does the LECG hub have? If >30 projects, the 5-minute timeout could be tight. First run should be monitored in Railway logs. No mitigation needed until measured.

3. **Products API key variants** — HOW_TO_Extract_Project_Members.md lists two aliases: `docs` AND `documentManagement`, `build` AND `fieldManagement`, `cost` AND `costManagement`. The normalizer must handle both aliases. **Recommendation:** Normalize all aliases to a canonical key at ingest (e.g., `documentManagement` → `docs`) so the Prisma Json column is stable.

4. **HQ v2 industry_roles response shape** — HOW_TO_Extract_All_Roles.md shows `role.services.document_management.access_level`. The actual JSON key may use snake_case (`document_management`) or camelCase depending on APS API version. First sync should log the raw shape of one role response for verification. **Mitigation:** Code should handle both `role.services?.document_management?.access_level` and `role.services?.documentManagement?.access_level`.

5. **AccRole.id as PK vs hub role ID format** — `AccRole.id @id` stores the APS role ID. The HQ v2 response field for role ID may be `id` or `uid`. Verify against HOW_TO_Extract_All_Roles.md sample: `RoleId: role.id` — this is confirmed. The concern is whether this is a UUID or an opaque string — it is opaque; treat as string.

---

## Sources

### Primary (HIGH confidence)
- `APS_DOCS/HOW TO/HOW_TO_Extract_Project_Members.md` — member endpoint, field mapping, products array shape, pagination pattern (offset/limit/sentinel)
- `APS_DOCS/HOW TO/HOW_TO_Extract_Project_Info.md` — projects endpoint, field mapping, pagination (100/page)
- `APS_DOCS/HOW TO/HOW_TO_Extract_All_Roles.md` — hub + per-project industry_roles endpoints, services.document_management.access_level shape
- `APS_DOCS/HOW TO/HOW_TO_Extract_Last_Sign_In.md` — `?fields=` requirement for lastSignIn, camelCase vs snake_case distinction
- `lib/server/acc-admin.ts` — fetchWithRetry, fetchAccPaged, fetchHqUsers, fetchAllAccUsers (all reusable)
- `lib/acc/graphSnapshot.ts` — buildAccGraphSnapshot cache blob shape (the consumer Phase 2 must not break)
- `server/routers/users.ts:1047-1210` — canonical v1.0 bulkAccSync implementation (dual-write shape, pLimit(3) precedent)
- `lib/acc/acc-types.ts` — BulkAccUser / BulkAccProject interface (cache blob shape definition)
- `prisma/schema.prisma` — AccProject, AccProjectMember, AccRole, AccProjectRole column definitions
- `scripts/release.cjs` — Phase 1 shell; `runQuickSyncShell()` to be replaced; spawnSync tsx pattern
- `.planning/research/PITFALLS.md` — Pitfalls 4, 5 (dual-write cutover, lastSignIn ?fields=), pitfall-to-phase mapping

### Secondary (MEDIUM confidence)
- APS web search: pagination max limit 200 for `/accounts/:id/projects` (confirmed by "Autodesk APS construction/admin/v1 pagination" search; consistent with HOW_TO docs using 100)
- APS web search: 429 responses include `Retry-After` header (confirmed by APS rate limits blog post; handled by existing `fetchWithRetry`)

### Tertiary (LOW confidence — flag for first-sync verification)
- HQ v2 industry_roles response field names (snake_case vs camelCase for services) — HOW_TO shows `document_management` but may vary; log raw shape on first run
- `companyRole` availability from per-project endpoint — expected to be absent (v1.0 pattern fetched it from HQ v1 separately); verify absence on first run

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all patterns established in existing codebase
- Architecture: HIGH — project-centric order forced by FK constraints; extraction patterns verified in HOW_TO docs + existing code
- Pitfalls: HIGH — Pitfall 5 (`?fields=`) verified in two HOW_TO files + .planning/research/PITFALLS.md; dual-write shape verified by reading actual consumer code
- Open questions: MEDIUM — require first-sync measurement to resolve (performance, field name variants)

**Research date:** 2026-05-11
**Valid until:** 2026-06-11 (30 days; APS API stable; HOW_TO docs are scraped authoritative source)
