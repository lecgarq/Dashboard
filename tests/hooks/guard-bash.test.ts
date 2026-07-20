/**
 * guard-bash.test.ts — GUARD-01 regression coverage.
 *
 * Spawns the real PreToolUse hook (`node .claude/hooks/guard-bash.cjs`) with a
 * JSON stdin payload. The :3000 probe is redirected via GUARD_BASH_PORT to an
 * ephemeral listener (deny cases) or a known-closed port (allow cases), so the
 * suite never depends on — or touches — the live workshop app.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:net";
import path from "node:path";

const HOOK = path.resolve(__dirname, "..", "..", ".claude", "hooks", "guard-bash.cjs");

function runHook(command: string, port: number): string {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { command } }),
    env: { ...process.env, GUARD_BASH_PORT: String(port) },
    encoding: "utf8",
    timeout: 15_000,
  });
  return res.stdout ?? "";
}

const denied = (out: string) => out.includes('"permissionDecision":"deny"');

let live: Server; // stands in for the live :3000 app
let livePort: number;
let closedPort: number;

beforeAll(async () => {
  live = createServer();
  await new Promise<void>((r) => live.listen(0, "127.0.0.1", r));
  livePort = (live.address() as { port: number }).port;
  // Grab a second ephemeral port, then free it → known-closed.
  const tmp = createServer();
  await new Promise<void>((r) => tmp.listen(0, "127.0.0.1", r));
  closedPort = (tmp.address() as { port: number }).port;
  await new Promise<void>((r) => tmp.close(() => r()));
});

afterAll(async () => {
  await new Promise<void>((r) => live.close(() => r()));
});

describe("guard-bash — GUARD-01 powershell-wrapped builds", () => {
  it("denies a double-quoted wrapped build while the app port is live", () => {
    expect(denied(runHook('powershell -Command "npm run build"', livePort))).toBe(true);
  });

  it("denies a single-quoted pwsh-wrapped build while the app port is live", () => {
    expect(denied(runHook("pwsh -Command 'npm run build'", livePort))).toBe(true);
  });

  it("denies an unquoted wrapped build while the app port is live", () => {
    expect(denied(runHook("pwsh -NoProfile -Command npm run build", livePort))).toBe(true);
  });

  it("allows a wrapped isolated-dist build (bash env form) even while live", () => {
    expect(
      denied(runHook("pwsh -Command 'NEXT_DIST_DIR=.next-e2e npm run build'", livePort)),
    ).toBe(false);
  });

  it("allows a wrapped isolated-dist build ($env: form) even while live", () => {
    expect(
      denied(
        runHook("pwsh -Command '$env:NEXT_DIST_DIR=\".next-e2e\"; npm run build'", livePort),
      ),
    ).toBe(false);
  });

  it("allows a wrapped build when the app port is NOT live", () => {
    expect(denied(runHook('powershell -Command "npm run build"', closedPort))).toBe(false);
  });
});

describe("guard-bash — pre-existing behavior stays intact", () => {
  it("still denies a bare build while the app port is live", () => {
    expect(denied(runHook("npm run build", livePort))).toBe(true);
  });

  it("still allows a bare isolated-dist build while live", () => {
    expect(denied(runHook("NEXT_DIST_DIR=.next-e2e npm run build", livePort))).toBe(false);
  });

  it("quoted mention of a wrapped build (commit message) does not trigger", () => {
    expect(
      denied(runHook('git commit -m "powershell -Command npm run build"', livePort)),
    ).toBe(false);
  });

  it("still denies bulk staging regardless of port state", () => {
    expect(denied(runHook("git add -A", closedPort))).toBe(true);
  });
});
