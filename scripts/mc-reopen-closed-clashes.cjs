#!/usr/bin/env node
/**
 * Reopen closed clash groups in an ACC Model Coordination model set.
 *
 * Target comes from the ACC URL:
 *   acc.autodesk.com/model/clashes/projects/<PROJECT_ID>/model-set/<MODEL_SET_ID>/closed
 *
 * PHASE 1 — DRY RUN (default, read-only):
 *   Lists every closed clash group in the target model set, prints the count,
 *   a sample, and a breakdown by close reason, then saves the full ID list to
 *   scratch/. Uses the stored 3-legged token (needs only data:read) and
 *   PERSISTS the rotated refresh token back to the DB (APS refresh tokens are
 *   single-use — not persisting them is what previously broke the dashboard).
 *
 * PHASE 2 — REOPEN (--reopen, write):
 *   Reads a data:write access token from scratch/aps-access-token.json (produced
 *   by scripts/aps-login.cjs), then POSTs the closed group IDs to clashes:reopen
 *   in batches of 20, with 429 backoff, and verifies by re-listing afterward.
 *
 * Run (dry run):  node --env-file=.env scripts/mc-reopen-closed-clashes.cjs
 * Run (reopen):   node --env-file=.env scripts/mc-reopen-closed-clashes.cjs --reopen
 */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const USER_EMAIL = process.env.APS_USER_EMAIL || "luis.cortes@hermosillo.com";

// Target (from the link Luis provided).
const PROJECT_ID = "13010c62-8128-49a5-a9e1-7e6767735f07";
const MODEL_SET_ID = "36dcdc91-6b98-4f8e-9f0b-521b91cbd69f";

const BASE = "https://developer.api.autodesk.com";
const OUT_DIR = path.join(process.cwd(), "scratch");
const DEFAULT_TOKEN_FILE = path.join(OUT_DIR, "aps-access-token.json");
const REOPEN_BATCH = 20; // API hard limit: max 20 group IDs per reopen call.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

/**
 * Read the stored refresh token, refresh it, and PERSIST the rotated tokens back
 * to the DB. APS v2 refresh tokens are single-use, so we must save the new one.
 */
async function refreshAndPersistFromDb(scope) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, refresh_token: true },
  });
  if (!acct?.refresh_token) {
    throw new Error(`No stored Autodesk refresh_token for ${USER_EMAIL}. Run scripts/aps-login.cjs first.`);
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: acct.refresh_token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope,
  });
  const res = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  // Persist rotation so we don't invalidate the dashboard's stored token.
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token,
      refresh_token: json.refresh_token ?? acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600),
      scope: json.scope ?? scope,
    },
  });
  return json.access_token;
}

function readTokenFile(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`Token file not found: ${file}\n  Run scripts/aps-login.cjs first to produce it.`);
  }
  const t = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!t.access_token) throw new Error(`Token file ${file} has no access_token.`);
  return t;
}

async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

function shortDetail(body) {
  if (typeof body === "string") return body.slice(0, 300);
  return (body?.detail || body?.title || JSON.stringify(body)).slice(0, 300);
}

/**
 * For ACC Model Coordination the clash/modelset container id is the project id.
 * Verify empirically by listing model sets and confirming the target appears.
 */
async function resolveContainer(token) {
  const candidate = PROJECT_ID;
  const modelSets = [];
  let continuationToken = null;
  do {
    const qs = new URLSearchParams({ pageLimit: "100", includeDisabled: "true" });
    if (continuationToken) qs.set("continuationToken", continuationToken);
    const url = `${BASE}/bim360/modelset/v3/containers/${candidate}/modelsets?${qs}`;
    const { status, ok, body } = await apiGet(url, token);
    if (!ok) return { ok: false, status, detail: shortDetail(body), candidate };
    for (const ms of body.modelSets || []) modelSets.push(ms);
    continuationToken = body.page?.continuationToken || null;
  } while (continuationToken);

  const target = modelSets.find((m) => m.modelSetId === MODEL_SET_ID) || null;
  return { ok: true, containerId: candidate, modelSets, target };
}

