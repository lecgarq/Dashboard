# Slice D — Folder/File Attribute Ingestion

**Date:** 2026-05-29
**Branch:** `feat/access-analysis-redesign`
**Depends on:** Slices A/B/C (shipped). Spec for A/B/C: `2026-05-29-access-slider-sidebar-polish-design.md`.

## Problem

Of the 19 acc.xlsx folder attributes, ~12 are not in our DB. Slices A/B/C lit up 3 derived folder sliders (reach/controller/mixed) from data we already had; this slice collects the genuinely-missing ones — as far as Autodesk's public APIs allow.

## Feasibility (researched 2026-05-29, APS/ACC docs)

| Attribute | Source | Verdict |
|---|---|---|
| **Size** (`storageSize`), **Version** (`versionNumber`), **Last Updated** (`lastModifiedTime`), **Updated By** (`lastModifiedUserName`), **Version Added By** (`createUserName`), **Description** (`extension.data.description`) | Data Management folder-contents response `included[]` tip-versions | ✅ **FREE** — same call we already make, currently suppressed by `?filter[type]=folders` |
| **Inherit Permissions?** | BIM360/ACC folder-permissions response (already called) | ⚠️ likely — confirm field name on a live response |
| **Review Status** | ACC Reviews API (`/construction/reviews/v1`, 3-leg, per file version) | ⚠️ separate API, later increment |
| **Folder Issues** | ACC Issues API (`/construction/issues/v1`, project-scoped only) | ⚠️ project-level only; cannot attribute to a folder |
| **Revision (label)** | — (only `versionNumber` exists) | ❌ no public field |
| **Markups** | — | ❌ no public API |
| **Folder Indicators** | — (UI-only) | ❌ no public API |

Rate limits: these are DIRECT APS APIs (RPM + 429/Retry-After), NOT the Data Connector ~25/day cap. The free-6 add zero calls (same folder-contents call, just unfiltered → slightly larger responses).

## Scope of THIS slice (the achievable + highest-value): the FREE 6

Capture the file/version data the crawl already fetches, as **per-folder rollups**, and surface them as per-person sliders. Reviews/Issues/Inherit are follow-on increments; Markups/Indicators/Revision are out (no API).

### Design

**Data shape: folder-level rollups** (NOT a per-file table — 397K folders is bounded; a per-file table would explode to millions of rows for little slider value).

1. **Crawl (`folderCrawl.ts`):** drop `filter[type]=folders`; parse `included[]` tip-versions. Pure helper `parseFolderContents(json)` → `{ folders, rollup }` where rollup = `{ fileCount, totalSizeBytes, lastModifiedTime, lastModifiedBy, latestVersionAddedBy, maxVersionNumber }`. Same one-call-per-folder cost.
2. **Schema (`AccFolder`):** add nullable rollup columns `fileCount Int?`, `totalSizeBytes BigInt?`, `lastModifiedTime DateTime?`, `lastModifiedBy String?`, `latestVersionAddedBy String?`, `maxVersionNumber Int?`. Prisma migration.
3. **Persist (`extractAndPersistFolders`):** write rollups on AccFolder upsert.
4. **Assembly (`dcUserAssembly.ts`):** roll folder attrs up to per-(user,project), over the folders a person can reach (same role→folder join that already yields folderBreadth) → e.g. `accessibleDataBytes` (sum totalSizeBytes), `recentlyTouchedFolders` (count reachable folders modified < 30d).
5. **Snapshot (`featureSnapshot.ts` / `interactionTypes.ts` / `graphTables.ts` / `graphSql.ts`):** thread the new aggregates through.
6. **Catalog (`dimensionCatalog.folderLive.ts`):** new live dims (e.g. "Data they can access", "Recently-updated folders they touch"). Update the 6 placeholders' `note` from "not collected yet" → live once shipped.

### Reality check (set expectations)

The sliders only fill **after the folder crawl re-runs** over projects (operational: `scripts/folder-crawl-cron.cjs` / manual). This slice ships the *code*; the backfill is a crawl run. Crawl is additive + idempotent.

### Verification

Unit-test `parseFolderContents` against a realistic Data Management fixture (data[] folders+items, included[] versions). Migration applies cleanly. Assembly aggregation unit-tested. New dims tested. Full suite + tsc green. The live backfill is verified by spot-checking AccFolder rollup columns after a crawl run.

## Out of scope (later increments / impossible)

- Review Status (ACC Reviews API), Folder Issues (project-scoped), Inherit-flag (confirm field) — follow-on increments.
- Markups, Indicators, Revision-label — no public API; stay greyed as "not available from Autodesk".
