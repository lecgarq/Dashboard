# Template MTY Analysis — Design

**Date:** 2026-06-09
**Branch:** feat/access-analysis-redesign
**Status:** Approved (design), pending implementation plan

## Goal

Add a new dashboard tab, scoped to a **single ACC project template** ("ACC Template MTY",
id `def5fdea-8035-4b56-be60-66b36ba45149`), that mirrors the existing `/access-analysis`
page. It analyzes the template's **project members, roles, companies, provisioned modules,
and folder permissions** — with two donut charts (roles + provisioned modules) plus a
members table and the folder-permission terrain.

This is the template analog of the projects page; it is intentionally singular (one
hard-wired template, no picker).

## Data reality (verified 2026-06-09)

Probes against the live ACC Admin API and the local Postgres established:

- The template id is **absent** from every table (`AccProject`, the DC snapshot,
  `AccFolder`, `AccActivity` — all 0). The standard "list projects" sync that fills
  `AccProject` does not return templates, which is why it's missing.
- `GET /construction/admin/v1/projects/{id}` → **200**, `classification: "template"`,
  `companyCount: 1`, created 2025-03-05. Reachable with a **2-legged app token** +
  `User-Id` header (no interactive login).
- `GET /construction/admin/v1/projects/{id}/users` → **200**, **4 members**, each row
  carrying `roleIds`, `companyId`, and `products`. Members are alberto.sanchez,
  elizabeth.soto, josue.balderrama, luis.cortes — all `@hermosillo.com`.
- Roles in use: **2** — `Core` (alberto, josue) and `VDC Innovacion` (elizabeth, luis).
  Both role ids resolve from the existing `AccRole` table.
- Companies: **1** — `Hermosillo` (all 4 members). Resolves from `AccDcCompany`; the
  member sync also stores `companyName` directly on `AccProjectMember`.
- A template has **no activity** (`AccActivity = 0`), so the projects page's "Activity by
  module" donut cannot be mirrored. The second donut shows **provisioned modules** (which
  ACC tools each member is granted) instead.
- Folder permissions need a folder crawl. The crawl uses a **2-legged token**
  (`account:read data:read data:create`) — no interactive login. (An earlier 401 in
  probing was a stale *user* token, not a real block.)

## Decisions (locked with owner)

- **Second donut:** Provisioned modules (members per granted ACC tool).
- **Folder permissions:** Included in v1.
- **Scope:** Just this one template, hard-wired.

## Approach (chosen: A — reuse the existing pipeline, isolate by `type="template"`)

Considered:

- **A (chosen):** Seed one `AccProject` row and run the existing extractors for the
  template id. Maximal reuse; the folder terrain comes nearly free. Shares tables, so it
  needs two small isolation guards.
- **B (rejected):** Live fetch for the pies + persist only folders. Folders still need
  persistence (FK), so two data paths + a custom terrain loader. More code, less reuse.
- **C (rejected):** Dedicated `AccTemplate*` tables. Zero pollution, but reimplements the
  crawl, the terrain loader, and storage — heavy for a 4-member template.

### Why A is safe to share tables

The schema FKs (`AccFolder`, `AccProjectMember`, `AccProjectRole` → `AccProject`) require
an `AccProject` row for the template. Two surgical guards keep it isolated:

