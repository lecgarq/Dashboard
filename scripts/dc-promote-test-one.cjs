#!/usr/bin/env node
/**
 * Single-project test of the projectAdmin promotion PATCH for Luis Cortés.
 *
 * Safety:
 *   - Only mutates Luis's user record on ONE project (hardcoded UUID).
 *   - Saves a JSON snapshot of the BEFORE state to scripts/_rollback/
 *   - Default: --dry-run (zero writes). Pass --execute to actually PATCH.
 *   - After PATCH, re-reads to confirm and prints both before/after.
 *
 * Run:
 *   node --env-file=.env scripts/dc-promote-test-one.cjs            # dry run
 *   node --env-file=.env scripts/dc-promote-test-one.cjs --execute  # actually patch
 */

const fs = require("node:fs");
const path = require("node:path");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const ADMIN_V1 = "https://developer.api.autodesk.com/construction/admin/v1";

const LUIS_EMAIL = "luis.cortes@hermosillo.com";
const LUIS_FORMA_ID = "e3657018-3f2f-4fd2-9d22-8d92f19c3324"; // for URL path
const LUIS_AUTODESK_ID = "5HC2RRHRN7LZHLU6";                  // for User-Id header

// Test project: "00 Implementación HER-ACS" — type "Demonstration Project", classification "sample"
const TEST_PROJECT_ID = "c6b7bf49-a04a-419f-a49d-6cbef86332f2";

const EXECUTE = process.argv.includes("--execute");
const ROLLBACK_DIR = path.join(__dirname, "_rollback");

function ts() { return new Date().toISOString(); }
function log(...args) { console.log(`[promote-one ${ts()}]`, ...args); }
function logErr(...args) { console.error(`[promote-one ${ts()}]`, ...args); }

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

async function getLuisOnProject(projectId, token) {
  const url = `${ADMIN_V1}/projects/${projectId}/users?filter[email]=${encodeURIComponent(LUIS_EMAIL)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json();
  if (!r.ok) throw new Error(`GET project users ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const u = data.results?.[0];
  if (!u) throw new Error(`Luis not found on project ${projectId}`);
  return u;
}

async function patchLuis(projectId, token, body) {
  const url = `${ADMIN_V1}/projects/${projectId}/users/${LUIS_FORMA_ID}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      // 2-leg context requires User-Id header per APS docs
      "User-Id": LUIS_AUTODESK_ID,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, body: json };
}

function buildPromotePayload(before) {
  // Build PATCH body that:
  //  - keeps companyId / companyName / roleIds intact (no changes)
  //  - sets every product the user currently has to "administrator" except those
  //    where access is "none" (those stay "none" — we don't grant access to products
  //    the user didn't already have member-level access on).
  //
  // Per APS docs: "If you set a product's key to projectAdministration and you set
  // access to administrator, all other products should be set to administrator
  // access for the user." — we comply by upgrading existing member→administrator.
  const products = (before.products || []).map((p) => {
    if (p.key === "projectAdministration") return { key: p.key, access: "administrator" };
    if (p.access === "administrator") return { key: p.key, access: "administrator" };
    if (p.access === "member") return { key: p.key, access: "administrator" };
    // p.access === "none" or other → leave as-is (we'd rather not grant new product access)
    return { key: p.key, access: p.access };
  });
  // Make sure projectAdministration is in the list (some users don't have it)
  if (!products.some((p) => p.key === "projectAdministration")) {
    products.push({ key: "projectAdministration", access: "administrator" });
  }
  return { products };
}

(async () => {
  log(`=== Single-project promotion test ===`);
  log(`Project: ${TEST_PROJECT_ID} (test/demo)`);
  log(`User: ${LUIS_EMAIL} (forma=${LUIS_FORMA_ID}, autodesk=${LUIS_AUTODESK_ID})`);
  log(`Mode: ${EXECUTE ? "EXECUTE (will PATCH)" : "DRY RUN (no writes)"}`);
  log("");

  if (!fs.existsSync(ROLLBACK_DIR)) fs.mkdirSync(ROLLBACK_DIR, { recursive: true });

  // 1. Read-only token for BEFORE state
  const readToken = await get2LegToken("account:read data:read");
  const before = await getLuisOnProject(TEST_PROJECT_ID, readToken);
  log("BEFORE accessLevels:", JSON.stringify(before.accessLevels));
  log("BEFORE products:");
  for (const p of before.products || []) log(`  - ${p.key.padEnd(28)} : ${p.access}`);

  // 2. Save snapshot
  const snapshotPath = path.join(ROLLBACK_DIR, `${TEST_PROJECT_ID}.before.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(before, null, 2));
  log(`Saved snapshot → ${snapshotPath}`);

  // 3. Build proposed payload
  const payload = buildPromotePayload(before);
  log("");
  log("PROPOSED PATCH body:");
  for (const p of payload.products) log(`  - ${p.key.padEnd(28)} : ${p.access}`);

  if (!EXECUTE) {
    log("");
    log("Dry run only. No writes performed. Run with --execute to apply.");
    return;
  }

  // 4. Execute PATCH (write token)
  const writeToken = await get2LegToken("account:write account:read data:read");
  log("");
  log("Executing PATCH...");
  const result = await patchLuis(TEST_PROJECT_ID, writeToken, payload);
  log(`PATCH status: ${result.status} (${result.ok ? "OK" : "FAILED"})`);
  if (!result.ok) {
    logErr("Body:", typeof result.body === "string" ? result.body.slice(0, 500) : JSON.stringify(result.body).slice(0, 500));
    process.exitCode = 1;
    return;
  }

  // 5. Re-read and confirm
  const after = await getLuisOnProject(TEST_PROJECT_ID, readToken);
  log("");
  log("AFTER accessLevels:", JSON.stringify(after.accessLevels));
  log("AFTER products:");
  for (const p of after.products || []) log(`  - ${p.key.padEnd(28)} : ${p.access}`);

  const promoted = after.accessLevels?.projectAdmin === true;
  log("");
  log(promoted ? "✅ projectAdmin: false → true" : "⚠️  projectAdmin did NOT flip to true");
})().catch((err) => {
  logErr("Fatal:", err.message || err);
  process.exit(1);
});
