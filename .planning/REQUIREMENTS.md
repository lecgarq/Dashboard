# Requirements: LECG Dashboard — v2.4 Spatial Graph Dimensions

**Defined:** 2026-07-14
**Core Value:** Truthful, fast analytics over the fully extracted ACC dataset — every metric
derivable from the local Prisma DB and honest about coverage.
**Source:** direct owner request 2026-07-14, scoped through a live source audit (two parallel
codebase explorers, findings recorded in `STATE.md` "v2.4 grounding facts"). Research skipped —
no new library, data source, or external API (`workflow.research=false`).
**Prior milestone:** v2.3 New Graphs (8/8 shipped) — requirements archived to
`.planning/milestones/v2.3-REQUIREMENTS.md`, preserved in `PROJECT.md` → Validated.

**Milestone goal:** Make every access-analysis dimension selectable on the spatial graph, and
make selecting one actually restructure the graph — by unlocking dimension machinery that is
already built, computed on every page load, and currently discarded.

**Owner ask (verbatim):** *"Improve the spatial graph, add all the access analysis themes that
we did — I want to see those dimensions in the spatial graph."*

---

## ⚠️ Read Before Planning

Three facts that will silently wreck a plan if missed. All verified from source 2026-07-14.

1. **NAME COLLISION.** `app/(dashboard)/access-analysis/` is the **23-panel charts page**.
   `app/(dashboard)/users/access-analysis/` is the **spatial-graph shell**. Nearly identical
   paths, entirely different surfaces. **This milestone touches the `users/` one.**
   `/users/spatial-graph` and `/users/access-analysis` render the same UI
   (`spatial-graph/page.tsx:6,17` → `AccessAnalysisShellClient`).

2. **NODE GRAIN = one user × project membership** (`nodeId = user_id::project_id`,
   `graphNodesFromUsers.ts:13,79-84`), ~16,942 nodes. Dimensions at other grains
   (per-folder-grant, per-issue) **cannot** color a node without an explicit, stated
   aggregation rule. Do not invent one silently.

3. **TWO ID-SPACES, NOT ONE.** `groupByDimensions.ts:10` `PRESETS` uses **catalog** ids;
   `nodeColors.ts:62` `COLOR_MODES` uses **registry** ids. They currently contain the same
   three strings by coincidence. Unifying them is a real task, not a rename.

**Overarching guardrails:** this milestone adds **no new data source, no new Prisma table, and
no new loader** — every dimension it exposes is already computed. Zero new npm dependencies.
Zinc theme preserved. No new WebGL on `/access-analysis`, `/template-mty`, or `/forma-proposal`
(the spatial graph is not a data surface and already runs cosmos.gl). Under-covered data
labeled, never hidden. Existing characterization tests (TEST-01/02/03) stay green and
byte-identical. `npx tsc --noEmit` before any rebuild.

---

## v2.4 Requirements

In scope for this milestone. Each maps to a roadmap phase (numbering continues from Phase 23 →
**starts at Phase 24**).

### Dimension Aperture (DIM)

The user-visible heart of the milestone: 205 of 208 dimensions are currently unreachable.

- [ ] **DIM-01**: User can **group** the spatial graph by any available node dimension — not
      just the three hardcoded in `groupByDimensions.ts:10`. Baseline set (~14, already computed
      per node in `featureSnapshot.ts:127-235`): role, project, user, company, permission tier,
      permission strength, folder breadth, activity volume, activity recency, sign-in recency,
      membership tenure, risk score, module signature, internal/external, admin/member,
      dominant activity mix.
- [ ] **DIM-02**: User can **color** the spatial graph by any available node dimension — not
      just the three hardcoded in `nodeColors.ts:62`.
- [ ] **DIM-03**: Group-by and color-by resolve from a **single unified dimension id-space**.
      Today they are two divergent hardcoded arrays over two different id-spaces (catalog vs
      registry). One source of truth after this requirement.
- [ ] **DIM-04**: User can **filter** the graph by any available node dimension. Today the
      toolbar chips read a third, separate list (`SliderContext.DIMENSIONS`, 12 registry dims).
- [ ] **DIM-05**: Every exposed dimension **states its coverage honestly**. DC-sourced
      dimensions cover ~550/1,153 projects, not all of them; banded dimensions show their
      boundaries. Under-covered dimensions are **labeled, not hidden** (standing constraint).
- [ ] **DIM-06**: `dimensionRegistry.ts`'s stale doc comment (`:317-322` — falsely claims
      `RUNTIME_DIMENSION_IDS` is "the single source of truth for what the runtime uses") is
      corrected to describe real ownership, or the registry/catalog split is collapsed.

