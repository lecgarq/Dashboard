# Spatial-Graph Route Consolidation Audit (2026-05-25)

> **Status:** Read-only research report. **No files modified, no routes touched, nothing staged/committed.**
> The only file written is this report.
> **Author:** Terminal **T2**. **Boundary:** T1 owns P7 badge/filter implementation + graph
> implementation files — those are **read-to-document only** here (see §Boundaries).
> **Companions:** [`../codebase-map/access-analysis-graph.md`](../codebase-map/access-analysis-graph.md) ·
> [`../codebase-map/file-ownership-map.md`](../codebase-map/file-ownership-map.md) ·
> [`../codebase-map/active-wip-boundaries.md`](../codebase-map/active-wip-boundaries.md).

## Why this matters / scope

The repo currently exposes the user-graph through **three** route entry points that overlap. The brief
asks specifically about consolidating `spatial-graph` under `access-analysis`; this audit also surfaces a
**second duplication** (`/access-analysis` vs `/users/access-analysis`) that any consolidation must account
for, because they share the same shell.

> ⚠️ **The codebase map drifted from the tree.** `access-analysis-graph.md` describes the *consolidated*
> subsystem (`AccessAnalysisShell` → `GraphCanvas2D/3D`) and does **not** mention `AccUsersGraph` /
> `graphRenderers.ts` / `threeGraphRenderer.ts`. Those legacy monolith files still exist in the tree and
> back `spatial-graph`. This report is written from the **live tree**, with file+line evidence.

---

## The three surfaces (evidence)

| Route | Route file | Renders | Backed by | In nav? | Tested by e2e? |
|---|---|---|---|---|---|
| **`/access-analysis`** | `app/(dashboard)/access-analysis/page.tsx` (**untracked**) | `AccessAnalysisPage` → `DeferredAnalyticsSection` → `HybridAnalyticsSurface` (charts **+** graph) | new consolidated subsystem | ✅ `navigation.ts:30` | ❌ (not the e2e URL) |
| **`/users/access-analysis`** | `app/(dashboard)/users/access-analysis/page.tsx` (tracked) | `AccessAnalysisShellClient` → `AccessAnalysisShell` (**graph shell only**) | same consolidated subsystem | ❌ (orphaned) | ✅ `GRAPH_URL = "/users/access-analysis"` (`acc-dc-graph.spec.ts:26`) |
| **`/users/spatial-graph`** | `app/(dashboard)/users/spatial-graph/page.tsx` (tracked) + `SpatialGraphOnly.tsx` (**untracked**) | `SpatialGraphOnly` → **`AccUsersGraph`** monolith, `layoutMode="blob"` | **legacy** `AccUsersGraph` (4,093-line monolith) | ✅ `navigation.ts:31` | ❌ |

Key seam: **`AccUsersGraph` is imported by exactly one place** — `SpatialGraphOnly.tsx:6,76` (verified by
grep across `**/*.{ts,tsx}`; every other "AccUsersGraph" hit is a comment or a sibling helper). So the
entire `accGraph*` monolith cluster is reachable **only** through `/users/spatial-graph`.

---

## Answers to the brief's questions

### 1. Which route is the current final graph?
**`/access-analysis`** (top-level, `navigation.ts:30`). It renders `AccessAnalysisPage`
(`app/(dashboard)/users/access-analysis/AccessAnalysisPage.tsx`), which mounts `DeferredAnalyticsSection`
(ssr:false) → the consolidated **charts + WebGL graph** surface (`HybridAnalyticsSurface`). The same graph
shell is also reachable bare at **`/users/access-analysis`** (the route the e2e suite drives). Both are the
*new* subsystem (`GraphCanvas2D`/`GraphCanvas3D`, `dimensionRegistry`, sliders, `sameUserEdges`, …).

### 2. Which route is legacy?
**`/users/spatial-graph`.** It is the only consumer of the legacy **`AccUsersGraph`** monolith and its
`accGraph*` / `graphRenderers` / `threeGraphRenderer` / `cosmosUtils` / `accGraphOrganicLayout` cluster.

### 3. Does spatial-graph still use the `AccUsersGraph` monolith?
**Yes.** `SpatialGraphOnly.tsx:76` renders `<AccUsersGraph users={…} layoutMode="blob" folderRows={…} />`.
It is the **sole** importer of the monolith component.

### 4. Does spatial-graph have unique functionality not in access-analysis?
Yes — a handful of things appear unique to the monolith path. Each needs a parity decision before retiring:

1. **"Blob" exploratory layout** (`AccUsersGraphProps.layoutMode: "topology" | "blob"`,
   `AccUsersGraph.tsx:302`) — chaotic-scatter seed mode used only by spatial-graph. The new graph uses a
   registry/slider target model instead; there is no "blob" equivalent.
