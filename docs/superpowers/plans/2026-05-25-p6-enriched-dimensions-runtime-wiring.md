# P6 — Register enriched snapshot dimensions and controlled advanced sliders

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended)
> or `superpowers:executing-plans` to implement this plan task-by-task. Steps use `- [ ]` checkbox syntax.
>
> **STATUS: ✅ EXECUTED & VERIFIED (2026-05-25) — approved by Luis, shipped via subagent-driven-development.**
>
> Operating rules for this plan: `docs/superpowers/workflows/` (repo-development, data-discovery,
> testing-verification, surgical-staging, subagent-development) + `docs/superpowers/codebase-map/`
> (access-analysis-graph, data-pipeline, file-ownership-map, dependency-map, testing-and-gates,
> active-wip-boundaries). Read them before executing any task.

## ✅ Execution record (2026-05-25)

All 9 tasks executed task-by-task (one subagent per task, surgical explicit-path commits). Commits on
`feat/access-analysis-redesign`:

| Task | Commit | Subject |
|------|--------|---------|
| plan | `e01075f` | docs(acc-graph): plan enriched dimensions runtime wiring |
| 0 | `ac0686b` | docs(research): P6 enriched-field coverage counts |
| 1 | `5a5ebeb` | feat(acc-graph): P6 registry surface-capability (backward-compatible) |
| 2 | `fc7d749` | feat(acc-graph): P6 membershipBucket tenure dimension (default 0) |
| 3 | `9da75c5` | feat(acc-graph): P6 activityRecency (true last-activity) dimension (default 0) |
| 4 | `9559bd9` | feat(acc-graph): P6 riskScore governance dimension (gated, default 0) |
| 5 | `528217b` | feat(acc-graph): P6 permissionStrength + activityMix color modes (color-only) |
| 6 | `d7b5547` | feat(acc-graph): P6 governance/tenure/engagement presets + clustering proof |
| 7 | `b09ac4d` | test(acc-graph): P6 e2e smoke for risk slider + color mode |

**Data gate (Task 0):** coverage on live PG (N=16,942) — membershipBucket 100%, riskScore>0 52.4%,
permissionStrength>0 20.9%, activityRecency 14.7%, activityMix 14.7%. None near-zero → all five shipped.
Note: instance `lastSignIn` is 100% null, so `activityRecency` is activity-based (label reflects this).

**Final gates:** `npm test` **1045/1045** · `tsc --noEmit` **0 errors** · `npm run test:e2e` **21/21**
(19 existing + 2 new), node count **16,942 unchanged**. riskScore 0→100 clustering proof: ratio 1.01 → 25.06.

**Invariants held:** default/organic layout unchanged (new sliders default 0); `TARGET_DIMENSIONS` (primary 6)
unchanged; node identity `userId::projectId` unchanged; color-only dims absent from slider/target lists; P4
module behavior preserved. No forbidden file touched (featureSnapshot/interactionTypes/physics/renderers/
lasso/camera/routes/UserDetailPanel/edges all untouched). Deferred to P7 as planned: riskFlags &
permissionTypeSummary (badge/filter-only) and per-module sliders.

**Goal:** Surface the P5-enriched `NodeFeatureSnapshot` fields as new *data-backed* `DIMENSION_REGISTRY`
descriptors with an explicit per-dimension **surface capability** (slider / color / neither), so a handful of
genuinely-new clustering axes and risk/tenure/recency color modes become available — **without** changing the
default layout, edges, renderers, lasso, camera, routes, `UserDetailPanel`, physics, or node identity.

**Architecture:** The dimension subsystem is a derive-everything-from-the-registry pipeline:
`dimensionRegistry.ts` (descriptors) → `RUNTIME_TARGET_DIMENSION_IDS`/`SLIDER_DIMENSION_IDS` (filtered by
`type`) → `featureTargets.buildFeatureTargets` (anchors) + `dimensionWeights.buildDimensionWeights`
(confidence×availability) + `dimensionGroups` (sidebar grouping) + `SliderContext.DIMENSIONS` (slider state) +
`sliderPresets` (presets) + `nodeColors.COLORABLE_DIM_IDS` (color modes). Because those lists are *derived*,
**adding a descriptor today auto-promotes it to a slider, a layout target, and a color mode.** P6's keystone is
a small additive change: an explicit `surfaces` capability on each descriptor (with a backward-compatible
type-derived fallback) so a new field can be color-only, slider+color, or hidden — chosen deliberately per
field. All new sliders default to **0** (no semantic force), so the organic default layout is byte-identical and
the e2e node count / layout / clustering baselines are preserved by construction.

**Tech Stack:** TypeScript, Next.js App Router, apache-arrow + DuckDB-WASM (read side only — untouched here),
Vitest + fast-check, Playwright (`:3100`, `NEXT_PUBLIC_ACC_GRAPH_TEST=1`).

**Data check (data-discovery gate):** Every field P6 consumes was **already counted and shipped in P5**
(see `project_p5_snapshot_enrichment_plan` memory + `featureSnapshot.ts:240-312`). P6 adds **no new DB field,
no schema change, no DuckDB column** — it only re-reads fields the snapshot already populates. A confirmatory
re-count (coverage of `membershipBucket`, `activityRecencyBucket`, `permissionStrength`, `riskScore`,
`activityMix`) is a **Task 0 gate** before any descriptor is added (see §9). Known traps still apply: the
internal/external domain defect (use `hermosillo.com`, not `@lecg.com`), the empty-string `projectId=''`
admin sentinel, and sign-in-recency ≠ activity-recency (`signin` vs the new `activityRecency`).