1. **Soft-delete protection** — `extractAndPersistProjects()` deactivates any active
   `AccProject` not present in the live project list. Templates are never in that list, so
   the seeded row would be auto-deactivated on the next account sync. Exclude
   `type="template"` from that sweep. (Same hazard class as the documented "DC kill switch
   auto-deletes" issue.)
2. **Main-page exclusion** — add `type IS DISTINCT FROM 'template'` to
   `loadTerrainProjects()` so the template never appears in the main Access Analysis
   terrain picker.

The template sync also **skips the member-cache writer** (`writeMemberCacheFromAggregator`)
so the 4 template members never leak into `/users` / the graph.

## Architecture

### New files

- `lib/acc/template-mty.ts` — constants: `TEMPLATE_MTY_ID`, `TEMPLATE_MTY_NAME`
  ("ACC Template MTY").
- `lib/acc/templateSync.ts` — pure-ish orchestrator: upsert the `AccProject` row
  (`type:"template"`, `status:"active"`), then call existing
  `extractAndPersistProjectData()` (members/roles) and `extractAndPersistFolders()`
  (folders/perms). No cache writer.
- `scripts/template-sync.cjs` — thin CJS shell: 2-legged token + hub/account id, then
  invokes `templateSync.ts`. Run once now; re-runnable to refresh.
- `lib/server/templateView.ts` — `loadTemplateOverview()` reads `AccProjectMember` +
  `AccProjectRole`→`AccRole` for the template id, builds: members list, role summary
  (reusing `summarizeRoles`), provisioned-module summary, company counts, freshness
  (`max(syncedAt)`).
- `app/(dashboard)/template-mty/page.tsx` — server component (`force-dynamic`); loads the
  overview + `loadFolderPermissionTerrain(TEMPLATE_MTY_ID)`; renders the client shell.
- `app/(dashboard)/template-mty/components/TemplateAnalysisCharts.tsx` — client shell:
  header, members table, two donuts, folder terrain.
- `app/(dashboard)/template-mty/components/TemplateMembersTable.tsx` — name, email,
  role(s), company, internal/external, modules/admin.
- `app/(dashboard)/template-mty/provisionedModules.ts` — pure
  `summarizeProvisionedModules(members)`: count distinct members per module (products with
  tier ≠ "none"), product keys → friendly names via existing `modules.ts`. Returns donut
  slices.
- `app/(dashboard)/template-mty/components/ProvisionedModulesPieChart.tsx` — new donut on
  the generic `EChart` wrapper (the activity-specific `ModulesPieChart` is not reused —
  its summary shape is activity-bound).

### Reused as-is

- `summarizeRoles` / `RolesPieChart` — roles donut.
- `loadFolderPermissionTerrain(projectId)` + `FolderPermissionTerrain` — folder terrain.
  Fed a single-option project list `[{ id: TEMPLATE_MTY_ID, name, … }]`.
- `extractAndPersistProjectData`, `extractAndPersistFolders` — extraction.
- `modules.ts` / `reduceModules` — product-key → module-name mapping.

### Edited files (surgical)

- `lib/acc/quick-sync-extraction.ts` — add `type:"template"` exclusion to the soft-delete
  sweep in `extractAndPersistProjects`.
- `lib/server/folderPermissionTerrainView.ts` — add `type IS DISTINCT FROM 'template'` to
  `loadTerrainProjects`.
- `components/layout/navigation.ts` — add `{ href: "/template-mty", label: "Template MTY",
  icon: LayoutTemplate, group: "Organization" }`.

## Data flow

```
scripts/template-sync.cjs (2-leg token)
  └─ templateSync.ts
       ├─ upsert AccProject {id, type:"template", status:"active"}
       ├─ extractAndPersistProjectData → AccRole, AccProjectRole, AccProjectMember(products)
       └─ extractAndPersistFolders     → AccFolder, AccFolderPermission
                                   │
/template-mty/page.tsx (server) ───┤
  ├─ loadTemplateOverview()  ← AccProjectMember + AccProjectRole→AccRole
  └─ loadFolderPermissionTerrain(TEMPLATE_MTY_ID)
                                   │
TemplateAnalysisCharts (client)
  ├─ header (counts + "synced N ago")
  ├─ TemplateMembersTable
  ├─ RolesPieChart            (summarizeRoles)
  ├─ ProvisionedModulesPieChart (summarizeProvisionedModules)
  └─ FolderPermissionTerrain  (single-option list)
```

## Error / empty states

- **Not yet synced** (no `AccProjectMember` rows for the template): page renders an empty
  state instructing to run `scripts/template-sync.cjs`. No crash.
- **No folder tree** (crawl returned nothing): the terrain shows its existing empty state;
  the rest of the page still renders.
- Sync script: per the existing extractor contract, per-call failures log and continue;
  a fatal (auth/db) exits non-zero.

## Testing

- Unit: `summarizeProvisionedModules` — tier filtering, distinct-member counting,
  key→friendly-name mapping, empty input.
- Unit: `loadTemplateOverview` assembly from fixture member/role rows → role summary,
  module summary, company counts, freshness.
- Unit: isolation guards — soft-delete sweep excludes `type="template"`;
  `loadTerrainProjects` excludes templates.
- Keep `components/layout/navigation.test.ts` green with the new nav item.
- e2e: deferred (page renders pies + terrain with seeded data).

## Risks / open items

- **Soft-delete hazard** (mitigated by guard #1). Must be covered by a test.
- **Member-level leakage** — any view that aggregates `AccProjectMember` across all
  projects will see the 4 template members. Skipping the cache writer covers `/users`;
  verify no other surface visibly changes (low risk, 4 rows).
- **Folder-tree assumption** — confirmed only after the first crawl; if the template has no
  configured folders, the terrain is empty (acceptable, surfaced).
- **Freshness** — v1 refresh is manual (re-run the script). The weekly folder-crawl-cron
  auto-refreshes *folders* once the row is seeded; member/role refresh is out of scope for
  v1 (could be folded into the cron later).

## Out of scope (v1)

- Template picker / multiple templates.
- Coordination (Model Coordination) panel — templates have no issues.
- Activity-based donut (no activity exists for a template).
- Automated member/role refresh cron.
