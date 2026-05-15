/**
 * Phase 8 plan 08-06 — Wave-2 orchestrator tests.
 *
 * Covers the three deterministic top-level branches (DC8-10 + stale-lock +
 * empty-plan). APS HTTP integration is NOT unit-tested — the surface area
 * is too large to mock cleanly; smoke testing happens in Wave 4 against a
 * dev DB (per plan 08-06 task 1 Action note).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { isKillSwitchActive, runDcIngest } from './dcIngest';

// ---------------------------------------------------------------------------
// isKillSwitchActive — pure file existence check
// ---------------------------------------------------------------------------

describe('isKillSwitchActive', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dcingest-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns false when .dc-ingest.disabled is absent', () => {
    expect(isKillSwitchActive(tmpDir)).toBe(false);
  });

  it('returns true when .dc-ingest.disabled exists at repo root', () => {
    fs.writeFileSync(path.join(tmpDir, '.dc-ingest.disabled'), '');
    expect(isKillSwitchActive(tmpDir)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runDcIngest — top-level branches
// ---------------------------------------------------------------------------

interface PrismaMock {
  accDcIngestRun: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  accDcBackfillProgress: {
    findMany: ReturnType<typeof vi.fn>;
  };
  accDcUser: { count: ReturnType<typeof vi.fn> };
  accDcProject: { count: ReturnType<typeof vi.fn> };
}

function makePrismaMock(): PrismaMock {
  return {
    accDcIngestRun: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'run-1', startedAt: new Date() }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    accDcBackfillProgress: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    accDcUser: { count: vi.fn().mockResolvedValue(0) },
    accDcProject: { count: vi.fn().mockResolvedValue(0) },
  };
}

describe('runDcIngest — top-level branches', () => {
  let killSwitchPath: string;

  beforeEach(() => {
    killSwitchPath = path.join(process.cwd(), '.dc-ingest.disabled');
    if (fs.existsSync(killSwitchPath)) fs.unlinkSync(killSwitchPath);
  });
  afterEach(() => {
    if (fs.existsSync(killSwitchPath)) fs.unlinkSync(killSwitchPath);
  });

  it('returns status=killed and never opens a run row when kill-switch present (DC8-10)', async () => {
    fs.writeFileSync(killSwitchPath, '');
    const prisma = makePrismaMock();

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('killed');
    expect(result.ingestRunId).toBeNull();
    expect(prisma.accDcIngestRun.create).not.toHaveBeenCalled();
    expect(prisma.accDcIngestRun.findFirst).not.toHaveBeenCalled();
  });

  it('returns status=skipped when a fresh concurrent run is in flight (<60min)', async () => {
    const prisma = makePrismaMock();
    prisma.accDcIngestRun.findFirst.mockResolvedValueOnce({
      id: 'run-prev',
      startedAt: new Date(Date.now() - 10 * 60_000), // 10min old
      status: 'running',
    });

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('skipped');
    expect(result.ingestRunId).toBeNull();
    expect(prisma.accDcIngestRun.create).not.toHaveBeenCalled();
  });

  it('reclaims stale running rows (>60min) and proceeds (here: empty plan -> success)', async () => {
    const prisma = makePrismaMock();
    prisma.accDcIngestRun.findFirst.mockResolvedValueOnce({
      id: 'run-stale',
      startedAt: new Date(Date.now() - 90 * 60_000), // 90min old
      status: 'running',
    });
    // Empty progress + no rows -> planDailySlice returns 0 slices.

    const result = await runDcIngest(prisma as never);

    // Stale row was updated to failed.
    const reclaimUpdate = prisma.accDcIngestRun.update.mock.calls.find(
      (c) => (c[0] as { where: { id: string } }).where.id === 'run-stale',
    );
    expect(reclaimUpdate).toBeDefined();
    expect(
      (reclaimUpdate?.[0] as { data: { status: string } }).data.status,
    ).toBe('failed');
    // New run was opened and finalized success (empty plan).
    expect(prisma.accDcIngestRun.create).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('success');
    expect(result.ingestRunId).toBe('run-1');
  });

  it('empty plan -> opens run, finalizes status=success, makes no APS calls', async () => {
    const prisma = makePrismaMock();
    // Spy on global fetch to prove no APS HTTP call is made.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('success');
    expect(result.ingestRunId).toBe('run-1');
    expect(result.quotaUsed).toBe(0);
    expect(result.projectsProcessed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
