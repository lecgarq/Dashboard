# Folder Activity by Role — Design

- **Date:** 2026-06-19
- **Status:** Approved (brainstorming complete) — ready for plan
- **Surface:** `/access-analysis` (the ECharts dashboard at `app/(dashboard)/access-analysis/`)
- **Branch:** `feat/access-analysis-redesign`

## Problem & goal

The Access Analysis page shows *who* does activity (Activity by role / by company donuts) and *where* permissions sit (Folder Permission Terrain), but never *where the work actually happens*. The owner wants a single panel that answers, drill-down style:

> **folder → activity count → role distribution → users**

i.e. for a project, list its folders by how much file activity happened in each, break each folder's activity down by the role the actor held, and then by the individual users behind each role.

## Data feasibility (verified 2026-06-19)

Diagnostic: `scripts/diag-folder-activity-coverage.cjs` (temporary, deleted after spec).

- `AccActivityAccds` = **2,610,482** rows; **86.3%** (2,253,224) carry `folderName` + `folderId`.
- The **DC-backfill `AccActivity` table has no folder columns** — only the real-time accds feed records folders. So this panel counts **folder-scoped (file) activity only**, a strict subset of the account-wide "Activity by role" donut (which also counts the older backfill + non-folder activity like issues/transmittals).
- The 14% without a folder are non-file verbs (`issue-view`, `create-transmittal`, `view-sheet`, …) — correctly excluded from a *folder* activity view.
- **76,852 distinct folder IDs vs 40,045 distinct names** → folder names repeat both across projects (e.g. "PDF" in 127 projects, "DWG" in 117) and, less often, within a project.

## Locked decisions (from brainstorming)

1. **Visual form:** collapsible **tree table**, each row showing an activity count + a stacked **role-distribution bar** (role colors shared with the existing donuts). Not a sunburst/donut — the owner wants the full multi-level read with exact numbers.
2. **Project selection:** the panel **follows the page's existing project ticks** (`selected: Set<string>` in `AccessAnalysisCharts`), like the donuts — it does **not** get its own picker.
3. **Adaptive hierarchy by selection size:**
   - 1 project selected → `Folder → Role → User`
   - 2+ selected → `Project → Folder → Role → User` (project level on top)
   - 0 / all selected → ranked projects (Top-N, "show all")
4. **Folder keying:**
   - **Across projects:** never merged — folders nest under their project, so 127 "PDF" folders are 127 rows under 127 projects.
   - **Within one project:** **merge same-name folders** into one row summing their activity (group by `folderName`, scoped to the project). No parent-path disambiguation needed.
