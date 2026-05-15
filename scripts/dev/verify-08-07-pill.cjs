#!/usr/bin/env node
/**
 * scripts/dev/verify-08-07-pill.cjs — Phase 08-07 behavior harness.
 *
 * Per plan 08-07 Task 2 verifier spec, asserts:
 *   1. `npx tsc --noEmit` exits 0.
 *   2. `npx eslint` of the two touched files exits 0.
 *   3. SyncFreshnessPill.tsx queries getDcIngestStatus AND reads >= 2 of the
 *      promised result fields (lastSuccessAt, lastRunStatus, nextRunInHours,
 *      quotaUsedToday, diffSummary).
 *   4. SyncFreshnessPill.tsx wires signIn('autodesk', ...) AND that call is
 *      gated by tokenExpired (either the check precedes the call within 400
 *      chars, or the call precedes the check within 200 chars — the latter
 *      tolerates a one-line guarded ternary).
 *   5. UsersDirectoryClient.tsx defines MODULE_BADGE_COLORS AND looks it up
 *      using `service` as the key.
 *
 * Each failure prints a descriptive message and exits non-zero so the GSD
 * executor surface can pin the regression.
 *
 * NOTE: spawnSync is used over execSync to avoid the shell — all argv tokens
 * are hard-coded constants in this file, no user input ever flows in.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const isWin = process.platform === "win32";
const NPX = isWin ? "npx.cmd" : "npx";

function fail(msg) {
  console.error(`[verify-08-07-pill] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[verify-08-07-pill] OK   ${msg}`);
}

function readFile(rel) {
  const full = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(full)) fail(`missing file ${rel}`);
  return fs.readFileSync(full, "utf8");
}

function run(cmd, args) {
  // Windows .cmd shims (npx.cmd, eslint.cmd) require shell:true to spawn.
  // Args here are hard-coded constants in this file — no user input flows in,
  // so the shell:true escape hatch does not introduce injection risk.
  return spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    shell: isWin,
  });
}

// 1. tsc --noEmit
{
  const r = run(NPX, ["tsc", "--noEmit"]);
  if (r.status !== 0) {
    fail(`tsc --noEmit failed:\n${r.stdout || ""}\n${r.stderr || ""}`);
  }
  ok("tsc --noEmit");
}

// 2. eslint of the two key files
{
  const r = run(NPX, [
    "eslint",
    "components/layout/SyncFreshnessPill.tsx",
    "app/(dashboard)/users/UsersDirectoryClient.tsx",
  ]);
  if (r.status !== 0) {
    fail(`eslint failed:\n${r.stdout || ""}\n${r.stderr || ""}`);
  }
  ok("eslint clean");
}

// 3a. SyncFreshnessPill reads getDcIngestStatus
const pill = readFile("components/layout/SyncFreshnessPill.tsx");

if (!/trpc\.accSync\.getDcIngestStatus(\.useQuery)?/.test(pill)) {
  fail(
    "SyncFreshnessPill.tsx must query trpc.accSync.getDcIngestStatus (key_link 1)"
  );
}
ok("getDcIngestStatus query present");

// 3b. >= 2 of the promised DC fields are referenced
const DC_FIELDS = [
  /lastSuccessAt/,
  /lastRunStatus/,
  /nextRunInHours/,
  /quotaUsedToday/,
  /diffSummary/,
];
const dcFieldsHit = DC_FIELDS.filter((re) => re.test(pill)).length;
if (dcFieldsHit < 2) {
  fail(
    `SyncFreshnessPill.tsx must reference >= 2 DC fields from {lastSuccessAt, lastRunStatus, nextRunInHours, quotaUsedToday, diffSummary} - found ${dcFieldsHit}`
  );
}
ok(`DC fields referenced: ${dcFieldsHit}/5`);

// 4. signIn('autodesk', ...) gated by tokenExpired
const SIGN_IN_AUTODESK = /signIn\(['"`]autodesk['"`]/;
if (!SIGN_IN_AUTODESK.test(pill)) {
  fail("SyncFreshnessPill.tsx must call signIn('autodesk', ...) (key_link 2)");
}
const tokenBeforeSignIn = /tokenExpired[\s\S]{0,400}signIn\(['"`]autodesk/;
const signInBeforeToken = /signIn\(['"`]autodesk[\s\S]{0,200}tokenExpired/;
if (!tokenBeforeSignIn.test(pill) && !signInBeforeToken.test(pill)) {
  fail(
    "signIn('autodesk', ...) must be guarded by a tokenExpired check within 400 chars"
  );
}
ok("signIn('autodesk') guarded by tokenExpired");

// 5. MODULE_BADGE_COLORS in UsersDirectoryClient.tsx
const usersDir = readFile("app/(dashboard)/users/UsersDirectoryClient.tsx");
if (!/MODULE_BADGE_COLORS\s*[:=]/.test(usersDir)) {
  fail(
    "UsersDirectoryClient.tsx must declare MODULE_BADGE_COLORS (key_link 3)"
  );
}
if (!/MODULE_BADGE_COLORS\[[^\]]*service[^\]]*\]/.test(usersDir)) {
  fail(
    "UsersDirectoryClient.tsx must look up MODULE_BADGE_COLORS using `service` as the key"
  );
}
ok("MODULE_BADGE_COLORS declared and keyed by service");

console.log("[verify-08-07-pill] ALL ASSERTIONS PASS");
