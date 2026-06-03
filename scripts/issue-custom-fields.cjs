#!/usr/bin/env node
/**
 * Inspect ACC Issues custom fields for the project, and (optionally) revert an
 * issue's status. READ-ONLY by default except for --set-status.
 *
 *   (no flag)                  List custom attribute DEFINITIONS + MAPPINGS, and
 *                              show the issueType/subtype of a sample assigned issue.
 *   --set-status <id> <status> PATCH one issue's status (e.g. to revert #5 to open).
 *
 * Custom-field rule: definitions are created in the ACC Settings UI (no API), but
 * their VALUES can be set on issues via PATCH customAttributes (if mapped to the
 * issue's type/subtype).
 *
 * Run:  node --env-file=.env scripts/issue-custom-fields.cjs
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const USER_EMAIL = process.env.APS_USER_EMAIL || "luis.cortes@hermosillo.com";

const PROJECT_ID = "13010c62-8128-49a5-a9e1-7e6767735f07";
const MODEL_SET_ID = "36dcdc91-6b98-4f8e-9f0b-521b91cbd69f";
const BASE = "https://developer.api.autodesk.com";
const ISSUES = `${BASE}/construction/issues/v1/projects/${PROJECT_ID}`;
const FULL_SCOPE = "openid data:read data:write data:create viewables:read user:read account:read";

const argValue = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };

async function token() {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, refresh_token: true },
  });
  if (!acct?.refresh_token) throw new Error(`No stored Autodesk refresh_token for ${USER_EMAIL}.`);
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: acct.refresh_token,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: FULL_SCOPE,
  });
  const res = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(json)}`);
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: json.access_token, refresh_token: json.refresh_token ?? acct.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (json.expires_in || 3600), scope: json.scope ?? FULL_SCOPE,
    },
  });
  return json.access_token;
}

async function api(method, url, tok, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, ok: res.ok, body: parsed };
}

(async () => {
  const tok = await token();

  // Optional: set an issue status (used to revert the test issue #5 to open).
  const setId = argValue("--set-status");
  if (setId) {
    const status = process.argv[process.argv.indexOf("--set-status") + 2] || "open";
    const r = await api("PATCH", `${ISSUES}/issues/${setId}`, tok, { status });
    console.log(r.ok
      ? `✓ issue ${setId} status set to "${r.body.status}" (was reverted).`
      : `✗ failed (${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);
    console.log("");
  }

  // Custom attribute definitions (the fields that exist in the project).
  const defs = await api("GET", `${ISSUES}/issue-attribute-definitions?limit=200`, tok);
  console.log("──────────────────────────────────────────────");
  console.log("CUSTOM FIELD DEFINITIONS (created in ACC Settings):");
  if (!defs.ok) {
    console.log(`  (could not read: ${defs.status} ${JSON.stringify(defs.body).slice(0, 150)})`);
  } else {
    const rows = defs.body.results || [];
    console.log(`  ${rows.length} field(s):`);
    for (const d of rows) {
      const opts = d.dataType === "list" ? `  options: ${(d.metadata?.list?.options || []).map((o) => o.value).join(" | ")}` : "";
      console.log(`   • "${d.title}"  [${d.dataType}]  id=${d.id}${opts}`);
    }
  }

  // Mappings (which fields apply to which issue category/type).
  const maps = await api("GET", `${ISSUES}/issue-attribute-mappings?limit=200`, tok);
  console.log("");
  console.log("FIELD → ISSUE-TYPE MAPPINGS:");
  if (!maps.ok) {
    console.log(`  (could not read: ${maps.status})`);
  } else {
    const rows = maps.body.results || [];
    console.log(`  ${rows.length} mapping(s):`);
    for (const m of rows) console.log(`   • def ${m.attributeDefinitionId}  →  ${m.mappedItemType} ${m.mappedItemId}`);
  }

  // Show the issue type/subtype of a sample assigned issue so we can relate mappings.
  const assigned = await api("GET", `${BASE}/bim360/clash/v3/containers/${PROJECT_ID}/modelsets/${MODEL_SET_ID}/clashes/assigned?pageLimit=1`, tok);
  const sampleIssueId = assigned.ok ? assigned.body.groups?.[0]?.issueId : null;
  if (sampleIssueId) {
    const iss = await api("GET", `${ISSUES}/issues/${sampleIssueId}`, tok);
    if (iss.ok) {
      console.log("");
      console.log("SAMPLE assigned issue (to relate to mappings):");
      console.log(`   #${iss.body.displayId} "${iss.body.title}"`);
      console.log(`   issueTypeId (category): ${iss.body.issueTypeId}`);
      console.log(`   issueSubtypeId (type):  ${iss.body.issueSubtypeId}`);
      console.log(`   existing customAttributes: ${JSON.stringify(iss.body.customAttributes || [])}`);
    }
  }
  console.log("──────────────────────────────────────────────");
})()
  .catch((err) => { console.error("error:", err.message || err); process.exit(1); })
  .finally(() => prisma.$disconnect());
