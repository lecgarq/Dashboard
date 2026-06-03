#!/usr/bin/env node
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const ADMIN_V1 = "https://developer.api.autodesk.com/construction/admin/v1";
const LUIS_ACC_USER_ID = "e3657018-3f2f-4fd2-9d22-8d92f19c3324";

async function get2LegToken() {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.APS_CLIENT_ID,
    client_secret: process.env.APS_CLIENT_SECRET,
    scope: "account:read data:read",
  });
  const res = await fetch(APS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("2-leg token failed: " + JSON.stringify(json));
  return json.access_token;
}

async function listProjectAdminProjects(accountId, token2Leg) {
  const all = [];
  let offset = 0;
  while (true) {
    const url = `${ADMIN_V1}/accounts/${accountId}/users/${LUIS_ACC_USER_ID}/projects?limit=200&offset=${offset}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token2Leg}` } });
    const data = await r.json();
    if (!data.results) throw new Error(`Admin v1 user-projects failed: ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
    all.push(...data.results);
    const total = data.pagination?.totalResults ?? 0;
    offset += data.pagination?.limit ?? 200;
    if (offset >= total) break;
  }
  return all.filter((p) => p.accessLevels?.projectAdmin === true);
}

async function resolveAccountId(prisma) {
  const hub = process.env.APS_HUB_ID || (await prisma.project.findFirst({ select: { apsHubId: true } }))?.apsHubId;
  if (!hub) throw new Error("APS_HUB_ID or Project.apsHubId is not configured");
  return String(hub).replace(/^b\./, "");
}

async function main() {
  const url = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL or DIRECT_URL must be set");
  
  const pg = require("pg");
  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Total projects registered in live and DC snap
    const liveCount = await prisma.accProject.count();
    const dcCount = await prisma.accDcProject.count();
    
    // Get all project IDs from both tables to find the union
    const liveProjIds = (await prisma.accProject.findMany({ select: { id: true } })).map(p => p.id);
    const dcProjIds = (await prisma.accDcProject.findMany({ select: { id: true } })).map(p => p.id);
    const unionProjIds = Array.from(new Set([...liveProjIds, ...dcProjIds]));

    // 2. Already backfilled / covered in AccDcBackfillProgress
    const backfilledCount = await prisma.accDcBackfillProgress.count();
    const backfilledIds = new Set(
      (await prisma.accDcBackfillProgress.findMany({ select: { projectId: true } })).map(b => b.projectId)
    );

    // 3. Pending projects
    const pendingIds = unionProjIds.filter(id => !backfilledIds.has(id));

    // 4. Resolve the authorization list (which projects does Luis have projectAdmin = true)
    let adminProjectIds = new Set();
    let authError = null;
    try {
      const accountId = await resolveAccountId(prisma);
      const token2Leg = await get2LegToken();
      const adminProjects = await listProjectAdminProjects(accountId, token2Leg);
      adminProjectIds = new Set(adminProjects.map((p) => p.id));
    } catch (err) {
      authError = err && err.message ? err.message : String(err);
    }

    // Classify pending projects
    const pendingWithAdmin = [];
    const pendingNoAdmin = [];

    // Let's resolve project names
    const allProjectsMap = new Map();
    const liveProjs = await prisma.accProject.findMany({ select: { id: true, name: true } });
    const dcProjs = await prisma.accDcProject.findMany({ select: { id: true, name: true } });
    liveProjs.forEach(p => allProjectsMap.set(p.id, p.name));
    dcProjs.forEach(p => allProjectsMap.set(p.id, p.name));

    pendingIds.forEach(id => {
      const name = allProjectsMap.get(id) || "Unknown Project Name";
      if (adminProjectIds.has(id)) {
        pendingWithAdmin.push({ id, name });
      } else {
        pendingNoAdmin.push({ id, name });
      }
    });

    console.log("=========================================");
    console.log("     PROJECT EXTRACTION STATUS SUMMARY   ");
    console.log("=========================================");
    console.log(`Total Unique Projects registered  : ${unionProjIds.length}`);
    console.log(`  - In Live Relational DB         : ${liveCount}`);
    console.log(`  - In Data Connector Snapshots  : ${dcCount}`);
    console.log(`Already Extracted / Backfilled    : ${backfilledCount}`);
    console.log(`Total Pending Extractions         : ${pendingIds.length}`);

    console.log("\n=========================================");
    console.log("     AUTHORIZATION (LUIS PROJECT ADMIN)  ");
    console.log("=========================================");
    if (authError) {
      console.log(`⚠️ Warning: Could not verify Autodesk authorizations: ${authError}`);
      console.log(`Total Pending: ${pendingIds.length}`);
    } else {
      console.log(`Pending & Authorized (Luis Admin) : ${pendingWithAdmin.length}`);
      console.log(`Pending & Restricted (No Admin)   : ${pendingNoAdmin.length}`);
      
      if (pendingWithAdmin.length > 0) {
        console.log(`\nAuthorized Pending Projects (${pendingWithAdmin.length}):`);
        pendingWithAdmin.forEach((p, idx) => {
          console.log(`  ${idx + 1}. [${p.id}] ${p.name}`);
        });
      } else {
        console.log("\n✅ Perfect! There are ZERO pending authorized projects! All authorized projects have been extracted!");
      }
    }
    console.log("=========================================");

  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
