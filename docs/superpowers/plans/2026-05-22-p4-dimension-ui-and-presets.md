# P4 — Dimension UI & Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One task = one subagent. Only touch the files listed for that task. Run the task's tests before committing. Stop if any test fails.** This is a PLAN ONLY — do not begin implementation until it is approved.

**Goal:** Surface the dimension registry in the UI as a scalable, grouped, preset-driven control surface — a small *primary* slider group plus *collapsed advanced groups*, presets, and in-sidebar dimension search — so the registry can grow toward 50 dimensions without ever becoming a flat 50-slider wall.

**Architecture:** Keep all decisions data-driven and pure. Three new pure modules describe the UI shape of the registry — `dimensionGroups.ts` (which dims are primary vs advanced, grouped by `family`), `sliderPresets.ts` (named weight profiles), `dimensionSearch.ts` (find-a-dimension filtering) — with zero React/DOM/I/O. `SliderContext` widens its state from the 6 primary ids to the full *slider-capable* set, gains `applyPreset`, and persists which advanced groups are open + the active preset. The sidebar recomposes into a primary group + collapsible advanced groups + a preset bar + a search box. Color modes become registry-derived (any categorical/binary dim is colorable) instead of a hardcoded union. `module` is *promoted* from target-only to a visible advanced slider via the existing registry seam. The physics two-bus model, the renderer, and the layout math are untouched — P4 is purely the control surface over machinery P1–P3 already built.

**Tech Stack:** TypeScript, Vitest + @testing-library/react (component tests), Playwright (e2e), Radix Slider, React client context, Tailwind (zinc dark palette per `feedback_dark_palette_neutral`).

**Backed by:**
- `docs/superpowers/specs/2026-05-21-access-analysis-dimension-taxonomy.md` (§14 weighting, §15 visual-form coverage, family taxonomy)
- `docs/superpowers/plans/2026-05-22-p3-dimension-registry-runtime-integration.md` (the runtime wiring this UI exposes)
- Current surfaces: `SliderContext.tsx`, `SliderSidebar.tsx`, `DimensionSlider.tsx`, `Toolbar.tsx`, `nodeColors.ts`, `dimensionRegistry.ts`

---

## Scope guardrails

**In scope:** primary slider group; collapsible advanced slider groups (by `family`); named presets (apply-all weight profiles) + reset; in-sidebar dimension search/filter; promoting `module` to a visible advanced slider; registry-derived color modes; persistence of group-open + active-preset state; the test strategy (unit + component + drift-guard + e2e).

**Preserve:** node = `userId::projectId`; the two-bus model (PHYSICS sliders vs MASK filters/search/selection — sliders reheat, masks never do); `createPhysicsLayer`'s registry-driven target/weight path (P3); the UAT-approved organic default profile (it becomes the default *preset*); `localStorage` key `lecg.access-analysis.controls.v1` and its shared blob shape (additive keys only); the rAF-coalesced slider→physics push; the zinc dark palette.

**Do NOT touch (hard constraints from the P4 brief):** lasso · camera · nav/routes · `UserDetailPanel` · new edge layers · renderer replacement · UMAP / ForceAtlas / React-Force-Graph spikes · **never render a flat 50-slider list**. Also untouched: `physicsLayer.ts` force math, `featureTargets.ts` anchor math, `graphTables.ts` feed, derived dims (`activityMix`/`permStrength`/`riskScore`), `membershipAge` (still blocked on `added_on`).

---

## Key design decisions (please confirm at approval)

1. **Primary = the current 6; Advanced = the rest, grouped by `family`.** `PRIMARY_DIMENSION_IDS` is exactly today's `RUNTIME_DIMENSION_IDS` (`project, role, tier, internalExternal, activity, signin`). Advanced dims (`company`, `isAdmin`, `module`) are grouped by their registry `family` and collapsed by default. This keeps the default screen identical to today while making the rest discoverable. Adding a registry descriptor + listing its id as primary/advanced is the *only* step to surface a future dim — no UI code changes.

2. **Advanced sliders default to 0 (off), EXCEPT `module` (0.15); collapsed groups show an active-count badge so a hidden-but-active dim is never invisible.** Most newly-exposed advanced dims add no force until the user opts in or picks a preset — preserving the P3-accepted layout. But `module` is part of the default organic profile (0.15), and it lives in an advanced (collapsed) group. A collapsed group with an active dim inside would silently affect layout, confusing the user. **Resolution (Option A from the P4 review):** keep `module` advanced at 0.15, and render an **active-count badge** on every collapsed group header — e.g. `Access & permissions · 1 active` — counting dims in that group with value > 0. The badge is computed from the full group (independent of the search filter) so the user always sees that something inside is on. **This does NOT contradict P3's "defaults from registry":** `defaultWeight` still means "this dim's weight when active"; presets choose *which* dims are active.

