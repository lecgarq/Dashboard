# Phase 6: ACC Project Intelligence - Research

**Researched:** 2026-04-22
**Domain:** Autodesk Construction Cloud (ACC) Admin API, tRPC, Prisma, React modal UI
**Confidence:** MEDIUM (ACC API docs not directly renderable — verified via official SDK source, official blog posts, and tutorial code)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| REQ-06 | Show per-user ACC presence (hub member status, project memberships, roles per project, module/product access) in PersonDetailModal | ACC Admin API endpoints identified; token infrastructure already exists; DB caching strategy documented; UI integration point confirmed at line 262 of UsersDirectoryClient.tsx |
</phase_requirements>

---

## Summary

Phase 6 adds an "Autodesk" section to the PersonDetailModal in the Users tab. When an admin clicks any person, the modal queries the ACC Admin API using the *currently logged-in admin user's* 3-legged OAuth token (already stored in the Account table) to look up whether that person's email exists as a hub member, which projects they belong to, their role per project, and which ACC modules/products they can access.

The key technical insight is that this is **hub-admin-scope data access**, not a per-user login. The admin's token (with `account:read` scope, already provisioned) is used to call ACC Admin APIs on behalf of the organization. The target person is matched by email — both Google Directory and ACC use the same company domain.

The `@aps_sdk/construction-account-admin` package provides a typed client for all required endpoints. However, the codebase pattern already uses raw `fetch` with `fetchApsJson()` (from `aps-search.ts`) rather than the APS SDK, which is the right pattern to follow for consistency. No new SDK packages are needed. Caching should use Prisma (persistent across server restarts) with a `syncedAt` timestamp and an on-demand refresh button, because Redis TTL-only caching would lose data between Railway restarts.

**Primary recommendation:** Add a `getAccProfile(email)` tRPC procedure to the existing `usersRouter` (not a new router) that queries ACC Admin API live (with DB cache), and add an `AccProfileSection` component inside `PersonDetailModal`.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tRPC | Already in use | API procedure for `users.getAccProfile` | Matches all existing router patterns |
| Prisma | Already in use | Cache ACC data in new `AccMemberCache` table | Already the DB layer; survives restarts |
| `@upstash/redis` (getRedis) | Already in use | Optional secondary cache key for fast repeat reads | Matches `aps-search.ts` pattern |
| Zod | Already in use | Input validation for `email` param | Matches all procedures |
| `lucide-react` | Already in use | Icons in the new Autodesk section UI | Matches modal icon style |
| `fetchApsJson` (internal) | Project utility | Raw fetch wrapper with error normalization | Already handles 401/403 reconnect flow |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getValidAutodeskAccessToken` (internal) | Project utility | Get admin's 3-legged APS token | Called from every ACC Admin API call |
| `pLimit` | Already in use (aps-search.ts) | Concurrency control when fetching users across N projects | If fetching project membership per-project in parallel |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw fetch + fetchApsJson | `@aps_sdk/construction-account-admin` | SDK not yet installed; raw fetch is consistent with aps-search.ts and avoids adding a large dep |
| Prisma cache | Redis-only cache | Redis TTL expires; Prisma survives restarts and is queryable |
| New `accRouter` | Extend `usersRouter` | Feature is logically a user detail enrichment — no need for a new router namespace |

**Installation:**
```bash
# No new packages needed — all dependencies already in project
```

---

## Architecture Patterns

### Recommended File Structure

```
server/routers/users.ts              # Add getAccProfile procedure here (extend existing)
lib/server/acc-admin.ts              # New: fetchApsJson wrappers for ACC Admin endpoints
prisma/schema.prisma                 # Add AccMemberCache model
prisma/migrations/YYYYMMDD.../       # Auto-generated migration
app/(dashboard)/users/
  UsersDirectoryClient.tsx           # Modify PersonDetailModal to include AccProfileSection
  AccProfileSection.tsx              # New client component for the Autodesk section
```

### Pattern 1: ACC Admin API — Hub Lookup Flow

**What:** Fetch ACC data for a person by email using the admin's token
**When to use:** Called from `users.getAccProfile(email)` tRPC procedure

```typescript
// Source: acc-admin-tutorial-nodejs (official APS tutorial) + aps-search.ts pattern
// Step 1: Get admin's token
const { accessToken } = await getValidAutodeskAccessToken(ctx.session.user.id);

