# Quota-free activity ingestion via `accds/v0` — Design

**Date:** 2026-06-11
**Branch:** `feat/access-analysis-redesign`
**Status:** Draft — awaiting owner review
**Author:** Claude (with Luis)

## 1. Problem & goal

Activity data is ingested today through the Autodesk **Data Connector** batch API, which is
hard-capped at **~25 extraction requests per UTC-day** (`lib/acc/dcQuota.ts`:
`DAILY_QUOTA_CAP = 25`, safe budget 20). Backfilling activity for ~428 admin-accessible
projects in the Data Connector's mandatory **31-day windows** means a multi-day grind of
waiting for the quota to reset at UTC midnight, and many requests return **0 rows** (windows
where a project had no activity) — wasting scarce quota.

The owner's goal: **stop relying on the Data Connector quota; capture activity continuously,
and get "all time" history.**

## 2. Discovery (empirical — 2026-06-11)

Reconnaissance of the live ACC web app (Project Admin → **Activity Log**,
`acc.autodesk.com/project-admin/activity/projects/{projectId}`) via Chrome DevTools network
capture found the internal API that feeds it:

```
GET https://developer.api.autodesk.com/accds/v0/projects/{projectId}/data
      ?template=activities
      &filter[created_at]=<startISO>..<endISO>
      &limit=<N>&offset=<M>
```

`accds` = "ACC Data Service". Verified behavior (project `de161948-…84d9`, "MTY AE-01"):

| Property | Finding |
| --- | --- |
| **Auth** | OAuth **bearer token** on `developer.api.autodesk.com` — same gateway/auth model the dashboard already uses (NOT browser cookies). |
| **Quota** | **None.** Plain `limit`/`offset` pagination. `pagination: {total_results, has_next_page, limit, offset}`. |
| **Payload** | Richer than the Data Connector CSV. Each row: `activity_id` (unique hash), `created_at`, `service_group` (docs/issues/sheets/admin/…), `activity_verb` (e.g. `view-entity`, `download-entity`, `upload-entity`, `issue-create`), `created_by` (user id), **`created_by_email`**, **`created_by_display_name`** (user already resolved — no `users.csv` join), `object_id`/`object_display_name` (e.g. "DJI_0821.JPG"), `docs_object_folder_id`/`docs_object_folder_display_name`, target + admin-change fields. |
| **Verb taxonomy** | Response includes `allowed_activity_verbs` per service group — the full action vocabulary, incl. the view/download verbs. |
| **History depth** | **~12-month rolling retention.** Same project: ~now = 6,417; Jun 2025 = 19,159; **Apr 2025 and earlier = 0**. Matches Autodesk's documented 12-month activity retention. |
| **Window width** | A single very wide range (2020→now) returns **HTTP 400** — there is a max window width (page in windows, like DC, but with no quota cost). |
| **Default (no date filter)** | Returns ~last 30 days, not all-time. |

Companion endpoint: `…/data?template=activity_verbs` (the filter dropdown's verb list).

### What this means

- **The quota problem is solvable.** `accds/v0` returns the full activity feed (including the
  ~45% view/download events) with no extraction quota — and it is *not* pixel-scraping; it is
  the same authenticated REST endpoint the UI calls.
- **"All time" past ~12 months is impossible by any method** — Autodesk deletes activity older
  than ~12 months at the source. No API, scrape, or browser can recover it.
- **But the dashboard's warehouse already IS the all-time archive.** `AccActivity` currently
  spans **2025-01-15 → 2026-06-10 (1,075,874 rows)**, while `accds` now returns **0** before
  ~Jun 2025. The dashboard already holds ~5 months of activity Autodesk has since purged.
  Continuous capture makes the DB the permanent record Autodesk itself does not keep.

## 3. Decision

Add an **`accds/v0` activity crawler as the primary activity source, running ALONGSIDE the
existing Data Connector pipeline** (owner decision 2026-06-11). The Data Connector path stays
in place as a verified fallback during a comparison window; the replace-vs-retire call is made
later, once `accds` coverage and counts are confirmed to match or exceed DC.

## 4. Validation gates (MUST pass before building the crawler)

These were left open by recon because the dashboard's stored token was expired (probing
deferred to avoid racing the daily cron on the single-use refresh token, per
`aps-refresh-token-rotation`). Run as **Task 1**, carefully:

1. **Client gating** — confirm `accds/v0` accepts the dashboard's own client_id
   (`boQ3IUTZ…`), which differs from the ACC web app's (`KkJfpMZ2…`). Some internal endpoints
   are first-party-only.
2. **Scope** — the dashboard's 3-leg token scope is
   `openid data:read data:create viewables:read user:read account:read` — it lacks **`data:search`**,
   which the working web-app token had and which an `accds` *data-search* service may require.
   If required: add `data:search` to `DC_SCOPES` (`lib/server/aps-oauth.ts`:22) and the APS app
   registration, which forces a one-time re-consent at next Autodesk login.

**Safe method:** arm the DC kill switch (or run in a known cron-idle window) so the daily cron
won't refresh concurrently; call `refreshUserToken()` (it persists refresh-token rotation
correctly — line 102) to mint a fresh token; hit `accds/v0` for one project; record status.
A 200 with `pagination.total_results` clears both gates. A 401/403 tells us which knob to turn.