---

## 1. Executive summary

P5 enriched each node with module flags, risk flags, a 0–5 risk score, membership tenure, true last-activity
recency, permission strength/profile, and an activity-category mix. **None of that is wired into the runtime
dimension model yet** — the registry still exposes only the 9 P1–P4 dimensions.

P6 wires a **deliberately small, non-noisy** subset of those fields into the runtime, and classifies the rest
explicitly so nothing leaks in by accident:

- **3 new advanced sliders (all default 0):** `membershipBucket` (tenure), `activityRecency` (true
  last-activity), `riskScore` (0–5 governance). These are genuinely new clustering axes with no existing
  equivalent.
- **2 new color-only dimensions:** `permissionStrength` (ordered ramp) and `activityMix` dominant-category
  (categorical hue). Color-only because they overlap existing slider axes (`tier`, `activity`) and would only
  add layout noise as sliders.
- **3 new presets** that combine the new + existing sliders into named lenses: *Governance / risk*, *Tenure*,
  *Engagement*.
- **Everything else stays out of the slider/target/color path** (the 5 `riskFlags`, `permissionTypeSummary.*`,
  per-module `moduleFlags`): classified as **badge/filter-only** and **deferred to P7** — documented here, not
  built.

The single enabling change is an additive **`surfaces` capability** on `DimensionDescriptor`. Default layout,
colors, edges, and node identity are unchanged; the only intentional baseline shifts are the registry/list
*assertions* in unit tests (updated deliberately, §11) and two new e2e smoke tests (§12). The e2e
`EXPECTED_NODE_COUNT = 16_942` is **not** changed.

## 2. Fields available from P5 (source of truth: `interactionTypes.ts:72-103`, populated in `featureSnapshot.ts`)

| Field | Type | Populated at | Coverage caveat |
|-------|------|--------------|-----------------|
| `moduleFlags?: Record<string,boolean>` | per-known-module booleans | `featureSnapshot.ts:258` via `deriveModuleFlags` | depends on `module_ids` presence |
| `riskFlags?: {externalHighPerm, staleButActive, externalProjectAdmin, broadFolderAccess, highActivityHighPerm}` | 5 booleans | `featureSnapshot.ts:217-227` via `computeRiskFlags` | permission-derived flags need folder-perm coverage |
| `riskScore?: number` (0–5) | count of true flags | `featureSnapshot.ts:260` via `riskScoreFromFlags` | inherits flag coverage |
| `membershipAgeDays?: number\|null` | days since `addedOn` | `featureSnapshot.ts:231` | `addedOn` null → `null` |
| `membershipBucket?: "<30d"\|"<90d"\|"<1y"\|">1y"\|"unknown"` | tenure bucket | `featureSnapshot.ts:262` via `bucketMembership` | null age → `"unknown"` |
| `activityRecencyBucket?: "0-7d"\|"8-14d"\|"15-30d"\|"31-60d"\|"60d+"\|"none"` | true last-activity recency | `featureSnapshot.ts:264-266` via `bucketRecency` | falls back to instance sign-in when last-activity absent |
| `permissionStrength?: number` (0–5) | MAX folder grant strength | `featureSnapshot.ts:269` | 0 when no folder rows / unknown coverage |
| `permissionTypeSummary?: {folderBreadth, coverage, mixedProfile, fullController}` | derived perm profile | `featureSnapshot.ts:270-275` | `coverage` field carries honesty |
| `activityMix?: Partial<Record<ActivityCategory, number>>` | event counts by category | `featureSnapshot.ts:267` | `{}` when no activity |
| `activityTotal?: number` | sum of mix | `featureSnapshot.ts:268` | 0 when none |

These are **read-only inputs** for P6. `featureSnapshot.ts` and `interactionTypes.ts` are **NOT** edited (see §15).

## 3. Dimension classification matrix

Classification per the brief: **primary slider** / **advanced slider** / **preset-only** / **color mode only** /
**badge/filter only** / **not recommended**. Rationale ties to Q8 (avoid layout noise), Q12 (readable not
chaotic), and data honesty (no duplicate axes).

