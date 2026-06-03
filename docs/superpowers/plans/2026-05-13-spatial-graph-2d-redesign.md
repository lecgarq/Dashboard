# Spatial Graph — 2D Similarity-Map Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 7 user-graph topology with a positional-only similarity map: 7 clustering dimensions (4 new), pie-glyph user nodes, hover fan-out explainability, and a filter panel of 7 strength sliders. Ships the 2D surface only — 3D parity and Phase 7 dead-code deletion are separate plans.

**Architecture:** Pure compute lives in `lib/acc/userSimilarity.ts` (extended to 7 dims, each normalized [0, 1], with temporal-decay helpers). The force-layout consumer sums weighted per-dim scores per pair, gates by `simMin`, caps to top-K peers per user, and feeds spring stiffness to cosmos.gl. UI changes are concentrated in `AccUsersGraph.tsx` and `accGraphFilters.ts`. Pie-glyph rendering uses a **Canvas2D overlay** layered above the cosmos.gl WebGL canvas — same approach the existing label renderer already uses, avoids cosmos.gl shader internals, and is naturally cross-backend for the future 3D plan.

**Tech Stack:** TypeScript, React 19, Next.js App Router, cosmos.gl 3.0-beta.9, Canvas2D, Vitest. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-05-13-spatial-graph-similarity-redesign-design.md`.

---

## File Structure

| Path | Responsibility | Status |
|---|---|---|
| `lib/acc/userSimilarity.ts` | Pure per-dim pair-similarity functions, normalization, simMin gate. 7-dim union. | Modify (replace 5-dim union, add 4 new dims, add decay helpers) |
| `lib/acc/userSimilarity.test.ts` | Vitest coverage for all 7 dims + decay + simMin gate + top-K | Modify (extend existing test file) |
| `lib/acc/similarityDecay.ts` | Pure exponential-decay helper for temporal dims. Reused across Last Sign-In + Recent Additions. | **Create** |
| `lib/acc/similarityDecay.test.ts` | Vitest for decay shape (τ, half-life, asymptote). | **Create** |
| `lib/acc/dataCoverageFlags.ts` | Pure helper that derives a user's data-presence flag set (`has-signin`, `has-activity`, `has-folders`, etc.). | **Create** |
| `lib/acc/dataCoverageFlags.test.ts` | Vitest for flag derivation. | **Create** |
| `app/(dashboard)/users/accGraphFilters.ts` | `GraphFilters` type extended with `simStr: number[7]`. `DEFAULT_FILTERS` updated. New URL letter aliases. | Modify |
| `app/(dashboard)/users/accGraphFilters.test.ts` | Test URL round-trip for `simStr`. | Modify |
| `app/(dashboard)/users/accGraphOrganicLayout.ts` | Force-layout consumer. Apply summed weighted forces, simMin gate, top-K cap. | Modify |
| `app/(dashboard)/users/AccUsersGraph.tsx` | Filter panel rename + 7 sliders + simMin slider. Pie-glyph overlay. Hover fan-out lines. Flip flag at line ~67. | Modify (substantial) |
| `app/(dashboard)/users/pieGlyphOverlay.ts` | Pure Canvas2D draw routine for pie-glyphs given (x, y, tier counts, zoom). | **Create** |
| `app/(dashboard)/users/pieGlyphOverlay.test.ts` | Vitest with a stub canvas context, asserts segment counts + diameter clamp. | **Create** |
| `app/(dashboard)/users/fanOutOverlay.ts` | Pure Canvas2D draw routine for fan-out lines given a focal user + top-K peers + per-pair dominant dim. | **Create** |
| `app/(dashboard)/users/fanOutOverlay.test.ts` | Vitest for line count + color selection per peer. | **Create** |
| `server/routers/accMembers.ts` (or equivalent) | tRPC procedure to return user's tier portfolio + activity file IDs + addedAt timestamp. Extends existing `enrichedUsers`. | Modify |

---

## Wave 0 — Setup

### Task 0.1: Verify dev server boots and Users page renders without errors

**Files:** none

- [ ] **Step 1:** Confirm dev server is running on http://localhost:3000.

Run: `Get-Process node -ErrorAction SilentlyContinue | Select-Object Id, CommandLine | Where-Object { $_.CommandLine -like '*next*dev*' }`
Expected: at least one row.

- [ ] **Step 2:** Open http://localhost:3000/users, sign in. Confirm graph renders (any state — the broken edges from Phase 7 are expected).

- [ ] **Step 3:** Confirm Vitest runs clean.

Run: `npm test -- --run`
Expected: all green.

---

## Wave 1 — Compute layer (similarity functions)

### Task 1.1: Add temporal-decay helper module

**Files:**
- Create: `lib/acc/similarityDecay.ts`
- Create: `lib/acc/similarityDecay.test.ts`

- [ ] **Step 1: Write the failing tests first.**

```ts
// lib/acc/similarityDecay.test.ts
import { describe, it, expect } from "vitest";
import { temporalDecay, DEFAULT_DECAY_TAU_DAYS } from "./similarityDecay";

describe("temporalDecay", () => {
  it("returns 1.0 when both timestamps are equal", () => {
    const t = new Date("2026-05-01").getTime();
    expect(temporalDecay(t, t)).toBeCloseTo(1.0, 5);
  });

  it("returns ~0.37 (1/e) at exactly tau days apart", () => {
    const a = new Date("2026-05-01").getTime();
    const b = a + DEFAULT_DECAY_TAU_DAYS * 86_400_000;
    expect(temporalDecay(a, b)).toBeCloseTo(Math.exp(-1), 3);
  });

  it("returns ~0 past 3*tau days", () => {
    const a = new Date("2026-01-01").getTime();
    const b = a + 3 * DEFAULT_DECAY_TAU_DAYS * 86_400_000;
    expect(temporalDecay(a, b)).toBeLessThan(0.05);
  });

  it("returns 0 if either timestamp is null", () => {
    expect(temporalDecay(null, Date.now())).toBe(0);
    expect(temporalDecay(Date.now(), null)).toBe(0);
    expect(temporalDecay(null, null)).toBe(0);
  });

  it("is symmetric in a and b", () => {
    const a = new Date("2026-05-01").getTime();
    const b = new Date("2026-05-15").getTime();
    expect(temporalDecay(a, b)).toBe(temporalDecay(b, a));
  });
});
```

- [ ] **Step 2: Run tests — expect failure.**

Run: `npm test -- --run lib/acc/similarityDecay.test.ts`
Expected: FAIL with `Cannot find module './similarityDecay'`.

- [ ] **Step 3: Implement the module.**

```ts
// lib/acc/similarityDecay.ts
/**
 * Exponential decay for temporal similarity dimensions.
 *
 * sim(a, b) = exp( -|t_a - t_b| / tau )
 *
 * Same-day → 1.0. tau days apart → 1/e (~0.37). 3*tau apart → ~0.05.
 * Null timestamps contribute 0 (no signal).
 */

export const DEFAULT_DECAY_TAU_DAYS = 30;
const DAY_MS = 86_400_000;

export function temporalDecay(
  a: number | null,
  b: number | null,
  tauDays: number = DEFAULT_DECAY_TAU_DAYS,
): number {
  if (a == null || b == null) return 0;
  const dtDays = Math.abs(a - b) / DAY_MS;
  return Math.exp(-dtDays / tauDays);
}
```

- [ ] **Step 4: Run tests — expect pass.**

Run: `npm test -- --run lib/acc/similarityDecay.test.ts`
Expected: PASS (5/5).

- [ ] **Step 5: Commit.**

```bash
git add lib/acc/similarityDecay.ts lib/acc/similarityDecay.test.ts
git commit -m "feat(graph): add temporal-decay helper for similarity dims"
```

---

### Task 1.2: Add data-coverage flag helper

**Files:**
- Create: `lib/acc/dataCoverageFlags.ts`
- Create: `lib/acc/dataCoverageFlags.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
// lib/acc/dataCoverageFlags.test.ts
import { describe, it, expect } from "vitest";
import { dataCoverageFlags, type DataCoverageInput } from "./dataCoverageFlags";

