# Access-Analysis Graph Redesign — Workstream 1: Data Inventory & Dimension Model

**Date:** 2026-05-20
**Status:** Locked foundation — approved for implementation planning
**Scope:** Foundation only (the dimension model + data reality). Edge rendering, clustering, layout/physics, 3D, filters UI, and the insight panel are **separate workstreams** with their own specs.

---

## 1. Problem

The current access-analysis graph feels like random floating clusters. Root cause: it is a *projection* layout (`mathLayer.ts`) — each dimension is a spoke on a wheel and each user sits at the weighted average of the spokes they score high on. It never computes whether two users are actually related, draws no edges, and runs no clustering algorithm. The "minimum similarity" control is inert because nothing computes pairwise relationships.

The redesign turns this into a **relationship map**: visible edges grounded in concrete shared attributes, explainable clusters, and an analytical insight panel — a decision-making tool, not decoration.

## 2. Locked foundation (Hybrid, attribute-grounded)

- **Edges = concrete shared attributes only.** A line means two users literally share something measurable. Thickness = amount of overlap. No abstract "82% similar" ribbons.
- **Clusters = real overlap groups**, each with a plain-language explanatory label.
- **Sliders = spatial positioning/emphasis only** — they pull groups apart; they do not redefine edge meaning.
- **Computed similarity = optional background layer**, never the primary visible explanation.
- Every visible edge and cluster must answer: *why are these users connected / grouped?*

> This reverses the earlier "similarity is positional-only, never draw edges" rule. The reversal is deliberate; the surviving constraint is *no abstract-similarity spaghetti* — edges must be explainable by real shared data, and edge volume must stay readable.

## 3. Data audit (ground truth, local `dashboard` DB, 2026-05-20)

**Headline: the data exists; the graph is not wired to it.** The live page's "0 folder grants / no permission data" is a wiring gap, not missing data.

**Critical source correction:** the live-API table `AccProjectMember` is **empty**. The authoritative source is the **Data Connector snapshot (`AccDc*`)**. User universe ≈ **3,367 ACC users** (2,728 active / 639 inactive).

Key counts:
- `AccFolderPermission`: **986,697 rows**. permType: View Only (978,804), View+Download (3,187), View+Download+Upload (678), View+Download+Upload+Edit (3,887), Full Controller (141). Crawl coverage: **77 projects** with data, **1,030 never crawled**.
- `AccDcProjectUserProduct`: 40,169 rows / 2,668 users. Products: docs, insight (near-universal), build (8,808), modelCoordination (2,125), designCollaboration (1,318), cost (300), takeoff (127), forma (113), autoSpecs (14). Each row has `accessLevel` = project_admin | project_user.
- `AccDcProjectUserCompany` + `AccDcCompany`: 13,608 rows / 2,539 users / 319 firms.
- `AccDcUser`: 3,367 users, status active/inactive, lastSignIn populated for 1,134 (34%).
- `AccActivity`: 15,571 events but only **83 distinct users** over ~5 weeks (sparse). rawActions include view/upload/download/edit/issue.
- `AccProjectRole`: 21,624 rows; `docsAccessLevel`/`projectAdminAccessLevel` mostly null (246 admin, 6,062 user, 15,012 null).

The existing engine `lib/acc/userSimilarity.ts` already computes normalized set-overlap per dimension — the edge-strength math is ready. Its input builder (`buildSimilarityInputFromUsers`) only fills projects/roles/(often-empty)folders and drops modules/admin/external, so most dimensions are inert today. **Fix = wiring + correct source tables, not new math.**

## 4. Final dimension model

Each field plays exactly one of three primary roles, with secondary uses noted.

### 4a. Edge drivers — visible lines, thickness = contextual overlap

Edges are allowed only when the shared attribute explains a real relationship between two users. Broad status traits do not create edges by themselves. **Shared context (same project/folder) is required** — a matching attribute value alone (same tier, same role name) is never sufficient.

1. **Shared project** — strongest base relationship. Source: `AccDcProjectUser`. Full coverage.
2. **Shared model/product within project context** — strong differentiator. Differentiating products: build, modelCoordination, designCollaboration, cost, takeoff, forma, autoSpecs. docs/insight are baseline products and should not drive edges. Source: `AccDcProjectUserProduct`.
3. **Shared folder + permission tier** — strong where folder-permission coverage exists (77 projects). Source: `AccFolderPermission.permType`. Two users are connected only when they share permission data within the **same crawled project/folder context**. Same permission tier alone is not enough. Gated by coverage (see §5).
4. **Shared ACC role within project context** — useful but weaker than project/model/permission overlap. Role name alone (e.g. both "Architect" on unrelated projects) must NOT create global edges. Source: `AccDcProjectUserRole` / `AccProjectRole`.
5. **Shared firm affiliation** — light, secondary organizational layer. Source: `AccDcProjectUserCompany`. Same-firm edges must be weaker than operational relationships and must be **capped, dampened, or layer-gated** to avoid large-firm cliques/hairballs. Firm-only pairs render very light or hidden unless the firm layer is enabled; firm strengthens an explanation when combined with shared project/model/permission.

