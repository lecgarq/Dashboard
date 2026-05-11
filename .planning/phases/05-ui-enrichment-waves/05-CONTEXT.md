# Phase 5: UI Enrichment Waves - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface newly-ingested v2.0 data (statuses, project-admin flags, last-file-activity, per-module products, folders + folder-role permissions, 3-tier admin overlay) through the **existing** user list, spatial graph, and dashboard widgets. 13 requirements total: LIST-01..04 (4), GRAPH-01..04 (4), DASH-14..18 (5).

Leaf phase. No new top-level surfaces — only enrichments of existing widgets. GRAPH-04 (folder nodes in 3D) is conditional on Phase 4 perf pre-flight GO/NO-GO.

</domain>

<decisions>
## Implementation Decisions

### Wave sequencing & split

- **Split into 5.1 / 5.2 / 5.3** — three sub-phases, each with its own PLAN.md and UAT gate.
- **Order: GRAPH (5.1) → LIST (5.2) → DASH (5.3)** — highest-risk wave goes first to de-risk early.
- **Run in parallel with Phase 4** — only GRAPH-04 (folder nodes in 3D) is blocked by Phase 4 perf pre-flight. LIST and DASH waves do not depend on Phase 4 and start immediately. GRAPH wave starts but **carves out GRAPH-04** until Phase 4 returns.
- **Interactivity contract is a hard gate on every widget** — modified AND new widgets must pass hover-detail / click-through / cross-widget spotlight before that sub-phase's UAT closes. No exceptions, baked in from task 1 of each sub-phase (per v1.0 feedback memory).
- **Separate UAT session per sub-phase** — each of 5.1/5.2/5.3 closes with its own `/gsd:verify-work`. Faster feedback loop; issues caught before next wave starts.

### LIST wave (5.2)

- **Status column**: dedicated column with active/pending/disabled pill + multi-select filter facet in the toolbar (matches existing filter pattern).
- **projectAdmin indicator**: small "Admin" pill inline next to the user's name in the row.
- **last-file-activity column (lazy)**: on-scroll batched fetch with skeleton shimmer in the cell while loading. No user action required.
  - Empty state: em-dash `—` with tooltip "No activity in 90d". Signals intentional empty vs loading.
- **Per-module products tier**: new dedicated collapsible "Module Access" section in the side panel, listing each ACC module + tier (e.g. "Docs: Editor", "Build: Member").

### GRAPH wave (5.1)

- **Hover detail**: rich tooltip card on hover — name, status, company, accessLevels, last sign-in, last file activity. No click required (information-dense per feedback memory).
- **3-tier admin overlay**:
  - Visual: **shape change per tier** (e.g. circle / diamond / star glyphs). Hub admin tier: **star glyph + gold halo + ~1.5× base node size** so hub admins (rare, important) are unmistakable at any zoom.
  - Activation: **toggle button in graph toolbar, OFF by default**. Single "Show admin tiers" toggle — keeps default graph clean, on-demand for audits.
- **Per-project role filter**:
  - Behavior: **AND with existing filters** (intersect with status/module).
  - UI: new collapsible "Role" group in the existing graph filter sidebar, alongside status/module.
- **Folder nodes (GRAPH-04, conditional on Phase 4 GO)**:
  - Visual: separate **cluster region** of the 3D space — "users live here, folders live there". Connected to user nodes by edges that cross the gap.
  - Selection: clicking a folder node spotlights all users with access AND opens side panel with folder path, role breakdown, members-assigned counts, orphan-role flags.
  - Edges (user → folder): **thin translucent, color-coded by permission tier** (View / Download / Edit / Full).
- **Orphan roles**: subtle **amber warning halo** on folder nodes when orphan roles exist, AND a Recommendations entry surfacing the specific orphan. Two surfaces, one signal.
- **Selection spotlight (cross-widget)**: dim non-selected nodes to ~20% opacity, add bright halo on selected set. Reuses v1 spotlight pattern.
- **Labels**: keep current UAT-approved polish curve unchanged — `pow(zoom, 0.2)` clamped `[0.85, 1.4]`, pill backgrounds, 11px floor / 18px ceiling.

