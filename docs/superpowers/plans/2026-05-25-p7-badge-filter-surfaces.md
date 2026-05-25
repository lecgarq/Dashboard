# P7 — Badge/Filter Surfaces for Risk, Permission Profile, and Module Focus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the already-emitted P5/P6 enriched snapshot fields (`riskFlags`, `permissionTypeSummary`, `moduleFlags`) as readable badge/filter surfaces on the access-analysis graph — without adding sliders, edges, or any physics change.

**Architecture:** P7 rides the **existing mask bus** only. `FilterContext.activeFilters` (a `Record<key, Set<string>>`, OR-within-key / AND-across-keys) already feeds `usePredicateEngine` → `physics.setMask`. P7 adds three new *facet keys* to that map (`riskFlag`, `permProfile`, `module`) backed by a new pure matcher module (`accessFacets.ts`), plus a compact "Risk & Access" Toolbar popover that toggles them and shows live count badges. No new `DIMENSION_REGISTRY` descriptors. No slider. No physics symbol is read or written anywhere in P7 code.

**Tech Stack:** TypeScript, React 19 (Next 16 App Router), Vitest + Testing Library (unit/UI), Playwright (e2e via `window.__ACC_GRAPH_TEST__` bridge), Tailwind, lucide-react, `@/components/ui/*` (shadcn).

---

## Why this is safe (WIP boundary analysis — read before starting)

Per `docs/superpowers/codebase-map/`:

- **T1 owns** the P5-C activity slice: `featureSnapshot.ts`, `interactionTypes.ts`, `graphTables.ts`, `acc-hot-cache.ts`, `dcUserAssembly.ts`, `acc-dc-graph.ts`, `activityAggregate.ts`, `AccessAnalysisShell.tsx`'s `includeActivityMix`, and the P5-C tests. **P7 does not edit any of these.** P7 only *reads* the snapshot fields they already produce.
- **Forbidden casual-edit files P7 does NOT touch:** `physicsLayer.ts`, `mathLayer.ts`, `GraphCanvas*.tsx`, `CosmosCanvasClient.ts`, `sameUserEdges.ts`, `linkEmphasis.ts`, `LassoOverlay.tsx`, `UserDetailPanel.tsx`, `page.tsx`, any `server/routers/*`, `dimensionRegistry.ts`.
- **Files P7 creates** (no ownership conflict): `accessFacets.ts`, `accessFacets.test.ts`, `RiskAccessPanel.tsx`, `__tests__/RiskAccessPanel.test.tsx`.
- **Files P7 modifies** (P4-01/P4-02 chrome — *not* T1-owned, *not* forbidden): `usePredicateEngine.ts`, `FilterContext.tsx`, `Toolbar.tsx`, their co-located tests, and an appended (never-modified-in-place) block in `tests/e2e/acc-dc-graph.spec.ts`.

**Staging rule (branch carries large baseline WIP):** stage by **explicit path only**. Before every commit run `git diff --cached --name-only` and confirm it shows **only** the files for that task. Never `git add -A`/`.`/`-u`, never `git restore`/`checkout --`/`reset --hard`/`clean` on the tree. If a task appears to need a forbidden/T1 file, **stop and surface it** — do not work around the boundary.

---

## Mapping to the P7 brief

| Brief requirement | Where addressed |
|---|---|
| 1. `riskFlags` badge/filter surfaces (5 flags) | Task 1 (matcher), Task 2 (counts), Task 5 (`RiskAccessPanel` Risk section) |
| 2. `permissionTypeSummary` surfaces (fullController, mixedProfile, folderBreadth, coverage) | Task 1, Task 2, Task 5 (Permission section) |
| 3. Module focus — per-module filter, no per-module sliders, preserve single module multi-hot slider | Task 1 (`module` facet = multi-hot membership), Task 5 (Module section); slider untouched (see "Module: slider vs facet") |
| 4. UI placement | "UI placement decision" below + Task 5/Task 6 |
| 5. Interaction model — mask bus only, no physics reheat | "Interaction model" below; Tasks 1, 3 (no physics symbols), Task 7 (e2e proves no reheat) |
| 6. Color-mode relationship — no duplication | "Color-mode relationship" below |
| 7. Test strategy | Tasks 1–7 (unit + UI + e2e) |
| 8. Forbidden scope | "Forbidden scope" section (enforced per task) |
| 9. WIP safety | "Why this is safe" above + per-task staging steps |

---

## Design decisions (confirm at plan review)

### UI placement decision (brief §4) — **RECOMMENDED: a Toolbar popover**

The brief asks the plan to decide between SliderSidebar / Toolbar / FilterPopover / a new compact panel.

**Recommendation: a new compact "Risk & Access" popover in the `Toolbar`**, mirroring the existing `DimensionFilterPopover` pattern (`Toolbar.tsx:119-129`). Rationale:
- It is a **mask** control, and every other mask control (search, chips, lasso, color-by) already lives in the Toolbar. The right-side `RightPanelStack` is reserved for sliders/selection/detail (a z-stack that swaps on lasso/click) — adding facets there would fight that state machine.
- A popover keeps it **compact and information-dense** (toggle + label + live count badge per facet), and `Clear all` (`Toolbar.tsx:197-208`) already resets it for free because facets live in `FilterContext`.
- It avoids `SliderSidebar` (which is slider-only and family-grouped) so we never imply these are sliders.