2. **Folder-permission "functional team" clustering** — `SpatialGraphOnly` fetches
   `accFolders.getMatrix` and passes `folderRows`; the monolith builds a `(projectId::roleId) → folderHubs`
   lookup (`AccUsersGraph.tsx:759-775`, `computeAccessibleFolderHubs`) to cluster users with shared folder
   access. **Verify** whether the new graph's `folder`/registry dimensions cover this.
3. **External-collaborator-inclusive data scope** — `SpatialGraphOnly.tsx:33-42` deliberately uses
   `users.bulkAccSummary` **directly** (not `useMergedAccUsers`) to avoid the Google-Workspace-directory
   intersection that "drops every external collaborator." *Likely already addressed* in the new graph (it
   queries `accDcGraph.bulkUsers` directly and has a working `internalExternal` color mode — the e2e
   asserts external nodes exist, `acc-dc-graph.spec.ts:263-266`), but **confirm node-set parity** before
   relying on it.
4. **Investigative monolith features** — graph modes (`users` / `access-hubs` / `folder-permissions`),
   similarity-strength filters/URL codec, admin-tier overlay, perf HUD. These are largely **superseded** by
   the new dimension/slider/color-mode model, but a feature-by-feature parity pass is warranted before
   deletion (not just before hiding).

### 5. Does access-analysis now have…?
Confirmed present in `app/(dashboard)/users/access-analysis/`:

| Capability | Evidence |
|---|---|
| **2D / 3D** | `GraphCanvas.tsx` (dispatcher, both always mounted), `GraphCanvas2D.tsx`, `GraphCanvas3D.tsx`; e2e 3D test `acc-dc-graph.spec.ts:289+` |
| **Sliders** | `SliderContext.tsx`, `SliderSidebar.tsx`, `SliderGroup.tsx`, `DimensionSlider.tsx` |
| **Presets** | `PresetBar.tsx`, `sliderPresets.ts`, `__tests__/sliderPresets.test.ts` |
| **Color modes** | `nodeColors.ts`; e2e color-mode switch `acc-dc-graph.spec.ts:263,278` |
| **Same-user edges** | `sameUserEdges.ts`, `linkEmphasis.ts` (+ tests) |
| **P5/P6 enriched dimensions** | `dimensionRegistry.ts`, `featureSnapshot.ts`, `riskFlags.ts`, `moduleFlags.ts`, `featureTargets.ts` |
| **P7 badge/filter surfaces** | **In progress, T1-owned, NOT complete.** `accessFacets.ts` + `accessFacets.test.ts` are present in-tree (matcher landed), but `RiskAccessPanel.tsx` does **not** exist yet, and the plan `docs/superpowers/plans/2026-05-25-p7-badge-filter-surfaces.md` is still at "stopped after writing the plan." Treat P7 as live and **off-limits**. |

### 6. Is spatial-graph linked in nav?
**Yes** — `navigation.ts:31`: `{ href: "/users/spatial-graph", label: "Spatial Graph", icon: Network, group: "Organization" }`.

### 7. Is access-analysis linked in nav?
**Yes, but the top-level route** — `navigation.ts:30`: `{ href: "/access-analysis", label: "Access Analysis", icon: PieChart, group: "Organization" }`. The graph-shell route `/users/access-analysis` (the e2e target) is **not** in nav.

### 8. Safest consolidation path
A **phased, reversible** sequence — do not jump straight to deletion. (All steps are *future* work; nothing
applied here.)

1. **Parity confirmation first (no code change).** Decide the fate of the four §4 uniques — especially
   folder-permission clustering and external-inclusive node scope. Until that's settled, do not redirect or
   delete.
2. **Hide `spatial-graph` from nav** — remove the `navigation.ts:31` entry. Lowest-risk, fully reversible,
   keeps the route reachable as a fallback. **Recommended first action.**
3. **Keep the route temporarily as a fallback** (one release) so anyone with a bookmark still lands
   somewhere, while you watch for "where did the blob view go?" feedback.
4. **Redirect `/users/spatial-graph` → `/access-analysis`** (e.g. a `redirect()` in its `page.tsx`) once
   parity is accepted. This is the point of no easy return for the blob view, so gate it on step 1.
5. **Delete the route + retire the monolith cluster** only after the redirect has ridden a release with no
   regressions. Because `AccUsersGraph` is imported solely by `SpatialGraphOnly`, deletion can cascade to
   the whole `accGraph*` cluster (§10) — do it as a dedicated cleanup with a green knip pass.
