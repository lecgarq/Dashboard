# Spatial Graph: Three Color & Grouping Presets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the `/users/spatial-graph` projector map's Group-by and Color-by pickers to exactly three independent presets — User name, Project, Role — defaulting to Role, while preserving the current free-scatter load.

**Architecture:** Subtract from two option lists rather than rewire engines. Grouping reads `dimensionCatalog` (already has user/project/role); coloring reads the legacy `DIMENSION_REGISTRY` (has project/role, lacks user — so `user` is added as an explicit color mode). The map keeps loading as a scatter by seeding the projector's grouping strength to 0 (flag-OFF) while the parked 3D mode (flag-ON) keeps its `60` settle-on-load.

**Tech Stack:** TypeScript, React, Vitest. Pure helpers (`groupByDimensions.ts`, `nodeColors.ts`, `catalogSliders.ts`) are unit-tested; React wiring (`SliderContext.tsx`, `AccessAnalysisShell.tsx`) is verified by the regression suite + `tsc`.

---

## File Structure

- `app/(dashboard)/users/access-analysis/groupByDimensions.ts` — allowlist the Group-by picker to `{role, project, user}`, default `role`. (modify)
- `app/(dashboard)/users/access-analysis/groupByDimensions.test.ts` — assert the three-preset list + default. (modify)
- `app/(dashboard)/users/access-analysis/nodeColors.ts` — `COLOR_MODES = [role, project, user]`; add `user` as an extra color mode (reads `f.userName`); ensure labels. (modify)
- `app/(dashboard)/users/access-analysis/nodeColors.test.ts` — rewrite COLOR_MODES-content assertions; add color-by-user tests; keep the generic helper tests. (modify)
- `app/(dashboard)/users/access-analysis/catalogSliders.ts` — parameterize the primary grouping strength (default unchanged). (modify)
- `app/(dashboard)/users/access-analysis/catalogSliders.test.ts` — add a "strength 0 → all sliders 0" case. (modify)
- `app/(dashboard)/users/access-analysis/SliderContext.tsx` — seed the primary strength to `0` when the 3D flag is OFF (projector loads as scatter). (modify)
- `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx` — color picker defaults to `role` and reset returns to `role` (independent of grouping); refresh the stale default-group comment. (modify)

---

