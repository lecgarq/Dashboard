#!/usr/bin/env node
/**
 * Phase 8 plan 08-09 — static key-link assertions for DC8-GAP-01 closure.
 *
 * Pure static analysis — no DB, no APS calls. Asserts that all required
 * integration points are present in source code.
 */
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const dcIngestSrc = fs.readFileSync(path.join(repoRoot, 'lib/acc/dcIngest.ts'), 'utf8');
const discoverySrc = fs.readFileSync(path.join(repoRoot, 'lib/acc/dcProjectDiscovery.ts'), 'utf8');

const assertions = [
  ['dcIngest imports discoverAdminProjects', /import\s*\{[^}]*discoverAdminProjects[^}]*\}\s*from\s*['"]@\/lib\/acc\/dcProjectDiscovery['"]/],
  ['dcIngest references LUIS_ACC_USER_ID', /process\.env\.LUIS_ACC_USER_ID/],
  ['dcIngest has env-var fail-fast guard', /Missing required env var/i],
  ['dcIngest calls discoverAdminProjects', /discoverAdminProjects\s*\(/],
  ['dcIngest seeds AccDcBackfillProgress with newProjectFlag', /accDcBackfillProgress\.upsert[\s\S]{0,400}newProjectFlag:\s*true/m],
  ['discovery module exports discoverAdminProjects', /export\s+(async\s+)?function\s+discoverAdminProjects/],
  ['discovery module filters locally on accessLevels.projectAdmin', /accessLevels\??\.projectAdmin\s*===\s*true/],
  ['discovery module exports get2LegToken', /export\s+(async\s+)?function\s+get2LegToken/],
];

let failed = 0;
for (const [name, re] of assertions) {
  const src = name.startsWith('discovery') ? discoverySrc : dcIngestSrc;
  if (re.test(src)) {
    console.log('  PASS  ' + name);
  } else {
    console.error('  FAIL  ' + name + '  (pattern: ' + re + ')');
    failed++;
  }
}
if (failed > 0) {
  console.error('\n' + failed + ' assertion(s) failed');
  process.exit(1);
}
console.log('\nAll ' + assertions.length + ' assertions passed.');
