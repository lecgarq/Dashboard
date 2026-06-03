# Phase E — Catalog Sidebar Tree + Engine Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the legacy 9-slider sidebar with the full catalog **Module→Group→Action tree** (~185 sliders) and flip the live graph's positioning onto the Phase D catalog engine, so every catalog dimension is a real, working slider.

**Architecture:** The shell builds the catalog once from the feature snapshot (`buildDimensionCatalog(features)`), passes it to a catalog-driven `SliderProvider` (values keyed by catalog `id`, default **all 0**) and to a new tree sidebar that renders `getCatalogSections(catalog)`. The shell drives physics with `buildCatalogTargets`/`buildCatalogWeights` (Phase D engine) over the slider-surfaced, available catalog dims. Color, presets, and legacy-registry deletion are explicitly out of scope (Phases F/G + later cleanup).

**Tech Stack:** TypeScript, Next.js App Router, React, Radix Slider, Vitest, Playwright (`:3100`).

---

## Scope & Guardrails (READ FIRST)

Rollout chosen by owner: **one-shot** (tree + cutover together, single `:3000` deploy at the end). Implementation is still incremental TDD commits.

**IN scope:**
- New pure helpers: `catalogSliders.ts` (slider id set + default-all-0), `catalogSearch.ts` (tree filter).
- Migrate `SliderContext.tsx` to the catalog id-space (default all-0; keep rAF/preview/normalization).
- New tree sidebar (structural flat section + Activity Module→Group→Action tree + greyed folder/disabled rows + search + active-count badges + reset-all).
- Shell cutover to `buildCatalogTargets`/`buildCatalogWeights` keyed by catalog ids.

**OUT of scope — do NOT do these:**
- ❌ Do **NOT** delete `dimensionRegistry.ts`, `dimensionGroups.ts`, `dimensionWeights.ts`, `sliderPresets.ts`, or `featureTargets.ts`. `nodeColors.ts` (color = Phase G) and `sliderPresets.ts` (presets = Phase F) still import the registry; deleting it now breaks color. Legacy deletion is post-F/G cleanup.
- ❌ Do **NOT** build the preset bar / user presets (Phase F). The new sidebar has **no PresetBar** — just "Reset all" + default all-0.
- ❌ Do **NOT** build the "Color by" dropdown rework (Phase G). Leave `nodeColors`/Toolbar color control exactly as-is.
- ❌ Do **NOT** touch the filter/lasso/search **MASK bus**, `FilterContext`, `SelectionContext`.
- ❌ Do **NOT** touch the concurrent acc-profile files (`UserProfilePanel`, `AccProfile*`, `UsersDirectoryClient`, `RightPanelStack` profile wiring) — verified independent of the legacy registry.

**Process guardrails (project memory):**
- Stage commits by **explicit path only** — never `git add -A`/`.` (this branch has heavy WIP + a concurrent committer).
- Before every commit: `git diff --cached --name-only` must list **only** that task's files.
- Commit scope token: `acc-sidebar`.
- The shared tree may carry concurrent acc-profile edits to `AccessAnalysisShell.tsx`; when editing it, isolate Phase E hunks and confirm the staged diff.

**Key Phase D carry-forward:** `catalogTargets.bucketerFor` governs `permission`/`tenure` ordinal positioning via `dim.id` (reading `f.permissionStrength`/`f.membershipBucket`), NOT `dim.extract`. No action needed unless retuning those.

---

## Catalog contract (from Phase C, already shipped)

- `buildDimensionCatalog(features): CatalogDimension[]` — 9 structural + ~176 action + 19 folder dims.
- `getCatalogSections(dims): CatalogSection[]` — `[{kind:"structural",label,dims}, {kind:"activity",label,modules:[{moduleId,moduleLabel,groups:[{groupId,groupLabel,actions:CatalogDimension[]}]}]}, {kind:"folder",label,dims}]`.
- `CatalogDimension { id, label, family, moduleId?, groupId?, kind, source, confidence, available, surfaces: ("slider"|"color")[], colorScale?, extract }`.
- Structural dims: all `available:true`, `surfaces` include `"slider"`. Action dims: `surfaces:["slider","color"]`, `available` = has data (else greyed). Folder dims: `surfaces:[]`, `available:false`.
- Phase D engine (already shipped, pure): `buildCatalogTargets(features, dims, radius?)`, `buildCatalogWeights(features, dims)`.

