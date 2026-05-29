# Access Slider Sidebar — Polish, Un-package & Folder Reach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the access-analysis dimension sidebar professional/animated with legible grouping (Slice A), split the packaged 0–5 Permission slider into five individual per-tier sliders (Slice B), and light up real per-person folder sliders from data already in the snapshot (Slice C).

**Architecture:** All three slices are frontend/catalog-layer only. The data pipeline already works: `AccessAnalysisShell.tsx:220` requests `includePermissionSummary:true`, so `dcUserAssembly.ts` joins `AccFolderPermission` (role-id join verified alive: 10,416 instances with non-zero folder breadth) and `featureSnapshot.ts` exposes `permissionStrength`, `permissionTypeSummary.folderBreadth/fullController/mixedProfile`. We only change how the catalog *reads* and the sidebar *renders* — no DuckDB/assembly/Prisma changes.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind (zinc dark palette), Radix Slider, framer-motion v12 (already installed), vitest. Catalog files under `app/(dashboard)/users/access-analysis/`.

**Key constraints (from memory + spec):**
- **Surgical staging:** stage by explicit path only, never `-A`/`.`; run `git diff --cached --name-only` before every commit (branch carries large WIP).
- Keep the existing unit suite green (`npm test`) and `tsc` at 0 errors.
- Never animate the whole 204-dim tree at once; collapsed branches stay unmounted; search-driven expand is instant.
- Out of scope (Slice D, separate milestone): ingesting the ~12 uncaptured folder attributes (Size/Version/Issues/Markups/Review/etc.).

---

## File Map

**Slice A (UI):**
- Create `CatalogCollapse.tsx` — framer-motion height/opacity collapse wrapper.
- Modify `DimensionSlider.tsx` — thumb hover/active scale+glow, eased range, emphasized live value badge.
- Modify `CatalogTreeSection.tsx` — animated collapse, rotating chevron, nesting indentation + accent rails, `DisabledRow` tooltip via `reason`.
- Modify `CatalogSliderSidebar.tsx` — sticky section headers, shared flat-dim render rule (slider / skip-color-only / disabled), polished reset button.

**Slice B (permission tiers):**
- Modify `dimensionCatalog.structural.ts` — `permission` → color-only; add 5 per-tier slider dims.
- Modify `dimensionCatalog.structural.test.ts` — new dim set + tier extract tests.

**Slice C (folder reach):**
- Create `dimensionCatalog.folderLive.ts` — 3 live folder dims.
- Modify `dimensionCatalog.types.ts` — add optional `note?: string`.
- Modify `dimensionCatalog.folder.ts` — add `note` to each placeholder (drill-down vs not-collected).
- Modify `dimensionCatalog.ts` — include `buildFolderReachDimensions()`.
- Create `dimensionCatalog.folderLive.test.ts`; update `dimensionCatalog.folder.test.ts` if present.

---

## SLICE A — Polished, animated, clearly-grouped sidebar

### Task A1: Collapse animation wrapper

**Files:**
- Create: `app/(dashboard)/users/access-analysis/CatalogCollapse.tsx`
- Test: `app/(dashboard)/users/access-analysis/CatalogCollapse.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogCollapse } from "./CatalogCollapse";

describe("CatalogCollapse", () => {
  it("renders children when open", () => {
    render(<CatalogCollapse open={true}><div>child-content</div></CatalogCollapse>);
    expect(screen.getByText("child-content")).toBeInTheDocument();
  });
  it("does not render children when closed", () => {
    render(<CatalogCollapse open={false}><div>child-content</div></CatalogCollapse>);
    expect(screen.queryByText("child-content")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CatalogCollapse`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
"use client";
import { AnimatePresence, motion } from "framer-motion";

/** Animated height+opacity collapse for a tree branch. Children unmount when closed
 *  (so the full dim tree never animates at once). Uses the project motion easing. */