**Not edge drivers:** admin/member, internal/external, account status, last sign-in, data coverage, company role, and raw activity events.

### 4b. Positioning axes — sliders; visual separation only

These traits help pull groups apart visually, but they do not create edges by themselves.

- **Admin vs member** — derived from product `accessLevel = project_admin` and role admin levels.
- **Internal vs external** — heuristic from email domain. Useful, but not extracted truth.
- **Account status: active vs inactive** — from `AccDcUser.status`. This is user/account status, **not** recent activity behavior — do not treat it as an activity substitute.
- **Permission strength** — View → Download → Upload → Edit → Full Control, only where permission coverage is known.
- **Permission coverage** — known vs unknown.
- **Firm affiliation** — optional light positioning influence, especially when the firm layer is enabled.

### 4c. Metadata / tooltip / filter
- Last sign-in (`AccDcUser.lastSignIn`, 34%) — metadata + filter, not an edge driver.
- docs/insight baseline products — shown, never clustered on.
- added-on recency, folder paths — tooltip context.
- Permission coverage (Known/Unknown) — badge + filter (see §5).

### 4d. Insight-panel-only
- Per-model **access level** (project_admin vs project_user) — primary signal for over-/under-permission detection; works even where folder crawl is missing.
- Folder `actions` (raw APS) — granular permission drill-down.
- Activity events (view/upload/download/edit/issue) — behavioral detail for the 83 covered users.
- Role docs/admin access level — supporting permission hint (too null-heavy for edges).

### 4e. Removed / out of scope
- **Company role** (free-text job title) — sparse/messy (~920 "Unknown"). Removed.
- **Data coverage flags** — a data-quality artifact, not a user trait. Removed as a dimension.
- `UserModuleAccess` table — empty/legacy. Ignore.
- Family / Clash / Sim / LOD / Exam / auth `User`/`Account` tables — not ACC-user-graph data.

## 5. Coverage rules (honesty constraints)

**Permission coverage (emphatic):** Never infer permissions for uncrawled projects. Users in uncrawled projects (1,030 of ~1,143) get an explicit **"permission coverage unknown"** state:
- Badge: "Permission coverage unknown"
- Tooltip: "Folder permissions have not been crawled for this project/user."
- Filter: Known coverage / Unknown coverage
- Insight-panel warning when a selected user has partial/missing coverage
- Unknown coverage MUST NOT create permission edges, permission clusters, or over-/under-permissioned insights. Those users still participate via project/model/role/admin/external/account-status dimensions, plus activity metadata where available. Missing data stays missing — do not classify uncrawled users as view-only or low-permission.

**Activity coverage:** detailed event logs (`AccActivity`) cover only 83 users. Keep two concepts distinct:
- **Account status** (active/inactive, full coverage) — a positioning axis + filter only. It is NOT recent activity.
- **Recent activity / editions** (event behavior) — insight-panel detail only, shown for the 83 covered users with an "activity detail unavailable" note otherwise. Not an edge or cluster driver until coverage widens.

## 6. Work required to realize this model

- **Wiring (most of the work):** point the graph's feature/similarity feed at the DC snapshot tables; populate moduleIds, admin, external, firm, activity-status into the similarity input (currently dropped).
- **Source migration:** stop reading the empty `AccProjectMember`; read `AccDc*`.
- **Coverage plumbing:** surface `folderCrawlStatus` per user so the unknown-permission state can render.
- **Validation needed:** `executive` flag is empty in DC (validate before any use); confirm the live-page "1,223" vs DC "3,367" user-count discrepancy (likely a hub/active filter) before finalizing the node population.
- **Optional future extraction:** folder-crawl the 1,030 uncrawled projects to widen permission coverage (separate effort; burns Data Connector quota).

## 7. Edge-weight hierarchy (summary)

```
shared project              ████████  strongest
shared model/product        ███████
shared folder/permission    ██████   only where coverage is known
shared role                 ████     contextual; weaker than permission
shared firm                 ██       lightest; hidden unless layer on / combined
```

Rationale: permission/folder overlap is more operationally meaningful than shared role text. Activity is not an edge driver — it is a positioning axis (account status) + insight detail; see §4a/§4d.

## 8. Out of scope for this workstream (deferred)
- How edges are computed/thresholded/rendered (Workstream 2).
- Clustering algorithm + label generation (Workstream 3).
- Slider layout + smooth physics (Workstream 4).
- 3D analytical view (Workstream 5).
- Filter UI (Workstream 6).
- Insight panel UI (Workstream 7).

Dependency note: Workstreams 4, 5, 6 depend on Workstream 2 (edges), not only on dimensions and clusters.