// Step 2: Get hub/account ID from Project table (stored as apsHubId)
const project = await ctx.db.project.findFirst({ select: { apsHubId: true } });
const hubId = project?.apsHubId; // format: "b.XXXXXXXX-..."
// Strip "b." prefix for Admin API: accountId = hubId.replace(/^b\./, "")
const accountId = hubId?.replace(/^b\./, "") ?? null;

// Step 3: Search account users by email
// ACC Admin API: GET /construction/admin/v1/accounts/{accountId}/users?email={email}
const usersUrl = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/users?email=${encodeURIComponent(email)}&limit=20`;
const usersPayload = await fetchApsJson(usersUrl, accessToken);
// returns { pagination: { limit, offset, totalResults }, results: [{ autodeskId, email, name, status, ... }] }

// Step 4: Get projects for that user
// ACC Admin API: GET /construction/admin/v1/accounts/{accountId}/users/{userId}/projects
const userId = usersPayload.results?.[0]?.autodeskId;
const projectsUrl = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/users/${userId}/projects?limit=100`;
const projectsPayload = await fetchApsJson(projectsUrl, accessToken);
// returns { results: [{ id, name, roles: [{id, name}], products/services }] }

// Step 5: Get products for that user
// ACC Admin API: GET /construction/admin/v1/accounts/{accountId}/users/{userId}/products
const productsUrl = `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountId}/users/${userId}/products?limit=100`;
const productsPayload = await fetchApsJson(productsUrl, accessToken);
// returns { results: [{ id, name, status, projectIds }] }
```

### Pattern 2: DB Cache with Refresh-on-Demand

**What:** Store fetched ACC profile in Prisma with `syncedAt` timestamp; re-fetch if stale or if user clicks "Refresh"
**When to use:** Every call to `getAccProfile`

```typescript
// Source: project pattern from aps-search.ts (cache + TTL logic adapted for Prisma)
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Check cache
const cached = await ctx.db.accMemberCache.findUnique({ where: { email } });
const isStale = !cached || (Date.now() - cached.syncedAt.getTime() > CACHE_MAX_AGE_MS);

if (!isStale && !input.forceRefresh) {
  return JSON.parse(cached.data); // return cached profile
}

// Fetch fresh from ACC Admin API
const freshData = await fetchAccProfile(email, accessToken, accountId);

// Upsert to DB
await ctx.db.accMemberCache.upsert({
  where: { email },
  create: { email, data: JSON.stringify(freshData), syncedAt: new Date() },
  update: { data: JSON.stringify(freshData), syncedAt: new Date() },
});

return freshData;
```

### Pattern 3: tRPC Procedure Definition

**What:** Add to existing `usersRouter` in `server/routers/users.ts`

```typescript
// Following protectedProcedure pattern from existing usersRouter
getAccProfile: protectedProcedure
  .input(z.object({
    email: z.string().email(),
    forceRefresh: z.boolean().optional().default(false),
  }))
  .query(async ({ input, ctx }) => {
    // ... cache check + ACC Admin API calls
  }),
