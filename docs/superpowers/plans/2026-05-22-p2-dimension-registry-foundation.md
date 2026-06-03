# P2 — Dimension Registry Foundation + Snapshot Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One task = one subagent. Only touch the files listed for that task. Run the task's tests before committing. Stop if any test fails.**

**Goal:** Stand up a pure, data-backed dimension registry plus the minimal snapshot fields (`moduleSignature`, `isAdmin`) the first batch of dimensions needs — without adding any slider UI, layout wiring, renderer/edge changes, or data-feed (`graphTables.ts`) changes.

**Architecture:** A new pure module `dimensionRegistry.ts` describes each dimension (id, family, type, source, availability, default weight, confidence) and exposes pure `extract(snapshot)` / `isAvailable(snapshot)` readers. It registers ONLY dimensions whose source field is present in the client snapshot/feed today. `featureSnapshot.ts` is enriched with `moduleSignature` (parsed from the existing `module_ids` column) and `isAdmin` (from the existing `is_project_admin` column). Nothing in the layout/physics/renderer/edge/UI path changes; `featureTargets.ts` is read-only-imported by a drift-guard test only.

**Tech Stack:** TypeScript, Vitest. Pure modules (no React/DOM/I/O), mirroring `featureTargets.ts` / `mathLayer.ts` discipline.

**Backed by:**
- `docs/superpowers/specs/2026-05-21-access-analysis-dimension-taxonomy.md` (design intent: ids, families, weights, confidence, availability)
- `docs/superpowers/research/2026-05-21-access-analysis-data-discovery.md` (data reality + source fields)

---

## Scope guardrails (from the P2 brief, as adjusted)

**In scope:** pure dimension registry; register only data-backed dimensions; minimal `NodeFeatureSnapshot` fields (`moduleSignature`, `isAdmin`); unit tests for registry validity + snapshot enrichment.

**Preserve:** node = UserProjectInstance (`userId::projectId`); WS2 2D/3D edges; current renderer stack; current UI (no slider UI).

**Do NOT touch:** lasso, camera, nav/routes, `UserDetailPanel`, renderers, WS2 edges, slider UI expansion, new edge layers, UMAP/ForceAtlas/RFG spikes, `membershipAge`/`addedOn` feed changes, `graphTables.ts`, `featureTargets.ts` runtime (import in tests only), `physicsLayer`/`mathLayer` targets.

---

## First-batch dimensions (data-backed only)

| dimensionId | source field (verified present in client data) | enrichment needed? | task |
|---|---|---|---|
| `project` | `NodeFeatureSnapshot.project` (A1) | none | T1 |
| `role` | `NodeFeatureSnapshot.role` (A1) | none | T1 |
| `tier` | `NodeFeatureSnapshot.permTier` + `permissionCoverage` (A1) | none | T1 |
| `internalExternal` | `NodeFeatureSnapshot.affiliation` (A1 — P1-fixed) | none | T1 |
| `company` | `NodeFeatureSnapshot.firmName` (A1) | none | T1 |
| `activity` | `NodeFeatureSnapshot.activityBucket` (A1) | none | T1 |
| `signin` | `NodeFeatureSnapshot.signinBucket` (A1) | none | T1 |
| `isAdmin` | `graph_user_projects.is_project_admin` → new `isAdmin` field (A1) | yes — populate in T2 | T1 (descriptor) + T2 (populate) |
| `module` | `graph_user_projects.module_ids` → new `moduleSignature` (A2) | yes — T2 | T3 (descriptor) + T2 (populate) |

> `isAdmin`'s descriptor + optional type field land in **Task 1** (per the adjusted brief); its *population* from `is_project_admin` lands in **Task 2** alongside `moduleSignature`. Until T2 runs, `isAdmin` reads `undefined → "member"` on real snapshots; T1 tests use synthetic snapshots, so they pass independently.

### Explicitly deferred (NOT in P2 — documented, not faked)

- **`membershipAge`** — needs per-instance `AccDcProjectUser.addedOn`, which is **not** in the client feed (`graph_user_projects` carries `module_ids`/`is_project_admin` but not `added_on`; only a user-level `added_on` exists in `graph_users`). Backing it requires a `graphTables.ts` data-feed change — **out of P2 scope by the brief.** Follow-up: add `added_on` to `projectRows` in `graphTables.ts`, then a `membershipAgeDays` field + `membershipAge` descriptor.
- `activityMix`, `permStrength`, `riskScore` — need DuckDB rollups / composite logic; later phase.
- Wiring the registry into `featureTargets`/physics + the slider UI — later phase.

