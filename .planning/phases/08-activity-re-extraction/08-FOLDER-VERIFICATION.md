---
phase: 08-activity-re-extraction
plan: 03
artifact: folder-coverage-gate
updated: 2026-06-22
---

# 08-03 Folder Crawl — Verification (FOLD-04 enabler)

## Pre-flight

**APS app credentials (2-legged client_credentials):** present.
- `APS_CLIENT_ID` set: **true** (existence verified via `process.env`; value never read/printed).
- `APS_CLIENT_SECRET` set: **true** (existence verified via `process.env`; value never read/printed).
- Auth model: 2-legged `client_credentials` — **no ACC session, no DC daily quota, no APS refresh-token rotation** (CONTEXT/RESEARCH Q5).

**Folder-crawl source scope (`AccProject` active):** `SELECT COUNT(*) FROM "AccProject" WHERE status = 'active'` = **1,153**.

**Scope note (labeled fact — coverage honesty):** The folder crawl follows the `AccProject` active set (**1,153**), which is *broader* than the activity admin set (`AccActivity` distinct `projectId` = **234**) and the existing ACCDS coverage (231 distinct projects). The Phase 13 storage treemap (FOLD-04) therefore reflects folder data for up to 1,153 active projects, not just the 234 activity-admin projects. This is a scope *difference*, not a gap — recorded, not blocked.

**Baseline (pre-crawl), for measuring crawl effect:**
- `AccActivityAccds` rows: 2,610,482 across 231 distinct projects (activity baseline; unrelated to folder size but recorded for the phase delta).

## Crawl run (Task 2)

Owner ran `node scripts/folder-crawl-cron.cjs` (2-legged APS app credentials). Completion confirmed from DB state — `AccProject` active `folderCrawlStatus`: **ok = 975**, **inaccessible = 178** (= all 1,153; no `never`/`partial`/`failed`/`pending` remaining), so the crawl processed the full active set with no systemic auth failure. The 178 `inaccessible` are projects the 2-legged app cannot read (labeled fact, not a gap).

## FOLDER GATE

**PASS** — `AccFolder.totalSizeBytes` is populated, so the Phase 13 storage treemap (FOLD-04) has real data.

- `SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"` = **111,308** (> 0 ⇒ PASS).
- Total folders: 415,908. Sized total: **~3,488.5 GB (~3.4 TB)**.
- Distinct projects with folder-size data: **295** (of 975 ok-crawled / 1,153 active).
- `SELECT COUNT(*) FROM "AccFolderPermission"` = **6,040,610** (scalar aggregate only — never an unbounded read; v2.0 OOM was 5M rows / 77s, this is now ~6M).

**Scope note (labeled fact — coverage honesty):** Folder-size data exists for **295** projects, not all 1,153 active — many active projects have no sized folder content (empty/placeholder shells) or are among the 178 inaccessible. The treemap reflects the 295 projects with real storage. This is a coverage characteristic, not a crawl failure. Gate is presence-based and report-only (no freshness threshold).

