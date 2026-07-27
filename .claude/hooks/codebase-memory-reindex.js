#!/usr/bin/env node
// Fires on SessionStart/Stop (async): if git HEAD moved past the sha recorded in
// the codebase-memory-mcp index, kick a detached background re-index.
// Fail-open: any error exits 0 so the session is never blocked.
'use strict';

const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Machine-local install (registered local-scope only; see memory: codebase-memory-mcp-install)
const EXE = 'C:/Users/luis.cortes/AppData/Local/Programs/codebase-memory-mcp/codebase-memory-mcp.exe';
const PROJECT = 'C-LECG-Dashboard';
const LOCK = path.join(os.tmpdir(), 'codebase-memory-reindex.lock');
const LOCK_TTL_MS = 15 * 60 * 1000; // ponytail: mtime lock, good enough for one machine

try {
  if (!fs.existsSync(EXE)) process.exit(0);
  const repo = process.env.CLAUDE_PROJECT_DIR || 'C:/LECG/Dashboard';

  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo, stdio: ['ignore', 'pipe', 'ignore'],
  }).toString().trim();

  // index_status prints a log preamble before the JSON line; parse from first '{'.
  // If the call or parse fails, treat the index as stale and re-index.
  let indexedSha = null;
  try {
    const out = execFileSync(EXE, ['cli', 'index_status', '--project', PROJECT], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    indexedSha = JSON.parse(out.slice(out.indexOf('{'))).git.head_sha;
  } catch {}
  if (indexedSha === head) process.exit(0);

  try {
    if (Date.now() - fs.statSync(LOCK).mtimeMs < LOCK_TTL_MS) process.exit(0); // re-index in flight
  } catch {}
  fs.writeFileSync(LOCK, String(process.pid));

  // TRAP: --mode full crashes deterministically on this tree; moderate only.
  spawn(EXE, ['cli', 'index_repository', '--repo-path', repo, '--mode', 'moderate'], {
    detached: true, stdio: 'ignore',
  }).unref();
} catch {}
process.exit(0);
