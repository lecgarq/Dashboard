# Access-Analysis Dimension Redesign — Design Spec

- **Date:** 2026-05-28
- **Status:** Approved for planning (brainstorming complete)
- **Branch:** `feat/access-analysis-redesign`
- **Surface:** `/users/access-analysis` — the right-sidebar dimension sliders and the spatial cloud they drive
- **Author input:** Luis (dashboard owner); excel `acc.xlsx` is the canonical taxonomy

## 1. Goal

Rebuild the right-sidebar dimensions from scratch so that:

1. The **full taxonomy from `acc.xlsx`** is represented — every module, group-activity, and individual action, plus the structural/access attributes — as the set of layout "magnets" that position the cloud.
2. **Every value is backed by extracted data**, mapped systematically from our database into the excel's authoritative structure. Rows with no per-node data are **shown greyed/disabled** (not hidden, not dropped).
3. **Built-in presets are removed.** The user saves their **own** presets. The **default state is all sliders at 0**.
4. The slider→clustering response is **smooth and incremental across the whole 0→100 range**, and **every node is positioned** for every enabled dimension — even nodes with no activity (their value is an exact `none`, not a gap).

A node is one **(user × project)** instance — **16,942** of them. A slider is a per-dimension magnet: at 0 it exerts no pull; at 100 it fully clusters nodes by that attribute. The placement of these magnets is what visually tells us how the cloud behaves.

## 2. Non-goals

- No new ACC extraction. All required data already exists in the database; we re-aggregate it.
- No change to the filter / lasso / search **MASK bus** (it already works and is orthogonal).
- No attempt to resolve admin-action **targets** (display-name strings — fuzzy; deliberately skipped).
- No folder-attribute *values* derived (folder size/version/etc. are per-folder, not per-node; shown greyed only).

## 3. Decisions (locked during brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Activity granularity | **Every individual action** (~147 live) + all structural/access dims |
| 2 | Excel rows with no per-node data | **Shown greyed/disabled** in their correct position |
| 3 | Presets | **No built-ins**; user-saved; a preset captures **sliders + active color**; default = **all 0** |
| 4 | Clump rule for amount dims | **Smart mix by amount** — `none / low / med / high`, **per-action relative** buckets |
| 5 | Positioning for no-data nodes | Every node positioned; `none` is a **real pole**; confidence tunes influence but never zeroes an enabled dim |
| 6 | Slider response | **Linear, continuous, no dead zone, no snap**, perceptually calibrated across 0→100 |
| 7 | Taxonomy authority | **Excel is canonical**; data mapped into it via kebab-normalization + `service` cross-check + alias table |
| 8 | `cost` entitlement key | **Folded into Build** |
| 9 | Admin actions (account-level) | **Actor-attributed** (non-fuzzy), projected onto the actor's nodes like other account-level facts |
| 10 | Color mode | **Pure visual encoding** — recolors nodes only; no effect on positioning, not a filter |

## 4. Data verification findings (live DB, read-only)

Confirmed via `scripts/scratch/verify-acc-taxonomy.cjs`, `verify-acc-modules.cjs`, `match-excel-to-data.cjs`, `inspect-admin-actions.cjs`:

- **Nodes:** 16,942 (`AccDcProjectUser` rows). Projects 428, users 3,367, roles 77, companies 319.
- **Activity:** 854,427 project rows + 720 admin. **142** distinct project actions + **5** admin actions.
- **Coverage:** **142/142** project actions map to an excel action (**141 exact** + **1** hyphenation alias `add-attribute-to-namingstandard`). The raw matcher reported **35** excel-only rows; after applying the decisions below they resolve to **~147 live** action dims and **~29 greyed**:
  - the **1** alias becomes matched → live;
  - the **5** account-level admin actions (`assign-member`, `assign-admin`, `remove-member`, `remove-admin`, `edit-project`) become **live via actor-attribution** (decision 9);
  - the remaining **~29** stay greyed (legacy display-name duplicates like `File Viewed`≈`view-entity`, automation events with no user, project-lifecycle events with no per-node identity).