3. **Presets are pure weight profiles applied atomically.** A preset is `{ id, label, weights: Partial<Record<DimensionId, number>> }`. `applyPreset` returns a full slider map (preset weights over a 0-baseline, clamped 0–100). Ships with: `organic` (default — today's profile), `structural`, `behavioral`, `flat` (all slider dims equal/mid), `free` (all 0 → no semantic clustering). Selecting a preset is a single `updateSliders` push (one reheat, two-bus safe). Manually moving any slider clears the "active preset" highlight (state becomes "Custom").

4. **`module` is promoted from target-only to a visible ADVANCED slider, seeded at its registry `defaultWeight` (0.15).** It moves out of the "target-only" branch into the slider-capable set, so `RUNTIME_TARGET_DIMENSION_IDS` and the shell's seed-with-fixed-strength logic for module are removed (the slider now owns its value). Net layout effect at default: identical (0.15 either way). This is the worked example proving "a target-only dim becomes visible by editing one list."

5. **Color modes become registry-derived for dimension-backed modes, with `categoryForColor` delegating to `descriptor.extract`** (mirrors P3.2's `categoryValue` delegation). Colorable modes = registry dims of type `categorical` or `binary` (+ the existing non-dimension `status` mode, which reads `accountStatus` and has no registry dim). A one-time persisted-color-mode migration maps the legacy `external` mode id → `internalExternal`. Adding a categorical dim auto-adds a color option.

6. **Search filters the *dimension rows*, not nodes.** The sidebar search box hides slider rows whose label/family/id don't match the query; matching rows inside collapsed groups auto-expand their group while a query is active. It is independent of the Toolbar's node-filter chips and never touches physics or masks.

7. **Slider 0 = "free" (no semantic attraction), NOT a globe.** A slider at 0 means the dimension exerts no clustering force; with ALL sliders at 0 (the `free` preset) the graph relaxes to its organic base distribution — a volumetric, blue-noise-like spread. It must **not** be a sphere, a flat disc, or a collapse to the origin. The `free` preset and slider-0 behavior are validated by asserting organic properties (no semantic clustering, no NaN, non-collapsed spread, meaningful 3D depth) — never by asserting a globe. This is the registry/physics contract for "0 strength."

---

## File Structure

**New — pure logic (no React/DOM/I/O):**
- `app/(dashboard)/users/access-analysis/dimensionGroups.ts` — `PRIMARY_DIMENSION_IDS`, `ADVANCED_DIMENSION_GROUPS` (by family), `SLIDER_DIMENSION_IDS`, `getDimensionGroups()`.
- `app/(dashboard)/users/access-analysis/sliderPresets.ts` — `SliderPreset`, `SLIDER_PRESETS`, `applyPreset()`, `detectActivePreset()`.
- `app/(dashboard)/users/access-analysis/dimensionSearch.ts` — `matchDimension()`, `filterDimensionIds()`.

**New — tests for the above:**
- `app/(dashboard)/users/access-analysis/__tests__/dimensionGroups.test.ts`
- `app/(dashboard)/users/access-analysis/__tests__/sliderPresets.test.ts`
- `app/(dashboard)/users/access-analysis/__tests__/dimensionSearch.test.ts`

**New — UI components + tests:**
- `app/(dashboard)/users/access-analysis/SliderGroup.tsx` — one collapsible group of `DimensionSlider`s.
- `app/(dashboard)/users/access-analysis/PresetBar.tsx` — preset buttons + active highlight.
- `app/(dashboard)/users/access-analysis/DimensionSearchBox.tsx` — sidebar dimension search input.
- `app/(dashboard)/users/access-analysis/__tests__/SliderGroup.test.tsx`
- `app/(dashboard)/users/access-analysis/__tests__/PresetBar.test.tsx`
- `app/(dashboard)/users/access-analysis/__tests__/SliderSidebar.test.tsx`

**Modify:**
- `app/(dashboard)/users/access-analysis/dimensionRegistry.ts` — promote `module` into the slider set; collapse `RUNTIME_TARGET_DIMENSION_IDS` accordingly (decision 4).
- `app/(dashboard)/users/access-analysis/SliderContext.tsx` — widen state to `SLIDER_DIMENSION_IDS`; add `applyPreset`, `activePreset`; persist open-groups + active preset.
- `app/(dashboard)/users/access-analysis/SliderSidebar.tsx` — recompose: PresetBar + DimensionSearchBox + primary group + advanced collapsible groups.
- `app/(dashboard)/users/access-analysis/nodeColors.ts` — registry-derived color modes + `extract` delegation + legacy-id migration.
- `app/(dashboard)/users/access-analysis/Toolbar.tsx` — color-mode `<select>` consumes the registry-derived list (no behavior change beyond source of options).
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — build targets/weights/forces over `SLIDER_DIMENSION_IDS` (module now a slider); drop the module fixed-seed special case.

---

## Task P4.1: `dimensionGroups.ts` — primary vs advanced grouping (pure)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionGroups.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionGroups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  PRIMARY_DIMENSION_IDS,
  SLIDER_DIMENSION_IDS,
  ADVANCED_DIMENSION_GROUPS,
  getDimensionGroups,
} from "../dimensionGroups";
import { RUNTIME_DIMENSION_IDS, getDimension } from "../dimensionRegistry";

describe("dimensionGroups", () => {
  it("PRIMARY_DIMENSION_IDS equals the registry's primary runtime ids", () => {
    expect(PRIMARY_DIMENSION_IDS).toEqual([...RUNTIME_DIMENSION_IDS]);
  });

  it("SLIDER_DIMENSION_IDS = primary + every advanced slider dim, no dupes", () => {
    const set = new Set(SLIDER_DIMENSION_IDS);
    expect(set.size).toBe(SLIDER_DIMENSION_IDS.length); // no dupes
    for (const id of PRIMARY_DIMENSION_IDS) expect(set.has(id)).toBe(true);
    expect(set.has("module")).toBe(true); // promoted (decision 4)
    expect(set.has("company")).toBe(true);
    expect(set.has("isAdmin")).toBe(true);
  });

  it("advanced groups are keyed by family and contain only slider-capable, non-primary dims", () => {
    const primary = new Set(PRIMARY_DIMENSION_IDS);
    for (const group of ADVANCED_DIMENSION_GROUPS) {
      expect(group.ids.length).toBeGreaterThan(0);
      for (const id of group.ids) {
        expect(primary.has(id)).toBe(false); // never duplicate a primary dim
        expect(getDimension(id)).toBeDefined();
        expect(getDimension(id)!.family).toBe(group.family); // grouped by family
      }
    }
  });

  it("getDimensionGroups returns primary first, then advanced, covering exactly SLIDER_DIMENSION_IDS", () => {
    const groups = getDimensionGroups();
    expect(groups[0].kind).toBe("primary");
    expect(groups.slice(1).every((g) => g.kind === "advanced")).toBe(true);
    const flat = groups.flatMap((g) => g.ids);
    expect([...flat].sort()).toEqual([...SLIDER_DIMENSION_IDS].sort());
  });

  it("advanced groups are collapsed by default; primary is always open", () => {
    const groups = getDimensionGroups();
    expect(groups[0].defaultOpen).toBe(true);
    expect(groups.slice(1).every((g) => g.defaultOpen === false)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionGroups`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * dimensionGroups.ts — Pure UI grouping of registry dimensions.
 *
 * No React/DOM/I/O. Decides which dims are PRIMARY (always-visible, top group) vs
 * ADVANCED (grouped by registry `family`, collapsed by default). This is the data
 * that lets the sidebar scale toward 50 dims without a flat list: a new dimension
 * surfaces by appearing in the registry and being listed here — no component edits.
 */

import {
  DIMENSION_REGISTRY,
  RUNTIME_DIMENSION_IDS,
  type DimensionFamily,
  type DimensionId,
} from "./dimensionRegistry";

/** Always-visible top group — the high-signal, UAT-tuned six. */
export const PRIMARY_DIMENSION_IDS: readonly DimensionId[] = [...RUNTIME_DIMENSION_IDS];

/**
 * Dimension types that get a SLIDER (a layout-weight control). Scalar/temporal/
 * multi-hot/categorical/binary all map to a 0..100 weight today (transformer=1);
 * `derived` dims are excluded until their compute lands (see out-of-scope).
 */
const SLIDER_CAPABLE_TYPES = new Set(["categorical", "binary", "scalar", "temporal", "multi-hot"]);

/** Every dim that should get a slider, in registry order. */
export const SLIDER_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter((d) =>
  SLIDER_CAPABLE_TYPES.has(d.type),
).map((d) => d.id);

export interface AdvancedDimensionGroup {
  family: DimensionFamily;
  /** Human-readable group header. */
  label: string;
  ids: readonly DimensionId[];
}

/** Family → display label for advanced group headers. */
const FAMILY_LABELS: Record<DimensionFamily, string> = {
  structure: "Structure",
  access: "Access & permissions",
  affiliation: "Affiliation",
  behavior: "Behavior",
  tenure: "Tenure",
  risk: "Risk",
};

/** Advanced = slider-capable dims that are NOT primary, grouped by family (stable order). */
export const ADVANCED_DIMENSION_GROUPS: readonly AdvancedDimensionGroup[] = (() => {
  const primary = new Set<DimensionId>(PRIMARY_DIMENSION_IDS);
  const byFamily = new Map<DimensionFamily, DimensionId[]>();
  for (const d of DIMENSION_REGISTRY) {
    if (!SLIDER_CAPABLE_TYPES.has(d.type)) continue;
    if (primary.has(d.id)) continue;
    const arr = byFamily.get(d.family) ?? [];
    arr.push(d.id);
    byFamily.set(d.family, arr);
  }
  const out: AdvancedDimensionGroup[] = [];
  for (const [family, ids] of byFamily) {
    out.push({ family, label: FAMILY_LABELS[family], ids });
  }
  return out;
})();

export interface SliderGroupView {
  kind: "primary" | "advanced";
  /** Header shown in the sidebar. "Primary" for the top group, else the family label. */
  label: string;
  family: DimensionFamily | null;
  ids: readonly DimensionId[];
  defaultOpen: boolean;
}

/** Ordered groups for the sidebar: primary (open) first, then advanced (collapsed). */
export function getDimensionGroups(): SliderGroupView[] {
  return [
    { kind: "primary", label: "Primary", family: null, ids: PRIMARY_DIMENSION_IDS, defaultOpen: true },
    ...ADVANCED_DIMENSION_GROUPS.map((g) => ({
      kind: "advanced" as const,
      label: g.label,
      family: g.family,
      ids: g.ids,
      defaultOpen: false,
    })),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dimensionGroups`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/dimensionGroups.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionGroups.test.ts"
git commit -m "feat(acc-graph): registry-driven primary/advanced dimension grouping"
```

---

## Task P4.2: `sliderPresets.ts` — named weight profiles (pure)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/sliderPresets.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/sliderPresets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { SLIDER_PRESETS, applyPreset, detectActivePreset } from "../sliderPresets";
import { runtimeDefaultSliders } from "../dimensionRegistry";
import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";

describe("sliderPresets", () => {
  it("every preset has an id, a label, and a weights map", () => {
    for (const p of SLIDER_PRESETS) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.label).toBe("string");
      expect(p.weights).toBeTypeOf("object");
    }
  });

  it("applyPreset returns a value for EVERY slider dim, clamped 0..100, baseline 0", () => {
    // `free` = no semantic attraction → every slider 0 (organic base layout, NOT a globe).
    const free = applyPreset("free");
    for (const id of SLIDER_DIMENSION_IDS) {
      expect(free[id]).toBe(0);
    }
    const organic = applyPreset("organic");
    for (const id of SLIDER_DIMENSION_IDS) {
      expect(organic[id]).toBeGreaterThanOrEqual(0);
      expect(organic[id]).toBeLessThanOrEqual(100);
    }
  });

  it("the organic preset reproduces the P3 default layout for the primary dims", () => {
    const organic = applyPreset("organic");
    const defaults = runtimeDefaultSliders(); // {project:35, role:25, tier:15, internalExternal:10, activity:5, signin:5}
    for (const [id, v] of Object.entries(defaults)) {
      expect(organic[id]).toBe(v);
    }
    expect(organic.module).toBe(15); // promoted module keeps its 0.15 contribution (decision 4)
  });

  it("detectActivePreset matches a known profile and returns null for a custom mix", () => {
    expect(detectActivePreset(applyPreset("organic"))).toBe("organic");
    expect(detectActivePreset(applyPreset("free"))).toBe("free");
    const custom = { ...applyPreset("organic"), role: 99 };
    expect(detectActivePreset(custom)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sliderPresets`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * sliderPresets.ts — Pure named layout-weight profiles (no React/DOM/I/O).
 *
 * A preset is a sparse weight map; applyPreset() expands it over a 0-baseline for
 * EVERY slider dim, so unlisted dims are explicitly off. The `organic` preset is the
 * UAT-approved P3 default (registry defaultWeight×100 for the primary six + module).
 */

import { DIMENSION_REGISTRY, type DimensionId } from "./dimensionRegistry";
import { SLIDER_DIMENSION_IDS } from "./dimensionGroups";

export interface SliderPreset {
  id: string;
  label: string;
  /** Sparse: only the dims this preset turns on. Unlisted → 0. Values are 0..100. */
  weights: Partial<Record<DimensionId, number>>;
}

/** registry defaultWeight×100 for every slider dim (the "everything on" baseline). */
function registryWeights(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of DIMENSION_REGISTRY) {
    if ((SLIDER_DIMENSION_IDS as readonly string[]).includes(d.id)) {
      out[d.id] = Math.round(d.defaultWeight * 100);
    }
  }
  return out;
}

const ORGANIC = registryWeights();

export const SLIDER_PRESETS: readonly SliderPreset[] = [
  { id: "organic", label: "Organic (default)", weights: ORGANIC },
  {
    id: "structural",
    label: "Structural",
    weights: { project: 45, role: 35, tier: 25, company: 20, module: 20 },
  },
  {
    id: "behavioral",
    label: "Behavioral",
    weights: { activity: 40, signin: 35, role: 15, project: 15 },
  },
  {
    id: "flat",
    label: "Flat (equal)",
    weights: Object.fromEntries(SLIDER_DIMENSION_IDS.map((id) => [id, 20])) as Partial<
      Record<DimensionId, number>
    >,
  },
  // `free` = every slider 0 → no semantic attraction → the organic base distribution.
  // NOT a globe / disc / origin-collapse (see decision 7 + the P4.9 layout assertions).
  { id: "free", label: "Free / No semantic clustering", weights: {} },
];

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Expand a preset's sparse weights over a 0-baseline for every slider dim. */
export function applyPreset(presetId: string): Record<string, number> {
  const preset = SLIDER_PRESETS.find((p) => p.id === presetId);
  const out: Record<string, number> = {};
  for (const id of SLIDER_DIMENSION_IDS) out[id] = 0;
  if (preset) {
    for (const [id, v] of Object.entries(preset.weights)) {
      if (id in out && typeof v === "number") out[id] = clamp(v);
    }
  }
  return out;
}

/** Return the preset id whose expanded weights equal `values`, else null (= "Custom"). */
export function detectActivePreset(values: Record<string, number>): string | null {
  for (const p of SLIDER_PRESETS) {
    const expanded = applyPreset(p.id);
    const same = SLIDER_DIMENSION_IDS.every((id) => (values[id] ?? 0) === expanded[id]);
    if (same) return p.id;
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sliderPresets`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add "app/(dashboard)/users/access-analysis/sliderPresets.ts" "app/(dashboard)/users/access-analysis/__tests__/sliderPresets.test.ts"
git commit -m "feat(acc-graph): pure slider presets (organic/structural/behavioral/flat/free)"
```

---

## Task P4.3: `dimensionSearch.ts` — find-a-dimension filtering (pure)

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionSearch.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionSearch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { matchDimension, filterDimensionIds } from "../dimensionSearch";
import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";

describe("dimensionSearch", () => {
  it("matchDimension matches on label, id, and family, case-insensitively", () => {
    expect(matchDimension("project", "proj")).toBe(true);   // id/label
    expect(matchDimension("internalExternal", "EXTERN")).toBe(true); // label "Internal / external"
    expect(matchDimension("company", "affil")).toBe(true);  // family "affiliation"
    expect(matchDimension("role", "signin")).toBe(false);
  });

  it("an empty/whitespace query matches everything (no filtering)", () => {
    expect(filterDimensionIds(SLIDER_DIMENSION_IDS, "")).toEqual([...SLIDER_DIMENSION_IDS]);
    expect(filterDimensionIds(SLIDER_DIMENSION_IDS, "   ")).toEqual([...SLIDER_DIMENSION_IDS]);
  });

  it("filterDimensionIds preserves input order and returns only matches", () => {
    const out = filterDimensionIds(SLIDER_DIMENSION_IDS, "a"); // matches several
    expect(out).toEqual(out.filter((id) => SLIDER_DIMENSION_IDS.includes(id)));
    expect(filterDimensionIds(SLIDER_DIMENSION_IDS, "zzzznomatch")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionSearch`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * dimensionSearch.ts — Pure "find a dimension" filtering for the sidebar (no I/O).
 *
 * Filters dimension ROWS (not nodes). A row matches if the query is a case-insensitive
 * substring of its id, label, or family. Empty query = match all. Independent of the
 * Toolbar's node-filter chips; never touches physics or masks.
 */

import { getDimension, type DimensionId } from "./dimensionRegistry";

export function matchDimension(id: DimensionId, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const d = getDimension(id);
  if (!d) return false;
  return (
    d.id.toLowerCase().includes(q) ||
    d.label.toLowerCase().includes(q) ||
    d.family.toLowerCase().includes(q)
  );
}

export function filterDimensionIds(
  ids: readonly DimensionId[],
  query: string,
): DimensionId[] {
  if (query.trim() === "") return [...ids];
  return ids.filter((id) => matchDimension(id, query));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run dimensionSearch`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add "app/(dashboard)/users/access-analysis/dimensionSearch.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionSearch.test.ts"
git commit -m "feat(acc-graph): pure in-sidebar dimension search filtering"
```

---

## Task P4.4: Promote `module` into the slider set (registry seam)

**Why:** Decision 4 — `module` becomes a visible advanced slider. Today it's target-only (`RUNTIME_TARGET_DIMENSION_IDS` adds it; the shell seeds it a fixed 0.15). After P4 it's in `SLIDER_DIMENSION_IDS` (P4.1 already includes it because it's slider-capable), so the slider owns its value and the target-only seam collapses.

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dimensionRegistry.ts`
- Test: `app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts`

- [ ] **Step 1: Write the failing test** — append to `dimensionRegistry.test.ts`:

```ts
import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";

describe("dimension registry — P4 module promotion", () => {
  it("module is slider-capable (in SLIDER_DIMENSION_IDS)", () => {
    expect(SLIDER_DIMENSION_IDS).toContain("module");
  });
  it("RUNTIME_TARGET_DIMENSION_IDS no longer needs a target-only tail (= SLIDER_DIMENSION_IDS once module is a slider)", () => {
    // After promotion, the runtime target set is exactly the slider set (no extras).
    expect([...RUNTIME_TARGET_DIMENSION_IDS].sort()).toEqual([...SLIDER_DIMENSION_IDS].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run dimensionRegistry`
Expected: FAIL — `RUNTIME_TARGET_DIMENSION_IDS` still equals `[...RUNTIME_DIMENSION_IDS, "module"]` which is NOT equal to the full slider set (which also contains `company`, `isAdmin`).

- [ ] **Step 3: Redefine `RUNTIME_TARGET_DIMENSION_IDS` to be the slider set**

In `dimensionRegistry.ts`, replace the hardcoded target tail with a derivation from the slider set. To avoid an import cycle (`dimensionGroups` imports the registry), define the slider-capable filter INLINE here and have `dimensionGroups.SLIDER_DIMENSION_IDS` re-export it (adjust P4.1's import in Step 4 if needed):

```ts
/** Dimension types that receive a runtime layout weight (slider). Mirror in dimensionGroups. */
const SLIDER_CAPABLE_TYPES: ReadonlySet<DimensionType> = new Set([
  "categorical",
  "binary",
  "scalar",
  "temporal",
  "multi-hot",
]);

/**
 * Dimensions that participate in LAYOUT TARGETS + weighting at runtime. P4 promoted
 * `module` to a visible slider, so the target set is now exactly the slider-capable
 * set — there is no target-only tail anymore.
 */
export const RUNTIME_TARGET_DIMENSION_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter(
  (d) => SLIDER_CAPABLE_TYPES.has(d.type),
).map((d) => d.id);
```

Then in `dimensionGroups.ts`, import `RUNTIME_TARGET_DIMENSION_IDS` and define `SLIDER_DIMENSION_IDS = RUNTIME_TARGET_DIMENSION_IDS` (single source; removes the duplicated `SLIDER_CAPABLE_TYPES` filter). Update the P4.1 file accordingly and re-run `npx vitest run dimensionGroups` to confirm still green.

> **Import-cycle note:** `dimensionGroups` already imports from `dimensionRegistry`; the reverse must NOT happen. Keep the slider-capable filter authoritative in `dimensionRegistry.ts` and let `dimensionGroups` consume it. Do not import `dimensionGroups` from `dimensionRegistry`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run dimensionRegistry dimensionGroups`
Expected: PASS (both). The P3 `RUNTIME_TARGET_DIMENSION_IDS = [...RUNTIME_DIMENSION_IDS, "module"]` test from P3.5 will now FAIL — UPDATE that older assertion to expect the full slider set, since module is no longer the lone target-only tail. Re-run until green.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add "app/(dashboard)/users/access-analysis/dimensionRegistry.ts" "app/(dashboard)/users/access-analysis/dimensionGroups.ts" "app/(dashboard)/users/access-analysis/__tests__/dimensionRegistry.test.ts"
git commit -m "feat(acc-graph): promote module to slider set; target set = slider set"
```

---

## Task P4.5: `SliderContext` — widen state, presets, persisted UI state

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/SliderContext.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx`

- [ ] **Step 1: Write the failing tests** — add to `SliderContext.test.tsx`:

```ts
import { SLIDER_DIMENSION_IDS } from "../dimensionGroups";
import { applyPreset } from "../sliderPresets";
// (DIMENSIONS / DEFAULT_VALUES / migratePersistedSliders already imported from ../SliderContext)

describe("SliderContext — P4 slider set widening", () => {
  it("DIMENSIONS now covers the full slider set (primary + advanced)", () => {
    expect(DIMENSIONS.map((d) => d.id)).toEqual([...SLIDER_DIMENSION_IDS]);
  });
  it("DEFAULT_VALUES equals the organic preset (advanced dims off, primary at registry weights)", () => {
    expect(DEFAULT_VALUES).toEqual(applyPreset("organic"));
  });
});
```

> Provider-behavior tests for `applyPreset`/`activePreset` go in the component test (P4.7's `SliderSidebar.test.tsx`) where a real provider is mounted; here we only assert the exported constants, matching the existing test file's style.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run SliderContext`
Expected: FAIL — `DIMENSIONS` is still the 6 primary dims; `DEFAULT_VALUES` is `runtimeDefaultSliders()` (no `module`/advanced keys).

- [ ] **Step 3: Implement** in `SliderContext.tsx`:

Change the dimension source from `getRuntimeDimensions()` to the full slider set, and `DEFAULT_VALUES` to the organic preset:

```ts
import { getDimension } from "./dimensionRegistry";
import { SLIDER_DIMENSION_IDS } from "./dimensionGroups";
import { applyPreset, detectActivePreset } from "./sliderPresets";

// Full slider set — primary + advanced, registry-derived (single source of truth).
export const DIMENSIONS = SLIDER_DIMENSION_IDS.map((id) => {
  const d = getDimension(id)!;
  return {
    id: d.id,
    label: d.label,
    kind: d.type === "temporal" ? ("bucket" as const) : ("categorical" as const),
  };
});

export type DimensionId = (typeof DIMENSIONS)[number]["id"];

// Default layout = the organic preset (primary at registry weights + module 0.15,
// advanced dims off). Identical to the P3-accepted layout.
export const DEFAULT_VALUES: Record<DimensionId, number> =
  applyPreset("organic") as Record<DimensionId, number>;
```

Extend the context value with preset control + active-preset readout:

```ts
interface SliderContextValue {
  values: Record<DimensionId, number>;
  setSliderValue: (dimId: DimensionId, value: number) => void;
  resetAll: () => void;
  resetOne: (dimId: DimensionId) => void;
  applyPreset: (presetId: string) => void;       // NEW
  activePreset: string | null;                    // NEW — null = "Custom"
}
```

Add the provider logic (alongside the existing `setSliderValue`/`resetAll`):

```ts
  const applyPresetCb = useCallback(
    (presetId: string): void => {
      const next = applyPreset(presetId) as Record<DimensionId, number>;
      valuesRef.current = next;
      setValues(next);
      // One coalesced push — preset application is a single PHYSICS-bus reheat.
      schedulePush(next);
    },
    [schedulePush],
  );

  const activePreset = useMemo(() => detectActivePreset(values), [values]);
```

Wire both into the `ctx` `useMemo` and dependency array. (`resetAll` already restores `DEFAULT_VALUES`, which now equals the organic preset — leave it as-is.)

- [ ] **Step 4: Persist UI state additively**

The persisted blob (`PersistedControls`) gains optional `activePreset?: string` and `openGroups?: string[]` (group labels/families that are expanded). Add them to the interface and to the debounced `writePersisted` patch. Do NOT change the existing `sliders`/`filters`/`searchQuery` keys or the storage key. The mount migration (`migratePersistedSliders`) is unchanged — it still folds legacy `isExternal`; newly-added advanced dims simply read as absent → `DEFAULT_VALUES` (0) which is correct.

```ts
interface PersistedControls {
  sliders?: Partial<Record<string, number>>;
  filters?: Record<string, string[]>;
  searchQuery?: string;
  activePreset?: string;     // NEW (advisory; values are the source of truth)
  openGroups?: string[];     // NEW (which advanced groups are expanded)
}
```

(Group-open state is read/written by the sidebar in P4.7 via small exported helpers `readOpenGroups()` / `writeOpenGroups(labels: string[])` added here next to `readPersisted`/`writePersisted`.)

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run SliderContext` → PASS.
Run: `npx tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/SliderContext.tsx" "app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx"
git commit -m "feat(acc-graph): widen slider state to full set + presets + persisted UI state"
```

---

## Task P4.6: UI components — `SliderGroup`, `PresetBar`, `DimensionSearchBox`

**Files:**
- Create: `app/(dashboard)/users/access-analysis/SliderGroup.tsx`
- Create: `app/(dashboard)/users/access-analysis/PresetBar.tsx`
- Create: `app/(dashboard)/users/access-analysis/DimensionSearchBox.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/SliderGroup.test.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/PresetBar.test.tsx`

- [ ] **Step 1: Write the failing component tests**

`SliderGroup.test.tsx` (collapsible; primary always open; advanced toggles; respects `forceOpen` while searching):

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SliderGroup } from "../SliderGroup";

function rows() {
  return [
    { id: "company", label: "Company / firm", value: 0 },
    { id: "isAdmin", label: "Admin / member", value: 0 },
  ];
}

const base = {
  onToggleOpen: () => {}, onChange: () => {}, onReset: () => {}, activeCount: 0,
};

describe("SliderGroup", () => {
  it("renders a header and, when open, one slider row per dim", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: true, collapsible: true,
      }),
    );
    expect(screen.getByText("Affiliation")).toBeTruthy();
    expect(screen.getByText("Company / firm")).toBeTruthy();
  });

  it("when collapsed, hides the slider rows but keeps the header", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: false, collapsible: true,
      }),
    );
    expect(screen.getByText("Affiliation")).toBeTruthy();
    expect(screen.queryByText("Company / firm")).toBeNull();
  });

  it("clicking the header calls onToggleOpen (collapsible groups only)", () => {
    const onToggleOpen = vi.fn();
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: false, collapsible: true, onToggleOpen,
      }),
    );
    fireEvent.click(screen.getByText("Affiliation"));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
  });

  it("shows an active-count badge on a COLLAPSED group when activeCount > 0", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Access & permissions", rows: rows(), open: false, collapsible: true,
        activeCount: 1,
      }),
    );
    // Hidden-but-active dim must be discoverable even while collapsed (decision 2 / Option A).
    expect(screen.getByText(/1 active/i)).toBeTruthy();
    expect(screen.queryByText("Company / firm")).toBeNull(); // still collapsed
  });

  it("shows NO active badge when activeCount is 0", () => {
    render(
      React.createElement(SliderGroup, {
        ...base, title: "Affiliation", rows: rows(), open: false, collapsible: true, activeCount: 0,
      }),
    );
    expect(screen.queryByText(/active/i)).toBeNull();
  });
});
```

`PresetBar.test.tsx`:

```ts
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { PresetBar } from "../PresetBar";

describe("PresetBar", () => {
  it("renders a button per preset and marks the active one pressed", () => {
    render(
      React.createElement(PresetBar, { activePreset: "organic", onApply: () => {} }),
    );
    const organic = screen.getByRole("button", { name: /organic/i });
    expect(organic.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a preset calls onApply with its id", () => {
    const onApply = vi.fn();
    render(
      React.createElement(PresetBar, { activePreset: null, onApply }),
    );
    fireEvent.click(screen.getByRole("button", { name: /structural/i }));
    expect(onApply).toHaveBeenCalledWith("structural");
  });

  it("shows a 'Custom' indicator when activePreset is null", () => {
    render(React.createElement(PresetBar, { activePreset: null, onApply: () => {} }));
    expect(screen.getByText(/custom/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run SliderGroup PresetBar`
Expected: FAIL — components not found.

- [ ] **Step 3: Implement the components**

`SliderGroup.tsx`:

```tsx
"use client";

import { DimensionSlider } from "./DimensionSlider";

export interface SliderGroupRow {
  id: string;
  label: string;
  value: number;
}

export interface SliderGroupProps {
  title: string;
  rows: ReadonlyArray<SliderGroupRow>;
  open: boolean;
  collapsible: boolean;
  /** Number of dims in the FULL group with value > 0 (independent of search filter). */
  activeCount: number;
  onToggleOpen: () => void;
  onChange: (dimId: string, v: number) => void;
  onReset: (dimId: string) => void;
}

export function SliderGroup({
  title, rows, open, collapsible, activeCount, onToggleOpen, onChange, onReset,
}: SliderGroupProps): React.JSX.Element {
  // Active-count badge: surfaces a hidden-but-active dim (e.g. module at 0.15) while
  // its group is collapsed, so layout-affecting state is never invisible (decision 2).
  const badge =
    activeCount > 0 ? (
      <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] font-medium text-blue-400">
        {activeCount} active
      </span>
    ) : null;

  return (
    <section data-testid={`slider-group-${title}`} className="flex flex-col gap-3">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center">{title}{badge}</span>
          <span aria-hidden>{open ? "−" : "+"}</span>
        </button>
      ) : (
        <h3 className="flex items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}{badge}</h3>
      )}
      {open && rows.length > 0 ? (
        <div className="flex flex-col gap-4">
          {rows.map((r) => (
            <DimensionSlider
              key={r.id}
              dimId={r.id}
              label={r.label}
              value={r.value}
              onChange={(v) => onChange(r.id, v)}
              onReset={() => onReset(r.id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

`PresetBar.tsx`:

```tsx
"use client";

import { SLIDER_PRESETS } from "./sliderPresets";

export interface PresetBarProps {
  activePreset: string | null;
  onApply: (presetId: string) => void;
}

export function PresetBar({ activePreset, onApply }: PresetBarProps): React.JSX.Element {
  return (
    <div data-testid="preset-bar" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Presets</span>
        {activePreset === null ? (
          <span className="text-xs text-amber-400">Custom</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLIDER_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onApply(p.id)}
            aria-pressed={activePreset === p.id}
            className={`rounded-md border px-2 py-1 text-xs ${
              activePreset === p.id
                ? "border-blue-500 bg-blue-500 text-white"
                : "hover:bg-accent"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

`DimensionSearchBox.tsx`:

```tsx
"use client";

export interface DimensionSearchBoxProps {
  query: string;
  onChange: (q: string) => void;
}

export function DimensionSearchBox({ query, onChange }: DimensionSearchBoxProps): React.JSX.Element {
  return (
    <input
      type="search"
      value={query}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Find a dimension…"
      aria-label="Find a dimension"
      data-testid="dimension-search"
      className="w-full rounded-md border bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:border-blue-500 focus:outline-none"
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run SliderGroup PresetBar`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit -p tsconfig.json` → clean.

```bash
git add "app/(dashboard)/users/access-analysis/SliderGroup.tsx" "app/(dashboard)/users/access-analysis/PresetBar.tsx" "app/(dashboard)/users/access-analysis/DimensionSearchBox.tsx" "app/(dashboard)/users/access-analysis/__tests__/SliderGroup.test.tsx" "app/(dashboard)/users/access-analysis/__tests__/PresetBar.test.tsx"
git commit -m "feat(acc-graph): SliderGroup, PresetBar, DimensionSearchBox components"
```

---

## Task P4.7: Recompose `SliderSidebar` + wire `module` through the shell

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/SliderSidebar.tsx`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx`
- Test: `app/(dashboard)/users/access-analysis/__tests__/SliderSidebar.test.tsx`

- [ ] **Step 1: Write the failing integration test** (`SliderSidebar.test.tsx`, mounting a real `SliderProvider`):

```ts
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { SliderProvider } from "../SliderContext";
import { SliderSidebar } from "../SliderSidebar";

function mount() {
  return render(
    React.createElement(SliderProvider, { physics: null },
      React.createElement(SliderSidebar, null)),
  );
}

describe("SliderSidebar — grouped + presets + search", () => {
  it("shows the primary group expanded with its 6 sliders", () => {
    mount();
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("Sign-in recency")).toBeTruthy();
  });

  it("advanced groups start collapsed; clicking a header reveals its sliders", () => {
    mount();
    // 'Company / firm' lives in a collapsed advanced (affiliation) group → hidden initially
    expect(screen.queryByText("Company / firm")).toBeNull();
    fireEvent.click(screen.getByText(/affiliation/i));
    expect(screen.getByText("Company / firm")).toBeTruthy();
  });

  it("does NOT render a flat list of all sliders at once (advanced hidden by default)", () => {
    mount();
    // module is advanced → not visible until its group opens (guards 'no 50 flat sliders')
    expect(screen.queryByText("Module signature")).toBeNull();
  });

  it("a collapsed advanced group with an active dim shows an active-count badge", () => {
    mount();
    // module (family 'access') defaults to 15 (>0) and lives in a collapsed advanced
    // group, so its group header must surface that it has 1 active dim (decision 2).
    expect(screen.getByText(/1 active/i)).toBeTruthy();
    expect(screen.queryByText("Module signature")).toBeNull(); // still collapsed
  });

  it("applying the Free preset zeroes a primary slider's displayed value", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /free \/ no semantic clustering/i }));
    const project = screen.getByText("Project").closest("div")!;
    expect(within(project).getByText("0")).toBeTruthy(); // free → project 0 (no attraction)
  });

  it("search filters dimension rows and auto-expands matching advanced groups", () => {
    mount();
    fireEvent.change(screen.getByTestId("dimension-search"), { target: { value: "company" } });
    expect(screen.getByText("Company / firm")).toBeTruthy(); // advanced match auto-revealed
    expect(screen.queryByText("Project")).toBeNull();        // non-match hidden
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run SliderSidebar`
Expected: FAIL — current `SliderSidebar` renders a flat list, no groups/presets/search.

- [ ] **Step 3: Recompose `SliderSidebar.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { SliderGroup } from "./SliderGroup";
import { PresetBar } from "./PresetBar";
import { DimensionSearchBox } from "./DimensionSearchBox";
import { useSliders, type DimensionId } from "./SliderContext";
import { getDimensionGroups } from "./dimensionGroups";
import { getDimension } from "./dimensionRegistry";
import { filterDimensionIds } from "./dimensionSearch";

export function SliderSidebar(): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne, applyPreset, activePreset } = useSliders();
  const groups = useMemo(() => getDimensionGroups(), []);
  const [query, setQuery] = useState("");
  const [openByLabel, setOpenByLabel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.label, g.defaultOpen])),
  );
  const searching = query.trim() !== "";

  const rowsFor = (ids: readonly DimensionId[]) =>
    filterDimensionIds(ids, query).map((id) => ({
      id, label: getDimension(id)!.label, value: values[id] ?? 0,
    }));

  return (
    <aside data-testid="slider-sidebar" className="flex w-72 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Dimensions</h2>
        <button
          type="button"
          onClick={resetAll}
          className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Reset
        </button>
      </header>

      <div className="flex flex-col gap-4 border-b p-4">
        <PresetBar activePreset={activePreset} onApply={applyPreset} />
        <DimensionSearchBox query={query} onChange={setQuery} />
      </div>

      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
        {groups.map((g) => {
          const rows = rowsFor(g.ids);
          // While searching, hide groups with no matches and force-open the rest.
          if (searching && rows.length === 0) return null;
          const open = g.kind === "primary" ? true : searching ? true : openByLabel[g.label];
          // Active count is over the FULL group (not the search-filtered rows) so the
          // collapsed badge always reflects real layout-affecting state.
          const activeCount = g.ids.filter((id) => (values[id] ?? 0) > 0).length;
          return (
            <SliderGroup
              key={g.label}
              title={g.label}
              rows={rows}
              open={open}
              collapsible={g.kind !== "primary" && !searching}
              activeCount={activeCount}
              onToggleOpen={() =>
                setOpenByLabel((s) => ({ ...s, [g.label]: !s[g.label] }))
              }
              onChange={(id, v) => setSliderValue(id as DimensionId, v)}
              onReset={(id) => resetOne(id as DimensionId)}
            />
          );
        })}
      </div>
    </aside>
  );
}
```

(Persisting `openByLabel` via `readOpenGroups`/`writeOpenGroups` from P4.5 is a 3-line `useEffect`; include it, defaulting to `g.defaultOpen` when nothing is stored.)

- [ ] **Step 4: Drop the module fixed-seed special case in `AccessAnalysisShell.tsx`**

`module` is now a real slider in `DIMENSIONS`/`SLIDER_DIMENSION_IDS` and carries its own value (0.15 default via the organic preset). Remove the P3.5 `seededSliders`/`moduleDefault` block and build over the slider set directly:

```ts
import { SLIDER_DIMENSION_IDS } from "./dimensionGroups";
// ...
        const targetDimIds = [...SLIDER_DIMENSION_IDS] as string[];
        const targets = buildFeatureTargets(snapshot, SLIDER_DIMENSION_IDS);
        const dimWeights = buildDimensionWeights(snapshot, SLIDER_DIMENSION_IDS);
        const layer = await createPhysicsLayer(
          nodeIds, nodes, targets, targetDimIds, initialSliders, dimWeights,
        );
```

`initialSliders` already comes from the persisted blob normalized 0..1 over `DIMENSIONS` (now the full slider set), so module + advanced dims flow automatically. The `updateSliders` merge from P3.5 stays (harmless; still correct for partial pushes). Confirm `RUNTIME_TARGET_DIMENSION_IDS` (now = slider set) is no longer separately referenced here — replace with `SLIDER_DIMENSION_IDS` for a single name.

- [ ] **Step 5: Run tests + full regression + typecheck**

Run: `npx vitest run SliderSidebar` → PASS.
Run: `npm test` → all green (note: P3 shell/physics tests must still pass — the merge + target-set generalization are behavior-preserving at default).
Run: `npx tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/SliderSidebar.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx" "app/(dashboard)/users/access-analysis/__tests__/SliderSidebar.test.tsx"
git commit -m "feat(acc-graph): grouped+preset+search sidebar; module is a real slider"
```

---

## Task P4.8: Registry-derived color modes (relate color to dimensions)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/nodeColors.ts`
- Modify: `app/(dashboard)/users/access-analysis/Toolbar.tsx`
- Test: `app/(dashboard)/users/access-analysis/nodeColors.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test** (`nodeColors.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import {
  COLOR_MODES, COLOR_MODE_LABELS, categoryForColor, buildNodeColors, migrateColorMode,
} from "./nodeColors";
import { getDimension } from "./dimensionRegistry";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function snap(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "", emailLower: "",
    project: "Tower A", role: "Architect", permTier: "View Only",
    isExternal: false, affiliation: "internal", activityBucket: "Med",
    signinBucket: "<30d", activityCountRaw: 1, lastSignInRel: "",
    permissionCoverage: "known", firmName: "Hermosillo", accountStatus: "active",
    isAdmin: false, moduleSignature: ["build"], ...over,
  };
}

describe("nodeColors — registry-derived modes", () => {
  it("every categorical/binary registry dim is an available color mode", () => {
    for (const id of ["role", "tier", "internalExternal", "company", "isAdmin"]) {
      expect(COLOR_MODES).toContain(id);
      expect(COLOR_MODE_LABELS[id as (typeof COLOR_MODES)[number]]).toBeTruthy();
    }
  });

  it("dimension-backed modes delegate to descriptor.extract", () => {
    const f = snap({ role: "Engineer" });
    expect(categoryForColor(f, "role")).toBe(String(getDimension("role")!.extract(f)));
  });

  it("the non-dimension 'status' mode still reads accountStatus", () => {
    expect(categoryForColor(snap({ accountStatus: "suspended" }), "status")).toBe("suspended");
  });

  it("legacy 'external' color-mode id migrates to 'internalExternal'", () => {
    expect(migrateColorMode("external")).toBe("internalExternal");
    expect(migrateColorMode("role")).toBe("role");
  });

  it("buildNodeColors yields >1 distinct color for a multi-role dataset (RGBA, alpha=1)", () => {
    const buf = buildNodeColors([snap({ role: "A" }), snap({ role: "B" })], "role");
    expect(buf.length).toBe(8);
    expect(buf[3]).toBe(1); expect(buf[7]).toBe(1);
    const c0 = buf.slice(0, 3).join(","), c1 = buf.slice(4, 7).join(",");
    expect(c0).not.toBe(c1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run nodeColors`
Expected: FAIL — `COLOR_MODES` is the hardcoded `["role","tier","status","external"]`; no `migrateColorMode`; `categoryForColor` uses a fixed switch.

- [ ] **Step 3: Implement registry-derived modes in `nodeColors.ts`**

Replace the hardcoded `ColorMode`/`COLOR_MODES`/`COLOR_MODE_LABELS`/`categoryForColor`:

```ts
import { DIMENSION_REGISTRY, getDimension, type DimensionId } from "./dimensionRegistry";

/** Dimension-backed color modes: categorical + binary registry dims. */
const COLORABLE_DIM_IDS: readonly DimensionId[] = DIMENSION_REGISTRY.filter(
  (d) => d.type === "categorical" || d.type === "binary",
).map((d) => d.id);

/** Non-dimension extra modes (no registry dim). `status` reads accountStatus. */
const EXTRA_COLOR_MODES = ["status"] as const;

export type ColorMode = DimensionId | (typeof EXTRA_COLOR_MODES)[number];

// "role" leads (many distinct colors at first load). Then the rest of the dim-backed
// modes, then the non-dimension extras.
export const COLOR_MODES: readonly ColorMode[] = [
  "role",
  ...COLORABLE_DIM_IDS.filter((id) => id !== "role"),
  ...EXTRA_COLOR_MODES,
];

export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  ...Object.fromEntries(COLORABLE_DIM_IDS.map((id) => [id, getDimension(id)!.label])),
  status: "Account status",
} as Record<ColorMode, string>;

/** Category string used to pick a color. Dim-backed → descriptor.extract; extras explicit. */
export function categoryForColor(f: NodeFeatureSnapshot, mode: ColorMode): string {
  if (mode === "status") return f.accountStatus || "(unknown)";
  const d = getDimension(mode as DimensionId);
  const v = d ? d.extract(f) : null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.length ? v.join("|") : "(none)";
  return "(none)";
}

/** One-time migration: the legacy `external` color-mode id → `internalExternal`. */
export function migrateColorMode(mode: string): ColorMode {
  if (mode === "external") return "internalExternal";
  return (COLOR_MODES as readonly string[]).includes(mode) ? (mode as ColorMode) : "role";
}
```

(`buildNodeColors` is unchanged — it already calls `categoryForColor`.)

- [ ] **Step 4: Apply the color-mode migration where it's read**

In `AccessAnalysisShell.tsx` (or wherever the persisted color mode is hydrated), wrap the stored value with `migrateColorMode(stored)` before setting state, so a persisted `external` keeps working. (If color mode isn't persisted yet, this is a no-op guard — note it and skip.) The Toolbar already maps `COLOR_MODES`/`COLOR_MODE_LABELS`, so it picks up the new options with no change beyond importing the now-wider type.

- [ ] **Step 5: Run tests + full regression + typecheck**

Run: `npx vitest run nodeColors` → PASS.
Run: `npm test` → all green (the P3.0 3D-color gate + any color tests still pass; `role` remains the default mode).
Run: `npx tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/nodeColors.ts" "app/(dashboard)/users/access-analysis/nodeColors.test.ts" "app/(dashboard)/users/access-analysis/Toolbar.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(acc-graph): registry-derived color modes (extract delegation + legacy migration)"
```

---

## Task P4.9: End-to-end gate + full regression

**Files:**
- Modify: `tests/e2e/acc-dc-graph.spec.ts` (add P4 UI assertions to the existing Step-1 suite; do NOT add new spec files or touch lasso/camera specs)

- [ ] **Step 1: Add e2e assertions** for the new control surface, mirroring the existing test bridge/auth setup in that spec (minted NextAuth cookie, `:3100`, `NEXT_PUBLIC_ACC_GRAPH_TEST`). Cover:
  1. Sidebar shows the **Primary** group expanded with 6 sliders; advanced groups (e.g. "Affiliation") render collapsed (their sliders absent from the DOM).
  2. Clicking an advanced group header reveals its sliders (e.g. "Company / firm").
  3. The collapsed advanced group containing `module` shows an **active-count badge** ("1 active") so the hidden-but-active dim is visible.
  4. Applying the **Free / No semantic clustering** preset relaxes the graph to its organic base layout — assert via the test bridge that it is NOT collapsed/globe: positions are all finite (no NaN), the bounding spread is non-degenerate on all three axes (meaningful 3D depth, not a flat disc), nodes are not all at one point, and no single dimension's categories are spatially separated (no semantic clustering). **Do NOT assert it trends toward a sphere.** Then applying **Organic (default)** restores clustering (assert separation returns).
  5. Typing in the dimension search hides non-matching rows and reveals a matching advanced row.
  6. The color-mode `<select>` lists the registry-derived options and switching it changes the node color buffer (assert via the test bridge's color signature, reusing the P3.0 `getRenderState`/buffer hooks).

```ts
// Sketch — adapt selectors to the spec's existing page-object helpers.
test("P4: sidebar is grouped, not a flat list", async ({ page }) => {
  await gotoAccessAnalysis(page); // existing helper
  await expect(page.getByText("Primary")).toBeVisible();
  await expect(page.getByText("Project")).toBeVisible();
  await expect(page.getByText("Company / firm")).toHaveCount(0); // advanced collapsed
  await page.getByText(/affiliation/i).click();
  await expect(page.getByText("Company / firm")).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e gate**

Run: `npm run test:e2e`
Expected: all specs green (existing lasso/search/edge tests unchanged + new P4 assertions). Record retries/flakes.

- [ ] **Step 3: Full unit + typecheck reconfirm**

Run: `npm test` → all green.
Run: `npx tsc --noEmit -p tsconfig.json` → clean.

- [ ] **Step 4: Commit**

```bash
git add "tests/e2e/acc-dc-graph.spec.ts"
git commit -m "test(acc-graph): e2e for grouped sidebar, presets, dimension search, color modes"
```

---

## Test strategy (P4 brief item 8)

**Layered, registry-first, two-bus-aware:**

1. **Pure-logic unit tests (fast, no DOM)** — `dimensionGroups`, `sliderPresets`, `dimensionSearch`, `nodeColors`. These are the safety net for the "scales to 50 without a flat list" guarantee: grouping, preset expansion, search matching, and color-mode derivation are all pure functions tested in isolation (P4.1–P4.4, P4.8).

2. **Drift guards** — assert derived sets stay consistent with the registry: `SLIDER_DIMENSION_IDS` = slider-capable registry dims; `DEFAULT_VALUES` = `applyPreset("organic")`; `COLOR_MODES` ⊇ every categorical/binary dim; advanced groups never duplicate a primary dim. These catch a new dimension being half-wired (P4.1, P4.2, P4.5, P4.8). Keep the P3 drift guard for the 5 SHARED ids intact.

3. **Component tests (@testing-library/react)** — `SliderGroup` (collapse/expand, rows hidden when collapsed, **active-count badge shows on a collapsed group with an active dim and is absent at 0**), `PresetBar` (active highlight, onApply id, Custom state), `SliderSidebar` (primary open, advanced collapsed, **explicit "no flat list" assertion**, **collapsed group containing `module` shows "1 active"**, applying the **Free** preset zeroes a displayed value, search hides/reveals rows). Mount a real `SliderProvider` with `physics: null` so the rAF/SSR fallback path runs synchronously (existing pattern).

4. **Slider-0 / "Free" = no semantic clustering, NOT a globe** — assert the contract from decision 7 at the layout level (e2e via the test bridge, and any pure helper that can be checked at unit level): with all sliders 0, positions are finite (no NaN), spread is non-degenerate on all three axes (3D depth, not a flat disc), nodes are not collapsed to one point, and no single dimension's categories are spatially separated. **Never assert the layout trends toward a sphere.** The existing `physicsClustering` "not a globe" guarantee is the unit-level anchor for this.

5. **Two-bus invariants reused** — applying a preset is one `updateSliders` push (PHYSICS bus); the dimension search and group toggles touch NO physics and NO mask. Add a unit assertion (in `SliderContext` or `SliderSidebar` test) that toggling a group / typing a search query does not call `physics.updateSliders` (spy on a fake physics).

6. **E2E (Playwright)** — the user-visible contract: grouped sidebar, advanced reveal, active-count badge, Free→organic (non-globe) layout, dimension search, color-mode switch (P4.9). Reuses the P3 e2e harness; adds assertions to the existing spec rather than new files.

7. **Regression** — `npm test` (full unit, 889+ baseline) green and `npx tsc --noEmit` clean after every task; `npm run test:e2e` green at the close. The P3.0 3D-color gate and P3 physics/clustering suites must remain green (P4 doesn't touch force math).

**How the 8 brief items map to tasks/tests:**
1. Primary slider group → P4.1 (`PRIMARY_DIMENSION_IDS`) + P4.7 (rendered, always open).
2. Advanced collapsed groups → P4.1 (`ADVANCED_DIMENSION_GROUPS`, `defaultOpen:false`) + P4.6 (`SliderGroup` + active-count badge) + P4.7 (collapsed by default, "no flat list" test, "1 active" badge for module's group).
3. Presets → P4.2 (`SLIDER_PRESETS`/`applyPreset`/`detectActivePreset`) + P4.6 (`PresetBar`) + P4.5 (`applyPreset`/`activePreset` in context).
4. Search/filter within dimensions → P4.3 (`filterDimensionIds`) + P4.6 (`DimensionSearchBox`) + P4.7 (rows filtered, groups auto-expand).
5. How module becomes visible → P4.4 (promote to slider set) + P4.7 (real slider, shell seed special-case removed) — the worked example for item 6.
6. How future activity/permission dims plug in → P4.1 (slider-capable + family grouping is automatic) + drift guards; documented in "Extending the registry" below.
7. Color modes ↔ dimensions → P4.8 (registry-derived modes, `extract` delegation, legacy migration).
8. Test strategy → this section + per-task TDD steps + P4.9 e2e.

---

## Extending the registry later (the plug-in contract — brief items 5 & 6)

To add a future activity/permission/tenure/risk dimension after P4, an engineer does **only** this:
1. Add a `DimensionDescriptor` to `DIMENSION_REGISTRY` (id, `family`, `type`, `source`, `availability`, `defaultWeight`, `confidence`, `extract`, `isAvailable`). If its source field isn't in `NodeFeatureSnapshot`/`graphTables.ts` yet, that data wiring is its own prerequisite task (e.g. `membershipAge` needs `added_on`).
2. If it should have a slider, ensure its `type` is slider-capable (it auto-joins `SLIDER_DIMENSION_IDS`) and decide primary vs advanced: leave it out of `PRIMARY_DIMENSION_IDS` to land it (collapsed) in its family's advanced group automatically.
3. If it's categorical/binary, it auto-appears as a color mode.
4. Optionally reference it in a preset's `weights`.

No component, context, shell, or physics edits are required — the grouping, sliders, presets, search, and color list are all registry-derived. This is the structural payoff of P4 and the reason it must stay strictly data-driven.

---

## Self-Review

**1. Spec coverage:** All 8 brief items map to tasks (see the mapping table above) — primary group (P4.1/P4.7), advanced collapsed groups (P4.1/P4.6/P4.7), presets (P4.2/P4.5/P4.6), dimension search (P4.3/P4.6/P4.7), module visibility (P4.4/P4.7), future-dim plug-in (P4.1 + Extending section), color↔dimension (P4.8), test strategy (its section + P4.9). ✓

**2. Placeholder scan:** Every code step contains real code; every run step has a command + expected result. The two judgment points (persisting `openByLabel`; persisting/migrating color mode only if a persistence site exists) are spelled out with the fallback ("no-op guard, note it and skip"). ✓

**3. Type consistency:** `SLIDER_DIMENSION_IDS` is defined once (P4.4 makes `dimensionRegistry.RUNTIME_TARGET_DIMENSION_IDS` the authority and `dimensionGroups` re-exports it as `SLIDER_DIMENSION_IDS`) — P4.1 introduces it and P4.4 reconciles the source to avoid two filters drifting; the plan flags the one-time edit to P4.1's body in P4.4 Step 3. `applyPreset`/`detectActivePreset`/`getDimensionGroups`/`filterDimensionIds`/`migrateColorMode`/`SliderGroupRow`/`SliderGroupProps`/`PresetBarProps` are spelled identically across tasks. `SliderGroupProps` carries `activeCount: number` (P4.6), and every `SliderGroup` render site supplies it (the test uses a shared `base` spread; the sidebar computes it per group in P4.7). The `free` preset id/label is consistent across P4.2 (def + tests), P4.7 (button matcher), and P4.9 (e2e) — no lingering `off`. `ColorMode` widens from a 4-union to `DimensionId | "status"`; `Toolbar` consumes it generically so it stays type-clean. `DEFAULT_VALUES` is keyed by the widened `DimensionId` and equals `applyPreset("organic")`. ✓

**4. Ordering safety:** P4.1→P4.2→P4.3 are independent pure modules (P4.2/P4.3 import P4.1's `SLIDER_DIMENSION_IDS`). P4.4 reconciles the slider-set source (must precede context widening). P4.5 widens context (needs P4.1/P4.2). P4.6 builds components (needs P4.2 for `PresetBar`). P4.7 composes everything + shell wiring (needs P4.1/P4.3/P4.5/P4.6). P4.8 color modes is independent of the sidebar (can run anytime after P4.4's registry edit; placed late to keep diffs focused). P4.9 e2e last. Each task ends green. ✓

**5. Risk notes:**
- **Layout parity at default** (P4.4/P4.5/P4.7): promoting `module` to a slider must keep the default contribution at 0.15 and advanced dims at 0 — the `organic` preset encodes exactly that, and `DEFAULT_VALUES === applyPreset("organic")` is asserted. If clustering shifts at default, the regression suite (`physicsClustering`) catches it.
- **Hidden-active advanced dim** (decision 2 / Option A): `module` is on (0.15) inside a collapsed group, so the collapsed group MUST show an active-count badge ("1 active"). Enforced by both the `SliderGroup` unit test and the `SliderSidebar` integration test; without the badge the user can't tell why layout reflects a dim they can't see.
- **Slider 0 = "Free", not a globe** (decision 7): the `free` preset (all sliders 0) must relax to the organic base distribution — finite, non-collapsed, 3D-deep, no semantic clustering — and tests assert those properties, never a sphere. **Dependency:** this assumes the no-attraction base layout is already organic (P1 replaced the old all-zero "globe" targets with volumetric anchoring + base repulsion). If, during execution, the all-zero state is found to collapse/globe/disc, STOP and surface it — fix the base layout as part of this task; do NOT weaken the assertions to pass, and do NOT silently expand into the forbidden physics-replacement scope without flagging.
- **Persistence back-compat** (P4.5/P4.8): blob keys are additive; legacy `isExternal` slider migration (P3) and new legacy `external` color-mode migration cover stored state. Newly-added advanced dims read as absent → 0, which is correct.
- **"No flat list" is enforced by test** (P4.7 Step 1) not just convention — advanced dims must be absent from the DOM at first paint.
- **Two-bus**: presets push once (PHYSICS); search/group-toggle never touch physics or masks (asserted with a physics spy). No renderer/edge/lasso/camera/nav/UserDetailPanel changes — confirmed against the do-not-touch list.

---

## Out of scope / follow-ups (NOT in P4)

1. `derived` dims (`activityMix`/`permStrength`/`riskScore`) — excluded from sliders until their compute lands; they'll join via the same registry contract.
2. `membershipAge` — still blocked on `added_on` in `graphTables.ts` (P2 follow-up).
3. Per-dimension scalar/temporal `transformer` value-normalization (transformer=1 today).
4. User-authored/saved custom presets (only built-in presets in P4).
5. Multi-hot color mode for `module` (color by dominant module) — color is categorical/binary only in P4.
6. Drag-to-reorder or pin-to-primary UI for advanced dims.
