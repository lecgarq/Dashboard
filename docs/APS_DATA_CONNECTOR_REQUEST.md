# APS Data Connector Enablement — Request Templates

The production APS app (`client_id` starting `boQ3IUTZHC5…`) is **not authorized** to call the ACC Data Connector API. As of 2026-05-11, every call to `POST /data-connector/v1/requests` and `GET /data-connector/v1/jobs` returns:

```
HTTP 403
{"detail": "This clientId is not authorized to perform the operation"}
```

This blocks Phase 3 UAT — code is shipped and the dry-run exits 0, but no real activity data can flow until Autodesk grants Data Connector access to the prod app and the hub admin provisions it.

There are **two** independent steps. Both must be done.

---

## Step 1 — Enable Data Connector API on the APS app

**Where:** `https://aps.autodesk.com/myapps`

1. Sign in as the owner of the prod APS app.
2. Open the app whose `client_id` starts with `boQ3IUTZHC5…`.
3. Scroll to the **APIs** section.
4. If **"ACC Data Connector API"** appears in the list: check the box, click **Save**.
5. If it does **not** appear, file the support request below.

### Support request — if Data Connector is not in the API list

Send to Autodesk APS support (`aps.help@autodesk.com` or via `https://aps.autodesk.com/support`):

> **Subject:** Request Data Connector API access for production APS app
>
> Hello,
>
> I'm trying to enable the **ACC Data Connector API** on our production APS app but it does not appear in the API list at `https://aps.autodesk.com/myapps`. Could you enable it for the following app?
>
> - **App name:** BIM Dashboard (LECG)
> - **Client ID:** `boQ3IUTZHC5…` _(replace with the full value before sending)_
> - **Account / Hub ID:** `b.63aeb891-e88c-4c25-840a-7cd5b27b392b`
> - **Use case:** Nightly Data Connector job submission (`PAST_7_DAYS`, services `activities` + `admin`) for an internal BIM analytics dashboard. We need both `activities` and `admin` extract types.
>
> Current evidence of the missing entitlement (logs from `2026-05-11`):
>
> ```
> POST https://developer.api.autodesk.com/data-connector/v1/requests
> → HTTP 403
> {"detail": "This clientId is not authorized to perform the operation"}
> ```
>
> The 2-legged OAuth token grant itself succeeds (scopes: `account:read data:read data:create`), so this looks like an app-level entitlement gap rather than a credential issue.
>
> Thanks,
> Luis Cortes
> luis.ecorteg@gmail.com

---

## Step 2 — Provision the app on the ACC hub

**Where:** `https://acc.autodesk.com/account-admin` → **Custom Integrations**

1. Sign in as an **Account Admin** of the ACC hub (`b.63aeb891-e88c-4c25-840a-7cd5b27b392b`).
2. Navigate to **Account Admin → Custom Integrations** (sometimes labelled **Apps**).
3. Click **Add Custom Integration**.
4. Paste the prod **Client ID** (`boQ3IUTZHC5…`).
5. Grant the integration **Account Admin** access (Data Connector requires it).
6. Click **Provision**.

If you do not see **Custom Integrations** in Account Admin, your role is probably not Account Admin — find the person at LECG who is, or grant yourself the role first.

---

## How to verify both steps worked

Once **both** Step 1 and Step 2 are done, run the dry-run locally:

```bash
node scripts/deep-sync.cjs --dry-run
```

A successful submission prints something like:

```
[deep-sync] Job submitted: req_<uuid>
```

and `AccDataConnectorJob` gains a `pending` row. If you still see the HTTP 403, Step 1 (entitlement) is incomplete — the hub provisioning in Step 2 alone is not sufficient.

---

## What this unblocks

Once the submitter succeeds:

1. Wait 1–6 hours for Autodesk to prepare the export.
2. The ingest cron (every 30 min) picks up the completed job and writes rows into `AccActivity`.
3. The five Phase 3 UAT items listed in `.planning/phases/03-activity-pipeline/03-VERIFICATION.md` become visible in the dashboard UI.

---

_References_
- `scripts/deep-sync.cjs` — the submitter
- `scripts/deep-sync-ingest.cjs` — the ingest poller
- `docs/CRON_SETUP.md` — Railway cron wiring
- `.planning/phases/03-activity-pipeline/03-VERIFICATION.md` — code-level verification + frozen UAT criteria
