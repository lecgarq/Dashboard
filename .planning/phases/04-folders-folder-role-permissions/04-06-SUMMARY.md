---
phase: 04-folders-folder-role-permissions
plan: 06
subsystem: ui
tags: [dashboard-widget, folder-permissions, tanstack-virtual, matrix, orphan-detection, side-panel, cross-widget-interactivity]

# Dependency graph
requires:
  - phase: 04-folders-folder-role-permissions/04-01
    provides: "PermTier + TIER_DEFINITIONS + mapActions() — drives tier ordering, color ramp, extended badge"
  - phase: 04-folders-folder-role-permissions/04-04
    provides: "extractAndPersistFolders + env-gated runQuickSync + weekly cron — populates AccFolder/AccFolderPermission"
  - phase: 04-folders-folder-role-permissions/04-05
    provides: "accFolders.getMatrix + getOrphanRoles tRPC procedures + FolderMatrixRow/FolderOnlyOrphan types"
provides:
  - "10th dashboard widget — FolderPermissionsWidget (virtualized folder x project-role matrix)"
  - "SelectedFinding union extended with kind='folderPermission' (folderId/folderPath/role/project/permType/actions/orphanReasons)"
  - "FolderPermissionBody render branch in DashboardSidePanel (exported for cross-mount reuse)"
  - "RecommendationsWidget orphan-role finding (Phase 4 carry-forward — Phase 5 DASH must NOT rebuild)"
affects: [05-dashboard, 07-graph-topology]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TanStack Virtual v3 dual virtualizer (row vertical + col horizontal) sharing one scroll element — only on-screen cells in DOM"
    - "Sticky-left row label + sticky-top project/role headers via position:sticky with z-index layering"
    - "Cross-widget interactivity via selectionContext — inbound (role/folderPermission scope columns/project) + outbound (cell/header click)"
    - "Carry-forward findings — orphan-role added to RecommendationsWidget NOW so Phase 5 DASH doesn't re-build"

key-files:
  created:
    - "app/(dashboard)/users/dashboard/widgets/FolderPermissionsWidget.tsx (~530 lines)"
    - ".planning/phases/04-folders-folder-role-permissions/04-06-SUMMARY.md"
  modified:
    - "app/(dashboard)/users/dashboard/selectionContext.tsx (+folderPermission union member + isSelectionValid case)"
    - "app/(dashboard)/users/dashboard/DashboardSidePanel.tsx (FolderPermissionBody + selectedKey + PanelBody branch + AlertTriangle import + mapActions import)"
    - "app/(dashboard)/users/dashboard/widgetRegistry.ts (folderPermissions entry + DEFAULT_ORDER append)"
    - "app/(dashboard)/users/dashboard/widgets/RecommendationsWidget.tsx (OrphanRoleFinding type + 'orphan-role' Leaf variant + getOrphanRoles query + click->folderPermission)"

key-decisions:
  - "Renderer = DOM via TanStack Virtual (per plan discretion). Canvas reserved as Plan 07 perf escape hatch if DOM scroll FPS proves inadequate at hub scale."
  - "Tier color ramp = 6-step (Full Controller violet-600 → View Only slate-400) keyed by TIER_ORDER index from permissionMapping; orphan cells render the same hue at 0.35 opacity (desaturation) instead of saturation math, so the palette stays a single source of truth."
  - "Folder parentId inferred from fullPath segments (no explicit parentId column in MatrixRow shape). Roots = path with ≤1 segment; children = same project + path starts with root+'/'. Acceptable approximation — accFoldersRouter could expose parentId later if needed."
  - "Project multi-select implemented via Select with sentinel 'Clear (all projects)' entry + per-item ✓ prefix. Avoids adding a Popover/Combobox dependency."
  - "Switch not available in components/ui — used Checkbox for 'Anomalies only' toggle (semantically equivalent for this use)."
  - "Inbound 'project' scoping uses selected.kind==='folderPermission' projectId (no kind='project' in current union). Inbound 'role' scoping matches selected.role string against ColumnSpec.roleName."
  - "Outbound role-header click reuses kind='role' (existing union member) — matches RolesModulesHeatmapWidget convention; no new kind invented."
  - "Orphan-role finding click emits kind='folderPermission' with representativeFolderId/folderPath (first matching row per (projectId, roleId)) — opens the same side-panel body the matrix uses."
  - "Phase 5 DASH carry-forward note: RecommendationsWidget already ships the orphan-role kind. Phase 5 must NOT re-implement (CONTEXT directive). Plan 5 DASH only needs to ensure the existing query stays wired."