---

## File Structure

- **Create** `app/(dashboard)/users/access-analysis/dimensionRegistry.ts` — pure registry: types, `DIMENSION_REGISTRY`, `getDimension`, `DIMENSION_IDS`, `CONFIDENCE_FACTOR`, `BASELINE_MODULES`.
- **Create** `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts` — validity, `extract`/`isAvailable`, drift-guard vs `featureTargets.categoryValue`.
- **Modify** `app/(dashboard)/users/access-analysis/interactionTypes.ts` — add `isAdmin?: boolean` (T1) and `moduleSignature?: string[]` (T2) to `NodeFeatureSnapshot`.
- **Modify** `app/(dashboard)/users/access-analysis/featureSnapshot.ts` — select + populate `is_project_admin → isAdmin` and `module_ids → moduleSignature`; export pure `parseModuleSignature`.
- **Modify** `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts` — `parseModuleSignature` + `buildFeatureSnapshot` enrichment cases.

Both new snapshot fields are **optional** (`?:`) to match the existing optional `affiliation?` and avoid breaking any other `NodeFeatureSnapshot` construction site. `extract`/`isAvailable` default them.

---

## Task 1: Pure dimension registry (A1 dimensions + isAdmin)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (add `isAdmin?: boolean`)
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts`

- [ ] **Step 1: Add the `isAdmin` field to the snapshot type**

In `interactionTypes.ts`, add to `NodeFeatureSnapshot` (after `accountStatus`):

```ts
  /**
   * Project-admin flag for this instance (graph_user_projects.is_project_admin).
   * Optional for backward compatibility; populated by buildFeatureSnapshot (P2 T2).
   * Drives the `isAdmin` governance/risk dimension.
   */
  isAdmin?: boolean;
```

- [ ] **Step 2: Write the failing test**

Create `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DIMENSION_REGISTRY,
  DIMENSION_IDS,
  CONFIDENCE_FACTOR,
  getDimension,
  type DimensionId,
} from "../dimensionRegistry";
import { categoryValue, type TargetDimensionId } from "../featureTargets";
import type { NodeFeatureSnapshot } from "../interactionTypes";

/** A fully-populated snapshot; override per assertion. */
function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p",
    nameLower: "ada lovelace",
    emailLower: "ada@hermosillo.com",
    project: "Tower A",
    role: "Architect",
    permTier: "View Only",
    isExternal: false,
    affiliation: "internal",
    activityBucket: "Med",
    signinBucket: "<30d",
    activityCountRaw: 42,
    lastSignInRel: "12d ago",
    permissionCoverage: "known",
    firmName: "Hermosillo",
    accountStatus: "active",
    isAdmin: false,
    ...over,
  };
}

describe("dimension registry — validity", () => {
  it("has unique ids and DIMENSION_IDS mirrors the registry", () => {
    const ids = DIMENSION_REGISTRY.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(DIMENSION_IDS).toEqual(ids);
  });

  it("every descriptor has a non-empty label, source, default weight in [0,1], valid confidence", () => {
    for (const d of DIMENSION_REGISTRY) {
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.source.length).toBeGreaterThan(0);
      expect(d.defaultWeight).toBeGreaterThanOrEqual(0);
      expect(d.defaultWeight).toBeLessThanOrEqual(1);
      expect(["high", "medium", "low"]).toContain(d.confidence);
    }
  });

  it("CONFIDENCE_FACTOR maps each level to its taxonomy weight", () => {
    expect(CONFIDENCE_FACTOR).toEqual({ high: 1.0, medium: 0.7, low: 0.4 });
  });

  it("getDimension finds by id and returns undefined for unknown", () => {
    expect(getDimension("project")?.id).toBe("project");
    expect(getDimension("nope" as DimensionId)).toBeUndefined();
  });

  it("registers the first-batch dimensions incl. isAdmin (module added in Task 3)", () => {
    expect(DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "company", "activity", "signin", "isAdmin",
    ]);
  });
});