- **Datum nuance:** Datum *activities* are live (8 actions, e.g. `create-custom-attribute`), but Datum *module-access* is greyed (no entitlement key).
- **`AccActivity.service`** tags each action's domain: `docs, issues, submittals, rfis, sheets, admin, bridge` — corroborates the excel's module placement on every populated branch. (`tool` is always null — ignore.)
- **Module entitlements** (`AccDcProjectUserProduct.productKey`): `build, docs, modelCoordination, designCollaboration, cost, takeoff, forma, autoSpecs, insight`.
- **Access ladder** (`AccFolderPermission.permType`, 5 real rungs): `View Only(1) < View+Download(2) < View+Download+Upload(3) < View+Download+Upload+Edit(4) < Full Controller(5)` → `perm_strength` 0–5. (Excel's "Publish Markups" rung and "Full Administrative Controls" wording are NOT in the data — use the real ladder.)

### 4.1 Entitlement key → excel module name

| Excel module | Entitlement key | Confidence |
|---|---|---|
| Build | `build` (+ `cost` folded in) | high |
| Data Management | `docs` | high |
| Design Collaboration | `designCollaboration` | high |
| Model Coordination | `modelCoordination` | high |
| Insight | `insight` | high |
| AutoSpecs | `autoSpecs` | high |
| Preconstruction | `takeoff` | medium (Autodesk Takeoff = preconstruction) |
| Design | `forma` | medium (Autodesk Forma = design) |
| Datum | *(none — access greyed; activities exist)* | n/a |

## 5. Architecture

```
acc.xlsx ──translate once──► accTaxonomy.ts ──────────────► dimensionRegistry (generated)
                              (modules, groups, ~176 actions,        │
                               access ladder, structural dims,       ▼
                               labels, order, aliases)        featureTargets / anchors
                                      │  cross-check                 │
                                      ▼  (service, coverage gate)    ▼
                              excel↔data mapping            physicsLayer / gpuLayout2D
                                      │                              (positioning math)
                                      ▼                              ▲
              data pipeline: per-action counts per node ────────────┘
        (acc-hot-cache → activityAggregate → dcUserAssembly →
         acc-types → graphTables → featureSnapshot → NodeFeatureSnapshot)

      SliderSidebar (tree UI) ─ sliders ─► positioning   [primary channel]
      Color control ─────────── recolor ─► visual only   [orthogonal]
      Filters/lasso/search ──── mask ─────► visibility    [existing MASK bus, untouched]
```

Three orthogonal channels: **sliders → position**, **color → appearance**, **mask → visibility**. A saved preset persists the first two; never the third.

## 6. Component: `accTaxonomy.ts` (new, pure, no React/DOM/IO)

Single source of truth, translated from `acc.xlsx`. Shapes:

```ts
interface TaxonomyModule { id: string; label: string; entitlementKey?: string; observed: boolean }
interface TaxonomyGroup  { id: string; label: string } // Content Change | Delete | Read | Workflow Change | ACCess Change | Unknown
interface TaxonomyAction {
  id: string;            // canonical kebab id (matches DB rawAction)
  label: string;         // excel display label
  moduleId: string;
  groupId: string;
  rawActionMatchers: string[]; // DB rawAction strings (usually [id]; alias entries add variants)
  source: "project" | "admin"; // admin = actor-attributed
}
interface AccessLevel { id: string; label: string; strength: 0|1|2|3|4|5 }
interface StructuralDim { id: string; label: string; ... } // project, role, company, status, permission, tenure, moduleAccess, admin, internalExternal
```

Plus the **9 excel modules** with their entitlement-key mapping (§4.1), and the **5-rung access ladder**. The excel's **folder-attribute rows** (Folder Size, Version, Review Status, Path, Updated By, Inherit Permissions, …) are carried as **always-disabled** taxonomy entries so they appear greyed in the sidebar (per-folder, not per-node — no value to derive).

Action counts: ~176 excel actions total → ~147 live + ~29 greyed (see §4).

## 7. Component: excel ↔ data mapping (systematic, testable)

The mapping rule, in order:
1. **Normalize** both excel labels and DB `rawAction` to kebab (`lower`, `+`→space, non-alnum→`-`, collapse).
2. **Match** by normalized id.
3. **Alias table** for the small set of known variants (e.g. `add-attribute-to-naming-standard` ⇄ `add-attribute-to-namingstandard`). Hand-curated, tiny, commented.
4. **Module cross-check:** assert each matched action's excel module is consistent with its DB `service` (issues/rfis/submittals→Build, docs→Data Management, sheets→Design Collaboration, admin→Preconstruction). Mismatches fail the coverage test.
5. **Availability:** an action is `available` iff ≥1 matcher has per-node data; else `disabled` (greyed).

A **coverage gate test** (ports `match-excel-to-data.cjs` into a Vitest) keeps this honest over re-ingests: it fails if a new DB action is uncatalogued or a service/module mismatch appears.

## 8. Component: data pipeline — per-action counts per node

Today `lib/server/acc-hot-cache.ts:249` already runs `groupBy(["userEmail","projectId","rawAction"])`; `foldActivityRows` (`lib/acc/activityAggregate.ts`) then collapses it into 7 categories and discards the action. Change:

- **Preserve a compact per-action map** beside the existing `activityMix`: `InstanceActivity.actionCounts: Record<canonicalActionId, number>` (+ keep `mix`/`total`/`lastActivity` unchanged — other panels use them).
- **Admin actions:** a parallel actor-keyed fold — for `sourceFile='admin'`, attribute the count to the **actor** (`userEmail`) across **all that actor's instances** (account-level projection). No target resolution.
- Thread `actionCounts` through the existing links that already carry `activityMix`:
  `activityAggregate → dcUserAssembly (acc-types) → graphTables (serialize as `activity_actions_json`) → featureSnapshot (parse) → NodeFeatureSnapshot.actionCounts`.
- **Bump the activity-mix hot-cache version** so the new shape rebuilds cleanly.
- **Bucket thresholds (per-action relative):** precompute, per action, the quantile cut points over its **nonzero** distribution → `none/low/med/high`. Stored alongside the taxonomy at snapshot build so `view-entity` (2,228 users) and a 1-user action each use their full range. Outliers cannot stretch the layout.

Sparsity: most nodes touch a handful of actions, so `actionCounts` stays small per node.

## 9. Component: `dimensionRegistry` (generated from the taxonomy)

The registry is **generated**, not hand-listed:
- One descriptor per **structural dim**, per **module-access dim** (9), per **access-ladder dim**, and per **action** (~147 live + greyed).
- Each descriptor declares `kind: "categorical" | "ordinal"` (drives anchor geometry, §10), `available: boolean`, `confidence`, `extract(node)`, and `surfaces` (slider and/or color).
- **Action descriptors** are `ordinal`; `extract` returns the node's `none/low/med/high` bucket from `actionCounts` + the per-action thresholds. `none` is a real value.
- **Greyed** descriptors carry `available:false` → no slider interaction, no layout pull, rendered disabled.

## 10. Component: positioning math (the smoothness requirement)

**Anchor geometry (two kinds):**
- **Categorical** (project, role, company, module, admin, internal/external, status): each distinct value → a point on the volumetric spherical-Fibonacci set (existing `featureTargets.computeDimensionTarget`) → discrete clumps.
- **Ordinal** (permission strength, tenure, recency, **all action sliders**): buckets placed on an **ordered ramp** along a per-dimension axis (`none → low → med → high`), so the cloud forms a readable **gradient**, not scattered blobs. New `computeOrdinalRampTarget`.

**Every node positioned:** for an enabled dim, every node has a defined value (ordinal `none` is the low end of the ramp; categorical `(none)` is a real anchor). Slider=100 reorganizes the *entire* cloud.

**Per-node weight:** `confidence × availability`. For enabled ordinal dims, availability is 1 for **all** nodes (count 0 = exact `none`), so confidence only *scales* influence — it never removes a node. (Supersedes the old `riskScore`-style zero-gate for these dims.)

**Smooth 0→100 — four guarantees:**
1. **Linear pull:** `strength = sliderNorm × STRENGTH_AT_ONE × weight` (already linear in `physicsLayer`); blended across active dims via the slider-weighted anchor centroid (`gpuLayout2D.computeAnchors`, `featureTargets`) → continuous in every slider.
2. **No dead zone:** any step reheats (existing `SKIP_THRESHOLD` accumulator — kept).
3. **No snap:** the positions cache key (`hashNodeSetAndSliders`) must encode the **exact** slider values so intermediate positions never collide and jump.
4. **Perceptual calibration:** a force sim saturates (most motion early). Add an **automated probe** (Playwright, like the existing motion probe) that measures cluster separation at slider = 10,20,…,100 and tunes the response curve until each 10-pt step gives a visibly even increment.

**Decouple color from layout:** replace the current 2D "cluster-by-color-group" path so clustering uses the **slider-weighted anchors** directly. Color no longer influences position.

## 11. Component: sidebar UI

- **Pinned "Structure & Access" section** (always visible): project, role, company, status, permission level (5-rung), tenure, module access (9 excel names), admin, internal/external.
- **Activity tree** (collapsible): **Module → Group → Action**, mirroring the excel; groups collapsed by default; **active-count badge** per collapsed branch (count of non-zero sliders inside).
- **Search box** filters the whole tree by name.
- **Disabled rows**: greyed with a "no data" tag, in correct position.
- **Per-slider** 0–100 control (default 0) + reset; header **"Reset all to 0"**.
- Scales to ~150+ rows via the tree + search + default-collapsed groups (extends today's `SliderSidebar`/`SliderGroup` pattern).

## 12. Component: presets

- Remove `SLIDER_PRESETS` built-ins and the `organic` default. Default state = **all sliders 0, color none**.
- **Save current as…** → captures `{ sliders, colorAttribute }` under a user name.
- Saved list: **apply / rename / delete**. Stored in the existing `localStorage` controls blob (`lecg.access-analysis.controls.v1`) under a new `userPresets` key (single local user; no server).
- `detectActivePreset` re-pointed at the user presets (or "Custom").

## 13. Component: color control (orthogonal)

- A single **"Color by"** dropdown: `None` (default) or any color-surfaced attribute (project, role, company, permission level, risk score, dominant action, …).
- Ordered attributes → sequential ramp; categorical → distinct hues (existing `nodeColors`).
- Purely visual: never touches the physics/positions bus or the mask bus.

## 14. Performance

- `actionCounts` is sparse (handful of keys/node) → modest memory and Arrow/DuckDB serialization cost.
- ~147 potential layout targets, but **all default to 0** → the per-tick force loop only iterates active (non-zero) dims; idle cost is unchanged from today.
- Per-action quantile thresholds computed once at snapshot build (one pass over the grouped rows).

## 15. Testing

- **Unit:** `accTaxonomy` integrity (every module/group/action well-formed); excel↔data **coverage gate**; alias completeness; per-action bucketing (quantiles, `none` handling); registry generation; ordinal-ramp + categorical anchor math (purity tests); preset save/apply/rename/delete; color independence (asserts color change does not alter positions).
- **Probe (Playwright):** smooth 0→100 separation curve; no dead zone; no snap on intermediate values.
- **E2E:** existing access-analysis suite (`npm run test:e2e`, :3100, `NEXT_PUBLIC_ACC_GRAPH_TEST`) stays green; add a smoke test for the new sidebar tree + a saved preset round-trip.
- Gates to hold: unit suite green, `tsc` 0 errors, e2e green (lasso load-flake excepted).

## 16. Decomposition (implementation phases)

This is milestone-sized; planned as ordered phases (each its own plan):

- **A. Canonical taxonomy + mapping + coverage gate** — `accTaxonomy.ts`, alias table, Vitest coverage gate.
- **B. Data pipeline** — per-action counts + per-action quantile thresholds + admin actor-fold + cache version bump, end-to-end onto `NodeFeatureSnapshot`.
- **C. Registry generation** — structural + module-access + access-ladder + action descriptors; availability/disabled; smart-mix `extract`.
- **D. Positioning math** — ordinal-ramp anchors, decouple color from layout, exact-slider cache key, calibration probe.
- **E. Sidebar UI** — tree, search, badges, disabled rendering, reset-all.
- **F. Presets** — remove built-ins, default all-0, user-saved save/apply/rename/delete (sliders + color).
- **G. Color control** — decoupled "Color by" dropdown + ramps/hues.

## 17. Risks & open questions

- **Admin actor-attribution semantics:** an admin action is projected onto *all* of the actor's nodes (account-level). Confirmed acceptable (same model as sign-in/status). Watch that it reads as "who administers access," not project-specific.
- **`takeoff`/`forma` module mapping** is medium-confidence; correctable in `accTaxonomy.ts` if the owner observes otherwise.
- **Quantile buckets for 1-user actions** degenerate to `none` vs `present` — acceptable (matches "did vs didn't" for ultra-rare actions).
- **Cache size** of `activity_actions_json` across 16,942 nodes — sparse, expected small; verify during Phase B.

## 18. Touchpoints (existing files)

- Data: `lib/server/acc-hot-cache.ts`, `lib/acc/activityAggregate.ts`, `lib/acc/dcUserAssembly.ts`, `lib/acc/acc-types.ts`, `app/(dashboard)/users/access-analysis/graphTables.ts`, `featureSnapshot.ts`, `interactionTypes.ts`.
- Dimensions/physics: `dimensionRegistry.ts`, `dimensionGroups.ts`, `dimensionWeights.ts`, `featureTargets.ts`, `physicsLayer.ts`, `gpuLayout2D.ts`, `nodeColors.ts`.
- UI/state: `SliderSidebar.tsx`, `SliderGroup.tsx`, `SliderContext.tsx`, `PresetBar.tsx`, `sliderPresets.ts`, `DimensionSearchBox.tsx`.
- New: `accTaxonomy.ts` (+ generated registry wiring), ordinal-ramp target fn, preset store, color control.

## 19. Verification scripts (read-only, retained)

`scripts/scratch/verify-acc-taxonomy.cjs`, `verify-acc-modules.cjs`, `match-excel-to-data.cjs`, `inspect-admin-actions.cjs` — basis for the Phase A coverage gate.
