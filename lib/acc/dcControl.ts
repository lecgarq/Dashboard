import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const KILL_SWITCH_FILENAME = '.dc-ingest.disabled';
const LOG_DIR = 'logs';

export type ExtractionStartKind = 'daily' | 'backfill' | 'retry';

export function pauseDcExtraction(repoRoot = process.cwd()): void {
  fs.writeFileSync(path.join(repoRoot, KILL_SWITCH_FILENAME), '');
}

export function resumeDcExtraction(repoRoot = process.cwd()): void {
  const killSwitchPath = path.join(repoRoot, KILL_SWITCH_FILENAME);
  if (fs.existsSync(killSwitchPath)) {
    fs.unlinkSync(killSwitchPath);
  }
}

export function isDcExtractionPaused(repoRoot = process.cwd()): boolean {
  return fs.existsSync(path.join(repoRoot, KILL_SWITCH_FILENAME));
}

export function listLatestDcLogs(repoRoot = process.cwd(), limit = 20): string[] {
  const logDir = path.join(repoRoot, LOG_DIR);
  if (!fs.existsSync(logDir)) return [];
  return fs
    .readdirSync(logDir)
    .filter((name) => /^dc-|^sync-status|^dc-ingest/.test(name))
    .map((name) => ({
      name,
      fullPath: path.join(logDir, name),
      mtimeMs: fs.statSync(path.join(logDir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.fullPath);
}

export function readLatestDcLogLines(
  repoRoot = process.cwd(),
  maxLines = 80,
): string[] {
  const [latest] = listLatestDcLogs(repoRoot, 1);
  if (!latest) return [];
  const text = fs.readFileSync(latest, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

export function startDcExtractionProcess(
  kind: ExtractionStartKind,
  repoRoot = process.cwd(),
): { pid: number | null; logPath: string } {
  const logDir = path.join(repoRoot, LOG_DIR);
  fs.mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.join(logDir, `dc-desktop-${kind}-${stamp}.log`);
  const out = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, ['--env-file=.env', 'scripts/dc-daily-ingest.cjs'], {
    cwd: repoRoot,
    detached: true,
    stdio: ['ignore', out, out],
    windowsHide: true,
  });
  child.unref();

  return { pid: child.pid ?? null, logPath };
}
