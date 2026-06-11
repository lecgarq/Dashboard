# Quota-free activity ingestion via `accds/v0` (browser-session token) — Design

**Date:** 2026-06-11 (rev. 2 — architecture changed after validation)
**Branch:** `feat/access-analysis-redesign`
**Status:** Draft — awaiting owner review
**Author:** Claude (with Luis)

## 1. Problem & goal

Activity data is ingested today through the Autodesk **Data Connector** batch API, hard-capped at
**~25 extraction requests per UTC-day** (`lib/acc/dcQuota.ts`). Backfilling activity in the
mandatory **31-day windows** is a multi-day grind of waiting for the quota to reset, and many
requests return **0 rows** — wasting scarce quota.

Goal: **stop relying on the Data Connector quota; capture activity continuously.** Owner decision
(2026-06-11): build the full `accds/v0` browser-session crawler with **automatic token
re-capture**, running alongside DC.

## 2. Discovery & validation (empirical — 2026-06-11)

The ACC Project Admin **Activity Log** (`acc.autodesk.com/project-admin/activity/projects/{id}`)
is a thin client over an internal **ACC Data Service**:

```
GET https://developer.api.autodesk.com/accds/v0/projects/{projectId}/data
      ?template=activities&filter[created_at]=<startISO>..<endISO>&limit=N&offset=M
```

Verified on the live account (project `de161948-…84d9`):

- **No quota.** Plain `limit`/`offset` paging (`pagination.{total_results,has_next_page}`). One
  project, one month ≈ 6,400 activities, fully pageable.
- **Payload richer than the DC CSV:** `activity_id` (unique hash), `created_at`, `service_group`,
  `activity_verb` (incl. `view-entity`, `download-entity`, `upload-entity`, `issue-create`),
  `created_by` + `created_by_email` + `created_by_display_name` (user **pre-resolved**),
  `object_display_name`, folder names. Companion: `template=activity_verbs`.
- **~12-month rolling retention** (Jun 2025 = 19,159; Apr 2025 and older = 0). Same ceiling as DC;
  unbeatable (Autodesk purges at source). A single window wider than ~31 days returns HTTP 400.

### The access gate (decisive)

- The dashboard's **own** APS app (`boQ3IUTZ…`) is **refused**: `403 AUTH-001 "The client_id
  specified does not have access to the api product"`. `accds` is **first-party-only** — it is not
  a subscribable public APS product, so no third-party app can be provisioned for it. `data:search`
  scope is *not* the issue.
- The **only** token accepted is the ACC web app's first-party token (`KkJfpMZ2…`), obtainable
  only from an **authenticated browser session**.

### Automatic token re-capture (proven)

The ACC SPA mints fresh first-party tokens **from session cookies alone**:

```
GET https://login.acc.autodesk.com/api/v1/authentication/refresh?currentUrl=<url>
    (credentials: include)
→ 200 JSON { "accessToken": "eyJ…" }   client KkJfpMZ2…, scope incl. data:search, exp ~27 min
→ that token on accds/v0 → 200 (end-to-end verified)
```

**Implication:** steady-state crawling is **pure Node HTTP** — cookies → refresh endpoint → fresh
token → page accds. A real browser is needed **only** to (a) establish the session cookies once and
(b) re-login when the cookie family finally expires (MFA). This removes the per-hour browser
fragility.

### The dashboard's archive is already ahead of Autodesk

`AccActivity` spans **2025-01-15 → 2026-06-10 (1,075,874 rows)** while `accds` now returns **0**
before ~Jun 2025 — the DB already holds ~5 months Autodesk has purged. Continuous capture makes the
DB the permanent record. (Pre-Jan-2025 is gone for everyone.)

## 3. Decision

Build a **browser-session `accds/v0` activity crawler** that runs **alongside** the existing Data
Connector pipeline (DC stays as a verified fallback during a comparison window). The replace-vs-retire
call is made later, once parity is confirmed.

## 4. Architecture

Pure units with clear seams; steady-state crawling needs no live browser.

1. **`scripts/accds-login.cjs` (session bootstrap — uses Playwright)**
   - Opens a real (headed) Chromium to `acc.autodesk.com`; owner completes Autodesk login + MFA.
   - Persists the resulting **session cookies** (`storageState`) to a **gitignored, local-only**
     file (e.g. `scratch/acc-session.json`). These cookies are as sensitive as a password.
   - Re-run only when the session dies (the crawler signals this).

2. **`lib/acc/accdsToken.ts` (token provider — pure Node)**
   - `getFreshToken(cookies)` → calls `login.acc.autodesk.com/api/v1/authentication/refresh` with
     the persisted cookies; returns `{ accessToken, expSec }`.
   - Caches the token; auto-refreshes ~60s before expiry or on a 401 from accds.
   - On refresh-endpoint **401/redirect-to-login** → throws `SessionExpiredError` (signals that
     `accds-login.cjs` must be re-run). Must identify the minimal cookie set the endpoint needs.

