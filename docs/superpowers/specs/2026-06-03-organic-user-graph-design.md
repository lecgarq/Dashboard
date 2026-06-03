# Organic User-Graph Redesign — Design Spec

**Date:** 2026-06-03
**Branch:** `feat/access-analysis-redesign`
**Surface:** `/users/spatial-graph` (the `AccessAnalysisShell` cosmos.gl / three.js graph)
**Status:** Approved in brainstorming; ready for implementation planning.

---

## 1. Goal

Replace the graph's featureless **"disc"** default with an **organic, force-directed network** that matches the owner's reference images: colored organic blobs, thin connecting lines, and names on demand.

The reference spectrum:
- **Reference image 1** (organic, loose, blended clusters) = the **slider-at-0** look.
- **Reference image 3** (separated, tight, labeled clumps) = the **slider-at-100** look.

On load the graph lands on the organic (image-1) look with **zero clicks**.

## 2. Scope

**In scope — the `user name` dimension only.** This build delivers a single, polished clustering dimension end-to-end:

1. Group dots into **one organic blob per user** (each dot = one user's record on one project).
2. **Color each user a distinct color** (rainbow hue ramp; color follows the cluster).
3. Draw same-user project links as **faint grey lines**, brightening when a person is clicked/isolated.
4. Show a person's **name + project count on hover/click** — no persistent labels.
5. A single **User-name slider**: **0 = organic/loose** (default on load) → **100 = fully clustered/tight**.

**Out of scope (future work, do not build now):**
- Other clustering dimensions (Company/Firm, Role, Project, etc.).
- Color presets (Internal/External, Company, Activity, Admin) and the preset legend.
- Multi-slider **stacking / combining** of dimensions (this is the eventual north star, but only the single user-name dimension is implemented and tested now).
- The cross-tab **grid** layout stays off — the graph is always organic ("organic, never grid").

## 3. The default view (on load)

| Aspect | Behavior |
|---|---|
| Grouping | One organic blob per **user name**, always on (it is the only dimension). |
| Layout at load | **Organic / loose** (slider = 0): force-directed, breathing, blended — reference image 1. |
| Color | **By user** — each user its own color via the existing cluster hue ramp (rainbow expected and intended). |
| Lines | **Same-user** project links, **quiet grey, low opacity**. |
| Labels | **None persistent.** Hover or click a blob → tooltip with **name + project count**. |

## 4. The User-name slider

- **One spectrum of tightness**, both endpoints grouped by user:
  - **0 (default, on load): organic** — loosest force-directed spread (image-1 look).
  - **100: fully clustered** — tightest packed, clearly separated clumps (image-3 look).
- Maps onto the existing tightness ramp (the cluster fill-factor / footprint spread the engine already uses for the 1-slider morph).
- No grid mode, no second dimension.

## 5. Architecture & reuse

This is **wiring and tuning the existing engine**, not new machinery. The cluster engine, cluster colors, same-user edges, and hover tooltip all already exist; today they only activate when a slider is dragged. The redesign makes the **user-name clustering the default state** and re-skins it to the reference look.

Existing pieces reused (verify exact files/lines during planning):
- `dominantClusters.ts` — cluster assignment by an attribute (here: user name).
- `clusterForceLayout.ts` / cluster packing — organic footprints; with ~3,367 users (above the ~150 organic-force threshold) it uses the fast deterministic circle-packing path, which is good for performance.
- `layoutDescriptor.ts` — the rest→clump morph; the slider drives tightness.
- `clusterColors.ts` (`clusterColorBuffer`) — per-cluster rainbow (sinebow ramp for >10 clusters).
- `sameUserEdges.ts` + `linkEmphasis.ts` — same-user links and the bright-on-isolate behavior.
- `NodeTooltip.tsx` — hover/click name display.
- `ClusterLabels.tsx` — persistent overlay (to be **disabled by default** here).

### The actual changes (deltas vs today)

1. **Default clustering → user name.** On load, run the user-name cluster layout instead of the isotropic rest scatter. (Confirm in planning whether a `user` dominant dimension exists or must be added; the engine already has a single "User-name" slider state to build on.)
2. **Slider 0 = organic, not ungrouped.** The slider's `0` endpoint must be the **loose organic user-grouped** layout (image 1), not an ungrouped scatter; `100` = tight packed clumps. Default slider value = **0**.
3. **Default color → cluster (user) colors.** Set the default color mode so color = user (`clusterColorBuffer`), instead of the semantic rest-mode coloring.
4. **Edges → faint grey.** Change the `linkEmphasis` base link color from blue to **grey at low opacity**; keep the bright-on-click/isolate path unchanged.
5. **Labels → hover only.** Disable the persistent `ClusterLabels` overlay by default; ensure `NodeTooltip` shows **user name + project count**.

## 6. Testing

- **TDD per piece** (unit tests first), following the repo's existing test patterns.
- Unit-level: cluster-by-user assignment is correct; default color buffer = cluster colors (length = nodeCount×4, alpha = 1); edge base color = grey; tooltip content includes name + project count; slider 0 → loose / 100 → tight tightness values.
- **E2E:** the graph's e2e harness (`tests/e2e/acc-dc-graph.spec.ts`, gated by `NEXT_PUBLIC_ACC_GRAPH_TEST`) asserts node count (16,942), finite positions, edge well-formedness, and color-buffer invariants. Update/extend assertions for the new default (user clustering on load, cluster colors by default, grey edges) rather than the old disc default.
- Respect the known **GPU-off-under-test** caveat (the test flag forces the frozen 2D path) and the lasso e2e load-flake (not a regression).

## 7. Risks & open questions (resolve in planning)

- **User dimension existence:** confirm whether `dominantClusters` already supports a `user`/user-name dimension or needs a small descriptor added.
- **Slider-0 endpoint:** confirm the loose-organic layout at `0` reads as recognizable per-user blobs (image 1), not a near-uniform scatter; tune the loosest fill factor accordingly.
- **Performance:** ~3,367 clusters via the deterministic packer should be fine, but verify load/frame perf against the prior lag fixes (dirty-check `pushPositions`, heap/pool settings).
- **Tooltip project count:** confirm the per-user project count is available at hover time (in-memory feature snapshot) without extra queries.

## 8. Commit discipline (this WIP branch)

`feat/access-analysis-redesign` carries unrelated uncommitted WIP (e.g. `tsconfig.json`, `.next-bak/`, `LOOK AND FEEL *.jpg`, untracked cluster files). **Stage by explicit path only** (`git add -- <path>`), never `-A`/`.`, and run `git diff --cached --name-only` before every commit to confirm only intended files are staged.

## 9. Out-of-scope note for the future

The chosen interaction model is **stack/combine** — multiple dimension sliders eventually layering on the by-user base, each re-flowing the dots organically. This spec deliberately ships only the **user-name** dimension first to validate the look and the engine seam; subsequent specs add the other dimensions and the stacking behavior on top.
