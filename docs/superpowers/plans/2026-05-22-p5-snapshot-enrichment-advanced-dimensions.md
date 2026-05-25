# P5 — Snapshot Enrichment for Advanced Dimensions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `NodeFeatureSnapshot` (and the upstream graph data feed) with the real, discovered fields that advanced dimensions, edges, and risk scoring will later consume — without adding any UI, registry descriptors, edges, or layout weighting.

**Architecture:** The graph reads from three DuckDB-WASM tables (`graph_users`, `graph_user_projects`, `graph_folder_permissions`) built in `graphTables.ts` from the `accDcGraph.bulkUsers` tRPC feed; `featureSnapshot.ts` joins them into one `NodeFeatureSnapshot` per `userId::projectId` instance. P5 widens that pipe field-by-field, sourcing each new field from a named Postgres column. Work is sequenced in four phases by **blast radius**: Phase A is pure client-side derivation (zero feed risk), Phase B plumbs columns that already exist in the DB, Phase C adds heavy `AccActivity` aggregation, Phase D composes the risk primitives once their inputs exist.

**Tech Stack:** TypeScript, Next.js App Router, tRPC, Prisma/Postgres (source of truth), apache-arrow + DuckDB-WASM (client analytics), Vitest (unit), Playwright (e2e).

---

## Scope & Sequencing

This plan spans three subsystems — pure client derivation, feed plumbing, and large-table server aggregation. They are sequenced so each phase ends in a green, shippable tree:

| Phase | Delivers | Blast radius | Recommended execution |
|-------|----------|--------------|------------------------|
| **A** | `moduleFlags`, partial `riskFlags` | Client-only (`featureSnapshot.ts` + 2 new pure modules) | First slice — no router/feed risk |
| **B** | `membershipAge`, per-instance `activityRecencyBucket`, `permissionStrength`, `permissionTypeSummary` | Router select + `assembleDcUsers` + `acc-types` + `graphTables` + `featureSnapshot` | Second slice — DB data already exists |
| **C** | `activityMix`, true last-activity recency | New `AccActivity` aggregation in `acc-hot-cache` + feed columns | **Recommended as its own follow-up slice** — large table, perf-sensitive |
| **D** | Final `riskFlags` + `riskScore` (uses B/C inputs) | Client-only | Last — depends on B (and C if `highActivityHighPerm` uses mix) |

**Recommendation:** Execute A → B → D as the first P5 deliverable, then C separately. C is the only phase that queries `AccActivity` (millions of rows) and needs a dedicated performance review; folding it in here keeps the field analysis complete, but it is safe to defer.

---

## Hard Constraints (do not violate)

**Do NOT touch:** lasso, camera, nav/routes, `UserDetailPanel`, new edge layers, renderer replacement, UMAP / ForceAtlas / React Force Graph spikes, full advanced slider UI.

**Do NOT register new `DIMENSION_REGISTRY` descriptors in P5.** `RUNTIME_TARGET_DIMENSION_IDS` (dimensionRegistry.ts:240-242) auto-derives a layout target + force weight from *every* registered dimension whose `type` is in `SLIDER_CAPABLE_TYPES` (`categorical | binary | scalar | temporal | multi-hot`). Adding a descriptor now would silently change the physics layout and color modes — out of scope. P5 ends at `NodeFeatureSnapshot` fields. Wiring these fields into the registry/sliders/weights is P6.
- (The one escape hatch — `type: "derived"` is *not* in `SLIDER_CAPABLE_TYPES`, so it never becomes a target — is noted only so P6 knows it exists. Do not rely on it in P5.)

**Node identity is immutable:** one node per **UserProjectInstance**, id = `` `${userId}::${projectId}` `` where `userId` is the lowercased email (`graphTables.ts` `userIdFor`). Every new field is per-instance. Do not collapse to per-user.

**Backward-compat field rule:** every new `NodeFeatureSnapshot` field is **optional (`?`)** and the `fallback()` builder in `featureSnapshot.ts` must set a safe default for it, mirroring the existing `isAdmin?`/`moduleSignature?` pattern (interactionTypes.ts:59-70). This is asserted by an existing-pattern test in every phase.

**`dataLayer.ts` (`nodes` table) is OUT of scope.** That is the math/physics normalization path; P5 enriches the interaction-engine path (`featureSnapshot.ts` → `NodeFeatureSnapshot`) only. Physics weighting is P6.

---

## Field-by-Field Source Analysis (required deliverable)

`✓ available` = already flows to the client feed today. `permTier` is special-cased: the column exists in the snapshot type but is **null in the live graph** because the shell passes `folderRows: []` (AccessAnalysisShell.tsx:231).

| # | Field | Source table / field | In `graph_users` / `graph_user_projects` today? | `graphTables.ts` change? | router / API change? | Computable client-side from existing feed? | Phase |
|---|-------|----------------------|--------------------------------------------------|--------------------------|----------------------|---------------------------------------------|-------|
| 7 | **module-specific flags** | `moduleSignature` (already on snapshot, from `graph_user_projects.module_ids`) | ✓ available (`module_ids`) | No | No | **Yes** — pure derive from `moduleSignature` | **A** |
| 6a | **riskScore primitives (subset)** | composite of existing `isExternal`, `isAdmin`, `signinBucket`, `activityBucket` | ✓ available | No | No | **Yes** for combos using only available fields | **A** |
| 1 | **membershipAge / addedOn** | `AccDcProjectUser.addedOn` (`DateTime?`, schema:657) | ✗ — not selected, not carried (`assembleDcUsers` hardcodes `addedOn: null`, dcUserAssembly.ts:187) | **Yes** — add `added_on` to `userProjects` rows | **Yes** — `select addedOn`; carry → `BulkAccProject.addedOn` | No (data absent from feed) | **B** |
| 3a | **activityRecency (per-instance)** | `AccDcProjectUser.lastSignIn` (`DateTime?`, schema:658) | partial — *user-level* `last_sign_in` exists in `graph_users`; **instance-level absent** | **Yes** — add `last_sign_in` to `userProjects` rows | **Yes** — `select lastSignIn`; carry | No for true per-instance (user-level is a coarser proxy) | **B** |
| 4 | **permissionStrength (numeric)** | `normalizePermTier()` (view<download<upload<edit<control, dcUserAssembly.ts:27) over `AccFolderPermission.permType` grants | ✗ in live graph (`folderRows: []`); type exists but null | **Yes** — add per-instance `perm_strength` column | **Yes** — new `includePermissionSummary` flag computes summary server-side | Function is client-side, **data absent** | **B** |
| 5 | **permissionTypeSummary** | `AccFolderPermission` via `permissionContexts` (folder breadth, coverage, mixed, full-controller) | ✗ | **Yes** — add `perm_summary_json` column | **Yes** — `includePermissionSummary` | No | **B** |
| 2 | **activityMix (counts by category)** | `AccActivity.rawAction` → `categorize()` (7 cats, activityCategories.ts:420), grouped by `userEmail` + `projectId` | ✗ | **Yes** — add `activity_mix_json` column | **Yes** — new aggregation query in `acc-hot-cache` + `BulkAccProject` field | No | **C** |
| 3b | **activityRecency (TRUE last activity)** | `AccActivity max(createdAt)` per (`userEmail`,`projectId`) | ✗ | **Yes** — add `last_activity` column | **Yes** — aggregation | No | **C** |
| 6b | **riskScore primitives (full)** | composite of #1/#4/#5/#2 above + existing fields | n/a (derived) | No | No | **Yes** once B/C land | **D** |

