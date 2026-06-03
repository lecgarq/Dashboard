# Phase 4: ACC Access Analysis Dashboard - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

> **Scope replacement notice:** This phase REPLACES the original Phase 4 scope (ANAL-01..04: graph-overlay flagging + PNG/CSV export). REQUIREMENTS.md will need new IDs (proposed: `DASH-01..N`) and the original ANAL-* requirements should be deprecated or rewritten during planning.

<domain>
## Phase Boundary

A single-page analytics dashboard for ACC access data, surfacing decision-support insights — answering "which roles can be consolidated?", "which roles are unnecessary?", "where is access inconsistent?", and "who's onboarded vs missing?" — replacing the current scattered views with charts, diagrams, and tables in one place.

**In scope:**
- Read-only analytics over existing ACC snapshot data + Google Workspace directory comparison
- Junk-role detection (tiered priority output)
- Duplicate-role detection (module + name similarity)
- Outlier module-combination detection (statistical)
- Active-user tier distribution (7d / 30d / 90d / >90d)
- Admin-access view (ACC account-level admins)
- ACC coverage donut (Workspace ↔ ACC overlap)
- Roles × Modules entitlement matrix
- Recently-added view (configurable window)
- Decision-support recommendations widget
- CSV export per widget
- Drag-reorderable widget grid

**Out of scope (deferred):**
- Acting on recommendations (deleting/merging roles in ACC) — read-only dashboard
- Recommendation tracking state (ack/ignore/done) — read-only every load
- PDF report export — CSV only
- Per-project drill-down beyond surfacing affected projects in side panel
- The original ANAL-01..04 graph-overlay scope (graph badges, on-graph duplicate flagging) — replaced by this dashboard

</domain>

<decisions>
## Implementation Decisions

### Insight Criteria — Junk Roles
- **Tiered output (not binary flag):** HIGH / MEDIUM / LOW cleanup priority based on signal count
- **Signals counted:** (1) zero members assigned, (2) zero modules granted, (3) all members inactive >90 days
- **HIGH** = all 3 signals fire; **MEDIUM** = 2 signals; **LOW** = 1 signal
- **"Inactive" definition for junk score:** lastSignIn older than 90 days for every member of the role
- Requires `lastSignIn` field — already plumbed end-to-end via Phase 2.5 (commit `6cb648c`)

### Insight Criteria — Duplicate Roles
- **Trigger:** identical module entitlements AND similar role names
- **Name similarity:** normalized + token-overlap ≥ 80%
  - Normalize: lowercase, strip punctuation, split on whitespace/dashes
  - Compare token sets (handles reorderings: "BIM Coordinator" ≈ "Coordinator BIM")
  - Catches typos and variants ("Architect" vs "Architecto")
- Surface as pairs ranked by overlap %

### Insight Criteria — Unusual Module Combinations
- **Statistical outlier definition:** module sets held by <5% of members
- Data-driven, no manual rule curation
- Flag set surfaces under "Unusual Access Patterns" widget

### Insight Criteria — Active User Tiers
- **Tiered display, not single threshold:** 7d / 30d / 90d / >90d buckets
- Based on `lastSignIn` field
- Visualized as a stacked bar showing distribution
- Members with null `lastSignIn` go into a separate "Never signed in" tier

### Insight Criteria — Recently Added
- **Configurable timeframe:** 7d / 30d / 90d toggle on the widget
- Default: 30d
- Based on member-creation date (or ACC join date — researcher to confirm field availability)

### Insight Criteria — Admin Access
- **ACC account-level admins only** — the explicit role flag from ACC Admin API
- Excludes project admins and shadow admins (members with elevated module access)
- Smallest, clearest audit set

### Insight Criteria — ACC Coverage (Workspace ↔ ACC overlap)
- **Definition:** comparison of Google Workspace user directory against ACC members by email
- **Master list source:** Google Workspace / Gmail directory via Admin SDK
  - Requires OAuth scope: `admin.directory.user.readonly`
  - Requires Google Workspace admin consent
  - Researcher must investigate: existing OAuth setup, Google Cloud project, scope addition flow, admin consent UX
- **Visualization:** three-segment donut — `In both` / `In Workspace, missing from ACC` / `In ACC, missing from Workspace`
- The "missing from ACC" segment surfaces the actionable to-do list

### Finding Scope (Junk / Duplicate / Outlier)
- **Default:** account-level aggregation (across whole organization)
- **Drill-down:** clicking a finding scopes view to affected projects in side panel
- Both views available; account is the default lens

### Page Layout
- **Structure:** dashboard grid with widget reordering (drag-and-drop)
  - Researcher to evaluate: `react-grid-layout` vs `dnd-kit`
  - Persistence: TBD — researcher should compare localStorage (simple) vs per-user DB (cross-device)
