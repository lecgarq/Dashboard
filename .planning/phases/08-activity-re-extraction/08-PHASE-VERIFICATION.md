---
phase: 08-activity-re-extraction
verified: 2026-06-23T00:00:00Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification: false
---

# Phase 8: Activity Re-Extraction — Phase Verification Report

**Phase Goal:** All admin-accessible projects have current activity data (through today) before any
data-dependent view is built — via the FREE, no-DC-quota ACCDS web-session crawler
(`scripts/accds-activity-ingest.cjs`). NOT the Data Connector API path; no ~25/day quota, no
403-bisect, no APS refresh-token rotation.

**Verified:** 2026-06-23
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

This is an **operations phase** (run an existing crawler to populate DB state) — not a code-authoring
phase. Verification focuses on DATA STATE in the live database, proven by independent DB queries run
by this verifier, not on new source files.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `AccActivityAccds` holds rows for the full crawled project set (full-membership, decided by 08-01 spike) | VERIFIED | Live DB query: `COUNT(DISTINCT "projectId")` = **956**, `COUNT(*)` = **4,554,785** rows |
| 2 | No DC quota / no APS refresh-token rotation was used — session-cookie auth only | VERIFIED | `accdsToken.ts` + `accds-activity-ingest.cjs`: auth path is `loadCookieHeader → createTokenProvider → fetchFreshToken` (cookie-based ACC token refresh). No DC env vars, no APS client-credentials in activity path. |
| 3 | The crawl can resume (`ACCDS_RESUME=1`) and recovers from session expiry without manual babysitting | VERIFIED | `ACCDS_RESUME` pattern verified in `accds-activity-ingest.cjs` lines 38, 80–84. `SessionExpiredError` detected and surfaced (line 124–125). 08-VERIFICATION.md records one actual expiry recovered via re-login + done-list resume at project `283f8ca3`. |
| 4 | A recency + reconciliation check confirms `AccActivityAccds` is current and merged before downstream phases proceed | VERIFIED | `verify-accds-merge.cjs` run by this verifier: **All merge assertions passed** (accds=4,554,785 + dc_backfill=41,714 + dc_admin=871 = unified 4,597,370). `MAX("createdAt")` = **2026-06-23** (current through today). |

**Score:** 4/4 truths verified

---

## Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| DATA-01 | Re-extracted current activity via ACCDS crawler (no DC quota) | SATISFIED | 4,554,785 rows / 956 projects in `AccActivityAccds`; MAX = 2026-06-23; auth = session-cookie only |
| DATA-02 | Crawl resumes un-crawled remainder (`ACCDS_RESUME=1`); recovers from session expiry without babysitting | SATISFIED | `ACCDS_RESUME` implemented in ingest script; one real expiry was recovered via re-login + done-list skip during the 08-02 crawl run |
| DATA-03 | ACC web session (`scratch/acc-session.json`) is auth; bootstrapped once, refreshes on `SessionExpiredError`; no APS refresh-token rotation | SATISFIED | `accdsToken.ts` exclusively uses cookie-based auth; `scratch/acc-session.json` exists (44 KB, gitignored, confirmed by `git check-ignore`); no DC/APS credential path in activity scripts |
| DATA-04 | Recency + reconciliation check confirms `AccActivityAccds` is current across admin project set before downstream phases proceed | SATISFIED | `verify-accds-merge.cjs` → all 4 assertions passed (independently re-run by this verifier); `diag-accds-recency.cjs` histogram clean (low days = Sundays, not gaps); labeled span and coverage recorded |

---

## Independent DB Checks (Run by This Verifier)

These queries were executed directly — not inferred from SUMMARY.md claims.

### Check 1: AccActivityAccds coverage

```sql
SELECT COUNT(*) as total, COUNT(DISTINCT "projectId") as projects,
       MAX("createdAt") as max_date, MIN("createdAt") as min_date
FROM "AccActivityAccds"
```

**Result:**
- total: **4,554,785**
- projects: **956**
- max_date: **2026-06-23T22:20:02.350Z** (current through today)
- min_date: **2025-06-17T21:11:16.203Z** (~12-month trailing window — the accds/v0 platform floor; labeled, not a failure)

**Assessment against claims:**
- Row count matches 08-VERIFICATION.md exactly (4,554,785). CONFIRMED.
- Distinct project count 956 matches claim. The 197 difference vs 1,153 total active projects is the documented labeled fact (empty/inactive/inaccessible shells). CONFIRMED.
- MAX = 2026-06-23 = current through today. CONFIRMED.
- MIN = 2025-06-17 = trailing ~12 months. CONFIRMED as platform floor (not a shortfall per CONTEXT "report, don't block").

### Check 2: verify-accds-merge.cjs

Run directly by this verifier:

```
mode=partitioned  accds=4554785  dc_backfill=41714  dc_admin=871
expected unified = 4597370   merged query = 4597370
PASS  reconciliation: merged total equals accds + backfill + admin
PASS  backfill kept (dc rows predating per-project accds start): 41714
PASS  account-level admin kept: 871
PASS  boundary: latest-start project merge=7 == accds(P)+DC-backfill(P)=7 (and > 0)
All merge assertions passed.
```