**Key discoveries driving the above:**
- `AccDcProjectUser` carries `addedOn` *and* `lastSignIn` per (project,user) — the membership/recency source exists in Postgres; only the plumbing is missing.
- `permissionContexts` is already assembled (dcUserAssembly.ts:151-171) but gated behind `includePermissionContexts`, which the live shell never sets — and the raw array is too large to ship (V8 max-string risk, dcUserAssembly.ts:18-24). P5 adds a *summary-only* flag so the client gets the compact derived facts, not the raw fan-out.
- `AccActivity` is the only per-category activity source; it is a large table, hence Phase C isolation.

---

## New `NodeFeatureSnapshot` Fields (added incrementally; full final shape)

All optional, all defaulted in `fallback()`. Added in the phase noted.

```typescript
// interactionTypes.ts — appended to NodeFeatureSnapshot (see per-phase tasks for exact insertion)

  /** [P5-A] Per-known-module presence flags derived from moduleSignature. */
  moduleFlags?: Record<string, boolean>;

  /** [P5-B] Days since this instance's AccDcProjectUser.addedOn; null when unknown. */
  membershipAgeDays?: number | null;
  /** [P5-B] Coarse tenure bucket. */
  membershipBucket?: "<30d" | "<90d" | "<1y" | ">1y" | "unknown";

  /** [P5-B] Numeric access strength 0..5 (0=none, view=1 … control=5); MAX across grants. */
  permissionStrength?: number;
  /** [P5-B] Derived per-instance permission profile from folder grants. */
  permissionTypeSummary?: {
    folderBreadth: number;          // distinct folders this instance can reach
    coverage: "known" | "partial" | "unknown";
    mixedProfile: boolean;          // >1 distinct normalized tier across grants
    fullController: boolean;        // any grant normalizes to "control"
  };

  /** [P5-B then refined in P5-C] Last-activity recency bucket (6-way). */
  activityRecencyBucket?: "0-7d" | "8-14d" | "15-30d" | "31-60d" | "60d+" | "none";

  /** [P5-C] Activity event counts by normalized category. */
  activityMix?: Partial<Record<import("@/lib/acc/activityCategories").ActivityCategory, number>>;
  /** [P5-C] Sum of activityMix values. */
  activityTotal?: number;

  /** [P5-A subset, finalized P5-D] Boolean risk primitives. */
  riskFlags?: {
    externalHighPerm: boolean;      // external AND permissionStrength >= 4 (edit/control)
    staleButActive: boolean;        // no recent sign-in BUT account active + has access
    externalProjectAdmin: boolean;  // external AND isAdmin
    broadFolderAccess: boolean;     // folderBreadth >= BROAD_FOLDER_THRESHOLD
    highActivityHighPerm: boolean;  // activityTotal high AND permissionStrength >= 4
  };
  /** [P5-D] Count of true riskFlags, 0..5 — a primitive, NOT a weighted score. */
  riskScore?: number;
```

---

# Phase A — Client-side derivation (no feed/router changes)

## Task A1: `moduleFlags` pure helper

**Files:**
- Create: `app/(dashboard)/users/access-analysis/moduleFlags.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/moduleFlags.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/moduleFlags.test.ts
import { describe, it, expect } from "vitest";
import { KNOWN_ADVANCED_MODULES, deriveModuleFlags } from "../moduleFlags";

describe("deriveModuleFlags", () => {
  it("sets true only for known modules present in the signature", () => {
    const flags = deriveModuleFlags(["build", "cost"]);
    expect(flags.build).toBe(true);
    expect(flags.cost).toBe(true);
    // every other known module is explicitly false (not undefined)
    for (const k of KNOWN_ADVANCED_MODULES) {
      if (k !== "build" && k !== "cost") expect(flags[k]).toBe(false);
    }
  });

  it("returns an all-false map for an empty signature", () => {
    const flags = deriveModuleFlags([]);
    expect(Object.values(flags).every((v) => v === false)).toBe(true);
    expect(Object.keys(flags).sort()).toEqual([...KNOWN_ADVANCED_MODULES].sort());
  });

  it("ignores unknown module keys (no extra keys leak in)", () => {
    const flags = deriveModuleFlags(["totally-unknown-module"]);
    expect(Object.keys(flags).sort()).toEqual([...KNOWN_ADVANCED_MODULES].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/moduleFlags.test.ts`
Expected: FAIL — `Cannot find module '../moduleFlags'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// moduleFlags.ts
/**
 * moduleFlags.ts — Pure derivation of per-known-module presence flags from a
 * node's moduleSignature. No React/DOM/IO (mirrors dimensionRegistry purity).
 *
 * P5: this only ENRICHES the snapshot. It does NOT register a dimension descriptor
 * (that would create a layout target — see plan Hard Constraints). P6 wires these
 * flags into module-specific sliders.
 */

/**
 * Curated set of non-baseline ACC products we expose as individual flags. Baselines
 * (docs/insight) are excluded upstream by parseModuleSignature, so they never appear.
 * Keep in sync with productKeys observed in graph_user_projects.module_ids.
 */
export const KNOWN_ADVANCED_MODULES = [
  "build",
  "cost",
  "takeoff",
  "modelcoordination",
  "designcollaboration",
  "autospecs",
  "assets",
] as const;

export type KnownModule = (typeof KNOWN_ADVANCED_MODULES)[number];

/** Derive a complete (all keys present) flag map from a module signature. */
export function deriveModuleFlags(moduleSignature: readonly string[]): Record<string, boolean> {
  const present = new Set(moduleSignature);
  const out: Record<string, boolean> = {};
  for (const key of KNOWN_ADVANCED_MODULES) out[key] = present.has(key);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/moduleFlags.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/moduleFlags.ts" "app/(dashboard)/users/access-analysis/__tests__/moduleFlags.test.ts"
git commit -m "feat(acc-graph): P5-A moduleFlags pure helper (no registry/UI)"
```

## Task A2: `riskFlags` pure helper (Phase-A subset)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/riskFlags.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/riskFlags.test.ts`

The helper takes a single typed input object so Phase D can extend it with permission/activity fields without changing call sites. In Phase A, the permission/activity inputs are absent, so those flags compute to `false`.

- [ ] **Step 1: Write the failing test**

```typescript
// __tests__/riskFlags.test.ts
import { describe, it, expect } from "vitest";
import { computeRiskFlags, type RiskInput } from "../riskFlags";

const base: RiskInput = {
  isExternal: false,
  isAdmin: false,
  signinBucket: "<7d",
  accountStatus: "active",
  hasAccess: true,
  permissionStrength: 0,
  folderBreadth: 0,
  activityTotal: 0,
};

describe("computeRiskFlags — Phase A (no perm/activity)", () => {
  it("externalProjectAdmin: external AND admin", () => {
    expect(computeRiskFlags({ ...base, isExternal: true, isAdmin: true }).externalProjectAdmin).toBe(true);
    expect(computeRiskFlags({ ...base, isExternal: false, isAdmin: true }).externalProjectAdmin).toBe(false);
  });

  it("staleButActive: cold sign-in AND active account AND has access", () => {
    expect(computeRiskFlags({ ...base, signinBucket: ">90d" }).staleButActive).toBe(true);
    expect(computeRiskFlags({ ...base, signinBucket: ">90d", hasAccess: false }).staleButActive).toBe(false);
    expect(computeRiskFlags({ ...base, signinBucket: ">90d", accountStatus: "inactive" }).staleButActive).toBe(false);
  });

  it("permission/activity flags are false when those inputs are zero", () => {
    const f = computeRiskFlags({ ...base, isExternal: true });
    expect(f.externalHighPerm).toBe(false);
    expect(f.broadFolderAccess).toBe(false);
    expect(f.highActivityHighPerm).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/riskFlags.test.ts`