| Candidate field | Natural type | **Classification** | Why |
|-----------------|--------------|--------------------|-----|
| `membershipBucket` | categorical (tenure) | **Advanced slider** (default 0) **+ color** | Genuinely new axis; no existing tenure dimension. Clean 5-way anchors. |
| `activityRecencyBucket` | categorical (behavior) | **Advanced slider** (default 0) **+ color** | New axis: *true last activity*, distinct from `signin` (sign-in) and `activity` (volume). |
| `riskScore` (0–5) | scalar/ordered (risk) | **Advanced slider** (default 0) **+ ordered color** | Headline governance lens; 6 ordered anchors; ordered ramp is the high-value view. |
| `permissionStrength` (0–5) | scalar/ordered (access) | **Color mode only** (ordered) | Overlaps `tier` as a clustering axis → slider would be redundant noise; ordered ramp is valuable. |
| `activityMix` (by category) | derived → dominant category | **Color mode only** (categorical) | Rich but a slider over dominant-category is noisy; color reads cleanly. |
| `activityTotal` / volume | scalar | **Not recommended** | Already represented by the `activity` (volume bucket) slider — duplicate axis. |
| `permissionTypeSummary.fullController` | binary | **Badge/filter only** (P7) | Binary governance flag; a binary slider clusters weakly + duplicates `isAdmin`-style noise. |
| `permissionTypeSummary.mixedProfile` | binary | **Badge/filter only** (P7) | Niche; no clustering value. |
| `permissionTypeSummary.folderBreadth` | scalar | **Not recommended** as slider; folded into `broadFolderAccess`/`riskScore` | Already captured by a risk primitive. |
| `riskFlags.externalHighPerm` | binary | **Badge/filter only** (P7) | Represented in the layout/color by `riskScore`. |
| `riskFlags.staleButActive` | binary | **Badge/filter only** (P7) | "" |
| `riskFlags.externalProjectAdmin` | binary | **Badge/filter only** (P7) | "" |
| `riskFlags.broadFolderAccess` | binary | **Badge/filter only** (P7) | "" |
| `riskFlags.highActivityHighPerm` | binary | **Badge/filter only** (P7) | "" |
| `moduleFlags` per module | binary ×7 | **Preset-only + filter** (P7) | A single `module` multi-hot slider already exists; 7 module sliders = the flat-50 list the brief forbids. Surface module focus via presets/filters. |

**Net P6 runtime additions:** 3 advanced sliders, 2 color-only dimensions, 3 presets. Everything in the
"badge/filter only" / "not recommended" rows is **documented and deferred**, not implemented.

## 4. Registry descriptors to add (`dimensionRegistry.ts`)

Five new `DimensionId`s + descriptors. **Capability is explicit** via the new `surfaces` field (Task 1). All
`extract`/`isAvailable` are null-safe because the source fields are optional.

| `id` | `family` | `type` | `surfaces` | `confidence` | `defaultWeight` | `extract` (null-safe) | `isAvailable` |
|------|----------|--------|-----------|--------------|-----------------|-----------------------|---------------|
| `membershipBucket` | `tenure` | `categorical` | `["slider","color"]` | `medium` | `0` | `f.membershipBucket ?? "unknown"` | `(f.membershipBucket ?? "unknown") !== "unknown"` |
| `activityRecency` | `behavior` | `categorical` | `["slider","color"]` | `medium` | `0` | `f.activityRecencyBucket ?? "none"` | `(f.activityRecencyBucket ?? "none") !== "none"` |
| `riskScore` | `risk` | `scalar` | `["slider","color"]` (`colorScale:"ordered"`) | `low` | `0` | `f.riskScore ?? 0` | `(f.riskScore ?? 0) > 0` |
| `permissionStrength` | `access` | `scalar` | `["color"]` (`colorScale:"ordered"`) | `medium` | `0` | `f.permissionStrength ?? 0` | `(f.permissionStrength ?? 0) > 0` |
| `activityMix` | `behavior` | `derived` | `["color"]` | `low` | `0` | dominant category of `f.activityMix` or `"(none)"` | `Object.keys(f.activityMix ?? {}).length > 0` |

**Defaults are 0 on purpose** (Q9): the `organic` preset never lists these, so `applyPreset` zero-bases them →
no semantic force at load. The `defaultWeight: 0` is documentation/consistency; the live default comes from the
preset.

**`surfaces` capability (the keystone).** Add to `DimensionDescriptor`:

```ts
export type DimensionSurface = "slider" | "color";

export interface DimensionDescriptor {
  /* …existing fields… */
  /**
   * Runtime surfaces this dimension feeds. When OMITTED, defaults are derived from `type`
   * (slider-capable types → "slider"; categorical|binary → "color") so the 9 P1–P4 dims are
   * unchanged. Set explicitly to add a data-backed dimension WITHOUT auto-promoting it to a
   * slider/target (e.g. color-only). A "slider" surface always implies a layout target.
   */
  surfaces?: ReadonlyArray<DimensionSurface>;
  /** Color ramp style when surfaced as color: "categorical" (hashed hue) | "ordered" (sequential). */
  colorScale?: "categorical" | "ordered";
}
```

Helpers (replace the `type`-only filters):

```ts
const SLIDER_CAPABLE_TYPES: ReadonlySet<DimensionType> =
  new Set(["categorical","binary","scalar","temporal","multi-hot"]);

export function dimensionSurfaces(d: DimensionDescriptor): ReadonlyArray<DimensionSurface> {
  if (d.surfaces) return d.surfaces;                       // explicit wins
  const out: DimensionSurface[] = [];
  if (SLIDER_CAPABLE_TYPES.has(d.type)) out.push("slider"); // legacy fallback
  if (d.type === "categorical" || d.type === "binary") out.push("color");
  return out;
}
export const dimensionHasSurface = (d: DimensionDescriptor, s: DimensionSurface): boolean =>
  dimensionSurfaces(d).includes(s);

// Derived lists now key off capability, not raw type:
export const RUNTIME_TARGET_DIMENSION_IDS: readonly DimensionId[] =
  DIMENSION_REGISTRY.filter((d) => dimensionHasSurface(d, "slider")).map((d) => d.id);
```

The 9 existing descriptors get **no `surfaces` field** → fallback reproduces today's behavior exactly. Only the
3 slider dims join `RUNTIME_TARGET_DIMENSION_IDS`; the 2 color-only dims do not.

