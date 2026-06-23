# Requirements: LECG Dashboard — v3.0 Access Analysis: Hub Story & Scenario Explorer

**Defined:** 2026-06-22
**Core Value:** A stakeholder can read the situation of the hub at `/access-analysis` as a guided story, then pivot the extracted data across any dimension pair live — fast, clickable, and factually honest.

**Milestone principles (apply to every requirement):**
- **Additive** — no existing panel is removed or reshaped; v3.0 reorganizes + extends.
- **Descriptive, not prescriptive** — no synthetic risk scores, severity grades, or verdict labels ("External access", not "Exposed"). The owner judges risk.
- **Coverage-honest** — every activity-derived surface states "428 of 1,152 projects" in-line.

## v1 Requirements

### Data Currency (DATA) — Phase 8

- [x] **DATA-01**: The hub's activity data is re-extracted current through today for all admin-accessible projects via the FREE ACCDS web-session crawler (`scripts/accds-activity-ingest.cjs`) — no Data Connector quota. Writes `AccActivityAccds` (folder/object-level events). ✓ 2026-06-23 — expanded to full membership (956 projects with activity / 1,153 crawled), 4.55M rows.
- [x] **DATA-02**: The crawl resumes the un-crawled remainder (`ACCDS_RESUME=1`) and recovers from session-cookie expiry (re-run `scripts/accds-login.cjs`) without manual babysitting — no quota pacing or 403-bisect. ✓ 2026-06-23 — one ~6.5h expiry recovered via re-login + done-list resume; no quota.
- [x] **DATA-03**: The ACC web session (`scratch/acc-session.json`, password-equivalent, gitignored) is the auth; bootstrapped once and refreshed on `SessionExpiredError`. (No APS refresh-token rotation — that hazard belongs to the optional DC path only.) ✓ 2026-06-23 — cookie-only auth chain verified in source (no APS_CLIENT_ID/SECRET in the activity path).
- [x] **DATA-04**: A recency + reconciliation check (`scripts/diag-accds-recency.cjs` + `verify-accds-merge.cjs`) confirms `AccActivityAccds` is current through today across the admin project set before downstream data-dependent phases proceed. ✓ 2026-06-23 — recency reported (latest 2026-06-23, floor 2025-06-17); verify-accds-merge all assertions passed.

### Structural Prerequisites (PREP) — Phase 9

- [ ] **PREP-01**: `moduleOverrides` is relocated to `lib/acc/` so server-side analytics can import the activity taxonomy without a lib/app boundary violation.
- [ ] **PREP-02**: A reusable coverage-honesty UI atom ("Based on N of M projects") is available to every panel.
- [ ] **PREP-03**: A shared distinct-user count helper exists so people-counts never double-count instance rows.

### Sectioned Hub Narrative (HUB) — Phase 10

- [ ] **HUB-01**: User can navigate `/access-analysis` via a sticky in-page section nav that highlights the active section.
- [ ] **HUB-02**: The page is organized into themed sections (Overview, People & Roles, Activity, Folders, Coordination, Interconnections) with every existing panel preserved.
- [ ] **HUB-03**: On load, the page presents a hub-wide view stating coverage as fact ("Across 428 admin-accessible projects of 1,152 total").
- [ ] **HUB-04**: Each activity-derived section shows an inline coverage badge.

### Scenario Explorer (SCEN) — Phase 11

- [ ] **SCEN-01**: User can choose a measure (activity, members, roles, issues) and a grouping dimension (role/company/module/folder/time/action/project/user) and see the result.
- [ ] **SCEN-02**: The explorer auto-selects the appropriate chart type for the chosen pairing (no chart-type dropdown).
- [ ] **SCEN-03**: User can click any segment to drill into the underlying people via the shared DrillSheet.
- [ ] **SCEN-04**: User can one-click named presets for the common scenarios (Activity×Folder, Activity×Role, Activity×Module, Role×Users, and more).
- [ ] **SCEN-05**: Every activity-derived explorer result shows its coverage note; oversized pivots are safely capped (top-N + "Other") with a visible note.
- [ ] **SCEN-06** *(differentiator)*: User can add an optional second grouping for a cross-tab heatmap when both dimensions are small.

### Activity Depth (ACTD) — Phase 12

- [ ] **ACTD-01**: User can see a calendar heatmap of activity over time (by day).
- [ ] **ACTD-02** *(differentiator)*: User can see the behavior mix over time (view / upload / edit / delete) as a stacked series.
- [ ] **ACTD-03** *(differentiator)*: User can see the most-acted-on files/models (hottest objects) — conditional on ACCDS data completeness post-extraction.
- [ ] **ACTD-04**: Activity views display attribution honesty (resolved vs unresolved share).

### Hygiene Facts (HYG) — Phase 12

