#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Probe Data Connector using Luis's stored 3-legged user token (Account Admin).
 * This tests whether 3-leg auth bypasses the "clientId not authorized" gate
 * that blocks 2-leg auth.
 *
 * Run: node --env-file=.env scripts/probe-data-connector-3leg.cjs
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;
const HUB_ID = process.env.APS_HUB_ID;
const accountId = HUB_ID.replace(/^b\./, "");

const USER_EMAIL = "luis.cortes@hermosillo.com";

async function refreshToken(refreshToken, scope) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
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
    throw new Error(`Refresh failed (${res.status}): ${JSON.stringify(json)}`);
  }
  return json.access_token;
}

async function probe(label, url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  const detail = body?.detail || body?.developerMessage || body?.title || (typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200));
  console.log(`  ${label}: ${res.status} — ${detail}`);
  return { status: res.status, body };
}

(async () => {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { access_token: true, refresh_token: true, scope: true },
  });
  if (!acct || !acct.refresh_token) {
    console.error(`No Autodesk account/refresh_token for ${USER_EMAIL}`);
    process.exit(2);
  }

  console.log(`User: ${USER_EMAIL}`);
  console.log(`Account: ${accountId}`);
  console.log(`Stored scope: ${acct.scope}`);
  console.log("");

  console.log("── refreshing with stored scope (data:read only)");
  const token1 = await refreshToken(acct.refresh_token, acct.scope || "data:read");
  await probe("DC list (3-leg, data:read)",
    `https://developer.api.autodesk.com/data-connector/v1/accounts/${accountId}/requests`,
    token1);
  console.log("");

  // Try adding data:create scope (needed for POST)
  console.log("── refreshing with data:read data:create account:read");
  try {
    const token2 = await refreshToken(acct.refresh_token, "data:read data:create account:read");
    await probe("DC list (3-leg, +data:create)",
      `https://developer.api.autodesk.com/data-connector/v1/accounts/${accountId}/requests`,
      token2);
  } catch (err) {
    console.log(`  refresh failed: ${err.message}`);
    console.log("  (likely needs re-auth with the new scope in NextAuth)");
  }

})()
  .catch((err) => { console.error("error:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
