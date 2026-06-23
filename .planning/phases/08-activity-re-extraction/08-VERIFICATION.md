---
phase: 08-activity-re-extraction
plan: 02
artifact: coverage-gate
status: passed
updated: 2026-06-23
---

# 08-02 Full ACCDS Activity Crawl — Verification

## Crawl run (Task 1)

- Crawl source = **full-membership** (08-01 spike PASS). Driven project-by-project via `ACCDS_PROJECT=<id>` over the 1,153 active `AccProject` ids (no source-code change to the ingest script).
- **1,153 / 1,153 projects crawled.** Session expired once (~6.5 h) at project `283f8ca3…`; recovered by re-login and resumed via the done-list skip (no DC quota, no 403-bisect, no refresh-token rotation used).
- Depth: started 84-mo, switched the remainder to 14-mo after confirming the ~12-month platform floor (identical data, ~6× fewer empty calls).

## Resume-gap review (Task 2)

`node scripts/diag-accds-recency.cjs` per-day histogram (last 21d) shows **no unexplained empty spans**. The only low days (2026-06-07 ≈ 642, 06-14 ≈ 608, 06-21 ≈ 381) are **Sundays** — a normal weekly work pattern, not a crawl gap. No project-level resume-skip repair was required.

## COVERAGE GATE

**PASS** (coverage + presence — NOT a recency threshold, per CONTEXT "report, don't block").

- **Full source crawled:** 1,153 / 1,153 active projects attempted (done-list complete).
- **Projects with activity:** `COUNT(DISTINCT "projectId")` = **956**. The 197-project difference vs 1,153 = projects with **zero session-visible activity in the trailing window** (empty/inactive shells, or app-/session-inaccessible) — a labeled coverage fact, NOT a shortfall. Gate passes on: full source crawled + rows present.
- **Total rows:** `AccActivityAccds` = **4,554,785** (baseline was 2,610,482 → **+1,944,303**, +74%). Distinct projects 231 → 956 (**+725, ~4.1×**).
- **Latest activity (labeled FACT, report-only):** `MAX("createdAt")` = **2026-06-23** — current through today.
- **Earliest activity + HISTORY FLOOR (labeled FACT):** `MIN("createdAt")` = **2025-06-17**. Despite requesting 84/14 months, `accds/v0` returns only a **trailing ~12-month window** — this is the platform's `filter[created_at]` floor (resolves CONTEXT `VERIFY:`). **Downstream (Phases 12–14) date ranges must be labeled "trailing ~12 months," not multi-year.** Older history is NOT lost: the DC backfill (below) preserves pre-ACCDS rows.

## Reconciliation (Task 3 — `verify-accds-merge.cjs`, partitioned mode)

**PASS — all merge assertions passed.**
- `accds=4,554,785` + `dc_backfill=41,714` + `dc_admin=871` = **unified 4,597,370** = merged query 4,597,370.
- PASS: backfill kept (DC rows predating per-project ACCDS start) = 41,714 — pre-floor history preserved.
- PASS: account-level admin kept = 871.
- PASS: latest-start project boundary merge = 7 == accds(P) + DC-backfill(P) = 7.
- No silent gaps between the fresh ACCDS data and the existing DC `AccActivity` coverage.

## Gates

- `SELECT COUNT(DISTINCT "projectId"), MAX("createdAt"), MIN("createdAt") FROM "AccActivityAccds"` → 956 / 2026-06-23 / 2025-06-17.
- `verify-accds-merge.cjs` → all assertions passed.
- `npx tsc --noEmit` = 0 (no `.ts` changed — operations-only phase).
- No recency threshold was used to fail the gate (CONTEXT-locked).