async function listClosedGroups(token, containerId) {
  const groups = [];
  let continuationToken = null;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ pageLimit: "100" });
    if (continuationToken) qs.set("continuationToken", continuationToken);
    const url = `${BASE}/bim360/clash/v3/containers/${containerId}/modelsets/${MODEL_SET_ID}/clashes/closed?${qs}`;
    const { status, ok, body } = await apiGet(url, token);
    if (!ok) throw new Error(`closed-list failed (${status}): ${shortDetail(body)}`);
    for (const g of body.groups || []) groups.push(g);
    continuationToken = body.page?.continuationToken || null;
    pages++;
  } while (continuationToken);
  return { groups, pages };
}

async function reopenBatch(token, containerId, ids) {
  const url = `${BASE}/bim360/clash/v3/containers/${containerId}/modelsets/${MODEL_SET_ID}/clashes:reopen`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(ids),
    });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (res.status === 429) {
      const wait = (Number(res.headers.get("retry-after")) || 5) * 1000;
      console.log(`    rate limited; waiting ${wait / 1000}s …`);
      await sleep(wait);
      continue;
    }
    return { status: res.status, ok: res.ok, body };
  }
  return { status: 429, ok: false, body: "rate limited (retries exhausted)" };
}

async function runReopen() {
  console.log("ACC Model Coordination — REOPEN closed clash groups (WRITE)");
  console.log(`  project:   ${PROJECT_ID}`);
  console.log(`  model set: ${MODEL_SET_ID}`);
  console.log("");

  const tokenFile = argValue("--token-file") || DEFAULT_TOKEN_FILE;
  const { access_token: token, scope } = readTokenFile(tokenFile);
  console.log(`  ✓ using access token from ${tokenFile}`);
  console.log(`    scope: ${scope || "(unknown)"}`);
  if (scope && !/\bdata:write\b/.test(scope)) {
    console.error("  ✗ that token lacks data:write — run scripts/aps-login.cjs and accept the write consent.");
    process.exit(1);
  }

  const c = await resolveContainer(token);
  if (!c.ok || !c.target) {
    console.error("  ✗ could not resolve/read the model set with this token.");
    if (!c.ok) console.error(`    status ${c.status}: ${c.detail}`);
    process.exit(1);
  }
  console.log(`  ✓ model set = "${c.target.name}"`);

  console.log("→ re-listing current closed clash groups …");
  const { groups } = await listClosedGroups(token, c.containerId);
  const ids = groups.map((g) => g.id);
  console.log(`  ${ids.length} closed group(s) to reopen.`);
  if (ids.length === 0) { console.log("Nothing to do."); return; }

  const batches = chunk(ids, REOPEN_BATCH);
  const results = [];
  let done = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const r = await reopenBatch(token, c.containerId, batch);
    const okHere = r.status === 202 || r.status === 200;
    done += okHere ? batch.length : 0;
    results.push({ batch: i + 1, ids: batch, status: r.status, jobId: r.body?.jobId || null, ok: okHere, error: okHere ? null : r.body });
    console.log(`  batch ${i + 1}/${batches.length}: ${okHere ? "OK" : "FAILED"} (${r.status})  reopened ${done}/${ids.length}`);
    if (!okHere && (r.status === 401 || r.status === 403)) {
      console.error(`  ✗ permission/auth error — aborting. Detail: ${shortDetail(r.body)}`);
      break;
    }
    await sleep(300); // gentle pacing between batches
  }

  // Verify by re-listing (allow a moment for async jobs to settle).
  console.log("→ verifying (waiting 5s for processing) …");
  await sleep(5000);
  const after = await listClosedGroups(token, c.containerId);
  const remaining = after.groups.length;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const logFile = path.join(OUT_DIR, `mc-reopen-result-${MODEL_SET_ID.slice(0, 8)}.json`);
  fs.writeFileSync(logFile, JSON.stringify({
    projectId: PROJECT_ID, containerId: c.containerId, modelSetId: MODEL_SET_ID,
    attempted: ids.length, reopenedReported: done, remainingClosedAfter: remaining,
    reopenedIds: ids, batches: results,
  }, null, 2));

  console.log("");
  console.log("──────────────────────────────────────────────");
  console.log(`Attempted:         ${ids.length}`);
  console.log(`Reopened (API ok): ${done}`);
  console.log(`Still closed now:  ${remaining}`);
  console.log("──────────────────────────────────────────────");
  console.log(`Log → ${logFile}`);
  if (remaining === 0) console.log("✓ All closed clash groups are now Active.");
  else console.log(`Note: ${remaining} still show closed — may be async lag; re-run the dry run in a minute to recheck.`);
}