### Catalog Slider Wall (CAT)

The 208-dim sidebar is written, tested, and never rendered.

- [ ] **CAT-01**: The catalog slider sidebar (`CatalogSliderSidebar.tsx`) **renders in
      production**, decoupled from `NEXT_PUBLIC_ACC_3D_GRAPH`. That flag currently gates both
      the slider wall and the parked 3D graph — one flag, two unrelated features
      (`RightPanelStack.tsx:180-186`, `AccessAnalysisShell.tsx:492`).
- [ ] **CAT-02**: The 176-action catalog **lazy-loads** — not iterated at graph init when the
      sidebar has never been opened. Closes CONCERNS.md §3.3.
- [ ] **CAT-03**: User can **search** the catalog dimension list by name. With ~189 available
      dims, an unsearchable wall is unusable.
- [ ] **CAT-04**: The 19 `available:false` catalog dimensions render **visibly greyed with a
      reason**, never silently dropped — an unavailable dimension is information, not absence.

### Layout Engine (LAY)

Today a dimension can only recolor and re-clump nodes around a fixed projection. Owner chose to
change that.

- [ ] **LAY-01**: Selecting a dimension **restructures the graph organically** via force
      anchors — it does not merely recolor a static projection.
- [ ] **LAY-02**: `catalogTargets` / `catalogWeights` are **consumed by the live render path**.
      Today they are built every page load (`AccessAnalysisShell.tsx:575-579`) and thrown away
      when the code returns early at `:611-632`. Dead compute becomes live compute.
- [ ] **LAY-03**: Dimension sliders **morph the layout continuously** between structures — no
      teleport, no frozen frames.
- [ ] **LAY-04**: The layout **stays organic — never a fixed grid**, at any slider position or
      dimension combination. Standing owner constraint, previously violated and corrected.

### Performance & Fragility (PERF)

CONCERNS.md §3.1–3.4. These stop being theoretical the moment ~189 sliders are exposed on a
page demoed live.

- [ ] **PERF-01**: DuckDB-Wasm warm-up is **off the render critical path** (idle-time or
      server-precomputed, not a blocking mount-time `useEffect`). Closes CONCERNS.md §3.1.
- [ ] **PERF-02**: The cosmos.gl simulation **cannot be accidentally reheated** by a slider
      change or clustering call. Closes CONCERNS.md §3.2 — the known-fragile area, and the one
      LAY-01/LAY-02 deliberately reach into.
- [ ] **PERF-03**: The 3D lasso e2e test **passes reliably within its time budget** on the
      owner's machine. Closes CONCERNS.md §3.4. **Risk:** may be blocked by the standing
      Playwright/dev-server infra bug (see Future Requirements) — if so, that bug must be fixed
      inside v2.4 for this requirement to be verifiable.
- [ ] **PERF-04**: Spatial-graph **first paint does not regress** despite the widened dimension
      surface. `VERIFY:` establish the baseline by **measurement before changing anything** —
      a prior ~0.46s figure exists but predates this milestone and must be re-measured, not
      assumed.

---

## Future Requirements

Deferred. Tracked, not in this roadmap.

### Tier 3 — graph dimensions needing new data plumbing (v2.5)

- **ISSUE-GRAPH-01**: Slice the graph by issue status / type / coordination flag.
  **Blocked on measurement.** `AccIssue.createdBy` exists (`prisma/schema.prisma:849`,
  `String?`) but is an ACC user GUID with **no bridge to `AccDcUser`** and an **unmeasured
  resolution rate**. Wiring it blind risks a mostly-empty dimension that lies. Needs a
  resolution-rate spike first.
- **TIME-01**: Temporal scrubber (activity / issues by month) on the graph. Time is not a node
  attribute — needs a new interaction concept, not a dimension slot.

### Spatial-graph test debt (CONCERNS.md §8.2/8.3)

- **TEST-SPLIT-01**: Split the two >100KB spatial-graph physics/e2e test files. Deliberately
  **not** in v2.4 — the owner approved §3.1–3.4, not §8.2/8.3.

### Pre-existing, surfaced during the v2.4 audit (not introduced by it)

- **COMPANY-GRAIN-01**: `accessInstanceView.ts:140` reads `AccDcProjectUserCompany`
  (per-membership) while `activityRecencyView.ts:139` reads `AccDcUser.companyId` (per-user,
  global). They disagree for any user whose company differs across projects. Affects
  `/access-analysis` panels 9/13 vs 14/15/16.