## 5. Sliders to expose

- **Primary group:** unchanged — `RUNTIME_DIMENSION_IDS` stays the UAT-tuned six. `TARGET_DIMENSIONS`
  (=`RUNTIME_DIMENSION_IDS`) is **unchanged** (its hard-asserted test at `featureTargets.test.ts:280` stays
  green untouched).
- **Advanced groups (auto-derived by family via `dimensionGroups.ts`, no component edits):**
  - **Tenure** (new group): `membershipBucket`.
  - **Behavior**: `activityRecency` joins existing `activity`, `signin`.
  - **Risk** (new group): `riskScore`.
- All three render through the existing `SliderSidebar` → `SliderGroup` → `DimensionSlider` chain with **no UI
  code change** — they appear because `SLIDER_DIMENSION_IDS` (derived) now includes them. Default value 0 →
  each advanced group shows "0 active" until the user moves it (Q9, Q11).
- **Slider 0 = no force** is preserved: nothing changes in the physics/`SliderContext` zero-handling; new dims
  simply sit at 0 by default and contribute no `forceX/Y/Z` until raised.

## 6. Presets to update (`sliderPresets.ts`)

Add three named lenses (sparse weight maps; `applyPreset` zero-bases the rest, so they explicitly turn the new
sliders on and others off):

```ts
{ id: "governance", label: "Governance / risk",
  weights: { riskScore: 45, internalExternal: 25, isAdmin: 20, tier: 15 } },
{ id: "tenure", label: "Tenure",
  weights: { membershipBucket: 45, project: 20, role: 15 } },
{ id: "engagement", label: "Engagement / recency",
  weights: { activityRecency: 40, activity: 25, signin: 15 } },
```

- The `organic` (default) preset is **unchanged** → default layout identical.
- The `flat` preset auto-includes the new sliders at 20 (it maps over `SLIDER_DIMENSION_IDS`) — intended; its
  test just needs the count updated (§11).
- Module focus (the "preset-only" classification for `moduleFlags`) is **deferred to P7** — it needs per-module
  filter wiring, out of P6 scope. Documented, not added.

## 7. Color modes to add (`nodeColors.ts`)

`COLORABLE_DIM_IDS` switches from `type === categorical|binary` to `dimensionHasSurface(d, "color")`, so it
picks up all five new color dims (the 3 sliders are also color-surfaced + the 2 color-only). New ordered ramp:

```ts
// nodeColors.ts — additive ordered ramp for colorScale:"ordered" dims (riskScore, permissionStrength).
// Existing categorical hashed-hue path is untouched (getColorStats signature behavior preserved).
function colorForOrdered(value: number, max: number): [number, number, number] {
  const t = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return hslToRgb(0.58 - 0.58 * t, 0.7, 0.55); // blue (low) → red (high), legible on zinc #09090B
}
```

`categoryForColor`/`buildNodeColors` branch on the descriptor's `colorScale`: ordered dims read the numeric
`extract` and ramp; everything else keeps the hashed-hue path. Alpha stays 1.0 (dimming is mask-only — the
existing invariant the e2e color test asserts). `COLOR_MODE_LABELS` gains the five labels automatically from the
descriptors. The P4 e2e color test (options include role/company/isAdmin/status) still passes — those options
remain.

## 8. Target generation strategy

- **Slider dims** (`membershipBucket`, `activityRecency`, `riskScore`) flow through the **unchanged**
  `buildFeatureTargets(snapshot, SLIDER_DIMENSION_IDS)` call in `AccessAnalysisShell.tsx:290`. Because they are
  single-value (not multi-hot), `computeDimensionTarget` assigns each distinct category/level a volumetric
  spherical-Fibonacci anchor (the existing, tested algorithm). Cardinalities are small and clean:
  `membershipBucket` ≤ 5 anchors, `activityRecency` ≤ 6, `riskScore` ≤ 6 (values 0–5 coerced to category
  strings by `categoryValue`). No new anchor math is written.
- **`riskScore` availability gate** keeps the layout calm: `isAvailable = riskScore > 0`, so the large mass of
  zero-risk nodes contributes **no** pull to the risk axis (they stay where the other forces place them); only
  risky nodes converge to risk-level anchors. This is the data-honest answer to "don't drag everything to a
  pole" and sidesteps the folder-perm coverage problem (a 0-score node simply doesn't cluster on risk).
- **Color-only dims** (`permissionStrength`, `activityMix`) are **not** in `SLIDER_DIMENSION_IDS`, so
  `buildFeatureTargets` never generates an anchor for them — they create **no** layout force (Q1/Q4/Q8).
- `featureTargets.ts` itself needs **no edit**: it already derives its dim list and multi-hot handling from the
  registry. (Confirm during execution; if `TargetDimensionId` is a closed union it widens automatically from
  `DimensionId`.)

## 9. Confidence / availability strategy

- **Weighting** is unchanged: `dimensionWeights.buildDimensionWeights` already computes
  `confidence × availability` per node and needs **no edit** — it reads `descriptor.confidence` and
  `descriptor.isAvailable`. The new descriptors plug straight in.
- **Confidence** per descriptor (§4): `membershipBucket` medium, `activityRecency` medium, `riskScore` low,
  `permissionStrength` medium (color-only, so confidence only matters if it ever gains a slider),
  `activityMix` low. Low confidence (`CONFIDENCE_FACTOR.low = 0.4`) down-weights derived/coverage-dependent
  axes so they never dominate.