patterns-established:
  - "Dual-virtualizer matrix shell: parent scroll container hosts both useVirtualizer(horizontal:false) for rows and useVirtualizer(horizontal:true) for columns; sticky-top/left fixed cells render outside the virtualization loop."
  - "Cross-widget selection contract via existing 'role' kind: any widget can spotlight a role by setSelected({kind:'role', role, severity}). Other widgets opt in by reading useSelection().selected.kind==='role'."
  - "Side-panel body component exports (FolderPermissionBody, UserActivityBody) so future plans can mount the same body outside DashboardSidePanel (Phase 3 precedent)."

requirements-completed: [FLDR-04, FLDR-05]

# Metrics
duration: ~12 min
completed: 2026-05-12
---

# Phase 04 Plan 06: FolderPermissionsWidget Summary

**10th dashboard widget shipping the FLDR-04 folder × project-role matrix — TanStack Virtual dual virtualizer, 4 filters + unified search, project-grouped sticky headers, orphan cells (AlertTriangle + desaturated tier color), partial-crawl stripe overlay, two-way cross-widget interactivity via selectionContext, and an orphan-role finding added to RecommendationsWidget as Phase-4 carry-forward.**

## Performance

- **Duration:** ~12 min execution (Luis "continue with next waves, don't wait for verification" directive in effect)
- **Tasks:** 4 (3 engineering tasks executed + 1 UAT checkpoint AUTO-APPROVED per directive)
- **Files created:** 2 (widget + this SUMMARY)
- **Files modified:** 4

## Accomplishments

- **SelectionContext extended** — `SelectedFinding` union gains `kind:"folderPermission"` carrying folderId, folderPath, roleId, roleName, projectId, projectName, permType, actions, orphanReasons. `isSelectionValid` returns true (mirrors role/admin — no finding-staleness path).
- **DashboardSidePanel.FolderPermissionBody** — new exported body. Renders project header + folder path + role + tier label + extended badge (computed via `mapActions()`) + raw-actions chip list + per-orphan-reason AlertTriangle row using a human label map (`role_zero_members`, `permission_missing_folder`, `root_only_zero_members`, `folder_no_permissions`) + `data-testid="folder-perm-view-role"` stub link for future user-list-scoped navigation.
- **FolderPermissionsWidget** — `~530-line` widget. Dual TanStack Virtual virtualizers (rows + horizontal columns) over a single scroll container. Sticky project group headers (z-index 20) above sticky role headers (z-index 10) above scrolling rows; sticky-left folder-label column. Cell rendering uses `TIER_COLOR[permType]` background at 0.85 opacity, falling to 0.35 opacity for orphan cells + AlertTriangle glyph. Extended-actions `+` badge in the opposite corner. Partial-crawl projects get a diagonal-stripe overlay + matching tooltip. Folder rows collapsed to top-level (path with ≤1 segment) by default; click toggles inline expansion of matched descendants. Four filters wired: project multi-select (Select sentinel pattern), tier threshold + mode (`gte`/`eq` over `TIER_ORDER` index), anomalies-only Checkbox, and a single unified search box filtering BOTH folder paths AND role names simultaneously per CONTEXT.
- **Cross-widget interactivity** — inbound: `selected.kind==='role'` scopes visible columns to that role name; `selected.kind==='folderPermission'` constrains the matrix query to that projectId. Outbound: cell click emits `kind:'folderPermission'` (opens side panel); role-header click emits `kind:'role'` (spotlights heatmap + user list + graph).
- **Widget registry** — `folderPermissions` registered with title "Folder Permissions" and `col-span-2`, appended to `DEFAULT_ORDER` as the final position.
- **RecommendationsWidget orphan-role finding** — `OrphanRoleFinding` shape + new `_kind:"orphan-role"` `Leaf` variant. Queries `trpc.accFolders.getOrphanRoles` (5-min staleTime); rows with `role_zero_members` are grouped by `(projectId, roleId)` into a single finding per pair (severity MEDIUM). Joins the right-half cluster alongside duplicates. Click emits `kind:'folderPermission'` with the representative folder → opens the same FolderPermissionBody. CSV export gains an `OrphanRole` row type with a suggested-action line. `isSelectedLeaf` also matches a `folderPermission` selection back to its source orphan-role leaf. **Phase 5 DASH carry-forward — must NOT re-build.**

## Task Commits

1. **Task 1: Extend SelectionContext + DashboardSidePanel** — `fcdaf41` (feat)
2. **Task 2: FolderPermissionsWidget + widgetRegistry** — `5fb37eb` (feat)
3. **Task 3: RecommendationsWidget orphan-role finding** — `28e5bdd` (feat)
4. **Task 4: UAT** — AUTO-APPROVED at executor layer per Luis directive 2026-05-12 ("continue with next waves, don't wait for verification, we will verify at the end"). Visual/scroll-FPS verification DEFERRED to phase-end manual UAT.

## Decisions Made

See `key-decisions` in frontmatter. Headlines:

