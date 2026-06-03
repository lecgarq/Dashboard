# Phase 4: Folders & Folder-Role Permissions - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Crawl folder trees + folder-role permissions per project via ACC Data Management + BIM360 Docs APIs, persist them in `AccFolder` / `AccFolderPermission`, ship the 10th dashboard widget (interactive folder × role matrix), and produce a perf GO/NO-GO artifact that gates Phase 5 GRAPH-04. Folder-level USER permissions, document-level permissions, and folder editing UI are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Matrix widget — shape and scale
- **Hub-wide flat scope**: all projects × all roles × all folders × all permissions in one matrix. NOT scoped to a single project. Information density over compactness.
- Column organization: **grouped by project, role within project**. Sticky project group headers span their role columns. Roles are NOT deduped across projects (a "Project Manager" role in Project A is a different column from "Project Manager" in Project B — semantically correct since role permissions are project-scoped).
- Virtualized rendering is **mandatory** at this scale (cell count can exceed 100k).
- Folder hierarchy: **collapsed to top-level by default, expand on click**. Collapsed parents display the parent's own grant; expanded children show their own.
- Default open view: **all projects collapsed**, user expands what they need. (User explicitly chose this over a curated "top 5 projects" default.)

### Matrix widget — cell semantics
- Cell value when role has overlapping grants on same folder: **highest tier wins** (Full Controller > V+D+U+E > V+D+U > Upload Only > V+D > View Only). Hover reveals raw `actions` array.
- 6-tier UI labels: View Only, View+Download, Upload Only, View+Download+Upload, View+Download+Upload+Edit, Full Controller.