describe("dimension registry — extract", () => {
  it("categorical dims read the expected snapshot field", () => {
    const f = snap();
    expect(getDimension("project")!.extract(f)).toBe("Tower A");
    expect(getDimension("role")!.extract(f)).toBe("Architect");
    expect(getDimension("tier")!.extract(f)).toBe("View Only");
    expect(getDimension("internalExternal")!.extract(f)).toBe("internal");
    expect(getDimension("company")!.extract(f)).toBe("Hermosillo");
    expect(getDimension("activity")!.extract(f)).toBe("Med");
    expect(getDimension("signin")!.extract(f)).toBe("<30d");
  });

  it("tier falls back to '(none)' when permTier is null", () => {
    expect(getDimension("tier")!.extract(snap({ permTier: null }))).toBe("(none)");
  });

  it("internalExternal returns the 3-way affiliation incl. unknown", () => {
    expect(getDimension("internalExternal")!.extract(snap({ affiliation: "unknown" }))).toBe("unknown");
    expect(getDimension("internalExternal")!.extract(snap({ affiliation: "external" }))).toBe("external");
  });

  it("company returns null when there is no firm", () => {
    expect(getDimension("company")!.extract(snap({ firmName: "" }))).toBeNull();
  });

  it("isAdmin extracts 'admin' / 'member' (undefined → 'member')", () => {
    expect(getDimension("isAdmin")!.extract(snap({ isAdmin: true }))).toBe("admin");
    expect(getDimension("isAdmin")!.extract(snap({ isAdmin: false }))).toBe("member");
    expect(getDimension("isAdmin")!.extract(snap({ isAdmin: undefined }))).toBe("member");
  });
});

describe("dimension registry — isAvailable (weighting availability gate)", () => {
  it("gates unknown/absent values to false", () => {
    expect(getDimension("company")!.isAvailable(snap({ firmName: "" }))).toBe(false);
    expect(getDimension("company")!.isAvailable(snap({ firmName: "ACME" }))).toBe(true);
    expect(getDimension("internalExternal")!.isAvailable(snap({ affiliation: "unknown" }))).toBe(false);
    expect(getDimension("internalExternal")!.isAvailable(snap({ affiliation: "internal" }))).toBe(true);
    expect(getDimension("tier")!.isAvailable(snap({ permissionCoverage: "unknown", permTier: null }))).toBe(false);
    expect(getDimension("tier")!.isAvailable(snap({ permissionCoverage: "known", permTier: "View Only" }))).toBe(true);
    expect(getDimension("activity")!.isAvailable(snap({ activityBucket: "None" }))).toBe(false);
    expect(getDimension("activity")!.isAvailable(snap({ activityBucket: "Med" }))).toBe(true);
  });

  it("isAdmin is always available (binary: both poles are real)", () => {
    expect(getDimension("isAdmin")!.isAvailable(snap({ isAdmin: true }))).toBe(true);
    expect(getDimension("isAdmin")!.isAvailable(snap({ isAdmin: false }))).toBe(true);
  });
});