**Where badges live vs. where filters live:** they are co-located in the popover — each row is `[toggle chip] [label] [count badge]`. The badge is a *passive live count* (nodes matching that facet, from `summarizeFacets`); the toggle is the *filter*. Active facets also remain visible as the popover's lit chips and contribute to the Toolbar's existing `Clear all` affordance.

**Alternative if rejected at review:** a new always-mounted compact left-rail panel `RiskAccessPanel` rendered as a sibling of the canvas. Task 5 builds the panel as a **self-contained component that consumes `useFilters()` internally**, so it can be mounted in *either* host (popover or rail) with a one-line change in Task 6 — the placement decision does not affect Tasks 1–5.

> ⚠️ **Naming:** there is already a `PermissionRiskPanel.tsx` on the branch — it is the **charts-side scorecard** (tRPC `accMembers.getPermissionRiskScorecard`), unrelated to the graph mask. P7's component is named **`RiskAccessPanel`** to avoid collision. Do not edit `PermissionRiskPanel.tsx`.

### Interaction model (brief §5) — mask bus only

- Facets write to `FilterContext.activeFilters` → consumed by `usePredicateEngine` → **one** `physics.setMask(...)` call. This is the same overwrite-semantics mask the existing chips/search/lasso use (`usePredicateEngine.ts:108-142`).
- **No physics reheat:** `setMask` does not touch `sim.alpha`/`restart` (PHYS-04 contract, enforced by `physicsLayer.purity.test.ts`). `accessFacets.ts` and the P7 edits import **no** physics/math symbols. Task 7 proves node positions/count are unchanged and only the alpha mask moves.
- **Sliders remain PHYSICS bus only:** P7 adds nothing to `SliderContext`/`updateSliders`. The single `module` multi-hot slider is untouched.
- **Composition semantics (documented + tested):** within one facet key the selected members compose by **OR** (natural for a `Set`); facet keys compose by **AND** with each other and with existing categorical chips/search/lasso (the existing loop already ANDs across keys). E.g. selecting `externalHighPerm` + `staleButActive` shows nodes with **either** risk flag; additionally selecting a module narrows (AND) to those also in that module.

### Color-mode relationship (brief §6) — no duplication

- Color modes (`nodeColors.ts`) set the RGBA **color buffer**; facets set the **alpha mask**. They are orthogonal by design (`nodeColors.ts:16-19` — "dimming/greyout is a MASK concern … kept orthogonal to color"). A facet **never** changes color; a color mode **never** changes the mask.
- P7 adds **no** color modes. `riskScore`/`permissionStrength`/`activityMix` already exist as P6 color modes for *gradient reading*; P7's facets are *boolean masks* for *isolation*. They complement: e.g. color by `riskScore` (see the gradient) **and** facet-filter `externalProjectAdmin` (mask to that subset) — the surviving nodes keep their riskScore color. Document this in the panel header copy.

### Module: slider vs facet

- The registry `module` dimension (type `multi-hot`) is a **physics slider** (`dimensionRegistry.ts:226-236`, in `SLIDER_DIMENSION_IDS`). **P7 leaves it alone.**
- `module` is also already a key in `FilterContext` (seeded via `DIMENSIONS`), but `featureValueForDim(f, "module")` returns `""` today (`usePredicateEngine.ts:43-44`), so the module *chip* is currently inert. P7 makes the **`module` facet key** do real multi-hot membership masking (node matches if its `moduleSignature` includes any selected module). No per-module slider is created.

---

## File structure

**Create:**
- `app/(dashboard)/users/access-analysis/accessFacets.ts` — pure facet catalog, per-node matchers, OR-within-family composition, and `summarizeFacets` counts. No React/DOM/physics.
- `app/(dashboard)/users/access-analysis/accessFacets.test.ts` — unit tests for matchers + summary.
- `app/(dashboard)/users/access-analysis/RiskAccessPanel.tsx` — compact badge/filter UI; consumes `useFilters()` + `summarizeFacets`.
- `app/(dashboard)/users/access-analysis/__tests__/RiskAccessPanel.test.tsx` — UI tests.

**Modify:**
- `app/(dashboard)/users/access-analysis/usePredicateEngine.ts` — delegate facet keys to `accessFacets` in the mask predicate and in `filterSelectionByPredicate`.
- `app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx` — add facet cases.
- `app/(dashboard)/users/access-analysis/FilterContext.tsx` — seed `riskFlag`/`permProfile` facet keys so they rehydrate from persistence.
- `app/(dashboard)/users/access-analysis/__tests__/FilterContext.test.tsx` — add rehydrate case.
- `app/(dashboard)/users/access-analysis/Toolbar.tsx` — mount the `RiskAccessPanel` popover.
- `app/(dashboard)/users/access-analysis/__tests__/Toolbar.test.tsx` — assert the popover button renders.
- `tests/e2e/acc-dc-graph.spec.ts` — **append** one P7 smoke test (do not edit existing tests).

---

## Task 1: Pure facet catalog + per-node matchers