### 6-tier permission mapping — edge cases
- **Extra actions** (ACC array contains actions beyond a tier's definition): match closest tier + add a small `+` "extended" badge. Hover lists the extras. Don't hide reality but keep the 6-tier UX.
- **Missing actions** (partial grant doesn't complete any tier): round DOWN to the highest tier whose actions are all present. Never overstate access.
- **Unknown actions** (new/undocumented ACC action): log warning in Railway logs with the action name; ignore the unknown action and map the remaining known ones. Don't crash, don't pollute UI with `?` tiers.
- **Mapping table location**: single typed constant `lib/acc/permissionMapping.ts`, fully unit-tested per REQUIREMENTS.

### Matrix widget — scale-usability controls
- Filters (all four required):
  - Project filter — multi-select
  - Role name filter
  - Permission-tier filter (>= threshold or exact tier)
  - Anomalies-only toggle (hide everything except orphan/anomaly cells)
- Search: **single search box** filters rows by folder path AND columns by role name simultaneously.
- Cross-widget interaction: **two-way**.
  - Inbound: project / role selection elsewhere scopes this widget.
  - Outbound: clicking a role column or folder row spotlights across graph + user list + heatmap.
  - Matches the interactivity contract feedback (no static reskins).

### Orphan / anomaly surfacing
- Orphan definitions (ALL four flagged):
  - Role granted on folder but role has zero members
  - Role with permissions on deleted/missing folder
  - Role granted only at root with no project members
  - Folder with zero role permissions of its own
- Visual treatment: **muted/desaturated cell + ⚠ glyph**. Hover reveals the specific reason.
- Click on orphan cell: opens **side panel** with role name, project, folder path, all permissions, reason flagged, and a link to the role in the user list filtered to zero members.
- **Recommendations widget gains an "orphan role" finding NOW in Phase 4** (not deferred to Phase 5 DASH wave).
  - ⚠ **Note for Phase 5 planner:** roadmap line 128 lists "orphan role" under DASH-14..18 success criteria. That criterion is PARTIALLY DELIVERED here. Phase 5 DASH plan should not re-build it; should treat it as carry-forward and focus DASH-14..18 on the remaining findings (stale invite, etc.).

### Crawl strategy
- **Cadence**: full crawl on every Railway release + nightly cron. No incremental delta crawl. No manual sync UI (per existing feedback memory).
- **Per-project budget**: soft cap 5 min (log warning), hard cap 15 min (abort that project, mark `partial`).
- **Concurrency**: `pLimit(5)` per project (already in roadmap).
- **Retries**: 3 retries with exponential backoff on transient ACC API failures, then mark project's crawl status as `partial`.
- **Partial-failure surfacing**: `AccProject.folderCrawlStatus` column (`ok` / `partial` / `failed` / `never`). Matrix cells from non-ok projects render with a "data incomplete" visual treatment + tooltip.

### Crawl sizing dry-run gate (gates live wiring)
- **First task in Phase 4 is a dry-run crawl** on the entire hub, **read-only / no DB persistence**. Measures time + folder count + permission count per project.
- Produces `.planning/phases/04-folders-folder-role-permissions/CRAWL-ESTIMATE.md` with: per-project numbers, extrapolation, recommended cadence.
- **Luis approves the estimate** before any wiring into Quick Sync / cron happens. Explicit checkpoint.
- If estimate > 1 hour for full hub: fall back to **weekly cron + Railway-release-only**, not nightly. Document the cadence trade-off in CRAWL-ESTIMATE.md.

### Perf pre-flight (gates Phase 5 GRAPH-04)
- **Node-count projection**: real Hermosillo data × 2× and × 5× multipliers (stress-test growth headroom). Not synthetic.
- **GO threshold (strict)**: 60 FPS sustained AND GPU memory under 512MB at the projected node count. This is the deliberate "smooth or NO-GO" bar — not a minimum-viability bar.
- **Artifact location**: `.planning/phases/04-folders-folder-role-permissions/PERF-GATE.md` — methodology, raw numbers, GO/NO-GO decision, rationale, contingency notes. Phase 5 planner reads this directly.
- **NO-GO contingency**: folders stay dashboard-only (matrix widget); graph-node integration deferred. Phase 5 GRAPH-04 plan logs why and what would unblock it. Matches roadmap line 127.

### Claude's Discretion
- Exact virtualized renderer choice (TanStack Virtual vs custom).
- Color palette / desaturation curve for orphan cells (must align with existing dashboard theme).
- Side-panel layout details for the orphan drill.
- Exact pLimit(5) error categorization (which errors retry vs which mark partial immediately — based on ACC's HTTP status semantics).
- Project group header sticky behavior (CSS sticky vs scroll-tracked).
- How `+` "extended" badge is visually distinguished from anomaly glyph.
- Whether the matrix uses canvas, SVG, or DOM for cell rendering (depends on perf measurements).

</decisions>

<specifics>
## Specific Ideas

- "No manual sync UI" is locked — applies to this widget too. No refresh button, no stale-cache banner. The widget always shows the latest crawl, and `folderCrawlStatus` per project handles partial-data honesty.
- Information density over compactness — user explicitly chose hub-wide flat (all projects × all roles × all folders) over project-scoped views.
- Strict perf bar (60 FPS / 512MB) is intentional — user prefers NO-GO + dashboard-only over a sluggish graph integration.
- Dry-run-before-wiring pattern mirrors the perf pre-flight: both are measure-then-decide artifacts in the same phase directory.

</specifics>

<deferred>
## Deferred Ideas

- Folder-level USER permission (non-role) — separate phase if needed.
- Document-level permissions — out of scope, ACC's permission model has separate doc-level grants.
- Folder editing / permission editing UI — read-only dashboard only in v2.0.
- 11th "crawl health" dashboard widget — `folderCrawlStatus` per project on existing widgets is enough; standalone widget deferred to roadmap backlog if needed.
- Per-user saved filter sets / per-user persisted view state — requires user-state persistence layer; defer to a later UX phase.
- Database-backed (admin-editable) permission mapping table — over-engineered for 6 tiers that change rarely; revisit only if ACC starts adding actions frequently.

</deferred>

---

*Phase: 04-folders-folder-role-permissions*
*Context gathered: 2026-05-11*