---

## File Structure

**New:**
- `app/(dashboard)/users/access-analysis/catalogSliders.ts` (+ `.test.ts`) — slider dim selection + default-all-0.
- `app/(dashboard)/users/access-analysis/catalogSearch.ts` (+ `.test.ts`) — filter catalog sections by query.
- `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx` (+ `.test.ts`) — the tree sidebar.
- `app/(dashboard)/users/access-analysis/CatalogTreeSection.tsx` — module/group/action collapsible subtree (helper component).

**Modified:**
- `SliderContext.tsx` — catalog id-space, default all-0, drop legacy preset/DIMENSIONS deps, `DimensionId = string`.
- `AccessAnalysisShell.tsx` — build catalog; catalog targets/weights; pass catalog to provider + sidebar; initialSliders all-0 + migration.
- `RightPanelStack.tsx` — render `CatalogSliderSidebar` instead of `SliderSidebar` (one import swap; pass `catalog` prop).

**Reused as-is:** `DimensionSlider.tsx` (slider row), `dimensionCatalog.*`, `catalogTargets.ts`, `catalogWeights.ts`. **Untouched legacy (kept alive):** `dimensionRegistry`, `dimensionGroups`, `dimensionWeights`, `sliderPresets`, `featureTargets`, `nodeColors`, `SliderSidebar.tsx` (orphaned but left for reference until cleanup).

---

## Task 1: `catalogSliders.ts` — slider dim selection + default-all-0

**Files:** Create `catalogSliders.ts` + `catalogSliders.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// catalogSliders.test.ts
import { describe, it, expect } from "vitest";
import { sliderDimensions, sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
import type { CatalogDimension } from "./dimensionCatalog.types";

const dim = (over: Partial<CatalogDimension>): CatalogDimension => ({
  id: "x", label: "X", family: "structure", kind: "categorical", source: "t",
  confidence: "high", available: true, surfaces: ["slider"], extract: () => null, ...over,
});

describe("catalogSliders", () => {
  const catalog = [
    dim({ id: "project", surfaces: ["slider", "color"], available: true }),
    dim({ id: "view-entity", family: "activity", kind: "ordinal", surfaces: ["slider", "color"], available: true }),
    dim({ id: "ghost-action", family: "activity", kind: "ordinal", surfaces: ["slider", "color"], available: false }),
    dim({ id: "folder:size", family: "folder", surfaces: [], available: false }),
    dim({ id: "role", surfaces: ["color"], available: true }), // color-only, not a slider
  ];

  it("sliderDimensions = slider-surfaced AND available (drives physics)", () => {
    expect(sliderDimensions(catalog).map((d) => d.id)).toEqual(["project", "view-entity"]);
  });

  it("sliderDimensionIds covers ALL slider-surfaced dims incl. greyed (for the UI list)", () => {
    expect(sliderDimensionIds(catalog)).toEqual(["project", "view-entity", "ghost-action"]);
  });

  it("catalogDefaultSliders = every available slider dim at 0", () => {
    expect(catalogDefaultSliders(catalog)).toEqual({ "project": 0, "view-entity": 0 });
  });
});
```

- [ ] **Step 2: Run → RED** (`npx vitest run "app/(dashboard)/users/access-analysis/catalogSliders.test.ts"`)

- [ ] **Step 3: Implement**

