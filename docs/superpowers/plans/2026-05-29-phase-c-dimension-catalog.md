# Phase C — New Dimension Catalog (complete rewrite) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a brand-new, from-scratch `dimensionCatalog.ts` that generates **every** dimension the redesigned sidebar will expose — structural/access/affiliation/tenure (9), module-access, the access ladder, all ~176 taxonomy actions, and the greyed folder attributes — each with a fresh `extract`, `kind`, `available` flag, confidence, and grouping. This is the new single source of truth that replaces the legacy `dimensionRegistry.ts`.

**Architecture:** Pure module (no React/DOM/IO). Reads `accTaxonomy` (Phase A) for modules/groups/actions/access-ladder and `NodeFeatureSnapshot` (Phase B, incl. `actionCounts`) for per-node values. Produces a flat `CatalogDimension[]` plus a grouped section tree for the UI. **Nothing is wired into the runtime yet** — the legacy registry still drives the live graph until Phases D/E migrate consumers and delete it.

**Tech Stack:** TypeScript (pure), Vitest 4. Depends on Phase A (`accTaxonomy`) + Phase B (`NodeFeatureSnapshot.actionCounts`).

**Scope notes:**
- **Complete rewrite:** all extracts are written fresh here; the new catalog does NOT import or wrap the legacy `dimensionRegistry`/`dimensionGroups`/`sliderPresets`. Those legacy files are **deleted in Phases D–F** once nothing imports them (deleting now would break the build).
- **Bucketing deferred to Phase D:** ordinal `extract` returns a raw number (count / strength / age); turning it into none/low/med/high via per-action quantiles + the ordinal ramp is Phase D.
- **Layout weights deferred to Phase D:** `confidence` is declared here; the per-node weight = `confidence × availability` is assembled in Phase D (mirrors the old `dimensionWeights`).

---

## File Structure

| File | Responsibility |
|---|---|
| `app/(dashboard)/users/access-analysis/dimensionCatalog.types.ts` | `CatalogDimension`, `DimKind`, `DimFamily`, section-tree types |
| `app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts` | the 9 structural/access/affiliation/tenure dims (fresh extracts) |
| `app/(dashboard)/users/access-analysis/dimensionCatalog.actions.ts` | generated action dims + `buildActionAvailability` |
| `app/(dashboard)/users/access-analysis/dimensionCatalog.folder.ts` | greyed folder-attribute dims (static, `available:false`) |
| `app/(dashboard)/users/access-analysis/dimensionCatalog.ts` | unified `buildDimensionCatalog(features)` + `getCatalogSections()` |
| `*.test.ts` (4) | one per module above (except types) |

---

## Task 1: catalog types + structural dimensions

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionCatalog.types.ts`
- Create: `app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts`
- Test: `app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts`

- [ ] **Step 1: Create the types** — `dimensionCatalog.types.ts`:

```ts
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { GroupId } from "./accTaxonomy.types";

export type DimKind = "categorical" | "ordinal" | "binary" | "multiHot";
export type DimFamily = "structure" | "access" | "affiliation" | "tenure" | "activity" | "folder";
export type DimConfidence = "high" | "medium" | "low";
export type DimSurface = "slider" | "color";

/** A node's value: number (ordinal), string (categorical/binary), string[] (multiHot), or null (absent). */
export type DimValue = string | number | string[] | null;

