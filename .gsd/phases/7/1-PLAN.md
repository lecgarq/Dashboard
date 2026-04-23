---
phase: 7
plan: 1
wave: 1
---

# Plan 7.1: Bulk ACC Cache Prefetch + "No Projects" Filter

## Objective
Enable the General tab of the Users section to work as an analysis space — not just a list.
The key deliverable is a new tRPC endpoint `users.bulkAccSummary` that reads **all**
`AccMemberCache` rows in a single DB query, computes a lightweight summary per user
(projectCount, activeCount, isAdmin, syncedAt), and exposes a boolean `hasNoProjects`
flag. This powers an instant filter in the UI with zero per-user API waits.

## Context
- `server/routers/users.ts` — add new procedure `bulkAccSummary`
- `prisma/schema.prisma` — `AccMemberCache` model (email, data: Json, syncedAt)
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — add filter chip + badge to General tab
- `app/(dashboard)/users/AccProfileSection.tsx` — reference for cached data shape

## Tasks

<task type="auto">
  <name>Add tRPC procedure: bulkAccSummary</name>
  <files>server/routers/users.ts</files>
  <action>
    Add a new `adminProcedure` called `bulkAccSummary` to `usersRouter`.

    It must:
    1. Query ALL `AccMemberCache` rows: `ctx.db.accMemberCache.findMany({ select: { email, data, syncedAt } })`
    2. For each row, parse `data` as JSON. The shape is:
       `{ found: boolean, projects?: Array<{ status: string, isAdmin: boolean }>, syncedAt: string }`
    3. Return an array of:
       ```ts
       {
         email: string
         found: boolean
         projectCount: number      // projects.length (0 if not found)
         activeCount: number       // projects.filter(p => p.status === "active").length
         adminCount: number        // projects.filter(p => p.isAdmin).length
         hasNoProjects: boolean    // found === true && projectCount === 0
         syncedAt: string          // ISO string from cache row
       }
       ```
    4. Return empty array (not throw) if no cache rows exist yet.
    5. Do NOT call Autodesk API — read only from DB cache.

    Avoid: adding a new import, the router already has all needed deps.
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "bulkAccSummary|users.ts"</verify>
  <done>TypeScript compiles clean; procedure is exported from usersRouter</done>
</task>

<task type="auto">
  <name>Add "No Projects" filter chip to General tab UI</name>
  <files>app/(dashboard)/users/UsersDirectoryClient.tsx</files>
  <action>
    1. Call `trpc.users.bulkAccSummary.useQuery()` near the top of `UsersDirectoryClient`.
       Store result as `accSummaryMap` — convert array to `Map<string, SummaryItem>` keyed by email using `useMemo`.

    2. Add a `filterNoProjects` boolean state (default `false`).

    3. In the filter bar area (near the existing search input), add a chip button:
       ```
       [⚠ No ACC Projects ({count})]
       ```
       Where `count` = number of users in the current org directory whose email
       appears in `accSummaryMap` with `hasNoProjects === true`.
       Style: amber border, amber text when active; muted when inactive.
       Clicking toggles `filterNoProjects`.

    4. Apply `filterNoProjects` to the filtered person list:
       when active, only show persons whose email has `hasNoProjects === true` in the map.
       When a user has no cache entry at all, exclude them from this filter (not same as "no projects").

    5. On each person card in list/grid view, when `accSummaryMap` has an entry for that
       person's email, show a small badge:
       - Green dot + "440 projects" if projectCount > 0
       - Amber "⚠ No projects" badge if hasNoProjects === true
       - Nothing if email not in map yet (cache not loaded for that user)

    Avoid: do not break existing search/group/sort logic — apply `filterNoProjects`
    as an additional AND condition after existing filters.
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "UsersDirectoryClient"</verify>
  <done>TypeScript clean; filter chip renders; toggling it changes visible user count</done>
</task>

## Success Criteria
- [ ] `bulkAccSummary` returns project summaries for all cached users from DB in one query
- [ ] "No ACC Projects" chip appears in the General tab filter bar
- [ ] Clicking the chip instantly shows only users with 0 ACC projects (no API calls)
- [ ] User cards show project count badge from cache when available
- [ ] TypeScript compiles with no errors in modified files
