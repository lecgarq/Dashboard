#!/usr/bin/env node
/**
 * Phase 8 plan 08-06 -- behaviour harness for the kill-switch path.
 *
 * Runs two assertions:
 *   1. Node entry: spawn `node scripts/dc-daily-ingest.cjs` with
 *      .dc-ingest.disabled present at repo root.
 *      Asserts:
 *        a. Exit code === 0
 *        b. stdout contains "Kill switch active" (case-insensitive)
 *        c. NO new AccDcIngestRun row was inserted (count before === count after)
 *
 *   2. PowerShell entry: spawn `pwsh -NoProfile -File scripts/dc-daily-cron.ps1`
 *      with .dc-ingest.disabled present.
 *      Asserts:
 *        a. Exit code === 0
 *        b. logs/dc-ingest-YYYY-MM-DD.log file written this run
 *        c. log contains "Kill switch present"
 *      Skipped (with warn, no fail) when pwsh is not on PATH.
 *
 * Always cleans up .dc-ingest.disabled in finally blocks so a partial run
 * never leaves the cron disabled.
 */

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const KILL_SWITCH = path.join(REPO_ROOT, '.dc-ingest.disabled');
const LOG_DIR = path.join(REPO_ROOT, 'logs');

let failures = 0;

function pass(label) {
   
  console.log(`PASS - ${label}`);
}

function fail(label, detail) {
  failures += 1;
   
  console.error(`FAIL - ${label}: ${detail}`);
}

function ensureKillSwitch() {
  fs.writeFileSync(KILL_SWITCH, 'verify-08-06-killswitch.cjs\n');
}

function clearKillSwitch() {
  if (fs.existsSync(KILL_SWITCH)) {
    fs.unlinkSync(KILL_SWITCH);
  }
}

async function dbCount() {
  const databaseUrl =
    process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    return null; // No DB configured -> we'll skip count assertion (still verify exit + stdout).
  }
  try {
    const { PrismaClient } = require('@prisma/client');
    const { PrismaPg } = require('@prisma/adapter-pg');
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl, max: 1 }),
      log: ['error'],
    });
    try {
      return await prisma.accDcIngestRun.count();
    } finally {
      await prisma.$disconnect().catch(() => {});
    }
  } catch (err) {
     
    console.warn(
      `[verify] DB count unavailable (${err.message}); skipping AccDcIngestRun assertion.`,
    );
    return null;
  }
}

async function testNodeEntry() {
   
  console.log('--- Test 1: node scripts/dc-daily-ingest.cjs with kill-switch present');
  const before = await dbCount();
  ensureKillSwitch();
  try {
    const proc = spawnSync(
      process.execPath,
      ['scripts/dc-daily-ingest.cjs'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 },
    );
    const stdout = `${proc.stdout || ''}${proc.stderr || ''}`;
    if (proc.status !== 0) {
      fail('Test 1 exit code', `expected 0, got ${proc.status}\nstdout/stderr:\n${stdout}`);
    } else {
      pass('Test 1 exit code === 0');
    }
    if (!/kill switch active/i.test(stdout)) {
      fail('Test 1 stdout', `expected "Kill switch active" (case-insensitive); got:\n${stdout}`);
    } else {
      pass('Test 1 stdout contains "Kill switch active"');
    }
    if (before !== null) {
      const after = await dbCount();
      if (after !== before) {
        fail(
          'Test 1 AccDcIngestRun unchanged',
          `count before=${before}, after=${after}`,
        );
      } else {
        pass(`Test 1 AccDcIngestRun count unchanged (${before})`);
      }
    } else {
       
      console.warn('  (skipping AccDcIngestRun count assertion -- no DB)');
    }
  } finally {
    clearKillSwitch();
  }
}

function testPowerShellEntry() {
   
  console.log('--- Test 2: pwsh scripts/dc-daily-cron.ps1 with kill-switch present');

  // pwsh availability probe
  const probe = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
    encoding: 'utf8',
  });
  if (probe.status !== 0) {
     
    console.warn('  pwsh not available on PATH -- skipping (Linux CI will not fail).');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const expectedLog = path.join(LOG_DIR, `dc-ingest-${today}.log`);
  if (fs.existsSync(expectedLog)) {
    fs.unlinkSync(expectedLog);
  }

  ensureKillSwitch();
  try {
    const proc = spawnSync(
      'pwsh',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/dc-daily-cron.ps1'],
      { cwd: REPO_ROOT, encoding: 'utf8', timeout: 60_000 },
    );
    if (proc.status !== 0) {
      fail(
        'Test 2 exit code',
        `expected 0, got ${proc.status}\nstdout:\n${proc.stdout}\nstderr:\n${proc.stderr}`,
      );
    } else {
      pass('Test 2 exit code === 0');
    }
    if (!fs.existsSync(expectedLog)) {
      fail('Test 2 log file', `expected ${expectedLog} to exist`);
    } else {
      pass(`Test 2 log file exists (${expectedLog})`);
      const log = fs.readFileSync(expectedLog, 'utf8');
      if (!/kill switch present/i.test(log)) {
        fail('Test 2 log content', `log did not contain "Kill switch present"; got:\n${log}`);
      } else {
        pass('Test 2 log contains "Kill switch present"');
      }
    }
  } finally {
    clearKillSwitch();
  }
}

async function main() {
  // Defensive cleanup -- never want to leave the cron disabled.
  clearKillSwitch();
  try {
    await testNodeEntry();
    testPowerShellEntry();
  } finally {
    clearKillSwitch();
  }
  if (failures > 0) {
     
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
   
  console.log('\nAll kill-switch assertions passed.');
  process.exit(0);
}

main().catch((err) => {
   
  console.error('Fatal:', err);
  clearKillSwitch();
  process.exit(1);
});
