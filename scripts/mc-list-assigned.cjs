#!/usr/bin/env node
/**
 * READ-ONLY: list the "assigned" clash groups in the target model set — i.e. the
 * clashes that were turned into ACC Issues — plus a status sample of the linked
 * issues. Nothing is written. Grounds the decision about closing/deleting them.
 *
 * Run:  node --env-file=.env scripts/mc-list-assigned.cjs
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

const PROJECT_ID = "13010c62-8128-49a5-a9e1-7e6767735f07";
const MODEL_SET_ID = "36dcdc91-6b98-4f8e-9f0b-521b91cbd69f";
const BASE = "https://developer.api.autodesk.com";
const OUT_DIR = path.join(process.cwd(), "scratch");
const ISSUE_SAMPLE = 15;

async function refreshAndPersistFromDb(scope) {
  const acct = await prisma.account.findFirst({
    where: { provider: "autodesk", user: { email: USER_EMAIL } },
    select: { id: true, refresh_token: true },
  });
  if (!acct?.refresh_token) throw new Error(`No stored Autodesk refresh_token for ${USER_EMAIL}.`);
  const body = new URLSearchParams({
    grant_type: "refresh_token", refresh_token: acct.refresh_token,
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope,
  });
  const res = await fetch(`${BASE}/authentication/v2/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(json)}`);
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

async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function listAssigned(token, containerId) {
  const groups = [];
  let continuationToken = null;
  do {
    const qs = new URLSearchParams({ pageLimit: "100" });
    if (continuationToken) qs.set("continuationToken", continuationToken);
    const url = `${BASE}/bim360/clash/v3/containers/${containerId}/modelsets/${MODEL_SET_ID}/clashes/assigned?${qs}`;
    const { status, ok, body } = await apiGet(url, token);
    if (!ok) throw new Error(`assigned-list failed (${status}): ${JSON.stringify(body).slice(0, 300)}`);
    for (const g of body.groups || []) groups.push(g);
    continuationToken = body.page?.continuationToken || null;
  } while (continuationToken);
  return groups;
}

async function getIssue(token, issueId) {
  const url = `${BASE}/construction/issues/v1/projects/${PROJECT_ID}/issues/${issueId}`;
  const { status, ok, body } = await apiGet(url, token);
  if (!ok) return { issueId, error: `${status}`, detail: (body?.detail || body?.title || "") };
  return {
    issueId, displayId: body.displayId, status: body.status, title: body.title,
    deleted: body.deleted, permittedStatuses: body.permittedStatuses, permittedActions: body.permittedActions,
  };
}

(async () => {
  console.log("ACC Model Coordination — ASSIGNED clashes / generated issues (READ-ONLY)");
  console.log(`  project:   ${PROJECT_ID}`);
  console.log(`  model set: ${MODEL_SET_ID}`);
  console.log("");

  const token = await refreshAndPersistFromDb("data:read");

  // container == project id (verified earlier).
  const groups = await listAssigned(token, PROJECT_ID);
  const issueIds = [...new Set(groups.map((g) => g.issueId).filter(Boolean))];

  console.log("──────────────────────────────────────────────");
  console.log(`ASSIGNED clash groups (turned into issues): ${groups.length}`);
  console.log(`Distinct linked issues:                     ${issueIds.length}`);
  console.log("──────────────────────────────────────────────");

  // Sample the linked issues to learn their current status + what we're allowed to do.
  const sample = [];
  for (const id of issueIds.slice(0, ISSUE_SAMPLE)) sample.push(await getIssue(token, id));

  const statusCounts = {};
  for (const s of sample) {
    if (s.error) { statusCounts[`error ${s.error}`] = (statusCounts[`error ${s.error}`] || 0) + 1; continue; }
    statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
  }

  if (sample.length) {
    console.log(`Issue status (sample of ${sample.length}):`);
    for (const [k, n] of Object.entries(statusCounts)) console.log(`  ${String(n).padStart(4)}  ${k}`);
    const ok = sample.find((s) => !s.error);
    if (ok) {
      console.log("");
      console.log(`Example issue #${ok.displayId} "${(ok.title || "").slice(0, 50)}"`);
      console.log(`  status:            ${ok.status}`);
      console.log(`  permittedStatuses: ${(ok.permittedStatuses || []).join(", ") || "(none)"}`);
      console.log(`  permittedActions:  ${(ok.permittedActions || []).join(", ") || "(none)"}`);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `mc-assigned-${MODEL_SET_ID.slice(0, 8)}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    projectId: PROJECT_ID, modelSetId: MODEL_SET_ID,
    assignedGroupCount: groups.length, distinctIssueCount: issueIds.length,
    groups, issueSample: sample,
  }, null, 2));
  console.log("");
  console.log(`Saved → ${outFile}`);
})()
  .catch((err) => { console.error("error:", err.message || err); process.exit(1); })
  .finally(() => prisma.$disconnect());