- **Availability** is the per-node gate (`isAvailable`): unknown tenure, `none` recency, and zero risk all
  return `false` → those nodes get weight 0 on that dim and are not dragged to a pole. This is exactly the
  taxonomy §14 model already in place.
- **Data-discovery confirmation (Task 0, blocking):** re-count coverage of each field against live PG/DuckDB
  before adding descriptors (per `data-discovery-workflow`). If any field's real coverage is near-zero on the
  live snapshot, **drop or defer that descriptor** rather than ship a dead axis. Record counts in a research
  note.

## 10. 2D/3D layout risk analysis

- **Default layout unchanged → zero 2D/3D regression risk at load.** New sliders default 0; `organic` preset
  untouched; `TARGET_DIMENSIONS` (primary) untouched. The volumetric anchor algorithm
  (`volumetricAnchor`/`computeDimensionTarget`) is reused verbatim, so depth (z-spread) behavior is identical
  for the new dims — they fill a 3D volume exactly as the existing ones do (proven by
  `featureTargets.test.ts` "volumetric distribution" cases, which the new dims inherit).
- **No renderer/physics edits**: `GraphCanvas`/`2D`/`3D`, `physicsLayer`, `mathLayer` are not in scope. The
  "both canvases always mounted, CSS-visibility switch" invariant is untouched.
- **Volumetric preservation when a new slider is raised:** because the new dims use the same anchor scale
  (`ANCHOR_RADIUS`) and the same `{x,y,z}` split, raising e.g. `riskScore` to 100 produces the same kind of
  volumetric clustering as raising `project` — verified by a `physicsClustering`-style monotonicity assertion
  (§11 Task 6) and an e2e "z-range stays non-degenerate" smoke (§12).
- **Noise control (Q8):** at most 3 new sliders, all default 0, low/medium confidence; the noisy candidates
  (per-module, individual risk flags, perm profile booleans) are deliberately excluded. The advanced groups
  keep them collapsed behind the existing active-count badge.

## 11. Test strategy (unit / Vitest — `superpowers:test-driven-development`)

Each task is TDD: failing test → minimal code → green. New/updated unit tests:

1. **`dimensionRegistry.test.ts`** (modify): assert `surfaces`/`dimensionHasSurface` fallback (legacy dims
   unchanged); assert the 5 new descriptors exist with correct `family`/`type`/`surfaces`/`confidence`;
   **update** the hard-asserted `RUNTIME_TARGET_DIMENSION_IDS` list (now +`membershipBucket`,`activityRecency`,
   `riskScore`) and assert color-only dims are **absent** from it; assert `extract`/`isAvailable` null-safety
   (undefined snapshot fields → safe defaults). `RUNTIME_DIMENSION_IDS` (primary 6) assertion stays unchanged.
2. **`featureTargets.test.ts`** (modify): `TARGET_DIMENSIONS` assertion **unchanged** (still the 6).
   Add: `buildFeatureTargets(snapshot, SLIDER_DIMENSION_IDS)` produces finite, deterministic, volumetric
   anchors for each new slider dim; same bucket → same anchor; different buckets → separated; `riskScore`
   zero-risk nodes are gated (anchor present but availability handles the no-pull case).
3. **`__tests__/dimensionWeights.test.ts`** (modify): new dims yield `confidence×availability` per node;
   unavailable nodes (unknown tenure / none recency / zero risk) → weight 0.
4. **`nodeColors.test.ts`** (modify): ordered ramp is deterministic + finite + monotonic in value; alpha
   stays 1.0; new color modes present in `COLOR_MODES`/`COLOR_MODE_LABELS`; categorical path for
   `membershipBucket`/`activityRecency` unchanged in shape; `activityMix` dominant-category coercion.
5. **`__tests__/sliderPresets.test.ts`** (modify): the 3 new presets expand correctly (listed dims set, others
   0); `flat` includes the new sliders; `detectActivePreset` round-trips each new preset; `organic` is
   unchanged (regression guard on the default layout).
6. **`physicsClustering.test.ts`** (modify, optional but recommended): clustering ratio for a new slider dim
   (e.g. `riskScore`) increases monotonically across a 0→100 sweep — the deterministic **0/100 proof** the
   brief requires (Q13), reusing the existing harness.
7. **`__tests__/dimensionGroups.test.ts`** / **`SliderContext.test.tsx`** (modify if assertions are
   exact-list): these derive from `SLIDER_DIMENSION_IDS` and mostly pass automatically; update any
   exact-membership counts.

Baseline to beat: **~960 unit tests green** (P5 record). New work only adds; updated assertions are intentional
and documented in the commit body.

## 12. E2E strategy (Playwright — `tests/e2e/acc-dc-graph.spec.ts`, `:3100`)

- **Preserve `EXPECTED_NODE_COUNT = 16_942`** (`spec:7`) — do **not** change it. The existing 19 tests assert
  it across 2D/3D/slider/color/filter paths; they must stay green, which proves identity + count are intact.
- **Default-layout guard (already exists):** the "default layout loads volumetric" + "2D renders all nodes"
  tests confirm the organic default is unchanged. Because P6 adds nothing to the default, these pass as-is —
  the proof that the new dims didn't disturb the baseline.
