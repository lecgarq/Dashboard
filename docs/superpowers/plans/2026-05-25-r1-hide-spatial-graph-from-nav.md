# R1 — Hide Legacy Spatial Graph Route From Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **STATUS: PLAN ONLY — DO NOT EXECUTE.** This document was written by Terminal **T2**. Do **not**
> implement R1 until **P7 is formally closed** (T1-owned) **and Luis explicitly approves execution**.
> Nothing in this plan has been applied; no nav, route, or graph file has been modified.

**Goal:** Remove `/users/spatial-graph` from the dashboard sidebar navigation while keeping the route itself fully URL-reachable as a legacy fallback.

**Architecture:** The sidebar is data-driven — `components/layout/Sidebar.tsx` renders purely from the exported `MODULE_NAV_ITEMS` array in `components/layout/navigation.ts`. Hiding the route from nav is therefore a single array-element deletion plus an inversion of the unit test that currently asserts the entry's presence. No route file, redirect, or renderer is touched, so the URL stays alive.

**Tech Stack:** Next.js App Router (route dirs under `app/(dashboard)/`), TypeScript, Vitest (unit), Playwright (e2e), lucide-react icons.

---

## 1. Goal

Remove the **Spatial Graph** item from the primary sidebar navigation so it is no longer a discoverable nav destination, **without** redirecting, deleting, or otherwise altering the `/users/spatial-graph` route. After R1, `/users/spatial-graph` must still load and render exactly as it does today when reached by direct URL or bookmark.

Scope is **navigation only**. This is audit "step 2" (the recommended, lowest-risk, fully reversible first action). It does **not** include redirect (step 4), deletion/monolith retirement (step 5), or the `/access-analysis` vs `/users/access-analysis` de-duplication (step 6).

## 2. Current route state

Evidence from the committed audit `docs/superpowers/research/2026-05-25-spatial-graph-route-consolidation-audit.md` (commit `6efe37d`) and the live tree:

| Route | Route file | Renders | In nav today? |
|---|---|---|---|
| `/access-analysis` | `app/(dashboard)/access-analysis/page.tsx` (untracked) | consolidated charts + WebGL graph | ✅ `navigation.ts:30` |
| `/users/access-analysis` | `app/(dashboard)/users/access-analysis/page.tsx` (tracked) | graph shell only (e2e target `GRAPH_URL`) | ❌ (orphaned) |
| `/users/spatial-graph` | `app/(dashboard)/users/spatial-graph/page.tsx` (tracked) + `SpatialGraphOnly.tsx` (untracked) | legacy `AccUsersGraph` monolith, `layoutMode="blob"` | ✅ `navigation.ts:31` ← **R1 removes this** |

Relevant current facts:

- **Nav source:** `components/layout/navigation.ts:31` declares the entry:
  `{ href: "/users/spatial-graph", label: "Spatial Graph", icon: Network, group: "Organization" }`.
- **Nav consumer:** `components/layout/Sidebar.tsx` iterates `MODULE_NAV_ITEMS` (and `STAFF_NAV_ITEM`). It contains **no** hardcoded `spatial-graph` reference — removing the array entry is sufficient to hide it. (Verified: `spatial-graph` does not appear in `Sidebar.tsx`.)
- **Existing guard test:** `components/layout/navigation.test.ts:5-13` currently asserts that the spatial-graph entry **is present**. This test will fail the moment the entry is removed and must be inverted as part of R1 (it becomes the executable spec for "hidden but reachable").
- **Other in-tree references to `spatial-graph` (NOT navigation, left untouched by R1):**
  - `app/(dashboard)/users/access-analysis/HybridAnalyticsSurface.tsx:724` — an in-content `<Link href="/users/spatial-graph">`. This is a **forbidden** access-analysis runtime file and is not the primary nav; R1 leaves it. It also helps the route stay discoverable/reachable.
  - `app/(dashboard)/users/AccUsersGraph.tsx:299` — a code comment only; forbidden file, untouched.
  - `.next/` / `.next-dev/` build artifacts — generated, not edited.

> **Note on canonical-URL discrepancy (out of R1 scope):** the R1 brief names `/users/access-analysis` as the
> canonical final graph route, while the audit found the nav-facing route is `/access-analysis` and
> `/users/access-analysis` is the orphaned e2e shell. R1 does **not** depend on resolving this — it neither
> adds nor changes any access-analysis nav entry. Resolution is audit step 6 and a separate, T1-coordinated change.

## 3. Accepted decisions from audit

From the brief and the audit (`6efe37d`), the accepted decisions R1 operates under:

