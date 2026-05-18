---
phase: 09-v2.0-list-wave-gap-closure
status: PENDING-MANUAL-UAT
created: 2026-05-18
---

# Phase 09 — v2.0 LIST Wave Gap-Closure — Manual UAT

DECISION: PHASE-9-ACCEPT=PENDING-MANUAL-UAT

> Luis flips the token above to `APPROVED`, `GAPS-DOCUMENTED`, or `REVERT` after walking the checklist below on his localhost dashboard. The literal token string is what the executor verification script greps for — keep the format exact.

---

## Pre-flight (auto-verified by execute-plan)

This phase shipped LIST-01..04 across four execute plans before this UAT scaffold landed:

- **09-01** — tRPC procedures + pure helpers + EXPLAIN ANALYZE
  - `getLastFileActivityBatch` (display path, batched per visible-row set)
  - `usersOrderedByLastFileActivity` (sort path, compound cursor pagination, NULLS LAST)
  - `getProductsForUser` (per-user products fetch, active projects only)
  - Helpers: `reduceMemberStatus`, `parseProductsJson`
  - EXPLAIN verdict: ACCEPTABLE (98 ms batch / 6 ms sort vs 200 ms ceiling on 2,507-row dev DB)
- **09-02** — Status column + Admin pill + facets in directory (LIST-01 + LIST-02)
  - StatusPill / AdminPill components inside `UsersDirectoryClient.tsx`
  - Multi-select Status facet (DropdownMenu + DropdownMenuCheckboxItem)
  - Binary Project Admin facet toggle
  - Replace-selection click semantics + scroll-to-top via `useWindowVirtualizer`
- **09-03** — Module Access section in side panel (LIST-04)
  - `<details open>` collapsible inside `AccUserSidePanel.tsx`
  - Top-level summary (highest-count tier wins, ties broken by administrator>member>none)
  - Per-project deviations rendered inline
  - Unknown-module warning icon + tooltip
  - Click-through narrows directory by module (tier surfaced informationally in chip)
- **09-04** — Lazy file-activity column + server sort + IntersectionObserver hook (LIST-03)
  - `useVisibleRowEmails` hook (rAF-coalesced, 200px rootMargin)
  - `LastFileActivityCell` (skeleton / em-dash+tooltip / relative timestamp)
  - Three-state sort cycle (off → desc → asc → off) with Loader2 spinner
  - displayRows pipeline appends zero-activity rows alphabetically after sorted prefix

---

## Manual UAT Checklist

Walk top-to-bottom on `http://localhost:3000/users` in Chrome with DevTools open (Console + Network tabs visible). Mark Pass / Fail / Notes inline.

### LIST-01: Status column + facet

- [ ] Pass / [ ] Fail — Open `/users`. Each row shows a colored pill labelled exactly `Active`, `Pending`, or `Deleted`.
- [ ] Pass / [ ] Fail — Hovering a status pill shows a tooltip listing per-project statuses (or "Aggregated across all projects").
- [ ] Pass / [ ] Fail — Click a `Pending` pill on any row → list reduces to only pending users; chip appears in active filter row.
- [ ] Pass / [ ] Fail — Click the same `Pending` pill again → list returns to all rows; chip disappears.
- [ ] Pass / [ ] Fail — Open the Status facet in the toolbar → checkbox list shows all three; selecting two filters to the union.

Notes:

### LIST-02: Admin pill + facet

- [ ] Pass / [ ] Fail — Some rows show an `Admin` pill inline with the user name. Hover shows "Project Admin on at least one project".
- [ ] Pass / [ ] Fail — Click `Admin` pill → list filters to admin-only; toggle exists in toolbar; re-click clears.
- [ ] Pass / [ ] Fail — Clicking the pill does NOT open the side panel.

Notes:

### LIST-03: Last File Activity column + sort

- [ ] Pass / [ ] Fail — Column shows skeleton placeholders for off-screen rows; scrolling resolves cells to relative timestamps (e.g., "3 days ago") or em-dash "—".
- [ ] Pass / [ ] Fail — Em-dash hover shows tooltip "No activity in 90d".
- [ ] Pass / [ ] Fail — Click column header → sort arrow appears; spinner shows briefly; rows reorder most-recent-first.
- [ ] Pass / [ ] Fail — Click header again → sort flips to ascending.
- [ ] Pass / [ ] Fail — Click header a third time → sort clears, original row order restored.
- [ ] Pass / [ ] Fail — Users with no file activity sort to the bottom (alphabetically among themselves) in BOTH directions.
- [ ] Pass / [ ] Fail — Network tab shows ONE `getLastFileActivityBatch` request per visible-rows change (not N parallel). Sort fetches `usersOrderedByLastFileActivity` pages.

Notes:

### LIST-04: Module Access section

- [ ] Pass / [ ] Fail — Click any row to open the side panel. A `Module Access` section is visible and EXPANDED by default.
- [ ] Pass / [ ] Fail — Section shows e.g. "Docs: Member across all projects" for modules with consistent tier, and "except Project X: Administrator" for deviations.
- [ ] Pass / [ ] Fail — Modules with unknown keys show a warning icon (⚠) with tooltip "Unknown module from APS".
- [ ] Pass / [ ] Fail — Loading state shows skeleton rows, NEVER raw JSON.
- [ ] Pass / [ ] Fail — Clicking a module row narrows the directory list to users with that module (note: tier is informational in the chip per 09-03 trade-off; predicate is module-only).

Notes:

### Cross-cutting

- [ ] Pass / [ ] Fail — No console errors on `/users` page load or during interactions.
- [ ] Pass / [ ] Fail — Existing facets, side panel sections, virtualized scroll all still work.
- [ ] Pass / [ ] Fail — No "Refresh" / "Sync All" / stale banner UI introduced (feedback memory).
- [ ] Pass / [ ] Fail — Pill text matches canonical labels (Active / Pending / Deleted / Admin) — color is supplementary.

Notes:

---

## Issue Log

Fill this in for any Fail above.

| # | Severity | Requirement | Observation | Suggested Fix |
|---|----------|-------------|-------------|---------------|
|   |          |             |             |               |

Severity scale: `blocker` (revert phase), `major` (gap-closure plan needed), `minor` (defer to next milestone).

---

## Sign-off

Once all rows are Pass (or failures are logged above), flip the DECISION token at the top of this file:

- `APPROVED` — all sections pass; Phase 09 closes; LIST-01..04 marked complete in REQUIREMENTS.md.
- `GAPS-DOCUMENTED` — at least one Fail; Issue Log populated; run `/gsd:plan-phase 09 --gaps` next.
- `REVERT` — major breakage; revert the four 09-0X plans and replan.

**Sign-off date:** _______________
**Signed:** Luis Cortés (luis.ecorteg@gmail.com)

---

*Phase: 09-v2.0-list-wave-gap-closure*
*UAT scaffold: 2026-05-18*
