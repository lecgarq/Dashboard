---
phase: 08-activity-re-extraction
plan: 03
status: complete
completed: 2026-06-22
requirements: [DATA-04]
---

# 08-03 Summary — 2-legged APS folder crawl (FOLD-04 enabler)

## Outcome

**FOLD-04 gate PASSES.** `AccFolder.totalSizeBytes` is populated for **111,308 folders across 295 projects (~3.49 TB)** via the 2-legged APS app-credential crawl — no ACC session, no DC quota, no APS refresh-token rotation. The Phase 13 storage treemap now has real data.

## What was done

1. **Task 1 (pre-flight, auto):** Confirmed `APS_CLIENT_ID`/`APS_CLIENT_SECRET` present (existence only, values never read). `AccProject` active = 1,153 (folder-crawl source).
2. **Task 2 (crawl, owner):** `node scripts/folder-crawl-cron.cjs`. Completion confirmed from DB: `folderCrawlStatus` ok = 975, inaccessible = 178 (all 1,153 processed, no systemic auth failure).
3. **Task 3 (gate, auto):** OOM-safe scalar queries only. `AccFolder` non-null `totalSizeBytes` = 111,308; total folders = 415,908; `AccFolderPermission` = 6,040,610 (scalar count).

## Key facts (labeled)

- Sized folders: 111,308 / 415,908 total; ~3.49 TB.
- Projects with folder-size data: **295** (of 975 ok-crawled / 1,153 active) — many active projects are empty shells; 178 are app-inaccessible. Scope characteristic, not a gap.
- Gate is presence-based and report-only (no freshness threshold), per CONTEXT.

## Key files

- Created: `.planning/phases/08-activity-re-extraction/08-FOLDER-VERIFICATION.md` (Pre-flight + Crawl run + FOLDER GATE).
- No source code changed. No new packages. `npx tsc --noEmit` unaffected.

## Security

- APS credentials checked for presence only (never printed). `.env` not staged. `AccFolderPermission` (6M rows) queried via scalar aggregate only — OOM guard honored (T-08-07).