5. **Role attribution:** done **client-side** using the `membershipRows` already in memory (`email::projectId → roles`), reusing the exact `UNKNOWN_ROLE` ("No role" ⚠) / `MULTIPLE_ROLES` bucketing from `roleCounts.ts`. Guarantees role buckets match the "Activity by role" donut. (A user's role is constant within a project, so every folder attributes that user the same way.)
6. **Loading:** collapsed **"expand to load"** panel (modeled on `TerrainReveal`) so it never slows initial page load. Project-level totals load on expand; each project's folder→role→user payload loads lazily on first expand of that project and is cached.
7. **User click → `AuthorProfileDrawer`** (the shared profile drawer every other chart uses), via an `onUserClick(email)` callback.
8. **Ordering:** every level sorted by activity **descending**, with a **Top-N + "show all"** control mirroring the donuts' slider/preset pattern.

## Architecture & files

Server stays "dumb" (counts per folder×user); the client attributes roles — the same shape as `activityByActorView` + `summarizeActivityByRole`.

### New files
| File | Purpose |
|---|---|
| `lib/server/folderActivityView.ts` | Two cached server loaders (see Data flow). `server-only`. |
| `app/(dashboard)/access-analysis/folderActivityCounts.ts` | **Pure** fold: `(folder×user rows + memberships) → folders[ {name,total,roleSlices,usersByRole} ]`. Mirrors `roleActivityCounts.ts`. No React/IO. |
| `app/(dashboard)/access-analysis/__tests__/folderActivityCounts.test.ts` | Unit tests for the fold. |
| `app/(dashboard)/access-analysis/folderActivityActions.ts` | `"use server"` action wrappers (mirrors `folderTerrainActions.ts`) passed as props. |
| `app/(dashboard)/access-analysis/components/FolderActivityByRole.tsx` | The tree-table client component. |
| `app/(dashboard)/access-analysis/components/FolderActivityReveal.tsx` | Lazy "expand to load" wrapper (modeled on `TerrainReveal.tsx`). |
| `app/(dashboard)/access-analysis/__tests__/FolderActivityByRole.test.tsx` | Component test: expand/collapse, role bar, user click. |

### Modified files
| File | Change |
|---|---|
| `app/(dashboard)/access-analysis/mainCharts.tsx` | Pass the two loaders as props (no new blocking fetch in the `Promise.all`). |
| `app/(dashboard)/access-analysis/components/AccessAnalysisCharts.tsx` | Render `<FolderActivityReveal>` inside a `Reveal`, passing `selected`, `membershipRows`, and the loaders. |
| `e2e/…` (existing access-analysis spec) | One smoke test: expand panel → tree renders. |

## Data flow

```
AccActivityAccds ──(GROUP BY)──► folderActivityView.ts
                                   │
   loadFolderActivityProjects(ids) ┤  cheap: per-project folder-scoped totals
   loadFolderActivityTree(projectId)┘  bounded: (folderName, userEmail, count) for one project
                                   │
   server action props ───────────► FolderActivityReveal (lazy, on expand)
                                   │
   + membershipRows (in memory) ──► folderActivityCounts.ts  (pure: bucket users→roles)
                                   │
                                   ► FolderActivityByRole (tree render)
```

### Server queries (`folderActivityView.ts`)

- `loadFolderActivityProjects(projectIds: string[])` →
  `SELECT "projectId", COUNT(*)::int AS activity, COUNT(DISTINCT "folderName")::int AS folders
   FROM "AccActivityAccds"
   WHERE "projectId" = ANY($1) AND "folderName" IS NOT NULL AND "folderName" <> ''
   GROUP BY "projectId"`
  Uses the `(projectId, createdAt)` index; one grouped scan (~comparable to the 218 ms P5-C grouped query). Returns project name (joined from `AccDcProject`) + totals for the project level / ranking.

- `loadFolderActivityTree(projectId: string)` →
  `SELECT "folderName", "userEmail", "userName", COUNT(*)::int AS count
   FROM "AccActivityAccds"
   WHERE "projectId" = $1 AND "folderName" IS NOT NULL AND "folderName" <> '' AND "userEmail" IS NOT NULL
   GROUP BY "folderName", "userEmail", "userName"`
  Bounded per project (busiest project ≈ a few thousand (folder,user) pairs). `userName` falls back to email; cross-checked against `AccDcUser` like `activityByActorView`.

Both cached with a 5-min TTL (matching the other views). Tree results cached per `projectId`.

### Pure fold (`folderActivityCounts.ts`)

```
foldFolderActivity(rows, membershipsForProject) → {
  folders: Array<{
    name: string;
    total: number;
    roleSlices: Array<{ name: string; value: number }>;   // sorted desc; Unknown/Multiple included
    usersByRole: Map<string, Array<{ email; name; count }>>; // per role, sorted desc
  }>;                                                        // sorted by total desc
  total: number;
}
```
Role bucket per user = `0 roles → UNKNOWN_ROLE`, `1 → that role`, `2+ → MULTIPLE_ROLES` (identical to `summarizeActivityByRole`). Folder rows merge by `name` (within the single project) by summing.

## UI / interaction spec

- **Panel:** `PremiumSurface` + `SectionHeader` ("Folder Activity by Role", subtitle naming it as file/folder activity), with the existing `ActivityCoverageBadge` so the ~86% subset is self-explanatory. Collapsed by default; expanding triggers the project-level load.
- **Rows:** each level is a button row with a disclosure chevron, the entity name, a right-aligned tabular activity count, a percentage, and a stacked **role-distribution bar** (segments colored by role, same palette as `ActivityByRolePieChart`). User rows have no bar (they're leaves) and are clickable → profile drawer.
- **Adaptive root:** when `selected.size === 1`, the root level is folders; when `> 1` (and not all), the root is projects; when all/none, projects ranked Top-N.
- **Top-N:** per level, default Top 8 with a slider + "All" toggle (reuse the pattern/markup from `ActivityByRolePieChart`). Folders/users beyond N collapse into an "Others (k)" affordance that expands.
- **Empty/edge states:** no folder-scoped activity in scope → a friendly empty card (mirroring `ActivityByRolePieChart`'s empty state). "No role" bucket rendered with the ⚠ treatment.
- **Selection changes while expanded:** project-level totals re-fetch (cheap); per-project tree caches are retained.
- **Theme:** colors read `resolvedTheme` via `useTheme` (per the dashboard theme-token rule). No hardcoded zinc; bars/text use CSS-var tokens where not data-colored.

## Performance

- No new blocking fetch on initial page load (lazy panel).
- Project-level query: single grouped index scan over the folder-scoped subset.
- Tree query: scoped to one project, bounded result; cached per project.
- Client fold is O(rows) over a single project's (folder,user) pairs — trivial.

## Scope boundaries

**In scope:** the panel, two server loaders, the pure fold + tests, lazy load, adaptive hierarchy, role/user reuse, Top-N, theme-aware styling, one e2e smoke test.

**Out of scope (deferred):**
- Real nested folder **paths** (we show the immediate activity folder, flat per project — matches the mockup, not a `Project Files > A > B` tree). Building a true folder tree would need to join `folderId` to the `AccFolder` hierarchy.
- Cross-filtering the donuts **from** this panel (one-way: it reads `selected`, it doesn't push slice filters).
- The DC-backfill rows that lack folders (structurally impossible to place in a folder).
- A companion folder-share donut (declined in favor of the single adaptive tree).

## Testing & gates

- **Unit** (`folderActivityCounts.test.ts`): folder folding + same-name merge; role bucketing incl. Unknown/Multiple; per-role user lists; sort-by-activity; Top-N collapse. Avoid jest-dom matchers (use `.hasAttribute`, per the build-typechecks-tests rule).
- **Component** (`FolderActivityByRole.test.tsx`): expand folder → roles appear; expand role → users appear; click user → `onUserClick` fires; adaptive root for 1 vs many projects.
- **E2E:** smoke — expand the panel, assert the tree renders for the default selection.
- **Gates before any rebuild:** `npx tsc --noEmit` (whole tree, incl. tests) + unit suite green. `next build` typechecks tests, so a single tsc error blocks the :3000 deploy build. Don't `npm run build` under the running :3000 instance.

## Cleanup

`scripts/diag-folder-activity-coverage.cjs` is a throwaway feasibility probe — delete before finishing the plan execution.
