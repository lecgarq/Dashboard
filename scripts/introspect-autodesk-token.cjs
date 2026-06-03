#!/usr/bin/env node
/**
 * Introspect the stored 3-legged Autodesk token to see what scopes are granted.
 * Read-only — uses POST /authentication/v2/introspect which is purely diagnostic.
 *
 * Run: node --env-file=.env scripts/introspect-autodesk-token.cjs
 */

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const CLIENT_ID = process.env.APS_CLIENT_ID;
const CLIENT_SECRET = process.env.APS_CLIENT_SECRET;

(async () => {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: "luis.cortes@hermosillo.com" } },
    select: { access_token: true },
  });
  if (!acct?.access_token) {
    console.error("No access_token stored.");
    process.exit(1);
  }

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({ token: acct.access_token });

  const res = await fetch("https://developer.api.autodesk.com/authentication/v2/introspect", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json();
  console.log("Introspection result:");
  console.log(JSON.stringify(json, null, 2));

  if (json.scope) {
    const scopes = json.scope.split(/\s+/);
    console.log("\nGranted scopes:");
    for (const s of scopes) console.log(`  ✓ ${s}`);
    const hasCreate = scopes.includes("data:create");
    console.log(`\ndata:create present: ${hasCreate ? "✅ YES" : "❌ NO"}`);
  }
})()
  .catch((err) => { console.error("error:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
