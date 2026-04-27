---
phase: 09-acc-users-graph-v2
plan: 01
completed_at: 2026-04-27T11:53:24.9988984-06:00
---

# Summary: ACC Users Graph v2

## Results
- Removed hub-node topology from the ACC graph snapshot model and frontend graph component.
- Added `lastAddedBucket` and `individualAccess` to graph instance nodes.
- Bumped graph topology version to 3 for cache invalidation.
- Updated backend and frontend semantic layout to use six properties: role, admin access, project, last added, individual access, and user name.
- Replaced module filtering with admin-access and individual-access toggle controls.
- Added a `ResizeObserver` to mark the graph dirty when the graph container changes size.
- Removed the graph tab width cap and horizontal graph padding so the graph canvas can occupy the full available page width.
- Added a Last Added filter using the same year-month buckets used by the spatial layout.
- Updated spatial similarity to use project name and full user display name instead of project ID and first-name-only anchors.

## Tasks Completed
| Task | Description | Status |
|------|-------------|--------|
| 1 | Remove hubs from `graphSnapshot.ts`, add new node fields, bump version, update semantic positioning | Complete |
| 2 | Refactor `AccUsersGraph.tsx` to remove hub rendering, add resize handling, and update filters/layout controls | Complete |

## Deviations Applied
- Updated `graphSnapshot.ts` to use user-name positioning instead of module positioning because the phase truth list defines the six layout dimensions as user name, project, role, admin access, last added, and individual access.
- Included `name`, `addedOn`, `project.name`, and `project.isAdmin` in the topology hash so future layout-relevant data changes invalidate the graph cache.
- Added `tmp` to `tsconfig.json` `exclude` because ignored temp snapshots under `tmp/deploy-head-check` were included by `**/*.ts` and caused stale hub-node type errors during project verification.
- Did not create an isolated worktree because the requested plan and target graph file already had in-place uncommitted phase changes in this workspace; continuing in-place avoided losing or duplicating that work.

## Files Changed
- `lib/acc/graphSnapshot.ts` - graph topology v3, instance-only nodes, new fields, empty edges, six-property semantic layout.
- `app/(dashboard)/users/AccUsersGraph.tsx` - user-only simulation/rendering, new filters, six sliders, resize invalidation, hub tooltip/side-panel removal.
- `app/(dashboard)/users/UsersDirectoryClient.tsx` - graph tab full-width layout.
- `tsconfig.json` - excludes ignored `tmp` snapshots from TypeScript verification.
- `.planning/phases/09-acc-users-graph-v2/09-01-PLAN.md` - records the `maxVisible={Infinity}` requirement in the filter JSX snippet.

## Verification
- `npx.cmd tsc --noEmit`: Passed.
- `npm.cmd run build`: Passed.

## Manual Checks Remaining
- Open the ACC Users Graph tab and confirm the canvas fills the container width.
- Confirm only user instance circles render, with no project/role/module hub nodes.
- Resize the browser window and confirm the canvas redraws correctly.
- Confirm the filter panel shows all roles, Admin Access toggle, and Individual Access toggle.
- Click "Rebuild Layout" and confirm the graph cache rebuilds with topology version 3.