export interface CatalogDimension {
  id: string;
  label: string;
  family: DimFamily;
  /** Action dims only: excel module + group placement. */
  moduleId?: string;
  groupId?: GroupId;
  kind: DimKind;
  /** Human-readable provenance. */
  source: string;
  confidence: DimConfidence;
  /** false => greyed/disabled in the UI (no data for this dimension). */
  available: boolean;
  surfaces: DimSurface[];
  /** Color ramp style when surfaced as color. */
  colorScale?: "categorical" | "ordered";
  /** Pure per-node read. */
  extract(f: NodeFeatureSnapshot): DimValue;
}
```

- [ ] **Step 2: Write the failing test** — `dimensionCatalog.structural.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "n", emailLower: "e", project: "Proj A", role: "Architect",
    permTier: "edit", isExternal: false, affiliation: "internal",
    activityBucket: "Low", signinBucket: "<30d", activityCountRaw: 1, lastSignInRel: "1d ago",
    permissionCoverage: "known", firmName: "Acme", accountStatus: "active", isAdmin: true,
    moduleSignature: ["build", "cost"], permissionStrength: 4, membershipAgeDays: 100,
    membershipBucket: "<1y", ...over,
  } as NodeFeatureSnapshot;
}

describe("buildStructuralDimensions", () => {
  const byId = Object.fromEntries(buildStructuralDimensions().map((d) => [d.id, d]));

  it("declares the 9 excel structural/access dims", () => {
    expect(Object.keys(byId).sort()).toEqual(
      ["admin", "company", "internalExternal", "moduleAccess", "permission", "project", "role", "status", "tenure"],
    );
  });
  it("extracts categorical structure values", () => {
    const f = node();
    expect(byId.project.extract(f)).toBe("Proj A");
    expect(byId.role.extract(f)).toBe("Architect");
    expect(byId.company.extract(f)).toBe("Acme");
    expect(byId.status.extract(f)).toBe("active");
    expect(byId.internalExternal.extract(f)).toBe("internal");
  });
  it("admin is binary admin/member", () => {
    expect(byId.admin.extract(node({ isAdmin: true }))).toBe("admin");
    expect(byId.admin.extract(node({ isAdmin: false }))).toBe("member");
  });
  it("permission is an ordinal 0..5 strength", () => {
    expect(byId.permission.kind).toBe("ordinal");
    expect(byId.permission.extract(node({ permissionStrength: 4 }))).toBe(4);
    expect(byId.permission.extract(node({ permissionStrength: undefined }))).toBe(0);
  });
  it("moduleAccess maps productKeys to excel module ids (cost folds into build), multiHot", () => {
    expect(byId.moduleAccess.kind).toBe("multiHot");
    expect(byId.moduleAccess.extract(node({ moduleSignature: ["build", "cost", "modelCoordination"] }))).toEqual(
      ["build", "modelCoordination"], // cost -> build (deduped), sorted
    );
    expect(byId.moduleAccess.extract(node({ moduleSignature: [] }))).toEqual([]);
  });
  it("tenure is ordinal membership age in days (null when unknown)", () => {
    expect(byId.tenure.kind).toBe("ordinal");
    expect(byId.tenure.extract(node({ membershipAgeDays: 100 }))).toBe(100);
    expect(byId.tenure.extract(node({ membershipAgeDays: null }))).toBeNull();
  });
  it("all structural dims are available and slider+color surfaced", () => {
    for (const d of buildStructuralDimensions()) {
      expect(d.available).toBe(true);
      expect(d.surfaces).toContain("slider");
    }
  });
});
```

- [ ] **Step 3: Run, verify FAIL** — `npx vitest run "app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts"` → FAIL (module missing).

- [ ] **Step 4: Create `dimensionCatalog.structural.ts`:**

```ts
/**
 * Structural / access / affiliation / tenure dimensions — the 9 non-activity sliders,
 * written fresh from the excel taxonomy (complete rewrite; does NOT reuse the legacy
 * dimensionRegistry). Pure: reads only a NodeFeatureSnapshot.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import { getModuleForEntitlement } from "./accTaxonomy";

/** Map a node's productKey signature to the set of excel module ids it has access to. */
function moduleAccessOf(moduleSignature: string[] | undefined): string[] {
  const ids = new Set<string>();
  for (const key of moduleSignature ?? []) {
    const m = getModuleForEntitlement(key);
    if (m) ids.add(m.id);
  }
  return [...ids].sort();
}