**Files:**
- Create: `app/(dashboard)/users/access-analysis/accessFacets.ts`
- Test: `app/(dashboard)/users/access-analysis/accessFacets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// accessFacets.test.ts
import { describe, it, expect } from "vitest";
import {
  RISK_FLAG_IDS,
  PERM_PROFILE_IDS,
  FACET_KEY_RISK,
  FACET_KEY_PERM,
  FACET_KEY_MODULE,
  isFacetKey,
  nodeHasRiskFlag,
  nodeHasPermProfile,
  nodeInModule,
  nodeMatchesFacet,
} from "./accessFacets";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(p: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "a", emailLower: "a@x.com", project: "P", role: "R",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: "<7d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active",
    ...p,
  } as NodeFeatureSnapshot;
}

describe("accessFacets — catalog", () => {
  it("exposes the five risk flag ids and the six perm profile ids", () => {
    expect([...RISK_FLAG_IDS]).toEqual([
      "externalHighPerm", "staleButActive", "externalProjectAdmin",
      "broadFolderAccess", "highActivityHighPerm",
    ]);
    expect([...PERM_PROFILE_IDS]).toEqual([
      "fullController", "mixedProfile", "broadFolders",
      "coverageKnown", "coveragePartial", "coverageUnknown",
    ]);
  });

  it("recognizes the three facet keys and rejects categorical dims", () => {
    expect(isFacetKey(FACET_KEY_RISK)).toBe(true);
    expect(isFacetKey(FACET_KEY_PERM)).toBe(true);
    expect(isFacetKey(FACET_KEY_MODULE)).toBe(true);
    expect(isFacetKey("role")).toBe(false);
  });
});

describe("accessFacets — per-node matchers", () => {
  it("nodeHasRiskFlag reads riskFlags safely", () => {
    const f = node({ riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false } });
    expect(nodeHasRiskFlag(f, "externalHighPerm")).toBe(true);
    expect(nodeHasRiskFlag(f, "staleButActive")).toBe(false);
    expect(nodeHasRiskFlag(node(), "externalHighPerm")).toBe(false); // undefined riskFlags
  });

  it("nodeHasPermProfile covers booleans, breadth threshold, and coverage", () => {
    const f = node({ permissionTypeSummary: { folderBreadth: 30, coverage: "known", mixedProfile: true, fullController: false } });
    expect(nodeHasPermProfile(f, "mixedProfile")).toBe(true);
    expect(nodeHasPermProfile(f, "fullController")).toBe(false);
    expect(nodeHasPermProfile(f, "broadFolders")).toBe(true);   // 30 >= 25
    expect(nodeHasPermProfile(f, "coverageKnown")).toBe(true);
    expect(nodeHasPermProfile(f, "coveragePartial")).toBe(false);
    expect(nodeHasPermProfile(node(), "fullController")).toBe(false); // undefined summary
  });

  it("nodeInModule reads moduleFlags then falls back to moduleSignature", () => {
    expect(nodeInModule(node({ moduleFlags: { build: true } }), "build")).toBe(true);
    expect(nodeInModule(node({ moduleSignature: ["cost"] }), "cost")).toBe(true);
    expect(nodeInModule(node({ moduleSignature: ["cost"] }), "build")).toBe(false);
    expect(nodeInModule(node(), "build")).toBe(false);
  });
});

describe("accessFacets — nodeMatchesFacet (OR within a family)", () => {
  const risky = node({ riskFlags: { externalHighPerm: false, staleButActive: true, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false } });

  it("empty set passes (no selection = any)", () => {
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set())).toBe(true);
  });
  it("matches if ANY selected risk flag is true", () => {
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set(["staleButActive"]))).toBe(true);
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set(["externalHighPerm", "staleButActive"]))).toBe(true);
    expect(nodeMatchesFacet(risky, FACET_KEY_RISK, new Set(["externalHighPerm"]))).toBe(false);
  });
  it("module facet matches on membership (OR)", () => {
    const f = node({ moduleSignature: ["build", "cost"] });
    expect(nodeMatchesFacet(f, FACET_KEY_MODULE, new Set(["cost"]))).toBe(true);
    expect(nodeMatchesFacet(f, FACET_KEY_MODULE, new Set(["takeoff"]))).toBe(false);
  });
  it("returns true for an unknown (non-facet) key", () => {
    expect(nodeMatchesFacet(risky, "role", new Set(["x"]))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/accessFacets.test.ts`