### Task 1: Restrict Group-by to role / project / user (default role)

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/groupByDimensions.ts`
- Test: `app/(dashboard)/users/access-analysis/groupByDimensions.test.ts`

- [ ] **Step 1: Rewrite the test expectations**

Replace the entire `describe("groupByDimensions", ...)` block (lines 13-43) with:

```ts
describe("groupByDimensions", () => {
  it("offers ONLY the three presets (role, project, user), dropping everything else", () => {
    const catalog = [
      dim("role", "categorical"),
      dim("project", "categorical"),
      dim("user", "categorical"),
      dim("company", "categorical"),       // dropped (not a preset)
      dim("permission", "ordinal"),        // dropped
      dim("tenure", "ordinal"),            // dropped
      dim("internalExternal", "binary"),   // dropped
    ];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role", "project", "user"]);
  });

  it("drops an unavailable preset dim", () => {
    const catalog = [dim("role", "categorical"), dim("user", "categorical", false)];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role"]);
  });

  it("orders role first, then project, then user, regardless of catalog order", () => {
    const catalog = [dim("user", "categorical"), dim("project", "categorical"), dim("role", "categorical")];
    expect(groupByDimensions(catalog).map((d) => d.id)).toEqual(["role", "project", "user"]);
  });

  it("defaultGroupBy returns 'role' when present, or 'role' when empty", () => {
    expect(defaultGroupBy([dim("project", "categorical"), dim("role", "categorical"), dim("user", "categorical")])).toBe("role");
    expect(defaultGroupBy([])).toBe("role");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts"`
Expected: FAIL — current impl still includes company/permission/tenure and orders company first.

- [ ] **Step 3: Rewrite `groupByDimensions.ts`**

Replace the whole file body (keep the file header comment, update it) with:

```ts
/**
 * groupByDimensions.ts — The projector map's "Group by" picker offers exactly three
 * presets: Role (default), Project, User name. Everything else in the catalog is
 * intentionally not offered here (the controls were pared down to these three).
 * Pure.
 */
import type { CatalogDimension } from "./dimensionCatalog.types";

/** The only dims the picker offers, in display order. Index 0 (role) is the default. */
const PRESETS = ["role", "project", "user"];
const PRESET_SET = new Set(PRESETS);

function isGroupable(d: CatalogDimension): boolean {
  return d.available && PRESET_SET.has(d.id);
}

export function groupByDimensions(catalog: readonly CatalogDimension[]): CatalogDimension[] {
  const rank = (id: string): number => {
    const i = PRESETS.indexOf(id);
    return i < 0 ? PRESETS.length : i;
  };
  return catalog.filter(isGroupable).sort((a, b) => rank(a.id) - rank(b.id));
}

export function defaultGroupBy(catalog: readonly CatalogDimension[]): string {
  return groupByDimensions(catalog)[0]?.id ?? "role";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/groupByDimensions.ts" "app/(dashboard)/users/access-analysis/groupByDimensions.test.ts"
git commit -m "feat(spatial-graph): restrict Group-by to role/project/user (default role)"
```

---

### Task 2: Restrict Color-by to role / project / user + add the `user` color mode

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/nodeColors.ts:51-83` (modes, labels, categoryForColor)
- Test: `app/(dashboard)/users/access-analysis/nodeColors.test.ts`

- [ ] **Step 1: Rewrite the COLOR_MODES-content tests and add color-by-user tests**

In `nodeColors.test.ts`, replace the `describe("color mode metadata", ...)` block (lines 98-119) with:

```ts
describe("color mode metadata", () => {
  it("offers exactly the three presets in order: role (default), project, user", () => {
    expect([...COLOR_MODES]).toEqual(["role", "project", "user"]);
  });

  it("no longer offers the removed modes (cluster, company, internalExternal, riskScore)", () => {
    for (const removed of ["cluster", "company", "internalExternal", "riskScore", "tier", "status"]) {
      expect(COLOR_MODES).not.toContain(removed);
    }
  });

  it("provides a non-empty label for every offered mode", () => {
    for (const mode of COLOR_MODES) {
      expect(COLOR_MODE_LABELS[mode]).toBeTruthy();
      expect(typeof COLOR_MODE_LABELS[mode]).toBe("string");
    }
  });

  it("labels the three presets for humans", () => {
    expect(COLOR_MODE_LABELS.role).toBe("Role");
    expect(COLOR_MODE_LABELS.project).toBe("Project");
    expect(COLOR_MODE_LABELS.user).toBe("User name");
  });
});

describe("color by user name", () => {
  it("categoryForColor buckets by userName, with a stable placeholder when absent", () => {
    expect(categoryForColor(feature({ userName: "Ana Ruiz" }), "user")).toBe("Ana Ruiz");
    expect(categoryForColor(feature({ userName: undefined }), "user")).toBe("(unknown)");
    expect(categoryForColor(feature({ userName: "" }), "user")).toBe("(unknown)");
  });

  it("buildNodeColors gives same-name users the same color and different names different colors", () => {
    const features = [
      feature({ userName: "Ana" }),
      feature({ userName: "Beto" }),
      feature({ userName: "Ana" }),
    ];
    const buf = buildNodeColors(features, "user");
    expect(rgba(buf, 0)).toEqual(rgba(buf, 2)); // both "Ana"
    expect(rgba(buf, 0)).not.toEqual(rgba(buf, 1)); // Ana vs Beto
  });
});
```

Then DELETE the now-obsolete blocks that assert removed modes are present:
- `describe("nodeColors — registry-derived modes", ...)` — delete ONLY its first test `it("every categorical/binary registry dim is an available color mode", ...)` (lines 204-209). Keep the other three tests in that block (descriptor.extract delegation for `role`, the `status` helper, and the `external`→`internalExternal` migration) — those exercise still-valid helpers.
- `describe("nodeColors — P6 capability-based color modes", ...)` (lines 240-247) — delete the whole block (asserts riskScore/permissionStrength/activityMix are offered modes; they no longer are).

Leave every other test as-is. (`buildNodeColors shape` now iterates the 3 presets; the `riskScore`/`activityMix` ramp tests pass modes directly to `buildNodeColors`, which still handles any registry dim, so they stay green.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/nodeColors.test.ts"`
Expected: FAIL — `COLOR_MODES` still leads with `cluster`; `categoryForColor(..., "user")` returns `"(none)"`; `user` has no label.

- [ ] **Step 3: Implement the three-preset color modes**

In `nodeColors.ts`, change `EXTRA_COLOR_MODES` (line 51) to include `user`:

```ts
const EXTRA_COLOR_MODES = ["cluster", "status", "user"] as const;
```

Replace the `COLOR_MODES` declaration (lines 55-63) with:

```ts
// Exactly three presets for the projector map: Role (default), Project, User name.
// Other dims remain valid for the helpers below but are no longer offered in the UI.
export const COLOR_MODES: readonly ColorMode[] = ["role", "project", "user"];
```

Replace the `COLOR_MODE_LABELS` declaration (lines 66-71) with (explicit `project`/`user` so labels never depend on a registry color-surface):

```ts
/** Human-readable labels for the Toolbar color-mode selector. */
export const COLOR_MODE_LABELS: Record<ColorMode, string> = {
  ...Object.fromEntries(COLORABLE_DIM_IDS.map((id) => [id, getDimension(id)!.label])),
  cluster: "Cluster",
  company: "Company",
  status: "Account status",
  project: "Project",
  user: "User name",
} as Record<ColorMode, string>;
```

Add a `user` branch to `categoryForColor` (after the `status` branch, line 76):

```ts
  if (mode === "user") return f.userName ? f.userName : "(unknown)";
```

(`migrateColorMode` is unchanged: any stored value not in the new `COLOR_MODES` already falls back to `"role"`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/nodeColors.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/nodeColors.ts" "app/(dashboard)/users/access-analysis/nodeColors.test.ts"
git commit -m "feat(spatial-graph): restrict Color-by to role/project/user (+ user color mode)"
```

---

### Task 3: Preserve free-scatter load + default color to Role

**Files:**
- Modify: `app/(dashboard)/users/access-analysis/catalogSliders.ts:25-33`
- Test: `app/(dashboard)/users/access-analysis/catalogSliders.test.ts`
- Modify: `app/(dashboard)/users/access-analysis/SliderContext.tsx:29,165-166`
- Modify: `app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx:140-147,240-245`

- [ ] **Step 1: Add the failing test for the parameterized seed**

Append to the `describe("catalogDefaultSliders default grouping", ...)` block in `catalogSliders.test.ts` (after line 59):

```ts
  it("seeds the primary at the given strength; 0 leaves everything loose (projector scatter)", () => {
    const cat = [sliderDim("role"), sliderDim("project"), sliderDim("user")];
    const seeded = catalogDefaultSliders(cat, 0);
    expect(Object.values(seeded).every((v) => v === 0)).toBe(true);
    const at40 = catalogDefaultSliders(cat, 40);
    expect(at40.role).toBe(40);
    expect(at40.project).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/catalogSliders.test.ts"`
Expected: FAIL — `catalogDefaultSliders` takes no second argument yet.

- [ ] **Step 3: Parameterize `catalogDefaultSliders`**

In `catalogSliders.ts`, change the signature and the seed line (lines 25-32):

```ts
export function catalogDefaultSliders(
  catalog: readonly CatalogDimension[],
  primaryStrength: number = GROUPING_DEFAULT,
): Record<string, number> {
  const dims = sliderDimensions(catalog);                  // available sliders only
  const out: Record<string, number> = {};
  for (const d of dims) out[d.id] = 0;
  const has = (id: string): boolean => dims.some((d) => d.id === id);
  const primary = has("role") ? "role" : has("project") ? "project" : null;
  if (primary) out[primary] = primaryStrength;
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "app/(dashboard)/users/access-analysis/catalogSliders.test.ts"`
Expected: PASS (existing tests still pass — the default arg keeps `60`).

- [ ] **Step 5: Seed the projector to load as scatter (flag-OFF)**

In `SliderContext.tsx`, update the import on line 29 and add the flag import:

```ts
import { sliderDimensionIds, catalogDefaultSliders, GROUPING_DEFAULT } from "./catalogSliders";
import { ACC_3D_GRAPH_ENABLED } from "./graphModeFlag";
```

Change the `defaults` memo (line 166) to pass `0` when the 3D flag is off:

```ts
  // Projector (flag-OFF) loads as a free scatter (strength 0); the parked 3D graph
  // (flag-ON) keeps its settle-on-load primary strength.
  const defaults = useMemo(
    () => catalogDefaultSliders(catalog, ACC_3D_GRAPH_ENABLED ? GROUPING_DEFAULT : 0),
    [catalog],
  );
```

- [ ] **Step 6: Default the color picker to Role (independent of grouping)**

In `AccessAnalysisShell.tsx`, change the color state init (line 240) and reset (line 245):

```ts
  // Color is an independent picker (role / project / user), defaulting to Role; it is
  // never "auto" — the dropdown always drives color.
  const [colorOverride, setColorOverride] = useState<ColorMode | null>("role");
```

```ts
  const resetColor = (): void => setColorOverride("role");
```

Then replace the stale default-group comment (lines 140-146) with:

```ts
  // Projector map (flag-OFF): ONE controlled grouping dim + a single strength slider.
  // The picker defaults to Role (defaultGroupBy), and the projector seeds every slider
  // to 0 (see SliderContext), so the map LOADS as the free embedding scatter — the user
  // drags the strength slider up to morph into Role/Project/User blobs.
  // Changing the picker transfers the current strength to the new dim (zeroing the old).
```

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/users/access-analysis/catalogSliders.ts" "app/(dashboard)/users/access-analysis/catalogSliders.test.ts" "app/(dashboard)/users/access-analysis/SliderContext.tsx" "app/(dashboard)/users/access-analysis/AccessAnalysisShell.tsx"
git commit -m "feat(spatial-graph): load loose with Role pre-selected; color defaults to Role"
```

---

### Task 4: Regression sweep + gates

**Files:** none expected; fix only if a dependent test asserts a removed option.

- [ ] **Step 1: Find tests that reference the old option lists**

Run (PowerShell): `npx vitest run "app/(dashboard)/users/access-analysis"`
Also inspect `RightPanelStack.groupBy.test.tsx` — if it asserts specific Group-by `<option>` labels (e.g. "Company"), update those expectations to the three presets (`Role`, `Project`, `User name`). Make no behavioral change beyond the option list.

- [ ] **Step 2: Run the full unit suite**

Run: `npm test` (or `npx vitest run` if no `test` script)
Expected: all green. Fix any test that broke solely because an option was intentionally removed; do NOT loosen a test that caught a real regression.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit any regression fixes**

```bash
git add <only the specific test files you changed>
git commit -m "test(spatial-graph): update option-list expectations for three presets"
```

- [ ] **Step 5: Visual verification (owner)**

Rebuild and eyeball on `:3000` (safe rebuild recipe: `NEXT_DIST_DIR=.next-new npm run build` → swap → `npm start`, per project notes — do NOT `npm run build` against the running `:3000`). Confirm:
1. Group-by dropdown shows exactly **User name / Project / Role**, Role selected.
2. Color dropdown shows exactly **User name / Project / Role**, Role selected.
3. Map loads as a free scatter; dragging Grouping strength morphs into Role blobs.
4. Switching either picker to Project / User name regroups / recolors correctly.

---

## Self-Review

**Spec coverage:**
- Three Group-by presets, default role → Task 1. ✓
- Three Color-by presets incl. `user`, default role → Task 2. ✓
- Independent pickers → Task 2 (color modes) + Task 3 (color always driven by picker). ✓
- Preserve free-scatter load → Task 3 (seed strength 0 flag-OFF). ✓
- Tests + gates → Tasks 1-4. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type consistency:** `COLOR_MODES`/`COLOR_MODE_LABELS`/`categoryForColor`/`ColorMode` all from `nodeColors.ts`; `user` added to `EXTRA_COLOR_MODES` so it is a valid `ColorMode`. `groupByDimensions`/`defaultGroupBy` signatures unchanged. `catalogDefaultSliders` gains an optional 2nd arg (default preserves callers). ✓

**Ambiguity:** Group-by + Color-by order fixed to `[role, project, user]`; default `role`; load = scatter (strength 0, flag-OFF). ✓
