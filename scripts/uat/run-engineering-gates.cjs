#!/usr/bin/env node
/**
 * run-engineering-gates.cjs
 *
 * Phase 7 Pre-Workshop UAT — Engineering Gate Wrapper
 * ====================================================
 * Runs every scriptable engineering gate in order and writes a single
 * pass/fail report to .planning/phases/07-pre-workshop-uat/UAT-REPORT.md.
 *
 * Usage:
 *   node scripts/uat/run-engineering-gates.cjs
 *   node scripts/uat/run-engineering-gates.cjs --static-only
 *
 * Gates (in order):
 *   1. npx tsc --noEmit          — full tree typecheck including test files
 *   2. npm run repo-map:check    — ratchet: no new fetch/effect/Prisma-in-UI
 *   3. git diff boundary grep    — zero files under users/access-analysis/
 *   4. GraphCanvas grep          — no conditional mount in the four UAT pages
 *   5. Playwright UAT run        — live browser gates against :3100 (skipped
 *                                  with --static-only or when :3100 not running)
 *
 * INLINE FIX-AND-RE-RUN LOOP (decision e from uat-helpers.ts)
 * ============================================================
 * When any gate fails:
 *   1. The wrapper exits non-zero and prints the exact failing gate + re-run command.
 *   2. The executor reads the failing gate and fixes the defect inline.
 *   3. ABSOLUTE BOUNDARY: if the fix would touch any file under
 *      app/(dashboard)/users/access-analysis/ — STOP and surface the blocker.
 *      Never patch the spatial-graph to make a gate pass. This boundary is
 *      enforced by Gate 3 (boundary diff) itself.
 *   4. The executor re-runs ONLY the failing gate's command to green.
 *   5. The executor re-runs this full wrapper for a clean all-green report.
 *
 * Cosmetic-only findings are logged in the Defects table as severity=COSMETIC
 * status=NOTED and do NOT block the phase. Engineering gate failures are
 * absolute — they MUST reach green before Phase 7 sign-off.
 *
 * IMPORTANT: This wrapper NEVER runs `npm run build`. The build/serve is the
 * owner's job (plan 07-02), honoring the do-not-build-while-:3000-is-live
 * hazard documented in RESEARCH Q5/Pitfall 7. It assumes :3100 is already
 * serving the production build when Gate 5 (Playwright) runs.
 */

"use strict";

const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(
  REPO_ROOT,
  ".planning/phases/07-pre-workshop-uat/UAT-REPORT.md",
);
const STATIC_ONLY = process.argv.includes("--static-only");
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

// ---------------------------------------------------------------------------
// Gate runner
// ---------------------------------------------------------------------------

/**
 * @typedef {{ gate: string, command: string, result: 'PASS'|'FAIL'|'BLOCKED', notes: string, rerunCmd: string }} GateResult
 */

/**
 * Run a shell command synchronously. Returns { ok, stdout, stderr, durationMs }.
 * Never throws — captures the exception into stderr.
 *
 * @param {string} command
 * @param {number} timeoutMs
 * @returns {{ ok: boolean, stdout: string, stderr: string, durationMs: number }}
 */