```ts
// catalogSliders.ts
/**
 * catalogSliders.ts — Slider-dimension selection over the Phase C catalog (Phase E).
 * Pure: no React/DOM/IO.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

/** Slider dims that actually drive physics: slider-surfaced AND available (have data). */
export function sliderDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  return catalog.filter((d) => d.surfaces.includes("slider") && d.available);
}

/** All slider-surfaced ids incl. greyed (no-data) — the UI lists these as disabled rows. */
export function sliderDimensionIds(catalog: readonly CatalogDimension[]): string[] {
  return catalog.filter((d) => d.surfaces.includes("slider")).map((d) => d.id);
}

/** Default state per spec decision #3: every (available) slider at 0. */
export function catalogDefaultSliders(catalog: readonly CatalogDimension[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of sliderDimensions(catalog)) out[d.id] = 0;
  return out;
}
```

- [ ] **Step 4: Run → GREEN.** **Step 5: Commit** `feat(acc-sidebar): catalog slider selection + default-all-0` (paths: `catalogSliders.ts`, `catalogSliders.test.ts`).

---

## Task 2: `catalogSearch.ts` — filter catalog sections by query

**Files:** Create `catalogSearch.ts` + `catalogSearch.test.ts`.

- [ ] **Step 1: Failing test**

```ts
// catalogSearch.test.ts
import { describe, it, expect } from "vitest";
import { filterSections } from "./catalogSearch";
import type { CatalogSection } from "./dimensionCatalog";
import type { CatalogDimension } from "./dimensionCatalog.types";

const d = (id: string, label: string, family: CatalogDimension["family"] = "structure"): CatalogDimension => ({
  id, label, family, kind: "categorical", source: "t", confidence: "high", available: true, surfaces: ["slider"], extract: () => null,
});

const sections: CatalogSection[] = [
  { kind: "structural", label: "Structure & Access", dims: [d("project", "Project"), d("role", "Role")] },
  { kind: "activity", label: "Activity", modules: [
    { moduleId: "build", moduleLabel: "Build", groups: [
      { groupId: "content-change", groupLabel: "Content Change", actions: [d("create-issue", "Create Issue", "activity"), d("delete-issue", "Delete Issue", "activity")] },
    ] },
  ] },
  { kind: "folder", label: "Folder attributes", dims: [d("folder:size", "Folder Size", "folder")] },
];

describe("filterSections", () => {
  it("empty query returns all sections unchanged", () => {
    expect(filterSections(sections, "")).toEqual(sections);
  });
  it("matches structural dims by label", () => {
    const r = filterSections(sections, "proj");
    expect(r.find((s) => s.kind === "structural")!.dims!.map((x) => x.id)).toEqual(["project"]);
  });
  it("matches action labels and prunes empty groups/modules", () => {
    const r = filterSections(sections, "create");
    const act = r.find((s) => s.kind === "activity")!;
    expect(act.modules!.length).toBe(1);
    expect(act.modules![0].groups[0].actions.map((a) => a.id)).toEqual(["create-issue"]);
  });
  it("a query matching a MODULE label keeps all its actions", () => {
    const r = filterSections(sections, "build");
    const act = r.find((s) => s.kind === "activity")!;
    expect(act.modules![0].groups[0].actions.length).toBe(2);
  });
  it("drops sections with no matches", () => {
    const r = filterSections(sections, "zzz");
    expect(r.every((s) => (s.dims?.length ?? 0) === 0 && (s.modules?.length ?? 0) === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Implement**

```ts
// catalogSearch.ts
/**
 * catalogSearch.ts — Filter catalog sections (structural / activity tree / folder) by a
 * case-insensitive substring query over labels. A match on a module/group label keeps that
 * whole branch; otherwise only matching actions are kept and empty groups/modules are pruned.
 * Pure: no React/DOM/IO.
 */
import type { CatalogSection } from "./dimensionCatalog";

const hit = (label: string, q: string) => label.toLowerCase().includes(q);

