# Phase 4: Interactions + Analytics Bridge - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the user-facing control surface on top of the rendered graph: filter chips, search box, dimension sliders, 2D/3D toggle, click-isolate, hover tooltip, lasso draw + selection, and a pie-chart side panel that breaks down lasso selections by role and permission tier. All interactions mutate only the alpha mask or slider state — never node positions. Anything beyond these specific interactions (saved views, persisted dashboards, additional analytics widgets, multi-user collaboration) is out of scope.

</domain>

<decisions>
## Implementation Decisions

### Lasso + pie chart bridge
- **Activation:** Dedicated toolbar button toggles lasso mode on/off; cursor changes to crosshair while active; Esc or clicking the toggle again exits.
- **Shape:** Freehand drag — user holds left mouse and draws any closed curve; release auto-closes the loop.
- **Panel location:** Right-side panel that slides in from the right when a lasso completes; overlays whatever right-side panel was previously showing (sliders by default).
- **Breakdown content:** Two pie charts side-by-side inside the panel — one for role, one for permission tier.
- **Slice click behavior:** Clicking a pie slice acts as a drill-down filter on the current selection — graph dims everyone in the selection who doesn't match that slice; click the slice again to clear the drill-down.
- **Selection persistence across filters:** Lasso members stay selected when global filters change; the pie chart recomputes from only the still-visible subset of the selection.
- **Multi-lasso:** Single lasso only for v1 — drawing a new lasso replaces the previous selection. (Additive / subtractive selection deferred.)
- **Panel chrome:** Header shows "N users selected" count + an explicit "Clear selection" button.

### Filter + search surface
- **Location:** Top toolbar, horizontal row above the graph — search box + filter group buttons + lasso toggle + 2D/3D segmented control all share this bar.
- **Filter style (categorical):** Chip toggles per value (role, permission tier, project, isExternal). Active chips highlighted; click to add/remove from filter.
- **Filter style (numeric):** Bucket chips for activity count and last sign-in age. Pre-defined buckets become chip toggles (e.g., Activity: Low / Med / High / None; Sign-in: <7d / <30d / <90d / >90d). Keeps the chip pattern consistent across all six dimensions.
- **Dimensions covered:** All six dimensions get BOTH a filter AND a slider — categorical dims via value chips, numeric dims via bucket chips for the filter, plus a 0–100 slider for position influence.
- **Chip overflow handling:** Top bar shows six dimension group buttons (Role ▾, Tier ▾, Project ▾, Activity ▾, Sign-in ▾, External ▾); clicking opens a popover containing the chips for that dimension. Keeps the toolbar clean with many options.
- **Search match style:** Prefix match on name + email only. Types "Lu" → matches anyone whose name OR email starts with "Lu".
- **Search visual effect:** Highlight matches + dim non-matches via the same alpha-mask channel used by filters. Same mechanism as click-isolate to keep the Phase 4 invariant clean.
- **Clear-all affordance:** A subtle "Clear all" link appears at the right edge of the toolbar only when any filter is non-default; hidden when the view is clean.

### Slider UI + 2D/3D toggle
- **Slider location:** Right sidebar, always visible by default. Six sliders stacked vertically. This is the right-side panel's "home state."
- **Slider value display:** 0–100 scale with a numeric badge next to each dimension's label (e.g., "Activity 73").
- **Reset behavior:** Both — a global "Reset" button at the top of the slider panel resets all six to 0, AND double-clicking any individual slider thumb resets just that one.
- **Slider persistence:** Slider values + active filters persist to localStorage and restore on reload.
- **2D/3D toggle UI:** Segmented "2D | 3D" pill control in the top toolbar.
- **2D/3D animation:** Smooth ~600ms tween of camera + z-axis on switch — no jump, no discontinuity (already required by Phase 3 success criteria).

### Click-isolate + hover tooltip
- **Single-click action:** Isolate the clicked node (others drop to ~0.15 alpha) AND open a right-side user-detail panel with the full record.
- **Isolate mechanism:** Same alpha-mask channel as filters/search. Click-isolate writes to the existing `alphaMask Float32Array` — one mechanism, consistent with the Phase 4 invariant.
- **Exit isolate:** Three exits supported — click empty background, press Esc, OR click another node (which re-isolates to that node).
- **Tooltip content:** Full six-field tooltip — name, email, project, role, last sign-in, activity count. Matches Phase 4 success criterion #4 literally.
- **Tooltip position:** Anchored to the hovered node's screen position with a small above-right offset; flips sides / clamps to viewport edges when near the canvas boundary.
- **User-detail panel scope:** Shows ALL projects and roles for the clicked user, regardless of current filters. Click is treated as an investigative action — user wants the complete record.

### Right-side panel coordination (cross-cutting)
- Three panels can occupy the right side: **sliders** (default home), **lasso pie** (on lasso complete), **user detail** (on node click).
- **Rule:** One panel at a time. Latest action wins; closing the active overlay returns to whichever panel was underneath (ultimately the sliders).
- The right side never splits or stacks — single z-stack of overlays over the slider home state.

### Claude's Discretion
- Exact pixel widths, padding, and font sizing for the toolbar, sliders, popovers, tooltip, and right-side panel.
- Specific colors / hover and active states for chips, slider tracks, and segmented control.
- Bucket thresholds for numeric filters (Activity Low/Med/High, Sign-in <7d / <30d / <90d / >90d) — pick sensible defaults from real Hermosillo data distribution.
- Pie chart palette and legend layout inside the lasso side panel.
- Lasso path rendering style (color, dash, thickness, animated marching ants vs static).
- Empty-state messaging when filters return zero nodes.
- Animation easing curves and exact durations beyond the 600ms 2D/3D target.
- Whether to add a keyboard shortcut for the search box (Ctrl/Cmd+K is sensible default).
- Whether the lasso draws on the 2D canvas only or also works in 3D (and if so, how it projects). Recommended: 2D only for v1; disable lasso button when in 3D mode.

</decisions>

<specifics>
## Specific Ideas

- All interactions must respect the Phase 4 invariant: they mutate `alphaMask Float32Array` or slider state only. Positions are frozen after Phase 2's settle; nothing in this phase reads or writes node positions.
- "Click-isolate uses the same alpha-mask channel as filters/search" — this is a deliberate consistency choice. There is one alpha mechanism in the system, not two.
- Drill-down via pie-slice click works *within* the existing lasso selection — it does not create a new global filter; it filters the selection's visible subset.
- localStorage persistence applies to BOTH sliders and filters (revised from the implicit "sliders persist, filters reset" pattern — user picked full persistence).

</specifics>

<deferred>
## Deferred Ideas

- **Additive / subtractive multi-lasso** (Shift = add, Alt = subtract) — single lasso replaces for v1; revisit if power users request it.
- **Saved views / shareable URLs** for filter + slider state — out of scope; could be its own phase.
- **Export selection** (CSV of lasso members) — not in this phase.
- **Search autocomplete / recent searches dropdown** — not discussed; defer to a polish phase if needed.
- **Keyboard shortcuts beyond Esc and Ctrl/Cmd+K** — Claude's discretion to add minimal ones; full shortcut system is its own concern.
- **Lasso in 3D mode** — defer; v1 disables lasso while 3D is active.

</deferred>

---

*Phase: 04-interactions-analytics-bridge*
*Context gathered: 2026-05-19*