export function CatalogCollapse({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CatalogCollapse`
Expected: PASS. (If framer-motion's exit animation leaves the closed-case node briefly in jsdom, the `open={false}` initial render still has no child — assertion holds because `initial={false}` skips enter/exit on first paint.)

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/CatalogCollapse.tsx" "app/(dashboard)/users/access-analysis/CatalogCollapse.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): framer-motion collapse wrapper for catalog tree"
```

---

### Task A2: Polish DimensionSlider (thumb feel + live value badge)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/DimensionSlider.tsx`
- Test: `app/(dashboard)/users/access-analysis/DimensionSlider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DimensionSlider } from "./DimensionSlider";

describe("DimensionSlider", () => {
  it("shows the current value in a readout", () => {
    render(<DimensionSlider dimId="d" label="Reach" value={42} onChange={() => {}} onReset={() => {}} />);
    expect(screen.getByTestId("slider-value-d")).toHaveTextContent("42");
  });
  it("calls onReset on thumb double-click", () => {
    const onReset = vi.fn();
    render(<DimensionSlider dimId="d" label="Reach" value={10} onChange={() => {}} onReset={onReset} />);
    fireEvent.doubleClick(screen.getByLabelText("Reach thumb"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DimensionSlider`
Expected: FAIL — no `slider-value-d` testid yet.

- [ ] **Step 3: Write the implementation** (full file replacement)

```tsx
"use client";

/**
 * DimensionSlider.tsx — single Radix slider per dimension.
 *   - 0–100 range, step 1; emphasized live value badge (updates while dragging)
 *   - thumb scales + glows on hover/active; range fill eases
 *   - double-click thumb to reset; zinc palette per feedback_dark_palette_neutral.md
 */
import * as Slider from "@radix-ui/react-slider";

export interface DimensionSliderProps {
  dimId: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  onReset: () => void;
}

export function DimensionSlider({ dimId, label, value, onChange, onReset }: DimensionSliderProps): React.JSX.Element {
  const active = value > 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span
          data-testid={`slider-value-${dimId}`}
          className={`rounded px-1.5 text-xs tabular-nums transition-colors duration-150 ${
            active ? "bg-blue-500/15 text-blue-300" : "text-muted-foreground"
          }`}
        >
          {value}
        </span>
      </div>
      <Slider.Root
        value={[value]}
        min={0}
        max={100}
        step={1}
        onValueChange={(vs) => onChange(vs[0] ?? 0)}
        className="relative flex h-5 w-full select-none items-center"
        aria-label={`${label} slider`}
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-zinc-800">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500 transition-all duration-150" />
        </Slider.Track>
        <Slider.Thumb
          className="block size-4 rounded-full border-2 border-blue-500 bg-zinc-900 transition-transform duration-150 hover:scale-125 focus:outline-none focus:ring-2 focus:ring-blue-400 active:scale-125 active:shadow-[0_0_8px_2px_rgba(59,130,246,0.6)]"
          onDoubleClick={onReset}
          aria-label={`${label} thumb`}
        />
      </Slider.Root>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- DimensionSlider`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/DimensionSlider.tsx" "app/(dashboard)/users/access-analysis/DimensionSlider.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): polish slider thumb feel + emphasized live value badge"
```

---

### Task A3: CatalogTreeSection — animated collapse, chevron, indentation, tooltip

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/CatalogTreeSection.tsx`

- [ ] **Step 1: Write the failing test** (append to a new test file)

Test: `app/(dashboard)/users/access-analysis/CatalogTreeSection.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DisabledRow } from "./CatalogTreeSection";

describe("DisabledRow", () => {
  it("shows the label and a 'no data' badge", () => {
    render(<DisabledRow label="Folder Size" />);
    expect(screen.getByText("Folder Size")).toBeInTheDocument();
    expect(screen.getByText("no data")).toBeInTheDocument();
  });
  it("exposes the reason as a tooltip title when provided", () => {
    render(<DisabledRow label="Folder Size" reason="Not collected yet" />);
    expect(screen.getByTestId("disabled-dim-row")).toHaveAttribute("title", "Not collected yet");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CatalogTreeSection`
Expected: FAIL — `DisabledRow` doesn't accept `reason` / no `title` attribute.

- [ ] **Step 3: Implement** (full file replacement)

```tsx
"use client";
import { useState } from "react";
import { DimensionSlider } from "./DimensionSlider";
import { CatalogCollapse } from "./CatalogCollapse";
import type { CatalogActivityModule } from "./dimensionCatalog";

interface Props {
  modules: CatalogActivityModule[];
  values: Record<string, number>;
  onChange: (id: string, v: number) => void;
  onReset: (id: string) => void;
  /** when searching, force all branches open (instant — no animation). */
  forceOpen: boolean;
}

function activeCount(ids: string[], values: Record<string, number>): number {
  return ids.filter((id) => (values[id] ?? 0) > 0).length;
}

/** Rotating chevron indicator (no icon dependency; CSS transform). */
function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <span aria-hidden className={`inline-block text-[10px] transition-transform duration-150 ${open ? "rotate-90" : ""}`}>▸</span>
  );
}

export function DisabledRow({ label, reason }: { label: string; reason?: string }): React.JSX.Element {
  return (
    <div
      data-testid="disabled-dim-row"
      title={reason}
      className="flex items-center justify-between opacity-60 transition-opacity hover:opacity-90"
    >
      <span className="text-sm">{label}</span>
      <span className="rounded bg-zinc-800 px-1.5 text-[10px] uppercase tracking-wide text-zinc-400">no data</span>
    </div>
  );
}

function Branch({ open, forceOpen, children }: { open: boolean; forceOpen: boolean; children: React.ReactNode }): React.JSX.Element {
  // Search expansion must be instant (no animation) to avoid jank across many branches.
  if (forceOpen) return <>{open ? children : null}</>;
  return <CatalogCollapse open={open}>{children}</CatalogCollapse>;
}

function GroupNode({
  group: g, values, onChange, onReset, forceOpen,
}: { group: CatalogActivityModule["groups"][number] } & Omit<Props, "modules">): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const badge = activeCount(g.actions.map((a) => a.id), values);
  return (
    <section data-testid={`catalog-group-${g.groupId}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground">
        <Chevron open={isOpen} />
        <span>{g.groupLabel}{badge > 0 ? <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400">{badge}</span> : null}</span>
      </button>
      <Branch open={isOpen} forceOpen={forceOpen}>
        <div className="mt-2 flex flex-col gap-4 border-l border-zinc-800 pl-3 ml-1">
          {g.actions.map((a) =>
            a.available ? (
              <DimensionSlider key={a.id} dimId={a.id} label={a.label} value={values[a.id] ?? 0}
                onChange={(v) => onChange(a.id, v)} onReset={() => onReset(a.id)} />
            ) : (
              <DisabledRow key={a.id} label={a.label} reason={a.source} />
            ),
          )}
        </div>
      </Branch>
    </section>
  );
}

