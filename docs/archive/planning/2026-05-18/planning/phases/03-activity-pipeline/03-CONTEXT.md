# Phase 3: Activity Pipeline - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the placeholder Deep Sync wiring (Phase 1 shell) with the real BIM360 Data Connector flow:
- Ingest `project_activities.csv` and `admin_activities.csv` from signed-S3 ZIP into `AccActivity` (streaming, 500-row batches, all-time retention).
- Expose per-user, per-action-type last-file-activity via lazy tRPC query for `DashboardSidePanel`.
- Surface WHO-added-WHOM inviter attribution in the existing `RecentlyAdded` widget.
- Add a paginated activity drill-down to `DashboardSidePanel`.

Streaming/ETL implementation (`unzipper` + `csv-parse`, no Authorization header on S3, 500-row `createMany({ skipDuplicates: true })`) is locked by ROADMAP and not a discussion topic. Out of scope: search across activity, scheduled reports, GRAPH/DASH wave changes (Phase 5), folder data (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Activity drill-down panel (ACTV-05)
- **Organization:** Nested — top-level sections by action TYPE (e.g. Files, Member events, Project events), reverse-chronological order WITHIN each section.
- **Section state:** All sections expanded by default.
- **Section headers:** Show counts, e.g. `Files (42)`.
- **Row fields:** Action + target + project + relative timestamp. Example: `Uploaded → Foo.dwg · ACME Tower · 2 days ago`.
- **Pagination:** 25 rows per type-section, with "Load more" button inside each section.
- **Row click behavior:** Non-interactive in v1 (no spotlight, no deep-link). Phase 5 may add cross-widget spotlight under interactivity contract.
- **Filters above sections:** Compact row with `[Date range ▾] [Project ▾]`.
  - Default date range: **All time**.
  - Default project filter: **All projects** (no preselection).
- **Empty states:**
  - No activity at all → `No activity yet` message.
  - Filter returns zero rows → `No activity in this range` + clear-filter button.

### WHO-added-WHOM surfacing (ACTV-04)
- **Display:** Stacked avatars on each invitation row — invitee avatar in front, inviter avatar slightly behind (~6px overlap, inviter slightly smaller).
- **Unresolved inviter:** Show `Invited by Unknown` with a small warning icon.
- **Inviter click → filter mode:** Clicking the inviter avatar/name filters the widget to "everyone Jane invited". Filter state shown as a pill at the top of the widget: `Filtered by Jane Doe ×`.
- **Re-invited users (multiple inviters):** Show most recent inviter primary, with `(+N others)` suffix; hover reveals full list with names + dates, newest first.
- **Scope:** Inviter avatar/text appears only on invitation rows. Widget remains invitation-focused per ACTV-04.

### "File activity" definition (ACTV-03)
- **Action types counted as file activity:**
  - File Viewed / Downloaded
  - File Uploaded / Versioned
  - File Edited / Markup / Comment
  - File Deleted / Restored
  (i.e., all four buckets count, but they are tracked as SEPARATE timestamps — see below.)
- **Shape:** Per-user, **separate** timestamps per action category — `lastView`, `lastUpload`, `lastEdit`, `lastDelete`. Not a single rolled-up `lastFileActivity`.
- **Zero-activity display:** Show `Never` (or `—`) per type. Do not fall back to last sign-in. Do not hide the field.
- **Action-type normalization:** Store **raw** `action_type` from CSV in DB (lossless). Normalize to categories at query time via app-code mapping table. Mapping fixes do not require re-ingest.
- **Lazy query behavior:** tRPC query invoked on **row hover with debounce** in user list AND on side-panel open. Hover prefetch primes the cache for the click. NOT eager-loaded into `BulkAccUser` or `FindingsContext` (per ACTV-03).
- **Caching:** React Query default (stale-while-revalidate). Staleness is bounded by next sync.

### List-column UX (LIST-03 prep)
- **Default visibility:** All 4 mini-columns (View / Upload / Edit / Delete) visible by default.
- **Header style:** Grouped header `File Activity` spanning the 4 sub-columns (multi-row header).
- **Cell format:** Relative time (`2d ago`); absolute date on hover tooltip.
- **Sort:** Click sub-column header sorts by that timestamp descending; `Never` values sort to bottom.

### Attribution edge cases
- **Primary join strategy:** Case-insensitive exact email match between activity rows and `AccProjectMember`, **with Autodesk user-ID fallback** when email match fails (requires Autodesk ID present in AccActivity ingest).
- **On failure:** Show `Unknown inviter` with warning icon on the row.
- **Audit logging:** Persist unmatched-attribution cases into a dedicated DB table (e.g. `UnresolvedAttribution`) for later cleanup / pattern analysis. Not surfaced in main UI.
- **Same-person-multiple-emails:** **Auto-merge** when Autodesk ID matches (requires ID present). Without ID, treat as separate users.

### Sync visibility / status
- **Surfacing:** **Extend** existing `SyncFreshnessPill` to roll up activity sync alongside other data sources. No new pill.
- **Failure visual:** Pill turns amber on failure; hover reveals reason. No toasts, no modals.
- **Partial-success runs:** Distinguished from full failure — amber pill + `Partial` label so user knows some data is incomplete.
- **Manual trigger:** **No manual UI** anywhere. Sync is cron-driven (Railway release + scheduled cron). Aligns with existing policy: no manual sync UI.

### AccActivity schema (informs SCHEMA + ingest design)
- **Autodesk user ID:** Persist Autodesk user ID per activity row. If not present in CSV, look it up against MEM data at ingest. Required for ID-fallback attribution and merge.
- **Action type:** Store `raw_action_type` (TEXT). Normalized category computed at query time (NOT stored as a column). Mapping lives in app code.
- **Indexes:**
  - `(user_email, timestamp DESC)` — primary lazy-query path.
  - `(project_id, timestamp DESC)` — project-filtered drill-down.
  - `(autodesk_user_id, timestamp DESC)` — fallback attribution + merge join.
- **Retention:** All-time, no prune. Matches ROADMAP / ACTV-02.

### RecentlyAdded widget time window
- **Default window:** User-configurable segmented control inside the widget header — `[7d | 30d | 90d]`. Pick a default during planning (lean toward 30d).
- **Row count:** 10 rows visible in widget; `See all` link opens the full list in side panel.
- **Sort:** Newest first.
- **Filter interaction:** When `Filtered by Jane` is active, the time-window filter is **relaxed** — show all of Jane's invitations regardless of date. Filter intent overrides recency framing.

### Claude's Discretion
- Exact avatar sizes, overlap pixel values, color tokens — follow existing dashboard design system.
- Multi-row table header implementation details for the `File Activity` grouped header (CSS / library specifics).
- Hover-debounce timing for lazy prefetch (suggest 200–300ms).
- Exact column order of the 4 mini-columns.
- `UnresolvedAttribution` table schema details (timestamp + raw email + activity ID + reason is sufficient).
- React Query `staleTime` / `gcTime` tuning.
- Default selection between 7d / 30d / 90d for `RecentlyAdded` segmented control (suggest 30d).
- Wording / icon for the amber "Partial" sync state.
- Whether Autodesk ID lookup against MEM happens inline during ingest vs in a post-ingest pass.

</decisions>

<specifics>
## Specific Ideas

- Inviter pill filter pattern (`Filtered by Jane Doe ×`) should match the existing FILT cascade chip styling.
- `SyncFreshnessPill` extension should preserve current amber/green semantics — do not invent new colors.
- The lazy-query hover prefetch is a deliberate departure from "open only" — user wants snappier perceived performance, but ACTV-03's "NOT eager-loaded" contract is still honored because nothing fires until interaction.
- Nested type-section grouping in the drill-down is the user's deliberate choice over flat chronological — they want to scan by category, not by time.

</specifics>

<deferred>
## Deferred Ideas

- Cross-widget spotlight on clicking an activity row → Phase 5 (DASH-18 interactivity contract).
- Activity-row deep-link into ACC (open file/project in BIM360 web) → backlog; requires URN preservation verification.
- Activity search across all users / global activity timeline view → out of scope; could be a future widget.
- Auto-merge by name + company heuristic → backlog (risky, may produce false-positive merges).
- Archive old activity rows to cold storage → future optimization, not Phase 3.
- Hidden `/admin/sync` manual re-trigger route for incident response → backlog; can be added later if cron-only proves insufficient.

</deferred>

---

*Phase: 03-activity-pipeline*
*Context gathered: 2026-05-11*
