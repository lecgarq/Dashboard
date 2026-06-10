# Template MTY — Access Graphs (revision) — Design

**Date:** 2026-06-10
**Branch:** feat/access-analysis-redesign
**Status:** Approved (design via Q&A), pending implementation plan
**Supersedes:** the chart layout in `2026-06-09-template-mty-analysis-design.md` (the route, sync, roster, and folder terrain from that spec stand).

## Goal

Make the existing `/template-mty` tab fully match the owner's intent: mirror the **concept** of
`/access-analysis` for the single ACC project template (ACC Template MTY,
`def5fdea-8035-4b56-be60-66b36ba45149`), scoped to its **19 Project Members**, and add two
"who-has-which-access" graphs alongside the roles donut and the folder-permission terrain.

The 4 API "Template Members" (Template Settings → Permissions) are **explicitly out of scope for
display** — the owner only cares about the 19 Project Members. The 4 stay in the DB (they feed the
terrain's per-role user counts) but are never shown as a member list or donut.

## What already exists (do not rebuild)

Verified against the live local Postgres on 2026-06-10:

- `/template-mty` route, nav entry, and the `type:"template"` isolation guards — shipped.
- `lib/acc/template-mty-roster.ts` — the **19 Project Members** (name, email, company, role,
  Admin/Member level), captured 2026-06-09 from ACC's web UI. **This is the member source of truth.**
- Folder crawl — **done**: 206 folders, 1,829 folder permissions across 5 tiers
  (`View Only` 1694, `View+Download` 88, `View+Download+Upload+Edit` 25, `View+Download+Upload` 19,
  `Full Controller` 3). `AccProject.folderCrawlStatus = "ok"`.
- `summarizeRoles` / `RolesPieChart` — the roles donut.
- `loadFolderPermissionTerrain(projectId)` + `FolderPermissionTerrain` (with `singleProject`) — the terrain.
- `TemplateMembersTable` — the 19-member table.

## Final surfaces (top → bottom)

1. **Header** — counts: `19 members · N roles · 1 company · 206 folders · 1,829 permissions`,
   plus "roster updated 2026-06-09" and "folders synced …".
2. **Members table** — the 19 Project Members (existing `TemplateMembersTable`; unchanged).
3. **Roles donut** — distribution of the 19 by role (existing `RolesPieChart`; unchanged).
4. **NEW — Permission-tier access graph** — "which roles, and how many of the 19 users in them,
   hold each folder permission tier."
5. **NEW — ACC module access graph** — "which ACC modules each of the 19 is granted, by user/role."
6. **Folder permission terrain** — existing, unchanged.

The current **Access Levels donut** (Admin vs Member) is **removed** from the layout — the owner's
requested chart set is roles + the two access graphs + terrain. The Admin/Member fact remains
visible as the "Admin" badge in the members table. (`AccessLevelPieChart.tsx` and the now-unused
`accessLevels`/`adminCount` fields are deleted to avoid dead code.)

### 4. Permission-tier access graph (buildable now)

**Data:** the 19 roster members each carry a `role` string. Folder permissions are stored per
`(folder, role)` → `permType`. Join the roster's roles to the template's `AccFolderPermission`
tiers (role names match — verified: Architect, Designer, Core, VDC Innovacion, Gerente De
Desarrollo, Gerente De Construccion all have perms; **Dirección** and **Contabilidad** have none).

**Shape:** one horizontal bar per permission tier (highest → lowest:
Full Controller, View+Download+Upload+Edit, View+Download+Upload, View+Download, View Only).
Bar length = number of the 19 users whose role holds that tier. Tooltip / legend lists the roles
(and the users in them) that contribute. A trailing **"No folder access"** row counts users whose
role has zero folder permissions in the template (Dirección, Contabilidad members) — a meaningful
gap, not hidden.

> A user's role can hold several tiers across different folders, so a user may appear under more
> than one tier. The per-tier bar counts **distinct users whose role grants that tier at least
> once**; this is stated in the panel subtitle so the numbers aren't read as a partition.

### 5. ACC module access graph (needs owner data)

**Data gap (flagged with owner):** ACC's API does **not** expose per-member module/product access
for the template's 19-person project-members list. So a new optional `modules` field is added to
each roster member, filled by the owner from ACC's web UI (same maintenance model as the rest of
the roster). A fill-in guide is provided (the 19 names × the module checklist).

**Module keys** align with the existing `ModuleId` set in
`app/(dashboard)/access-analysis/modules.ts` (e.g. `dataManagement` = Docs, `build`, `modelCoordination`,
`designCollaboration`, `insight`, `design`, `preconstruction`). The roster stores friendly module
ids per member; the summarizer maps to display names via `moduleLabelById`.