- [ ] **HYG-01**: User can see factual role-hygiene findings — empty/junk roles, duplicate role pairs, outlier module combinations — in a sortable table, with no severity score or risk verdict (surfaces the already-built `computeAllFindings()`).

### Folder Reach & Exposure (FOLD) — Phase 13

- [ ] **FOLD-01**: User can see internal vs external access composition as a factual breakdown.
- [ ] **FOLD-02**: User can see which external companies hold permissions on which internal folders (who-can-reach-what), grouped by folder tier.
- [ ] **FOLD-03**: User can see dormant access as a fact (folder permissions held by users with last sign-in > 90 days).
- [ ] **FOLD-04** *(differentiator)*: User can see folder storage distribution (size / file-count treemap) where crawl data exists, labeled where it does not.

### Interconnections (LINK) — Phase 14

- [ ] **LINK-01**: User can see a Sankey of Company → Role → Module access flow, capped (top-N + "Other") and clickable to drill into people.

## v2 Requirements

Deferred to a future release (v3.1+). Tracked, not in this roadmap.

### Interconnections

- **LINK-V2-01**: Chord / co-occurrence matrix (firm collaboration, role co-occurrence). High complexity; needs `ChordSeriesOption` runtime verification. Sankey covers the more impactful story first.

### Scenario Explorer

- **SCEN-V2-01**: User-persisted custom presets + export/download of a scenario view.
- **SCEN-V2-02**: Date-range filter UI on the explorer.

### Carried from v2.0 (not this milestone)

- **FRM-V2-01**: Forma role-permission diff view (needs `template.getBaseline(roleId)` query).
- **USR-V2-01**: `/users` data freshness / auto-refresh.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Synthetic risk scores / severity grades / "exposed / high-risk" verdict labels | Owner explicitly judges risk himself; dashboard is descriptive only |
| Full custom dashboard builder / general BI tool | Scope-creep; the picker + presets cover the named scenarios without a builder |
| Re-extracting the 724 non-admin (403-locked) projects | Luis is project-scoped admin, not Account Admin; cannot self-grant access |
| New data pipelines / external integrations beyond the DC re-extraction | Existing Prisma DB is the source of truth |
| Wiping or redesigning the existing 14 panels | Additive milestone — preserve current panels |
| `/users/spatial-graph` | Separate future project (real 3D) |
| Real-time / live-updating charts, mobile-first layout | Workshop is presenter-driven on a projector; not needed for v3.0 |

## Traceability

Final mapping. Each requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 8 (Activity Re-Extraction) | Done 2026-06-23 |
| DATA-02 | Phase 8 (Activity Re-Extraction) | Done 2026-06-23 |
| DATA-03 | Phase 8 (Activity Re-Extraction) | Done 2026-06-23 |
| DATA-04 | Phase 8 (Activity Re-Extraction) | Done 2026-06-23 |
| PREP-01 | Phase 9 (Structural Prerequisites) | Pending |
| PREP-02 | Phase 9 (Structural Prerequisites) | Pending |
| PREP-03 | Phase 9 (Structural Prerequisites) | Pending |
| HUB-01 | Phase 10 (Sectioned Hub Narrative) | Pending |
| HUB-02 | Phase 10 (Sectioned Hub Narrative) | Pending |
| HUB-03 | Phase 10 (Sectioned Hub Narrative) | Pending |
| HUB-04 | Phase 10 (Sectioned Hub Narrative) | Pending |
| SCEN-01 | Phase 11 (Scenario Explorer Core) | Pending |
| SCEN-02 | Phase 11 (Scenario Explorer Core) | Pending |
| SCEN-03 | Phase 11 (Scenario Explorer Core) | Pending |
| SCEN-04 | Phase 11 (Scenario Explorer Core) | Pending |
| SCEN-05 | Phase 11 (Scenario Explorer Core) | Pending |
| SCEN-06 | Phase 11 (Scenario Explorer Core) | Pending |
| ACTD-01 | Phase 12 (Activity Depth & Hygiene Facts) | Pending |
| ACTD-02 | Phase 12 (Activity Depth & Hygiene Facts) | Pending |
| ACTD-03 | Phase 12 (Activity Depth & Hygiene Facts) | Pending |
| ACTD-04 | Phase 12 (Activity Depth & Hygiene Facts) | Pending |
| HYG-01 | Phase 12 (Activity Depth & Hygiene Facts) | Pending |
| FOLD-01 | Phase 13 (Folder Reach & Exposure) | Pending |
| FOLD-02 | Phase 13 (Folder Reach & Exposure) | Pending |
| FOLD-03 | Phase 13 (Folder Reach & Exposure) | Pending |
| FOLD-04 | Phase 13 (Folder Reach & Exposure) | Pending |
| LINK-01 | Phase 14 (Interconnections — Sankey) | Pending |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-22*
*Last updated: 2026-06-22 — traceability finalized after roadmap write*
