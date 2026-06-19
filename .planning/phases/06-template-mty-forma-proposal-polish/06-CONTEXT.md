# Phase 6: /template-mty & /forma-proposal Polish - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring the last two pages — `/template-mty` and `/forma-proposal` — up to the shared premium look established in Phases 1–5, by **wiring in what already exists** rather than inventing new surfaces:

- **/template-mty** (read-only analytics): members table → premium `DataTable`; role/module/permission charts → depth/glow theming; role-similarity graph → fixed hover labels + node-click drill; all panels → `PremiumSurface` + staggered reveal + skeleton. (TPL-01, TPL-02, TPL-03)
- **/forma-proposal** (working editor): `HierarchyView` split (layout hook + canvas + thin shell, public API unchanged) with heavy d3 deferred via `dynamic(ssr:false)`; permission-editor panels → restrained `PremiumSurface` depth; one selective real-3D background accent (`frameloop="demand"`, `pointer-events:none`, off the data region). (FRM-01, FRM-02)

This is presentation-layer surgery within a locked stack. No new WebGL context on any data surface; `npx tsc --noEmit` exits 0. **Out of scope this phase:** the Forma role-permission diff view (v2 — needs a new `template.getBaseline(roleId)` query), drillable pies, and any Prisma/schema change.

</domain>

<decisions>
## Implementation Decisions

### /template-mty — Members table (TPL-01)
- Migrate the custom members grid to the premium `DataTable` primitive (from Phase 3).
- **Preserve all current toolbar function:** search box **and** the four filter chips (All / Internal / External / Admin). No loss of capability in the upgrade.
- **Keep the same 5 columns:** Member, Role, Company, Access, Origin.
- **Row interaction:** click → slide-in only. **No inline row-expand** (matches the phase criterion exactly; keeps one clear action per row).
- **Member click opens the shared `UserProfilePanel`** — the same profile that `/users` and `/access-analysis` already open. One consistent profile everywhere; reuse, don't rebuild.
- **Members without an email stay non-clickable and subtly de-emphasized** (no pointer, slightly muted), exactly as today. No false "click me" affordance.

### /template-mty — Role-similarity graph (TPL-02)
- **Node click → slide-in "role overview":** role name, folders reached, tier breakdown, and the list of members who hold that role. Member rows in that panel are clickable through to their own `UserProfilePanel`. All sourced from data already loaded on the page (no new query — passes NA-01).
- **Click drills, drag still moves.** A press with no real movement opens the panel; a press-and-drag still repositions the node. Standard graph UX — distinguish click from drag by a movement threshold; do not add a separate node button.
- **Hover labels clamped in-bounds** — the node labels and the hover tooltip card must never clip past the panel edge (directly satisfies the "non-clipped hover labels" criterion). Keep drag / pan / zoom.
- **Physics: settle then freeze.** The force simulation runs briefly on mount to lay out, then freezes; it reheats only when the user drags a node (no perpetual ticking).
- **Reduced-motion: snap to settled layout** — compute the layout and render it already-settled, no animated jiggle.
- **Reveal with the page's staggered entrance**, then settle — consistent with every other panel.

### /template-mty — Role / module / permission charts (TPL-02, TPL-03)
- **Display-only** (no click-to-drill — drill lives on the table + graph only).
- **Full /access-analysis donut treatment:** gradient fills, rounded segments, selected-segment glow. Maximum visual consistency with `/access-analysis`.
- **All three charts** (role, module, permission) move to the shared themed `EChart` wrapper — single source of truth, auto light/dark.
- **Keep each chart's current form** (pie stays pie, bars stay bars) — each was chosen for its data; apply depth/theming on top rather than converting forms.
- **Hover = lift + glow** on the segment with a tooltip — tactile feedback that does NOT imply a click-through.

### /template-mty — Panels & reveal (TPL-03)
- All panels wrapped in `PremiumSurface` with staggered reveal + skeleton (PERF-01 ~200ms).
- **Empty states get light premium polish** (icon + message inside a `PremiumSurface`) — empty members table, empty role graph — matching the rest of the overhaul.

### /forma-proposal — 3D background accent (FRM-02)
- **Motif: a drifting particle field that matches the /users header accent** (same R3F engine/style). Reads as "the same product."
- **Placement: faint full-bleed background** behind the whole editor, `pointer-events:none` so it never blocks clicks. (The editor is too dense to carve out a dedicated region; this gives depth without stealing space.)
- **Intensity: barely-there ambient** — very low opacity, slow drift; noticeable only if you look. Zero distraction while assigning permissions.
- **Color: brand indigo/violet**, using the shared ambient-glow tokens from the design foundation.
- Renders with `frameloop="demand"`; introduces no WebGL context on a data surface (it sits behind, off the data).

### /forma-proposal — Editor depth (FRM-02)
- **Restrained depth.** Subtle elevation on the **outer containers only** — role rail, editor section, hierarchy view. **Folder-tree rows and tier chips stay flat and dense** for fast scanning. Premium on the projector without slowing real editing.
- **Top bar (mode switch, JSON/CSV export, reset): light polish only** — keep it compact, align to the shared tokens/buttons. Don't rebuild it into a tall premium header (preserve editor space).
- **Loading: layout-shaped skeleton** (rail + tree placeholders) replaces the plain "Loading your draft…" text, to hit the ~200ms skeleton target.

### /forma-proposal — HierarchyView split + deferred d3 (FRM-01)
- Split into layout hook + canvas render + thin shell, **public API unchanged**. Heavy d3 bundle deferred via `dynamic(ssr:false)`.
- **While the d3 bundle loads (on switching to hierarchy mode): a layout-shaped skeleton** of the hierarchy view (consistent with the page's other skeletons).
- **Prefetch the d3 bundle in idle background** after first paint, so the *first* mode-switch feels instant while keeping the initial payload light.

### Cross-cutting
- The single shared slide-in `Sheet` (INT-01) is the one drill target for every click source on both pages.
- Both pages fully legible in light and dark (zinc) themes; chart/canvas colors theme via the shared wrapper; data-label contrast holds at projector brightness (re-verified in Phase 7).

### Claude's Discretion
- Exact skeleton shapes/timing, stagger curve, and reveal durations (within the motion budget).
- The movement-threshold value that separates a "click" from a "drag" on graph nodes.
- Precise particle count/opacity/drift speed for the Forma accent (tune to "barely-there" + GPU < 400MB).
- Exact `DataTable` column widths / density defaults for the members table.
- Tier-breakdown layout inside the role-overview panel.

</decisions>

<specifics>
## Specific Ideas

- "Match /users" is the throughline: reuse the **same `UserProfilePanel`**, the **same particle engine** as the /users header, and the **same `DataTable`** primitive. Consistency over novelty.
- The role graph should stay **explorable live in the room** (drag/pan/zoom kept), but must not jitter perpetually — settle-and-freeze.
- `/forma-proposal` is a **working tool**, not a showcase chart page: make it look premium on the outside, keep it fast and dense on the inside.

</specifics>

<deferred>
## Deferred Ideas

- **Drillable role pies** (click a pie slice → role members, like /access-analysis donuts) — explicitly kept out; pies stay display-only this phase.
- **Forma role-permission diff view** — v2 (FRM-V2-01); needs a new `template.getBaseline(roleId)` tRPC query.
- **Unifying all template charts into donuts** — declined; current chart forms retained.
- **Reactive / interaction-driven 3D accent** (drifts on role switch) — declined in favor of barely-there ambient.

</deferred>

---

*Phase: 06-template-mty-forma-proposal-polish*
*Context gathered: 2026-06-19*
