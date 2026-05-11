/**
 * Railway cron entry point — nightly Deep Sync job submission.
 *
 * Schedule: 0 9 * * * (09:00 UTC = 02:00 Hermosillo, UTC-7 year-round, no DST)
 * Configured via Railway dashboard — see docs/CRON_SETUP.md.
 *
 * Order of operations:
 *   1. SYNC-04 overlap guard: skip if any AccDataConnectorJob has status='pending' or 'running'
 *   2. Fetch 2-legged Autodesk token (scope: account:read data:read data:create)
 *   3. Resolve accountId from Project.apsHubId (inline `b.` strip — CJS dual-impl of getAccountId)
 *   4. POST APS Data Connector job (PAST_7_DAYS, ["activities","admin"])
 *   5. Persist AccDataConnectorJob row with status='pending', requestId
 *   6. Upsert SyncMeta('deep') with lastStatus='success' (submission succeeded;
 *      job lifecycle is tracked separately on AccDataConnectorJob)
 *   7. On any error: best-effort SyncMeta upsert (failed) + raw-fetch Resend alert; exit 1
 *
 * Pure CommonJS — cannot require TS modules.
 */

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const DATA_CONNECTOR_BASE = "https://developer.api.autodesk.com/data-connector/v1";
const OPERATOR_EMAIL = "luis.ecorteg@gmail.com";

function ts() {
  return new Date().toISOString();
}

function htmlEscape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendFailureAlertRaw(errorMessage, jobId) {
  const apiKey = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim();
  if (!apiKey) {
    console.warn(`[deep-sync] RESEND_API_KEY not set — skipping failure alert email.`);
    return;
  }
  const from = (process.env.RESEND_EMAIL && process.env.RESEND_EMAIL.trim()) || "onboarding@resend.dev";
  const label = "Deep Sync (nightly cron)";
  const timestamp = ts();
  const subject = `[BIM Dashboard] ${label} failed — ${timestamp}`;
  const jobLine = jobId ? `<p><strong>Job ID:</strong> ${htmlEscape(jobId)}</p>` : "";
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <h2>Sync Failure Alert</h2>
      <p><strong>Sync type:</strong> ${htmlEscape(label)}</p>
      <p><strong>Time:</strong> ${htmlEscape(timestamp)}</p>
      ${jobLine}
      <p><strong>Error:</strong></p>
      <pre style="background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;overflow:auto;">${htmlEscape(errorMessage)}</pre>
      <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
      <p style="color:#aaa;font-size:12px;">BIM Dashboard — Automated Sync Alerts</p>
    </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: OPERATOR_EMAIL, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[deep-sync] Resend alert HTTP ${res.status}: ${body}`);
    } else {
      console.log(`[deep-sync] Failure alert email sent.`);
    }
  } catch (err) {
    console.warn(`[deep-sync] Failed to send alert email (swallowed):`, err && err.message ? err.message : err);
  }
}

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url =
    (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) {
    throw new Error("DATABASE_URL or DIRECT_URL must be set");
  }
  const adapter = new PrismaPg({
    connectionString: url,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter, log: ["error"] });
}

async function fetchAutodeskToken() {
  const clientId = process.env.APS_CLIENT_ID && process.env.APS_CLIENT_ID.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET && process.env.APS_CLIENT_SECRET.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Autodesk APS credentials are not configured (APS_CLIENT_ID / APS_CLIENT_SECRET).");
  }
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "account:read data:read data:create",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const raw = await res.text();
  let json;
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) {
    throw new Error(`Failed to get Autodesk app token: HTTP ${res.status} ${json.error || raw}`);
  }
  return json.access_token;
}

/**
 * Inline `b.` strip — duplicate of getAccountId() in lib/server/acc-helpers.ts.
 * This CJS script cannot require the TS helper module; the duplication is intentional
 * and documented in 01-03-PLAN.md Task 3 Part A step 4. Plan 02's helper remains the
 * canonical version for TS callers.
 */
async function resolveAccountId(prisma) {
  const hub = await prisma.project.findFirst({ select: { apsHubId: true } });
  if (!hub || !hub.apsHubId) {
    throw new Error("APS_HUB_ID is not configured (no Project row with apsHubId).");
  }
  return String(hub.apsHubId).replace(/^b\./, "");
}

async function submitDataConnectorJob(accountId, accessToken) {
  const res = await fetch(`${DATA_CONNECTOR_BASE}/accounts/${accountId}/requests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Deep Sync — nightly activity export",
      isActive: true,
      scheduleInterval: "ONE_TIME",
      serviceGroups: ["activities", "admin"],
      dateRange: "PAST_7_DAYS",
    }),
  });
  const raw = await res.text();
  let json;
  try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.id) {
    throw new Error(`Data Connector POST /requests failed: HTTP ${res.status} ${raw}`);
  }
  return json.id;
}

async function upsertSyncMeta(prisma, status, errorMessage) {
  await prisma.syncMeta.upsert({
    where: { id: "deep" },
    create: {
      id: "deep",
      lastRunAt: new Date(),
      lastStatus: status,
      lastError: errorMessage || null,
    },
    update: {
      lastRunAt: new Date(),
      lastStatus: status,
      lastError: errorMessage || null,
    },
  });
}

async function recordFailure(errorMessage) {
  try {
    const prisma = createPrisma();
    try {
      await upsertSyncMeta(prisma, "failed", errorMessage);
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } catch (err) {
    console.warn("[deep-sync] Failed to record SyncMeta('deep','failed') (swallowed):", err && err.message ? err.message : err);
  }
}

async function main() {
  console.log("[deep-sync] Starting nightly Deep Sync job submission...");
  const prisma = createPrisma();
  let capturedRequestId;
  try {
    // 1. SYNC-04 overlap guard
    const inFlight = await prisma.accDataConnectorJob.findFirst({
      where: { status: { in: ["pending", "running"] } },
      orderBy: { startedAt: "desc" },
    });
    if (inFlight) {
      console.log(`[deep-sync] Skipping — previous job ${inFlight.requestId} still ${inFlight.status}`);
      await upsertSyncMeta(prisma, "skipped", "previous still in-flight");
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
      return;
    }

    // 2. Autodesk token
    const accessToken = await fetchAutodeskToken();

    // 3. Resolve accountId (inline `b.` strip)
    const accountId = await resolveAccountId(prisma);

    // 4. Submit Data Connector job
    const requestId = await submitDataConnectorJob(accountId, accessToken);
    capturedRequestId = requestId;
    console.log(`[deep-sync] Job submitted: ${requestId}`);

    // 5. Persist AccDataConnectorJob row
    await prisma.accDataConnectorJob.create({
      data: {
        requestId,
        status: "pending",
        serviceGroups: ["activities", "admin"],
        dateRange: "PAST_7_DAYS",
        startedAt: new Date(),
      },
    });

    // 6. Upsert SyncMeta('deep') = success (submission)
    await upsertSyncMeta(prisma, "success", null);

    await prisma.$disconnect().catch(() => {});
    console.log("[deep-sync] Done.");
    process.exit(0);
  } catch (err) {
    await prisma.$disconnect().catch(() => {});
    const errorMessage = err && err.message ? err.message : String(err);
    console.error("[deep-sync] Failed:", errorMessage);
    await recordFailure(errorMessage);
    await sendFailureAlertRaw(errorMessage, capturedRequestId);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[deep-sync] Fatal:", err);
  process.exit(1);
});