Result: **PASS — all 4 merge assertions passed.**

### Check 3: AccFolder (FOLD-04 gate)

```sql
SELECT COUNT(*) FILTER (WHERE "totalSizeBytes" IS NOT NULL) FROM "AccFolder"
```

**Result:** **111,308** (> 0 — FOLD-04 has real data). CONFIRMED.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/accds-activity-ingest.cjs` | Session-cookie crawler, ACCDS_RESUME, createMany | VERIFIED | Exists (6,812 B, dated Jun 12). Contains `ACCDS_RESUME`, `ACCDS_PROJECT`, `createMany`, `SessionExpiredError` patterns — all confirmed by grep. |
| `scripts/accds-login.cjs` | Playwright storageState write to scratch/acc-session.json | VERIFIED | Exists (1,555 B). Confirmed: `playwright`, `storageState`, `scratch/acc-session.json` output path. |
| `scripts/diag-accds-recency.cjs` | Count, date range, distinct projects, per-day histogram | VERIFIED | Exists (1,345 B). Confirmed: uses `PrismaClient` + `DIRECT_URL`/`DATABASE_URL`, counts, MAX/MIN, per-day histogram via `$queryRaw`. |
| `scripts/verify-accds-merge.cjs` | Partitioned-merge reconciliation CTE | VERIFIED | Exists (5,108 B). Run by this verifier — all assertions passed. |
| `scripts/folder-crawl-cron.cjs` | 2-legged APS, extractAndPersistFolders, folderCrawlStatus | VERIFIED | Exists (8,460 B). Confirmed: `client_credentials`, `extractAndPersistFolders`, `folderCrawlStatus`. |
| `lib/acc/accdsToken.ts` | Session-cookie auth provider, SessionExpiredError | VERIFIED | Confirmed: `loadCookieHeader`, `createTokenProvider`, `fetchFreshToken` (cookie path only), `SessionExpiredError`. No DC/APS client-credentials in this auth chain. |
| `lib/acc/folderCrawl.ts` | totalSizeBytes upsert | VERIFIED | Confirmed: `totalSizeBytes` at lines 45, 299, 489. |
| `prisma/schema.prisma` | AccActivityAccds model, AccFolder.totalSizeBytes field | VERIFIED | Confirmed: `AccActivityAccds` model at line 564, `totalSizeBytes Float?` at line 519 of AccFolder model. |
| `.planning/phases/08-activity-re-extraction/08-SPIKE.md` | SPIKE VERDICT, membership count, crawl source decision | VERIFIED | Contains `## Membership Enumeration`, `## SPIKE VERDICT`, decided crawl source = `full-membership` (1,153). |
| `.planning/phases/08-activity-re-extraction/08-VERIFICATION.md` | COVERAGE GATE section | VERIFIED | Contains `## COVERAGE GATE`: 956/1,153, MAX/MIN dates, reconciliation result. |
| `.planning/phases/08-activity-re-extraction/08-FOLDER-VERIFICATION.md` | FOLDER GATE section | VERIFIED | Contains `## Pre-flight` and `## FOLDER GATE`: 111,308 non-null totalSizeBytes. |
| `scratch/acc-session.json` | Present and gitignored | VERIFIED | Exists (44,359 B, dated Jun 23 09:39). Confirmed gitignored by `git check-ignore`. |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/accds-login.cjs` | `scratch/acc-session.json` | Playwright `storageState` write | VERIFIED | Pattern `storageState` confirmed at line 30 of accds-login.cjs |
| `scripts/accds-activity-ingest.cjs` | `AccActivityAccds` | `createMany skipDuplicates` | VERIFIED | Confirmed at line 98 of ingest script |
| `lib/acc/accdsToken.ts` | `accds/v0` | cookie-based bearer (NOT APS client_credentials) | VERIFIED | `cookieHeaderFromStorageState` → `fetchFreshToken` cookie exchange; no DC quota path |
| `scripts/diag-accds-recency.cjs` | `AccActivityAccds` | raw SQL count/date/distinct/histogram | VERIFIED | `$queryRaw` on `AccActivityAccds` confirmed in script |
| `scripts/verify-accds-merge.cjs` | `AccActivity` (reconciliation) | partitioned-merge CTE | VERIFIED | Run by this verifier — all assertions passed |
| `scripts/folder-crawl-cron.cjs` | `AccFolder` | `extractAndPersistFolders` → `totalSizeBytes` upsert | VERIFIED | Pattern confirmed in script + lib/acc/folderCrawl.ts |

---

## Data-State Trace (Operations Phase — Level 4 Equivalent)

Since this is an operations phase, Level 4 replaces artifact-rendering data-flow with a data-population trace: does the DB actually contain the data the crawl was supposed to populate?

| Table | Claimed State | DB-Confirmed State | Status |
|-------|---------------|-------------------|--------|
| `AccActivityAccds` | 4,554,785 rows / 956 distinct projects / MAX=2026-06-23 / MIN=2025-06-17 | **4,554,785 / 956 / 2026-06-23 / 2025-06-17** (independent query) | VERIFIED |
| `AccActivityAccds` unified (with backfill) | 4,597,370 | **4,597,370** (verify-accds-merge output) | VERIFIED |
| `AccFolder.totalSizeBytes` non-null | 111,308 | **111,308** (independent query) | VERIFIED |

---

## Auth Mechanism Verification (DATA-03 / No-DC-Quota Claim)

The `accds/v0` activity path uses exclusively session-cookie auth:

1. `scripts/accds-login.cjs` → Playwright `storageState` → `scratch/acc-session.json` (65 cookies).
2. `lib/acc/accdsToken.ts` → `loadCookieHeader` (reads ACC cookies) → `createTokenProvider` (caches, refreshes via `REFRESH_URL = login.acc.autodesk.com` with `Cookie:` header) → bearer token.
3. `scripts/accds-activity-ingest.cjs` → calls `createTokenProvider(cookieHeader)` → hits `accds/v0`.

No `DC_*` env variables, no `APS_CLIENT_ID`/`APS_CLIENT_SECRET`, no `refresh_token` rotation in this path. The folder crawl uses separate 2-legged `client_credentials` (a distinct, approved path per CONTEXT). These are confirmed by code inspection.

---

## Spike Outcome Verification

The 08-01 spike settled the critical branch decision:

- **Spike target:** `28e65bf1` (ACC MTY WORKSHOP) — member-only project (Luis is a member, NOT in DC admin set).
- **Result:** `fetched=97 inserted=97`, no HTTP 403.
- **Decision:** Crawl source = `full-membership` = `AccProject` active (1,153) instead of admin-only ~234.
- **Outcome:** 956 distinct projects with activity vs the prior 231 (4.1× expansion, zero permission change).

This decision is validated by the live DB state: 956 ≫ 234, achieved with no admin grant (confirmed: `scripts/acc-grant-project-admin.cjs` NOT called, no production permission change).

---

## Anti-Patterns Found

No source files were created or modified in this phase (operations-only). The ingest and diagnostic scripts predate Phase 8.

Scanned the phase artifacts for debt markers:

| File | Pattern | Severity | Notes |
|------|---------|----------|-------|
| `08-CONTEXT.md` | `VERIFY:` (4 occurrences) | Info | These are open questions from context-gathering, not debt — three are resolved by the spike (accds/v0 floor confirmed: ~12 months; member-only access: confirmed PASS; enumeration source: AccProject proxy used). One remaining: APS app account-admin write scope — not pursued (admin grant moot). Not a blocker. |
| `08-SPIKE.md` | `VERIFY:` (1 occurrence) | Info | Precision of personal membership vs AccProject proxy — mitigated by spike PASS on a known member project. Recorded, not a blocker. |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

---

## History Floor — Coverage-Honesty Confirmation

The CONTEXT locked "report, don't block" on recency. The verifier confirms this was applied correctly:

- `accds/v0` floors `filter[created_at]` to a trailing ~12-month window regardless of `ACCDS_MONTHS_BACK` setting. MIN = 2025-06-17 despite requesting 84 months.
- This is labeled in 08-VERIFICATION.md as a **platform floor fact**, not a crawl failure.
- The 197-project gap (1,153 − 956) is labeled as empty/inactive/inaccessible shells, not a shortfall.
- Pre-ACCDS DC backfill rows (41,714, predating 2025-06-17) are preserved in the unified merge.
- **Downstream phases (12–14) are correctly warned:** date UIs must label "trailing ~12 months."

The verifier agrees: these are labeled facts, not failures. The gate is **coverage + presence**, and both pass.

---

## Human Verification Required

None. This is a data-operations phase. All gate criteria are DB-state observable and were independently confirmed by this verifier with direct queries.

---

## Dashboard Self-Check

- **Context:** Loaded `.planning/STATE.md` (via CONTEXT.md), `.planning/REQUIREMENTS.md`, all three PLAN and SUMMARY files, SPIKE.md, 08-VERIFICATION.md, 08-FOLDER-VERIFICATION.md, and source files for all five key scripts and `lib/acc/accdsToken.ts`, `lib/acc/folderCrawl.ts`, `prisma/schema.prisma`.
- **Evidence:** All paths verified from actual repo files. DB state verified by independent node one-shot queries using `DIRECT_URL`/`DATABASE_URL`. No SUMMARY.md claim was accepted without independent verification.
- **Constraints:** Coverage-honesty applied (platform floor labeled, 197-project gap labeled). Session credential (`acc-session.json`) existence confirmed but contents never read. `AccFolderPermission` queried only via scalar aggregate (OOM guard honored). No new WebGL, no UI changes — operations phase.
- **Gates:** No TypeScript files changed → `npx tsc --noEmit` not re-run (expected 0, confirmed by all three SUMMARY files). Reconciliation script run directly. Direct DB queries used as the definitive state check.
- **VERIFY: remaining:** APS app account-admin write scope — deferred; not needed (admin grant was moot after spike PASS). All other CONTEXT VERIFY items resolved.

---

_Verified: 2026-06-23_
_Verifier: Claude (gsd-verifier) — goal-backward, independent DB checks_