Expected: FAIL — `Cannot find module '../riskFlags'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// riskFlags.ts
/**
 * riskFlags.ts — Pure computation of boolean risk PRIMITIVES (not a weighted score).
 * Phase A computes the combos that only need already-available fields; Phase D feeds
 * in real permissionStrength / folderBreadth / activityTotal. Inputs absent in Phase A
 * default to 0, so their flags evaluate to false. No registry descriptor (plan constraint).
 */
import type { NodeFeatureSnapshot } from "./interactionTypes";

/** A folder reach at/above this many distinct folders is "broad". Tunable in P6. */
export const BROAD_FOLDER_THRESHOLD = 25;
/** Activity volume at/above this total is "high". Aligns with bucketActivity High (>100). */
export const HIGH_ACTIVITY_THRESHOLD = 100;
/** permissionStrength at/above this is "high permission" (edit=4, control=5). */
export const HIGH_PERMISSION_STRENGTH = 4;

export interface RiskInput {
  isExternal: boolean;
  isAdmin: boolean;
  signinBucket: NodeFeatureSnapshot["signinBucket"];
  accountStatus: string;
  /** True when the instance retains access (member of an active project). */
  hasAccess: boolean;
  permissionStrength: number;
  folderBreadth: number;
  activityTotal: number;
}

export type RiskFlags = NonNullable<NodeFeatureSnapshot["riskFlags"]>;

export function computeRiskFlags(i: RiskInput): RiskFlags {
  const cold = i.signinBucket === ">90d";
  const highPerm = i.permissionStrength >= HIGH_PERMISSION_STRENGTH;
  return {
    externalHighPerm: i.isExternal && highPerm,
    staleButActive: cold && i.accountStatus === "active" && i.hasAccess,
    externalProjectAdmin: i.isExternal && i.isAdmin,
    broadFolderAccess: i.folderBreadth >= BROAD_FOLDER_THRESHOLD,
    highActivityHighPerm: i.activityTotal >= HIGH_ACTIVITY_THRESHOLD && highPerm,
  };
}

/** Count of true primitives, 0..5. */
export function riskScoreFromFlags(flags: RiskFlags): number {
  return Object.values(flags).filter(Boolean).length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/riskFlags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/riskFlags.ts" "app/(dashboard)/users/access-analysis/__tests__/riskFlags.test.ts"
git commit -m "feat(acc-graph): P5-A riskFlags pure primitives helper"
```

## Task A3: wire `moduleFlags` + Phase-A `riskFlags` into the snapshot

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (add the fields from "New Fields" block above)
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`

- [ ] **Step 1: Add the new optional fields to `NodeFeatureSnapshot`**

In `interactionTypes.ts`, append `moduleFlags?`, `riskFlags?`, and `riskScore?` (exact shapes from the "New Fields" block) after `moduleSignature?`. Add only these three in Phase A; the rest land in their phases.

- [ ] **Step 2: Write the failing test**

Append to `featureSnapshot.test.ts`:

```typescript
import { KNOWN_ADVANCED_MODULES } from "../moduleFlags";

describe("buildFeatureSnapshot — P5-A moduleFlags + riskFlags", () => {
  it("derives moduleFlags from module_ids (known modules only)", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", module_ids: "build|insight|cost" })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.moduleFlags!.build).toBe(true);
    expect(f!.moduleFlags!.cost).toBe(true);
    expect(f!.moduleFlags!.takeoff).toBe(false);
  });

  it("computes externalProjectAdmin from email + is_project_admin", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", email: "x@gmail.com", is_project_admin: true })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.riskFlags!.externalProjectAdmin).toBe(true);
    expect(f!.riskScore).toBeGreaterThanOrEqual(1);
  });

  it("Phase-A perm/activity risk flags are false (inputs not yet plumbed)", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", email: "x@gmail.com" })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.riskFlags!.externalHighPerm).toBe(false);
    expect(f!.riskFlags!.broadFolderAccess).toBe(false);
  });

  it("fallback for unknown nodeId yields all-false moduleFlags + riskScore 0", async () => {
    const [f] = await buildFeatureSnapshot({ nodeIds: ["ghost::missing"] });
    expect(Object.values(f!.moduleFlags!).every((v) => v === false)).toBe(true);
    expect(f!.riskScore).toBe(0);
    expect(Object.keys(f!.moduleFlags!).sort()).toEqual([...KNOWN_ADVANCED_MODULES].sort());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`
Expected: FAIL — `moduleFlags`/`riskFlags` undefined.

- [ ] **Step 4: Implement in `featureSnapshot.ts`**

Add imports at the top:

```typescript
import { deriveModuleFlags } from "./moduleFlags";
import { computeRiskFlags, riskScoreFromFlags } from "./riskFlags";
```

In the `map.set(id, {...})` object (after `moduleSignature: parseModuleSignature(r.module_ids),`), append:

```typescript
      moduleFlags: deriveModuleFlags(parseModuleSignature(r.module_ids)),
      riskFlags: (() => {
        const flags = computeRiskFlags({
          isExternal,
          isAdmin: Boolean(r.is_project_admin),
          signinBucket: bucketSignin(signinDays),
          accountStatus: String(r.account_status ?? ""),
          // hasAccess: instance is in the feed → it is a real membership.
          hasAccess: true,
          // Phase A: permission/activity inputs not yet plumbed (see Phase B/C).
          permissionStrength: 0,
          folderBreadth: 0,
          activityTotal: 0,
        });
        return flags;
      })(),
      riskScore: 0, // overwritten below to stay DRY with riskFlags
```

Then replace the literal `riskScore: 0` line by computing it from the flags object. The cleanest form — build `riskFlags` into a local before the object literal:

```typescript
    const riskFlags = computeRiskFlags({
      isExternal,
      isAdmin: Boolean(r.is_project_admin),
      signinBucket: bucketSignin(signinDays),
      accountStatus: String(r.account_status ?? ""),
      hasAccess: true,
      permissionStrength: 0,
      folderBreadth: 0,
      activityTotal: 0,
    });
```

and in the object literal use:

```typescript
      moduleFlags: deriveModuleFlags(parseModuleSignature(r.module_ids)),
      riskFlags,
      riskScore: riskScoreFromFlags(riskFlags),
```

In the `fallback()` builder, append:

```typescript
    moduleFlags: deriveModuleFlags([]),
    riskFlags: computeRiskFlags({
      isExternal: false, isAdmin: false, signinBucket: ">90d",
      accountStatus: "", hasAccess: false,
      permissionStrength: 0, folderBreadth: 0, activityTotal: 0,
    }),
    riskScore: 0,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`
Expected: PASS (all old + new tests).

- [ ] **Step 6: Full gates**

Run: `npm run test:unit` and `npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"
git commit -m "feat(acc-graph): P5-A wire moduleFlags + risk primitives into snapshot"
```

---

# Phase B — Feed plumbing (data already in Postgres)

> Pipeline for each Phase-B field: **Prisma select → `assembleDcUsers` → `acc-types` (`BulkAccProject`) → `graphTables` (Arrow column) → `featureSnapshot` SQL + JS → snapshot field.** Each task threads one field end-to-end with tests at each layer it crosses.

## Task B1: surface `addedOn` + `lastSignIn` on `BulkAccProject`

**Files:**
- Modify: `lib/acc/acc-types.ts` (`BulkAccProject`)
- Modify: `lib/acc/dcUserAssembly.ts` (`DcAssemblyInput.projectUsers`, project mapping)
- Test: `lib/acc/dcUserAssembly.test.ts`

- [ ] **Step 1: Extend `DcAssemblyInput.projectUsers` and `BulkAccProject`**

In `acc-types.ts`, add to `BulkAccProject`:

```typescript
  /** ISO addedOn for THIS (project,user) membership; null when DC reported none. Source: AccDcProjectUser.addedOn. */
  addedOn?: string | null;
  /** ISO last sign-in for THIS (project,user); null when none. Source: AccDcProjectUser.lastSignIn. */
  lastSignIn?: string | null;
```

In `dcUserAssembly.ts`, widen the input type:

```typescript
  projectUsers: { projectId: string; userId: string; addedOn?: string | null; lastSignIn?: string | null }[];
```

- [ ] **Step 2: Write the failing test**

Add to `dcUserAssembly.test.ts`:

```typescript
describe("per-instance addedOn / lastSignIn", () => {
  it("carries AccDcProjectUser.addedOn + lastSignIn onto the project", () => {
    const input: DcAssemblyInput = {
      ...base,
      users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
      projectUsers: [{ projectId: "p1", userId: "u1", addedOn: "2025-01-01T00:00:00.000Z", lastSignIn: "2026-05-01T00:00:00.000Z" }],
      projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "ok" } },
    };
    const out = assembleDcUsers(input);
    expect(out[0].projects[0].addedOn).toBe("2025-01-01T00:00:00.000Z");
    expect(out[0].projects[0].lastSignIn).toBe("2026-05-01T00:00:00.000Z");
  });

  it("defaults to null when the membership row omits the dates", () => {
    const out = assembleDcUsers(base);
    expect(out[0]?.projects[0]?.addedOn ?? null).toBeNull();
  });
});
```

(`base` is the existing shared fixture in this test file; if it lacks `projectUsers`, reuse its current shape — the second test asserts the null default.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: FAIL — `addedOn` undefined on project.

- [ ] **Step 4: Implement the carry**

`assembleDcUsers` builds `membersByUser` from `projectUsers` as a `Set<string>` of project ids (dcUserAssembly.ts:82-87). Add a lookup so the date survives. After the existing `membersByUser` loop, add:

```typescript
  // Per-(user,project) membership dates from AccDcProjectUser.
  const membershipDates = new Map<string, { addedOn: string | null; lastSignIn: string | null }>();
  for (const pu of input.projectUsers) {
    membershipDates.set(`${pu.userId}::${pu.projectId}`, {
      addedOn: pu.addedOn ?? null,
      lastSignIn: pu.lastSignIn ?? null,
    });
  }
