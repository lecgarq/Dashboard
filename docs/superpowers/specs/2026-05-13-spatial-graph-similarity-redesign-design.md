# Spatial Graph — Similarity-Map Redesign (2D + 3D)

**Date:** 2026-05-13
**Status:** Approved by Luis (brainstorming → spec). Ready for implementation planning.
**Supersedes:** Phase 07.1 CONTEXT (`.planning/phases/07.1-positional-only-similarity-redesign-filter-ui-reshape/07.1-CONTEXT.md`). Phase 07.1's 6 PLAN files were never executed; treat them as drafts to discard in favor of this spec.

---

## 1. Purpose

The Users spatial graph (`app/(dashboard)/users/` — both `AccUsersGraph` 2D and `Sphere3DGraph` 3D) is a **similarity map of people**. Where a user *sits* on screen encodes how similar that user is to every other user across **the totality of ACC data we collect about them**. The graph has one job: surface clusters of similar users at a glance.

Out of scope:
- Folder hub nodes, project hub nodes, structural ACL edges (role↔folder, folder↔project).
- Labeled cluster hulls, auto-detected community labels.
- Alternate view modes (project-only, role-only, hub-and-spoke). User-only is the only view.
- Multi-select interactions on user nodes.

---

## 2. Clustering model

### 2.1 Seven dimensions

Every dimension is a positional input. None is decorative.

| # | Dimension | Similarity type | Pair-similarity definition |
|---|---|---|---|
| 1 | Project Members | set overlap | Count of shared `projectIds`. |
| 2 | Roles | set overlap | Count of shared `roleIds`. |
| 3 | Folder Permissions | set overlap | Count of shared `folderIds` (resolved via role → folder transitive lookup, per Phase 7 RESEARCH Pitfall 2). |
| 4 | Activity Logs | set overlap | Count of shared file IDs touched in the activity window, from `AccActivity`. |
| 5 | Data Coverage | set overlap on data-presence flags | Count of shared "we have this kind of data on both" flags (e.g. both have sign-in, both have activity logs, both have folder permissions). Meta-dimension. |
| 6 | Last Sign-In | temporal proximity | Decay function on `|lastSignIn_a − lastSignIn_b|`. Same day → 1.0; 90 days apart → ~0. |
| 7 | Recent Additions | temporal proximity | Decay function on `|addedAt_a − addedAt_b|`. Same week → ~1.0; 90 days apart → ~0. Cohort effect. |

### 2.2 How the seven combine

For each user pair `(a, b)`:

```
pair_force(a, b) =
    simMin_gate(
        Σ_d   strength_d × similarity_d(a, b)
    )
```

Where:
- `strength_d` ∈ [0, 1], default 1.0, controlled by per-dim slider. Unchecked dim → strength = 0.
- `similarity_d(a, b)` is normalized to [0, 1] per dimension. Set-overlap dims normalize by min(|set_a|, |set_b|). Temporal dims use an exponential decay with τ = 30 days (anything past ~90 days contributes ~0).
- `simMin_gate(x)`: returns `x` if at least `simMin` dimensions contribute non-zero similarity, else 0. `simMin` is a layout-only threshold (range 0–7, default 2).

The summed `pair_force` is fed as a spring stiffness into the force layout. A pair strong on 3 dims pulls roughly 3× harder than a pair strong on 1.

### 2.3 Top-K cap

At hub scale (~1,000 users) a fully-connected force graph is O(n²). To bound this:

- Each user retains only their **top 20 most-similar peers** as force connections.
- Remaining pairs contribute zero force.
- K = 20 is the proposed starting point; the planner may tune to 15 or 30 based on perf measurement.

Invisible to the user — purely an internal cap for tractable physics.

---

## 3. What you see on screen

### 3.1 At rest (no hover, no selection)

- **User nodes only.** Each node is a pie-glyph showing the user's folder-permission tier portfolio (View / Upload / Edit / Full Controller). Segment sizes are proportional to the count of folders in each tier.
- **Solid neutral circle** if the user has no folder permissions at all.
- **Pie diameter scales with zoom**, clamped to [6 px, 14 px], using the same curve as the existing label polish (`pow(zoom, 0.2)` clamped [0.85, 1.4]).
- **No edges.** No similarity lines, no role-folder lines, no folder-project lines.
- **No cluster hulls or labels.** Clusters emerge as visual blobs from the force layout alone.

### 3.2 Hover (pointer over a user)

- **Tooltip card** appears (existing card pattern, extended). Contents:
  - Name, email, company, admin tier.
  - Sign-in age in human form ("3 days ago", "never").
  - Activity count in the current window.
  - "Most similar to: [name]" with the top 3 dimensions driving that similarity.
- **Fan-out lines** appear: thin curves from the hovered user to its **top 5 most-similar peers**, color-coded by which dimension contributes most to each pair. Same color palette as the dim checkboxes in the filter panel.
- **Fade-out** ~300 ms after hover ends.