### DASH wave (5.3)

- **KpiStrip tiles** (pending invites / project admins / folders crawled): **append to existing strip** at the end. Natural growth, no layout disruption. May wrap on narrow screens.
- **Recommendations new findings** (stale invite, orphan role): **severity-based interleave** with existing findings. Orphan role = high severity, stale invite = medium. Single ranked list, users see the most important regardless of finding type.
- **AdminConstellation 3-tier reskin**: **mirrors the GRAPH wave admin overlay styling** (same star/glyph/halo conventions). One visual language across surfaces — supports cross-widget consistency.
- **RolesModulesHeatmap hub vs per-project**: single header toggle "Hub view / Project view". Default = Hub view (preserves current behavior).
- **Folder fallback contract (if Phase 4 NO-GO on GRAPH-04)**:
  - Folder × role matrix widget (already required by Phase 4) becomes the canonical folder surface.
  - Clicking a folder cell in the matrix opens a **dedicated folder detail panel** with path, roles, member counts, orphan flags.
  - No graph integration, but full interactivity (DASH-18 contract) preserved.
  - GRAPH-04 logged as contingency in roadmap backlog if NO-GO.

### Cross-cutting

- **Performance budget**: **minimum 60 FPS** on UAT hardware with all overlays + filters active. Hard floor — below that, planner must defer or simplify a feature. Strict baseline preserves v1 graph feel.
- **Accessibility**: color encoding is never the sole signal. Status pills carry text, permission edges use thin/thick variants in addition to color, admin tiers use shape change in addition to color. Pattern: **color enhances, never solely encodes**.

### Claude's Discretion

- Exact gold/silver/bronze (or chosen) color ramp for admin tiers — pick from existing brand palette.
- Specific severity scoring algorithm for stale-invite vs orphan-role Recommendations findings.
- Skeleton shimmer animation timing for lazy `last-file-activity` cells.
- Default sort and column order in the enriched user list.
- Side-panel collapsible default state for the new "Module Access" section.
- KpiStrip wrap behavior on narrow viewports.
- Hover tooltip card layout/typography details.

</decisions>

<specifics>
## Specific Ideas

- "Folders should occupy a different spatial position from users" → drove the **separate cluster region** decision over same-region-different-shape.
- "Hub admins should be unmistakable" → drove the **star + gold halo + 1.5× size** treatment specifically for the top tier.
- Reuse the UAT-approved v1 label polish curve verbatim — it shipped 2026-05-08 and the user approved it; no need to revisit.
- Interactivity contract feedback from v1.0 Phase 4.1 ("graphical widget reskins must be interactive + information-dense") is the north star — applies to every modified/new widget in Phase 5.
- No manual sync UI feedback applies — none of the wave reskins should introduce Sync All / Refresh buttons; sync stays automatic (Railway release + cron).

</specifics>

<deferred>
## Deferred Ideas

- **Holistic a11y polish phase** — explicit a11y audit / high-contrast mode toggle / keyboard navigation pass is NOT in Phase 5 scope. Phase 5 enforces "color never sole signal" but a dedicated a11y phase (post-v2.0) can deepen this.
- **Mobile-specific responsive treatment** — KpiStrip wrap and side-panel collapse on narrow viewports are at Claude's discretion in Phase 5, but a dedicated mobile-pass phase could later optimize.
- **GRAPH-04 (folder nodes in 3D) contingency** — if Phase 4 returns NO-GO, GRAPH-04 itself is deferred to a future phase pending a different rendering strategy. The dashboard-only fallback (matrix + drill panel) ships either way.
- **Per-project filter via right-click context menu on project nodes** — considered for GRAPH role filter UI, deferred in favor of the sidebar group pattern. Could be added later as a power-user shortcut.

</deferred>

---

*Phase: 05-ui-enrichment-waves*
*Context gathered: 2026-05-11*
