---
phase: 08-activity-re-extraction
plan: 02
status: complete
completed: 2026-06-23
requirements: [DATA-01, DATA-02, DATA-03, DATA-04]
---

# 08-02 Summary — Full ACCDS activity crawl + coverage gate

## Outcome

**COVERAGE GATE PASS.** The full ACCDS activity crawl ran over all 1,153 active projects (the spike-decided full-membership source) with **no DC quota**. `AccActivityAccds` now holds **4,554,785 rows across 956 active projects** — up from 2,610,482 / 231 (**+1.94 M rows / +725 projects, ~4.1× coverage**). Reconciliation vs the DC baseline passed with no silent gaps.

## What was done

1. **Task 1 (crawl, owner+background):** Per-project `ACCDS_PROJECT` loop over 1,153 ids (no script edit). One session expiry (~6.5 h) recovered by re-login + done-list resume. Depth dropped 84→14 mo after confirming the platform floor.
2. **Task 2 (gap review):** `diag-accds-recency.cjs` histogram clean — low days are Sundays, not gaps. No per-project repair needed.
3. **Task 3 (gate + reconcile):** Coverage gate recorded; `verify-accds-merge.cjs` all assertions passed.

## Key facts (labeled)

- **Latest activity: 2026-06-23** (current through today) — report-only, not a freshness gate.
- **History floor: ~trailing 12 months** (MIN 2025-06-17). `accds/v0` floors `filter[created_at]` regardless of requested window. **Phases 12–14 date UIs must label "trailing ~12 months."**
- **956 / 1,153** projects have activity; the 197 remainder are empty/inactive/inaccessible shells (labeled coverage fact, not a shortfall).
- DC backfill (41,714 rows predating the ACCDS window) preserved → unified total 4,597,370.

## Key files

- Created: `.planning/phases/08-activity-re-extraction/08-VERIFICATION.md` (Coverage gate, history floor, reconciliation).
- No source code changed. No new packages. `npx tsc --noEmit` = 0.

## Notes for downstream

- Phases 12/14 activity views: source `AccActivityAccds` (fresh, 956 projects, trailing ~12 mo) — data-authority decision still deferred to Phase 11/12 per roadmap.
- Operations artifacts in `scratch/` (`accds-fullcrawl-*.txt/.sh/.log`) are gitignored; not committed.