Expected: FAIL — `Cannot find module './accessFacets'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// accessFacets.ts
/**
 * accessFacets.ts — Pure, mask-only facet catalog + matchers for P7.
 *
 * No React, no DOM, NO physics/math symbols (PHYS-04 boundary — facets are a MASK
 * concern). Consumes already-emitted snapshot fields (riskFlags, permissionTypeSummary,
 * moduleSignature/moduleFlags). Adds NO DIMENSION_REGISTRY descriptor.
 *
 * Composition: within a facet key the selected members compose by OR; facet keys
 * compose by AND with each other (the predicate engine's existing across-key loop).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { BROAD_FOLDER_THRESHOLD } from "./riskFlags";

export type RiskFlagId =
  | "externalHighPerm"
  | "staleButActive"
  | "externalProjectAdmin"
  | "broadFolderAccess"
  | "highActivityHighPerm";

export type PermProfileId =
  | "fullController"
  | "mixedProfile"
  | "broadFolders"
  | "coverageKnown"
  | "coveragePartial"
  | "coverageUnknown";

export const RISK_FLAG_IDS: readonly RiskFlagId[] = [
  "externalHighPerm",
  "staleButActive",
  "externalProjectAdmin",
  "broadFolderAccess",
  "highActivityHighPerm",
];

export const PERM_PROFILE_IDS: readonly PermProfileId[] = [
  "fullController",
  "mixedProfile",
  "broadFolders",
  "coverageKnown",
  "coveragePartial",
  "coverageUnknown",
];

/** Keys used inside FilterContext.activeFilters. `module` reuses the registry dim id. */
export const FACET_KEY_RISK = "riskFlag";
export const FACET_KEY_PERM = "permProfile";
export const FACET_KEY_MODULE = "module";
export const FACET_KEYS: readonly string[] = [FACET_KEY_RISK, FACET_KEY_PERM, FACET_KEY_MODULE];

export function isFacetKey(key: string): boolean {
  return FACET_KEYS.includes(key);
}

export function nodeHasRiskFlag(f: NodeFeatureSnapshot, id: RiskFlagId): boolean {
  return f.riskFlags?.[id] === true;
}

export function nodeHasPermProfile(f: NodeFeatureSnapshot, id: PermProfileId): boolean {
  const p = f.permissionTypeSummary;
  if (!p) return false;
  switch (id) {
    case "fullController":
      return p.fullController;
    case "mixedProfile":
      return p.mixedProfile;
    case "broadFolders":
      return p.folderBreadth >= BROAD_FOLDER_THRESHOLD;
    case "coverageKnown":
      return p.coverage === "known";
    case "coveragePartial":
      return p.coverage === "partial";
    case "coverageUnknown":
      return p.coverage === "unknown";
    default:
      return false;
  }
}

export function nodeInModule(f: NodeFeatureSnapshot, moduleKey: string): boolean {
  if (f.moduleFlags) return f.moduleFlags[moduleKey] === true;
  return (f.moduleSignature ?? []).includes(moduleKey);
}

/** OR-within-family match for one facet key. Empty set = pass. Unknown key = pass. */
export function nodeMatchesFacet(
  f: NodeFeatureSnapshot,
  key: string,
  allowed: ReadonlySet<string>,
): boolean {
  if (allowed.size === 0) return true;
  if (key === FACET_KEY_RISK) {
    for (const id of allowed) if (nodeHasRiskFlag(f, id as RiskFlagId)) return true;
    return false;
  }
  if (key === FACET_KEY_PERM) {
    for (const id of allowed) if (nodeHasPermProfile(f, id as PermProfileId)) return true;
    return false;
  }
  if (key === FACET_KEY_MODULE) {
    for (const moduleKey of allowed) if (nodeInModule(f, moduleKey)) return true;
    return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/accessFacets.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accessFacets.ts" "app/(dashboard)/users/access-analysis/accessFacets.test.ts"
git diff --cached --name-only   # MUST list only those two files
git commit -m "feat(acc-graph): P7 pure facet matchers for risk/permission/module masks"
```

---

## Task 2: Facet count summary (`summarizeFacets`)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/accessFacets.ts`
- Test: `app/(dashboard)/users/access-analysis/accessFacets.test.ts`

- [ ] **Step 1: Write the failing test (append to accessFacets.test.ts)**

```ts
import { summarizeFacets } from "./accessFacets";

describe("accessFacets — summarizeFacets", () => {
  it("counts risk flags, perm profiles, and modules in one pass", () => {
    const features = [
      node({
        riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false },
        permissionTypeSummary: { folderBreadth: 30, coverage: "known", mixedProfile: true, fullController: false },
        moduleSignature: ["build", "cost"],
      }),
      node({
        riskFlags: { externalHighPerm: true, staleButActive: true, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false },
        permissionTypeSummary: { folderBreadth: 2, coverage: "partial", mixedProfile: false, fullController: true },
        moduleSignature: ["build"],
      }),
      node(), // no enrichment → contributes nothing
    ];
    const s = summarizeFacets(features);
    expect(s.risk.externalHighPerm).toBe(2);
    expect(s.risk.staleButActive).toBe(1);
    expect(s.risk.highActivityHighPerm).toBe(0);
    expect(s.perm.mixedProfile).toBe(1);
    expect(s.perm.fullController).toBe(1);
    expect(s.perm.broadFolders).toBe(1);   // only the breadth-30 node
    expect(s.perm.coverageKnown).toBe(1);
    expect(s.modules).toEqual([
      { key: "build", count: 2 },
      { key: "cost", count: 1 },
    ]); // sorted by count desc, then key asc
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/accessFacets.test.ts -t summarizeFacets`
Expected: FAIL — `summarizeFacets is not a function`.

- [ ] **Step 3: Add implementation to accessFacets.ts**

```ts
export interface FacetSummary {
  risk: Record<RiskFlagId, number>;
  perm: Record<PermProfileId, number>;
  /** Module keys present in the data, sorted by count desc then key asc. */
  modules: { key: string; count: number }[];
}

export function summarizeFacets(
  features: ReadonlyArray<NodeFeatureSnapshot>,
): FacetSummary {
  const risk = Object.fromEntries(RISK_FLAG_IDS.map((id) => [id, 0])) as Record<RiskFlagId, number>;
  const perm = Object.fromEntries(PERM_PROFILE_IDS.map((id) => [id, 0])) as Record<PermProfileId, number>;
  const moduleCounts = new Map<string, number>();

  for (const f of features) {
    for (const id of RISK_FLAG_IDS) if (nodeHasRiskFlag(f, id)) risk[id]++;
    for (const id of PERM_PROFILE_IDS) if (nodeHasPermProfile(f, id)) perm[id]++;
    const keys = f.moduleFlags
      ? Object.keys(f.moduleFlags).filter((k) => f.moduleFlags![k])
      : (f.moduleSignature ?? []);
    for (const k of keys) moduleCounts.set(k, (moduleCounts.get(k) ?? 0) + 1);
  }

  const modules = [...moduleCounts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return { risk, perm, modules };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/accessFacets.test.ts`