- Canonical final graph route = `/users/access-analysis` (per brief). `/access-analysis` remains a separate charts/dashboard surface for now.
- `/users/spatial-graph` = **legacy fallback**.
- `/users/spatial-graph` should **not** remain a primary nav item long-term.
- **Do not** redirect `/users/spatial-graph` yet (audit step 4 — deferred).
- **Do not** delete `/users/spatial-graph` yet (audit step 5 — deferred).
- **Do not** retire `AccUsersGraph` yet (audit step 5 — deferred).
- Parity questions (folder-permission clustering, external-inclusive node scope) are **not** gated by R1; they gate steps 4–5 only.
- R1 = audit step 2 ("Hide `spatial-graph` from nav … Lowest-risk, fully reversible, keeps the route reachable as a fallback. **Recommended first action.**").

## 4. Exact files expected to change later

Exactly **two** files. No others.

- **Modify:** `components/layout/navigation.ts` — remove the single `spatial-graph` entry currently at line 31 of `MODULE_NAV_ITEMS`. If the `Network` icon import (`navigation.ts:12`) becomes unused after removal, also drop it from the lucide-react import to keep the file lint-clean (verify with a search before removing — see Task 1, Step 3).
- **Modify:** `components/layout/navigation.test.ts` — invert the existing assertion so it asserts the spatial-graph entry is **absent** while `/users` and `/access-analysis` remain present.

No new files are created. No route, renderer, or graph file is created or modified.

## 5. Tests required

- **Unit (Vitest), required, authored in this plan:** update `components/layout/navigation.test.ts` to assert:
  1. `MODULE_NAV_ITEMS` still contains `/users` (Users Directory) and `/access-analysis` (Access Analysis).
  2. `MODULE_NAV_ITEMS` contains **no** item whose `href` is `/users/spatial-graph`.
  This is the executable spec for "hidden from nav." Full test code is in Task 2.
- **Route-reachability check (manual/dev, documented — no new automated test added by R1):** confirm the route file `app/(dashboard)/users/spatial-graph/page.tsx` is untouched (`git status` clean for that path) so the URL still resolves. R1 intentionally adds **no** e2e test for `/users/spatial-graph` (writing one would risk touching graph/e2e-adjacent files; deferred to the consolidation phase per audit §9). See Task 3.
- **Regression gate:** run the full unit suite to confirm nothing else asserted the spatial-graph nav entry. (Audit confirms the only such assertion is `navigation.test.ts`.)

Commands (PowerShell):

