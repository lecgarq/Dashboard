#!/usr/bin/env node
"use strict";

/**
 * scripts/measure-spatial-graph-baseline.cjs
 *
 * Re-runnable Phase-41 orchestrator for the full activity-universe payload,
 * navigation-to-ready, and headed D3D11 frame-rate gates.
 *
 * This script does NOT build or start the server itself — that stays an
 * explicit, owner-visible step (printed below on preflight failure). It only:
 *   1. Preflights that :3100 is already up.
 *   2. Records the measurement conditions (cosmos.gl version, patch presence,
 *      BUILD_ID, commit hash, date).
 *   3. Runs the payload, N=5 navigation, and headed hard-gate Playwright specs.
 *   4. Merges their JSON artifacts with the environment record.
 *
 * Re-run instructions (PowerShell, from repo root):
 *   $env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
 *   $env:NEXT_DIST_DIR=".next-e2e"; Remove-Item Env:ACC_ACTIVITY_TEST_FIXTURE -ErrorAction SilentlyContinue; npx next start -p 3100
 *   node scripts/measure-spatial-graph-baseline.cjs
 */

const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.join(__dirname, "..");
const PREFLIGHT_URL = "http://localhost:3100/login";
const SPEC_NAMES = ["activity-payload", "spatial-graph-baseline", "activity-universe-hard-gate"];
const SPEC_OUTPUTS = {
  payload: path.join(REPO_ROOT, "test-results", "activity-payload.json"),
  navigation: path.join(REPO_ROOT, "test-results", "spatial-graph-baseline.json"),
  hardGate: path.join(REPO_ROOT, "test-results", "activity-universe-hard-gate.json"),
};

const BUILD_INSTRUCTIONS = `
:3100 is not responding. This script does not build/start the server itself
(kept side-effect free). Run these first, from the repo root (PowerShell):

  $env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
  $env:NEXT_DIST_DIR=".next-e2e"; Remove-Item Env:ACC_ACTIVITY_TEST_FIXTURE -ErrorAction SilentlyContinue; npx next start -p 3100

Then re-run: node scripts/measure-spatial-graph-baseline.cjs
`;

async function preflight() {
  try {
    await fetch(PREFLIGHT_URL, { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

function recordEnvironment() {
  const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
  const cosmosGlVersion = pkg.dependencies?.["@cosmos.gl/graph"] ?? null;
  const patchPath = path.join(REPO_ROOT, "patches", "@cosmos.gl+graph+3.3.0.patch");
  const buildIdPath = path.join(REPO_ROOT, ".next-e2e", "BUILD_ID");
  const buildId = existsSync(buildIdPath) ? readFileSync(buildIdPath, "utf8").trim() : null;
  const commit = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  }).stdout.trim();

  return {
    cosmosGlVersion,
    cosmosGlPatchApplied: existsSync(patchPath),
    buildId,
    commit,
    date: new Date().toISOString(),
  };
}

function runPlaywright() {
  const result = spawnSync(
    "npx",
    ["playwright", "test", ...SPEC_NAMES, "--config", "playwright.verify.config.ts"],
    { stdio: "inherit", cwd: REPO_ROOT, shell: process.platform === "win32" },
  );
  return result.status === 0;
}

async function main() {
  const up = await preflight();
  if (!up) {
    console.error(BUILD_INSTRUCTIONS);
    process.exit(1);
    return;
  }

  const environment = recordEnvironment();
  const ok = runPlaywright();
  if (!ok) {
    console.error("[measure-spatial-graph-baseline] Playwright spec failed — see output above.");
    process.exit(1);
    return;
  }

  for (const output of Object.values(SPEC_OUTPUTS)) {
    if (!existsSync(output)) {
      console.error(`[measure-spatial-graph-baseline] Expected spec output not found: ${output}`);
      process.exit(1);
      return;
    }
  }

  const merged = {
    ...environment,
    payload: JSON.parse(readFileSync(SPEC_OUTPUTS.payload, "utf8")),
    navigation: JSON.parse(readFileSync(SPEC_OUTPUTS.navigation, "utf8")),
    hardGate: JSON.parse(readFileSync(SPEC_OUTPUTS.hardGate, "utf8")),
  };

  console.log("\n=== ACTIVITY UNIVERSE GATE RESULT (merged) ===");
  console.log(JSON.stringify(merged, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