- **Add 2 smoke tests (mirror existing patterns, no freeze):**
  1. *New advanced slider smoke* — open the **Risk** group, move the `riskScore` thumb to max (End key, like
     the existing "project slider smoke"); assert positions finite, `count === EXPECTED_NODE_COUNT`, clustering
     score finite, canvas visible.
  2. *New color mode smoke* — select `riskScore` (ordered) in `toolbar-color-mode`; assert RGBA buffer length
     `=== EXPECTED_NODE_COUNT * 4`, alpha all 1, signature differs from `role`, then returns deterministically;
     verify 2D/3D parity exactly as the existing color test does.
- **Run the full suite** (`npm run test:e2e`) and record **21/21** (19 existing + 2 new) with the node count
  unchanged, using `templates/e2e-gate-report.md`.

## 13. Atomic task breakdown

> Order matters: Task 0 (data gate) → Task 1 (capability) → Tasks 2–4 (descriptors) → Task 5 (color) →
> Task 6 (presets/clustering) → Task 7 (e2e) → Task 8 (verify + document). Each task: failing test → minimal
> code → gates → **surgical** commit (explicit paths, `git diff --cached --name-only` before every commit).

### Task 0: Data-discovery confirmation (blocking gate — read-only)
**Files:** Create research note `docs/superpowers/research/2026-05-25-p6-enriched-field-coverage.md` (read-only
discovery; scratch query under `scripts/scratch/` if needed).
- [ ] **Step 1:** `npm run db:status` (else `npm run db:start`).
- [ ] **Step 2:** Count live coverage of `membershipBucket` (non-`unknown`), `activityRecencyBucket`
  (non-`none`), `permissionStrength > 0`, `riskScore > 0`, `activityMix` non-empty — reading the DuckDB
  `graph_*`/PG fields the snapshot uses (use the `pg` driver / psql per data-discovery-workflow; no
  `new PrismaClient()`).
- [ ] **Step 3:** Reconcile node total to **16,942**; check traps (domain defect, empty-string sentinel,
  sign-in≠activity). Record counts + a ship/defer/drop decision per field.
- [ ] **Step 4:** Commit the research note: `docs(research): P6 enriched-field coverage counts`.
- [ ] **STOP CONDITION:** any field with near-zero real coverage → drop/defer that descriptor and amend §4
  before proceeding.

### Task 1: Add the `surfaces` capability to the registry
**Files:** Modify `dimensionRegistry.ts`; Test `__tests__/dimensionRegistry.test.ts`.
- [ ] **Step 1:** Failing test — `dimensionHasSurface` returns type-derived defaults for the 9 legacy dims
  (slider for slider-capable types; color for categorical/binary); `RUNTIME_TARGET_DIMENSION_IDS` still equals
  the existing 9 (no behavior change yet).
- [ ] **Step 2:** `npx vitest run dimensionRegistry` → FAIL (symbol undefined).
- [ ] **Step 3:** Add `DimensionSurface`, optional `surfaces`/`colorScale` fields, `dimensionSurfaces`/
  `dimensionHasSurface`; rewrite `RUNTIME_TARGET_DIMENSION_IDS` to filter by `dimensionHasSurface(d,"slider")`.
- [ ] **Step 4:** `npx vitest run dimensionRegistry featureTargets dimensionGroups` → PASS (lists identical
  because no new descriptors yet).
- [ ] **Step 5:** Gates → `npm test` + `npx tsc --noEmit -p tsconfig.json`.
- [ ] **Step 6:** Commit: `feat(acc-graph): P6 registry surface-capability (backward-compatible)`.

### Task 2: Register `membershipBucket` (advanced slider + color)
**Files:** Modify `dimensionRegistry.ts`; Test `__tests__/dimensionRegistry.test.ts`,
`featureTargets.test.ts`, `__tests__/dimensionWeights.test.ts`.
- [ ] **Step 1:** Failing test — descriptor exists (`family:"tenure"`, `type:"categorical"`,
  `surfaces:["slider","color"]`, `confidence:"medium"`); null-safe extract/isAvailable; appears in
  `RUNTIME_TARGET_DIMENSION_IDS` (update the exact-list assertion); `buildFeatureTargets` anchors it.
- [ ] **Step 2:** `npx vitest run dimensionRegistry featureTargets dimensionWeights` → FAIL.
- [ ] **Step 3:** Add the descriptor + `"membershipBucket"` to `DimensionId`.
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** Gates (`npm test`, `tsc`).
- [ ] **Step 6:** Commit: `feat(acc-graph): P6 membershipBucket tenure dimension (default 0)`.

### Task 3: Register `activityRecency` (advanced slider + color)
**Files / Steps:** identical pattern to Task 2 (`family:"behavior"`, `type:"categorical"`,
`surfaces:["slider","color"]`, `confidence:"medium"`, extract `activityRecencyBucket ?? "none"`, available when
`!== "none"`). Update the exact-list assertion. Commit:
`feat(acc-graph): P6 activityRecency (true last-activity) dimension (default 0)`.

### Task 4: Register `riskScore` (advanced slider + ordered color)
**Files / Steps:** Task-2 pattern (`family:"risk"`, `type:"scalar"`, `surfaces:["slider","color"]`,
`colorScale:"ordered"`, `confidence:"low"`, extract `riskScore ?? 0`, **available when `> 0`** — the calm-layout
gate). Add a `featureTargets.test.ts` case asserting zero-risk nodes carry weight 0 (via `dimensionWeights`) so
they exert no risk-axis pull. Commit: `feat(acc-graph): P6 riskScore governance dimension (gated, default 0)`.