export function filterSections(sections: readonly CatalogSection[], query: string): CatalogSection[] {
  const q = query.trim().toLowerCase();
  if (q === "") return sections.map((s) => ({ ...s }));
  return sections.map((s) => {
    if (s.kind === "activity") {
      const modules = (s.modules ?? [])
        .map((m) => {
          const moduleHit = hit(m.moduleLabel, q);
          const groups = m.groups
            .map((g) => {
              const groupHit = moduleHit || hit(g.groupLabel, q);
              const actions = groupHit ? g.actions : g.actions.filter((a) => hit(a.label, q));
              return { ...g, actions };
            })
            .filter((g) => g.actions.length > 0);
          return { ...m, groups };
        })
        .filter((m) => m.groups.length > 0);
      return { ...s, modules };
    }
    const dims = (s.dims ?? []).filter((x) => hit(x.label, q));
    return { ...s, dims };
  });
}
```

- [ ] **Step 4: Run → GREEN. Step 5: Commit** `feat(acc-sidebar): catalog section search filter` (paths: `catalogSearch.ts`, `catalogSearch.test.ts`).

---

## Task 3: Migrate `SliderContext.tsx` to the catalog id-space

**Files:** Modify `SliderContext.tsx`. Update/replace `__tests__/SliderContext.test.tsx` if present.

The context becomes catalog-driven: it takes the catalog as a prop, keys values by catalog `id` (`string`), defaults to all-0, and drops the legacy `getDimension`/`SLIDER_DIMENSION_IDS`/`applyPreset`/`detectActivePreset`/`DIMENSIONS` imports. Keep the rAF push, /100 normalization, preview subscription, and localStorage blob (migrating away unknown legacy ids).

- [ ] **Step 1: Read the current file** to preserve the rAF/preview/persistence machinery exactly.

- [ ] **Step 2: Rewrite the provider contract.** Key changes:

Replace the imports block:
```ts
import {
  getDimension,
  SLIDER_DIMENSION_IDS,
} from "./dimensionGroups"; // and dimensionRegistry / sliderPresets imports
```
with:
```ts
import type { CatalogDimension } from "./dimensionCatalog.types";
import { sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
```

Change the id type + exported consts:
```ts
// DimensionId is now an open catalog id (the catalog has ~185 dynamic ids).
export type DimensionId = string;
export const CONTROLS_STORAGE_KEY = "lecg.access-analysis.controls.v1";
```
Remove `DEFAULT_VALUES`, `DIMENSIONS`, and the legacy `migratePersistedSliders` body that referenced legacy ids; replace `migratePersistedSliders` with a catalog-aware filter:
```ts
/** Keep only slider values whose id is a known catalog slider id; drop legacy/unknown ids. */
export function migratePersistedSliders(
  sliders: Record<string, number>,
  knownIds: readonly string[],
): Record<string, number> {
  const known = new Set(knownIds);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(sliders)) {
    if (known.has(k) && typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}
```

Add a `catalog` prop to the provider and derive ids/defaults from it:
```ts
export function SliderProvider({
  physics, catalog, children,
}: { physics: PhysicsLayer; catalog: readonly CatalogDimension[]; children: React.ReactNode }) {
  const ids = useMemo(() => sliderDimensionIds(catalog), [catalog]);
  const defaults = useMemo(() => catalogDefaultSliders(catalog), [catalog]);
  const [values, setValues] = useState<Record<string, number>>(defaults);
  // ...hydrate from localStorage via migratePersistedSliders(stored.sliders, ids) over defaults...
  // ...keep schedulePush/flushToPhysics (/100 normalization), preview subscription, debounced writePersisted...
}
```

Drop `applyPreset`/`activePreset`/`detectActivePreset` from the context value (presets = Phase F). Keep `values`, `setSliderValue`, `resetAll` (→ defaults, i.e. all 0), `resetOne`, `subscribePreviewActive`, `isPreviewActive`. Expose `catalog` (or at least the slider id list) so the sidebar can read it — OR the shell passes catalog to the sidebar directly (see Task 4; prefer passing the catalog as a prop to `CatalogSliderSidebar` from the shell, and only the *values/setters* from context).

- [ ] **Step 3: Update tests** — rewrite `SliderContext.test.tsx` (if present) to construct the provider with a small fake catalog + fake physics, assert: default all-0; `setSliderValue` updates + pushes normalized/100 to `physics.updateSliders`; `resetAll` → all 0; localStorage migration drops unknown ids. (Use the existing test's fake-physics pattern.)

- [ ] **Step 4: Verify** `npx tsc --noEmit` (expect errors ONLY in files Task 5 will fix — `AccessAnalysisShell.tsx`, `RightPanelStack.tsx` — because the provider signature changed; that's expected mid-migration and resolved in Tasks 4–5). Run `npx vitest run "app/(dashboard)/users/access-analysis/__tests__/SliderContext.test.tsx"` → GREEN.

> NOTE: Because Task 3 changes the `SliderProvider` signature (adds required `catalog`), tsc will not be fully clean until Task 5 wires it. Do NOT commit Task 3 alone if it leaves tsc broken — instead, **sequence Tasks 3→4→5 and commit Task 3 together with Task 5's shell wiring** (or stub the shell minimally). The implementer should land Task 3 + Task 5 in one commit if needed to keep `tsc` green per commit. Tasks 1, 2, 4-components can commit independently.

- [ ] **Step 5: Commit** (possibly combined with Task 5) `feat(acc-sidebar): catalog-driven SliderContext (default all-0, id-space migration)`.

---

## Task 4: Catalog tree sidebar (`CatalogSliderSidebar.tsx` + `CatalogTreeSection.tsx`)

**Files:** Create `CatalogSliderSidebar.tsx`, `CatalogTreeSection.tsx`, `CatalogSliderSidebar.test.ts`. Reuse `DimensionSlider.tsx`.

Renders three sections from `getCatalogSections(catalog)`:
1. **Structure & Access** — flat list of the 9 structural dims (always-open), each a `DimensionSlider`.
2. **Activity** — collapsible Module → Group tree; groups collapsed by default; each leaf action is a `DimensionSlider` if `available`, else a **greyed disabled row** ("no data"); active-count badge on collapsed module/group (count of non-zero sliders within).
3. **Folder attributes** — flat list of greyed disabled rows (no slider; `available:false`).

Search box filters via `filterSections`. "Reset all" calls `resetAll()`. ~185 rows: groups default-collapsed keep the rendered DOM small, so **no virtualization initially**; if e2e/manual shows lag, add `react-window` in a follow-up (note only).

- [ ] **Step 1: Failing component test** (`CatalogSliderSidebar.test.ts`) using `@testing-library/react`. Provide a small fake catalog + a fake `SliderProvider` value (or render within a real provider + fake physics). Assert:
  - renders a "Structure & Access" header and a slider row for each structural dim (label + thumb aria-label `"<Label> thumb"`);
  - renders the Activity tree: a module header, a group header (collapsed by default → its action rows not in the DOM until expanded);
  - a greyed action (`available:false`) renders a disabled row with a "no data" tag and **no** interactive slider;
  - typing in the search box filters to matching rows;
  - the "Reset all" button calls the context `resetAll`.

(Model the fake-physics/provider setup on the existing `__tests__/SliderContext.test.tsx` + `GraphCanvas.test.ts` render helpers.)

- [ ] **Step 2: Run → RED.**

- [ ] **Step 3: Implement `CatalogTreeSection.tsx`** (the activity module/group subtree):

```tsx
"use client";
import { useState } from "react";
import { DimensionSlider } from "./DimensionSlider";
import type { CatalogActivityModule } from "./dimensionCatalog";

interface Props {
  modules: CatalogActivityModule[];
  values: Record<string, number>;
  onChange: (id: string, v: number) => void;
  onReset: (id: string) => void;
  /** when searching, force all branches open */
  forceOpen: boolean;
}

export function CatalogTreeSection({ modules, values, onChange, onReset, forceOpen }: Props): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {modules.map((m) => (
        <ModuleNode key={m.moduleId} module={m} values={values} onChange={onChange} onReset={onReset} forceOpen={forceOpen} />
      ))}
    </div>
  );
}