export function buildStructuralDimensions(): CatalogDimension[] {
  return [
    {
      id: "project", label: "Project", family: "structure", kind: "categorical",
      source: "AccDcProjectUser.projectId", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.project && f.project !== "(unknown)" ? f.project : null),
    },
    {
      id: "role", label: "Role", family: "structure", kind: "categorical",
      source: "AccDcProjectUserRole ⋈ AccRole.name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.role && f.role !== "(no role)" ? f.role : null),
    },
    {
      id: "company", label: "Company", family: "affiliation", kind: "categorical",
      source: "AccDcProjectUserCompany ⋈ AccDcCompany.name", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.firmName ? f.firmName : null),
    },
    {
      id: "status", label: "Status", family: "structure", kind: "categorical",
      source: "AccDcUser.accountStatus", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.accountStatus ? f.accountStatus : null),
    },
    {
      id: "permission", label: "Permission level", family: "access", kind: "ordinal",
      source: "MAX folder-grant strength 0..5 (access ladder)", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.permissionStrength ?? 0,
    },
    {
      id: "tenure", label: "Membership tenure", family: "tenure", kind: "ordinal",
      source: "AccDcProjectUser.addedOn (days since)", confidence: "medium", available: true,
      surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.membershipAgeDays ?? null,
    },
    {
      id: "moduleAccess", label: "Module access", family: "access", kind: "multiHot",
      source: "AccDcProjectUserProduct.productKey → excel module", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => moduleAccessOf(f.moduleSignature),
    },
    {
      id: "admin", label: "Admin / member", family: "access", kind: "binary",
      source: "AccDcProjectUser.is_project_admin", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.isAdmin ? "admin" : "member"),
    },
    {
      id: "internalExternal", label: "Internal / external", family: "affiliation", kind: "categorical",
      source: "AccDcUser.email vs internalDomains", confidence: "high", available: true,
      surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => f.affiliation ?? (f.isExternal ? "external" : "internal"),
    },
  ];
}
```

- [ ] **Step 5: Run, verify PASS** — `npx vitest run "app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts"` → PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionCatalog.types.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts"
git commit -m "feat(acc-catalog): catalog types + 9 structural/access dims (fresh extracts)"
```

---

## Task 2: generated action dimensions + availability

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionCatalog.actions.ts`
- Test: `app/(dashboard)/users/access-analysis/dimensionCatalog.actions.test.ts`

- [ ] **Step 1: Write the failing test** — `dimensionCatalog.actions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildActionDimensions, buildActionAvailability } from "./dimensionCatalog.actions";
import { getActions } from "./accTaxonomy";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(actionCounts: Record<string, number>): NodeFeatureSnapshot {
  return { nodeId: "u::p", actionCounts } as NodeFeatureSnapshot;
}

describe("buildActionDimensions", () => {
  it("generates one ordinal dim per taxonomy action", () => {
    const dims = buildActionDimensions();
    expect(dims.length).toBe(getActions().length);
    for (const d of dims) {
      expect(d.kind).toBe("ordinal");
      expect(d.family).toBe("activity");
      expect(d.moduleId).toBeTruthy();
      expect(d.groupId).toBeTruthy();
    }
  });
  it("extract returns the node's raw count for that action (0 when absent)", () => {
    const byId = Object.fromEntries(buildActionDimensions().map((d) => [d.id, d]));
    const f = node({ "issue-create": 7 });
    expect(byId["issue-create"].extract(f)).toBe(7);
    expect(byId["view-entity"].extract(f)).toBe(0);
  });
  it("marks availability from the supplied set (greyed when absent)", () => {
    const dims = buildActionDimensions(new Set(["issue-create"]));
    const byId = Object.fromEntries(dims.map((d) => [d.id, d]));
    expect(byId["issue-create"].available).toBe(true);
    expect(byId["view-entity"].available).toBe(false);
  });
  it("defaults available=true when no set is supplied", () => {
    expect(buildActionDimensions().every((d) => d.available)).toBe(true);
  });
});