6. **Separately, de-duplicate `/access-analysis` vs `/users/access-analysis`.** Pick one canonical URL.
   Recommended: keep `/access-analysis` (nav-facing, full charts+graph), and either redirect
   `/users/access-analysis` → `/access-analysis` **or** repoint the e2e `GRAPH_URL` and keep the bare shell
   route for testing. **Caution:** changing `/users/access-analysis` will break the e2e suite unless
   `GRAPH_URL` (`acc-dc-graph.spec.ts:26`) is updated in the same change — this is T1/graph-adjacent.

**Recommendation:** steps **1 → 2 → 3** are safe and reversible and can happen now (with approval). Steps
4–6 are larger and should each be their own approved change.

### 9. Tests that should protect the consolidation
- **`tests/e2e/acc-dc-graph.spec.ts`** — the integrated graph guard. It drives `GRAPH_URL =
  "/users/access-analysis"`. **Any change to that route path must update `GRAPH_URL` in lockstep**, or the
  whole suite fails at `gotoGraph` (`:117-120`). This is the single highest-leverage protection.
- **A new nav test** — `components/layout/navigation.test.ts` already exists (untracked). Add a case
  asserting the `spatial-graph` entry is gone (after step 2) and `/access-analysis` remains.
- **A redirect test** (when step 4 lands) — assert `/users/spatial-graph` issues a redirect to
  `/access-analysis` (route/integration test).
- **Parity guard before deletion** — if folder-permission clustering or external-inclusive scope is judged
  worth keeping, add coverage on the *new* graph proving that behavior exists there **before** removing the
  monolith, so deletion can't silently drop a feature.
- **knip / dead-code gate** — after monolith deletion, run knip to prove the `accGraph*` cluster is fully
  orphaned and nothing else regressed.

> Note: there is currently **no** e2e/route test hitting `/access-analysis` (nav route) or
> `/users/spatial-graph` directly. Consolidation is a good moment to close that gap.

### 10. Files that would be touched later (if Luis approves implementation)
**Minimal path (hide from nav — step 2):**
- `components/layout/navigation.ts` — remove the `spatial-graph` entry (and update `navigation.test.ts`).

**Redirect (step 4):**
- `app/(dashboard)/users/spatial-graph/page.tsx` — replace body with a `redirect("/access-analysis")`.

**Full retirement (step 5) — delete, only after parity + a fallback release.** `AccUsersGraph` is imported
only by `SpatialGraphOnly`, so these become orphaned (verify each with grep/knip before removing):
- `app/(dashboard)/users/spatial-graph/` (`page.tsx`, `SpatialGraphOnly.tsx`)
- `app/(dashboard)/users/AccUsersGraph.tsx` and its cluster: `accGraph3d.ts`, `accGraphFilters.ts`,
  `accGraphOrganicLayout.ts`, `accGraphParts.tsx`, `accGraphModes.ts`, `accGraphTypes.ts`,
  `graphRenderers.ts`, `threeGraphRenderer.ts`, `cosmosUtils.ts`, `folderCluster.ts`,
  `AccAnalysisPanel`, `adminTierShape.ts` — **plus their co-located tests** (`accGraph3d.test.ts`,
  `accGraphFilters.test.ts`, `cosmosUtils.test.ts`, …). Confirm no cross-imports from the *new* subsystem
  first (e.g. `nodeColors.ts:14` only *references* the legacy stack in a comment; verify no runtime import).

**De-dup `/users/access-analysis` (step 6) — graph/e2e-adjacent, coordinate with T1:**
- `app/(dashboard)/users/access-analysis/page.tsx` (+ `AccessAnalysisShellClient.tsx`) — redirect or keep.
- `tests/e2e/acc-dc-graph.spec.ts:26` (`GRAPH_URL`) — must change in lockstep.

> ⚠️ Several of the deletion targets above are **graph implementation files** the brief marks do-not-touch
> for T2, and the e2e change is T1-adjacent. This report only *lists* them; the actual edits need explicit
> approval and likely T1 coordination.

---

## Boundaries respected (this session)
- **Read-only.** No files modified; no route deleted, redirected, or renamed; nothing staged/committed.
- **P7 left untouched.** `accessFacets.ts`/`.test.ts` (landed) and the P7 plan were **read** to answer Q5
  only; `RiskAccessPanel.tsx` etc. are T1's to create. No P7 file edited.
- **Graph implementation files** (`AccUsersGraph.tsx`, renderers, `access-analysis/**`) were read to
  characterize, never modified.
- The only artifact produced is this report under `docs/superpowers/research/` (T2's docs lane).

## Open items for Luis to decide
1. **Folder-permission clustering** and **external-inclusive node scope** — port to the new graph, or
   accept their loss? (Gates steps 4–5.)
2. **Canonical access-analysis URL** — `/access-analysis` vs `/users/access-analysis`? (Affects e2e.)
3. Approve the safe, reversible **steps 1–3** now, or hold the whole consolidation for one combined change?
</content>