### 3.3 Click (persistent selection)

- Selected user's pie is **outlined in white**.
- Fan-out lines stay visible until clicked-away.
- Side panel opens to the user's detail view (existing `DashboardSidePanel` user kind).
- Click on empty canvas → deselect.

### 3.4 Filter-faded users

- Users hidden by a filter (e.g. tier filter, search) render at **0.35 opacity** and do not contribute to clustering forces.

---

## 4. Controls (filter panel — "Clustering" section)

The existing "Topology" section is **renamed "Clustering"**. The 5 similarity-dim checkboxes from Phase 7 are extended to 7. Each row gains a 0–1 strength slider.

```
[x] User-only view             ← top-level, default ON, immutable in this redesign

─── Clustering ──────────────────────────
[x] Project Members        ●━━━━━━ 1.0
[x] Roles                  ●━━━━━━ 1.0
[x] Folder Permissions     ●━━━━━━ 1.0
[x] Activity Logs          ●━━━━━━ 1.0
[x] Data Coverage          ●━━━━━━ 1.0
[x] Last Sign-In           ●━━━━━━ 1.0
[x] Recent Additions       ●━━━━━━ 1.0
─────────────────────────────────────────
Minimum similarity (simMin)    ━●━━ 2
```

- Unchecking a dim sets `strength_d = 0` with **live reflow** (smooth perturbation, not full restart).
- Strength slider is independently functional whether the dim is checked or not (allows previewing at strength=0 then re-enabling without losing the slider value).
- `simMin` survives unchanged from Phase 7. Repurposed as a layout-only threshold.

**URL persistence.** Compact letter aliases, written only when non-default:

| Key | Encodes |
|---|---|
| `simDims` | which 7 dims are checked (existing key, extended) |
| `simStr` | per-dim strength array (7 floats, comma-separated) |
| `simMin` | simMin threshold (existing key) |
| `view` | view mode (always "user" in this redesign; field kept for forward-compat) |

Phase 7 URLs without `simStr` keep working — missing strengths default to 1.0.

### 4.1 Permission tier filter

Tier checkboxes (View / Upload / Edit / Full Controller) survive as a **node filter** — unchecking a tier hides users whose highest tier matches it (and removes them from clustering forces). Color swatches in the filter double as the legend for pie-glyph segments. No tier-colored edges anywhere — that was the Phase 7 mistake.

---

## 5. 3D parity (`Sphere3DGraph`)

Everything in sections 2, 3, and 4 ships in 3D too. Same similarity computation; same filter panel state shared across 2D ↔ 3D. The filter panel is **surface-aware**: switching 2D ↔ 3D never resets tuning.

### 5.1 Making the 3D view *feel* spherical

The current Phase 6 3D view looks flat. Three causes typically conspire:

1. **Strong perspective camera.** FOV ≈ 50°, camera distance set so the cluster volume fills ~60% of viewport. Today it is likely closer to orthographic or shallow-FOV — the #1 cause of the "flatshot" feel.
2. **Per-node depth cues.** Each pie-glyph:
   - **Size attenuation:** 1.0× near camera → 0.6× far.
   - **Brightness attenuation:** far nodes desaturate + dim to ~50% opacity.
   - **Atmospheric haze:** subtle fog past a depth threshold so the back hemisphere recedes.
3. **Visible sphere shell.** Faint translucent sphere mesh at ~5% opacity, sized to enclose the cluster volume. Users float free inside it (not pinned to the surface). The shell gives the eye a reference frame so rotation reads correctly.
4. **Orbit hint.** First-load tooltip: "drag to rotate, scroll to zoom" — fades after first interaction.

### 5.2 Layout in 3D

Force layout extended to 3 dimensions. Top-K cap still 20. Camera orbits the cluster centroid. Hover fan-out lines become arcs in 3D space, oriented to be visible from current camera angle (re-projected on rotation).

---

## 6. Scale & perf

Performance budget on Luis's hardware (Windows 11, current PC):

| Scenario | Target |
|---|---|
| 1,000 users, 2D, all 7 dims at 1.0 | 60 fps steady |
| 1,000 users, 3D, all 7 dims at 1.0 | 60 fps steady |
| 2,000 users, 2D | 30 fps steady |
| 2,000 users, 3D | 30 fps steady, graceful degradation OK |

**Graceful degradation order** if a frame budget is missed:

1. Drop hover fan-out line count from 5 → 3.
2. Drop sphere shell opacity to 0 (3D only).
3. Reduce pie-glyph to a flat colored dot.
4. Drop top-K from 20 → 15.

---

## 7. Rollout