If both gates fail and cannot be cleared with scope changes, fall back to the **browser-token
strategy** (drive an authenticated session and replay the call) — a documented contingency,
not the preferred path.

## 5. Architecture

Four units, each independently testable; the crawler reuses existing token + Prisma plumbing.

1. **`lib/acc/accdsActivity.ts` (pure-ish loader/pager)**
   - `fetchActivityWindow({ token, projectId, startISO, endISO, limit, offset })` → typed page
     (`{ results, pagination }`).
   - `crawlProjectActivity({ token, projectId, fromISO, toISO, onPage })` → walks date windows
     (width discovered empirically; start at 31 days to mirror the UI) and `offset` pages until
     `has_next_page` is false. Emits pages to a callback for streaming insert.
   - Handles 429/5xx with backoff (standard APS rate limiting applies; req/min, not daily quota).

2. **`lib/acc/accdsActivityMap.ts` (pure normalizer)**
   - Maps an `accds` row → `AccActivity` shape. Notable wins over the CSV path:
     `service` ← `service_group` (the DC CSV left `service` null on 636k rows), user resolved
     from `created_by_email`/`created_by_display_name`, optional bonus fields
     (`object_display_name`, folder names) into `details`.
   - **Identity/dedup is the critical concern** because we run alongside DC and must not
     double-count. Options, to be settled in the plan:
     (a) add a nullable `accdsActivityId` column to `AccActivity`, unique, populated from
         `activity_id`, and dedup `accds` rows on it; or
     (b) reuse the existing `@@unique([autodeskId, rawAction, createdAt, projectId])` by
         aligning `autodeskId` ← `created_by` to the exact id format DC stored.
     Option (a) is safer (the `accds` `activity_id` is a guaranteed-unique hash) and avoids
     identity-format mismatches between the two sources. Recommended.

3. **`scripts/accds-activity-ingest.cjs` (runner)**
   - Per project where the user is Project Admin: crawl the trailing retention window
     (~last 12 months), upsert pages. No quota → one continuous sweep across all accessible
     projects; then a short trailing-window refresh (e.g. last 2–3 days) for freshness.
   - Reuses `refreshUserToken()` for token lifecycle. Resumable via per-project/per-window
     progress rows (mirror the DC progress pattern).

4. **Coverage source** — the project list comes from the same admin-scoped enumeration DC uses
   (`construction/admin/v1/...` / existing project tables). `accds` honors the same access
   boundary as the Activity Log UI: **Project Admin per project**.

### Data flow

```
refreshUserToken ──► token
   └─► for each admin project:
         crawlProjectActivity (windows × offset pages, no quota)
           └─► accdsActivityMap ──► upsert AccActivity (dedup on accds activity_id)
```

## 6. Coverage & limits (honesty)

- **~12-month retention** — the crawler can only fetch the trailing ~12 months live. Older
  months already in `AccActivity` (from past DC backfills) are retained in the DB and untouched.
- **Project-Admin scope** — `accds` does **not** unlock the 724 projects you're locked out of
  (`dc-access-universe`). That is still an Account-Admin grant, unchanged by this work. `accds`
  removes the *quota* for the ~428 you can already access.
- **Gap repair** — any gap inside the trailing 12 months (e.g. the apparent Dec 2025 hole in
  the current archive) can now be backfilled at no quota cost.
- **Permanent archive** — continuous capture means the DB never loses another month going
  forward; it becomes the all-time record Autodesk does not keep.

## 7. Testing / verification

- **Unit:** pager pagination math, window splitting, 400/429 handling; normalizer field
  mapping + dedup-key generation (table-driven against captured real rows).
- **Parity:** for a sample project + month, compare `accds` row count and per-verb breakdown
  against the Data Connector-ingested rows for the same window; explain any delta (e.g. `accds`
  richer verbs). This is the gate for eventually retiring DC.
- **Dedup:** running the crawler twice, and running it over a window DC already ingested, must
  not increase `AccActivity` counts (idempotent upsert).
- **E2E smoke:** existing access-analysis activity panels render unchanged on the enlarged data.

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| `accds` rejects dashboard client / needs `data:search` | Validation gate Task 1; add scope or fall back to browser-token replay. |
| Double-counting vs DC (running alongside) | Dedup on `accds` `activity_id` (new unique column). |
| Identity-format mismatch (`created_by` vs DC `autodesk_id`) | Prefer `activity_id` dedup; map user via email as well. |
| `accds` rate-limit / 429 under a full continuous sweep | Backoff + concurrency cap (mirror `pLimit` from folder crawl); it is req/min, not daily. |
| Refresh-token rotation breaking login | Only use `refreshUserToken()` (persists rotation); never hand-roll a refresh; avoid concurrent cron runs during the probe. |
| `accds/v0` is internal/undocumented and may change | It is a fallback-alongside-DC, not a sole dependency; parity tests detect drift. |

## 9. Out of scope

- Recovering activity older than ~12 months (deleted at source — impossible).
- Unlocking the 724 non-admin projects (separate Account-Admin grant).
- Pixel/DOM scraping of the ACC UI (the REST endpoint supersedes it).
- Retiring the Data Connector pipeline (deferred; this runs alongside it).