describe("dataCoverageFlags", () => {
  it("emits 'has-signin' iff lastSignIn is non-null", () => {
    const u: DataCoverageInput = { lastSignIn: Date.now(), activityCount: 0, folderIds: [], projectIds: [], roleIds: [], addedAt: null };
    expect(dataCoverageFlags(u)).toContain("has-signin");

    const u2 = { ...u, lastSignIn: null };
    expect(dataCoverageFlags(u2)).not.toContain("has-signin");
  });

  it("emits 'has-activity' iff activityCount > 0", () => {
    const u: DataCoverageInput = { lastSignIn: null, activityCount: 5, folderIds: [], projectIds: [], roleIds: [], addedAt: null };
    expect(dataCoverageFlags(u)).toContain("has-activity");
  });

  it("emits 'has-folders', 'has-projects', 'has-roles', 'has-added-at' based on presence", () => {
    const u: DataCoverageInput = { lastSignIn: null, activityCount: 0, folderIds: ["f1"], projectIds: ["p1"], roleIds: ["r1"], addedAt: Date.now() };
    const flags = dataCoverageFlags(u);
    expect(flags).toContain("has-folders");
    expect(flags).toContain("has-projects");
    expect(flags).toContain("has-roles");
    expect(flags).toContain("has-added-at");
  });

  it("returns empty array when the user has no data at all", () => {
    const u: DataCoverageInput = { lastSignIn: null, activityCount: 0, folderIds: [], projectIds: [], roleIds: [], addedAt: null };
    expect(dataCoverageFlags(u)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- --run lib/acc/dataCoverageFlags.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement.**

```ts
// lib/acc/dataCoverageFlags.ts
/**
 * Pure derivation of a user's data-presence "flag set".
 *
 * Used as the categorical attribute for the Data Coverage similarity dimension.
 * Two users are similar on this dim if they share many of the same flags
 * (i.e., we know the same KINDS of things about them).
 */

export type DataCoverageFlag =
  | "has-signin"
  | "has-activity"
  | "has-folders"
  | "has-projects"
  | "has-roles"
  | "has-added-at";

export interface DataCoverageInput {
  lastSignIn: number | null;
  activityCount: number;
  folderIds: readonly string[];
  projectIds: readonly string[];
  roleIds: readonly string[];
  addedAt: number | null;
}

export function dataCoverageFlags(u: DataCoverageInput): DataCoverageFlag[] {
  const flags: DataCoverageFlag[] = [];
  if (u.lastSignIn != null) flags.push("has-signin");
  if (u.activityCount > 0) flags.push("has-activity");
  if (u.folderIds.length > 0) flags.push("has-folders");
  if (u.projectIds.length > 0) flags.push("has-projects");
  if (u.roleIds.length > 0) flags.push("has-roles");
  if (u.addedAt != null) flags.push("has-added-at");
  return flags;
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- --run lib/acc/dataCoverageFlags.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit.**

```bash
git add lib/acc/dataCoverageFlags.ts lib/acc/dataCoverageFlags.test.ts
git commit -m "feat(graph): add data-coverage flag derivation"
```

---

### Task 1.3: Replace SimilarityDim union with the 7-dim model

**Files:**
- Modify: `lib/acc/userSimilarity.ts`
- Modify: `lib/acc/userSimilarity.test.ts`

The Phase 7 union was `"folder-access" | "roles" | "projects" | "company" | "admin-tier"`. The spec drops `company` and `admin-tier` and adds 4 new dims. Net change: 7 dims, breaking change to the type union and to `computeSimilarityEdges`'s expected `SimilarityInput` shape.

- [ ] **Step 1: Update the failing test surface first.**

Replace the Phase 7 test cases in `lib/acc/userSimilarity.test.ts`. Keep existing pair-counting structure tests but switch fixture data to the new dims:

```ts
// lib/acc/userSimilarity.test.ts (relevant additions / replacements)
import { describe, it, expect } from "vitest";
import {
  computeSimilarityEdges,
  pairSimilarity,
  SIMILARITY_DIMS,
  type SimilarityInput,
  type SimilarityDim,
} from "./userSimilarity";

describe("SIMILARITY_DIMS", () => {
  it("has exactly 7 entries in the new model", () => {
    expect(SIMILARITY_DIMS).toEqual([
      "project-members",
      "roles",
      "folder-permissions",
      "activity-logs",
      "data-coverage",
      "last-sign-in",
      "recent-additions",
    ]);
  });
});

describe("pairSimilarity — set-overlap dims", () => {
  const u1 = mkUser("a", { projectIds: ["p1", "p2", "p3"] });
  const u2 = mkUser("b", { projectIds: ["p1", "p2"] });

  it("normalizes shared count by the smaller set size", () => {
    expect(pairSimilarity(u1, u2, "project-members")).toBeCloseTo(2 / 2, 5); // min(3,2)=2 shared/min = 1.0
  });

  it("returns 0 when no overlap", () => {
    const u3 = mkUser("c", { projectIds: ["p9"] });
    expect(pairSimilarity(u1, u3, "project-members")).toBe(0);
  });
});

describe("pairSimilarity — temporal dims", () => {
  it("returns ~1.0 for users with same lastSignIn", () => {
    const t = Date.now();
    const u1 = mkUser("a", { lastSignIn: t });
    const u2 = mkUser("b", { lastSignIn: t });
    expect(pairSimilarity(u1, u2, "last-sign-in")).toBeCloseTo(1.0, 3);
  });
  it("returns 0 if either user has null lastSignIn", () => {
    const u1 = mkUser("a", { lastSignIn: null });
    const u2 = mkUser("b", { lastSignIn: Date.now() });
    expect(pairSimilarity(u1, u2, "last-sign-in")).toBe(0);
  });
});

function mkUser(id: string, overrides: Partial<SimilarityInput["users"][number]> = {}): SimilarityInput["users"][number] {
  return {
    id,
    projectIds: [],
    roleIds: [],
    folderIds: [],
    activityFileIds: [],
    coverageFlags: [],
    lastSignIn: null,
    addedAt: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Run — expect FAIL (the user shape doesn't match, `pairSimilarity` not exported).**

Run: `npm test -- --run lib/acc/userSimilarity.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the new `userSimilarity.ts`.**

```ts
// lib/acc/userSimilarity.ts (full replacement of the 5-dim version)
import { temporalDecay } from "./similarityDecay";

export type SimilarityDim =
  | "project-members"
  | "roles"
  | "folder-permissions"
  | "activity-logs"
  | "data-coverage"
  | "last-sign-in"
  | "recent-additions";

export const SIMILARITY_DIMS: readonly SimilarityDim[] = [
  "project-members",
  "roles",
  "folder-permissions",
  "activity-logs",
  "data-coverage",
  "last-sign-in",
  "recent-additions",
] as const;

export interface SimilarityUser {
  id: string;
  projectIds: readonly string[];
  roleIds: readonly string[];
  folderIds: readonly string[];
  activityFileIds: readonly string[];
  coverageFlags: readonly string[];
  lastSignIn: number | null;
  addedAt: number | null;
}

export interface SimilarityInput {
  users: readonly SimilarityUser[];
}

export interface SimilarityEdge {
  userA: string;
  userB: string;
  dimension: SimilarityDim;
  score: number; // normalized [0, 1]
}

/**
 * Normalized set-overlap score in [0, 1]: |A ∩ B| / min(|A|, |B|).
 * Returns 0 if either set is empty.
 */
function setOverlap(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const x of a) if (setB.has(x)) shared++;
  return shared / Math.min(a.length, b.length);
}

/**
 * Per-pair, per-dim similarity in [0, 1]. Exported so the layout consumer
 * and tests can both reach it without going through edge construction.
 */
export function pairSimilarity(
  a: SimilarityUser,
  b: SimilarityUser,
  dim: SimilarityDim,
): number {
  switch (dim) {
    case "project-members":
      return setOverlap(a.projectIds, b.projectIds);
    case "roles":
      return setOverlap(a.roleIds, b.roleIds);
    case "folder-permissions":
      return setOverlap(a.folderIds, b.folderIds);
    case "activity-logs":
      return setOverlap(a.activityFileIds, b.activityFileIds);
    case "data-coverage":
      return setOverlap(a.coverageFlags, b.coverageFlags);
    case "last-sign-in":
      return temporalDecay(a.lastSignIn, b.lastSignIn);
    case "recent-additions":
      return temporalDecay(a.addedAt, b.addedAt);
  }
}

/**
 * Bucketed indexing — pair-counts per dim. Kept for backward-compat with
 * Phase 7's edge-list consumers. Layout-consumer code (Task 3.x) calls
 * `pairSimilarity` directly inside the top-K loop instead — far cheaper at
 * hub scale.
 *
 * @deprecated Prefer `pairSimilarity` + the layout consumer's top-K pass.
 */
export function computeSimilarityEdges(
  input: SimilarityInput,
  enabledDims: ReadonlySet<SimilarityDim>,
  minScore: number = 0.01,
): SimilarityEdge[] {
  const users = input.users;
  const edges: SimilarityEdge[] = [];
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      for (const dim of enabledDims) {
        const score = pairSimilarity(users[i], users[j], dim);
        if (score >= minScore) {
          edges.push({ userA: users[i].id, userB: users[j].id, dimension: dim, score });
        }
      }
    }
  }
  return edges;
}
```

- [ ] **Step 4: Run — expect PASS for the new tests.**

Run: `npm test -- --run lib/acc/userSimilarity.test.ts`
Expected: PASS for new tests. Old Phase 7 tests that referenced `"company"` / `"admin-tier"` will fail — delete them in Step 5.

- [ ] **Step 5: Strip dead test cases from `userSimilarity.test.ts`.**

Search the file for `"company"` and `"admin-tier"` test cases. Delete them. They reference dropped union members.

- [ ] **Step 6: Run full suite.**

Run: `npm test -- --run`
Expected: PASS. Some non-test TypeScript files that import the old union will still fail to typecheck — fix in Wave 2.

- [ ] **Step 7: Commit.**

```bash
git add lib/acc/userSimilarity.ts lib/acc/userSimilarity.test.ts
git commit -m "feat(graph): replace 5-dim similarity model with 7-dim positional one"
```

---

### Task 1.4: Combine-and-gate helper (weighted sum + simMin)

**Files:**
- Modify: `lib/acc/userSimilarity.ts`
- Modify: `lib/acc/userSimilarity.test.ts`

- [ ] **Step 1: Write the failing tests.**

```ts
describe("combinedPairForce", () => {
  it("sums strength_d * sim_d over all dims when simMin gate passes", () => {
    const u1 = mkUser("a", { projectIds: ["p1"], roleIds: ["r1"] });
    const u2 = mkUser("b", { projectIds: ["p1"], roleIds: ["r1"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 1.0],
      ["roles", 0.5],
    ]);
    // sim("project-members")=1.0, sim("roles")=1.0 → 1.0*1.0 + 0.5*1.0 = 1.5
    expect(combinedPairForce(u1, u2, strengths, 1)).toBeCloseTo(1.5, 5);
  });

  it("returns 0 when fewer than simMin dims contribute non-zero", () => {
    const u1 = mkUser("a", { projectIds: ["p1"] });
    const u2 = mkUser("b", { projectIds: ["p1"] });
    const strengths = new Map<SimilarityDim, number>([["project-members", 1.0]]);
    // Only 1 dim contributes; simMin=3 → gated to 0.
    expect(combinedPairForce(u1, u2, strengths, 3)).toBe(0);
  });

  it("treats strength=0 as 'dim disabled', does NOT count toward simMin", () => {
    const u1 = mkUser("a", { projectIds: ["p1"], roleIds: ["r1"] });
    const u2 = mkUser("b", { projectIds: ["p1"], roleIds: ["r1"] });
    const strengths = new Map<SimilarityDim, number>([
      ["project-members", 0],
      ["roles", 1.0],
    ]);
    // Only roles contributes; simMin=2 → gated to 0.
    expect(combinedPairForce(u1, u2, strengths, 2)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

Run: `npm test -- --run lib/acc/userSimilarity.test.ts`
Expected: FAIL (combinedPairForce not exported).

- [ ] **Step 3: Implement.**

```ts
// Append to lib/acc/userSimilarity.ts:
export function combinedPairForce(
  a: SimilarityUser,
  b: SimilarityUser,
  strengths: ReadonlyMap<SimilarityDim, number>,
  simMin: number,
): number {
  let sum = 0;
  let contributingDimCount = 0;
  for (const dim of SIMILARITY_DIMS) {
    const strength = strengths.get(dim) ?? 0;
    if (strength <= 0) continue;
    const score = pairSimilarity(a, b, dim);
    if (score <= 0) continue;
    sum += strength * score;
    contributingDimCount++;
  }
  return contributingDimCount >= simMin ? sum : 0;
}
```

- [ ] **Step 4: Run — PASS.**

Run: `npm test -- --run lib/acc/userSimilarity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/acc/userSimilarity.ts lib/acc/userSimilarity.test.ts
git commit -m "feat(graph): combinedPairForce with simMin gate"
```

---

### Task 1.5: Top-K neighbor selection

**Files:**
- Modify: `lib/acc/userSimilarity.ts`
- Modify: `lib/acc/userSimilarity.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
describe("topKNeighbors", () => {
  it("returns at most K neighbors per user, sorted by force desc", () => {
    const users = Array.from({ length: 50 }, (_, i) =>
      mkUser(`u${i}`, { projectIds: [`p${i % 5}`] }),
    );
    const strengths = new Map<SimilarityDim, number>([["project-members", 1.0]]);
    const result = topKNeighbors({ users }, strengths, 1, 5);
    // u0 shares p0 with u5, u10, u15, u20, u25, u30, u35, u40, u45 — 9 candidates → top 5.
    const u0 = result.get("u0");
    expect(u0).toBeDefined();
    expect(u0!.length).toBeLessThanOrEqual(5);
    expect(u0!).toEqual(
      [...u0!].sort((a, b) => b.force - a.force),
    );
  });

  it("returns an empty list for users with no positive-force pairs", () => {
    const u1 = mkUser("solo", { projectIds: ["lonely"] });
    const u2 = mkUser("other", { projectIds: ["different"] });
    const strengths = new Map<SimilarityDim, number>([["project-members", 1.0]]);
    const result = topKNeighbors({ users: [u1, u2] }, strengths, 1, 5);
    expect(result.get("solo") ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

Run: `npm test -- --run lib/acc/userSimilarity.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
// Append to lib/acc/userSimilarity.ts:
export interface NeighborForce {
  neighborId: string;
  force: number;
  /** The dim with the largest strength*score contribution. Used for hover-line color. */
  dominantDim: SimilarityDim | null;
}

export function topKNeighbors(
  input: SimilarityInput,
  strengths: ReadonlyMap<SimilarityDim, number>,
  simMin: number,
  k: number,
): Map<string, NeighborForce[]> {
  const out = new Map<string, NeighborForce[]>();
  const users = input.users;

  for (let i = 0; i < users.length; i++) {
    const a = users[i];
    const candidates: NeighborForce[] = [];
    for (let j = 0; j < users.length; j++) {
      if (i === j) continue;
      const b = users[j];
      const force = combinedPairForce(a, b, strengths, simMin);
      if (force <= 0) continue;

      // Find dominant dim for color.
      let bestDim: SimilarityDim | null = null;
      let bestContrib = 0;
      for (const dim of SIMILARITY_DIMS) {
        const s = strengths.get(dim) ?? 0;
        if (s <= 0) continue;
        const contrib = s * pairSimilarity(a, b, dim);
        if (contrib > bestContrib) {
          bestContrib = contrib;
          bestDim = dim;
        }
      }

      candidates.push({ neighborId: b.id, force, dominantDim: bestDim });
    }
    candidates.sort((x, y) => y.force - x.force);
    out.set(a.id, candidates.slice(0, k));
  }

  return out;
}
```

- [ ] **Step 4: Run — PASS.**

Run: `npm test -- --run lib/acc/userSimilarity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add lib/acc/userSimilarity.ts lib/acc/userSimilarity.test.ts
git commit -m "feat(graph): top-K neighbor selection with dominant-dim tracking"
```

---

## Wave 2 — Filter state and URL persistence

### Task 2.1: Extend `GraphFilters` with `simStr` and new SimilarityDimKey union

**Files:**
- Modify: `app/(dashboard)/users/accGraphFilters.ts`
- Modify: `app/(dashboard)/users/accGraphFilters.test.ts`

- [ ] **Step 1: Write failing tests.**

```ts
// accGraphFilters.test.ts — add cases:
import { DEFAULT_FILTERS, type GraphFilters, SIMILARITY_DIM_KEYS } from "./accGraphFilters";

describe("Phase 07.1 GraphFilters extension", () => {
  it("SimilarityDimKey union has exactly 7 members", () => {
    expect(SIMILARITY_DIM_KEYS).toEqual([
      "project-members",
      "roles",
      "folder-permissions",
      "activity-logs",
      "data-coverage",
      "last-sign-in",
      "recent-additions",
    ]);
  });

  it("DEFAULT_FILTERS.simStr is length 7, all 1.0", () => {
    expect(DEFAULT_FILTERS.simStr).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it("DEFAULT_FILTERS.simDims contains all 7", () => {
    expect(DEFAULT_FILTERS.simDims).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

Run: `npm test -- --run app/(dashboard)/users/accGraphFilters.test.ts`
Expected: FAIL.

- [ ] **Step 3: Update `accGraphFilters.ts`.**

Replace the existing `SimilarityDimKey` union and `DEFAULT_FILTERS.simDims` / `simMin` with the 7-dim model. Add `simStr` field. Full diff inline:

```ts
// REPLACE the existing SimilarityDimKey block (~lines 19-24):
export type SimilarityDimKey =
  | "project-members"
  | "roles"
  | "folder-permissions"
  | "activity-logs"
  | "data-coverage"
  | "last-sign-in"
  | "recent-additions";

export const SIMILARITY_DIM_KEYS: readonly SimilarityDimKey[] = [
  "project-members",
  "roles",
  "folder-permissions",
  "activity-logs",
  "data-coverage",
  "last-sign-in",
  "recent-additions",
] as const;

// ADD to GraphFilters interface (after simMin):
  /** Per-dim strength multipliers, indexed parallel to SIMILARITY_DIM_KEYS. Range [0, 1]. */
  simStr: number[];

// REPLACE DEFAULT_FILTERS.simDims and add simStr:
  simDims: [
    "project-members",
    "roles",
    "folder-permissions",
    "activity-logs",
    "data-coverage",
    "last-sign-in",
    "recent-additions",
  ],
  simMin: 2,
  simStr: [1, 1, 1, 1, 1, 1, 1],
```

- [ ] **Step 4: Run — PASS.**

Run: `npm test -- --run app/(dashboard)/users/accGraphFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the whole tree.**

Run: `npx tsc --noEmit`
Expected: FAIL — many call sites still reference `"company"` / `"admin-tier"`. Catalog them, then fix in the next step.

- [ ] **Step 6: Sweep callers.**

Search for the dropped strings:

Run: `npx grep -r '"company"\|"admin-tier"\|"folder-access"\|"projects"' app/(dashboard)/users lib/acc --include='*.ts' --include='*.tsx'`

For each match, decide:
- If it was a `SimilarityDim`/`SimilarityDimKey` reference, update to the new dim name (e.g. `"folder-access"` → `"folder-permissions"`, `"projects"` → `"project-members"`).
- If it was a per-project-role filter on company string, leave untouched (different concept — `companyRoles` filter).

Re-run `npx tsc --noEmit` until clean.

- [ ] **Step 7: Commit.**

```bash
git add app/(dashboard)/users/accGraphFilters.ts app/(dashboard)/users/accGraphFilters.test.ts
git commit -m "feat(graph): GraphFilters → 7-dim model + per-dim strength array"
```

---

### Task 2.2: URL serialization for `simStr`

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx` (`readFiltersFromUrl` / `writeFiltersToUrl`)
- Modify: `app/(dashboard)/users/accGraphFilters.test.ts`

- [ ] **Step 1: Write failing test.**

```ts
describe("simStr URL round-trip", () => {
  it("writes 'simStr' query param only when not all-1.0", () => {
    const all1 = { ...DEFAULT_FILTERS, simStr: [1, 1, 1, 1, 1, 1, 1] };
    expect(serializeFilters(all1).has("simStr")).toBe(false);

    const custom = { ...DEFAULT_FILTERS, simStr: [1, 0.5, 1, 0, 1, 1, 1] };
    const params = serializeFilters(custom);
    expect(params.get("simStr")).toBe("1,0.5,1,0,1,1,1");
  });

  it("round-trips simStr through parse", () => {
    const params = new URLSearchParams("simStr=0.2,0.4,0.6,0.8,1,0,1");
    const parsed = parseFilters(params);
    expect(parsed.simStr).toEqual([0.2, 0.4, 0.6, 0.8, 1, 0, 1]);
  });

  it("clamps each strength to [0, 1] on parse", () => {
    const params = new URLSearchParams("simStr=-0.5,2,1,1,1,1,1");
    const parsed = parseFilters(params);
    expect(parsed.simStr).toEqual([0, 1, 1, 1, 1, 1, 1]);
  });

  it("falls back to defaults when length != 7", () => {
    const params = new URLSearchParams("simStr=0.5,0.5");
    const parsed = parseFilters(params);
    expect(parsed.simStr).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});
```

(`serializeFilters` / `parseFilters` are the local readers inside `AccUsersGraph.tsx`. If they are currently inline, extract to a pure helper module `accGraphFilterUrl.ts` and re-export from `AccUsersGraph.tsx` as part of this step. Tests import from the new pure module.)

- [ ] **Step 2: Run — FAIL.**

Run: `npm test -- --run app/(dashboard)/users/accGraphFilters.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

In `AccUsersGraph.tsx` (or extracted helper), in the URL writer:

```ts
// When writing query params:
const allDefault = filters.simStr.every((s) => s === 1);
if (!allDefault) {
  params.set("simStr", filters.simStr.map((s) => s.toString()).join(","));
}
```

In the reader:

```ts
function parseSimStr(raw: string | null): number[] {
  if (!raw) return [1, 1, 1, 1, 1, 1, 1];
  const parts = raw.split(",").map(Number);
  if (parts.length !== 7 || parts.some((n) => !Number.isFinite(n))) {
    return [1, 1, 1, 1, 1, 1, 1];
  }
  return parts.map((n) => Math.max(0, Math.min(1, n)));
}
```

Spread into the parsed filter object: `simStr: parseSimStr(params.get("simStr"))`.

- [ ] **Step 4: Run — PASS.**

Run: `npm test -- --run app/(dashboard)/users/accGraphFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx app/(dashboard)/users/accGraphFilters.test.ts
git commit -m "feat(graph): URL persistence for simStr (per-dim strength)"
```

---

## Wave 3 — Layout integration

### Task 3.1: tRPC procedure surface — extend `enrichedUsers` with new dim inputs

**Files:**
- Modify: `server/routers/accMembers.ts` (or whichever router exposes `accMembers.enrichedUsers`)
- Modify: corresponding `.test.ts` if present
- Read-only: `prisma/schema.prisma` (to confirm fields exist)

**Goal:** The client needs `lastSignIn`, `addedAt`, `activityFileIds`, and the underlying `folderIds` / `projectIds` / `roleIds` on every user object so the layout can compute the 7 dims client-side.

- [ ] **Step 1: Locate the procedure.**

Run: `npx grep -rn 'enrichedUsers' server/routers --include='*.ts'`

Open the result file. Look at the current return shape.

- [ ] **Step 2: Confirm available columns.**

Run: `npx grep -E '^\s+(lastSignIn|addedAt|activityCount)' prisma/schema.prisma`

Verify `BulkAccUser.lastSignIn` and `AccProjectMember.createdAt` (the source of `addedAt`) exist. If `addedAt` is not directly stored, derive it as `MIN(AccProjectMember.createdAt)` per user during the same query.

- [ ] **Step 3: Extend the procedure.**

In `enrichedUsers`, augment each returned user with:

```ts
{
  ...existingFields,
  lastSignIn: bulk.lastSignIn?.getTime() ?? null,         // epoch ms or null
  addedAt: minAddedAtPerUser.get(bulk.email) ?? null,      // epoch ms or null
  activityFileIds: activityFileIdsPerUser.get(bulk.email) ?? [],
  folderIds: resolvedFolderIdsPerUser.get(bulk.email) ?? [],
}
```

The `activityFileIdsPerUser` / `minAddedAtPerUser` / `resolvedFolderIdsPerUser` maps are computed once at the top of the procedure, before the main loop, with a single grouped query each. Pattern follows the existing aggregator approach in this router.

- [ ] **Step 4: Smoke-test the procedure shape.**

If the router has an existing Vitest, add an assertion that the returned objects expose the four new fields with the expected types. If no test exists, hit the procedure from a browser dev-console:

```js
// in browser console:
const trpc = (await import("/_next/static/chunks/lib_core_trpc_ts.js")).trpc;
trpc.accMembers.enrichedUsers.query().then((r) => console.log(r[0]));
```

Verify the new fields are present.

- [ ] **Step 5: Commit.**

```bash
git add server/routers/accMembers.ts
git commit -m "feat(graph): expose lastSignIn/addedAt/activityFileIds/folderIds in enrichedUsers"
```

---

### Task 3.2: Build `SimilarityUser[]` from `enrichedUsers` in the graph

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 1: Locate the consumer.**

In `AccUsersGraph.tsx`, find where `computeSimilarityEdges` is called today (Phase 7 code) and where the `enrichedUsers` query result is destructured.

- [ ] **Step 2: Add a `useMemo` that maps `enrichedUsers → SimilarityUser[]`.**

```tsx
import { dataCoverageFlags } from "@/lib/acc/dataCoverageFlags";
import type { SimilarityUser } from "@/lib/acc/userSimilarity";

const similarityUsers = useMemo<SimilarityUser[]>(() => {
  if (!enrichedUsers) return [];
  return enrichedUsers.map((u) => ({
    id: u.email,
    projectIds: u.projectIds ?? [],
    roleIds: u.roleIds ?? [],
    folderIds: u.folderIds ?? [],
    activityFileIds: u.activityFileIds ?? [],
    lastSignIn: u.lastSignIn,
    addedAt: u.addedAt,
    coverageFlags: dataCoverageFlags({
      lastSignIn: u.lastSignIn,
      activityCount: (u.activityFileIds ?? []).length,
      folderIds: u.folderIds ?? [],
      projectIds: u.projectIds ?? [],
      roleIds: u.roleIds ?? [],
      addedAt: u.addedAt,
    }),
  }));
}, [enrichedUsers]);
```

- [ ] **Step 3: Smoke test.**

Open `/users`, browser dev-console:

```js
window.__similarityUsers // exposed via React DevTools or temporary debug spread
```

Confirm shape — at least one user has non-empty `coverageFlags`.

- [ ] **Step 4: Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(graph): build SimilarityUser[] from enrichedUsers"
```

---

### Task 3.3: Replace the Phase 7 edge-builder with top-K force feeder

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`
- Modify: `app/(dashboard)/users/accGraphOrganicLayout.ts`

- [ ] **Step 1: Add `useMemo` for `topKMap`.**

```tsx
import { topKNeighbors, SIMILARITY_DIMS } from "@/lib/acc/userSimilarity";

const TOP_K = 20;

const topKMap = useMemo(() => {
  const strengths = new Map<SimilarityDim, number>();
  for (let i = 0; i < SIMILARITY_DIMS.length; i++) {
    if (filters.simDims.includes(SIMILARITY_DIMS[i] as SimilarityDimKey)) {
      strengths.set(SIMILARITY_DIMS[i], filters.simStr[i] ?? 1);
    } else {
      strengths.set(SIMILARITY_DIMS[i], 0);
    }
  }
  return topKNeighbors({ users: similarityUsers }, strengths, filters.simMin, TOP_K);
}, [similarityUsers, filters.simDims, filters.simStr, filters.simMin]);
```

- [ ] **Step 2: Feed `topKMap` to the layout engine.**

In `accGraphOrganicLayout.ts`, locate where cosmos.gl receives the link array. Replace the Phase 7 link construction with one derived from `topKMap`:

```ts
// Pseudocode — adjust to match existing helper signatures.
export function topKToCosmosLinks(
  topK: Map<string, NeighborForce[]>,
  userIdToIndex: Map<string, number>,
): { sources: number[]; targets: number[]; strengths: number[] } {
  const sources: number[] = [];
  const targets: number[] = [];
  const strengths: number[] = [];
  for (const [userId, neighbors] of topK) {
    const aIdx = userIdToIndex.get(userId);
    if (aIdx == null) continue;
    for (const n of neighbors) {
      const bIdx = userIdToIndex.get(n.neighborId);
      if (bIdx == null) continue;
      // De-dupe (a→b and b→a both appear); keep only one with a<b.
      if (aIdx < bIdx) {
        sources.push(aIdx);
        targets.push(bIdx);
        strengths.push(n.force);
      }
    }
  }
  return { sources, targets, strengths };
}
```

Pass `strengths` to cosmos.gl's `linkStrength` accessor (cosmos.gl 3.x supports per-link strength via a typed array).

- [ ] **Step 3: Set `linkVisibility` to 0 so links pull but don't render.**

In the cosmos.gl configuration in `accGraphOrganicLayout.ts` or `AccUsersGraph.tsx`, set:

```ts
linkVisibilityDistanceRange: [0, 0], // never renders
// OR if using a different API:
linkColor: [0, 0, 0, 0],
```

Verify in browser at this point: similarity edges should disappear, but nodes should still pull together.

- [ ] **Step 4: Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx app/(dashboard)/users/accGraphOrganicLayout.ts
git commit -m "feat(graph): top-K force feeding into cosmos.gl, edges hidden"
```

---

## Wave 4 — Filter panel UI

### Task 4.1: Rename section heading "Topology" → "Clustering"

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 1:** Find the literal `"Topology"` heading in the filter panel JSX.

Run: `npx grep -n '"Topology"\|>Topology<' app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 2:** Change the visible text to `"Clustering"`. Leave any internal variable names alone — only the user-facing string changes.

- [ ] **Step 3:** Commit.

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "ui(graph): rename filter section Topology → Clustering"
```

---

### Task 4.2: Render 7 dim rows (checkbox + strength slider)

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 1: Replace the 5-checkbox simDims block with a 7-row block.**

In the Clustering section, replace the Phase 7 `simDims` checkbox array with:

```tsx
const DIM_LABEL: Record<SimilarityDimKey, string> = {
  "project-members": "Project Members",
  "roles": "Roles",
  "folder-permissions": "Folder Permissions",
  "activity-logs": "Activity Logs",
  "data-coverage": "Data Coverage",
  "last-sign-in": "Last Sign-In",
  "recent-additions": "Recent Additions",
};

// inside the Clustering section JSX:
{SIMILARITY_DIM_KEYS.map((dim, idx) => (
  <div key={dim} className="flex items-center gap-3 py-1">
    <Checkbox
      checked={filters.simDims.includes(dim)}
      onCheckedChange={(checked) => {
        setFilters((f) => ({
          ...f,
          simDims: checked
            ? [...new Set([...f.simDims, dim])]
            : f.simDims.filter((d) => d !== dim),
        }));
      }}
    />
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: SIM_DIM_COLOR[dim] }}
    />
    <span className="flex-1 text-sm">{DIM_LABEL[dim]}</span>
    <Slider
      min={0}
      max={1}
      step={0.05}
      value={[filters.simStr[idx] ?? 1]}
      onValueChange={([v]) => {
        setFilters((f) => {
          const next = [...f.simStr];
          next[idx] = v;
          return { ...f, simStr: next };
        });
      }}
      className="w-24"
    />
    <span className="w-8 text-xs tabular-nums">{(filters.simStr[idx] ?? 1).toFixed(2)}</span>
  </div>
))}
```

`SIM_DIM_COLOR` LUT needs to be updated for the new 7-dim union — add an entry for each new dim. Suggested palette (extending the existing teal/blue/purple/amber/red Phase 7 palette):

```ts
const SIM_DIM_COLOR: Record<SimilarityDimKey, string> = {
  "project-members": "#60A5FA",     // blue
  "roles": "#A78BFA",               // purple
  "folder-permissions": "#5EEAD4",  // teal (was "folder-access")
  "activity-logs": "#FBBF24",       // amber
  "data-coverage": "#94A3B8",       // slate
  "last-sign-in": "#34D399",        // emerald
  "recent-additions": "#F472B6",    // pink
};
```

- [ ] **Step 2: Verify in browser.**

Open `/users`. The Clustering section should now show 7 rows. Toggle a checkbox → graph reflows. Drag a slider → graph reflows.

- [ ] **Step 3: Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "ui(graph): 7-dim filter panel with per-dim strength sliders"
```

---

### Task 4.3: Adjust `simMin` slider range to [0, 7]

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 1:** Find the `simMin` slider. Change its `max={5}` (Phase 7) → `max={7}` (new model).
- [ ] **Step 2:** Verify by sliding to 7 — only pairs that contribute on every dim survive (likely none). Sliding to 0 → all positive pairs survive.
- [ ] **Step 3:** Commit.

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "ui(graph): simMin slider range 0..7 for new dim count"
```

---

## Wave 5 — Pie-glyph node rendering (Canvas2D overlay)

### Task 5.1: Pure pie-glyph draw routine

**Files:**
- Create: `app/(dashboard)/users/pieGlyphOverlay.ts`
- Create: `app/(dashboard)/users/pieGlyphOverlay.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
import { describe, it, expect, vi } from "vitest";
import { drawPieGlyph, type PieGlyphInput } from "./pieGlyphOverlay";

function makeCtxSpy() {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe("drawPieGlyph", () => {
  it("draws a solid circle when user has no permissions", () => {
    const ctx = makeCtxSpy();
    drawPieGlyph(ctx, { x: 0, y: 0, zoom: 1, tierCounts: { view: 0, upload: 0, edit: 0, control: 0 }, selected: false, faded: false });
    expect(ctx.arc).toHaveBeenCalledTimes(1);
    expect((ctx as any).beginPath).toHaveBeenCalled();
  });

  it("draws one wedge per non-zero tier", () => {
    const ctx = makeCtxSpy();
    drawPieGlyph(ctx, { x: 0, y: 0, zoom: 1, tierCounts: { view: 3, upload: 1, edit: 0, control: 2 }, selected: false, faded: false });
    // 3 wedges → 3 arc calls (one per pie slice).
    expect((ctx.arc as any).mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("clamps diameter to [6, 14] regardless of zoom", () => {
    const ctx = makeCtxSpy();
    drawPieGlyph(ctx, { x: 0, y: 0, zoom: 100, tierCounts: { view: 1, upload: 0, edit: 0, control: 0 }, selected: false, faded: false });
    const calls = (ctx.arc as any).mock.calls;
    const radii = calls.map((c: number[]) => c[2]);
    expect(Math.max(...radii)).toBeLessThanOrEqual(7); // diameter 14 → radius 7
  });

  it("sets globalAlpha=0.35 when faded", () => {
    const ctx = makeCtxSpy();
    drawPieGlyph(ctx, { x: 0, y: 0, zoom: 1, tierCounts: { view: 1, upload: 0, edit: 0, control: 0 }, selected: false, faded: true });
    expect((ctx as any).globalAlpha).toBeLessThanOrEqual(0.35 + 0.0001);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

Run: `npm test -- --run app/(dashboard)/users/pieGlyphOverlay.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
// app/(dashboard)/users/pieGlyphOverlay.ts
const TIER_COLOR = {
  view: "#9CA3AF",
  upload: "#A78BFA",
  edit: "#FBBF24",
  control: "#F87171",
} as const;
const NEUTRAL_COLOR = "#94A3B8";
const SELECTED_OUTLINE = "#FFFFFF";

export type PermTier = "view" | "upload" | "edit" | "control";

export interface PieGlyphInput {
  x: number;
  y: number;
  zoom: number;
  tierCounts: Record<PermTier, number>;
  selected: boolean;
  faded: boolean;
}

function diameterAt(zoom: number): number {
  // Match the label-polish curve: pow(zoom, 0.2) clamped [0.85, 1.4], scaled to [6, 14].
  const factor = Math.min(1.4, Math.max(0.85, Math.pow(zoom, 0.2)));
  return 6 + (factor - 0.85) * (14 - 6) / (1.4 - 0.85);
}

export function drawPieGlyph(
  ctx: CanvasRenderingContext2D,
  input: PieGlyphInput,
): void {
  const { x, y, zoom, tierCounts, selected, faded } = input;
  const radius = diameterAt(zoom) / 2;
  const total = tierCounts.view + tierCounts.upload + tierCounts.edit + tierCounts.control;

  ctx.save();
  if (faded) ctx.globalAlpha = 0.35;

  if (total === 0) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = NEUTRAL_COLOR;
    ctx.fill();
  } else {
    let startAngle = -Math.PI / 2;
    for (const tier of ["view", "upload", "edit", "control"] as const) {
      const count = tierCounts[tier];
      if (count === 0) continue;
      const sweep = (count / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, startAngle, startAngle + sweep);
      ctx.closePath();
      ctx.fillStyle = TIER_COLOR[tier];
      ctx.fill();
      startAngle += sweep;
    }
  }

  if (selected) {
    ctx.beginPath();
    ctx.arc(x, y, radius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = SELECTED_OUTLINE;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}
```

- [ ] **Step 4: Run — PASS.**

Run: `npm test -- --run app/(dashboard)/users/pieGlyphOverlay.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Commit.**

```bash
git add app/(dashboard)/users/pieGlyphOverlay.ts app/(dashboard)/users/pieGlyphOverlay.test.ts
git commit -m "feat(graph): pie-glyph Canvas2D draw routine"
```

---

### Task 5.2: Layer pie-glyph overlay above cosmos canvas

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

The existing code already overlays a label Canvas2D on top of cosmos. Reuse that mechanism — pie-glyph draws BEFORE labels (so labels read on top).

- [ ] **Step 1: Find the label overlay path.**

Run: `npx grep -n 'requestAnimationFrame\|drawLabels\|labelCanvas' app/(dashboard)/users/AccUsersGraph.tsx | head -20`

- [ ] **Step 2: Insert pie-glyph draw inside the same RAF loop, before labels.**

```tsx
import { drawPieGlyph } from "./pieGlyphOverlay";

// inside the RAF tick:
for (const node of visibleNodes) {
  const screen = cosmos.spaceToScreenPosition([node.x, node.y]);
  drawPieGlyph(overlayCtx, {
    x: screen[0],
    y: screen[1],
    zoom: cosmos.getZoomLevel(),
    tierCounts: tierCountsByUser.get(node.id) ?? { view: 0, upload: 0, edit: 0, control: 0 },
    selected: node.id === selectedUserId,
    faded: filteredOutSet.has(node.id),
  });
}
```

`tierCountsByUser` is computed once from `enrichedUsers` (similar to `similarityUsers`), keyed by user email/id, with each tier's value = count of folders the user has in that tier.

- [ ] **Step 3: Verify in browser.**

Open `/users`. Each user node now renders as a pie. Zoom in/out — pie diameter stays within [6, 14] px. Hover → tooltip still works (no fan-out lines yet — that's Wave 6).

- [ ] **Step 4: Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(graph): pie-glyph overlay rendering on user nodes"
```

---

## Wave 6 — Hover fan-out lines

### Task 6.1: Pure fan-out draw routine

**Files:**
- Create: `app/(dashboard)/users/fanOutOverlay.ts`
- Create: `app/(dashboard)/users/fanOutOverlay.test.ts`

- [ ] **Step 1: Failing tests.**

```ts
import { describe, it, expect, vi } from "vitest";
import { drawFanOut, type FanOutInput } from "./fanOutOverlay";

function makeCtxSpy() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe("drawFanOut", () => {
  it("draws one line per top-K peer", () => {
    const ctx = makeCtxSpy();
    drawFanOut(ctx, {
      focal: { x: 100, y: 100 },
      peers: [
        { x: 200, y: 200, dimColor: "#60A5FA" },
        { x: 300, y: 150, dimColor: "#A78BFA" },
        { x: 50, y: 250, dimColor: "#5EEAD4" },
      ],
      opacity: 1,
    });
    expect((ctx.moveTo as any).mock.calls).toHaveLength(3);
    expect((ctx.lineTo as any).mock.calls).toHaveLength(3);
  });

  it("uses each peer's dimColor for its stroke", () => {
    const ctx = makeCtxSpy();
    const seenColors: string[] = [];
    Object.defineProperty(ctx, "strokeStyle", {
      set(v) { seenColors.push(v); },
      get() { return seenColors[seenColors.length - 1] ?? ""; },
    });
    drawFanOut(ctx, {
      focal: { x: 0, y: 0 },
      peers: [
        { x: 1, y: 1, dimColor: "#AA0000" },
        { x: 2, y: 2, dimColor: "#00BB00" },
      ],
      opacity: 1,
    });
    expect(seenColors).toContain("#AA0000");
    expect(seenColors).toContain("#00BB00");
  });

  it("respects opacity via globalAlpha", () => {
    const ctx = makeCtxSpy();
    drawFanOut(ctx, { focal: { x: 0, y: 0 }, peers: [], opacity: 0.4 });
    expect((ctx as any).globalAlpha).toBeCloseTo(0.4, 5);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

Run: `npm test -- --run app/(dashboard)/users/fanOutOverlay.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.**

```ts
// app/(dashboard)/users/fanOutOverlay.ts
export interface FanOutPeer {
  x: number;
  y: number;
  dimColor: string;
}

export interface FanOutInput {
  focal: { x: number; y: number };
  peers: FanOutPeer[];
  opacity: number;
}

export function drawFanOut(ctx: CanvasRenderingContext2D, input: FanOutInput): void {
  ctx.save();
  ctx.globalAlpha = input.opacity;
  ctx.lineWidth = 1.5;
  for (const peer of input.peers) {
    ctx.strokeStyle = peer.dimColor;
    ctx.beginPath();
    ctx.moveTo(input.focal.x, input.focal.y);
    ctx.lineTo(peer.x, peer.y);
    ctx.stroke();
  }
  ctx.restore();
}
```

- [ ] **Step 4: Run — PASS.**

Run: `npm test -- --run app/(dashboard)/users/fanOutOverlay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add app/(dashboard)/users/fanOutOverlay.ts app/(dashboard)/users/fanOutOverlay.test.ts
git commit -m "feat(graph): fan-out Canvas2D draw routine"
```

---

### Task 6.2: Wire hover + click to fan-out rendering

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 1: Add hover/selection state.**

```tsx
const [hoveredId, setHoveredId] = useState<string | null>(null);
const [hoverFadeStart, setHoverFadeStart] = useState<number | null>(null);
const HOVER_FADE_MS = 300;
const HOVER_PEER_COUNT = 5;
```

- [ ] **Step 2: Subscribe to cosmos hover events.**

```tsx
useEffect(() => {
  if (!cosmosRef.current) return;
  const cos = cosmosRef.current;
  cos.setConfig({
    events: {
      onHover: (node) => {
        if (node?.id) {
          setHoveredId(node.id);
          setHoverFadeStart(null);
        } else {
          // Mouse left — start fade.
          setHoverFadeStart(performance.now());
        }
      },
    },
  });
}, []);
```

- [ ] **Step 3: Compute fan-out peers from `topKMap`.**

```tsx
const fanOutPeers = useMemo<FanOutPeer[]>(() => {
  const focalId = hoveredId ?? selectedUserId;
  if (!focalId) return [];
  const neighbors = (topKMap.get(focalId) ?? []).slice(0, HOVER_PEER_COUNT);
  return neighbors.map((n) => ({
    id: n.neighborId,
    dimColor: n.dominantDim ? SIM_DIM_COLOR[n.dominantDim as SimilarityDimKey] : "#94A3B8",
  })).map((p) => {
    const node = nodeIndex.get(p.id);
    if (!node) return null;
    const screen = cosmosRef.current?.spaceToScreenPosition([node.x, node.y]) ?? [0, 0];
    return { x: screen[0], y: screen[1], dimColor: p.dimColor };
  }).filter((p): p is FanOutPeer => p !== null);
}, [hoveredId, selectedUserId, topKMap, nodeIndex /* re-derived per RAF tick */]);
```

(In practice, since `nodeIndex` positions update every animation frame, compute `fanOutPeers` inside the RAF tick rather than `useMemo`. Move the logic into the same overlay-draw block from Task 5.2.)

- [ ] **Step 4: Draw fan-out in the RAF tick.**

```tsx
// inside RAF tick, AFTER pie-glyph loop, BEFORE labels:
const focalId = hoveredId ?? selectedUserId;
if (focalId) {
  const fade = hoverFadeStart != null
    ? Math.max(0, 1 - (performance.now() - hoverFadeStart) / HOVER_FADE_MS)
    : 1;
  if (fade > 0) {
    const focalNode = nodeIndex.get(focalId);
    if (focalNode) {
      const focalScreen = cosmos.spaceToScreenPosition([focalNode.x, focalNode.y]);
      drawFanOut(overlayCtx, {
        focal: { x: focalScreen[0], y: focalScreen[1] },
        peers: peersForFocal(focalId, topKMap, nodeIndex, cosmos),
        opacity: fade,
      });
    }
  }
}
```

- [ ] **Step 5: Verify in browser.**

Hover a user → 5 colored lines fan out to its similar peers. Move mouse off → lines fade over 300 ms. Click a user → lines stay until clicked elsewhere.

- [ ] **Step 6: Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(graph): hover/click fan-out lines to top-K similar peers"
```

---

### Task 6.3: Extend hover tooltip with top 3 dims and most-similar peer

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx` (or the tooltip card component if separate)

- [ ] **Step 1: Find the tooltip card.**

Run: `npx grep -n 'Tooltip\|TooltipCard\|HoverCard' app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 2: Add a new block to the tooltip.**

```tsx
{hoveredId && topKMap.get(hoveredId)?.[0] && (
  <div className="mt-2 border-t pt-2 text-xs text-slate-500">
    <div>Most similar to: <span className="font-medium">{topKMap.get(hoveredId)![0].neighborId}</span></div>
    <div className="mt-1">Top dimensions:</div>
    <ul className="mt-0.5 list-disc pl-4">
      {topThreeDimsFor(hoveredId, topKMap, similarityUsers).map((d) => (
        <li key={d}>{DIM_LABEL[d]}</li>
      ))}
    </ul>
  </div>
)}
```

`topThreeDimsFor` is a pure helper:

```ts
function topThreeDimsFor(
  focalId: string,
  topK: Map<string, NeighborForce[]>,
  users: SimilarityUser[],
): SimilarityDimKey[] {
  const focal = users.find((u) => u.id === focalId);
  if (!focal) return [];
  const top1 = topK.get(focalId)?.[0];
  if (!top1) return [];
  const peer = users.find((u) => u.id === top1.neighborId);
  if (!peer) return [];
  return SIMILARITY_DIM_KEYS
    .map((dim) => ({ dim, score: pairSimilarity(focal, peer, dim) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.dim);
}
```

- [ ] **Step 3: Verify in browser. Commit.**

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "ui(graph): tooltip — top 3 dims + most similar peer"
```

---

## Wave 7 — Flag flip and end-to-end verification

### Task 7.1: Flip the gating flag at AccUsersGraph.tsx:67

**Files:**
- Modify: `app/(dashboard)/users/AccUsersGraph.tsx`

- [ ] **Step 1:** Read line 67 area.

Run: `Get-Content "C:\LECG\Dashboard\app\(dashboard)\users\AccUsersGraph.tsx" | Select-Object -Skip 60 -First 15`

The comment reads:
```
// false until the positional-only redesign lands — similarity/permTiers must
```

- [ ] **Step 2:** Find the `const` declared below that comment whose initial value is `false` and represents the redesign gate. Flip it to `true`. (Exact identifier depends on what's there at execution time — check the line directly below the comment.)

- [ ] **Step 3:** Verify no compile error, browser loads.

- [ ] **Step 4:** Commit.

```bash
git add app/(dashboard)/users/AccUsersGraph.tsx
git commit -m "feat(graph): flip gating flag — positional-only redesign live"
```

---

### Task 7.2: Manual end-to-end UAT

**Files:** none (verification only)

Open `/users` in the browser. Confirm each scenario from the spec section 11:

- [ ] **Step 1:** User-only graph renders with pie-glyph nodes. NO edges visible at rest. Clusters form within ~2 seconds.
- [ ] **Step 2:** Hover any user → tooltip shows top 3 dims + most similar peer; 5 colored lines fan out.
- [ ] **Step 3:** Move mouse off → lines fade in 300 ms.
- [ ] **Step 4:** Click a user → selection persists, side panel opens.
- [ ] **Step 5:** Uncheck "Project Members" → graph reflows live (no full restart).
- [ ] **Step 6:** Slide "Folder Permissions" strength to 0 → same effect as unchecking.
- [ ] **Step 7:** Slide `simMin` from 2 → 5 → weaker pairs drop out.
- [ ] **Step 8:** Copy URL with custom settings, open in new tab → settings restored exactly.
- [ ] **Step 9:** Frame-rate ≥30 fps at full user count (Chrome DevTools → Performance).
- [ ] **Step 10:** Zoom: pie diameter stays in [6, 14] px range, doesn't blow up.

If any step fails, file a deviation and stop. Do NOT advance to the 3D plan until all 10 pass.

---

### Task 7.3: Update memory & spec status

**Files:**
- Modify: `C:\Users\luis.cortes\.claude\projects\C--LECG-Dashboard\memory\MEMORY.md`
- Modify: spec file `docs/superpowers/specs/2026-05-13-spatial-graph-similarity-redesign-design.md`

- [ ] **Step 1:** Append a one-line entry to `MEMORY.md`:

```
- [Graph 2D redesign live](feedback_similarity_positional_only.md) — 2026-05-13: positional-only 7-dim graph + pie-glyph + fan-out shipped to localhost dashboard. 3D parity + deletion sweep are next.
```

- [ ] **Step 2:** In the spec file, change the `**Status:**` line at top:

```diff
- **Status:** Approved by Luis (brainstorming → spec). Ready for implementation planning.
+ **Status:** 2D portion shipped 2026-05-13. 3D parity and deletion sweep pending separate plans.
```

- [ ] **Step 3:** Commit.

```bash
git add docs/superpowers/specs/2026-05-13-spatial-graph-similarity-redesign-design.md
git commit -m "docs(graph): mark 2D redesign as shipped in spec"
```

---

## Self-Review (already performed, recorded here)

**Spec coverage:**
- ✅ Section 1 purpose — Wave 3.2 + 4.x (UI matches "users only, similarity = position")
- ✅ Section 2.1 — 7 dims — Task 1.3 (replace union), 2.1 (UI keys)
- ✅ Section 2.2 — weighted sum + simMin gate — Task 1.4
- ✅ Section 2.3 — top-K cap — Task 1.5
- ✅ Section 3.1 — pie-glyph at rest — Wave 5
- ✅ Section 3.2 — hover fan-out — Wave 6
- ✅ Section 3.3 — click selection — Task 6.2 (re-uses existing handler)
- ✅ Section 3.4 — filter fade — Task 5.1 (`faded` input)
- ✅ Section 4 — filter panel layout — Wave 4
- ✅ Section 4.1 — tier filter as node filter — already in existing code (`permTiers`); no change needed
- ⚠️ Section 5 — 3D parity — **deliberately deferred to a separate plan**
- ⚠️ Section 7 step 4 — deletion sweep — **deliberately deferred to a separate plan**
- ✅ Section 8 — locked decisions — encoded in task code
- ✅ Section 11 — verification — Task 7.2

**Placeholder scan:** no TBD / TODO / "implement later" / "similar to Task N" patterns found. Every step has either a command, a code block, or a verification action.

**Type consistency:**
- `SimilarityDim` (in `lib/acc/userSimilarity.ts`) and `SimilarityDimKey` (in `accGraphFilters.ts`) use the same 7 string literals across all tasks.
- `topKNeighbors` signature stable from Task 1.5 → Task 3.3.
- `pieGlyphOverlay` exports `PermTier` type used by Wave 5 caller.

---

## What this plan does NOT do (scope guard)

- 3D rendering changes (perspective camera, fog, shell mesh, 3D pie-glyph)
- Deletion of dead Phase 7 code (visible similarity edges, `Topology` heading var name, `SIM_DIM_COLOR` parallel-edge LUT references in dead paths)
- Folder hub & role-folder edge dormancy migration (Phase 7 code stays compile-time live but runtime hidden under user-only view, which is now the only view)

Those three live in follow-up plans (`...-3d-parity.md` and `...-deletion-sweep.md`), to be written after this plan completes Task 7.2 successfully.