Expected: PASS (all cases including summarizeFacets).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/accessFacets.ts" "app/(dashboard)/users/access-analysis/accessFacets.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-graph): P7 summarizeFacets for live badge counts"
```

---

## Task 3: Wire facets into the predicate (mask bus)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/usePredicateEngine.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx`

**Context:** the predicate loop iterates `activeFilters` and currently always calls `featureValueForDim` (`usePredicateEngine.ts:118-122`). Facet keys must be intercepted *before* the categorical path (else `featureValueForDim` returns `""` and dims everything). The same interception is needed in `filterSelectionByPredicate` (`:72-79`) so lasso visibility stays consistent.

- [ ] **Step 1: Write the failing test (append cases to usePredicateEngine.test.tsx)**

```ts
// Reuse the file's existing harness pattern. These assert the mask predicate the
// engine pushes to a fake physics.setMask. If the existing test captures the mask fn
// via a mock, mirror that; otherwise import the pure helper as shown.
import { filterSelectionByPredicate } from "../usePredicateEngine";
import { FACET_KEY_RISK, FACET_KEY_MODULE } from "../accessFacets";

it("filterSelectionByPredicate honors a risk facet (OR within family)", () => {
  const features = [
    mkNode(0, { riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false } }),
    mkNode(1, { riskFlags: { externalHighPerm: false, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false } }),
  ];
  const sel = new Set([0, 1]);
  const out = filterSelectionByPredicate(
    sel, features,
    { [FACET_KEY_RISK]: new Set(["externalHighPerm"]) },
    "",
  );
  expect([...(out ?? [])]).toEqual([0]);
});

it("filterSelectionByPredicate honors a module facet (multi-hot membership)", () => {
  const features = [
    mkNode(0, { moduleSignature: ["build"] }),
    mkNode(1, { moduleSignature: ["cost"] }),
  ];
  const out = filterSelectionByPredicate(
    new Set([0, 1]), features,
    { [FACET_KEY_MODULE]: new Set(["build"]) },
    "",
  );
  expect([...(out ?? [])]).toEqual([0]);
});
```

> If the existing test file already defines a node factory, reuse it and delete `mkNode`. `mkNode(i, partial)` must return a `NodeFeatureSnapshot` with `nameLower`/`emailLower` set and the partial merged — match the file's existing factory signature.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/usePredicateEngine.test.tsx`
Expected: FAIL — facet nodes are not filtered (both indices returned), because facet keys fall through to `featureValueForDim` returning `""`.

- [ ] **Step 3: Implement — intercept facet keys in both predicate sites**

In `usePredicateEngine.ts`, add the import:

```ts
import { isFacetKey, nodeMatchesFacet } from "./accessFacets";
```

In `filterSelectionByPredicate`, replace the categorical loop body (`:72-79`) with:

```ts
    for (const [dim, allowed] of Object.entries(activeFilters)) {
      if (allowed.size === 0) continue;
      if (isFacetKey(dim)) {
        if (!nodeMatchesFacet(f, dim, allowed)) { ok = false; break; }
        continue;
      }
      const v = featureValueForDim(f, dim);
      if (!allowed.has(v)) { ok = false; break; }
    }
```

In `usePredicateEngine`'s mask predicate, replace the global-filter loop (`:118-122`) with:

```ts
      // 2) Global filter chips + P7 facets — AND across all keys with non-empty sets.
      for (const [dim, allowed] of Object.entries(activeFilters)) {
        if (allowed.size === 0) continue;
        if (isFacetKey(dim)) {
          if (!nodeMatchesFacet(f, dim, allowed)) return 0.15;
          continue;
        }
        const v = featureValueForDim(f, dim);
        if (!allowed.has(v)) return 0.15;
      }
```

> No physics symbol is added — this stays within the PHYS-04 wall (the file's header invariant at `:7-9`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/usePredicateEngine.test.tsx`
Expected: PASS (new facet cases + all pre-existing cases unchanged).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/usePredicateEngine.ts" "app/(dashboard)/users/access-analysis/__tests__/usePredicateEngine.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-graph): P7 route facet keys through the single mask predicate"
```

---

## Task 4: Persist/rehydrate facet keys in FilterContext

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/FilterContext.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/FilterContext.test.tsx`