- Targeted nav test: `npm run test -- components/layout/navigation.test.ts`
- Full unit suite: `npm run test`
- Type check: `npm run typecheck` (or the repo's configured `tsc --noEmit` script)

> Adapt the script names to the repo's `package.json` if they differ; the intent is "run the nav unit test", "run the full unit suite", "type-check".

## 6. Forbidden files

R1 must **not** create, modify, stage, delete, redirect, or rename any of the following. Touching any of these means stop (see §9):

- `app/(dashboard)/users/spatial-graph/page.tsx` — the route must stay reachable; **do not** redirect or delete.
- `app/(dashboard)/users/spatial-graph/SpatialGraphOnly.tsx`
- `app/(dashboard)/users/AccUsersGraph.tsx` and its cluster (`accGraph3d.ts`, `accGraphFilters.ts`, `accGraphOrganicLayout.ts`, `accGraphParts.tsx`, `accGraphModes.ts`, `accGraphTypes.ts`, `graphRenderers.ts`, `threeGraphRenderer.ts`, `cosmosUtils.ts`, `folderCluster.ts`, `adminTierShape.ts`, and their co-located tests).
- Any graph renderer (`graphRenderers.ts`, `threeGraphRenderer.ts`, `GraphCanvas*.tsx`).
- Lasso, camera, `UserDetailPanel`, `dimensionRegistry.ts`, `featureSnapshot.ts`, `graphTables.ts`.
- Any **P7** file (`accessFacets.ts`/`.test.ts`, `RiskAccessPanel.tsx`, and anything referenced by the P7 plan) — **P7 is T1-owned and live.**
- Any **access-analysis runtime file** under `app/(dashboard)/users/access-analysis/**` and `app/(dashboard)/access-analysis/**` — including `HybridAnalyticsSurface.tsx` (whose in-content `spatial-graph` link is intentionally left in place).
- `tests/e2e/acc-dc-graph.spec.ts` — its `GRAPH_URL` is unaffected by R1; do not edit.
- `components/layout/Sidebar.tsx` — no edit needed; it renders from the array.

## 7. Rollback strategy

R1 is fully reversible and isolated to two files.

- **Primary rollback:** revert the single R1 commit — `git revert <r1-commit-sha>` — which restores the `navigation.ts` entry and the original `navigation.test.ts` assertion. The route was never altered, so nothing else needs restoring.
- **Pre-merge rollback:** if working on a branch and not yet merged, `git checkout -- components/layout/navigation.ts components/layout/navigation.test.ts` discards the change.
- **Why low-risk:** the route, its page, the monolith, and all renderers are untouched, so reverting nav has zero data/route side effects. Anyone who bookmarked `/users/spatial-graph` keeps working through the whole hide→fallback window regardless of rollback state.
- **Verification after rollback:** `npm run test -- components/layout/navigation.test.ts` returns to asserting the entry present; the sidebar shows Spatial Graph again.

## 8. Atomic task breakdown

### Task 1: Remove the spatial-graph entry from the nav array

**Files:**
- Modify: `components/layout/navigation.ts:31` (and possibly the `Network` import at `:12`)

- [ ] **Step 1: Confirm the current entry and its line**

Run: `npm run test -- components/layout/navigation.test.ts`
Expected: PASS (the existing test asserts the spatial-graph entry is present — this is the pre-change baseline).

- [ ] **Step 2: Remove the array entry**

In `components/layout/navigation.ts`, delete this exact line from `MODULE_NAV_ITEMS`:

```ts
  { href: "/users/spatial-graph", label: "Spatial Graph", icon: Network, group: "Organization" },
```

Resulting `MODULE_NAV_ITEMS` (Organization group now has Users Directory, Access Analysis, Sync Center — no Spatial Graph):

```ts
export const MODULE_NAV_ITEMS: NavigationItem[] = [
  { href: "/home", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users Directory", icon: Users, group: "Organization" },
  { href: "/access-analysis", label: "Access Analysis", icon: PieChart, group: "Organization" },
  { href: "/sync-center", label: "Sync Center", icon: RefreshCw, group: "Organization" },
  { href: "/clash-detection", label: "Clash Detection", icon: Zap, module: "clash", group: "Wiki Bar" },
  { href: "/sim-automation", label: "Sim Automation", icon: Cpu, module: "sim", group: "Wiki Bar" },
  { href: "/families", label: "Familias Parametricas", icon: Building2, module: "families", group: "Familias Parametricas" },
  { href: "/exam", label: "Examen Revit", icon: ClipboardCheck, module: "exam", group: "AI Tools" },
  { href: "/lod-checker", label: "LOD Checker", icon: Ruler, module: "lod", group: "AI Tools" },
  { href: "/trello", label: "Trello", icon: Kanban, module: "trello", group: "Integrations" },
];
```

- [ ] **Step 3: Remove the now-unused `Network` icon import if and only if it is unused**

Search the file for any remaining use of `Network`:

Run: `npm run test` is not the check here — instead grep the single file. The `Network` icon (`navigation.ts:12`) is used **only** by the removed entry. After removal, delete `  Network,` from the lucide-react import block at the top of `components/layout/navigation.ts` so the file has no unused import.

Verify before deleting: confirm `Network` appears nowhere else in `navigation.ts`. If (and only if) it is unused, remove the import line:

```ts
  Network,
```

Expected: the import block no longer lists `Network`; no other reference remains.

- [ ] **Step 4: Type-check**

Run: `npm run typecheck`
Expected: PASS, no unused-import or missing-symbol errors in `components/layout/navigation.ts`.

(No commit yet — the existing test now fails by design; Task 2 fixes the test, then we commit the pair together so the tree is never left red. Do not commit a half-state.)

### Task 2: Invert the nav unit test to assert "hidden but siblings intact"

**Files:**
- Modify: `components/layout/navigation.test.ts`

- [ ] **Step 1: Replace the test with the inverted assertion**

Replace the full contents of `components/layout/navigation.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { MODULE_NAV_ITEMS } from "./navigation";

describe("dashboard navigation", () => {
  it("keeps users and access analysis as separate destinations", () => {
    expect(MODULE_NAV_ITEMS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/users", label: "Users Directory" }),
        expect.objectContaining({ href: "/access-analysis", label: "Access Analysis" }),
      ]),
    );
  });

  it("hides the legacy spatial-graph route from navigation", () => {
    expect(
      MODULE_NAV_ITEMS.some((item) => item.href === "/users/spatial-graph"),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the nav test to verify it passes against the Task 1 change**

Run: `npm run test -- components/layout/navigation.test.ts`
Expected: PASS — both cases green (siblings present, spatial-graph absent).

- [ ] **Step 3: Run the full unit suite to confirm no other test asserted the entry**

Run: `npm run test`
Expected: PASS — no other test references `/users/spatial-graph` in nav (audit confirms `navigation.test.ts` was the only such assertion).

- [ ] **Step 4: Commit the nav change and the test together**

```bash
git add components/layout/navigation.ts components/layout/navigation.test.ts
git commit -m "feat(nav): hide legacy spatial-graph route from sidebar (R1)"
```

> Use `git add` with the two explicit paths only. Before committing, run `git diff --cached --name-only` and confirm it lists **exactly** `components/layout/navigation.ts` and `components/layout/navigation.test.ts` — nothing else (this branch carries large pre-existing WIP in the index).

### Task 3: Verify `/users/spatial-graph` is still URL-reachable

**Files:** none modified (verification only).

- [ ] **Step 1: Confirm the route files were untouched**

Run: `git status --porcelain app/(dashboard)/users/spatial-graph/`
Expected: no R1-introduced modification, deletion, or rename of `page.tsx`. (Any pre-existing untracked `SpatialGraphOnly.tsx` state is unchanged by R1.)

- [ ] **Step 2: Confirm the route still resolves at runtime**

Start the dev server (or use the running instance) and navigate directly to `http://localhost:3000/users/spatial-graph`.
Expected: the legacy `AccUsersGraph` blob view loads exactly as before. It is simply no longer linked from the sidebar.

- [ ] **Step 3: Confirm the sidebar no longer shows the item**

Open any dashboard page; inspect the Organization nav group.
Expected: "Spatial Graph" is gone; Users Directory, Access Analysis, and Sync Center remain.

## 9. Stop conditions

Stop immediately and surface to Luis (do not improvise) if any of these occur:

- **Pre-approval:** P7 is not yet formally closed, or Luis has not explicitly approved R1 execution. (R1 is plan-only until both are true.)
- **Scope creep:** the change would require editing, deleting, redirecting, or renaming **any** file other than `components/layout/navigation.ts` and `components/layout/navigation.test.ts`.
- **Forbidden touch:** any §6 forbidden file appears in `git diff --cached --name-only` or is otherwise modified.
- **Route would become unreachable:** any step trends toward redirecting or deleting `app/(dashboard)/users/spatial-graph/page.tsx` — that is audit step 4/5, not R1.
- **Test surprise:** removing the nav entry breaks a test **other than** `navigation.test.ts`, indicating an undocumented coupling — investigate and report before proceeding.
- **Staging hazard:** `git diff --cached --name-only` shows files beyond the two intended paths — unstage and re-stage by explicit path before committing.
- **Type/lint failure** that cannot be resolved purely within the two allowed files.

## 10. Confirmation: `/users/spatial-graph` remains URL-reachable

R1 changes **only** the navigation array and its unit test. It does **not** modify, redirect, or delete:

- `app/(dashboard)/users/spatial-graph/page.tsx` (the route handler),
- `app/(dashboard)/users/spatial-graph/SpatialGraphOnly.tsx` (the view),
- `AccUsersGraph` or any renderer.

Because the Next.js App Router resolves routes from the filesystem (`app/(dashboard)/users/spatial-graph/page.tsx`) independently of `MODULE_NAV_ITEMS`, the URL `/users/spatial-graph` continues to resolve and render after R1. The route is merely **hidden from discovery in the sidebar**, satisfying "legacy fallback: not a primary nav item, still reachable by direct URL/bookmark." Task 3 explicitly verifies this. The in-content link at `HybridAnalyticsSurface.tsx:724` is left intact, providing an additional (non-primary-nav) path to the route during the fallback window.

---

## Self-Review

- **Spec coverage:** all 10 required sections present (Goal §1, Current route state §2, Accepted decisions §3, Files §4, Tests §5, Forbidden files §6, Rollback §7, Atomic tasks §8, Stop conditions §9, URL-reachability confirmation §10). ✅
- **Placeholder scan:** no TBD/TODO; all code shown in full (both the post-removal array and the full replacement test). ✅
- **Type consistency:** `MODULE_NAV_ITEMS` and `NavigationItem.href` names match `navigation.ts`; the test imports the same symbol. The conditional `Network` import removal is gated on a verified-unused check. ✅
- **Constraint compliance:** plan-only; two-file scope; route/renderer/P7/access-analysis files all in Forbidden §6; explicit-path staging guard included for the WIP-heavy index. ✅