- **ORPHAN-01**: Dead code imported by nothing live — `PresetBar.tsx`, `SliderGroup.tsx`,
  `SliderSidebar`, `dimensionSearch.ts`, `dimensionWeights.ts`; `SliderContext.applyPreset` is
  a stub calling `resetAll()` (`:369-374`); `activePreset` hardcoded `null` (`:377`);
  `nodeColors` branches 2–3 unreachable (`AccessAnalysisShell.tsx:260-262`). v2.4 may delete or
  revive some of these incidentally — whatever it touches, it should not leave new orphans.

### Standing (carried from v2.2/v2.3)

- **SVC-01** — `service`-override classification refinement (~966 clash-issue rows).
- **DC-01 / DC-02** — unlock the 724 DC-403 projects via APS Account Admin provisioning.
- **Per-folder terrain projection** — only if terrain read cost becomes a concern.
- **Playwright/dev-server infra fix** — `next dev --webpack` 500s every request;
  `--turbopack` corrupts CSS on ~50% of cold boots. E2e specs needing a dev server are blocked
  either way. **This directly threatens PERF-03.**
- **`gsd-tools` STATE.md frontmatter corruption** — corrupted STATE 3× during v2.3. Hand-repair
  and diff after any `gsd-tools` STATE write.
- **MILESTONES.md v2.1/v2.2 backfill** — both shipped, never logged.
- **`.planning/` phase-directory archival** — deferred; the tree is mid-migration with ~450
  files of unrelated dirty WIP.

---

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New data sources / Prisma tables / loaders | Every v2.4 dimension is already computed. Adding data would mask the fact that the machinery already exists. |
| Issue dimensions on the graph | `AccIssue.createdBy` has no `AccDcUser` bridge and an unmeasured resolution rate — deferred to v2.5 pending a spike. |
| Temporal scrubber | Time is not a node attribute; needs a new interaction concept, not a dimension slot. |
| Reviving the 3D graph | `NEXT_PUBLIC_ACC_3D_GRAPH` gates both the slider wall *and* 3D. v2.4 **decouples** them and ships the slider wall. 3D stays parked — resurrecting it is a separate decision. |
| New WebGL on `/access-analysis`, `/template-mty`, `/forma-proposal` | Standing constraint, unchanged. The spatial graph is not a data surface and already runs cosmos.gl. |
| Changes to the 23-panel `/access-analysis` charts page | v2.4 mirrors those dimensions conceptually but touches `app/(dashboard)/users/access-analysis/` — see the NAME COLLISION warning. |
| Splitting the >100KB physics/e2e test files (§8.2/8.3) | Owner approved §3.1–3.4 only. |
| New npm dependencies | The catalog, the force engine, and cosmos.gl are all already installed and written. |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DIM-01 | Phase 25 | Pending |
| DIM-02 | Phase 25 | Pending |
| DIM-03 | Phase 24 | Pending |
| DIM-04 | Phase 25 | Pending |
| DIM-05 | Phase 25 | Pending |
| DIM-06 | Phase 24 | Pending |
| CAT-01 | Phase 26 | Pending |
| CAT-02 | Phase 26 | Pending |
| CAT-03 | Phase 26 | Pending |
| CAT-04 | Phase 26 | Pending |
| LAY-01 | Phase 27 | Pending |
| LAY-02 | Phase 27 | Pending |
| LAY-03 | Phase 27 | Pending |
| LAY-04 | Phase 27 | Pending |
| PERF-01 | Phase 28 | Pending |
| PERF-02 | Phase 27 | Pending |
| PERF-03 | Phase 28 | Pending |
| PERF-04 | Phase 28 | Pending |

**Coverage:**
- v2.4 requirements: **18** total
- Mapped to phases: **18/18** ✓
- Unmapped: 0

**Phase-to-requirement map:**
- Phase 24 (Baseline & Dimension ID Unification): DIM-03, DIM-06
- Phase 25 (Dimension Aperture — Group, Color & Filter): DIM-01, DIM-02, DIM-04, DIM-05
- Phase 26 (Catalog Slider Wall): CAT-01, CAT-02, CAT-03, CAT-04
- Phase 27 (Layout Engine — Force-Anchor Revival & Reheat Guard): LAY-01, LAY-02, LAY-03, LAY-04, PERF-02
- Phase 28 (Performance Closeout & Verification): PERF-01, PERF-03, PERF-04

---
*Requirements defined: 2026-07-14*
*Last updated: 2026-07-14 — ROADMAP.md created, 18/18 requirements mapped to Phases 24-28.*