- **Above-the-fold (default order):** Coverage donut + Active-user tier breakdown
  - Lead with population context, not action items
- **Default widget order (decision-priority):**
  1. Coverage donut + Active-user tiers (population context)
  2. KPI strip (totals + counts of findings)
  3. Recommendations widget (junk/duplicates findings)
  4. Roles × Modules entitlement matrix
  5. Outlier module combinations
  6. Project drill-down / per-project view
  7. Recently-added members
  8. Admin-access list
- **Density:** 2-column layout at 1280px, generous whitespace
  - Most charts span half-width
  - Roles × Modules matrix and KPI strip span full-width
  - Directly addresses "feels cluttered" complaint

### Decision-Support Surface
- **Recommendations widget AND inline badges** — both surfaces
  - Widget: dedicated card listing actionable findings ("Merge BIM Coordinator + BIM-Coordinator (94% module overlap)", "Delete Architect_TEMP (HIGH cleanup priority)")
  - Inline badges: severity markers on roles wherever they appear in other charts (matrix cells, role-relationship diagram, etc.)
- **Drill-down on click:** side panel slides in from the right
  - Members affected, modules involved, projects impacted
  - Suggested action
  - Raw data table
  - No navigation away from dashboard
- **No tracking state:** recommendations are read-only every load
  - No ack / ignore / done buttons
  - Acting on a recommendation in ACC makes it disappear naturally on next refresh
  - Saves DB schema work; avoids "stale acknowledge state" problem

### Export
- **CSV per widget** — every chart/table has a "Download CSV" button
- Recommendations widget exports structured CSV: `Type, Severity, Roles, Members, Modules, SuggestedAction`
- No PDF report (deferred)

### Library Allocation
- **Nivo** — Coverage donut + Active-user tier breakdown (above-the-fold; aesthetics matter most)
- **ECharts** — Roles × Modules entitlement heatmap (large/dense data; built-in zoom + tooltip)
- **React Flow** — Role-relationship / consolidation-suggestion diagram (interactive node-edge with overlap edges, custom styling, drag/zoom)
- **shadcn Table + Card** — Recommendations widget, missing-users list, KPI tiles, recently-added list (lists shouldn't be charts; consistent with rest of app)

### Claude's Discretion
- Drag/drop library choice (`react-grid-layout` vs `dnd-kit`) — researcher recommendation
- Persistence layer for widget order (localStorage vs DB) — researcher recommendation, default to localStorage unless cross-device sync is essential
- Exact severity coloring (HIGH / MEDIUM / LOW palette)
- Side-panel animation / transition design
- Empty-state design per widget (no junk roles found, etc.)
- Loading-skeleton design
- Tooltip styling and content depth on Nivo / ECharts charts
- Refresh cadence (cron vs manual button vs on-mount)
- Error states (Workspace API down, ACC stale, etc.)

</decisions>

<specifics>
## Specific Ideas

- "It feels all over the place" + "feels cluttered with data and different formats" — current ACC analysis is fragmented across views; this phase is the consolidation answer
- "Single page" — explicit ask; widget-grid implementation honors this even with reordering
- Library prescription is the user's: **Nivo for charts/diagrams/tables, React Flow for interactive flow/process diagrams, Apache ECharts for complex/large data**. Discussion confirmed concrete allocation per chart.
- Decision-support framing is the user's: "make sure that the data there says things that could help us decide, which roles could be compactated, which roles are unnecesary." Recommendations widget + inline badges is the answer.
- Master-list source = Google Workspace directory — clarified mid-discussion when user defined "ACC coverage" differently than initially proposed.

</specifics>

<deferred>
## Deferred Ideas

- **Acting on recommendations from the dashboard** (delete role in ACC, bulk-reassign members) — would be a separate "remediation" phase. Big surface: write-side ACC API, confirmation flows, audit log.
- **Recommendation tracking state** (ack / ignore / done with persistence) — separate phase if user feedback says read-only is insufficient
- **PDF report export** — CSV per widget covers the analysis use case; PDF is a sharing/stakeholder concern best handled later if needed
- **Per-user widget-order sync across devices** — start with localStorage; cross-device persistence is a follow-up
- **Mobile / narrow-screen layout** — dashboard is desktop-first; tablet/mobile is a separate pass
- **Original Phase 4 scope (ANAL-01..04)** — graph-overlay duplicate flagging, on-graph inconsistent-access highlighting, PNG export of graph view. These were the original ANAL requirements; they may be revisited in a future phase but are explicitly NOT delivered here.

</deferred>

---

*Phase: 04-access-analysis*
*Context gathered: 2026-05-08*
