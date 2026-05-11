# Railway Cron Setup — Deep Sync (Submitter + Ingest)

This document walks through configuring the two cron services on Railway. Each cron runs as its own Railway service, pointing at its own `railway.*.toml` config file in this repo.

| Cron | Script | Schedule | Config file |
| --- | --- | --- | --- |
| Submitter (nightly) | `scripts/deep-sync.cjs` | `0 9 * * *` (09:00 UTC = 02:00 Hermosillo) | `railway.submitter.toml` |
| Ingest (every 30 min) | `scripts/deep-sync-ingest.cjs` | `*/30 * * * *` | `railway.cron.toml` |

The main dashboard service uses `railway.toml` (no change needed for cron setup).

Quick Sync runs on every release via `releaseCommand` in `railway.toml` and needs no separate service.

---

## What each cron does

**Submitter** (`deep-sync.cjs`, nightly)
- Checks if a previous Deep Sync is still in flight; safely skips if yes.
- Asks Autodesk to prepare a fresh 7-day activity export.
- Records the request in `AccDataConnectorJob` with `status = "pending"`.
- On failure: alert email to `luis.ecorteg@gmail.com`.

**Ingest** (`deep-sync-ingest.cjs`, every 30 min)
- Polls `AccDataConnectorJob` rows that are `pending` or `running`.
- When Autodesk reports a job complete, downloads the signed-S3 ZIP, streams the CSVs, and writes rows into `AccActivity`.
- Resolves WHO-added-WHOM via `AccProjectMember` join; unresolved inviters land in `UnresolvedAttribution`.

---

## Configuration steps (one-time, per cron service)

For **each** cron (submitter and ingest), repeat these steps:

1. Open the **Railway dashboard** in your browser and sign in.
2. Select the **BIM Dashboard** project.
3. Click **"+ New"** → **"GitHub Repo"** → choose this same repo.
4. After the service is created, open its **Settings** tab.
5. Under **Service → Config-as-code**, set the **Config Path** to:
   - For the submitter: `railway.submitter.toml`
   - For the ingest: `railway.cron.toml`
6. Under **Variables**, make sure these env vars match the main dashboard service (Railway lets you reference shared variables):
   - `DATABASE_URL`
   - `APS_CLIENT_ID`, `APS_CLIENT_SECRET`
   - `RESEND_API_KEY`
   - (any other vars the scripts read)
7. Click **Deploy**.

The `cronSchedule` and `startCommand` are baked into the toml files, so you do **not** need to set them in the dashboard separately.

> Important: the submitter service must be named something like `submitter-cron` and the ingest service `keen-kindness` (current production name) so logs are easy to find.

---

## What to expect after the first run

**Submitter** — first run appears in the Railway deploy logs at the next 09:00 UTC. Look for:
```
[deep-sync] Job submitted: req_…
```
Then `AccDataConnectorJob` gains a row with `status = "pending"`.

> Autodesk's side typically takes **1 to 6 hours** to prepare the data. The ingest cron will pick it up on its next 30-minute tick once the job flips to `complete`.

**Ingest** — runs every 30 minutes. On a tick with no in-flight jobs, it exits quickly with `[deep-sync-ingest] no candidates`. On a tick that finds a completed job, it downloads the ZIP, streams the CSVs, and inserts rows.

---

## How to verify both crons are healthy

- **Last submitter run:** `SyncMeta` row `id = "deep"` should have `lastStatus = "success"` and a recent `lastRunAt`.
- **Recent submissions:** `AccDataConnectorJob` should have a new row each night around 09:00 UTC.
- **Last ingest run:** check the ingest service's Railway logs for recent activity; on a successful pickup, look for `[deep-sync-ingest] rows inserted: <n>`.
- **Skipped submitter runs:** if a previous Deep Sync is still pending or running, the next 09:00 UTC fires safely skips. `SyncMeta.lastStatus = "skipped"` with note `previous still in-flight`. **Not** a failure.

---

## Troubleshooting

If you don't see a new `AccDataConnectorJob` row the morning after configuring the submitter:

1. **Check `SyncMeta` (id = "deep") for `lastStatus = "failed"`** — the `lastError` field tells you what went wrong.
2. **Check your email** — `luis.ecorteg@gmail.com` should have received an alert email.
3. **Check the Railway logs** for the submitter cron — look for lines starting with `[deep-sync]`.
4. If the failure mentions `APS_HUB_ID`, the `Project.apsHubId` row in the database might be missing.
5. If the failure mentions `Autodesk APS credentials`, verify `APS_CLIENT_ID` and `APS_CLIENT_SECRET` are set on the cron service.
6. **If the failure mentions HTTP 403 "clientId is not authorized"**: see `docs/APS_DATA_CONNECTOR_REQUEST.md` — the prod APS app needs Data Connector API enablement.

If you see submitter rows in `AccDataConnectorJob` but `AccActivity` stays empty:

1. Wait at least 6 hours — Autodesk takes time to prepare the export.
2. Check the ingest cron service's logs for `[deep-sync-ingest]` lines.
3. Verify the job row's `status` field — it should move `pending` → `running` → `complete` over time.

---

## Reverting / pausing

To pause either cron, open its service in Railway and **disable deploys** or **delete the service**. The toml files stay in the repo so you can re-add the service later by repeating the steps above.

There is **no auto-retry** on failure — by design, a failed run waits for the next scheduled tick.