```

In the `projects = [...projectIds].map((pid) => {...})` block, add to the returned object:

```typescript
        addedOn: membershipDates.get(`${u.id}::${pid}`)?.addedOn ?? null,
        lastSignIn: membershipDates.get(`${u.id}::${pid}`)?.lastSignIn ?? null,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/acc/acc-types.ts lib/acc/dcUserAssembly.ts lib/acc/dcUserAssembly.test.ts
git commit -m "feat(acc-graph): P5-B carry per-instance addedOn/lastSignIn onto BulkAccProject"
```

## Task B2: select `addedOn` + `lastSignIn` in the router cache

**Files:**
- Modify: `lib/server/acc-hot-cache.ts` (the `accDcProjectUser.findMany` select + the `projectUsers` mapping into `assembleDcUsers`)
- Test: `server/routers/acc-dc-graph.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `acc-dc-graph.test.ts` (this file already constructs a fake `db`; extend its `accDcProjectUser` rows with the dates and assert they reach the assembled output). Following the file's existing caller pattern:

```typescript
it("threads AccDcProjectUser.addedOn/lastSignIn to the assembled project", async () => {
  const db = makeDb({
    accDcProjectUser: [{ projectId: "p1", userId: "u1", addedOn: new Date("2025-01-01T00:00:00Z"), lastSignIn: new Date("2026-05-01T00:00:00Z") }],
    // ...other tables minimally populated so u1 is not orphaned (mirror existing fixtures)
  });
  const rows = await makeCaller(db).bulkUsers();
  const proj = rows.find((r) => r.email.includes("u1"))?.projects[0];
  expect(proj?.addedOn).toBe("2025-01-01T00:00:00.000Z");
});
```

