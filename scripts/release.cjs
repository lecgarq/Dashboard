/**
 * Railway release command — Phase 1 sync orchestration.
 *
 * Order of operations:
 *   1. `prisma migrate deploy` (60s timeout, no email on failure — fail fast)
 *   2. Quick Sync shell:
 *      - 5-minute hard timeout watchdog (CONTEXT-locked)
 *      - Spawns `npx tsx lib/acc/quick-sync-extraction.ts` (Phase 2 wired).
 *      - On success: upserts SyncMeta('quick','success').
 *      - On non-zero exit / spawn error: throws → outer catch runs
 *        recordFailure + sendFailureAlertRaw and exits 1.
 *   3. Optional graph cache rebuild (`REBUILD_ACC_GRAPH_ON_RELEASE=1`):
 *      - Skipped by default so deploys stay fast. When enabled, failure logs
 *        + alerts but does NOT fail the deploy (old graph cache keeps serving).
 *   4. On any error in the Quick Sync step:
 *      - Best-effort upsert SyncMeta('quick') with lastStatus='failed' + lastError
 *      - Best-effort raw-fetch Resend alert to luis.ecorteg@gmail.com
 *      - process.exit(1) so the deploy fails (old container keeps serving)
 *
 * Pure CommonJS — cannot require TS modules (lib/server/email.ts, lib/server/acc-helpers.ts).
 * The Resend alert is inlined as a duplicate of `sendSyncFailureAlert` for CJS-callability.
 * The graph rebuild lives in a TS entry (scripts/rebuild-graph.ts) and is invoked via tsx.
 */

const { spawnSync } = require("child_process");

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes, CONTEXT-locked
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

async function sendFailureAlertRaw(syncType, errorMessage, jobId) {
  const apiKey = process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim();
  if (!apiKey) {
    console.warn(`[release] RESEND_API_KEY not set — skipping failure alert email.`);
    return;
  }
  const from = (process.env.RESEND_EMAIL && process.env.RESEND_EMAIL.trim()) || "onboarding@resend.dev";
  const label = syncType === "quick" ? "Quick Sync (release step)" : "Deep Sync (nightly cron)";
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
      console.warn(`[release] Resend alert HTTP ${res.status}: ${body}`);
    } else {
      console.log(`[release] Failure alert email sent.`);
    }
  } catch (err) {
    console.warn(`[release] Failed to send alert email (swallowed):`, err && err.message ? err.message : err);
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

async function runQuickSyncShell() {
  // Phase 2 wired body: spawn the TS extractor via tsx. Non-zero exit throws so
  // the outer recordFailure + sendFailureAlertRaw paths fire. SyncMeta('quick')
  // is only marked success after the extractor exits cleanly.
  const startedAt = new Date();
  console.log("[release] Quick Sync: invoking lib/acc/quick-sync-extraction.ts via tsx...");

  const result = spawnSync("npx", ["tsx", "lib/acc/quick-sync-extraction.ts"], {
    stdio: "inherit",
    timeout: TIMEOUT_MS - 30_000, // 30s buffer below the outer 5-min watchdog
    shell: process.platform === "win32",
    env: { ...process.env, ACC_QUICK_SYNC_PROJECTS_ONLY: "1" },
  });

  if (result.error || result.status !== 0) {
    const reason = result.error
      ? `tsx invocation failed: ${result.error.message}`
      : `Quick Sync extraction exited ${result.status}`;
    throw new Error(reason);
  }

  // Success: mark SyncMeta('quick','success'). The TS extractor handles
  // per-project + member logging; release.cjs only owns the status row.
  const prisma = createPrisma();
  try {
    await prisma.syncMeta.upsert({
      where: { id: "quick" },
      create: {
        id: "quick",
        lastRunAt: startedAt,
        lastStatus: "success",
        lastError: null,
      },
      update: {
        lastRunAt: startedAt,
        lastStatus: "success",
        lastError: null,
      },
    });
    console.log("[release] Quick Sync complete; SyncMeta('quick','success') written.");
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

async function recordFailure(errorMessage) {
  // Best-effort SyncMeta failed write — Prisma itself may be the failure source,
  // so wrap in try/catch and never throw.
  try {
    const prisma = createPrisma();
    try {
      await prisma.syncMeta.upsert({
        where: { id: "quick" },
        create: {
          id: "quick",
          lastRunAt: new Date(),
          lastStatus: "failed",
          lastError: errorMessage,
        },
        update: {
          lastRunAt: new Date(),
          lastStatus: "failed",
          lastError: errorMessage,
        },
      });
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } catch (err) {
    console.warn("[release] Failed to record SyncMeta('quick','failed') (swallowed):", err && err.message ? err.message : err);
  }
}

async function main() {
  // Step 1: migrations
  console.log("[release] Running prisma migrate deploy...");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    timeout: 60_000,
    shell: process.platform === "win32",
  });
  if (migrate.status !== 0) {
    console.error("[release] Migration failed (exit", migrate.status, ").");
    process.exit(1);
  }
  console.log("[release] Migrations applied.");

  // Step 2: Quick Sync shell with 5-minute hard timeout
  const timer = setTimeout(() => {
    console.error("[release] Quick Sync timed out after 5 minutes. Failing deploy.");
    recordFailure("Quick Sync timeout (5 minutes exceeded)")
      .then(() => sendFailureAlertRaw("quick", "Quick Sync timeout (5 minutes exceeded)"))
      .finally(() => process.exit(1));
  }, TIMEOUT_MS);

  try {
    await runQuickSyncShell();
    clearTimeout(timer);
  } catch (err) {
    clearTimeout(timer);
    const errorMessage = err && err.message ? err.message : String(err);
    console.error("[release] Quick Sync failed:", errorMessage);
    await recordFailure(errorMessage);
    await sendFailureAlertRaw("quick", errorMessage);
    process.exit(1);
  }

  // Step 3: graph cache rebuild (recoverable — logs on failure, never fails the deploy)
  if (process.env.REBUILD_ACC_GRAPH_ON_RELEASE !== "1") {
    console.log("[release] Skipping ACC graph cache rebuild (set REBUILD_ACC_GRAPH_ON_RELEASE=1 to run it during release).");
    return;
  }

  console.log("[release] Running ACC graph cache rebuild...");
  const rebuild = spawnSync("npx", ["tsx", "scripts/rebuild-graph.ts"], {
    stdio: "inherit",
    timeout: 5 * 60 * 1000,
    shell: process.platform === "win32",
  });
  if (rebuild.status !== 0) {
    const reason = rebuild.error
      ? `tsx invocation failed: ${rebuild.error.message}`
      : `Graph rebuild exited ${rebuild.status} (recoverable — old cache still serving).`;
    console.warn("[release]", reason);
    // Fire-and-forget alert; never block the deploy on alerting.
    sendFailureAlertRaw("quick", `Graph cache rebuild failed during release (deploy succeeded, cache may be stale): ${reason}`).catch(() => {});
  } else {
    console.log("[release] Graph cache rebuild complete.");
  }
}

main().catch((err) => {
  console.error("[release] Fatal:", err);
  process.exit(1);
});
