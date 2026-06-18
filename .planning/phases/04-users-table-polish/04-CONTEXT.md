# Phase 4: /users Table & Polish - Context

**Gathered:** 2026-06-18
**Status:** Ready for planning

<domain>
## Phase Boundary

The `/users` directory becomes a premium, clickable `DataTable` presentation — fast to first paint, with a reduced initial client payload, and one selective real-3D accent confined to the page header (never the data region). Built on the Phase 2 store/hook seam and the Phase 3 `DataTable` primitive.

**Requirements:** USR-02, PERF-01, PERF-04, INT-03, VIS-03, VIS-04.

In scope: how the directory table looks and behaves, the row peek/detail interactions, the header (KPIs + 3D accent), loading/entrance/error states, and restyling the existing filters to match. Out of scope: new capabilities (search semantics changes, bulk actions, new analytics) and anything touching `/users/spatial-graph`.
</domain>

<decisions>
## Implementation Decisions

### Table columns & density
- **Lean 5-column grid:** Name (pinned, left) · Role · Office · Last active · Projects. Everything else lives in the peek/detail panel, not the grid.
- **Default density: Comfortable** (roomier rows read better at projector distance; matches the DataTable primitive's own default). User can toggle to Compact.
- **Default sort: Name A→Z** (a directory is scanned to find a specific person; alphabetical is the most findable default).
- The secondary-field → peek/panel tiering is set by the payload-deferral boundary (see Claude's Discretion).

### Column semantics (what the fields/numbers mean)
- **Projects column = ALL projects the person belongs to** (total memberships) — not "active only" and not "admin only".
- **Office column = office LOCATION** (MTY / CDMX / MXL …), not company/org name. *(Claude's-discretion default — user did not override; aligns with the calm/scannable direction. Researcher to confirm office-derivation logic, which has name-token + allowlist handling.)*
- **Last active is based on LAST REAL ACC ACTIVITY only** (not last sign-in).
- **Last active format = relative** ("2h ago", "3d ago") **with the exact timestamp on hover.**
- **No recorded activity → subtle muted "— No data"** (NOT "Never"). This is honest about activity-feed coverage gaps (`AccActivity` covers ~428 of 1,152 projects) and avoids implying a judgment about people the feed simply doesn't cover.

### Name cell & role display
- **Name cell = avatar photo with colored-initials fallback** (faces make the directory feel alive on a projector; initials when no photo).
- **Multiple roles → primary role + "+N" badge** in the single Role column (e.g. "Admin +2"); the full role list lives in the peek/panel.

### Dormant / status
- **Dormant/inactive people get a subtle status dot** (active vs dormant), low visual noise — NOT a fully dimmed/greyed row.
- **Dormant threshold = Claude's discretion** (set from the activity-data distribution; ~90-day quiet window is the leaning default).

### Row interactions — peek vs. detail panel (INT-03)
- **Inline row-expand "peek" = mini snapshot + key numbers:** avatar, title, office, last active, plus a few key counts (projects / roles / modules). This is the "glance" layer and shows cheap/already-loaded data.
- **Row-click detail panel = full profile** — the "deep dive" layer. Heavy per-user data is deferred and fetched only when the panel opens (PERF-04).
- The two-gesture split (chevron = peek, cell-click = panel) is enforced by the Phase 3 `DataTable` primitive; this phase supplies the content for each slot.

### Header — KPIs + 3D accent (VIS-04, VIS-06)
- **3D accent = subtle ambient drift:** slow-moving, brand-tinted particles as a depth layer behind the KPIs. Restraint over spectacle. **Confined to the header strip only — never over the data table** (R3F `ssr:false` + `frameloop:demand`; GPU budget < 400MB; PERF-05/VIS-06).
- **Count-up animation = quick & smooth (~1s ease-out), once per load** *(Claude's-discretion default within the motion budget).*

### Loading & entrance (PERF-01, VIS-03)
- **Skeleton = table-shaped shimmer placeholder** matching the real column layout, appearing within ~200ms of navigation. (Not a centered spinner — the page should feel "already there".)
- **Entrance reveal = whole-page fade-in** (user's explicit preference — calm, all at once). **VIS-03 reconciliation:** apply a barely-perceptible few-millisecond row under-stagger beneath the unified fade, so it reads as one calm fade to the eye while still technically satisfying VIS-03's "staggered entrance." If the verifier requires a *visible* cascade, a subtle top→down stagger is the fallback — but the user's stated preference is the unified-fade feel, not a pronounced cascade.
- **Motion fires once per fresh load only** — instant (no re-animation) on sort, filter, density toggle, opening a profile, or returning to the page (matches VIS-05: motion on mount/drill only, never on filter change).
- **Error state (data load fails) = inline message ("Couldn't load the directory") + Retry button**, with the page chrome intact.

### Filters (existing capability — polish only)
- **Filter bar = slim restyled toolbar above the table**, sharing the table's glass/depth language (search + a few dropdowns) *(Claude's-discretion default — user selected to discuss but did not answer; easily revisited).*
- **Filtered-empty state = "No one matches those filters" + a Clear-filters action**, distinct from a true "no data" empty state. Wired to the `DataTable`'s `onClearFilters` slot *(Claude's-discretion default).*

### Claude's Discretion
The user explicitly deferred these — the planner/implementer has flexibility (guided by the notes above and the roadmap direction):
- Secondary-field tiering between peek and panel (driven by the payload-deferral / cheap-vs-heavy data boundary).
- Office column exact source and label (location is the default).
- Dormant threshold value (~90d leaning).
- **Detail panel style** → follow the roadmap's **slide-in-from-right-edge** direction (keeps the table visible, preserves scroll position, and completes the previously-deferred centered-modal → Sheet migration).
- **Detail panel source** → reuse the **existing shared `UserProfilePanel`** wherever a person is clicked (one source of truth, consistent with the access-analysis graph), rather than a `/users`-specific layout.
- **Peek → panel affordance** → likely an explicit "See full profile →" control in the peek plus row-click both opening the panel.
- KPI selection (e.g. Total users · Active 30d · Admins), header composition (title left, KPI glass tiles in a row, particles behind), and count-up timing.
- **Clickable KPIs → display-only** by default (avoids accidental clicks; keeps the header calm; trivially revisited later). *(User selected to discuss but did not answer.)*
- Filter bar exact layout and filtered-empty copy.

</decisions>

<specifics>
## Specific Ideas

- **Direction: calm, premium, restraint over spectacle.** Across every choice the user picked the subtler option — ambient drift (not reactive particles), Comfortable density, a unified whole-page fade (not a pronounced cascade), a status dot (not dimmed rows), display-only KPIs. The table should feel intentional and uncluttered at projector distance, never busy.
- **Honesty about data coverage:** show "— No data" (muted) rather than "Never" for people the activity feed doesn't cover, since `AccActivity` spans only ~428/1,152 projects.
- The shared profile panel and the Phase 3 `DataTable` two-layer contract (peek = glance, panel = deep dive) are reused, not reinvented.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No new capabilities (search-semantics changes, bulk actions, new analytics) were requested.

</deferred>

---

*Phase: 04-users-table-polish*
*Context gathered: 2026-06-18*