(Match the exact fixture/`makeDb` helper already in the test file; the assertion is the contract.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/routers/acc-dc-graph.test.ts`
Expected: FAIL — `addedOn` undefined (not selected/mapped).

- [ ] **Step 3: Implement**

In `acc-hot-cache.ts`, change the `accDcProjectUser` select:

```typescript
        db.accDcProjectUser.findMany({
          select: { projectId: true, userId: true, addedOn: true, lastSignIn: true },
        }),
```

Then in the `assembleDcUsers({ ... })` call, map `projectUsers` to ISO strings (the raw rows carry `Date | null`):

```typescript
        projectUsers: projectUsers.map((pu: any) => ({
          projectId: pu.projectId,
          userId: pu.userId,
          addedOn: pu.addedOn ? pu.addedOn.toISOString() : null,
          lastSignIn: pu.lastSignIn ? pu.lastSignIn.toISOString() : null,
        })),
```

> Note: this changes the cached payload shape. `getCachedAccDcBulkUsers` keys its cache by `dbVersion(...)` — bump/confirm `DC_VERSION_SPECS` includes `accDcProjectUser` so a redeploy invalidates the stale lean cache. If the spec list does not already cover it, add it in this step and assert with the existing version test.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/routers/acc-dc-graph.test.ts lib/server/acc-hot-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/acc-hot-cache.ts server/routers/acc-dc-graph.test.ts
git commit -m "feat(acc-graph): P5-B select per-instance membership dates in bulkUsers cache"
```

## Task B3: emit `added_on` + `last_sign_in` columns on `graph_user_projects`

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/graphTables.ts`
- Test: `app/(dashboard)/users/access-analysis/graphTables.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `graphTables.test.ts`:

```typescript
it("emits added_on + last_sign_in columns on userProjects (epoch ms or null)", async () => {
  const users = [u({
    projects: [{ id: "p1", name: "P1", status: "active", isAdmin: false, roles: ["R"], modules: ["build"],
      addedOn: "2025-01-01T00:00:00.000Z", lastSignIn: "2026-05-01T00:00:00.000Z" } as any],
  })];
  const tables = await buildGraphArrowTables({ users, similarityInput: null, topology: null });
  const row = tables.userProjects.toArray()[0] as any;
  expect(typeof row.added_on === "number" || row.added_on === null).toBe(true);
  expect(row.added_on).toBe(Date.parse("2025-01-01T00:00:00.000Z"));
  expect(row.last_sign_in_instance).toBe(Date.parse("2026-05-01T00:00:00.000Z"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/(dashboard)/users/access-analysis/graphTables.test.ts`
Expected: FAIL — `added_on` undefined.

- [ ] **Step 3: Implement**

In `graphTables.ts`, the `projectRows` mapping (line ~131) gains two fields. `timestampMillis()` already exists in this file:

```typescript
      return roles.map((role) => ({
        user_id: uid,
        email: user.email,
        project_id: project.id,
        project_name: project.name?.trim() || "Unknown",
        project_status: project.status,
        is_project_admin: project.isAdmin,
        role_id: role?.trim() || "Unknown",
        module_ids: project.modules.join("|"),
        added_on: timestampMillis(project.addedOn),
        last_sign_in_instance: timestampMillis(project.lastSignIn),
      }));
```

In the `userProjects: tableFromArrays({...})` block, add:

```typescript
      added_on: projectRows.map((row) => row.added_on),
      last_sign_in_instance: projectRows.map((row) => row.last_sign_in_instance),
```

> `tableFromArrays` with a JS array of `number | null` yields a nullable numeric column — matches the existing `last_sign_in`/`added_on` handling in the `users` table (graphTables.ts:186-187).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/(dashboard)/users/access-analysis/graphTables.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/graphTables.test.ts"
git commit -m "feat(acc-graph): P5-B emit added_on + per-instance last_sign_in on graph_user_projects"
```

## Task B4: read membership age + per-instance recency in the snapshot

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts` (SQL + bucketers + mapping + fallback)
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (`membershipAgeDays`, `membershipBucket`, `activityRecencyBucket`)
- Test: `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`

- [ ] **Step 1: Add fields + bucketers (write failing tests first)**

Add to `interactionTypes.ts`: `membershipAgeDays?`, `membershipBucket?`, `activityRecencyBucket?` (shapes from the New Fields block).

Add to `featureSnapshot.test.ts`:

```typescript
import { bucketMembership, bucketRecency } from "../featureSnapshot";

describe("bucketMembership", () => {
  it("buckets days into <30d/<90d/<1y/>1y/unknown", () => {
    expect(bucketMembership(10)).toBe("<30d");
    expect(bucketMembership(60)).toBe("<90d");
    expect(bucketMembership(200)).toBe("<1y");
    expect(bucketMembership(400)).toBe(">1y");
    expect(bucketMembership(null)).toBe("unknown");
  });
});

describe("bucketRecency", () => {
  it("buckets days into 0-7/8-14/15-30/31-60/60d+/none", () => {
    expect(bucketRecency(3)).toBe("0-7d");
    expect(bucketRecency(10)).toBe("8-14d");
    expect(bucketRecency(20)).toBe("15-30d");
    expect(bucketRecency(45)).toBe("31-60d");
    expect(bucketRecency(90)).toBe("60d+");
    expect(bucketRecency(null)).toBe("none");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`
Expected: FAIL — `bucketMembership` not exported.

- [ ] **Step 3: Implement the bucketers**

Add to `featureSnapshot.ts`:

```typescript
/** Membership tenure bucket from age in days. null → "unknown". */
export function bucketMembership(days: number | null): NodeFeatureSnapshot["membershipBucket"] {
  if (days === null || !Number.isFinite(days)) return "unknown";
  if (days < 30) return "<30d";
  if (days < 90) return "<90d";
  if (days < 365) return "<1y";
  return ">1y";
}

/** Six-way recency bucket from days since last activity/sign-in. null → "none". */
export function bucketRecency(days: number | null): NodeFeatureSnapshot["activityRecencyBucket"] {
  if (days === null || !Number.isFinite(days)) return "none";
  if (days <= 7) return "0-7d";
  if (days <= 14) return "8-14d";
  if (days <= 30) return "15-30d";
  if (days <= 60) return "31-60d";
  return "60d+";
}
```

- [ ] **Step 4: Extend the SQL + row type + mapping**

Add to `RawFeatureRow`:

```typescript
  added_on: bigint | number | null;
  last_sign_in_instance: bigint | number | null;
```

In the SQL `SELECT`, add (these are scalar per-instance columns — wrap in `ANY_VALUE` to satisfy the GROUP BY):

```sql
      ANY_VALUE(up.added_on)               AS added_on,
      ANY_VALUE(up.last_sign_in_instance)  AS last_sign_in_instance,
```

In the JS mapping, before `map.set`:

```typescript
    const addedOnMs =
      r.added_on === null || r.added_on === undefined ? null : Number(r.added_on);
    const membershipAgeDays =
      addedOnMs === null ? null : Math.floor((Date.now() - addedOnMs) / 86_400_000);
    const instanceSigninMs =
      r.last_sign_in_instance === null || r.last_sign_in_instance === undefined
        ? null
        : Number(r.last_sign_in_instance);
    const instanceRecencyDays =
      instanceSigninMs === null ? null : Math.floor((Date.now() - instanceSigninMs) / 86_400_000);
```

Add to the object literal:

```typescript
      membershipAgeDays,
      membershipBucket: bucketMembership(membershipAgeDays),
      // Phase B: per-instance recency from AccDcProjectUser.lastSignIn. Phase C
      // overwrites this with true last-ACTIVITY recency from AccActivity.
      activityRecencyBucket: bucketRecency(instanceRecencyDays),
```

Add to `fallback()`:

```typescript
    membershipAgeDays: null,
    membershipBucket: "unknown",
    activityRecencyBucket: "none",
```

- [ ] **Step 5: Write the snapshot-level test + run**

Add to `featureSnapshot.test.ts`:

```typescript
describe("buildFeatureSnapshot — P5-B membership + per-instance recency", () => {
  it("computes membershipBucket from added_on epoch ms", async () => {
    const longAgo = Date.now() - 400 * 86_400_000;
    mockRows = [makeRow({ user_id: "u", project_id: "p", added_on: BigInt(longAgo) })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.membershipBucket).toBe(">1y");
    expect(f!.membershipAgeDays).toBeGreaterThanOrEqual(399);
  });
  it("computes activityRecencyBucket from instance last sign-in", async () => {
    const recent = Date.now() - 3 * 86_400_000;
    mockRows = [makeRow({ user_id: "u", project_id: "p", last_sign_in_instance: BigInt(recent) })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.activityRecencyBucket).toBe("0-7d");
  });
});
```

Extend the `makeRow` helper to default `added_on: over.added_on ?? null` and `last_sign_in_instance: over.last_sign_in_instance ?? null`, and add both to `FakeRow`.

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"
git commit -m "feat(acc-graph): P5-B membershipAge + per-instance activityRecency in snapshot"
```

## Task B5: per-instance permission summary in `assembleDcUsers` (summary-only flag)

**Files:**
- Modify: `lib/acc/dcUserAssembly.ts` (add `includePermissionSummary`, compute per-project summary)
- Modify: `lib/acc/acc-types.ts` (`BulkAccProject` permission fields)
- Test: `lib/acc/dcUserAssembly.test.ts`

The raw `permissionContexts` array is too large to ship (dcUserAssembly.ts:18-24). This task computes a **compact per-(user,project) summary** server-side and leaves the raw array empty — so the client gets `permissionStrength` / breadth / flags without the payload bomb.

- [ ] **Step 1: Add summary fields to `BulkAccProject`**

```typescript
  /** [P5-B] Numeric max access strength 0..5 over this instance's folder grants. */
  permissionStrength?: number;
  /** [P5-B] Distinct folders reachable by this instance. */
  folderBreadth?: number;
  /** [P5-B] >1 distinct normalized tier across grants. */
  permMixedProfile?: boolean;
  /** [P5-B] Any grant normalizes to "control". */
  fullController?: boolean;
```

Add `includePermissionSummary?: boolean;` to `DcAssemblyInput`.

- [ ] **Step 2: Write the failing test**

```typescript
describe("includePermissionSummary", () => {
  const withGrants: DcAssemblyInput = {
    ...base,
    users: [{ id: "u1", email: "a@hermosillo.com", name: "A", status: "active", companyId: null }],
    projectUsers: [{ projectId: "p1", userId: "u1" }],
    projectUserRoles: [{ projectId: "p1", userId: "u1", roleId: "r1" }],
    projectMeta: { p1: { name: "P1", status: "active", crawlStatus: "ok" } },
    folderPermissions: [
      { folderId: "f1", roleId: "r1", permType: "View Only", actions: [], projectId: "p1", folderPath: "A" },
      { folderId: "f2", roleId: "r1", permType: "Full Controller", actions: [], projectId: "p1", folderPath: "B" },
    ],
  };

  it("computes strength=control(5), breadth=2, mixed=true, fullController=true", () => {
    const out = assembleDcUsers({ ...withGrants, includePermissionSummary: true });
    const proj = out[0].projects[0];
    expect(proj.permissionStrength).toBe(5);
    expect(proj.folderBreadth).toBe(2);
    expect(proj.permMixedProfile).toBe(true);
    expect(proj.fullController).toBe(true);
  });

  it("leaves summary undefined and contexts empty when flag is off", () => {
    const out = assembleDcUsers(withGrants);
    expect(out[0].projects[0].permissionStrength).toBeUndefined();
    expect(out[0].permissionContexts).toEqual([]);
  });

  it("summary mode does NOT ship raw permissionContexts", () => {
    const out = assembleDcUsers({ ...withGrants, includePermissionSummary: true });
    expect(out[0].permissionContexts).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

Add a strength rank helper near `normalizePermTier`:

```typescript
const TIER_RANK: Record<string, number> = { view: 1, download: 2, upload: 3, edit: 4, control: 5 };
export function permTierStrength(permType: string): number {
  return TIER_RANK[normalizePermTier(permType)] ?? 0;
}
```

In `assembleDcUsers`, read the new flag and compute the summary inside the `projects.map`. The grant lookup `folderPermsByProjectRole` and `rawRolesByUserProject` already exist:

```typescript
  const includeSummary = input.includePermissionSummary === true;
  // ...
    const projects = [...projectIds].map((pid) => {
      // ...existing fields...
      let permissionStrength: number | undefined;
      let folderBreadth: number | undefined;
      let permMixedProfile: boolean | undefined;
      let fullController: boolean | undefined;
      if (includeSummary) {
        const rawRoleIds = rawRolesByUserProject.get(`${u.id}::${pid}`) ?? new Set<string>();
        const folders = new Set<string>();
        const tiers = new Set<string>();
        let maxStrength = 0;
        for (const rid of rawRoleIds) {
          for (const fp of folderPermsByProjectRole.get(`${pid}::${rid}`) ?? []) {
            folders.add(fp.folderId);
            const tier = normalizePermTier(fp.permType);
            tiers.add(tier);
            maxStrength = Math.max(maxStrength, permTierStrength(fp.permType));
          }
        }
        permissionStrength = maxStrength;
        folderBreadth = folders.size;
        permMixedProfile = tiers.size > 1;
        fullController = tiers.has("control");
      }
      return {
        id: pid, name: meta.name, status: meta.status, isAdmin, roles,
        modules: prods.map((p) => p.key), crawlStatus: meta.crawlStatus,
        addedOn: membershipDates.get(`${u.id}::${pid}`)?.addedOn ?? null,
        lastSignIn: membershipDates.get(`${u.id}::${pid}`)?.lastSignIn ?? null,
        permissionStrength, folderBreadth, permMixedProfile, fullController,
      };
    });
```

> Summary computation requires the folder-permission rows. `includePermissionSummary` must therefore cause the router to fetch `accFolderPermission` (Task B6) — but it does NOT enable `includePermissionContexts`, so the raw array stays empty. Both flags can be true independently.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run lib/acc/dcUserAssembly.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/acc/dcUserAssembly.ts lib/acc/acc-types.ts lib/acc/dcUserAssembly.test.ts
git commit -m "feat(acc-graph): P5-B per-instance permission summary (summary-only, no raw contexts)"
```

## Task B6: wire `includePermissionSummary` through the router cache

**Files:**
- Modify: `server/routers/acc-dc-graph.ts` (input schema)
- Modify: `lib/server/acc-hot-cache.ts` (fetch folder perms when summary requested; pass flag; cache key)
- Test: `server/routers/acc-dc-graph.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("includePermissionSummary populates per-project strength without raw contexts", async () => {
  const db = makeDb({ /* u1 in p1 with role r1 + a Full Controller folder grant */ });
  const rows = await makeCaller(db).bulkUsers({ includePermissionSummary: true });
  const proj = rows[0].projects[0];
  expect(proj.permissionStrength).toBeGreaterThan(0);
  expect(rows[0].permissionContexts).toEqual([]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run server/routers/acc-dc-graph.test.ts`
Expected: FAIL — input rejects unknown key / strength undefined.

- [ ] **Step 3: Implement**

Router input:

```typescript
    .input(z.object({
      includePermissionContexts: z.boolean().optional(),
      includePermissionSummary: z.boolean().optional(),
    }).optional())
```

In `getCachedAccDcBulkUsers`, accept `includePermissionSummary`, fetch folder permissions when **either** flag is set, vary the cache id, and pass the flag through:

```typescript
  const includePermissionSummary = input.includePermissionSummary === true;
  const needsFolderPerms = includePermissionContexts || includePermissionSummary;
  // version: include PERMISSION_VERSION_SPECS when needsFolderPerms
  // cache id suffix: `${includePermissionContexts ? "ctx" : ""}${includePermissionSummary ? "sum" : "lean"}`
  // rawFolderPermissions: gate on `needsFolderPerms` (not just includePermissionContexts)
  // assembleDcUsers({ includePermissionContexts, includePermissionSummary, ... })
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run server/routers/acc-dc-graph.test.ts lib/server/acc-hot-cache.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/routers/acc-dc-graph.ts lib/server/acc-hot-cache.ts server/routers/acc-dc-graph.test.ts
git commit -m "feat(acc-graph): P5-B includePermissionSummary flag in bulkUsers router"
```

## Task B7: emit permission summary columns + read them in the snapshot

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/graphTables.ts` (columns)
- Modify: `app/(dashboard)/users/access-analysis/featureSnapshot.ts` (SQL + mapping + `permissionTypeSummary` + `permissionStrength` + risk inputs)
- Modify: `app/(dashboard)/users/access-analysis/interactionTypes.ts` (`permissionStrength`, `permissionTypeSummary`)
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` (request `includePermissionSummary: true`)
- Test: `graphTables.test.ts`, `featureSnapshot.test.ts`

- [ ] **Step 1: Add `permissionStrength` + `permissionTypeSummary` to `NodeFeatureSnapshot`** (shapes from New Fields block).

- [ ] **Step 2: graphTables — write failing test + implement**

Test (`graphTables.test.ts`): a project with `permissionStrength: 5, folderBreadth: 3, fullController: true, permMixedProfile: true` produces `userProjects` columns `perm_strength`, `folder_breadth`, `full_controller`, `perm_mixed`.

Implement in `projectRows` mapping:

```typescript
        perm_strength: project.permissionStrength ?? 0,
        folder_breadth: project.folderBreadth ?? 0,
        full_controller: project.fullController ?? false,
        perm_mixed: project.permMixedProfile ?? false,
```

and in `userProjects: tableFromArrays`:

```typescript
      perm_strength: Int32Array.from(projectRows.map((r) => r.perm_strength)),
      folder_breadth: Int32Array.from(projectRows.map((r) => r.folder_breadth)),
      full_controller: projectRows.map((r) => r.full_controller),
      perm_mixed: projectRows.map((r) => r.perm_mixed),
```

- [ ] **Step 3: featureSnapshot — SQL + mapping**

Add to `RawFeatureRow`: `perm_strength`, `folder_breadth` (`bigint|number|null`), `full_controller`, `perm_mixed` (`boolean|number|null`). Add to SQL `SELECT` (wrap in `ANY_VALUE`):

```sql
      COALESCE(ANY_VALUE(up.perm_strength), 0)    AS perm_strength,
      COALESCE(ANY_VALUE(up.folder_breadth), 0)   AS folder_breadth,
      COALESCE(ANY_VALUE(up.full_controller), FALSE) AS full_controller,
      COALESCE(ANY_VALUE(up.perm_mixed), FALSE)   AS perm_mixed,
```

In the JS mapping:

```typescript
    const permissionStrength = Number(r.perm_strength ?? 0);
    const folderBreadth = Number(r.folder_breadth ?? 0);
```

object literal:

```typescript
      permissionStrength,
      permissionTypeSummary: {
        folderBreadth,
        coverage: (r.permission_coverage as NodeFeatureSnapshot["permissionCoverage"]) ?? "unknown",
        mixedProfile: Boolean(r.perm_mixed),
        fullController: Boolean(r.full_controller),
      },
```

Update the `riskFlags` local (from Task A3) to use the real inputs now available:

```typescript
    const riskFlags = computeRiskFlags({
      isExternal,
      isAdmin: Boolean(r.is_project_admin),
      signinBucket: bucketSignin(signinDays),
      accountStatus: String(r.account_status ?? ""),
      hasAccess: true,
      permissionStrength,
      folderBreadth,
      activityTotal: 0, // still 0 until Phase C
    });
```

`fallback()` additions: `permissionStrength: 0`, `permissionTypeSummary: { folderBreadth: 0, coverage: "unknown", mixedProfile: false, fullController: false }`.

- [ ] **Step 4: Shell — request the summary**

In `AccessAnalysisShell.tsx:202`:

```typescript
  const bulkUsersQuery = trpc.accDcGraph.bulkUsers.useQuery(
    { includePermissionSummary: true },
    { staleTime: 600_000 },
  );
```

> This is the one runtime behavior change in Phase B: the live graph now receives permission data. It does **not** enable raw contexts, so payload growth is bounded (4 small scalars per project row). Verify payload size in the e2e smoke (Task B8).

- [ ] **Step 5: Write snapshot test + run all**

`featureSnapshot.test.ts`: a row with `perm_strength: 5, full_controller: true` yields `permissionStrength === 5`, `permissionTypeSummary.fullController === true`, and (with `email: x@gmail.com`) `riskFlags.externalHighPerm === true`.

Run: `npx vitest run app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts app/(dashboard)/users/access-analysis/graphTables.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts" "app/(dashboard)/users/access-analysis/graphTables.test.ts"
git commit -m "feat(acc-graph): P5-B permissionStrength + permissionTypeSummary in snapshot + shell wiring"
```

## Task B8: Phase B gates + e2e smoke

- [ ] **Step 1: Full unit + typecheck**

Run: `npm run test:unit` and `npm run typecheck`
Expected: PASS; full prior suite (923+) still green plus new tests.

- [ ] **Step 2: e2e smoke (no UI assertions changed)**

Run: `npm run test:e2e`
Expected: 19/19 — the graph still loads with the enriched feed. If a node-count or load assertion drifts, investigate before proceeding (the summary flag must not change node count).

- [ ] **Step 3: Commit (if any test fixture updates needed)**

```bash
git add -A tests/e2e
git commit -m "test(acc-graph): P5-B e2e smoke with permission-summary feed"
```

---

# Phase C — `AccActivity` aggregation (recommended as a separate slice)

> **Performance note:** `AccActivity` is large (millions of rows; see project memory on DC ingest). The aggregation MUST be a grouped SQL/Prisma query (`groupBy` by `userEmail`, `projectId`, plus a categorized action), never a row-by-row fetch. Cache it under its own version key. Treat this phase as independently shippable.

## Task C1: per-instance activity aggregation in `acc-hot-cache`

**Files:**
- Create: `lib/acc/activityAggregate.ts` (pure: raw grouped rows → per-instance mix)
- Test: `lib/acc/activityAggregate.test.ts`
- Modify: `lib/server/acc-hot-cache.ts` (new `includeActivityMix` path)
- Modify: `lib/acc/acc-types.ts` (`BulkAccProject.activityMix`, `.activityTotal`, `.lastActivity`)

- [ ] **Step 1: Write the failing test for the pure aggregator**

```typescript
// activityAggregate.test.ts
import { describe, it, expect } from "vitest";
import { foldActivityRows } from "../activityAggregate";

describe("foldActivityRows", () => {
  it("buckets raw actions by normalized category per (email, projectId)", () => {
    const out = foldActivityRows([
      { userEmail: "a@x.com", projectId: "p1", rawAction: "File Viewed", count: 3, lastCreatedAt: "2026-05-01T00:00:00Z" },
      { userEmail: "a@x.com", projectId: "p1", rawAction: "File Uploaded", count: 2, lastCreatedAt: "2026-05-10T00:00:00Z" },
    ]);
    const inst = out.get("a@x.com::p1")!;
    expect(inst.mix.view).toBe(3);
    expect(inst.mix.upload).toBe(2);
    expect(inst.total).toBe(5);
    expect(inst.lastActivity).toBe("2026-05-10T00:00:00.000Z"); // max
  });
});
```

- [ ] **Step 2: Run to verify failure** → `npx vitest run lib/acc/activityAggregate.test.ts` → FAIL.

- [ ] **Step 3: Implement the pure folder**

```typescript
// activityAggregate.ts
import { categorize, type ActivityCategory } from "./activityCategories";

export interface RawActivityGroupRow {
  userEmail: string;
  projectId: string;
  rawAction: string;
  count: number;
  lastCreatedAt: string; // ISO
}

export interface InstanceActivity {
  mix: Partial<Record<ActivityCategory, number>>;
  total: number;
  lastActivity: string | null;
}

export function foldActivityRows(rows: readonly RawActivityGroupRow[]): Map<string, InstanceActivity> {
  const out = new Map<string, InstanceActivity>();
  for (const r of rows) {
    const key = `${r.userEmail.toLowerCase()}::${r.projectId}`;
    const cur = out.get(key) ?? { mix: {}, total: 0, lastActivity: null };
    const cat = categorize(r.rawAction);
    cur.mix[cat] = (cur.mix[cat] ?? 0) + r.count;
    cur.total += r.count;
    const iso = new Date(r.lastCreatedAt).toISOString();
    if (cur.lastActivity === null || iso > cur.lastActivity) cur.lastActivity = iso;
    out.set(key, cur);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass** → PASS.

- [ ] **Step 5: Server aggregation query**

In `acc-hot-cache.ts`, add an `includeActivityMix` path. Use a grouped query (`db.accActivity.groupBy({ by: ["userEmail", "projectId", "rawAction"], _count: { _all: true }, _max: { createdAt: true }, where: { userEmail: { not: null }, projectId: { not: null } } })`), map to `RawActivityGroupRow[]`, fold with `foldActivityRows`, then attach `activityMix`/`activityTotal`/`lastActivity` to each `BulkAccProject` in `assembleDcUsers` output (or pass into `assembleDcUsers` as a new optional input map keyed `userId::projectId`). Cache under a distinct id + version key that includes `AccActivity`.

> Decision point for the executor: attach mix in `assembleDcUsers` (preferred — keeps assembly the single composition point) by adding an optional `activityByInstance?: Map<string, InstanceActivity>` to `DcAssemblyInput` and reading it in the `projects.map`. Add a unit test in `dcUserAssembly.test.ts` mirroring B1's pattern.

- [ ] **Step 6: Commit**

```bash
git add lib/acc/activityAggregate.ts lib/acc/activityAggregate.test.ts lib/server/acc-hot-cache.ts lib/acc/acc-types.ts lib/acc/dcUserAssembly.ts lib/acc/dcUserAssembly.test.ts
git commit -m "feat(acc-graph): P5-C AccActivity per-instance aggregation (mix/total/lastActivity)"
```

## Task C2: emit activity columns + read mix/true-recency in the snapshot

**Files:**
- Modify: `graphTables.ts` (columns `activity_mix_json`, `activity_total`, `last_activity`)
- Modify: `featureSnapshot.ts` (SQL + parse JSON + overwrite `activityRecencyBucket` with true last-activity; set `activityMix`/`activityTotal`; finalize `activityTotal` into riskFlags)
- Modify: `interactionTypes.ts` (`activityMix`, `activityTotal`)
- Modify: `AccessAnalysisShell.tsx` (request `includeActivityMix: true`)
- Test: `graphTables.test.ts`, `featureSnapshot.test.ts`

- [ ] **Step 1: graphTables — column for the mix**

Store the mix as a JSON string column (Arrow LIST/STRUCT typing is fussy — mirror `module_weights_json` in dataLayer.ts:145):

```typescript
        activity_mix_json: JSON.stringify(project.activityMix ?? {}),
        activity_total: project.activityTotal ?? 0,
        last_activity: timestampMillis(project.lastActivity ?? null),
```

Test: a project with `activityMix: { view: 3 }` yields `JSON.parse(row.activity_mix_json).view === 3`.

- [ ] **Step 2: featureSnapshot — read + finalize**

`RawFeatureRow`: `activity_mix_json: string | null`, `activity_total: bigint|number|null`, `last_activity: bigint|number|null`. SQL: `ANY_VALUE(up.activity_mix_json) AS activity_mix_json`, etc. Mapping:

```typescript
    const activityMix = ((): NodeFeatureSnapshot["activityMix"] => {
      try { return r.activity_mix_json ? JSON.parse(r.activity_mix_json) : {}; }
      catch { return {}; }
    })();
    const activityTotal = Number(r.activity_total ?? 0);
    const lastActivityMs =
      r.last_activity === null || r.last_activity === undefined ? null : Number(r.last_activity);
    const lastActivityDays =
      lastActivityMs === null ? null : Math.floor((Date.now() - lastActivityMs) / 86_400_000);
```

object literal:

```typescript
      activityMix,
      activityTotal,
      // P5-C: TRUE last-activity recency overrides the Phase-B sign-in proxy when present.
      activityRecencyBucket: lastActivityMs !== null
        ? bucketRecency(lastActivityDays)
        : bucketRecency(instanceRecencyDays),
```

Update `riskFlags` local to pass `activityTotal` (real value now). `fallback()`: `activityMix: {}`, `activityTotal: 0`.

- [ ] **Step 3: Shell** — extend the query input to `{ includePermissionSummary: true, includeActivityMix: true }`.

- [ ] **Step 4: Tests + run**

`featureSnapshot.test.ts`: row with `activity_mix_json: '{"view":5,"upload":2}'`, `activity_total: 7`, recent `last_activity` → `activityMix.view === 5`, `activityTotal === 7`, `activityRecencyBucket === "0-7d"`. Plus a `highActivityHighPerm` risk test (`activity_total: 200, perm_strength: 5`).

Run: `npm run test:unit && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/graphTables.ts" "app/(dashboard)/users/access-analysis/featureSnapshot.ts" "app/(dashboard)/users/access-analysis/interactionTypes.ts" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts" "app/(dashboard)/users/access-analysis/graphTables.test.ts"
git commit -m "feat(acc-graph): P5-C activityMix + true last-activity recency in snapshot"
```

---

# Phase D — Finalize risk primitives

By Phase D, `permissionStrength`, `folderBreadth`, and `activityTotal` are real, so `computeRiskFlags` already produces all five primitives correctly (the Phase A/B/C tasks fed them in as they became available). Phase D is a verification + documentation pass, not new derivation.

## Task D1: end-to-end risk primitive test + audit

**Files:**
- Test: `app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts`

- [ ] **Step 1: Write a comprehensive multi-flag test**

```typescript
describe("buildFeatureSnapshot — P5-D full risk primitives", () => {
  it("an external full-controller admin with high activity trips multiple primitives", async () => {
    const recent = Date.now() - 2 * 86_400_000;
    mockRows = [makeRow({
      user_id: "u", project_id: "p", email: "x@gmail.com",
      is_project_admin: true, account_status: "active",
      perm_strength: 5, folder_breadth: 40, full_controller: true,
      activity_total: 250, last_activity: BigInt(recent),
    })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.riskFlags!.externalHighPerm).toBe(true);
    expect(f!.riskFlags!.externalProjectAdmin).toBe(true);
    expect(f!.riskFlags!.broadFolderAccess).toBe(true);
    expect(f!.riskFlags!.highActivityHighPerm).toBe(true);
    expect(f!.riskScore).toBeGreaterThanOrEqual(4);
  });

  it("an internal low-access recent user trips nothing (riskScore 0)", async () => {
    mockRows = [makeRow({ user_id: "u", project_id: "p", email: "a@hermosillo.com", perm_strength: 1 })];
    const [f] = await buildFeatureSnapshot({ nodeIds: ["u::p"] });
    expect(f!.riskScore).toBe(0);
  });
});
```

- [ ] **Step 2: Run** → `npm run test:unit` → PASS.

- [ ] **Step 3: Final gates**

Run: `npm run test:unit && npm run typecheck && npm run test:e2e`
Expected: unit (all green incl. new), typecheck clean, e2e 19/19.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/__tests__/featureSnapshot.test.ts"
git commit -m "test(acc-graph): P5-D end-to-end risk primitive coverage"
```

---

## Test Strategy Summary

| Layer | File(s) | What it proves |
|-------|---------|----------------|
| Pure derivation | `moduleFlags.test.ts`, `riskFlags.test.ts`, `activityAggregate.test.ts` | Field math is correct in isolation, no IO |
| Assembly | `dcUserAssembly.test.ts` | DB rows → `BulkAccProject` carry (dates, permission summary, activity mix); summary mode never ships raw contexts |
| Router/cache | `acc-dc-graph.test.ts`, `acc-hot-cache.test.ts` | New `select`s + flags reach `assembleDcUsers`; cache keys vary by flag |
| Arrow feed | `graphTables.test.ts` | New columns emitted with correct types (nullable numerics, JSON strings) |
| Snapshot | `featureSnapshot.test.ts` (mocked DuckDB) | SQL columns → typed snapshot fields; bucketers; fallback defaults for every new field; risk composition |
| Integration | `npm run test:e2e` | Enriched feed still loads the graph; node count unchanged; no UI regression |

**Bucketer boundary tests** are mandatory (the existing suite tests `bucketActivity`/`bucketSignin` boundaries exactly — match that rigor for `bucketMembership`/`bucketRecency`).

**Negative assertions** (per project convention — see "verify negative cases" memory): every phase asserts the **fallback** path sets safe defaults, and Phase B asserts the permission **summary mode does NOT ship raw `permissionContexts`**.

---

## Self-Review Notes (author's pass)

- **Spec coverage:** all 7 requested fields have tasks — module flags (A1/A3), riskScore primitives (A2/A3 partial → D1 full), membershipAge/addedOn (B1-B4), activityMix (C1-C2), activityRecency (B4 proxy → C2 true), permissionStrength (B5-B7), permissionTypeSummary (B5-B7). The required per-field analysis (source, availability, graphTables/router/client-side) is the Field-by-Field table.
- **Node = UserProjectInstance:** preserved everywhere; every new column is per (user,project) and keyed `userId::projectId`.
- **Type consistency:** `permTierStrength`/`TIER_RANK` mirror `normalizePermTier`; `bucketMembership`/`bucketRecency` mirror the existing `bucketActivity`/`bucketSignin` signatures; `computeRiskFlags` input shape is stable across phases (zero-defaults in A, real values in B/C).
- **Constraint check:** no new `DIMENSION_REGISTRY` entries, no slider/weights/targets, no edges, no renderer/lasso/camera/nav/`UserDetailPanel` changes. The only runtime behavior change is the shell query input (B7/C2), gated to data-only.
- **Placeholder scan:** the two intentionally abbreviated tasks (B6 router internals, C1 step 5 query) describe the exact Prisma calls and cache-key changes but defer the boilerplate to the executor because they must match this repo's existing `makeDb`/`cached`/`dbVersion` helpers verbatim — the executor reads those helpers and mirrors them. All field math and snapshot wiring is given as complete code.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-22-p5-snapshot-enrichment-advanced-dimensions.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Given the verify-after-subagents memory, run a `git diff --stat` scope check after each task.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

**Recommended slicing:** ship **Phase A → B → D** as the first P5 PR, then **Phase C** (AccActivity) as its own follow-up so its large-table aggregation gets a dedicated performance review.

Which approach?
