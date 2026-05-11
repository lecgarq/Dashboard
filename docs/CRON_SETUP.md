# Railway Cron Setup — Nightly Deep Sync

This document walks through configuring the **Deep Sync** cron job on Railway. Deep Sync runs every night, submits a Data Connector job to Autodesk, and stores the request so the next phase can download the results.

Quick Sync is already wired automatically via `railway.toml` (`releaseCommand`) and needs no separate configuration.

---

## What this cron job does

- Runs `node scripts/deep-sync.cjs` once per day.
- Checks whether a previous Deep Sync job is still in flight; if yes, skips this run safely.
- Otherwise, asks Autodesk to prepare a fresh 7-day activity export.
- Records the request in the database so we can download the data later (Phase 3).
- If anything fails, sends an alert email to `luis.ecorteg@gmail.com`.

---

## Configuration steps (one-time)

1. Open the **Railway dashboard** in your browser and sign in.
2. Select the **BIM Dashboard** project.
3. Click into the deployed **service** (the one currently serving the dashboard).
4. Open the **Settings** tab.
5. Scroll to the **Cron Schedule** section. Click **"Add Cron Job"** (or **"Edit"** if one already exists).
6. Fill in the fields:
   - **Command:** `node scripts/deep-sync.cjs`
   - **Schedule:** `0 9 * * *`

   The schedule `0 9 * * *` means: **every day at 09:00 UTC**, which is **02:00 in Hermosillo** (UTC-7 year-round — Hermosillo does **not** observe daylight saving, so this stays constant).
7. Click **Save**.

> Screenshot placeholder: take a screenshot of the saved cron entry once configured, and drop it next to this file as `docs/cron-setup-screenshot.png` for future reference.

---

## What to expect after the first run

The first run will appear in the Railway deploy logs at the next 09:00 UTC. To check that it worked:

1. Open the Railway **Deployments** or **Logs** tab around 09:00–09:05 UTC.
2. Look for a log line like:
   ```
   [deep-sync] Job submitted: req_…
   ```
3. The script then writes a row to the database table `AccDataConnectorJob` with `status = "pending"`.

> Autodesk's side typically takes **1 to 6 hours** to actually prepare the data after submission. Phase 3 will handle the download step — at this point we are only **submitting the request** and storing the request ID.

---

## How to verify it's healthy

- **Last successful run:** open the database (e.g. via Prisma Studio or Supabase) and look at the `SyncMeta` table. The row with `id = "deep"` should have `lastStatus = "success"` and a recent `lastRunAt` timestamp.
- **Recent submissions:** the `AccDataConnectorJob` table should have a new row each night, with `startedAt` near 09:00 UTC.
- **Skipped runs:** if a previous Deep Sync job is still pending or running when the next 09:00 UTC fires, the new run will safely **skip** (this is intentional). You'll see `lastStatus = "skipped"` in `SyncMeta`, with a note `previous still in-flight`. This is **not** a failure.

---

## Troubleshooting

If you don't see a new `AccDataConnectorJob` row the morning after configuring the cron:

1. **Check `SyncMeta` (id = "deep") for `lastStatus = "failed"`** — the `lastError` field tells you what went wrong.
2. **Check your email** — `luis.ecorteg@gmail.com` should have received an alert email with the failure details and a job ID (if one was captured before the failure).
3. **Check the Railway logs** for that cron run — look for any line starting with `[deep-sync]`.
4. If the failure mentions `APS_HUB_ID`, the `Project.apsHubId` row in the database might be missing or empty — verify it via Prisma Studio.
5. If the failure mentions `Autodesk APS credentials`, verify that `APS_CLIENT_ID` and `APS_CLIENT_SECRET` are set in Railway's environment variables.

---

## Reverting / pausing

If you ever need to **pause** the cron (e.g. during maintenance):

- In the Railway dashboard, go to the same **Settings → Cron Schedule** section and **disable** or **remove** the cron job.
- To re-enable, re-add the same command (`node scripts/deep-sync.cjs`) and schedule (`0 9 * * *`).

There is **no auto-retry** on failure — by design, a failed Deep Sync simply waits for the next nightly run.