function runGate(command, timeoutMs) {
  const start = Date.now();
  try {
    const out = execSync(command, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, stdout: out ?? "", stderr: "", durationMs: Date.now() - start };
  } catch (/** @type {any} */ err) {
    return {
      ok: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Check whether :3100 is serving by making a quick HTTP HEAD request.
 * Returns true if a response (any status) comes back within 3 s.
 * @returns {Promise<boolean>}
 */
async function isServerLive() {
  return new Promise((resolve) => {
    const http = require("http");
    const parsed = new URL(E2E_BASE_URL);
    const req = http.request(
      { hostname: parsed.hostname, port: parsed.port || 3100, path: "/", method: "HEAD", timeout: 3000 },
      () => { req.destroy(); resolve(true); },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=".repeat(60));
  console.log("Phase 7 UAT Engineering Gates");
  console.log(`Mode: ${STATIC_ONLY ? "static-only (skip Playwright)" : "full"}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  /** @type {GateResult[]} */
  const results = [];
  let failCount = 0;

  // -------------------------------------------------------------------------
  // Gate 1: tsc-0
  // -------------------------------------------------------------------------
  console.log("\n[1/5] Gate: npx tsc --noEmit ...");
  const tscResult = runGate("npx tsc --noEmit 2>&1", 120_000);
  {
    const ok = tscResult.ok;
    if (!ok) failCount++;
    const notes = ok
      ? "Full tree (incl. test files) typechecks clean"
      : `FAILED:\n${(tscResult.stderr || tscResult.stdout).slice(0, 500)}`;
    results.push({
      gate: "tsc-0",
      command: "`npx tsc --noEmit`",
      result: ok ? "PASS" : "FAIL",
      notes,
      rerunCmd: "npx tsc --noEmit",
    });
    console.log(`  -> ${ok ? "PASS" : "FAIL"} (${tscResult.durationMs}ms)`);
    if (!ok) console.error("  tsc stderr:", tscResult.stderr.slice(0, 300));
  }

  // -------------------------------------------------------------------------
  // Gate 2: repo-map:check
  // -------------------------------------------------------------------------
  console.log("\n[2/5] Gate: npm run repo-map:check ...");
  const repoMapResult = runGate("npm run repo-map:check 2>&1", 300_000);
  {
    const ok = repoMapResult.ok;
    if (!ok) failCount++;
    const notes = ok
      ? "No new fetch/effect/Prisma-in-UI regressions"
      : `FAILED:\n${(repoMapResult.stderr || repoMapResult.stdout).slice(0, 500)}`;
    results.push({
      gate: "repo-map:check",
      command: "`npm run repo-map:check`",
      result: ok ? "PASS" : "FAIL",
      notes,
      rerunCmd: "npm run repo-map:check",
    });
    console.log(`  -> ${ok ? "PASS" : "FAIL"} (${repoMapResult.durationMs}ms)`);
    if (!ok) console.error("  stderr:", repoMapResult.stderr.slice(0, 300));
  }

  // -------------------------------------------------------------------------
  // Gate 3: boundary diff — Phase 7 commits must not touch users/access-analysis/
  // -------------------------------------------------------------------------
  // Context: this feature branch (feat/access-analysis-redesign) accumulated 253+
  // users/access-analysis/ files in its history from Phases 1-6. The gate must
  // check only whether Phase 7 plan work (commits prefixed "07-") touches the
  // spatial-graph directory — not the full branch history vs origin/deploy.
  //
  // Implementation: list files changed by any commit whose message starts with
  // a Phase 7 marker ("07-" or "docs(07)" or "feat(07-" or "chore(07-").
  // Also validate the three files this plan creates are exactly what was committed.
  console.log("\n[3/5] Gate: boundary diff (users/access-analysis/) ...");
  const diffResult = runGate(
    "git log --oneline --format=\"%H %s\" HEAD | grep -E \"(07-|docs\\(07\\)|feat\\(07-|chore\\(07-)\" | awk '{print $1}' 2>&1 || true",
    30_000,
  );
  {
    // Get list of Phase 7 commit hashes
    const phase7Hashes = (diffResult.stdout || "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length === 40 || l.length === 7); // full or short SHA

    let spatialFiles = [];
    if (phase7Hashes.length > 0) {
      // Check files changed in those commits
      const showResult = runGate(
        `git show --name-only --format="" ${phase7Hashes.join(" ")} 2>&1 || true`,
        30_000,
      );
      spatialFiles = (showResult.stdout || "")
        .split("\n")
        .filter((f) => f.includes("users/access-analysis/"));
    }

    // Additionally check the files staged/committed in THIS plan run specifically
    // (the three files: uat-helpers.ts, uat-workshop.spec.ts, run-engineering-gates.cjs)
    const thisPlanFiles = runGate(
      "git show --name-only --format=\"\" HEAD HEAD~1 HEAD~2 2>&1 | grep users/access-analysis/ || true",
      15_000,
    );
    const recentSpatial = (thisPlanFiles.stdout || "")
      .split("\n")
      .filter((f) => f.includes("users/access-analysis/"));
    const allSpatial = [...new Set([...spatialFiles, ...recentSpatial])];

    const ok = allSpatial.length === 0;
    if (!ok) failCount++;
    const notes = ok
      ? "Phase 7 commits touch zero files under users/access-analysis/ (spatial-graph boundary intact)"
      : `BOUNDARY VIOLATION: ${allSpatial.length} file(s) under users/access-analysis/ found in Phase 7 commits:\n${allSpatial.slice(0, 10).join("\n")}`;
    results.push({
      gate: "boundary diff",
      command: "`git log --oneline HEAD | grep 07- | xargs git show --name-only | grep users/access-analysis/`",
      result: ok ? "PASS" : "FAIL",
      notes,
      rerunCmd: "git show --name-only --format=\"\" HEAD HEAD~1 HEAD~2 | grep users/access-analysis/",
    });
    console.log(`  -> ${ok ? "PASS" : "FAIL"} (${allSpatial.length} spatial files in Phase 7 commits)`);
    if (!ok) console.error("  Spatial files:", allSpatial.join(", "));
  }

  // -------------------------------------------------------------------------
  // Gate 4: GraphCanvas grep
  // -------------------------------------------------------------------------
  console.log("\n[4/5] Gate: GraphCanvas grep (four UAT page dirs) ...");
  const grepCmd = [
    "grep -rn GraphCanvas",
    "app/(dashboard)/users/UsersDirectoryClient.tsx",
    "app/(dashboard)/access-analysis/",
    "app/(dashboard)/template-mty/",
    "app/(dashboard)/forma-proposal/",
    "2>&1 || true",
  ].join(" ");
  const grepResult = runGate(grepCmd, 30_000);
  {
    const hits = (grepResult.stdout || "")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("grep"));
    const ok = hits.length === 0;
    if (!ok) failCount++;
    const notes = ok
      ? "No conditional GraphCanvas mount in any of the four UAT page directories"
      : `CONDITIONAL MOUNT FOUND:\n${hits.slice(0, 10).join("\n")}`;
    results.push({
      gate: "GraphCanvas grep",
      command: "`grep -rn GraphCanvas <four UAT page dirs>`",
      result: ok ? "PASS" : "FAIL",
      notes,
      rerunCmd: `grep -rn "GraphCanvas" app/\\(dashboard\\)/users/UsersDirectoryClient.tsx app/\\(dashboard\\)/access-analysis/ app/\\(dashboard\\)/template-mty/ app/\\(dashboard\\)/forma-proposal/`,
    });
    console.log(`  -> ${ok ? "PASS" : "FAIL"} (${hits.length} hit(s))`);
    if (!ok) console.error("  Hits:", hits.join(" | "));
  }

  // -------------------------------------------------------------------------
  // Gate 5: Playwright UAT run
  // -------------------------------------------------------------------------
  console.log("\n[5/5] Gate: Playwright UAT spec against :3100 ...");
  /** @type {GateResult} */
  let playwrightGate;

  if (STATIC_ONLY) {
    playwrightGate = {
      gate: "Playwright UAT",
      command: "`E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts`",
      result: "BLOCKED",
      notes: "Skipped: --static-only flag passed. Run without --static-only after the owner builds and starts :3100.",
      rerunCmd: "E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts",
    };
    console.log("  -> BLOCKED (--static-only)");
  } else {
    // Check if :3100 is live
    const serverLive = await isServerLive();
    if (!serverLive) {
      playwrightGate = {
        gate: "Playwright UAT",
        command: "`E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts`",
        result: "BLOCKED",
        notes: "BLOCKED: build/serve runbook (07-02) not yet run. Start the production build on :3100 first (see 07-02-PLAN.md), then re-run this wrapper.",
        rerunCmd: "E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts",
      };
      console.log("  -> BLOCKED (:3100 not serving -- run 07-02 runbook first)");
    } else {
      console.log("  :3100 is live, running Playwright ...");
      const pwCmd = `E2E_BASE_URL=${E2E_BASE_URL} npx playwright test uat-workshop --config playwright.verify.config.ts 2>&1`;
      const pwResult = runGate(pwCmd, 600_000);
      const ok = pwResult.ok;
      if (!ok) failCount++;
      const notesText = ok
        ? "All 38 UAT tests passed against production build on :3100"
        : `${(pwResult.stderr || pwResult.stdout).slice(0, 800)}`;
      playwrightGate = {
        gate: "Playwright UAT",
        command: "`E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts`",
        result: ok ? "PASS" : "FAIL",
        notes: notesText,
        rerunCmd: `E2E_BASE_URL=${E2E_BASE_URL} npx playwright test uat-workshop --config playwright.verify.config.ts`,
      };
      console.log(`  -> ${ok ? "PASS" : "FAIL"}`);
      if (!ok) console.error("  stdout tail:", pwResult.stdout.slice(-400));
    }
  }
  results.push(playwrightGate);

  // -------------------------------------------------------------------------
  // Write UAT-REPORT.md
  // -------------------------------------------------------------------------
  const now = new Date().toISOString().split("T")[0];
  const staticPassed = results.slice(0, 4).every((r) => r.result === "PASS");
  const allGreen = results.every((r) => r.result === "PASS");
  const blocked = results.some((r) => r.result === "BLOCKED");

  const statusLine = allGreen
    ? "ALL-GREEN"
    : blocked
    ? `STATIC-GATES-${staticPassed ? "GREEN" : "FAIL"} / PLAYWRIGHT-BLOCKED`
    : `FAILED (${failCount} gate(s) failing)`;

  const engineeringTable = results
    .map((r) => `| ${r.gate} | ${r.command} | **${r.result}** | ${r.notes.replace(/\n/g, " ")} |`)
    .join("\n");

  const failingGates = results.filter((r) => r.result === "FAIL");
  const rerunSection =
    failingGates.length > 0
      ? `## Re-Run Commands for Failing Gates\n\n${failingGates.map((r) => `- **${r.gate}:** \`${r.rerunCmd}\``).join("\n")}\n`
      : "";

  const report = `# UAT Report -- Phase 7 Pre-Workshop

**Date:** ${now}
**Status:** ${statusLine}
**Build:** Production build served on :3100 (\`next start --port 3100\`)
**Static gates run by:** \`node scripts/uat/run-engineering-gates.cjs --static-only\`
**Full run (after 07-02 server up):** \`node scripts/uat/run-engineering-gates.cjs\`

---

## Engineering Gates

| Gate | Command | Result | Notes |
|------|---------|--------|-------|
${engineeringTable}

---

## Per-Page Gate Results

*Populated by the Playwright run (Gate 5). Requires :3100 to be serving the production build.*
*Run: \`E2E_BASE_URL=http://localhost:3100 npx playwright test uat-workshop --config playwright.verify.config.ts\`*

### /users

| Gate | Result |
|------|--------|
| PERF-01: page loads (table visible) | _pending Playwright run_ |
| PERF-03/04: tRPC fetch-once, no duplicate procedure batches | _pending_ |
| PERF-05: canvas count <= 1 (HeaderParticleAccent) | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light (axe-core) | _pending_ |
| THM-01: WCAG AA contrast dark (axe-core) | _pending_ |
| INT-03: table row -> DrillSheet opens | _pending_ |
| INT-03: DataTable expand affordance toggles | _pending_ |

### /access-analysis

| Gate | Result |
|------|--------|
| PERF-01: page loads (h1 + role-legend visible) | _pending_ |
| PERF-03: zero POST /api/trpc (RSC page) | _pending_ |
| PERF-05: canvas count = 0 (ECharts = SVG) | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light | _pending_ |
| THM-01: WCAG AA contrast dark | _pending_ |
| INT-02: role-legend click -> role-drilldown (inline PeopleDrillList) | _pending_ |
| INT-01: view-people-role -> people-sheet DrillSheet | _pending_ |
| ACC-03: terrain-expand aria-expanded toggles | _pending_ |
| lazy clash drill-down: coordination row aria-expanded | _pending_ |
| INT-04/INT-05: slice filter -> FilterBanner + filter-clear | _pending_ |

### /template-mty

| Gate | Result |
|------|--------|
| PERF-01: page loads (h1 + members table rows) | _pending_ |
| PERF-03: zero POST /api/trpc (RSC page) | _pending_ |
| PERF-05: canvas count = 0 initial load | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light | _pending_ |
| THM-01: WCAG AA contrast dark | _pending_ |
| INT-03: members table row -> AuthorProfileDrawer | _pending_ |
| TPL-02: RoleSimilarityGraph node -> RoleOverviewSheet dialog | _pending_ |
| terrain-expand: expand/collapse cycle | _pending_ |

### /forma-proposal

| Gate | Result |
|------|--------|
| PERF-01: page loads (VDC Specialist visible) | _pending_ |
| PERF-03: zero POST /api/trpc (RSC page) | _pending_ |
| PERF-05: canvas count <= 1 before + after role selection | _pending_ |
| reduced-motion + 1280px no overflow | _pending_ |
| THM-01: WCAG AA contrast light | _pending_ |
| THM-01: WCAG AA contrast dark | _pending_ |
| drill smoke: assign role, tier, reload persists, export JSON | _pending_ |

---

## Screenshots

*Attached to the Playwright HTML report at \`playwright-report/\`.*
*Per-page screenshots captured by uatScreenshot() in each test.*

Expected attachments (after Playwright run):
- users-light, users-dark
- access-analysis-light, access-analysis-dark, access-analysis-role-drilldown, access-analysis-people-sheet, access-analysis-terrain-expanded, access-analysis-coord-expanded
- template-mty-light, template-mty-dark, template-mty-profile-drawer, template-mty-role-sheet, template-mty-terrain-expanded
- forma-proposal-light, forma-proposal-dark, forma-proposal-canvas-check, forma-proposal-tier-set, forma-proposal-export

---

${rerunSection}
## Defects Found

| # | Page | Severity | Description | Status |
|---|------|----------|-------------|--------|
| — | — | — | No defects recorded yet (populate after full Playwright run) | — |

---

## Owner Perceptual Checklist (Live Projector Pass)

**Instructions:** Run on secondary display at projector-reduced brightness (1280px).
Both light and dark (zinc) themes. Mark each:
- PASS = looks great on the projector
- BLOCK = broken in the room (invisible/illegible label, clipped modal, horizontal overflow, page error, drill does not open)
- COSMETIC = nit, ships as-is

### /users
- [ ] No horizontal overflow at 1280px
- [ ] Data labels legible at projector brightness (both themes)
- [ ] Table rows crisp -- sticky header visible, density toggle works
- [ ] Row click -> DrillSheet slides in smoothly (<=200ms, directional)
- [ ] Motion fires only on mount, not on filter changes
- [ ] No clipped modals or panels

### /access-analysis
- [ ] KPIs + donuts load first (streaming, not one big load)
- [ ] Donut legend click -> inline people drill (PeopleDrillList appears)
- [ ] "View N people" button -> DrillSheet slides in
- [ ] Terrain "Show" button -> terrain mounts, interactive (3D orbit + zoom)
- [ ] Coordination row expand -> lazy clash data loads
- [ ] Filter banner visible when project selected, Clear works
- [ ] Cross-filter updates all panels without page navigation
- [ ] No horizontal overflow at 1280px

### /template-mty
- [ ] Members table loads, search works, row click -> profile drawer
- [ ] Role-similarity graph settles + node click -> RoleOverviewSheet
- [ ] Terrain expand works

### /forma-proposal
- [ ] Role rail loads (VDC Specialist visible)
- [ ] Click role -> folder tree updates
- [ ] Set tier -> tier chip updates
- [ ] Reload -> draft persists
- [ ] Export JSON downloads
- [ ] R3F particle accent visible but subtle (z-0, opacity 0.18)
- [ ] No clipped modals at 1280px

### GPU Observation (owner, DevTools -> chrome://gpu or Memory tab)
- [ ] GPU memory stays below 400MB across all four pages
- [ ] /users HeaderParticleAccent canvas count = 1 (not more)
- [ ] /forma-proposal FormaParticleAccent canvas count = 1 (not more)

---

*Generated by \`node scripts/uat/run-engineering-gates.cjs\`*
*Phase 7 Pre-Workshop UAT -- LECG Dashboard*
`;

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\nReport written: ${REPORT_PATH}`);

  // -------------------------------------------------------------------------
  // Final summary
  // -------------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  if (allGreen) {
    console.log("ALL-GREEN -- all engineering gates passed.");
  } else if (blocked) {
    const staticStatus = staticPassed ? "ALL PASS" : "SOME FAILING";
    console.log(`STATIC GATES: ${staticStatus}`);
    console.log("PLAYWRIGHT: BLOCKED -- start :3100 (07-02 runbook) then re-run.");
    if (!staticPassed) {
      console.log(`\nFAILING GATES (${failCount}):`);
      for (const r of failingGates) {
        console.log(`  - ${r.gate}`);
        console.log(`    Re-run: ${r.rerunCmd}`);
      }
    }
  } else {
    console.log(`FAILED -- ${failCount} gate(s) failing.`);
    console.log("\nFailing gates and re-run commands:");
    for (const r of failingGates) {
      console.log(`  - ${r.gate}`);
      console.log(`    Re-run: ${r.rerunCmd}`);
    }
  }
  console.log("=".repeat(60));

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Wrapper error:", err);
  process.exit(1);
});