3. **`lib/acc/accdsActivity.ts` (loader/pager — pure-ish)**
   - `fetchActivityWindow({ getToken, projectId, startISO, endISO, limit, offset })` → typed page.
   - `crawlProjectActivity({ getToken, projectId, fromISO, toISO, onPage })` → walks date windows
     (≤31 days) × `offset` pages until `has_next_page` is false; emits pages for streaming upsert.
   - Error handling: 401 → refresh token + retry; 403 AUTH-001 → fatal (session/cookie problem);
     429/5xx → backoff. Concurrency cap (mirror `pLimit(5)` from folder crawl).

4. **`lib/acc/accdsActivityMap.ts` (pure normalizer)**
   - Maps an `accds` row → `AccActivity`. Wins over the CSV path: `service` ← `service_group`
     (DC left it null on 636k rows), user resolved from `created_by_email`, bonus
     `object_display_name`/folder names into `details`.
   - **Dedup (critical — runs alongside DC):** add a nullable, unique `accdsActivityId` column to
     `AccActivity`, populated from `activity_id`; dedup `accds` rows on it. Avoids double-counting
     and identity-format mismatch with DC's `autodesk_id`. (Recommended over reusing the existing
     composite unique key.)

5. **`scripts/accds-activity-ingest.cjs` (runner)**
   - For each project where the user is **Project Admin**, crawl the trailing ~12-month window;
     upsert pages; then a short trailing-window refresh for freshness. No quota → one continuous
     sweep. Resumable via per-project/per-window progress rows (mirror the DC progress pattern).
   - Token via `accdsToken`; on `SessionExpiredError`, stop cleanly and alert for re-login.

### Data flow

```
accds-login.cjs (browser, one-time) ──► scratch/acc-session.json (cookies)
   │
runner ──► accdsToken.getFreshToken(cookies) ──► fresh web-app bearer (auto-refresh)
   └─► for each admin project:
         crawlProjectActivity (windows × offset pages, no quota)
           └─► accdsActivityMap ──► upsert AccActivity (dedup on accdsActivityId)
```

## 5. Coverage & limits (honesty)

- **~12-month retention** — only the trailing ~12 months are fetchable live; older months already
  in `AccActivity` are retained untouched. The DB is the permanent archive going forward.
- **Project-Admin scope** — `accds` honors the same per-project admin boundary as the UI; it does
  **not** unlock the 724 projects you're locked out of (still an Account-Admin grant). It removes
  the *quota* for the ~428 you can access, and adds the view/download verbs all within retention.
- **Gap repair** — any gap inside the trailing 12 months can be backfilled at no quota cost.

## 6. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| **ToS gray area** — automating the web app's internal token/session risks the one ACC account (suspension would break the whole dashboard). | Read-only; reasonable/throttled request rate; human-initiated re-login; keep DC alive as fallback; document the risk explicitly for the owner. **This is the headline risk of the chosen path.** |
| Session cookies expire (re-login + MFA needed) | `SessionExpiredError` → re-run `accds-login.cjs`. Measure real cookie lifetime; expect periodic manual re-login. |
| Cookie file is password-equivalent | Gitignored, local-only, never logged; restrict file perms. |
| Refresh endpoint needs cookies/headers we don't replay from Node | Capture the full cookie set in bootstrap; identify the minimal required cookie(s); fall back to driving the live browser page context for the refresh call if a pure-Node replay is rejected. |
| Double-counting vs DC | Dedup on `accdsActivityId` (new unique column). |
| `accds`/refresh endpoints are internal & may change without notice | Runs alongside DC (not a sole dependency); parity tests detect drift. |
| Rate-limit / 429 under a full sweep | Backoff + concurrency cap; it is req/min, not a daily quota. |

## 7. Testing / verification

- **Unit:** pager pagination/window-split math, 400/401/429 handling; token provider cache +
  expiry-refresh + `SessionExpiredError`; normalizer field mapping + dedup-key generation
  (table-driven against captured real rows).
- **Parity:** for a sample project + month, compare `accds` counts and per-verb breakdown against
  DC-ingested rows for the same window; explain deltas. Gate for eventually retiring DC.
- **Dedup/idempotency:** re-running the crawler, and crawling a window DC already ingested, must not
  increase `AccActivity` counts.
- **E2E smoke:** existing access-analysis activity panels render unchanged on the enlarged data.

## 8. Out of scope

- Recovering activity older than ~12 months (deleted at source — impossible).
- Unlocking the 724 non-admin projects (separate Account-Admin grant).
- Provisioning the dashboard's APS app for `accds` (confirmed first-party-only; not possible).
- Retiring the Data Connector pipeline (deferred; this runs alongside it).