function ModuleNode({
  module: m, values, onChange, onReset, forceOpen,
}: { module: CatalogActivityModule } & Omit<Props, "modules">): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;
  const allIds = m.groups.flatMap((g) => g.actions.map((a) => a.id));
  const badge = activeCount(allIds, values);
  return (
    <section data-testid={`catalog-module-${m.moduleId}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={isOpen}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-foreground hover:text-blue-300">
        <Chevron open={isOpen} />
        <span>{m.moduleLabel}{badge > 0 ? <span className="ml-2 rounded-full bg-blue-500/15 px-1.5 text-[10px] text-blue-400">{badge} active</span> : null}</span>
      </button>
      <Branch open={isOpen} forceOpen={forceOpen}>
        <div className="mt-2 flex flex-col gap-3 border-l border-zinc-800/60 pl-3 ml-1">
          {m.groups.map((g) => (
            <GroupNode key={g.groupId} group={g} values={values} onChange={onChange} onReset={onReset} forceOpen={forceOpen} />
          ))}
        </div>
      </Branch>
    </section>
  );
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
```

- [ ] **Step 4: Run tests**

Run: `npm test -- CatalogTreeSection`
Expected: PASS. Also run `npm test -- CatalogSliderSidebar` to confirm the existing sidebar tests still pass (DisabledRow import unchanged).

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/CatalogTreeSection.tsx" "app/(dashboard)/users/access-analysis/CatalogTreeSection.test.tsx"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): animated tree collapse, chevron, indentation rails, disabled-row tooltip"
```

---

### Task A4: CatalogSliderSidebar — sticky headers, shared flat-dim render rule, polished reset

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx`

This task establishes the render rule that Slices B and C rely on:
- slider-surfaced + available → `DimensionSlider`
- slider-surfaced + NOT available → `DisabledRow` with `reason`
- NOT slider-surfaced + available (color-only, e.g. `permission` after Slice B) → **skip** (it's a color mode, not a slider)
- NOT slider-surfaced + NOT available (folder placeholders) → `DisabledRow` with `reason`

- [ ] **Step 1: Write the failing test**

Test: `app/(dashboard)/users/access-analysis/CatalogSliderSidebar.test.tsx` (add cases; keep existing ones)

```tsx
import { describe, it, expect } from "vitest";
import { renderFlatDim } from "./CatalogSliderSidebar";
import type { CatalogDimension } from "./dimensionCatalog.types";

const base: CatalogDimension = {
  id: "x", label: "X", family: "access", kind: "ordinal", source: "src",
  confidence: "high", available: true, surfaces: ["slider"], extract: () => 0,
};
const noop = () => {};

describe("renderFlatDim", () => {
  it("skips available color-only dims (returns null)", () => {
    const colorOnly = { ...base, surfaces: ["color"] as ("slider" | "color")[] };
    expect(renderFlatDim(colorOnly, {}, noop, noop)).toBeNull();
  });
  it("returns an element for an available slider dim", () => {
    expect(renderFlatDim(base, {}, noop, noop)).not.toBeNull();
  });
  it("returns an element (disabled) for an unavailable dim", () => {
    expect(renderFlatDim({ ...base, available: false, surfaces: [] }, {}, noop, noop)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CatalogSliderSidebar`
Expected: FAIL — `renderFlatDim` not exported.

- [ ] **Step 3: Implement** (full file replacement)

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

/** Shared render rule for the flat (structural / folder) sections.
 *  Returns null for available color-only dims (they belong to the color picker, not the slider list). */
export function renderFlatDim(
  d: CatalogDimension,
  values: Record<string, number>,
  setSlider: (id: string, v: number) => void,
  resetSlider: (id: string) => void,
): React.JSX.Element | null {
  const isSlider = d.surfaces.includes("slider");
  if (isSlider && d.available) {
    return (
      <DimensionSlider key={d.id} dimId={d.id} label={d.label} value={values[d.id] ?? 0}
        onChange={(v) => setSlider(d.id, v)} onReset={() => resetSlider(d.id)} />
    );
  }
  if (!d.available) {
    return <DisabledRow key={d.id} label={d.label} reason={d.note ?? d.source} />;
  }
  return null; // available but color-only → not a slider
}

export function CatalogSliderSidebar({ catalog }: { catalog: readonly CatalogDimension[] }): React.JSX.Element {
  const { values, setSliderValue, resetAll, resetOne } = useSliders();
  const setSlider = setSliderValue;
  const resetSlider = resetOne;
  const [query, setQuery] = useState("");
  const sections = useMemo(() => filterSections(getCatalogSections(catalog), query), [catalog, query]);
  const searching = query.trim() !== "";

  const structural = sections.find((s) => s.kind === "structural");
  const activity = sections.find((s) => s.kind === "activity");
  const folder = sections.find((s) => s.kind === "folder");

  const headerCls = "sticky top-0 z-10 bg-card py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <aside data-testid="catalog-slider-sidebar" className="flex w-96 shrink-0 flex-col border-l bg-card">
      <header className="flex items-center justify-between border-b p-4">
        <h2 className="text-sm font-semibold">Dimensions</h2>
        <button type="button" onClick={resetAll} data-testid="reset-all"
          className="rounded-md border px-2 py-1 text-xs transition-colors hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-300">
          Reset all
        </button>
      </header>
      <div className="border-b p-4"><DimensionSearchBox query={query} onChange={setQuery} /></div>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
        {structural && structural.dims && structural.dims.length > 0 ? (
          <section data-testid="catalog-section-structural" className="flex flex-col gap-4">
            <h3 className={headerCls}>{structural.label}</h3>
            {structural.dims.map((d) => renderFlatDim(d, values, setSlider, resetSlider))}
          </section>
        ) : null}
        {activity && activity.modules && activity.modules.length > 0 ? (
          <section data-testid="catalog-section-activity" className="flex flex-col gap-3">
            <h3 className={headerCls}>{activity.label}</h3>
            <CatalogTreeSection modules={activity.modules} values={values}
              onChange={setSlider} onReset={resetSlider} forceOpen={searching} />
          </section>
        ) : null}
        {folder && folder.dims && folder.dims.length > 0 ? (
          <section data-testid="catalog-section-folder" className="flex flex-col gap-3">
            <h3 className={headerCls}>{folder.label}</h3>
            {folder.dims.map((d) => renderFlatDim(d, values, setSlider, resetSlider))}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
```

**PREREQUISITE (do this first, inside Task A4):** `renderFlatDim` reads `d.note`, so add the optional field to the type now — it is inert until Slice C populates it. In `app/(dashboard)/users/access-analysis/dimensionCatalog.types.ts`, after `confidence: DimConfidence;` add:

```ts
  /** Optional human explanation for a greyed/disabled row (shown as tooltip). */
  note?: string;
```

Commit it together with the sidebar change below. (Task C1 then becomes a no-op verification that this field exists.)

- [ ] **Step 4: Run tests**

Run: `npm test -- CatalogSliderSidebar` then `npm test -- access-analysis` (the dir) and `npx tsc --noEmit`
Expected: PASS / 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/CatalogSliderSidebar.tsx" "app/(dashboard)/users/access-analysis/CatalogSliderSidebar.test.tsx" "app/(dashboard)/users/access-analysis/dimensionCatalog.types.ts"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): sticky section headers + shared flat-dim render rule + polished reset + note field"
```

---

## SLICE B — Un-package the Permission slider into per-tier sliders

### Task B1: per-tier permission dims + permission becomes color-only

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts`
- Modify: `app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts`

- [ ] **Step 1: Update the failing test first**

Replace the two affected `it(...)` blocks and add tier tests:

```ts
  it("declares the 9 structural dims + 5 permission tiers", () => {
    expect(Object.keys(byId).sort()).toEqual(
      [
        "admin", "company", "internalExternal", "moduleAccess",
        "permission", "permission:fullController", "permission:viewDownload",
        "permission:viewDownloadUpload", "permission:viewDownloadUploadEdit", "permission:viewOnly",
        "project", "role", "status", "tenure",
      ].sort(),
    );
  });

  it("permission is now color-only (not a slider)", () => {
    expect(byId.permission.surfaces).toEqual(["color"]);
    expect(byId.permission.available).toBe(true);
  });

  it("each permission tier is a slider-only one-hot on permissionStrength", () => {
    const tiers = [
      ["permission:viewOnly", 1], ["permission:viewDownload", 2], ["permission:viewDownloadUpload", 3],
      ["permission:viewDownloadUploadEdit", 4], ["permission:fullController", 5],
    ] as const;
    for (const [id, strength] of tiers) {
      expect(byId[id].surfaces).toEqual(["slider"]);
      expect(byId[id].extract(node({ permissionStrength: strength }))).toBe(1);
      expect(byId[id].extract(node({ permissionStrength: strength === 5 ? 4 : strength + 1 }))).toBe(0);
      expect(byId[id].extract(node({ permissionStrength: 0 }))).toBe(0);
    }
  });
```

Also update the existing "all structural dims are available and slider+color surfaced" test (it will now fail for the color-only `permission`). Replace it with:

```ts
  it("all dims are available; tiers are slider-only, permission is color-only", () => {
    for (const d of buildStructuralDimensions()) {
      expect(d.available).toBe(true);
      if (d.id === "permission") expect(d.surfaces).toEqual(["color"]);
      else expect(d.surfaces.includes("slider")).toBe(true);
    }
  });
```

(Remove the old `it("permission is an ordinal 0..5 strength", ...)` block, or keep it — `byId.permission` still extracts `permissionStrength`; only its surfaces changed. KEEP it; it still passes.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dimensionCatalog.structural`
Expected: FAIL — tier ids missing; permission still has `["slider","color"]`.

- [ ] **Step 3: Implement**

In `dimensionCatalog.structural.ts`, add the import:

```ts
import { ACCESS_LEVELS } from "./accTaxonomyStatic";
```

Change the `permission` dim's `surfaces` from `["slider", "color"]` to `["color"]` (keep everything else; it remains a color mode):

```ts
    {
      id: "permission", label: "Permission level", family: "access", kind: "ordinal",
      source: "MAX folder-grant strength 0..5 (access ladder)", confidence: "medium", available: true,
      surfaces: ["color"], colorScale: "ordered",
      extract: (f) => f.permissionStrength ?? 0, // color mode only; per-tier sliders below
    },
```

Then, inside the returned array (immediately after the `permission` object), spread the five tier dims:

```ts
    ...ACCESS_LEVELS.filter((lvl) => lvl.strength >= 1).map((lvl): CatalogDimension => ({
      id: `permission:${lvl.id}`,
      label: lvl.label,
      family: "access",
      kind: "ordinal",
      source: `permissionStrength === ${lvl.strength} (one-hot, ${lvl.permType})`,
      confidence: "medium",
      available: true,
      surfaces: ["slider"],
      extract: (f) => ((f.permissionStrength ?? 0) === lvl.strength ? 1 : 0),
    })),
```

(The `: CatalogDimension` return annotation keeps `surfaces: ["slider"]` correctly typed.)

- [ ] **Step 4: Run tests**

Run: `npm test -- dimensionCatalog.structural` then `npx tsc --noEmit`
Expected: PASS / 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/dimensionCatalog.structural.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.structural.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): split packaged Permission into 5 per-tier sliders (permission stays color-only)"
```

---

## SLICE C — Light up folder sliders from existing snapshot data

### Task C1: confirm the `note` field exists (added in Task A4)

- [ ] **Step 1:** Verify `note?: string` is present on `CatalogDimension` in `dimensionCatalog.types.ts` (added as the A4 prerequisite). If A4 was skipped, add it now (see A4 prerequisite block) and commit by explicit path. Otherwise this task is a no-op.

### Task C2: live folder-reach dimensions

**Files:**
- Create: `app/(dashboard)/users/access-analysis/dimensionCatalog.folderLive.ts`
- Test: `app/(dashboard)/users/access-analysis/dimensionCatalog.folderLive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildFolderReachDimensions } from "./dimensionCatalog.folderLive";
import type { NodeFeatureSnapshot } from "./interactionTypes";

function node(over: Partial<NodeFeatureSnapshot> = {}): NodeFeatureSnapshot {
  return {
    nodeId: "u::p", nameLower: "n", emailLower: "e", project: "P", role: "R",
    permTier: null, isExternal: false, affiliation: "internal",
    activityBucket: "None", signinBucket: ">90d", activityCountRaw: 0, lastSignInRel: "Never",
    permissionCoverage: "known", firmName: "", accountStatus: "active",
    permissionTypeSummary: { folderBreadth: 12, coverage: "known", mixedProfile: true, fullController: true },
    ...over,
  } as NodeFeatureSnapshot;
}

describe("buildFolderReachDimensions", () => {
  const byId = Object.fromEntries(buildFolderReachDimensions().map((d) => [d.id, d]));

  it("declares 3 live folder dims, all available + slider-surfaced", () => {
    expect(Object.keys(byId).sort()).toEqual(["folder:controller", "folder:mixed", "folder:reach"]);
    for (const d of buildFolderReachDimensions()) {
      expect(d.family).toBe("folder");
      expect(d.available).toBe(true);
      expect(d.surfaces).toContain("slider");
    }
  });
  it("folder:reach extracts folderBreadth (0 when missing)", () => {
    expect(byId["folder:reach"].extract(node({ permissionTypeSummary: { folderBreadth: 12, coverage: "known", mixedProfile: false, fullController: false } }))).toBe(12);
    expect(byId["folder:reach"].extract(node({ permissionTypeSummary: undefined }))).toBe(0);
  });
  it("folder:controller and folder:mixed are binary", () => {
    expect(byId["folder:controller"].extract(node())).toBe("controller");
    expect(byId["folder:controller"].extract(node({ permissionTypeSummary: { folderBreadth: 0, coverage: "unknown", mixedProfile: false, fullController: false } }))).toBe("limited");
    expect(byId["folder:mixed"].extract(node())).toBe("mixed");
    expect(byId["folder:mixed"].extract(node({ permissionTypeSummary: { folderBreadth: 0, coverage: "unknown", mixedProfile: false, fullController: false } }))).toBe("uniform");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- folderLive`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Live folder-derived dimensions — real per-(user,project) aggregates over the folders
 * a person can reach (via role → AccFolderPermission). Data already flows through
 * featureSnapshot.permissionTypeSummary (verified: 10,416 instances with non-zero reach),
 * so these need NO pipeline change. Distinct from the 19 greyed acc.xlsx folder identities.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

export function buildFolderReachDimensions(): CatalogDimension[] {
  return [
    {
      id: "folder:reach", label: "Folders they can open", family: "folder", kind: "ordinal",
      source: "permissionTypeSummary.folderBreadth (distinct folders reachable via role grants)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "ordered",
      extract: (f) => f.permissionTypeSummary?.folderBreadth ?? 0,
    },
    {
      id: "folder:controller", label: "Folders they control", family: "folder", kind: "binary",
      source: "permissionTypeSummary.fullController (has a Full Controller grant)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.permissionTypeSummary?.fullController ? "controller" : "limited"),
    },
    {
      id: "folder:mixed", label: "Mixed folder permissions", family: "folder", kind: "binary",
      source: "permissionTypeSummary.mixedProfile (>1 distinct tier across reachable folders)",
      confidence: "medium", available: true, surfaces: ["slider", "color"], colorScale: "categorical",
      extract: (f) => (f.permissionTypeSummary?.mixedProfile ? "mixed" : "uniform"),
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- folderLive`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/dimensionCatalog.folderLive.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.folderLive.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): live folder-reach dimensions (reach/controller/mixed) from existing snapshot"
```

### Task C3: tag the 19 placeholders + wire live dims into the catalog

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/dimensionCatalog.folder.ts`
- Modify: `app/(dashboard)/users/access-analysis/dimensionCatalog.ts`

- [ ] **Step 1: Write the failing test** (add to folderLive test or a new catalog test)

Test: `app/(dashboard)/users/access-analysis/dimensionCatalog.folder.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildFolderAttributeDimensions } from "./dimensionCatalog.folder";
import { buildDimensionCatalog } from "./dimensionCatalog";

describe("folder placeholders + catalog wiring", () => {
  it("all 19 placeholders are disabled and carry a note", () => {
    const dims = buildFolderAttributeDimensions();
    expect(dims).toHaveLength(19);
    for (const d of dims) {
      expect(d.available).toBe(false);
      expect(typeof d.note).toBe("string");
      expect(d.note!.length).toBeGreaterThan(0);
    }
  });
  it("catalog includes the 3 live folder dims as available", () => {
    const byId = Object.fromEntries(buildDimensionCatalog().map((d) => [d.id, d]));
    expect(byId["folder:reach"].available).toBe(true);
    expect(byId["folder:controller"].available).toBe(true);
    expect(byId["folder:mixed"].available).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dimensionCatalog.folder`
Expected: FAIL — placeholders have no `note`; catalog has no live folder dims.

- [ ] **Step 3: Implement — `dimensionCatalog.folder.ts`** (full file replacement)

```ts
/**
 * Folder-attribute dimensions from acc.xlsx — carried as ALWAYS-DISABLED placeholders so the
 * full excel structure stays visible, greyed. Two reasons (shown as tooltip via `note`):
 *  - "drill-down": data exists per-folder (AccFolder/AccFolderPermission) but is a folder
 *    identity, not a per-person value — see the folder drill-down view, not a node slider.
 *  - "not collected yet": not captured in Prisma today (Slice D ingestion milestone).
 * Live per-person folder AGGREGATES live in dimensionCatalog.folderLive.ts.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

const DRILL_DOWN = "Per-folder identity (we have this data) — see the folder drill-down, not a per-person slider.";
const NOT_COLLECTED = "Not collected yet — needs the folder-attribute ingestion milestone (Slice D).";

/** label -> note bucket. */
const FOLDER_ATTRIBUTES: ReadonlyArray<readonly [string, string]> = [
  ["Folder ID", DRILL_DOWN],
  ["Folder Name", DRILL_DOWN],
  ["Folder Path", DRILL_DOWN],
  ["Folder Roles", DRILL_DOWN],
  ["Folder Roles Name", DRILL_DOWN],
  ["Folder Role Permissions", DRILL_DOWN],
  ["Folder Roles Users by Name", DRILL_DOWN],
  ["Folder Description", NOT_COLLECTED],
  ["Folder Indicators", NOT_COLLECTED],
  ["Folder Issues", NOT_COLLECTED],
  ["Folder Markups", NOT_COLLECTED],
  ["Folder Size", NOT_COLLECTED],
  ["Folder Version", NOT_COLLECTED],
  ["Last Updated", NOT_COLLECTED],
  ["Review Status", NOT_COLLECTED],
  ["Revision", NOT_COLLECTED],
  ["Updated By", NOT_COLLECTED],
  ["Version Added By", NOT_COLLECTED],
  ["Inherit Permissions?", NOT_COLLECTED],
];

const slug = (s: string): string =>
  "folder:" + s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function buildFolderAttributeDimensions(): CatalogDimension[] {
  return FOLDER_ATTRIBUTES.map(([label, note]) => ({
    id: slug(label),
    label,
    family: "folder" as const,
    kind: "categorical" as const,
    source: "AccFolder / AccFolderPermission (per-folder; no per-node value)",
    note,
    confidence: "low" as const,
    available: false,
    surfaces: [] as ("slider" | "color")[],
    extract: () => null,
  }));
}
```

(Note: the 19 entries are exactly the acc.xlsx folder attributes; order changed for grouping but the set is identical — the count test guards 19.)

- [ ] **Step 4: Implement — `dimensionCatalog.ts`** (wire live dims)

Add import near the others:

```ts
import { buildFolderReachDimensions } from "./dimensionCatalog.folderLive";
```

In `buildDimensionCatalog`, add the live folder dims to the returned array (place them before the placeholders so live sliders sort to the top of the folder section):

```ts
  return [
    ...buildStructuralDimensions(),
    ...buildActionDimensions(availability),
    ...buildFolderReachDimensions(),
    ...buildFolderAttributeDimensions(),
  ];
```

- [ ] **Step 5: Run tests**

Run: `npm test -- dimensionCatalog` then `npx tsc --noEmit`
Expected: PASS / 0 errors. If a test elsewhere hardcodes a folder-dim count of 19 or a total of 204, update it to 22 folder dims / 207 total (3 new live dims). Search: `grep -rn "204\|folder.*19\|19.*folder" app/(dashboard)/users/access-analysis/*.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add -- "app/(dashboard)/users/access-analysis/dimensionCatalog.folder.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.ts" "app/(dashboard)/users/access-analysis/dimensionCatalog.folder.test.ts"
git diff --cached --name-only
git commit -m "feat(acc-sidebar): tag 19 folder placeholders with reason + wire 3 live folder dims into catalog"
```

---

## Final verification (do not skip)

- [ ] **Full unit suite + types**

Run: `npm test` and `npx tsc --noEmit`
Expected: full suite green (was ~1272+), 0 type errors. Fix any count assertions surfaced.

- [ ] **E2E smoke**

Run: `npm run test:e2e` (on :3100 with `NEXT_PUBLIC_ACC_GRAPH_TEST`). The lasso-drag flake is a known machine-load issue, NOT a regression — re-run on an idle machine if it times out.

- [ ] **Real-data sanity (Slice C)**

Confirm `folder:reach` has a real non-zero distribution (already proven at plan time: 10,416 instances with reach>0; sample breadths 1–101, strengths 4–5). Optionally re-verify with a throwaway Prisma script joining `AccDcProjectUserRole → AccFolderPermission → AccFolder` (delete the script after). Visually confirm in the running app that the Folder section now shows live "Folders they can open / control / Mixed" sliders above the greyed (tooltipped) placeholders, and that the Permission section shows five tier sliders.

- [ ] **Visual sanity (Slice A)**

In the running app: expand/collapse a module — smooth, not janky; drag a slider — thumb scales/glows, value badge updates live; greyed rows show a tooltip on hover; section headers stick while scrolling.
