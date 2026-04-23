---
phase: 7
plan: 2
wave: 1
---

# Plan 7.2: ACC Analysis Module — Hub-Wide Permission Intelligence

## Objective
Build a new `ACC Analysis` tab inside the Users section. This is a dedicated analytical
dashboard that computes cross-user permission intelligence from all cached ACC data in one
pass. It surfaces: total unique roles, users per role, duplicate-role users, multi-role
users per project, module-access combination fingerprints, and outlier patterns. All
computation happens client-side from the `bulkAccSummary` data + an extended version of
it that includes roles/modules detail.

## Context
- `server/routers/users.ts` — extend `bulkAccSummary` to include roles[] and modules[] per project
- `app/(dashboard)/users/UsersDirectoryClient.tsx` — add "ACC Analysis" tab alongside General
- `app/(dashboard)/users/AccAnalysisPanel.tsx` — NEW file, the analysis panel component
- `app/(dashboard)/users/AccProfileSection.tsx` — reference for data shape patterns

## Tasks

<task type="auto">
  <name>Extend bulkAccSummary to include roles + modules detail</name>
  <files>server/routers/users.ts</files>
  <action>
    Modify the `bulkAccSummary` procedure created in Plan 7.1.

    The `AccMemberCache.data` JSON already contains:
    `{ found, name?, projects: [{ id, name, status, isAdmin, roles: string[], modules: string[] }] }`

    Extend the return type per user to include:
    ```ts
    {
      email: string
      name: string          // from data.name or ""
      found: boolean
      projectCount: number
      activeCount: number
      adminCount: number
      hasNoProjects: boolean
      syncedAt: string
      // NEW:
      allRoles: string[]    // deduplicated flat list of all role names across all projects
      allModules: string[]  // deduplicated flat list of all module keys across all projects
      projects: Array<{     // full project list for cross-analysis
        id: string
        name: string
        status: string
        isAdmin: boolean
        roles: string[]
        modules: string[]
      }>
    }
    ```

    The plan 7.1 UI (filter chip + badges) should still work — the extra fields are additive.
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "bulkAccSummary|users.ts"</verify>
  <done>TypeScript clean; return type includes allRoles, allModules, projects</done>
</task>