**Context:** `makeEmptyFilters()` (`FilterContext.tsx:45-49`) seeds only `DIMENSIONS` ids. `module` is already seeded (it's in `DIMENSIONS`), but `riskFlag`/`permProfile` are not — so rehydrate (`:99-105`, gated by `if (next[dim] && ...)`) silently drops them. Seed them so a persisted facet selection survives reload. `toggleChip`/`clearAll`/`isDefault` are already generic over keys.

- [ ] **Step 1: Write the failing test (append to FilterContext.test.tsx)**

```ts
import { FACET_KEY_RISK, FACET_KEY_PERM } from "../accessFacets";

it("rehydrates persisted risk/permission facet selections", async () => {
  window.localStorage.setItem(
    "lecg.access-analysis.controls.v1",
    JSON.stringify({ filters: { [FACET_KEY_RISK]: ["externalHighPerm"], [FACET_KEY_PERM]: ["fullController"] } }),
  );
  // Mount a probe that reads useFilters() — mirror the existing test's render helper.
  const { result } = renderFilters();
  await waitFor(() => {
    expect([...result.current.activeFilters[FACET_KEY_RISK]]).toEqual(["externalHighPerm"]);
    expect([...result.current.activeFilters[FACET_KEY_PERM]]).toEqual(["fullController"]);
  });
});
```

> Use the file's existing mount/probe helper (e.g. `renderFilters`/`renderHook` wrapper). If none exists, wrap `<FilterProvider>` around a probe that captures `useFilters()` into a ref, as the other tests in this file do.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/FilterContext.test.tsx -t "rehydrates persisted risk"`
Expected: FAIL — facet keys are `undefined` (not seeded → not rehydrated).

- [ ] **Step 3: Implement — seed facet keys**

In `FilterContext.tsx`, add the import:

```ts
import { FACET_KEY_RISK, FACET_KEY_PERM } from "./accessFacets";
```

Update `makeEmptyFilters` (`:45-49`):

```ts
function makeEmptyFilters(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {};
  for (const d of DIMENSIONS) out[d.id] = new Set(); // includes the multi-hot "module" key
  // P7 facet families (no registry descriptor): seed so they rehydrate from persistence.
  out[FACET_KEY_RISK] = new Set();
  out[FACET_KEY_PERM] = new Set();
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/FilterContext.test.tsx`
Expected: PASS (new case + all existing FilterContext cases).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/FilterContext.tsx" "app/(dashboard)/users/access-analysis/__tests__/FilterContext.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-graph): P7 seed+rehydrate risk/permission facet selections"
```

---

## Task 5: `RiskAccessPanel` — compact badge/filter UI

**Files:**
- Create: `app/(dashboard)/users/access-analysis/RiskAccessPanel.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/RiskAccessPanel.test.tsx`

**Context:** self-contained — consumes `useFilters()` internally and `summarizeFacets(features)`. Mountable in either the Toolbar popover (Task 6) or a left rail (alternative) with no API change. Toggling calls `toggleChip(FACET_KEY_*, id)`.

- [ ] **Step 1: Write the failing test**

```tsx
// __tests__/RiskAccessPanel.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterProvider } from "../FilterContext";
import { RiskAccessPanel } from "../RiskAccessPanel";
import type { NodeFeatureSnapshot } from "../interactionTypes";

function node(p: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "a", emailLower: "a@x.com", project: "P", role: "R",
    permTier: null, isExternal: false, activityBucket: "None", signinBucket: "<7d",
    activityCountRaw: 0, lastSignInRel: "", permissionCoverage: "unknown",
    firmName: "", accountStatus: "active", ...p,
  } as NodeFeatureSnapshot;
}

const features = [
  node({ riskFlags: { externalHighPerm: true, staleButActive: false, externalProjectAdmin: false, broadFolderAccess: false, highActivityHighPerm: false }, moduleSignature: ["build"] }),
];

function mount() {
  return render(<FilterProvider><RiskAccessPanel features={features} /></FilterProvider>);
}