**Shape:** one horizontal bar per ACC module; bar length = number of the 19 granted that module;
tooltip lists the users (and their roles). **Empty state** until the owner fills module data:
the panel renders "No module access captured yet — add `modules` to the roster" instead of an
empty chart, so the rest of the page is unaffected.

## Architecture

### New pure modules (TDD — no I/O)

- `app/(dashboard)/template-mty/permissionAccess.ts`
  `summarizePermissionAccess(members, rolePermTiers)` →
  `{ tiers: Array<{ tier, userCount, roles: Array<{ role, userCount, users: string[] }> }>, noAccess: { userCount, users } }`.
  - `members`: the 19 `{ name, role }`. `rolePermTiers`: `Map<roleName, Set<tier>>` from the DB.
  - Pure, fully unit-tested (role with no tiers → noAccess; multi-tier role; distinct-user counts;
    deterministic tier ordering via a fixed tier rank).
- `app/(dashboard)/template-mty/moduleAccess.ts`
  `summarizeModuleAccess(members)` →
  `{ slices: Array<{ id: ModuleId, name, userCount, users: string[], roles: string[] }>, total, memberCount, hasData }`.
  - `members`: the 19 `{ name, role, modules: ModuleId[] }`. `hasData=false` when every `modules` is empty.

### Edited files

- `lib/acc/template-mty-roster.ts` — add `modules?: ModuleId[]` to `TemplateRosterMember`
  (default `[]`/undefined for now); add a header comment with the fill-in guide.
- `lib/server/templateView.ts` —
  - drop `accessLevels` / `adminCount` from `TemplateOverview` (replaced by the new graphs);
  - thread each member's `role` and `modules` through to the builder;
  - add an async `loadTemplatePermissionAccess()` that reads the template's
    `AccFolderPermission` grouped by role name → tier (one `$queryRaw` or Prisma `groupBy` +
    `AccRole` name join) and returns `summarizePermissionAccess(roster, rolePermTiers)`;
  - `loadTemplateOverview()` additionally returns `moduleSummary = summarizeModuleAccess(roster)`.
- `app/(dashboard)/template-mty/page.tsx` — `Promise.all` now also loads the permission-access
  summary; passes both new summaries into the shell.
- `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` — replace the Access Levels
  section with the two new graph sections (roles donut and terrain unchanged).

### New components

- `app/(dashboard)/template-mty/components/PermissionAccessChart.tsx` — horizontal bar (tiers),
  role/user breakdown in tooltip + legend; tier colors reuse the terrain's tier palette for
  consistency.
- `app/(dashboard)/template-mty/components/ModuleAccessChart.tsx` — horizontal bar (modules),
  user/role breakdown in tooltip; empty state when `hasData=false`.

### Removed

- `app/(dashboard)/template-mty/components/AccessLevelPieChart.tsx` and its usages.
- (Keep `provisionedModules.ts` only if reused by `moduleAccess`; otherwise remove to avoid dead
  code — decided in the plan.)

## Data flow

```
roster (19) ──┬─ summarizeRoles ............... Roles donut          (pure)
              ├─ summarizeModuleAccess ........ Module access graph  (pure; needs owner data)
              └─ role names ┐
                            ├─ summarizePermissionAccess  Permission-tier graph (pure)
AccFolderPermission ────────┘  (role→tier map, DB read in loadTemplatePermissionAccess)

AccFolder/AccFolderPermission ── loadFolderPermissionTerrain ── Folder terrain (existing)
```

## Error / empty states

- **No module data** (default today): module graph shows the "add module data" panel; everything
  else renders. No crash.
- **Role with no folder perms** (Dirección, Contabilidad): surfaced as the "No folder access" row.
- **Roster role not found in DB perms**: treated as no-access (defensive; logged is unnecessary).

## Testing

- Unit: `summarizePermissionAccess` — multi-tier role, no-access role, distinct-user counting,
  tier ordering, empty input.
- Unit: `summarizeModuleAccess` — empty → `hasData=false`; per-module counts; users/roles lists;
  key→name mapping.
- Unit: `templateView` builder — overview no longer exposes `accessLevels`; module summary present.
- Component: `PermissionAccessChart` and `ModuleAccessChart` render rows + empty states.
- Keep the existing template + nav tests green.
- e2e: deferred (owner rebuild + visual UAT).

## Out of scope (this revision)

- Displaying the 4 Template Members (owner: ignore them).
- Automated module-data sync (no API; manual roster maintenance).
- Coordination / activity panels (templates have neither).
- Any change to the folder terrain or the sync scripts.

## Risks / open items

- **Module graph is empty until the owner fills roster module data.** Mitigation: clear empty
  state + a fill-in guide; the graph is purely additive.
- **Role-name matching** between the in-code roster and DB `AccRole` names. Verified for the
  current roster; new/edited roster roles that don't match fall into "No folder access" (safe).
- **Distinct-user-across-tiers** could confuse if read as a partition — mitigated by the subtitle.