### Task 5: Color-only dims + ordered ramp (`permissionStrength`, `activityMix`)
**Files:** Modify `dimensionRegistry.ts` (2 color-only descriptors, `surfaces:["color"]`), `nodeColors.ts`
(ordered ramp + capability-based `COLORABLE_DIM_IDS`); Test `nodeColors.test.ts`, `dimensionRegistry.test.ts`.
- [ ] **Step 1:** Failing test — `permissionStrength`(`type:"scalar"`,`colorScale:"ordered"`) +
  `activityMix`(`type:"derived"`, dominant-category extract) exist; both are **absent** from
  `RUNTIME_TARGET_DIMENSION_IDS`/`SLIDER_DIMENSION_IDS`; `COLOR_MODES` includes all 5 new modes; ordered ramp
  deterministic/finite/monotonic; alpha 1.0.
- [ ] **Step 2:** `npx vitest run nodeColors dimensionRegistry` → FAIL.
- [ ] **Step 3:** Add descriptors; switch `COLORABLE_DIM_IDS` to `dimensionHasSurface(d,"color")`; add
  `colorForOrdered` + `colorScale` branch in `categoryForColor`/`buildNodeColors`.
- [ ] **Step 4:** rerun → PASS; confirm color-only dims did **not** enter the slider/target lists.
- [ ] **Step 5:** Gates.
- [ ] **Step 6:** Commit: `feat(acc-graph): P6 permissionStrength + activityMix color modes (color-only)`.

### Task 6: Presets + clustering monotonicity
**Files:** Modify `sliderPresets.ts`; Test `__tests__/sliderPresets.test.ts`, `physicsClustering.test.ts`.
- [ ] **Step 1:** Failing test — `governance`/`tenure`/`engagement` presets expand correctly; `organic`
  unchanged; `flat` includes new sliders; `detectActivePreset` round-trips; clustering ratio for `riskScore`
  rises monotonically 0→100.
- [ ] **Step 2:** `npx vitest run sliderPresets physicsClustering` → FAIL.
- [ ] **Step 3:** Add the 3 presets.
- [ ] **Step 4:** rerun → PASS.
- [ ] **Step 5:** Gates (`npm test`, `tsc`).
- [ ] **Step 6:** Commit: `feat(acc-graph): P6 governance/tenure/engagement presets + clustering proof`.

### Task 7: E2E smoke (new slider + new color mode)
**Files:** Modify `tests/e2e/acc-dc-graph.spec.ts` (add 2 tests; **do not** change `EXPECTED_NODE_COUNT` or
weaken any assertion).
- [ ] **Step 1:** Add the riskScore-slider smoke + riskScore-color smoke (patterns from §12).
- [ ] **Step 2:** `npm run test:e2e` → expect **21/21**, node count 16,942 everywhere.
- [ ] **Step 3:** Record with `templates/e2e-gate-report.md`.
- [ ] **Step 4:** Commit: `test(acc-graph): P6 e2e smoke for risk slider + color mode`.

### Task 8: Full verification + docs/memory
- [ ] **Step 1:** `npm test` (full), `npx tsc --noEmit -p tsconfig.json`, `npm run test:e2e` — paste output
  (`superpowers:verification-before-completion`).
- [ ] **Step 2:** Tick this plan's checkboxes; update `.gsd/TECHNICAL_DEBT.md` if live (note deferred P7
  badge/filter + module presets).
- [ ] **Step 3:** Propose a memory update (`project_p6_*`) — **ask before writing** (`templates/memory-update-note.md`).
- [ ] **Step 4:** `superpowers:finishing-a-development-branch` to decide integration.

## 14. File list per task

| Task | Create | Modify | Test | Forbidden-check |
|------|--------|--------|------|-----------------|
| 0 | `docs/superpowers/research/2026-05-25-p6-enriched-field-coverage.md` (+ optional `scripts/scratch/*.cjs`) | — | read-only counts | no runtime/schema edit |
| 1 | — | `dimensionRegistry.ts` | `__tests__/dimensionRegistry.test.ts` | registry only |
| 2 | — | `dimensionRegistry.ts` | `__tests__/dimensionRegistry.test.ts`, `featureTargets.test.ts`, `__tests__/dimensionWeights.test.ts` | registry only |
| 3 | — | `dimensionRegistry.ts` | same as Task 2 | registry only |
| 4 | — | `dimensionRegistry.ts` | same as Task 2 | registry only |
| 5 | — | `dimensionRegistry.ts`, `nodeColors.ts` | `nodeColors.test.ts`, `__tests__/dimensionRegistry.test.ts` | color task (allowed); keep `getColorStats` behavior |
| 6 | — | `sliderPresets.ts` | `__tests__/sliderPresets.test.ts`, `physicsClustering.test.ts` | presets only; physics test is read-only assertion |
| 7 | — | `tests/e2e/acc-dc-graph.spec.ts` | (is the test) | no `EXPECTED_NODE_COUNT` change |
| 8 | — | this plan, `.gsd/TECHNICAL_DEBT.md` (if live) | — | docs only |

