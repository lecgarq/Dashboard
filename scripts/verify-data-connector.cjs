#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Probe APS Data Connector authorization with multiple variants.
 * Side-effect-free.
 *
 * Run: node --env-file=.env scripts/verify-data-connector.cjs
 */

const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const HUB_ID = process.env.APS_HUB_ID;

if (!CLIENT_ID || !CLIENT_SECRET || !HUB_ID) {
  console.error("Missing env: need APS_CLIENT_ID, APS_CLIENT_SECRET, APS_HUB_ID");
  process.exit(2);
}

const accountIdNoPrefix = HUB_ID.replace(/^b\./, "");
const accountIdWithPrefix = `b.${accountIdNoPrefix}`;

async function getToken(scope) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope,
  });
  const res = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    return { error: `Token failed (${res.status}): ${JSON.stringify(json)}` };
  }
  return { token: json.access_token };
}

async function probe(label, url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  const detail = body?.detail || body?.developerMessage || body?.title || (typeof body === "string" ? body.slice(0, 200) : "");
  console.log(`  ${label}: ${res.status} ${detail ? "— " + detail : ""}`);
  return res.status;
}

(async () => {
  console.log(`Client ID: ${CLIENT_ID.slice(0, 8)}…${CLIENT_ID.slice(-4)}`);
  console.log(`Hub/Account: ${accountIdNoPrefix}`);
  console.log("");

  const scopes = [
    "account:read data:read data:create",
    "data:read data:create account:read account:write",
    "data:read data:write data:create data:search bucket:read bucket:create account:read",
  ];

  for (const scope of scopes) {
    console.log(`── scope: ${scope}`);
    const tk = await getToken(scope);
    if (tk.error) { console.log("  token error:", tk.error); continue; }

    // Variant 1: ACC Data Connector v1, no prefix
    await probe("ACC v1 (no prefix)",
      `https://developer.api.autodesk.com/data-connector/v1/accounts/${accountIdNoPrefix}/requests`,
      tk.token);

    // Variant 2: ACC Data Connector v1, with b. prefix
    await probe("ACC v1 (b. prefix)",
      `https://developer.api.autodesk.com/data-connector/v1/accounts/${accountIdWithPrefix}/requests`,
      tk.token);

    // Variant 3: BIM 360 Admin (sanity check — should already work)
    await probe("HQ v1 /users (sanity)",
      `https://developer.api.autodesk.com/hq/v1/accounts/${accountIdNoPrefix}/users?limit=1`,
      tk.token);

    // Variant 4: alt account-admin path
    await probe("Admin v1 /projects (sanity)",
      `https://developer.api.autodesk.com/construction/admin/v1/accounts/${accountIdNoPrefix}/projects?limit=1`,
      tk.token);

    console.log("");
  }
})().catch((err) => {
  console.error("error:", err.message ?? err);
  process.exit(2);
});
