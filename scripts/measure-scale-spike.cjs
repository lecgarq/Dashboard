#!/usr/bin/env node
"use strict";

/**
 * scripts/measure-scale-spike.cjs — Phase 37 SCALE-01 measurement orchestrator.
 *
 * Clone of measure-spatial-graph-baseline.cjs for the scale-spike harness:
 *   1. Preflights that :3100 is already up (never builds/starts itself).
 *   2. Records measurement conditions (cosmos.gl version, patch, BUILD_ID, commit).
 *   3. Runs tests/e2e/scale-spike.spec.ts (the actual measured scenarios).
 *   4. Merges spec JSON output with the environment record and prints the
 *      final block (37-BASELINE.md is written from this).
 *
 * Re-run instructions (PowerShell, from repo root):
 *   $env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_PUBLIC_ACC_SCALE_SPIKE="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
 *   $env:NEXT_PUBLIC_ACC_SCALE_SPIKE="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next start -p 3100
 *   node scripts/measure-scale-spike.cjs
 * Optional: $env:SPIKE_N to measure a smaller set when hunting the ceiling.
 */

const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const REPO_ROOT = path.join(__dirname, "..");
const PREFLIGHT_URL = "http://localhost:3100/login";
const SPEC_NAME = "scale-spike";
const SPEC_OUTPUT = path.join(REPO_ROOT, "test-results", "scale-spike.json");

const BUILD_INSTRUCTIONS = `
:3100 is not responding. This script does not build/start the server itself
(kept side-effect free). Run these first, from the repo root (PowerShell):

  $env:NEXT_PUBLIC_ACC_GRAPH_TEST="1"; $env:NEXT_PUBLIC_ACC_SCALE_SPIKE="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next build --webpack
  $env:NEXT_PUBLIC_ACC_SCALE_SPIKE="1"; $env:NEXT_DIST_DIR=".next-e2e"; npx next start -p 3100

Then re-run: node scripts/measure-scale-spike.cjs
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
    spikeN: process.env.SPIKE_N ?? "4862301 (default)",
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
    console.error("[measure-scale-spike] Playwright spec failed — see output above.");
    process.exit(1);
    return;
  }

  if (!existsSync(SPEC_OUTPUT)) {
    console.error(`[measure-scale-spike] Expected spec output not found: ${SPEC_OUTPUT}`);
    process.exit(1);
    return;
  }

  const specResult = JSON.parse(readFileSync(SPEC_OUTPUT, "utf8"));
  const merged = { environment, ...specResult };

  console.log("\n=== SCALE-SPIKE RESULT (merged) ===");
  console.log(JSON.stringify(merged, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
