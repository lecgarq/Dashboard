// scripts/template-sync.cjs
//
// Seed + refresh ACC Template MTY (members, roles, companies, folders, perms).
// Uses a 2-legged APS token (no interactive login). Re-runnable any time.
//
//   node scripts/template-sync.cjs

require("tsx/cjs");
const dotenv = (() => { try { return require("dotenv"); } catch { return null; } })();
if (dotenv) dotenv.config();

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";

function ts() { return new Date().toISOString(); }
function log(...a) { console.log(`[template-sync ${ts()}]`, ...a); }

function createPrisma() {
  const { PrismaClient } = require("@prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const url = (process.env.DIRECT_URL && process.env.DIRECT_URL.trim()) ||
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }), log: ["error"] });
}

async function fetchToken() {
  const clientId = process.env.APS_CLIENT_ID && process.env.APS_CLIENT_ID.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET && process.env.APS_CLIENT_SECRET.trim();
  if (!clientId || !clientSecret) throw new Error("APS_CLIENT_ID / APS_CLIENT_SECRET not configured");
  const body = new URLSearchParams({
    grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret,
    scope: "account:read data:read data:create",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString(),
  });
  const raw = await res.text();
  let json; try { json = raw ? JSON.parse(raw) : {}; } catch { json = {}; }
  if (!res.ok || !json.access_token) throw new Error(`Autodesk token fetch failed: HTTP ${res.status} ${raw}`);
  return json.access_token;
}

async function main() {
  const prisma = createPrisma();
  try {
    const hubRow = await prisma.project.findFirst({ select: { apsHubId: true } });
    if (!hubRow || !hubRow.apsHubId) throw new Error("Project.apsHubId is not configured");
    const hubId = String(hubRow.apsHubId);          // b.-prefixed (Data Management)
    const accountId = hubId.replace(/^b\./, "");     // bare UUID (ACC Admin)
    log(`hubId=${hubId} accountId=${accountId}`);

    const token = await fetchToken();
    log("token acquired.");

    const { syncTemplate } = require("../lib/acc/templateSync.ts");
    const res = await syncTemplate(prisma, accountId, hubId, token, { refreshAccessToken: fetchToken });
    log(`done: folders=${res.folders} perms=${res.perms}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
main().catch((e) => { console.error("[template-sync] fatal:", e && e.message ? e.message : e); process.exit(1); });