describe("dimension registry — drift guard vs featureTargets.categoryValue", () => {
  // The 5 ids shared with the legacy featureTargets dimension set MUST extract the
  // same categorical string, so the two registries cannot silently diverge.
  const shared: Array<DimensionId & TargetDimensionId> = [
    "project", "role", "tier", "activity", "signin",
  ];
  const samples: NodeFeatureSnapshot[] = [
    snap(),
    snap({ permTier: null, activityBucket: "None", signinBucket: ">90d" }),
    snap({ role: "(no role)", project: "(unknown)" }),
  ];
  it("matches categoryValue for every shared id across sample snapshots", () => {
    for (const id of shared) {
      for (const f of samples) {
        expect(getDimension(id)!.extract(f)).toBe(categoryValue(f, id));
      }
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run dimensionRegistry`
Expected: FAIL — `Cannot find module '../dimensionRegistry'`.

- [ ] **Step 4: Write minimal implementation**

Create `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`:

```ts
/**
 * dimensionRegistry.ts — Pure, data-backed registry of analysis/layout dimensions.
 *
 * No React, no DOM, no I/O (mirrors featureTargets.ts / mathLayer.ts purity).
 *
 * FOUNDATION ONLY (P2). It registers ONLY dimensions whose source field is present
 * in the client snapshot/feed today, and describes each one + how to read a node's
 * value. The 50+ slider UI and the layout-weighting wiring are later phases — this
 * module does NOT touch physics, edges, the renderer, or any UI.
 *
 * Design intent + source-field citations:
 *   docs/superpowers/specs/2026-05-21-access-analysis-dimension-taxonomy.md
 */

import type { NodeFeatureSnapshot } from "./interactionTypes";

export type DimensionId =
  | "project"
  | "role"
  | "tier"
  | "internalExternal"
  | "company"
  | "activity"
  | "signin"
  | "isAdmin";

export type DimensionFamily =
  | "structure"
  | "access"
  | "affiliation"
  | "behavior"
  | "tenure"
  | "risk";

export type DimensionType =
  | "categorical"
  | "binary"
  | "scalar"
  | "temporal"
  | "multi-hot"
  | "derived";

/** Availability codes from the taxonomy: A1 in-snapshot … A5 unavailable. */
export type Availability = "A1" | "A2" | "A3" | "A4" | "A5";

export type Confidence = "high" | "medium" | "low";

/** Confidence → weighting factor (taxonomy §14 universal weighting model). */
export const CONFIDENCE_FACTOR: Readonly<Record<Confidence, number>> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
};

/** Near-universal products excluded from the module signature (discovery §3). */
export const BASELINE_MODULES: readonly string[] = ["insight", "docs"];

/** A node's value for a dimension. `null`/`[]` mean "no value" (availability 0). */
export type DimensionValue = string | string[] | number | null;

export interface DimensionDescriptor {
  id: DimensionId;
  label: string;
  family: DimensionFamily;
  type: DimensionType;
  /** Human-readable source field, traceable to the discovery package. */
  source: string;
  availability: Availability;
  /** Base layout weight from the taxonomy, in [0,1]. */
  defaultWeight: number;
  confidence: Confidence;
  /** Pure read of the node's categorical/scalar/multi-hot value (or null). */
  extract(f: NodeFeatureSnapshot): DimensionValue;
  /**
   * True when the node has a usable value — the per-node availability gate from
   * the weighting model (§14): sparse/unknown values return false so they never
   * drag a node into a pole. NOTE: this is a weighting concern, not a filter —
   * "unknown"/"(none)" are still valid categories returned by `extract`.
   */
  isAvailable(f: NodeFeatureSnapshot): boolean;
}

export const DIMENSION_REGISTRY: readonly DimensionDescriptor[] = [
  {
    id: "project",
    label: "Project",
    family: "structure",
    type: "categorical",
    source: "AccDcProjectUser.projectId (graph_user_projects.project_name)",
    availability: "A1",
    defaultWeight: 0.35,
    confidence: "high",
    extract: (f) => f.project,
    isAvailable: (f) => f.project !== "" && f.project !== "(unknown)",
  },
  {
    id: "role",
    label: "Role",
    family: "structure",
    type: "categorical",
    source: "AccDcProjectUserRole.roleId ⋈ AccRole.name (graph_user_projects.role_id)",
    availability: "A1",
    defaultWeight: 0.25,
    confidence: "high",
    extract: (f) => f.role,
    isAvailable: (f) => f.role !== "" && f.role !== "(no role)",
  },
  {
    id: "tier",
    label: "Permission tier",
    family: "access",
    type: "categorical",
    source: "AccFolderPermission.permType via role (NodeFeatureSnapshot.permTier)",
    availability: "A1",
    defaultWeight: 0.15,
    confidence: "medium",
    // Matches featureTargets.categoryValue('tier') for the drift guard.
    extract: (f) => f.permTier ?? "(none)",
    isAvailable: (f) => f.permissionCoverage !== "unknown" && f.permTier != null,
  },
  {
    id: "internalExternal",
    label: "Internal / external",
    family: "affiliation",
    type: "categorical",
    source: "AccDcUser.email vs internalDomains (NodeFeatureSnapshot.affiliation)",
    availability: "A1",
    defaultWeight: 0.1,
    confidence: "high",
    // 3-way affiliation; fall back to the 2-way isExternal if affiliation absent.
    extract: (f) => f.affiliation ?? (f.isExternal ? "external" : "internal"),
    isAvailable: (f) => (f.affiliation ?? "unknown") !== "unknown",
  },
  {
    id: "company",
    label: "Company / firm",
    family: "affiliation",
    type: "categorical",
    source: "AccDcProjectUserCompany ⋈ AccDcCompany.name (NodeFeatureSnapshot.firmName)",
    availability: "A1",
    defaultWeight: 0.1,
    confidence: "high",
    extract: (f) => (f.firmName !== "" ? f.firmName : null),
    isAvailable: (f) => f.firmName !== "",
  },
  {
    id: "activity",
    label: "Activity volume",
    family: "behavior",
    type: "categorical",
    source: "AccActivity rollup, bucketed (NodeFeatureSnapshot.activityBucket)",
    availability: "A1",
    defaultWeight: 0.05,
    confidence: "medium",
    extract: (f) => f.activityBucket,
    isAvailable: (f) => f.activityBucket !== "None",
  },
  {
    id: "signin",
    label: "Sign-in recency",
    family: "behavior",
    type: "temporal",
    source: "AccDcUser.lastSignIn bucketed (NodeFeatureSnapshot.signinBucket)",
    availability: "A1",
    defaultWeight: 0.05,
    confidence: "low",
    extract: (f) => f.signinBucket,
    // Every node has a bucket, so the value is always present. Distinguishing
    // genuine ">90d" from never/unknown needs a bucket refinement (future); until
    // then signin is always "available" and confidence:low down-weights it.
    isAvailable: () => true,
  },
  {
    id: "isAdmin",
    label: "Admin / member",
    family: "access",
    type: "binary",
    source: "graph_user_projects.is_project_admin (AccDcProjectUser project_admin)",
    availability: "A1",
    defaultWeight: 0.1,
    confidence: "high",
    extract: (f) => (f.isAdmin ? "admin" : "member"),
    // Binary axis: admin ↔ member are both real poles, so always available.
    isAvailable: () => true,
  },
];

export function getDimension(id: DimensionId): DimensionDescriptor | undefined {
  return DIMENSION_REGISTRY.find((d) => d.id === id);
}

export const DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.map((d) => d.id);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run dimensionRegistry`
Expected: PASS (all blocks green).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `dimensionRegistry.ts` / `interactionTypes.ts` / the test.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionRegistry.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts" "app/(dashboard)/users/access-analysis/interactionTypes.ts"
git commit -m "feat(acc-graph): add pure dimension registry foundation (A1 dims + isAdmin)"
```

---

## Task 2: Snapshot enrichment — `moduleSignature` + `isAdmin` population

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (add `moduleSignature?: string[]`)
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts` (select/populate `module_ids → moduleSignature`, `is_project_admin → isAdmin`; export `parseModuleSignature`)
- Test: `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`

- [ ] **Step 1: Add the `moduleSignature` field to the snapshot type**

In `interactionTypes.ts`, add to `NodeFeatureSnapshot` (after the `isAdmin?: boolean` field added in Task 1):

```ts
  /**
   * Non-baseline product/module keys for this instance (e.g. ["build","cost"]),
   * sorted + deduped, baselines (insight/docs) excluded. Optional for backward
   * compatibility; set by buildFeatureSnapshot. Drives the `module` dimension.
   */
  moduleSignature?: string[];
```

- [ ] **Step 2: Write the failing test**

In `__tests__/featureSnapshot.test.ts`:

Add to the `FakeRow` interface (after `permission_coverage`):

```ts
  is_project_admin: boolean | number | null;
  module_ids: string | null;
```

Add to `makeRow`'s returned object (after `permission_coverage`):

```ts
    is_project_admin: over.is_project_admin ?? false,
    module_ids: over.module_ids ?? null,
```

Update the import line:

```ts
import { buildFeatureSnapshot, bucketActivity, bucketSignin, parseModuleSignature } from "../featureSnapshot";
```

Append these describe blocks at the end of the file:

```ts
describe("parseModuleSignature", () => {
  it("splits the pipe-delimited list and excludes baseline products", () => {
    expect(parseModuleSignature("build|cost|docs|insight")).toEqual(["build", "cost"]);
  });
  it("returns [] for null / empty / baseline-only input", () => {
    expect(parseModuleSignature(null)).toEqual([]);
    expect(parseModuleSignature("")).toEqual([]);
    expect(parseModuleSignature("docs|insight")).toEqual([]);
  });
  it("dedupes, trims, and sorts deterministically", () => {
    expect(parseModuleSignature(" build | build |cost")).toEqual(["build", "cost"]);
  });
});

describe("buildFeatureSnapshot — moduleSignature + isAdmin enrichment", () => {
  it("derives moduleSignature from module_ids (baselines excluded)", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", module_ids: "build|insight|cost" })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.moduleSignature).toEqual(["build", "cost"]);
  });
  it("populates isAdmin from is_project_admin", async () => {
    mockRows = [
      makeRow({ user_id: "a", project_id: "p", is_project_admin: true }),
      makeRow({ user_id: "b", project_id: "p", is_project_admin: false }),
    ];
    const result = await buildFeatureSnapshot({ nodeIds: ["a::p", "b::p"] });
    expect(result[0]!.isAdmin).toBe(true);
    expect(result[1]!.isAdmin).toBe(false);
  });
  it("unknown nodeId fallback → moduleSignature [], isAdmin false", async () => {
    const result = await buildFeatureSnapshot({ nodeIds: ["ghost::missing"] });
    expect(result[0]!.moduleSignature).toEqual([]);
    expect(result[0]!.isAdmin).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run featureSnapshot`
Expected: FAIL — `parseModuleSignature is not a function` (and enrichment assertions fail).

- [ ] **Step 4: Write minimal implementation**

In `featureSnapshot.ts`:

Add the import (after the `internalDomains` import):

```ts
import { BASELINE_MODULES } from "./dimensionRegistry";
```

Add `is_project_admin` and `module_ids` to the `RawFeatureRow` interface (after `permission_coverage`):

```ts
  is_project_admin: boolean | number | null;
  module_ids: string | null;
```

Add the pure parser (after the `formatRel` helper, before `RawFeatureRow`):

```ts
/**
 * Parse the pipe-delimited `module_ids` column into a node's module SIGNATURE:
 * non-baseline product keys only (baselines are near-universal → no signal),
 * trimmed, deduped, sorted for deterministic output. See discovery §3.
 */
export function parseModuleSignature(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const baseline = new Set(BASELINE_MODULES);
  const out = new Set<string>();
  for (const part of raw.split("|")) {
    const key = part.trim();
    if (key !== "" && !baseline.has(key)) out.add(key);
  }
  return Array.from(out).sort();
}
```

In the SQL string, add two selected columns. Change the `permission_coverage` line to keep a trailing comma and append the new columns as the LAST selected columns:

```sql
      COALESCE(ANY_VALUE(u.permission_coverage), 'unknown')              AS permission_coverage,
      COALESCE(ANY_VALUE(up.is_project_admin), FALSE)                    AS is_project_admin,
      COALESCE(ANY_VALUE(up.module_ids), '')                            AS module_ids
```

In the `map.set(...)` object literal, add (after `accountStatus`):

```ts
      isAdmin: Boolean(r.is_project_admin),
      moduleSignature: parseModuleSignature(r.module_ids),
```

In the `fallback` object literal, add (after `accountStatus`):

```ts
      isAdmin: false,
      moduleSignature: [],
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run featureSnapshot`
Expected: PASS (existing cases + new `parseModuleSignature` and enrichment cases).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors in `featureSnapshot.ts` / `interactionTypes.ts` / the test.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"
git commit -m "feat(acc-graph): enrich snapshot with moduleSignature + isAdmin"
```

---

## Task 3: Register the `module` dimension

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts`

- [ ] **Step 1: Write the failing test**

In `dimensionRegistry.test.ts`:

Add `moduleSignature` to the `snap()` helper return object (after `isAdmin: false`):

```ts
    moduleSignature: ["build"],
```

Update the first-batch assertion to append `module`:

```ts
  it("registers the first-batch dimensions incl. isAdmin + module (A2)", () => {
    expect(DIMENSION_IDS).toEqual([
      "project", "role", "tier", "internalExternal", "company", "activity", "signin", "isAdmin", "module",
    ]);
  });
```

Append a `module`-specific block:

```ts
describe("dimension registry — module (multi-hot)", () => {
  it("extract returns the moduleSignature array; [] when absent", () => {
    expect(getDimension("module")!.extract(snap({ moduleSignature: ["build", "cost"] }))).toEqual(["build", "cost"]);
    expect(getDimension("module")!.extract(snap({ moduleSignature: undefined }))).toEqual([]);
  });
  it("isAvailable is true only for a non-empty signature", () => {
    expect(getDimension("module")!.isAvailable(snap({ moduleSignature: ["build"] }))).toBe(true);
    expect(getDimension("module")!.isAvailable(snap({ moduleSignature: [] }))).toBe(false);
    expect(getDimension("module")!.isAvailable(snap({ moduleSignature: undefined }))).toBe(false);
  });
  it("module is typed multi-hot with availability A2", () => {
    const d = getDimension("module")!;
    expect(d.type).toBe("multi-hot");
    expect(d.availability).toBe("A2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionRegistry`
Expected: FAIL — `DIMENSION_IDS` lacks `module`; `getDimension("module")` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `dimensionRegistry.ts`, add `"module"` to the `DimensionId` union (after `"isAdmin"`):

```ts
  | "isAdmin"
  | "module";
```

Append the descriptor as the last entry of `DIMENSION_REGISTRY` (after `isAdmin`):

```ts
  {
    id: "module",
    label: "Module signature",
    family: "access",
    type: "multi-hot",
    source: "AccDcProjectUserProduct.productKey (graph_user_projects.module_ids; baselines excluded)",
    availability: "A2",
    defaultWeight: 0.15,
    confidence: "high",
    extract: (f) => f.moduleSignature ?? [],
    isAvailable: (f) => (f.moduleSignature ?? []).length > 0,
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dimensionRegistry`
Expected: PASS (validity, extract, isAvailable, drift guard, module block).

- [ ] **Step 5: Full regression + typecheck**

Run: `npm test`
Expected: all unit suites pass (currently 841 tests; new tests add to that).
Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionRegistry.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts"
git commit -m "feat(acc-graph): register module dimension (multi-hot, A2)"
```

---

## Self-Review

**1. Spec coverage** (adjusted P2 brief → task):
- Pure dimension registry → Task 1 (`dimensionRegistry.ts`, no React/DOM/I/O). ✓
- Register A1 dims `project/role/tier/internalExternal/company/activity/signin` → Task 1. ✓
- Register `isAdmin`, backed by existing `is_project_admin`, no feed plumbing → descriptor in Task 1, population in Task 2 (reads `graph_user_projects.is_project_admin`; `graphTables.ts` untouched). ✓
- `moduleSignature` from existing `module_ids` only; no `membershipAge`; no `graphTables.ts` change → Task 2. ✓
- Register `module` as A2 multi-hot, data-backed + tested → Task 3. ✓
- Drift guard kept → Task 1. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases" — every step has concrete code/commands. ✓

**3. Type consistency:** `DimensionId` union grows `…|"isAdmin"` (T1) then `…|"module"` (T3); `DIMENSION_IDS` expectation updated in lockstep (T1 = 8 ids incl isAdmin; T3 = 9 incl module). `snap()` sets `isAdmin` from T1 and gains `moduleSignature` in T3 (after the T2 type field exists). `parseModuleSignature`, `BASELINE_MODULES`, `moduleSignature`, `isAdmin` spelled identically across tasks. ✓

**4. Ordering safety:** T1 adds the `isAdmin?` type field (so the T1 descriptor + test compile) but does NOT reference `moduleSignature` (added in T2). T3's `snap()` gains `moduleSignature` only after T2 adds the field. featureSnapshot remains compilable after T1 (both new fields optional, unset until T2). ✓

**5. Risk notes:**
- `featureTargets.ts` imported by the T1 drift-guard test only — not modified. The 5 shared ids are pinned to `categoryValue`.
- Both new snapshot fields optional → no other construction site breaks; `featureSnapshot.ts` sets them at populated + fallback sites.
- `BASELINE_MODULES` defined once in the registry, imported by the snapshot (DRY).
- `is_project_admin` confirmed present in `graph_user_projects` (graphTables.ts:137) — no feed change.

---

## Out of scope / follow-ups (NOT in P2)

1. `membershipAge` — add `added_on` to `projectRows` in `graphTables.ts` (data feed), then a `membershipAgeDays` field + descriptor.
2. Wire `dimensionRegistry` into `featureTargets`/physics (replace the legacy `TargetDimensionId` set) and build the slider UI.
3. `activityMix`, `permStrength`, `riskScore` (taxonomy §9/§12/§13) — DuckDB rollups / composite logic.
