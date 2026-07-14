#!/usr/bin/env node
"use strict";

/**
 * scripts/measure-spatial-graph-baseline.cjs
 *
 * Re-runnable orchestrator for the /users/spatial-graph first-paint /
 * time-to-graph-rendered baseline (Phase 24, PERF-04). Phase 28 re-runs this
 * SAME script against the same isolated :3100 prod-build mechanism, so the
 * no-regression comparison stays apples-to-apples.
 *
 * This script does NOT build or start the server itself — that stays an
 * explicit, owner-visible step (printed below on preflight failure). It only:
 *   1. Preflights that :3100 is already up.
 *   2. Records the measurement conditions (cosmos.gl version, patch presence,
 *      BUILD_ID, commit hash, date).
 *   3. Runs the Playwright spec that performs the actual N=5 measured loads.
 *   4. Merges the spec's JSON output with the environment record and prints
 *      the final JSON block (24-BASELINE.md is written from this).
 *
 * Re-run instructions (PowerShell, from repo root):
 *   $env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
 *   $env:NEXT_DIST_DIR=".next-e2e"; npx next start -p 3100
 *   node scripts/measure-spatial-graph-baseline.cjs
 */

const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.join(__dirname, "..");
const PREFLIGHT_URL = "http://localhost:3100/login";
const SPEC_NAME = "spatial-graph-baseline";
const SPEC_OUTPUT = path.join(REPO_ROOT, "test-results", "spatial-graph-baseline.json");

const BUILD_INSTRUCTIONS = `
:3100 is not responding. This script does not build/start the server itself
(kept side-effect free). Run these first, from the repo root (PowerShell):

  $env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
  $env:NEXT_DIST_DIR=".next-e2e"; npx next start -p 3100

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
    ["playwright", "test", SPEC_NAME, "--config", "playwright.verify.config.ts"],
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

  if (!existsSync(SPEC_OUTPUT)) {
    console.error(`[measure-spatial-graph-baseline] Expected spec output not found: ${SPEC_OUTPUT}`);
    process.exit(1);
    return;
  }

  const specResult = JSON.parse(readFileSync(SPEC_OUTPUT, "utf8"));
  const merged = { ...environment, ...specResult };

  console.log("\n=== BASELINE RESULT (merged) ===");
  console.log(JSON.stringify(merged, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