- **DOM renderer first.** TanStack Virtual DOM cells chosen over canvas per plan discretion. Canvas-fallback path stays available if Plan 07 perf measurement shows DOM can't sustain smooth scroll at full hub scale.
- **Tier color ramp.** 6-step palette (Full Controller violet-600 → View Only slate-400) keyed by `TIER_ORDER` index. Orphan cells render the same hue at 0.35 opacity rather than a separate desaturation curve — single source of color truth.
- **Folder parent inference from path.** No explicit `parentId` exposed on `FolderMatrixRow`; widget infers roots from path segments. Acceptable approximation given current API surface.
- **Switch → Checkbox.** No `components/ui/switch.tsx` in repo; used Checkbox for the anomalies toggle (semantically equivalent for boolean filter).
- **Phase 5 carry-forward locked.** Orphan-role finding shipped in this plan; Phase 5 DASH plan must NOT re-implement. Phase 5 only needs to ensure the existing `getOrphanRoles` query stays wired.

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Missing `Switch` component**
- **Found during:** Task 2 typecheck.
- **Issue:** Plan referenced `<Switch>` for the anomalies-only toggle but `components/ui/switch.tsx` doesn't exist in this repo.
- **Fix:** Substituted `<Checkbox>` (which is present) with the same boolean semantics.
- **Files modified:** `app/(dashboard)/users/dashboard/widgets/FolderPermissionsWidget.tsx`
- **Commit:** `5fb37eb`

No other deviations. The plan executed within its discretionary tolerances elsewhere (color ramp curve, project multi-select UI pattern, parentId inference).

## Deferred Items (Per Luis Directive)

UAT/visual verification deferred to phase-end pass per Luis "continue with next waves, don't wait for verification, we will verify at the end" directive 2026-05-12. Specifically deferred:

- Live scroll-FPS measurement at full hub scale (1,143 projects worth of folders, once cron has run).
- Visual confirmation of:
  - Sticky project headers aligning with their role columns under all filter combinations.
  - Diagonal-stripe overlay rendering correctly on partial-crawl cells.
  - Cross-widget inbound scoping triggered from RolesModulesHeatmap and outbound spotlight from this widget's role-header click.
  - Anomalies-only toggle behavior when there are no orphans in the dataset (empty-state honesty).
  - RecommendationsWidget bubble layout balance with orphan-roles added to the right half.
- `data-testid="folder-perm-view-role"` link wiring to actual user-list-scoped navigation (currently a stub button) — Phase 5 LIST integration.

Re-engagement: after the Sunday 04:00 UTC folder-crawl cron runs (or a one-off manual run via `node scripts/folder-crawl-cron.cjs`), open the dashboard and walk the plan's 9-item UAT contract.

## Issues Encountered

None blocking. The missing `Switch` component was substituted with `Checkbox` inline (Rule 3 deviation above) — no architectural impact.

## User Setup Required

None new from this plan. Folder-crawl cron setup (from Plan 04-04 SUMMARY) is the only outstanding operator step:

- [ ] Wire `node scripts/folder-crawl-cron.cjs` on Sunday 04:00 UTC in Railway (or run once manually) so the matrix has data to render.

Until the first crawl completes, the widget shows "No folder permissions yet — run the folder-crawl cron to populate."

## Next Phase Readiness

- **FLDR-04 complete** — matrix widget shipped with full interactivity contract (modulo manual UAT verification).
- **FLDR-05 complete end-to-end** — orphan detection visible in BOTH the widget cells AND the RecommendationsWidget. Phase 4 Plan 05 + Plan 06 close the loop.
- **Phase 5 DASH plan must NOT re-build the orphan-role finding** — already shipped here per CONTEXT directive.
- **Plan 04-07 (orphan detection follow-ups)** unblocked.

## Self-Check

Verified via Read/git-log/tsc:

- FOUND: `app/(dashboard)/users/dashboard/widgets/FolderPermissionsWidget.tsx` (created)
- FOUND: `app/(dashboard)/users/dashboard/widgetRegistry.ts` registers `folderPermissions` + appends to `DEFAULT_ORDER`
- FOUND: `selectionContext.tsx` contains `folderPermission` union member + `isSelectionValid` case
- FOUND: `DashboardSidePanel.tsx` contains `FolderPermissionBody` export + PanelBody case
- FOUND: `RecommendationsWidget.tsx` contains `"orphan-role"` Leaf variant + `getOrphanRoles` query
- FOUND commit `fcdaf41` (Task 1)
- FOUND commit `5fb37eb` (Task 2)
- FOUND commit `28e5bdd` (Task 3)
- VERIFIED: `npx tsc --noEmit -p .` → exit 0 after each task

## Self-Check: PASSED

---
*Phase: 04-folders-folder-role-permissions*
*Completed: 2026-05-12*
