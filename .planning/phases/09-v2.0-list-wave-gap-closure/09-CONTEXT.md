# Phase 09: v2.0 LIST wave — gap closure - Context

**Gathered:** 2026-05-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Close v2.0 LIST-01..04 by enriching the user-list surface:
- **LIST-01:** `status` column (active / pending / deleted) + filter facet
- **LIST-02:** `accessLevels.projectAdmin` inline indicator + filter facet
- **LIST-03:** Lazy last-file-activity column with enforced SORT contract (deferred from Phase 03-03)
- **LIST-04:** Per-module `products` tier section in side panel (administrator / member / none)

Supersedes the never-executed `.planning/phases/05-ui-enrichment-waves/5.2-list-wave-PLAN.md` draft. Many implementation details are pre-locked there and remain binding (status reduction rule, ACTV-03 lazy contract, DASH-18 interactivity contract, no-manual-sync UI, pill text load-bearing) unless overridden below.

</domain>

<decisions>
## Implementation Decisions

### Surface (where the work lives)
- **List home:** Claude's discretion — researcher confirms whether `app/(dashboard)/users/UsersDirectoryClient.tsx` on `/users` is still the canonical user-list view after the 2026-05-13 Cosmograph/Mosaic + user-project-instances pivot. If the list has been relocated (e.g., into AccessAnalysisPage), route the enrichment to whichever surface is canonical now.
- **Admin scope on directory row:** Aggregate at the user level — show `Admin` inline pill if user is `projectAdmin === true` on **any** project. Directory stays one-row-per-user despite the user-project-instances pivot in the graph.
- **Side panel approach:** Clean append — treat `AccUserSidePanel.tsx` as a stable shell and add a new `Module Access` collapsible section. Do NOT redesign the panel.
- **Pre-flight verification (researcher):** Confirm `BulkAccUser.aggregatedStatus` and `BulkAccUser.projectAdmin` optional fields still exist. These were supposed to ship with Wave 5.1; if they're missing, Phase 09 must add them itself (scope expansion — surface in research).

### Last-file-activity SORT contract (LIST-03)
- **Sort strategy:** **Server-side sort** — add a new tRPC procedure that orders all users by `lastFileActivity` and paginates. Sort is instant and complete from the user's perspective; preserves ACTV-03 (no eager client-side load).
- **Default sort on first render:** **DESC by activity** — most-recently-active users at top. Makes activity feel load-bearing on the page.
- **Header affordance while sort query in flight:** Show a loading indicator (spinner) on the column header next to the sort arrow. User knows sort isn't instant.
- **Empty-row sort order:** Claude's discretion — recommendation is "always last" regardless of asc/desc direction (standard pattern).
- **Lazy column rendering unchanged:** The lazy IntersectionObserver + `getLastFileActivityBatch` for *visible* rows still applies for displaying values; the new server-side sort procedure exists in parallel for the sort code path only.

### Module Access section (LIST-04)
- **Layout:** **Top-level + per-project deviations** — show "Across all projects" summary (e.g., "Docs: Member") with deviations expanded inline below ("except Project X: Administrator"). Information-dense, highlights anomalies, aligns with user's widget-interactivity preference.
- **Default state:** **Expanded by default** when side panel opens. Drill-down territory; user opened the panel to see detail.
- **Click-through (DASH-18):** Clicking a module/tier row filters the directory list to users with that same module+tier combination. Cross-widget interaction via list-reduction.
- **Unknown modules (keys from APS not in documented 8):** Render the raw key with a **warning icon** + tooltip "Unknown module from APS". Surfaces spec drift without breaking the UI.
- **Raw JSON forbidden** (LIST-04 explicit lock from 5.2 archive).

### Pill click behavior (LIST-01 + LIST-02)
- **Status pill click:** **Replace selection** — single-status filter shortcut. Clicking "Active" on a row clears any other status facet selections and sets only that one. Re-clicking the same pill clears all status filters. Pill acts as a quick-jump shortcut, NOT an additive toggle.
- **Spotlight semantics:** Facet-reduction IS the spotlight. Pill click reduces the list; that visible reduction IS the cross-widget signal. No separate spotlight event channel.
- **Admin pill click:** Claude's discretion — recommendation is toggle the Project Admin binary facet on/off (simplest mapping).
- **Scroll behavior on filter change:** Claude's discretion — recommendation is scroll-to-top (standard pattern).

### Claude's Discretion
- Empty-row sort position (recommendation: always last)
- Admin pill click semantics (recommendation: toggle Project Admin facet)
- Scroll behavior on filter change (recommendation: scroll to top)
- Status pill color tokens, facet UX details, mobile/responsive behavior, accessibility specifics
- Exact server-side sort procedure shape / pagination size
- Whether to share `getLastFileActivityBatch` with the new server-side sort procedure or keep them separate

</decisions>

<specifics>
## Specific Ideas

- **Carry forward from 5.2 archive (still binding):**
  - Status reduction: any-active → "active"; else any-pending → "pending"; else "deleted"
  - Pill text load-bearing; color supplementary only (accessibility)
  - ACTV-03: `lastFileActivity` NEVER eager-loaded onto `BulkAccUser`
  - No manual sync UI (no Refresh, no Sync All, no stale-cache banner)
  - DASH-18: hover detail + click-through + cross-widget signal on every new affordance
  - Reuse existing `Badge` / `Tooltip` shadcn components; don't introduce new pill components
- Information-dense + interactive widget treatment preferred (per user feedback memory)
- Skeleton shimmer for lazy cells; em-dash with tooltip "No activity in 90d" for empty
- Side panel "Module Access" collapsible — use `parseProductsJson` helper pattern from the 5.2 archive

</specifics>

<deferred>
## Deferred Ideas

- Status pill color-token customization beyond standard green/amber/gray
- Mobile-responsive layout of the directory list (out of scope; current view is desktop-first)
- Cross-widget spotlight event channel (not needed — facet-reduction is the spotlight)
- Side panel layout redesign (clean append only; redesign would be its own phase)
- Click-to-navigate-to-ACC-module from Module Access section (deferred — keeps interaction model in-dashboard)

</deferred>

---

*Phase: 09-v2.0-list-wave-gap-closure*
*Context gathered: 2026-05-18*