describe("buildActionAvailability", () => {
  it("collects action ids with a positive count across all nodes", () => {
    const live = buildActionAvailability([
      node({ "issue-create": 2, "view-entity": 0 }),
      node({ "rfi-view": 5 }),
    ]);
    expect(live.has("issue-create")).toBe(true);
    expect(live.has("rfi-view")).toBe(true);
    expect(live.has("view-entity")).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run "app/(dashboard)/users/access-analysis/dimensionCatalog.actions.test.ts"` → FAIL (module missing).

- [ ] **Step 3: Create `dimensionCatalog.actions.ts`:**

```ts
/**
 * Action dimensions — one ordinal slider per taxonomy action (~176), generated from
 * accTaxonomy. Pure. `extract` returns the raw per-instance count; Phase D buckets it
 * (none/low/med/high) via per-action quantiles + the ordinal ramp. `available` is false
 * for actions with no data (greyed).
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { getActions } from "./accTaxonomy";

/** Action ids that have ≥1 event across the node set (drives the greyed/disabled flag). */
export function buildActionAvailability(features: readonly NodeFeatureSnapshot[]): Set<string> {
  const live = new Set<string>();
  for (const f of features) {
    const counts = f.actionCounts;
    if (!counts) continue;
    for (const id in counts) if ((counts[id] ?? 0) > 0) live.add(id);
  }
  return live;
}

export function buildActionDimensions(availableActionIds?: ReadonlySet<string>): CatalogDimension[] {
  return getActions().map((a) => ({
    id: a.id,
    label: a.label,
    family: "activity" as const,
    moduleId: a.moduleId,
    groupId: a.groupId,
    kind: "ordinal" as const,
    source: a.source === "admin"
      ? "AccActivity rawAction (admin, actor-attributed)"
      : "AccActivity rawAction count",
    confidence: a.source === "admin" ? ("low" as const) : ("medium" as const),
    available: availableActionIds ? availableActionIds.has(a.id) : true,
    surfaces: ["slider", "color"] as ("slider" | "color")[],
    colorScale: "ordered" as const,
    extract: (f: NodeFeatureSnapshot): number => f.actionCounts?.[a.id] ?? 0,
  }));
}
```

- [ ] **Step 4: Run, verify PASS** — `npx vitest run "app/(dashboard)/users/access-analysis/dimensionCatalog.actions.test.ts"` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionCatalog.actions.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.actions.test.ts"
git commit -m "feat(acc-catalog): generated action dimensions + availability"
```

---

## Task 3: folder-attribute greyed dims + unified builder + section tree

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionCatalog.folder.ts`
- Create: `app/(dashboard)/users/access-analysis/dimensionCatalog.ts`
- Test: `app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts`

- [ ] **Step 1: Create `dimensionCatalog.folder.ts`** (greyed, per "show disabled" decision):

```ts
/**
 * Folder-attribute dimensions from acc.xlsx — carried as ALWAYS-DISABLED entries so the
 * full excel structure is visible, greyed. These live per-folder, not per-(user,project),
 * so there is no node value (extract → null). Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

const FOLDER_ATTRIBUTE_LABELS: readonly string[] = [
  "Folder ID", "Folder Description", "Folder Indicators", "Folder Issues", "Folder Markups",
  "Folder Name", "Folder Path", "Folder Size", "Folder Version", "Last Updated", "Review Status",
  "Revision", "Updated By", "Version Added By", "Folder Roles", "Inherit Permissions?",
  "Folder Roles Users by Name", "Folder Roles Name", "Folder Role Permissions",
];

const slug = (s: string): string =>
  "folder:" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function buildFolderAttributeDimensions(): CatalogDimension[] {
  return FOLDER_ATTRIBUTE_LABELS.map((label) => ({
    id: slug(label),
    label,
    family: "folder" as const,
    kind: "categorical" as const,
    source: "AccFolder / AccFolderPermission (per-folder; no per-node value)",
    confidence: "low" as const,
    available: false, // greyed: no per-(user,project) value
    surfaces: [] as ("slider" | "color")[],
    extract: () => null,
  }));
}
```

- [ ] **Step 2: Write the failing test** — `dimensionCatalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildDimensionCatalog, getCatalogSections } from "./dimensionCatalog";
import { getActions } from "./accTaxonomy";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const features: NodeFeatureSnapshot[] = [
  { nodeId: "u::p", actionCounts: { "issue-create": 3 } } as NodeFeatureSnapshot,
];

describe("buildDimensionCatalog", () => {
  const dims = buildDimensionCatalog(features);
  const byId = Object.fromEntries(dims.map((d) => [d.id, d]));

  it("includes structural + every action + folder attrs", () => {
    expect(byId.project).toBeTruthy();
    expect(byId.moduleAccess).toBeTruthy();
    expect(byId["issue-create"]).toBeTruthy();
    expect(byId["folder:folder-size"]).toBeTruthy();
    // 9 structural + N actions + 19 folder
    expect(dims.length).toBe(9 + getActions().length + 19);
  });
  it("ids are unique", () => {
    expect(new Set(dims.map((d) => d.id)).size).toBe(dims.length);
  });
  it("derives action availability from the features (issue-create live, view-entity greyed)", () => {
    expect(byId["issue-create"].available).toBe(true);
    expect(byId["view-entity"].available).toBe(false);
  });
  it("folder attrs are greyed (available:false, no surfaces)", () => {
    expect(byId["folder:folder-size"].available).toBe(false);
    expect(byId["folder:folder-size"].surfaces).toEqual([]);
  });
});

describe("getCatalogSections", () => {
  const sections = getCatalogSections(buildDimensionCatalog(features));

  it("emits a pinned structural section, an activity tree, and a folder section", () => {
    expect(sections.map((s) => s.kind)).toEqual(["structural", "activity", "folder"]);
  });
  it("the activity tree is module -> group -> action, only for modules with actions", () => {
    const activity = sections.find((s) => s.kind === "activity")!;
    expect(activity.modules!.length).toBeGreaterThan(0);
    const build = activity.modules!.find((m) => m.moduleId === "build");
    expect(build).toBeTruthy();
    const wf = build!.groups.find((g) => g.groupId === "workflowChange");
    expect(wf!.actions.some((a) => a.id === "issue-create")).toBe(true);
  });
});
```

- [ ] **Step 3: Run, verify FAIL** — `npx vitest run "app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts"` → FAIL (module missing).

- [ ] **Step 4: Create `dimensionCatalog.ts`:**

```ts
/**
 * dimensionCatalog.ts — THE dimension source of truth for the redesigned access-analysis
 * sidebar. Generates every dimension (structural/access + all taxonomy actions + greyed
 * folder attributes) and the grouped section tree the sidebar renders. Pure; replaces the
 * legacy dimensionRegistry/dimensionGroups (deleted in Phases D–E once unwired).
 */
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { GroupId } from "./accTaxonomy.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import { getModules, getGroups } from "./accTaxonomy";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";
import { buildActionDimensions, buildActionAvailability } from "./dimensionCatalog.actions";
import { buildFolderAttributeDimensions } from "./dimensionCatalog.folder";

export * from "./dimensionCatalog.types";

/** The full flat catalog. `features` (when given) drives per-action availability (greyed = no data). */
export function buildDimensionCatalog(features: readonly NodeFeatureSnapshot[] = []): CatalogDimension[] {
  const availability = features.length ? buildActionAvailability(features) : undefined;
  return [
    ...buildStructuralDimensions(),
    ...buildActionDimensions(availability),
    ...buildFolderAttributeDimensions(),
  ];
}

// ---- Section tree for the sidebar ----------------------------------------

export interface CatalogActivityGroup { groupId: GroupId; groupLabel: string; actions: CatalogDimension[] }
export interface CatalogActivityModule { moduleId: string; moduleLabel: string; groups: CatalogActivityGroup[] }
export interface CatalogSection {
  kind: "structural" | "activity" | "folder";
  label: string;
  /** structural / folder: flat list. */
  dims?: CatalogDimension[];
  /** activity: module -> group -> action tree. */
  modules?: CatalogActivityModule[];
}

/** Group a flat catalog into the sidebar's three sections (structural pinned, activity tree, folder). */
export function getCatalogSections(dims: readonly CatalogDimension[]): CatalogSection[] {
  const structural = dims.filter((d) => d.family !== "activity" && d.family !== "folder");
  const folder = dims.filter((d) => d.family === "folder");
  const actions = dims.filter((d) => d.family === "activity");

  const moduleOrder = getModules();
  const groupOrder = getGroups();
  const modules: CatalogActivityModule[] = [];
  for (const m of moduleOrder) {
    const inModule = actions.filter((a) => a.moduleId === m.id);
    if (inModule.length === 0) continue;
    const groups: CatalogActivityGroup[] = [];
    for (const g of groupOrder) {
      const inGroup = inModule.filter((a) => a.groupId === g.id);
      if (inGroup.length === 0) continue;
      groups.push({ groupId: g.id, groupLabel: g.label, actions: inGroup });
    }
    modules.push({ moduleId: m.id, moduleLabel: m.label, groups });
  }

  return [
    { kind: "structural", label: "Structure & Access", dims: structural },
    { kind: "activity", label: "Activity", modules },
    { kind: "folder", label: "Folder attributes", dims: folder },
  ];
}
```

- [ ] **Step 5: Run, verify PASS** — `npx vitest run "app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts"` → PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionCatalog.folder.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.test.ts"
git commit -m "feat(acc-catalog): folder greyed dims + unified catalog + section tree"
```

---

## Task 4: full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Typecheck** — `npx tsc --noEmit` → exit 0 (no new errors).
- [ ] **Step 2: Access-analysis suite** — `npx vitest run "app/(dashboard)/users/access-analysis"` → all PASS (legacy registry tests still green; new catalog tests pass).
- [ ] **Step 3: Whole unit suite** — `npm test` → all PASS.
- [ ] **Step 4:** Report results; no commit.

---

## Self-Review

**Spec coverage (Phase C, spec §9, complete-rewrite reading):**
- One descriptor per structural/access/module/affiliation/tenure dim → Task 1 (9 dims). ✅
- Access ladder → the `permission` ordinal dim (0..5) → Task 1. ✅
- One descriptor per action (~176, live + greyed) → Task 2 + availability. ✅
- Greyed folder attributes (show-disabled decision) → Task 3. ✅
- `kind`, `available`, `confidence`, `surfaces`, `extract` per dim → all tasks. ✅
- Smart-mix bucketing / ordinal ramp / layout weight → **Phase D** (extract returns raw number here). ✅ (intentional)
- Generated, not hand-listed; legacy registry not reused → fresh extracts; legacy deleted in D–E. ✅

**Placeholder scan:** none — complete code in every step.

**Type consistency:** `CatalogDimension` (Task 1 types) is the single shape returned by `buildStructuralDimensions`, `buildActionDimensions`, `buildFolderAttributeDimensions`, and `buildDimensionCatalog`. `DimValue` covers number|string|string[]|null across categorical/ordinal/binary/multiHot. `getCatalogSections` consumes `CatalogDimension[]` and uses `accTaxonomy` `getModules()/getGroups()` for order/labels (Phase A exports). Action `moduleId`/`groupId` come straight from `getActions()`.

**Risk note:** `buildDimensionCatalog` is pure and unwired — the live graph still uses the legacy registry, so this phase cannot regress the running UI. Phase D rewires physics/targets/weights to the catalog; Phase E rewires the sidebar; the legacy `dimensionRegistry.ts`/`dimensionGroups.ts`/`sliderPresets.ts` are deleted then.
