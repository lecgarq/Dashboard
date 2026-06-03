#!/usr/bin/env node
/**
 * Bulk-promote Luis Cortés from projectMember to projectAdmin on every project
 * where he is currently a member-only (projectAdmin: false).
 *
 * SAFETY INVARIANTS:
 *   - Only Luis's user record is touched (URL contains his Forma ID).
 *   - Only PATCH is used. Never DELETE.
 *   - Only access levels are modified. Companies, roles, status are untouched.
 *   - Products with current access "none" stay "none" (no new product access granted).
 *   - BEFORE state is saved per project to scripts/_rollback/<projectId>.before.json
 *     so changes can be reverted via dc-rollback-all.cjs (separate file).
 *   - Default is --dry-run (zero writes). Pass --execute to actually run.
 *   - Chunked processing (default 25/chunk) with brief pauses for rate limiting.
 *   - Idempotent: a project where Luis is already projectAdmin is skipped.
 *
 * Run:
 *   node --env-file=.env scripts/dc-promote-all.cjs            # dry-run (default)
 *   node --env-file=.env scripts/dc-promote-all.cjs --execute  # actually promote
 *   DC_LIMIT=10 node ... --execute                             # promote at most 10
 */

const fs = require("node:fs");
const path = require("node:path");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const ADMIN_V1 = "https://developer.api.autodesk.com/construction/admin/v1";

const LUIS_EMAIL = "luis.cortes@hermosillo.com";
const LUIS_FORMA_ID = "e3657018-3f2f-4fd2-9d22-8d92f19c3324";
const LUIS_AUTODESK_ID = "5HC2RRHRN7LZHLU6";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = parseInt(process.env.DC_LIMIT || "0", 10) || Infinity;
const CHUNK_SIZE = 25;
const CHUNK_PAUSE_MS = 1500; // brief breath between chunks
const ROLLBACK_DIR = path.join(__dirname, "_rollback");

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[promote-all ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[promote-all ${ts()}]`, ...args); }

async function get2LegToken(scope) {
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.APS_CLIENT_ID,
      client_secret: process.env.APS_CLIENT_SECRET,
      scope,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`2-leg token failed: ${JSON.stringify(json)}`);
  return json.access_token;
}

async function listAllUserProjects(accountId, token) {
  const all = [];
  let offset = 0;
  while (true) {
    const url = `${ADMIN_V1}/accounts/${accountId}/users/${LUIS_FORMA_ID}/projects?limit=200&offset=${offset}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!data.results) throw new Error(`user-projects ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
    all.push(...data.results);
    const total = data.pagination?.totalResults ?? 0;
    offset += data.pagination?.limit ?? 200;
    if (offset >= total) break;
  }
  return all;
}

async function getLuisOnProject(projectId, token) {
  const url = `${ADMIN_V1}/projects/${projectId}/users?filter[email]=${encodeURIComponent(LUIS_EMAIL)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GET project users ${r.status}: ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.results?.[0] || null;
}

function buildPromotePayload(before) {
  // Minimal-touch: only upgrade existing member→administrator, never grant new access
  // to products where current access is "none".
  const products = (before.products || []).map((p) => {
    if (p.key === "projectAdministration") return { key: p.key, access: "administrator" };
    if (p.access === "administrator") return { key: p.key, access: "administrator" };
    if (p.access === "member") return { key: p.key, access: "administrator" };
    return { key: p.key, access: p.access }; // none → none
  });
  if (!products.some((p) => p.key === "projectAdministration")) {
    products.push({ key: "projectAdministration", access: "administrator" });
  }
  return { products };
}

async function patchLuis(projectId, token, body) {
  const url = `${ADMIN_V1}/projects/${projectId}/users/${LUIS_FORMA_ID}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Id": LUIS_AUTODESK_ID,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, body: json };
}

async function processProject(project, readToken, writeToken, idx, total) {
  const projectId = project.id;
  const projectName = project.name;
  const tag = `[${idx + 1}/${total}] ${projectId.slice(0, 8)} "${projectName}"`;

  // 1. Read current state from the per-project endpoint (gives full accessLevels + products)
  let before;
  try {
    before = await getLuisOnProject(projectId, readToken);
  } catch (err) {
    return { skipped: true, reason: `read-failed: ${err.message}`, tag };
  }
  if (!before) {
    return { skipped: true, reason: "Luis not on project", tag };
  }

  // Idempotency: if already projectAdmin, skip
  if (before.accessLevels?.projectAdmin === true) {
    return { skipped: true, reason: "already projectAdmin", tag };
  }

  // 2. Save BEFORE snapshot for rollback
  if (!fs.existsSync(ROLLBACK_DIR)) fs.mkdirSync(ROLLBACK_DIR, { recursive: true });
  const snapshotPath = path.join(ROLLBACK_DIR, `${projectId}.before.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify({
    projectId,
    projectName,
    savedAt: new Date().toISOString(),
    user: before,
  }, null, 2));

  // 3. Build payload
  const payload = buildPromotePayload(before);

  if (!EXECUTE) {
    return { dryRun: true, tag };
  }

  // 4. PATCH
  const result = await patchLuis(projectId, writeToken, payload);
  if (!result.ok) {
    const msg = typeof result.body === "string" ? result.body.slice(0, 200) : JSON.stringify(result.body).slice(0, 200);
    return { failed: true, reason: `${result.status}: ${msg}`, tag };
  }

  // 5. Verify
  const after = await getLuisOnProject(projectId, readToken);
  const promoted = after?.accessLevels?.projectAdmin === true;
  return { ok: true, promoted, tag };
}