| Step | Deliverable | Flag |
|---|---|---|
| 1 | Compute changes — extend `computeSimilarityEdges` to handle 2 new set-overlap dims (Activity Logs, Data Coverage) + 2 temporal dims (Last Sign-In, Recent Additions) with the decay function. Add `simStr` URL key. | — |
| 2 | 2D redesign in `AccUsersGraph` — pie-glyph, hover fan-out, filter panel rename + 7 sliders, delete visible similarity edges. | Flip `AccUsersGraph.tsx:69` flag `false → true`. |
| 3 | 3D parity — same pie-glyph, same fan-out, same filter panel state, depth treatment (perspective + attenuation + haze + shell). The 3D view is `AccUsersGraph` with `backend=three3d`; `threeGraphRenderer.ts` is the surface to extend, not a new component. | Same flag — `AccUsersGraph.tsx:69` covers both backends. |
| 4 | Deletion sweep — remove dead Phase 7 paths: visible-similarity-edge color buffers, `SIM_DIM_COLOR` parallel-edge LUT, the old "Topology" filter section heading, role-folder edge tier-coloring (now hidden under user-only). | — |

Folder-hub and role-folder edge *code* is kept dormant (compile-time live, runtime hidden under user-only view) in case a "Show hubs" toggle returns in a later phase.

---

## 8. Decisions taken in brainstorming (so they don't get re-litigated)

These are settled. Re-open only with a written reason.

1. **All 7 ACC data-coverage dimensions are positional inputs.** None are decorative.
2. **No rest-state edges.** Similarity is communicated only by proximity.
3. **Hover fan-out lines** are the chosen explainability mechanism — no auto-labeled cluster hulls, no on-rest similarity lines.
4. **Pie-glyph node** for permission tier portfolio.
5. **8 sliders** (7 dim strength + simMin) — full per-dim control, no presets.
6. **Users-only is the only view** in this redesign.
7. **3D ships in the same phase as 2D**, not deferred.
8. **3D sphere must look spherical** — perspective camera + node depth attenuation + atmospheric haze + visible shell.

---

## 9. Open implementation questions (planner picks)

These are sized for the implementation plan, not the spec:

- Exact decay τ for temporal dims (proposed 30 days).
- Exact top-K (proposed 20; perf-measure 15 vs 20 vs 30).
- Pie-glyph rendering path: custom WebGL shader vs SDF vs Canvas2D overlay vs three.js InstancedMesh for 3D.
- Force-engine choice in 3D (three-forcegraph? custom? r3f physics?).
- Whether to compute pair-similarity incrementally on slider drag, or full-rebuild with debounce.
- Initial seeding strategy (random / hash-stable / cached). Determinism is not a hard requirement.

---

## 10. Critical files

| Path | What changes |
|---|---|
| `lib/acc/userSimilarity.ts` | Extend `SimilarityDim` union to 7. Add temporal-decay similarity functions. Normalize all dims to [0, 1]. |
| `app/(dashboard)/users/AccUsersGraph.tsx` | Pie-glyph rendering, hover fan-out, 7-slider filter panel, flag flip at line 69. |
| `app/(dashboard)/users/accGraphFilters.ts` | Extend `GraphFilters` with `simStr` array. URL letter aliases. |
| `app/(dashboard)/users/accGraphOrganicLayout.ts` | Top-K cap, multi-dim force summation, simMin gate. |
| `app/(dashboard)/users/threeGraphRenderer.ts` | 3D renderer. Add perspective camera config, per-node depth attenuation, atmospheric fog, translucent sphere shell. The 3D view is a backend mode of `AccUsersGraph` (`backend=three3d`), not a separate component. |
| `app/(dashboard)/users/accGraph3d.ts` | 3D position scaling constants. Likely needs `ACC_GRAPH_3D_CAMERA_OFFSET` and `ACC_GRAPH_3D_POSITION_OPTIONS` re-tuned so the sphere fills viewport with the new FOV. |
| `app/(dashboard)/users/UsersDirectoryClient.tsx` | Filter panel section rename "Topology" → "Clustering". |
| `lib/acc/permissionMapping.ts` | (Read-only — drives pie-glyph segment counts.) |

---

## 11. Verification

End-to-end manual UAT on hub-scale data (1,000+ users):

1. Open `/users` — see user-only graph with pie-glyph nodes, no edges. Clusters visibly form within 2 seconds.
2. Hover a user — tooltip card + fan-out lines appear, color-coded by top contributing dimension per peer.
3. Toggle off Project Members in the filter panel — clusters reflow live (no full restart). Re-enable — clusters reflow back.
4. Slide Folder Permissions strength to 0 — same effect as unchecking.
5. Slide simMin from 2 → 5 — weaker pairs drop out; only multi-dim-strong clusters remain.
6. Copy URL, open in a second tab — same filter configuration restored, same cluster shape.
7. Switch to 3D — sphere has visible depth: far nodes dimmer + smaller; faint sphere shell visible; rotating with mouse drag reveals back hemisphere.
8. Same filter sliders applied to 3D — clusters reorganize identically.
9. Frame-rate check: 60 fps at 1,000 users 2D, ≥30 fps at 2,000 users 3D.

Automated checks:
- Vitest coverage for new similarity functions (decay, normalization, simMin gate).
- TypeScript clean.
- ESLint clean.