<task type="auto">
  <name>Build AccAnalysisPanel component + wire into Users tab navigation</name>
  <files>
    app/(dashboard)/users/AccAnalysisPanel.tsx (NEW)
    app/(dashboard)/users/UsersDirectoryClient.tsx
  </files>
  <action>
    ## 1. Create AccAnalysisPanel.tsx

    This component receives `users: BulkAccUser[]` as a prop (the array from bulkAccSummary).
    It computes all metrics via `useMemo` and renders a 2-column dashboard grid.

    ### Computed metrics (all via useMemo from the users array):

    ```ts
    const metrics = useMemo(() => {
      const cachedUsers = users.filter(u => u.found)

      // Role inventory
      const roleSet = new Set(cachedUsers.flatMap(u => u.allRoles))
      const roleFrequency = Map<roleName, count of users who have it>
      const usersWithDuplicateRoles = cachedUsers.filter(u => {
        // "duplicate role" = same role name appears in >1 project for this user
        const roleCounts = countBy(u.projects.flatMap(p => p.roles))
        return Object.values(roleCounts).some(c => c > 1)
      })
      const usersWithMultipleRolesInSameProject = cachedUsers.filter(u =>
        u.projects.some(p => p.roles.length > 1)
      )

      // Module access combinations (fingerprint = sorted module keys joined)
      const moduleFingerprints = Map<fingerprint, count>
      cachedUsers.forEach(u => {
        u.projects.forEach(p => {
          const fp = [...p.modules].sort().join("|")
          moduleFingerprints.set(fp, (moduleFingerprints.get(fp) ?? 0) + 1)
        })
      })
      // Outlier = fingerprint that appears only once (non-repeated pattern)
      const outlierFingerprints = [...moduleFingerprints.entries()].filter(([,c]) => c === 1)

      // Projects
      const allProjectIds = new Set(cachedUsers.flatMap(u => u.projects.map(p => p.id)))

      return {
        totalCachedUsers: cachedUsers.length,
        totalRoles: roleSet.size,
        roleFrequency,           // for role breakdown table
        usersWithDuplicateRoles, // list for drilling down
        usersWithMultiRoleProjects: usersWithMultipleRolesInSameProject,
        totalProjects: allProjectIds.size,
        moduleCombinations: moduleFingerprints.size,
        outlierCombinations: outlierFingerprints,
        noProjectUsers: users.filter(u => u.hasNoProjects),
      }
    }, [users])
    ```

    ### UI Layout — premium dark card grid:

    **Row 1: 5 KPI stat cards** (matching existing StatCard visual style from AccProfileSection):
    - Total ACC Users (blue)
    - Total Unique Roles (violet)
    - Users w/ Duplicate Roles (amber, clickable to expand list)
    - Total Hub Projects (green)
    - Unique Module Combinations (cyan)

    **Row 2: Two side-by-side panels**

    Left — "Role Frequency Table":
    - Sortable table: Role Name | # Users | % of total
    - Rows are clickable → expands inline to show which users have it
    - Highlight roles with only 1 user (potential orphan)

    Right — "Multi-Role Projects":
    - List of users who have >1 role in the same project
    - Per user: name, project name, list of roles
    - Badge "X projects affected"

    **Row 3: Module Access Patterns**
    - Shows top 10 most-common module fingerprints as horizontal bar chart (CSS widths, no library)
    - Each bar shows: fingerprint label (abbreviate module names) | count | percentage
    - Outlier section below: list fingerprints appearing only once with the user + project name

    **Row 4: Users Without Projects**
    - If noProjectUsers.length > 0: table of name, email, syncedAt
    - "Force Refresh All" button that calls `utils.users.bulkAccSummary.invalidate()` 
      (does not call Autodesk — just marks cache stale for UI refetch)

    Use existing design tokens: `bg-card`, `border-border/30`, `text-foreground`,
    `text-muted-foreground`, same `StatCard` component pattern from AccProfileSection.
    Add a `[Refresh Analysis]` button top-right that calls `refetch()` on the query.

    ## 2. Wire tab into UsersDirectoryClient.tsx

    Add a tab switcher at the top of the Users page (after the existing search/filter bar):
    ```
    [General]  [ACC Analysis]
    ```
    - "General" = existing user list (default active tab)
    - "ACC Analysis" = renders `<AccAnalysisPanel users={accSummary ?? []} />`

    Use a simple `activeTab` state with two values: `"general" | "analysis"`.
    When `activeTab === "analysis"`, hide the user grid/list and show `AccAnalysisPanel`.
    The search bar and groupBy controls should be hidden when on the analysis tab.

    Avoid: do not re-fetch data — reuse the same `bulkAccSummary` query result already
    fetched for Plan 7.1 filter chip.
  </action>
  <verify>npx tsc --noEmit 2>&1 | Select-String "AccAnalysisPanel|UsersDirectoryClient"</verify>
  <done>
    - TypeScript compiles clean
    - ACC Analysis tab renders without error when clicked
    - KPI cards show real numbers derived from cached data
    - Role frequency table renders with at least headers
  </done>
</task>

## Success Criteria
- [ ] `bulkAccSummary` returns name, allRoles, allModules, projects[] per user
- [ ] `AccAnalysisPanel.tsx` created with 5 KPI cards + role table + module patterns
- [ ] "ACC Analysis" tab appears next to "General" in the Users section header
- [ ] Switching tabs is instant (no API call, purely computed from cached data)
- [ ] Duplicate-role users and multi-role-per-project users are correctly identified
- [ ] TypeScript compiles clean across all modified files