describe("RiskAccessPanel", () => {
  it("renders a row + live count badge per risk flag", () => {
    mount();
    expect(screen.getByTestId("risk-facet-externalHighPerm")).toBeInTheDocument();
    expect(screen.getByTestId("risk-count-externalHighPerm")).toHaveTextContent("1");
    expect(screen.getByTestId("risk-count-staleButActive")).toHaveTextContent("0");
  });

  it("toggles a risk facet on click (aria-pressed flips)", () => {
    mount();
    const btn = screen.getByTestId("risk-facet-externalHighPerm");
    expect(btn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("lists modules present in the data", () => {
    mount();
    expect(screen.getByTestId("module-facet-build")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/RiskAccessPanel.test.tsx`
Expected: FAIL — `Cannot find module '../RiskAccessPanel'`.

- [ ] **Step 3: Implement the component**

```tsx
// RiskAccessPanel.tsx
"use client";

/**
 * RiskAccessPanel.tsx — P7 compact badge/filter surface (MASK bus only).
 *
 * Surfaces the P5/P6 enriched fields (riskFlags, permissionTypeSummary, modules) as
 * toggle chips with live count badges. Writes ONLY to FilterContext facet keys; the
 * predicate engine turns those into a single physics.setMask. No sliders, no physics,
 * no color. Distinct from the charts-side PermissionRiskPanel.tsx.
 */
import { useMemo } from "react";
import { useFilters } from "./FilterContext";
import {
  RISK_FLAG_IDS,
  PERM_PROFILE_IDS,
  FACET_KEY_RISK,
  FACET_KEY_PERM,
  FACET_KEY_MODULE,
  summarizeFacets,
  type RiskFlagId,
  type PermProfileId,
} from "./accessFacets";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const RISK_LABELS: Record<RiskFlagId, string> = {
  externalHighPerm: "External · high permission",
  staleButActive: "Stale but active",
  externalProjectAdmin: "External project admin",
  broadFolderAccess: "Broad folder access",
  highActivityHighPerm: "High activity · high permission",
};

const PERM_LABELS: Record<PermProfileId, string> = {
  fullController: "Full controller",
  mixedProfile: "Mixed profile",
  broadFolders: "Broad folder breadth",
  coverageKnown: "Coverage: known",
  coveragePartial: "Coverage: partial",
  coverageUnknown: "Coverage: unknown",
};

function FacetRow(props: {
  testid: string;
  countTestid?: string;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid={props.testid}
      aria-pressed={props.active}
      onClick={props.onToggle}
      className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm ${
        props.active ? "border-blue-500 bg-blue-500/10 text-foreground" : "hover:bg-accent"
      }`}
    >
      <span className="truncate">{props.label}</span>
      <span
        data-testid={props.countTestid}
        className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
      >
        {props.count}
      </span>
    </button>
  );
}

export interface RiskAccessPanelProps {
  features: ReadonlyArray<NodeFeatureSnapshot>;
}

export function RiskAccessPanel({ features }: RiskAccessPanelProps): React.JSX.Element {
  const { activeFilters, toggleChip } = useFilters();
  const summary = useMemo(() => summarizeFacets(features), [features]);

  const riskSet = activeFilters[FACET_KEY_RISK] ?? new Set<string>();
  const permSet = activeFilters[FACET_KEY_PERM] ?? new Set<string>();
  const moduleSet = activeFilters[FACET_KEY_MODULE] ?? new Set<string>();

  return (
    <div data-testid="risk-access-panel" className="w-72 space-y-4 p-3 text-sm">
      <p className="text-[11px] text-muted-foreground">
        Masks the graph by risk, permission profile, and module. Color mode is independent —
        surviving nodes keep their color.
      </p>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Risk</h3>
        {RISK_FLAG_IDS.map((id) => (
          <FacetRow
            key={id}
            testid={`risk-facet-${id}`}
            countTestid={`risk-count-${id}`}
            label={RISK_LABELS[id]}
            count={summary.risk[id]}
            active={riskSet.has(id)}
            onToggle={() => toggleChip(FACET_KEY_RISK, id)}
          />
        ))}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permission profile</h3>
        {PERM_PROFILE_IDS.map((id) => (
          <FacetRow
            key={id}
            testid={`perm-facet-${id}`}
            countTestid={`perm-count-${id}`}
            label={PERM_LABELS[id]}
            count={summary.perm[id]}
            active={permSet.has(id)}
            onToggle={() => toggleChip(FACET_KEY_PERM, id)}
          />
        ))}
      </section>

      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module focus</h3>
        {summary.modules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No module data.</p>
        ) : (
          summary.modules.map(({ key, count }) => (
            <FacetRow
              key={key}
              testid={`module-facet-${key}`}
              countTestid={`module-count-${key}`}
              label={key}
              count={count}
              active={moduleSet.has(key)}
              onToggle={() => toggleChip(FACET_KEY_MODULE, key)}
            />
          ))
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/RiskAccessPanel.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/RiskAccessPanel.tsx" "app/(dashboard)/users/access-analysis/__tests__/RiskAccessPanel.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-graph): P7 RiskAccessPanel compact badge/filter surface"
```

---

## Task 6: Mount the panel in the Toolbar (placement)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/Toolbar.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/Toolbar.test.tsx`

**Context:** `Toolbar` already receives `features` (`Toolbar.tsx:33`) and renders popover-style controls. Add a `<details>`-based "Risk & Access" disclosure containing `RiskAccessPanel` (a `<details>` keeps it dependency-free and testable without a portal). If the codebase has a shared `Popover` primitive already used by `DimensionFilterPopover`, prefer that for visual consistency — otherwise `<details>` is acceptable.

- [ ] **Step 1: Write the failing test (append to Toolbar.test.tsx)**

```tsx
it("renders the Risk & Access disclosure", () => {
  // Reuse the file's existing Toolbar render helper + FilterProvider wrapper.
  renderToolbar({ features: [/* one node with a riskFlag, per the file's factory */] });
  expect(screen.getByTestId("toolbar-risk-access")).toBeInTheDocument();
});
```

> Use the existing `renderToolbar` helper if present (the file already tests the toolbar); otherwise wrap `<FilterProvider><Toolbar .../></FilterProvider>` with the minimal required props (`mode`, `onModeChange`, `lassoActive`, `onLassoToggle`, `features`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/Toolbar.test.tsx -t "Risk & Access"`
Expected: FAIL — testid not found.

- [ ] **Step 3: Implement — add the disclosure**

In `Toolbar.tsx` add the import:

```ts
import { RiskAccessPanel } from "./RiskAccessPanel";
```

Insert, immediately after the dimension-chip `</div>` block (`Toolbar.tsx:129`), before the Lasso button:

```tsx
      <details className="relative" data-testid="toolbar-risk-access">
        <summary className="cursor-pointer list-none rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
          Risk &amp; Access
        </summary>
        <div className="absolute left-0 z-20 mt-1 rounded-md border bg-card shadow-lg">
          <RiskAccessPanel features={features} />
        </div>
      </details>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/\(dashboard\)/users/access-analysis/__tests__/Toolbar.test.tsx`
Expected: PASS (new case + all existing Toolbar cases, including the color-mode + chip tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/Toolbar.tsx" "app/(dashboard)/users/access-analysis/__tests__/Toolbar.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-graph): P7 mount Risk & Access facet popover in the toolbar"
```

---

## Task 7: e2e smoke — node count unchanged, mask dims correctly

**Files:**
- Modify (append only): `tests/e2e/acc-dc-graph.spec.ts`

**Context:** the bridge already exposes `getRenderedNodeCount()`, `getDimmedNodeCount()`, `getHighlightedNodeCount()`, `getMaskVersion()` (`graphTestBridge.ts:244,298,299,300,496-509`). The smoke proves: (a) total node count is unchanged by a facet (mask, not data), (b) some nodes get dimmed and the mask version increments, (c) clearing restores zero dimmed. This is a **smoke** test — match the existing P4/P6 smoke style (no exhaustive assertions).

- [ ] **Step 1: Write the failing test (append a new `test(...)` inside the existing `describe`)**

```ts
test("P7: a risk facet masks nodes without changing the node count (smoke)", async ({ page }) => {
  // beforeEach already ran gotoGraph(page) → bridge isReady.
  const api = () => page.evaluate(() => {
    const b = window.__ACC_GRAPH_TEST__!;
    return {
      total: b.getRenderedNodeCount(),
      dimmed: b.getDimmedNodeCount(),
      version: b.getMaskVersion(),
    };
  });

  const before = await api();
  expect(before.total).toBeGreaterThan(0);
  expect(before.dimmed).toBe(0);

  // Open the popover and toggle the first risk facet.
  await page.getByTestId("toolbar-risk-access").click();
  await page.getByTestId("risk-facet-externalHighPerm").click();

  await expect.poll(async () => (await api()).version).toBeGreaterThan(before.version);
  const after = await api();
  expect(after.total).toBe(before.total);        // node COUNT unchanged (mask, not filter-out)
  expect(after.dimmed).toBeGreaterThan(0);        // some nodes dimmed
  expect(after.dimmed).toBeLessThan(after.total); // not everything dimmed

  // Clear restores.
  await page.getByTestId("toolbar-clear-all").click();
  await expect.poll(async () => (await api()).dimmed).toBe(0);
});
```

> If `externalHighPerm` happens to match zero nodes in the live dataset (making `dimmed` equal `total`), switch the toggled facet to the highest-count risk flag — determine it once via `summarizeFacets` semantics, or pick `staleButActive`/`broadFolderAccess` which are broader. The assertion `dimmed < total` guards against an all-or-nothing match; choose a facet that yields a proper subset.

- [ ] **Step 2: Run test to verify it fails (then passes against the built UI)**

Run: `npx playwright test tests/e2e/acc-dc-graph.spec.ts -g "P7: a risk facet masks"`
Expected: FAIL before Tasks 5–6 are wired (no `toolbar-risk-access`); PASS after. Because this plan is executed in order, run it last — expect PASS.

- [ ] **Step 3: (no separate impl — UI built in Tasks 5–6)**

- [ ] **Step 4: Confirm PASS**

Run: `npx playwright test tests/e2e/acc-dc-graph.spec.ts -g "P7: a risk facet masks"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/acc-dc-graph.spec.ts
git diff --cached --name-only
git commit -m "test(acc-graph): P7 e2e smoke — facet masks without changing node count"
```

---

## Task 8: Full gates + self-review

- [ ] **Step 1: Unit suite**

Run: `npm test`
Expected: PASS, 0 failed (count = current 1060 + the new P7 cases).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0, no errors.

- [ ] **Step 3: Full e2e**

Run: `npm run test:e2e`
Expected: all tests pass (the prior 21 + the new P7 smoke = 22). If the previously-observed `beforeEach` readiness timeout recurs on a single test under load, re-run that one test in isolation to distinguish flake from regression — do **not** remediate product code for a load flake without confirming reproduction.

- [ ] **Step 4: Verify branch scope is clean**

Run: `git status --short` and confirm only P7 files were added/modified; `git diff --cached --name-only` is empty (everything committed). No baseline-WIP file was touched.

- [ ] **Step 5: Self-review checklist** (run before declaring done)
  - Spec coverage: every brief item (1–9) maps to a task (see mapping table).
  - No `DIMENSION_REGISTRY` descriptor added; no slider added; no edge/lasso/camera/renderer/route/physics file touched; `UserDetailPanel.tsx` untouched.
  - No T1-owned file edited (`featureSnapshot.ts`, `interactionTypes.ts`, `graphTables.ts`, `acc-*` server, `activityAggregate.ts`, `AccessAnalysisShell.tsx` includeActivityMix).
  - Type consistency: facet key constants (`FACET_KEY_RISK`/`_PERM`/`_MODULE`), `RiskFlagId`, `PermProfileId`, `summarizeFacets` shape are used identically across `accessFacets.ts`, `usePredicateEngine.ts`, `FilterContext.tsx`, `RiskAccessPanel.tsx`.

---

## Forbidden scope (enforced — restated from the brief)

P7 must NOT: add edge layers; change lasso, camera, or any renderer; change routes/nav; change `UserDetailPanel.tsx` (no task here needs it — if one seems to, stop and surface it); change graph physics or any `SliderContext`/`updateSliders` path; add a `DIMENSION_REGISTRY` slider descriptor; add per-module sliders (the single multi-hot `module` slider is preserved untouched); spike UMAP / ForceAtlas / React Force Graph. Facets are **mask bus only**; sliders remain **physics bus only**.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-p7-badge-filter-surfaces.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?** (Per your instruction, I have stopped after writing the plan and will not implement until you say so.)