async function runDryRun() {
  console.log("ACC Model Coordination — closed clash groups (DRY RUN, read-only)");
  console.log(`  project:   ${PROJECT_ID}`);
  console.log(`  model set: ${MODEL_SET_ID}`);
  console.log(`  identity:  ${USER_EMAIL}`);
  console.log("");

  console.log("→ refreshing access token (scope: data:read) …");
  const token = await refreshAndPersistFromDb("data:read");

  console.log("→ resolving container id …");
  const c = await resolveContainer(token);
  if (!c.ok) {
    console.error(`  could not list model sets for container=${c.candidate}`);
    console.error(`  status ${c.status}: ${c.detail}`);
    console.error("  (If 403, your account lacks read access to this project. If 404, the container id is not the project id and we need another lookup.)");
    process.exit(1);
  }
  if (!c.target) {
    console.error(`  container ${c.containerId} is readable, but model set ${MODEL_SET_ID} was not found among ${c.modelSets.length} model set(s).`);
    console.error("  model sets visible to this account:");
    for (const m of c.modelSets) console.error(`    ${m.modelSetId}  ${m.name}${m.isDisabled ? "  (disabled)" : ""}`);
    process.exit(1);
  }
  console.log(`  ✓ container = ${c.containerId}`);
  console.log(`  ✓ model set = "${c.target.name}"${c.target.isDisabled ? " (disabled)" : ""}`);
  console.log("");

  console.log("→ listing closed clash groups …");
  const { groups, pages } = await listClosedGroups(token, c.containerId);

  const byReason = {};
  for (const g of groups) {
    const r = g.reason || "(none)";
    byReason[r] = (byReason[r] || 0) + 1;
  }

  console.log("");
  console.log("──────────────────────────────────────────────");
  console.log(`CLOSED CLASH GROUPS: ${groups.length}  (across ${pages} page(s))`);
  console.log("──────────────────────────────────────────────");
  if (groups.length) {
    console.log("By close reason:");
    for (const [r, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${r}`);
    }
    console.log("");
    console.log("Sample (first 10):");
    for (const g of groups.slice(0, 10)) {
      console.log(`  ${g.id}  [${g.reason || "-"}]  ${(g.title || "").slice(0, 70)}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `mc-closed-clashes-${MODEL_SET_ID.slice(0, 8)}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    projectId: PROJECT_ID,
    containerId: c.containerId,
    modelSetId: MODEL_SET_ID,
    modelSetName: c.target.name,
    capturedBy: USER_EMAIL,
    count: groups.length,
    byReason,
    groupIds: groups.map((g) => g.id),
    groups: groups.map((g) => ({
      id: g.id,
      clashTestId: g.clashTestId,
      title: g.title,
      reason: g.reason,
      createdBy: g.createdBy,
      createdOn: g.createdOn,
      clashCount: Array.isArray(g.clashes) ? g.clashes.length : null,
    })),
  }, null, 2));
  console.log("");
  console.log(`Saved full list → ${outFile}`);
  console.log("");
  console.log(groups.length
    ? "Next: review the count above. If it's right, run aps-login.cjs then this script with --reopen."
    : "Nothing closed to reopen in this model set.");
}

(async () => {
  if (process.argv.includes("--reopen")) {
    await runReopen();
  } else {
    await runDryRun();
  }
})()
  .catch((err) => { console.error("error:", err.message || err); process.exit(1); })
  .finally(() => prisma.$disconnect());