(async () => {
  log("=== Bulk promote Luis to projectAdmin ===");
  log(`Mode: ${EXECUTE ? "EXECUTE (will PATCH)" : "DRY RUN (no writes)"}`);
  log(`Limit: ${LIMIT === Infinity ? "all" : LIMIT}`);
  log("");

  const accountId = process.env.APS_HUB_ID.replace(/^b\./, "");
  const readToken = await get2LegToken("account:read data:read");
  const writeToken = EXECUTE ? await get2LegToken("account:write account:read data:read") : null;

  log("Fetching all projects Luis is in...");
  const allProjects = await listAllUserProjects(accountId, readToken);
  const candidates = allProjects.filter((p) => p.accessLevels?.projectAdmin === false && p.accessLevels?.projectMember === true);
  log(`Total: ${allProjects.length} projects. Promotion candidates (member-only, not admin): ${candidates.length}.`);

  const toProcess = candidates.slice(0, LIMIT);
  log(`Will process: ${toProcess.length}.`);
  log("");

  const results = { ok: 0, failed: 0, skipped: 0, dryRun: 0 };
  const failures = [];

  for (let chunkStart = 0; chunkStart < toProcess.length; chunkStart += CHUNK_SIZE) {
    const chunk = toProcess.slice(chunkStart, chunkStart + CHUNK_SIZE);
    log(`--- Chunk ${chunkStart / CHUNK_SIZE + 1}: items ${chunkStart + 1}-${chunkStart + chunk.length} ---`);
    for (let i = 0; i < chunk.length; i++) {
      const r = await processProject(chunk[i], readToken, writeToken, chunkStart + i, toProcess.length);
      if (r.ok) {
        results.ok++;
        log(`  ✅ ${r.tag} promoted=${r.promoted}`);
      } else if (r.dryRun) {
        results.dryRun++;
        log(`  · ${r.tag} would promote`);
      } else if (r.skipped) {
        results.skipped++;
        log(`  - ${r.tag} skipped (${r.reason})`);
      } else if (r.failed) {
        results.failed++;
        failures.push({ tag: r.tag, reason: r.reason });
        logErr(`  ❌ ${r.tag} FAILED: ${r.reason}`);
      }
    }
    if (chunkStart + CHUNK_SIZE < toProcess.length) {
      await new Promise((r) => setTimeout(r, CHUNK_PAUSE_MS));
    }
  }

  log("");
  log("=== SUMMARY ===");
  if (EXECUTE) {
    log(`Promoted OK: ${results.ok}`);
    log(`Skipped:     ${results.skipped}`);
    log(`Failed:      ${results.failed}`);
  } else {
    log(`Would promote: ${results.dryRun}`);
    log(`Already admin: ${results.skipped}`);
  }
  if (failures.length > 0) {
    log("");
    log("Failures:");
    for (const f of failures) log(`  - ${f.tag}: ${f.reason}`);
  }
  log(`Rollback snapshots written to: ${ROLLBACK_DIR}`);
})().catch((err) => {
  logErr("Fatal:", err.message || err);
  process.exit(1);
});