function activeCount(ids: string[], values: Record<string, number>): number {
  return ids.filter((id) => (values[id] ?? 0) > 0).length;
}

function ModuleNode({ module: m, values, onChange, onReset, forceOpen }: { module: CatalogActivityModule } & Omit<Props, "modules">) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const allIds = m.groups.flatMap((g) => g.actions.map((a) => a.id));
  const badge = activeCount(allIds, values);
  return (
    <section data-testid={`catalog-module-${m.moduleId}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
        <span>{m.moduleLabel}{badge > 0 ? <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400">{badge} active</span> : null}</span>
        <span aria-hidden>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? (
        <div className="mt-2 flex flex-col gap-3 pl-2">
          {m.groups.map((g) => (
            <GroupNode key={g.groupId} group={g} values={values} onChange={onChange} onReset={onReset} forceOpen={forceOpen} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function GroupNode({ group: g, values, onChange, onReset, forceOpen }: { group: CatalogActivityModule["groups"][number] } & Omit<Props, "modules">) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const badge = activeCount(g.actions.map((a) => a.id), values);
  return (
    <section data-testid={`catalog-group-${g.groupId}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}
        className="flex w-full items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <span>{g.groupLabel}{badge > 0 ? <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400">{badge}</span> : null}</span>
        <span aria-hidden>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen ? (
        <div className="mt-2 flex flex-col gap-4 pl-2">
          {g.actions.map((a) =>
            a.available ? (
              <DimensionSlider key={a.id} dimId={a.id} label={a.label} value={values[a.id] ?? 0}
                onChange={(v) => onChange(a.id, v)} onReset={() => onReset(a.id)} />
            ) : (
              <DisabledRow key={a.id} label={a.label} />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

export function DisabledRow({ label }: { label: string }): React.JSX.Element {
  return (
    <div data-testid="disabled-dim-row" className="flex items-center justify-between opacity-50">
      <span className="text-sm">{label}</span>
      <span className="rounded bg-zinc-800 px-1.5 text-[10px] uppercase tracking-wide text-zinc-400">no data</span>
    </div>
  );
}
```

- [ ] **Step 4: Implement `CatalogSliderSidebar.tsx`**:

```tsx
"use client";
import { useMemo, useState } from "react";
import { useSliders } from "./SliderContext";
import { DimensionSlider } from "./DimensionSlider";
import { CatalogTreeSection, DisabledRow } from "./CatalogTreeSection";
import { DimensionSearchBox } from "./DimensionSearchBox";
import { getCatalogSections } from "./dimensionCatalog";
import { filterSections } from "./catalogSearch";
import type { CatalogDimension } from "./dimensionCatalog.types";

export function CatalogSliderSidebar({ catalog }: { catalog: readonly CatalogDimension[] }): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne } = useSliders();
  const [query, setQuery] = useState("");
  const sections = useMemo(() => filterSections(getCatalogSections(catalog), query), [catalog, query]);
  const searching = query.trim() !== "";

  const structural = sections.find((s) => s.kind === "structural");
  const activity = sections.find((s) => s.kind === "activity");
  const folder = sections.find((s) => s.kind === "folder");

  return (
    <aside data-testid="catalog-slider-sidebar" className="flex w-96 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
        <button type="button" onClick={resetAll} data-testid="reset-all"
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent">Reset all</button>
      </header>
      <div className="border-b p-4"><DimensionSearchBox query={query} onChange={setQuery} /></div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {structural && structural.dims && structural.dims.length > 0 ? (
          <section data-testid="catalog-section-structural" className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{structural.label}</h3>
            {structural.dims.map((d) =>
              d.available && d.surfaces.includes("slider") ? (
                <DimensionSlider key={d.id} dimId={d.id} label={d.label} value={values[d.id] ?? 0}
                  onChange={(v) => setSliderValue(d.id, v)} onReset={() => resetOne(d.id)} />
              ) : (
                <DisabledRow key={d.id} label={d.label} />
              ),
            )}
          </section>
        ) : null}

        {activity && activity.modules && activity.modules.length > 0 ? (
          <section data-testid="catalog-section-activity" className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{activity.label}</h3>
            <CatalogTreeSection modules={activity.modules} values={values}
              onChange={setSliderValue} onReset={resetOne} forceOpen={searching} />
          </section>
        ) : null}

        {folder && folder.dims && folder.dims.length > 0 ? (
          <section data-testid="catalog-section-folder" className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{folder.label}</h3>
            {folder.dims.map((d) => <DisabledRow key={d.id} label={d.label} />)}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Run → GREEN** (component test). **Step 6: Commit** `feat(acc-sidebar): catalog Module→Group→Action tree sidebar (search, badges, greyed rows, reset-all)` (paths: the 3 new files).

---

## Task 5: Shell cutover — build catalog, catalog targets/weights, wire provider + sidebar

**Files:** Modify `AccessAnalysisShell.tsx` and `RightPanelStack.tsx`. (Land together with Task 3 if needed for per-commit tsc green.)

- [ ] **Step 1:** In `AccessAnalysisShell.tsx`, import the catalog engine + helpers; build the catalog from the snapshot; replace the legacy targets/weights/initialSliders block.

Replace imports:
```ts
import { buildFeatureTargets } from "./featureTargets";
import { buildDimensionWeights } from "./dimensionWeights";
import { SLIDER_DIMENSION_IDS } from "./dimensionGroups";
import { CONTROLS_STORAGE_KEY, DEFAULT_VALUES, DIMENSIONS, SliderProvider, migratePersistedSliders, type DimensionId } from "./SliderContext";
```
with:
```ts
import { buildCatalogTargets } from "./catalogTargets";
import { buildCatalogWeights } from "./catalogWeights";
import { buildDimensionCatalog } from "./dimensionCatalog";
import { sliderDimensions, sliderDimensionIds, catalogDefaultSliders } from "./catalogSliders";
import { CONTROLS_STORAGE_KEY, SliderProvider, migratePersistedSliders } from "./SliderContext";
```

Replace the targets/weights/initialSliders block (current lines ~304–327) with:
```ts
const nodes: SimNode[] = nodeIds.map((id, index) => ({ id, index }));
// Phase E: build the catalog once from the snapshot; drive physics off the
// slider-surfaced, available catalog dims (greyed/no-data dims contribute nothing).
const catalog = buildDimensionCatalog(snapshot);
const sliderDims = sliderDimensions(catalog);          // CatalogDimension[]
const targetDimIds = sliderDims.map((d) => d.id);
const targets = buildCatalogTargets(snapshot, sliderDims);
const dimWeights = buildCatalogWeights(snapshot, sliderDims);

// Default = all sliders 0 (spec decision #3); localStorage overrides per known catalog id.
const knownIds = sliderDimensionIds(catalog);
let initialSliders: Record<string, number> = Object.fromEntries(
  Object.keys(catalogDefaultSliders(catalog)).map((id) => [id, 0]),
);
try {
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { sliders?: Record<string, number> };
      if (parsed.sliders) {
        const migrated = migratePersistedSliders(parsed.sliders, knownIds);
        for (const [id, v] of Object.entries(migrated)) {
          if (id in initialSliders) initialSliders[id] = Math.max(0, Math.min(1, v / 100));
        }
      }
    }
  }
} catch { /* ignore */ }

const layer = await createPhysicsLayerWorker(nodeIds, nodes, targets, targetDimIds, initialSliders, dimWeights);
```

Store `catalog` in component state (alongside `features`/`physics`) so it can be passed to the provider + sidebar. Add `const [catalog, setCatalog] = useState<CatalogDimension[] | null>(null);` and `setCatalog(catalog);` in the async effect; gate the render on `catalog` too.

- [ ] **Step 2:** Wire the provider + sidebar. Change:
```tsx
<SliderProvider physics={physics}>
```
to:
```tsx
<SliderProvider physics={physics} catalog={catalog}>
```
and pass `catalog` down so `ShellBody` → `RightPanelStack` → `CatalogSliderSidebar` receives it. In `RightPanelStack.tsx`, swap `import { SliderSidebar }` → `import { CatalogSliderSidebar }` and render `<CatalogSliderSidebar catalog={catalog} />` (thread a `catalog` prop through `RightPanelStackProps` and `ShellBody`).

- [ ] **Step 3: Verify** `npx tsc --noEmit` → **0 errors** (provider signature now satisfied; no dangling legacy imports in the touched files). Run the full unit suite `npm test` → green.

- [ ] **Step 4: Commit** `feat(acc-sidebar): wire catalog engine + tree sidebar into the shell (default all-0)` (paths: `AccessAnalysisShell.tsx`, `RightPanelStack.tsx`, and `SliderContext.tsx` if combined with Task 3).

---

## Task 6: Gates + e2e + deploy

**Files:** `tests/e2e/acc-sidebar.spec.ts` (new); no source changes unless gates fail.

- [ ] **Step 1:** Add an e2e smoke (`tests/e2e/acc-sidebar.spec.ts`, self-contained helpers like `acc-positioning.spec.ts`): load `/users/access-analysis`; assert `[data-testid="catalog-slider-sidebar"]` renders; the Structure & Access section shows sliders; the Activity tree shows module headers; typing in `[data-testid="dimension-search"]` filters; expand a module→group, move an available action slider, and assert no crash (`getPositionsStats().anyNaN === false`, count intact). (Run via the `:3100` port-free waiter pattern; defer/scope around the concurrent session as in Phase D.)

- [ ] **Step 2: Gates:** `npm test` (unit green), `npx tsc --noEmit` (0), `npx playwright test tests/e2e/acc-sidebar.spec.ts` (green). Scope negative-check: `git log` confirms Phase E commits did NOT modify `dimensionRegistry.ts`/`dimensionWeights.ts`/`sliderPresets.ts` (kept alive) and did NOT touch acc-profile files.

- [ ] **Step 3: Deploy `:3000`** (one-shot, owner's choice): `npm run build`; on success, stop the running `:3000` server and relaunch detached (per the established deploy: `node node_modules/next/dist/bin/next start -H 0.0.0.0 --port 3000`, hidden, logged). Verify `GET /login → 200` and `GET /users/access-analysis` responds. Report the live URL + what to test (the ~185-slider tree; move an action slider → cloud reclusters; search; greyed no-data rows).

---

## Self-Review

**Spec coverage (§11 + §16.E):** pinned "Structure & Access" section ✅ (Task 4); Activity Module→Group→Action tree, groups collapsed by default, active-count badges ✅; search box ✅ (Task 2 + 4); disabled/greyed rows with "no data" ✅; per-slider 0–100 + reset (reused `DimensionSlider`, double-click reset) ✅; "Reset all" ✅; default all-0 ✅ (Tasks 1, 3, 5); engine cutover to catalog targets/weights ✅ (Task 5). Scale: default-collapsed groups keep DOM small; virtualization noted as a follow-up only if needed.

**Out-of-scope honored:** presets (no PresetBar — Phase F), color dropdown (untouched — Phase G), legacy registry deletion (kept alive for color/presets), MASK bus (untouched).

**Placeholder scan:** new pure modules + tree components have full code; context/shell edits are exact before/after against the explored current code. The one judgment call (virtualization) is explicitly deferred with a trigger condition, not a placeholder.

**Type consistency:** `DimensionId = string` (open catalog id); `sliderDimensions`/`sliderDimensionIds`/`catalogDefaultSliders` (Task 1) consumed identically in context (Task 3) + shell (Task 5); `filterSections` (Task 2) consumed in the sidebar (Task 4); `buildCatalogTargets`/`buildCatalogWeights` take `CatalogDimension[]` (Phase D contract) — shell passes `sliderDimensions(catalog)`. Provider gains a required `catalog` prop → Tasks 3+5 must land together for per-commit tsc green (flagged in Task 3).

**Phase-E commit-ordering risk:** Task 3 changes the provider signature → keep Tasks 3 + 5 in one commit (or stub) so `tsc` is green at each commit; Tasks 1, 2, 4-files can commit independently.