**Note:** `featureTargets.ts`, `dimensionWeights.ts`, `dimensionGroups.ts`, `SliderContext.tsx`,
`SliderSidebar.tsx`, `sliderPresets.ts`-consumers, and `AccessAnalysisShell.tsx` need **no source edits** —
they derive from the registry. If TS reveals a closed union that must widen, that is an additive type-only
change in the owning file; flag it, don't expand scope.

## 15. Forbidden files (do NOT touch — `repo-development` + `active-wip-boundaries`)

- **Snapshot/data pipeline (fields already shipped):** `featureSnapshot.ts`, `interactionTypes.ts`,
  `graphTables.ts`, `acc-hot-cache.ts`, `dcUserAssembly.ts`, `server/routers/acc-dc-graph.ts`,
  `activityAggregate.ts`, `activityCategories.ts`, `riskFlags.ts`, `moduleFlags.ts`, `prisma/schema.prisma`.
- **Graph internals:** `physicsLayer.ts`, `mathLayer.ts`, `layoutStats.ts`, `positionsCache.ts`,
  `GraphCanvas.tsx`/`GraphCanvas2D.tsx`/`GraphCanvas3D.tsx`, `CosmosCanvasClient.ts`, `graphTestBridge.ts`
  (the `GraphTestApi` contract).
- **Interaction/edges/route:** `LassoOverlay.tsx`, camera code, `SelectionContext.tsx`, `UserDetailPanel.tsx`,
  `NodeTooltip.tsx`, `sameUserEdges.ts`, `linkEmphasis.ts`, `page.tsx`/route files.
- **No new edge layer, no lasso/camera/nav/UserDetailPanel/renderer change, no engine swap**
  (cosmos.gl / three.js / d3-force-3d), no UMAP/ForceAtlas/React-Force-Graph spike.
- **No flat 50-slider list.** **No node-identity change** — node stays `userId::projectId`.

## 16. Rollback strategy

- **Per-task atomic commits** → revert any single task with `git revert <hash>` without unwinding the rest.
- **Capability fallback is the safety net:** Task 1 is behavior-neutral (legacy dims derive surfaces from
  type). If a later descriptor misbehaves, deleting that one descriptor + its `DimensionId` entry fully removes
  it from every derived list (slider/target/color/group/preset) — no other file references it.
- **Default-layout invariant** means a bad new dim can only affect the layout when its slider is moved off 0 or
  its color mode is selected; reverting the descriptor restores the exact P5 runtime.
- **No data migration** (localStorage `controls.v1` ignores unknown keys; `migratePersistedSliders` is
  unaffected), so rollback needs no storage cleanup.
- If e2e node count or a forbidden invariant ever shifts → stop, `git revert`, `superpowers:systematic-debugging`.

## 17. Stop conditions

- **Plan-gated:** stop here — do not implement until Luis approves.
- **Task 0 data gate fails** (a field has no real coverage) → drop/defer that descriptor; do not ship a dead
  axis.
- **e2e `EXPECTED_NODE_COUNT` changes** or any forbidden invariant (identity, both-canvas mount,
  `getColorStats` behavior, default-layout) shifts unexpectedly → stop, revert, debug.
- **A new slider changes the *default* layout** (it must not — defaults are 0) → stop; the preset/registry
  defaults are wrong.
- **The only way to pass a gate is to weaken a test/fixture** → stop and surface it.
- **A task needs a forbidden file** → stop and request a boundary change; never edit an owned/forbidden file
  "just a little."

---

## Self-Review

- **Brief coverage (Q1–Q15):** Q1/Q3/Q4/Q5 → §3 matrix + §4 `surfaces`; Q2 → §5; Q6 → §8; Q7 → §9; Q8 →
  §3/§5/§10 (≤3 sliders, default 0, low confidence); Q9 → §5/§6 (organic untouched, defaults 0); Q10 → §10;
  Q11 → §5 (single `module` slider kept; module focus = presets, P7); Q12 → §3/§7 (risk/perm/activity rendered
  as gated sliders + ordered color, not a flag soup); Q13 → §11 Task 6 (0/100 monotonicity) + §12; Q14 → §12
  (count unchanged, full suite); Q15 → two-bus model preserved (sliders→physics; no filter/mask change, §15).
- **No scope creep:** badge/filter + per-module presets explicitly deferred to P7; no snapshot/physics/renderer
  edits; no edge/lasso/camera/route/UserDetailPanel touch.
- **Type consistency:** one `surfaces`/`colorScale` contract in `dimensionRegistry.ts`, consumed by
  `RUNTIME_TARGET_DIMENSION_IDS` and `nodeColors`; new `DimensionId`s defined once; presets reference real ids.
- **Known limitations:** (1) ordered color ramp is a new path in `nodeColors` — covered by new unit tests;
  (2) `riskScore`/`permissionStrength` honesty depends on folder-perm coverage — mitigated by low confidence +
  `>0` availability gate + Task 0; (3) several hard-asserted exact-list unit tests are *intentionally* updated —
  flagged in commit bodies so reviewers see them as deliberate.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-25-p6-enriched-dimensions-runtime-wiring.md`. **STATUS: PLAN ONLY
— do not implement until approved.** On approval, recommended execution is `superpowers:subagent-driven-development`
(fresh subagent per task, post-dispatch `git status`/`git diff --cached` scope-verify, gates re-run by the
orchestrator) with surgical explicit-path commits per Task.
