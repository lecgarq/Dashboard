#!/usr/bin/env node
/**
 * Reactivate "assigned" clashes (clashes turned into ACC Issues) in the target
 * model set by closing or (soft-)deleting their linked issues.
 *
 * There is no documented "un-assign clash" API, so we VERIFY empirically: after
 * acting on an issue we re-list /clashes/assigned and check whether that clash
 * group left the Assigned bucket (the proxy for "returned to Active").
 *
 * Modes:
 *   (no flag)            DRY RUN — list assigned groups + linked issue count. No writes.
 *   --test               Close the FIRST assigned issue, then verify (experiment step 1).
 *   --close   <issueId>  Close one specific issue, then verify.
 *   --delete  <issueId>  Soft-delete one specific issue, then verify (experiment step 2).
 *   --all-close          Close ALL assigned issues (batch).
 *   --all-delete         Soft-delete ALL assigned issues (batch).
 *
 * Run:  node --env-file=.env scripts/mc-reactivate-assigned.cjs            (dry run)
 *       node --env-file=.env scripts/mc-reactivate-assigned.cjs --test
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

// Always refresh with the dashboard's full scope set (+data:write) so we never
// narrow the stored token. The refresh_token already carries this full grant.
const FULL_SCOPE = "openid data:read data:write data:create viewables:read user:read account:read";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const argValue = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };

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
  // Only fail if the response EXPLICITLY reports a scope without data:write.
  // (APS often omits `scope` on refresh even though the token is correctly scoped.)
  if (scope.includes("data:write") && typeof json.scope === "string" && json.scope && !/\bdata:write\b/.test(json.scope)) {
    throw new Error(`Refreshed token lacks data:write (got: ${json.scope}). Re-run scripts/aps-login.cjs.`);
  }
  return json.access_token;
}

async function apiGet(url, token) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, body };
}

async function apiPatchIssue(issueId, token, patch) {
  const url = `${BASE}/construction/issues/v1/projects/${PROJECT_ID}/issues/${issueId}`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const text = await res.text();
    let body; try { body = JSON.parse(text); } catch { body = text; }
    if (res.status === 429) { await sleep((Number(res.headers.get("retry-after")) || 5) * 1000); continue; }
    return { status: res.status, ok: res.ok, body };
  }
  return { status: 429, ok: false, body: "rate limited (retries exhausted)" };
}

async function listAssigned(token) {
  const groups = [];
  let continuationToken = null;
  do {
    const qs = new URLSearchParams({ pageLimit: "100" });
    if (continuationToken) qs.set("continuationToken", continuationToken);
    const url = `${BASE}/bim360/clash/v3/containers/${PROJECT_ID}/modelsets/${MODEL_SET_ID}/clashes/assigned?${qs}`;
    const { ok, status, body } = await apiGet(url, token);
    if (!ok) throw new Error(`assigned-list failed (${status}): ${JSON.stringify(body).slice(0, 200)}`);
    for (const g of body.groups || []) groups.push(g);
    continuationToken = body.page?.continuationToken || null;
  } while (continuationToken);
  return groups;
}

async function getIssue(token, issueId) {
  const { ok, status, body } = await apiGet(`${BASE}/construction/issues/v1/projects/${PROJECT_ID}/issues/${issueId}`, token);
  return ok ? body : { error: status, detail: body?.detail || body?.title };
}

function patchFor(action) {
  return action === "delete" ? { deleted: true } : { status: "closed" };
}

async function actOnOneAndVerify(token, issueId, action) {
  const before = await getIssue(token, issueId);
  const groupsBefore = await listAssigned(token);
  const myGroups = groupsBefore.filter((g) => g.issueId === issueId).map((g) => g.id);

  console.log("");
  console.log(`Acting on issue ${issueId}:`);
  if (!before.error) console.log(`  #${before.displayId} "${(before.title || "").slice(0, 60)}"  status=${before.status}`);
  console.log(`  linked clash group(s): ${myGroups.join(", ") || "(none found in assigned list)"}`);
  console.log(`  action: ${action.toUpperCase()}  (patch ${JSON.stringify(patchFor(action))})`);

  const r = await apiPatchIssue(issueId, token, patchFor(action));
  if (!r.ok) {
    console.error(`  ✗ ${action} failed (${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`);
    return { ok: false };
  }
  console.log(`  ✓ ${action} succeeded (${r.status}); issue status now: ${r.body?.status}${r.body?.deleted ? " (deleted)" : ""}`);

  await sleep(3000); // let the clash service catch up
  const groupsAfter = await listAssigned(token);
  const stillAssigned = groupsAfter.some((g) => myGroups.includes(g.id));
  console.log("");
  console.log(`  Assigned groups: ${groupsBefore.length} → ${groupsAfter.length}`);
  console.log(stillAssigned
    ? `  ⚠ that clash group is STILL in the Assigned bucket — this action did NOT reactivate it.`
    : `  ✓ that clash group LEFT the Assigned bucket — it should now be back in Active.`);
  return { ok: true, stillAssigned, groupIds: myGroups, displayId: before.displayId, title: before.title };
}

async function batch(token, issueIds, action) {
  console.log(`Batch ${action.toUpperCase()} on ${issueIds.length} issue(s) …`);
  const results = [];
  let ok = 0;
  for (let i = 0; i < issueIds.length; i++) {
    const r = await apiPatchIssue(issueIds[i], token, patchFor(action));
    const good = r.ok;
    if (good) ok++;
    results.push({ issueId: issueIds[i], status: r.status, ok: good, error: good ? null : r.body });
    if ((i + 1) % 10 === 0 || i === issueIds.length - 1) console.log(`  ${i + 1}/${issueIds.length}  (ok=${ok})`);
    if (!good && (r.status === 401 || r.status === 403)) {
      console.error(`  ✗ auth/permission error — aborting. ${JSON.stringify(r.body).slice(0, 200)}`);
      break;
    }
    await sleep(150);
  }

  console.log("→ verifying (waiting 5s) …");
  await sleep(5000);
  const remaining = await listAssigned(token);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const logFile = path.join(OUT_DIR, `mc-reactivate-${action}-${MODEL_SET_ID.slice(0, 8)}.json`);
  fs.writeFileSync(logFile, JSON.stringify({ action, attempted: issueIds.length, ok, remainingAssigned: remaining.length, results }, null, 2));

  console.log("");
  console.log("──────────────────────────────────────────────");
  console.log(`${action.toUpperCase()}  attempted: ${issueIds.length}   succeeded: ${ok}`);
  console.log(`Assigned clash groups remaining: ${remaining.length}`);
  console.log("──────────────────────────────────────────────");
  console.log(`Log → ${logFile}`);
}

(async () => {
  const token = await refreshAndPersistFromDb(FULL_SCOPE);

  if (process.argv.includes("--test")) {
    const groups = await listAssigned(token);
    if (!groups.length) { console.log("No assigned clashes to test."); return; }
    const issueId = groups[0].issueId;
    console.log("EXPERIMENT — closing ONE issue and verifying.");
    const res = await actOnOneAndVerify(token, issueId, "close");
    console.log("");
    console.log("Next:");
    console.log(`  • Check ACC: is issue #${res.displayId} now Closed, and is its clash back in the Active list?`);
    if (res.stillAssigned) console.log(`  • Closing didn't reactivate it. To try delete on this same issue:\n      node --env-file=.env scripts/mc-reactivate-assigned.cjs --delete ${issueId}`);
    else console.log(`  • If it looks right, batch the rest:\n      node --env-file=.env scripts/mc-reactivate-assigned.cjs --all-close`);
    return;
  }

  if (process.argv.includes("--close")) { await actOnOneAndVerify(token, argValue("--close"), "close"); return; }
  if (process.argv.includes("--delete")) { await actOnOneAndVerify(token, argValue("--delete"), "delete"); return; }

  if (process.argv.includes("--all-close") || process.argv.includes("--all-delete")) {
    const action = process.argv.includes("--all-delete") ? "delete" : "close";
    const groups = await listAssigned(token);
    const issueIds = [...new Set(groups.map((g) => g.issueId).filter(Boolean))];
    await batch(token, issueIds, action);
    return;
  }

  // Default: dry run.
  const groups = await listAssigned(token);
  const issueIds = [...new Set(groups.map((g) => g.issueId).filter(Boolean))];
  console.log("DRY RUN (read-only)");
  console.log(`  assigned clash groups: ${groups.length}`);
  console.log(`  distinct linked issues: ${issueIds.length}`);
  console.log("  Use --test to safely close one and verify, then --all-close / --all-delete.");
})()
  .catch((err) => { console.error("error:", err.message || err); process.exit(1); })
  .finally(() => prisma.$disconnect());