```

### Pattern 4: Modal Section Component

**What:** Add `AccProfileSection` below the contact info section in `PersonDetailModal`
**When to use:** When modal is open and `person` is set

```tsx
// Lazy-load the ACC data only when modal is open
// Source: pattern matching InfoRow usage in UsersDirectoryClient.tsx line 230-260
function AccProfileSection({ email }: { email: string }) {
  const { data, isLoading, refetch } = trpc.users.getAccProfile.useQuery(
    { email },
    { enabled: true, staleTime: 5 * 60 * 1000, retry: false }
  );

  if (isLoading) return <AccSectionSkeleton />;
  if (!data?.found) return <p className="text-xs text-muted-foreground">Not found in ACC hub</p>;

  return (
    <div className="space-y-3 pt-4 border-t border-border">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Autodesk ACC</h3>
        <button onClick={() => refetch()} className="text-[10px] text-primary hover:underline">Refresh</button>
      </div>
      {/* project list with roles and products */}
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Fetching ALL projects then filtering:** ACC Admin API can return thousands of projects per hub. Use the per-user endpoint `GET /accounts/{accountId}/users/{userId}/projects` instead of scanning all projects.
- **Using the project's own `apsProjectId` to look up ACC members:** That gives you one project only. Use account-level endpoints to get the person's full hub presence.
- **Storing access tokens in the AccMemberCache:** Only store the resolved profile data. Tokens are in the `Account` table separately.
- **Fetching ACC data on every modal open without cache:** The API is slow and rate-limited. Always check the DB cache first.
- **Using hub_id (b.XXX format) directly in Admin API:** The Admin API uses the `accountId` which is the hub_id with the `b.` prefix stripped.

---

## ACC Admin API Endpoint Reference

### Verified Endpoints (MEDIUM confidence — verified via official tutorial code, blog posts, SDK exports)

| Endpoint | Purpose | Scope Required |
|----------|---------|----------------|
| `GET /construction/admin/v1/accounts/{accountId}/users?email={email}` | Search account members by email | `account:read` |
| `GET /construction/admin/v1/accounts/{accountId}/users/{userId}/projects` | Get all projects for a specific user | `account:read` |
| `GET /construction/admin/v1/accounts/{accountId}/users/{userId}/products` | Get all ACC products/modules for a user | `account:read` |
| `GET /construction/admin/v1/accounts/{accountId}/users/{userId}/roles` | Get all roles for a user across projects | `account:read` |
| `GET /construction/admin/v1/accounts/{accountId}/projects/{projectId}/users` | List all users in a project (alternative approach) | `account:read` |

**Base URL:** `https://developer.api.autodesk.com`

**Legacy BIM360 endpoint (fallback for older accounts):**
`GET /bim360/admin/v1/projects/{projectId}/users` — scope: `account:read`

### Pagination Pattern (VERIFIED via tutorial code)
```typescript
// Confirmed pattern from aps-acc-admin-tutorial-nodejs/services/aps.js
let offset = 0;
do {
  const resp = await fetchApsJson(`${url}&limit=200&offset=${offset}`, accessToken);
  allResults.push(...(resp.results ?? []));
  offset += resp.pagination?.limit ?? 200;
} while (offset < (resp.pagination?.totalResults ?? 0));
```

### Known Response Fields (MEDIUM confidence — from blog post examples and SDK type names)

**User search result (`/accounts/{accountId}/users`):**
- `autodeskId` — Autodesk user UUID (use this as `userId` in subsequent calls)
- `email` — email address
- `name` — display name
- `status` — `active` | `inactive` | `pending`

**User projects result (`/accounts/{accountId}/users/{userId}/projects`):**
- `id` — project UUID (with `b.` prefix in Data Mgmt format)
- `name` — project name
- `roles` — array of `{ id, name, roleGroupId }` — the user's roles in this project
- `status` — project status (active/archived)

**User products result (`/accounts/{accountId}/users/{userId}/products`):**
- `id` — product UUID
- `name` — product/module name (e.g., `"documentManagement"`, `"build"`, `"cost"`, `"designCollaboration"`)
- `status` — `active` | `inactive`
- `projectIds` — array of project UUIDs where this product is active for the user

**NOTE:** Product name mapping between BIM360 and ACC/Forma projects differs:
- BIM360 uses: `fieldManagement`, `documentManagement`
- ACC uses: `build`, `docs`
Consult the [field guide](https://aps.autodesk.com/en/docs/acc/v1/overview/field-guide/admin/) when rendering friendly names.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token refresh | Custom refresh logic | `getValidAutodeskAccessToken()` already in `lib/server/aps-user-token.ts` | Handles expiry, refresh, DB update |
| Error normalization | Custom error handler | `toApsRouterError()` + `IntegrationError` from `aps-search.ts` | Already handles 401/403/502 reconnect flows |
| Pagination | Manual while loop | Copy the do-while offset pattern from tutorial | Edge case: empty first page, totalResults=0 |
| ACC data caching | Redis TTL only | Prisma `AccMemberCache` table | Redis evicts on restart; Prisma persists |
| Hub/account ID | Hard-code from env | `ctx.db.project.findFirst({ select: { apsHubId: true } })` | Already stored from APS env var; accessible in procedure |

---

## Common Pitfalls

### Pitfall 1: `b.` Prefix on Hub ID
**What goes wrong:** Data Management API returns hub IDs as `b.XXXXXXXX-...` but the ACC Admin API requires the bare UUID `XXXXXXXX-...` as `accountId`.
**Why it happens:** Two different API families use different ID conventions.
**How to avoid:** Strip `b.` prefix: `const accountId = hubId.replace(/^b\./, "")`.
**Warning signs:** 404 or 400 from `/construction/admin/v1/accounts/{id}/users`.

### Pitfall 2: Admin Token Required
**What goes wrong:** `account:read` scope works only if the linked Autodesk account is an Account Admin in the hub. If the admin connected a non-admin account, all ACC Admin API calls return 403.
**Why it happens:** The ACC Admin API requires hub admin privileges, not just any authenticated user.
**How to avoid:** Display a clear "Admin privileges required" error message instead of a generic failure. Check `error.code === "reconnect_required"` from `IntegrationError`.
**Warning signs:** 403 responses despite valid token.

### Pitfall 3: Email Not Found vs. API Error
**What goes wrong:** If the searched email has no ACC account, the API returns `{ results: [], pagination: { totalResults: 0 } }` — NOT a 404 error.
**Why it happens:** It's a search endpoint, not a direct lookup.
**How to avoid:** Check `usersPayload.results?.length === 0` before proceeding. Return `{ found: false }` to the UI.

### Pitfall 4: Deleted/Inactive Roles Polluting the List
**What goes wrong:** ACC includes inactive/removed roles in the `roles` array on project users. Deleted roles have `"(Removed)"` appended to their name in the API response (confirmed in official blog post).
**Why it happens:** ACC doesn't filter them out by default.
**How to avoid:** Filter roles where `name.includes("(Removed)")` or filter by status if available. The Data Connector API provides cleaner role status data but requires a separate pipeline.

### Pitfall 5: Large Hub — Many Projects
**What goes wrong:** Hub has 50+ projects. Per-project user listing to find one person is O(N×M) — very slow.
**Why it happens:** Wrong approach. Per-user endpoints (`/users/{userId}/projects`) are O(1) for the person lookup.
**How to avoid:** Use the per-user projects endpoint, not per-project member listing.

### Pitfall 6: No Autodesk Account Linked
**What goes wrong:** Procedure calls `getValidAutodeskAccessToken(ctx.session.user.id)` but the currently logged-in admin has not linked their Autodesk account.
**Why it happens:** Not all dashboard users have linked Autodesk.
**How to avoid:** Catch `IntegrationError` with `code === "config_missing"` or `"reconnect_required"` and surface "Link your Autodesk account in Settings" message to the admin.

### Pitfall 7: AccMemberCache migration conflicts
**What goes wrong:** Running a migration that adds `AccMemberCache` table with unique constraint on `email` may conflict if the Railway DB is not accessible during deploy.
**Why it happens:** Railway runs `prisma migrate deploy` on startup.
**How to avoid:** Write the migration as a standard `CREATE TABLE IF NOT EXISTS` — Prisma handles this correctly via `prisma migrate dev`.

---

## Code Examples

### Hub ID Resolution + accountId Extraction
```typescript
// Source: server/routers/project.ts pattern — apsHubId is env-seeded
const project = await ctx.db.project.findFirst({ select: { apsHubId: true } });
if (!project?.apsHubId) {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "APS Hub ID not configured." });
}
// Data Management hubs have "b." prefix; ACC Admin API uses bare UUID
const accountId = project.apsHubId.replace(/^b\./, "");
```

### Full getAccProfile Procedure Skeleton
```typescript
// Source: pattern from server/routers/aps-search.ts
getAccProfile: protectedProcedure
  .input(z.object({
    email: z.string().email(),
    forceRefresh: z.boolean().optional().default(false),
  }))
  .query(async ({ input, ctx }) => {
    const { email, forceRefresh } = input;
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

    // 1. Cache check
    if (!forceRefresh) {
      const cached = await ctx.db.accMemberCache.findUnique({ where: { email } });
      if (cached && Date.now() - cached.syncedAt.getTime() < CACHE_TTL_MS) {
        return JSON.parse(cached.data as string);
      }
    }

    // 2. Get admin token
    let accessToken: string;
    try {
      ({ accessToken } = await getValidAutodeskAccessToken(ctx.session.user.id));
    } catch (error) {
      throw toApsRouterError(error, "ACC Admin API: Autodesk token unavailable.");
    }

    // 3. Get accountId
    const project = await ctx.db.project.findFirst({ select: { apsHubId: true } });
    const accountId = project?.apsHubId?.replace(/^b\./, "");
    if (!accountId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Hub not configured." });

    // 4. Search user by email
    const usersPayload = await fetchApsJson(
      `${ACC_ADMIN_BASE}/accounts/${accountId}/users?email=${encodeURIComponent(email)}&limit=20`,
      accessToken
    );
    const accUser = usersPayload.results?.[0] ?? null;

    if (!accUser) {
      const result = { found: false, syncedAt: new Date().toISOString() };
      await ctx.db.accMemberCache.upsert({
        where: { email },
        create: { email, data: JSON.stringify(result), syncedAt: new Date() },
        update: { data: JSON.stringify(result), syncedAt: new Date() },
      });
      return result;
    }

    // 5. Fetch user's projects + products in parallel
    const [projectsPayload, productsPayload] = await Promise.all([
      fetchApsJson(`${ACC_ADMIN_BASE}/accounts/${accountId}/users/${accUser.autodeskId}/projects?limit=200`, accessToken),
      fetchApsJson(`${ACC_ADMIN_BASE}/accounts/${accountId}/users/${accUser.autodeskId}/products?limit=100`, accessToken),
    ]);

    const result = {
      found: true,
      autodeskId: accUser.autodeskId,
      name: accUser.name,
      status: accUser.status,
      projects: projectsPayload.results ?? [],
      products: productsPayload.results ?? [],
      syncedAt: new Date().toISOString(),
    };

    await ctx.db.accMemberCache.upsert({
      where: { email },
      create: { email, data: JSON.stringify(result), syncedAt: new Date() },
      update: { data: JSON.stringify(result), syncedAt: new Date() },
    });

    return result;
  }),
```

### Prisma Schema Addition
```prisma
// Add to prisma/schema.prisma after existing models
model AccMemberCache {
  id        String   @id @default(cuid())
  email     String   @unique
  data      Json     // serialized AccProfile (found/not-found, projects, products)
  syncedAt  DateTime
  createdAt DateTime @default(now())

  @@index([email])
  @@index([syncedAt])
}
```

### PersonDetailModal Integration
```tsx
// Source: UsersDirectoryClient.tsx line 330 — insert after contact info block, before quick actions
// The section mounts only when the modal opens (person is set)
<div className="space-y-3 pt-4 border-t border-border">
  <AccProfileSection email={person.email} />
</div>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BIM 360 Admin API (`/bim360/admin/v1`) | ACC Admin API (`/construction/admin/v1`) | 2022-2024 | Use new endpoint; BIM360 legacy still works for older accounts |
| SDK: `@aps_sdk/construction-account-admin` wrapped calls | Raw `fetch` + `fetchApsJson` | N/A for this project | Consistent with existing codebase pattern; SDK is optional |
| Per-project member scan | Per-user projects/products endpoints | API update ~2023-2024 | Dramatically faster — O(1) rather than O(N projects) |

**Deprecated/outdated:**
- `GET /bim360/admin/v1/projects/{id}/users`: Works for BIM360 accounts but is the legacy path; prefer `/construction/admin/v1` for ACC accounts.
- Industry roles endpoint `GET /projects/:project_id/industry_roles`: Not supported for Forma/ACC projects per official docs.

---

## Open Questions

1. **Does the admin's 3-legged token have Account Admin privilege?**
   - What we know: The token has `account:read` scope (confirmed in `lib/server/aps-user-token.ts` DEFAULT_AUTODESK_SCOPES).
   - What's unclear: Whether the specific Autodesk account linked by the dashboard admin is designated as an Account Admin in the ACC hub. This is a user/org configuration question, not a code question.
   - Recommendation: Wrap all ACC Admin API calls in try/catch; surface a specific "Account Admin privileges required" UI state when a 403 is returned.

2. **Exact response shape of `/accounts/{accountId}/users/{userId}/projects`**
   - What we know: Returns `{ results: [...], pagination: {...} }`. Each result includes project info and roles.
   - What's unclear: Whether product/service access is embedded in the projects response or requires the separate `/products` call.
   - Recommendation: Call both `/projects` and `/products` endpoints; merge by `projectId` in application logic. This is safer.

3. **BIM 360 vs ACC project type detection**
   - What we know: Product names differ between BIM360 projects (`fieldManagement`, `documentManagement`) and ACC projects (`build`, `docs`).
   - What's unclear: Whether the hub has a mix of both.
   - Recommendation: Build a product name mapping table at implementation time; display raw name if no mapping found rather than silently hiding it.

4. **User not found: cached permanently or re-checked?**
   - What we know: Cache TTL is 24 hours.
   - What's unclear: Whether the admin wants people not found in ACC to be re-checked automatically or only on manual refresh.
   - Recommendation: Cache `{ found: false }` for 24 hours same as positive results; provide the Refresh button for on-demand re-check.

---

## Sources

### Primary (HIGH confidence)
- `lib/server/aps-user-token.ts` — confirms `account:read` scope is already in the token; confirms `getValidAutodeskAccessToken()` API
- `server/routers/aps-search.ts` — confirms `fetchApsJson`, `toApsRouterError`, Redis caching pattern, pLimit usage
- `server/routers/project.ts` — confirms `apsHubId` stored via `process.env["APS_HUB-ID"]`
- `prisma/schema.prisma` — confirms no `AccMemberCache` table exists yet; confirms Prisma `Json` type support
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — confirms `PersonDetailModal` structure; identifies insertion point at line 330

### Secondary (MEDIUM confidence)
- [get-started.aps.autodesk.com/tutorials/acc-issues/admin/](https://get-started.aps.autodesk.com/tutorials/acc-issues/admin/) — Official APS tutorial; confirms `adminClient.getProjectUsers()` pagination pattern with `offset`/`limit`/`totalResults`
- [aps.autodesk.com/blog/acc-admin-api-new-apis-list-all-products-roles-specified-user](https://aps.autodesk.com/blog/acc-admin-api-new-apis-list-all-products-roles-specified-user) — Official APS blog; confirms `/accounts/{accountId}/users/{userId}/products` and `/roles` endpoints with `account:read` scope requirement
- [aps.autodesk.com/blog/acc-api-best-practices-accessing-and-assigning-roles-acc-projects](https://aps.autodesk.com/blog/acc-api-best-practices-accessing-and-assigning-roles-acc-projects) — Official blog; confirms deleted roles have "(Removed)" in name; recommends Data Connector for clean role status
- [aps.autodesk.com/blog/acc-admin-api-get-projects-and-project-users](https://aps.autodesk.com/blog/acc-admin-api-get-projects-and-project-users) — Official blog; confirms GET projects and GET project users endpoints structure

### Tertiary (LOW confidence — needs validation during implementation)
- `construction/admin/v1` as the base API path (not `bim360/admin/v1`) — inferred from SDK export names, blog references, and official tutorials; actual URL template not directly confirmed from rendered docs (Autodesk doc pages use client-side rendering that blocks WebFetch)
- Exact JSON field names (`autodeskId`, `roles`, `products`, `projectIds`) — from SDK type name conventions and blog post JSON excerpts; validate by making a live API call in implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libs are already in the codebase; no new deps required
- Architecture: HIGH — follows identical patterns to `aps-search.ts`; all integration points confirmed from source reading
- ACC API endpoints: MEDIUM — confirmed from official tutorials and blog posts; exact field names need live validation
- Pitfalls: MEDIUM — derived from official docs, community posts, and existing codebase behavior

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (ACC API is stable; endpoint paths unlikely to change in 30 days)
