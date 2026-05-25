/**
 * Phase 8 plan 08-06 — Wave-2 orchestrator tests.
 *
 * Covers the three deterministic top-level branches (DC8-10 + stale-lock +
 * empty-plan). APS HTTP integration is NOT unit-tested — the surface area
 * is too large to mock cleanly; smoke testing happens in Wave 4 against a
 * dev DB (per plan 08-06 task 1 Action note).
 *
 * Plan 08-09 update: discovery module (discoverAdminProjects + get2LegToken)
 * is vi.mock'd so unit tests don't require real APS calls. Env vars for
 * discovery are set in beforeEach and restored in afterEach.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the discovery module before importing the orchestrator.
vi.mock('./dcProjectDiscovery', () => ({
  discoverAdminProjects: vi.fn().mockResolvedValue([]),
  get2LegToken: vi.fn().mockResolvedValue('mock-2leg-token'),
}));

vi.mock('@/lib/server/aps-oauth', () => ({
  refreshUserToken: vi.fn().mockResolvedValue('mock-user-token'),
}));

vi.mock('./dcAdminCsvIngest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dcAdminCsvIngest')>();
  return {
    ...actual,
    ingestAdminSnapshot: vi.fn().mockResolvedValue({
      rowsByAdminCsv: {},
      diffSummary: null,
    }),
  };
});

import { ingestAdminSnapshot } from './dcAdminCsvIngest';
import { isDcIngestRelevantFile, isKillSwitchActive, runDcIngest, loadPriorityInputs, resolveSlicesForBudget, resolveFairnessReserve } from './dcIngest';
import { composePrioritizedSlices } from './dcBackfillPriority';
import type { Slice } from './dcProgressiveBackfill';

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
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  accDcBackfillProgress: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  accDataConnectorJob: {
    findMany: ReturnType<typeof vi.fn>;
  };
  accDcUser: { count: ReturnType<typeof vi.fn> };
  accDcProject: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  accActivity: { findFirst: ReturnType<typeof vi.fn> };
}

function makePrismaMock(): PrismaMock {
  return {
    accDcIngestRun: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'run-1', startedAt: new Date() }),
      update: vi.fn().mockResolvedValue(undefined),
    },
    accDcBackfillProgress: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(undefined),
      upsert: vi.fn().mockResolvedValue(undefined),
    },
    accDataConnectorJob: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    accDcUser: { count: vi.fn().mockResolvedValue(0) },
    accDcProject: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    accActivity: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('isDcIngestRelevantFile', () => {
  it('keeps activity and admin CSVs but skips package metadata files before signed-url fetch', () => {
    expect(isDcIngestRelevantFile('activities_docs_activities.csv')).toBe(true);
    expect(isDcIngestRelevantFile('admin_users.csv')).toBe(true);
    expect(isDcIngestRelevantFile('metadata.csv')).toBe(false);
    expect(isDcIngestRelevantFile('README.html')).toBe(false);
    expect(isDcIngestRelevantFile('autodesk_data_extract.zip')).toBe(false);
  });
});

describe('runDcIngest — top-level branches', () => {
  let killSwitchPath: string;
  const savedEnv: Record<string, string | undefined> = {};
  const DISCOVERY_ENV_VARS = [
    'APS_HUB_ID',
    'ACC_ACCOUNT_ID',
    'LUIS_ACC_USER_ID',
    'APS_CLIENT_ID',
    'APS_CLIENT_SECRET',
  ] as const;

  beforeEach(() => {
    killSwitchPath = path.join(process.cwd(), '.dc-ingest.disabled');
    if (fs.existsSync(killSwitchPath)) fs.unlinkSync(killSwitchPath);
    // Set required discovery env vars so orchestrator doesn't fail-fast.
    for (const k of DISCOVERY_ENV_VARS) {
      savedEnv[k] = process.env[k];
    }
    process.env.APS_HUB_ID = 'test-hub-id';
    process.env.LUIS_ACC_USER_ID = 'test-user-id';
    process.env.APS_CLIENT_ID = 'test-client-id';
    process.env.APS_CLIENT_SECRET = 'test-client-secret';
  });
  afterEach(() => {
    if (fs.existsSync(killSwitchPath)) fs.unlinkSync(killSwitchPath);
    // Restore env vars.
    for (const k of DISCOVERY_ENV_VARS) {
      if (savedEnv[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = savedEnv[k];
      }
    }
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

  it('marks the run quota-paused when APS returns HTTP 429', async () => {
    const prisma = makePrismaMock();
    prisma.accDcBackfillProgress.findMany.mockResolvedValueOnce([
      {
        projectId: 'p1',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
    ]);
    prisma.accDcIngestRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('quota', { status: 429 }));

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('quota-paused');
    const finalizeUpdate = prisma.accDcIngestRun.update.mock.calls.at(-1)?.[0] as {
      data: { status: string; errorMessage: string | null };
    };
    expect(finalizeUpdate.data.status).toBe('quota-paused');
    expect(finalizeUpdate.data.errorMessage).toMatch(/429/);

    fetchSpy.mockRestore();
  });

  it('includes legacy AccDataConnectorJob requests in the daily safe quota budget', async () => {
    const prisma = makePrismaMock();
    prisma.accDcBackfillProgress.findMany.mockResolvedValueOnce([
      {
        projectId: 'p1',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
    ]);
    const today = new Date();
    prisma.accDataConnectorJob.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => ({
        id: `legacy-${i}`,
        startedAt: today,
      })),
    );
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('quota-paused');
    expect(result.quotaUsed).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const finalizeUpdate = prisma.accDcIngestRun.update.mock.calls.at(-1)?.[0] as {
      data: { errorMessage: string | null };
    };
    expect(finalizeUpdate.data.errorMessage).toContain('20/20 used');

    fetchSpy.mockRestore();
  });

  it('skips admin snapshot but commits completed progress when quota limits defer slices', async () => {
    const prisma = makePrismaMock();
    const projects = Array.from({ length: 51 }, (_, i) => ({
      projectId: `p${i + 1}`,
      earliestCovered: null,
      latestCovered: null,
      projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
      newProjectFlag: true,
    }));
    prisma.accDcBackfillProgress.findMany.mockResolvedValue(projects);
    prisma.accDcBackfillProgress.findUnique.mockImplementation(
      async ({ where }: { where: { projectId: string } }) =>
        projects.find((project) => project.projectId === where.projectId) ?? null,
    );
    prisma.accDataConnectorJob.findMany.mockResolvedValueOnce(
      Array.from({ length: 19 }, (_, i) => ({
        id: `legacy-${i}`,
        startedAt: new Date(),
      })),
    );

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/requests')) {
          return new Response(JSON.stringify({ id: 'request-1' }));
        }
        if (url.endsWith('/requests/request-1/jobs')) {
          return new Response(
            JSON.stringify({
              results: [
                { id: 'job-1', status: 'complete', completionStatus: 'success' },
              ],
            }),
          );
        }
        if (url.endsWith('/jobs/job-1/data-listing')) {
          return new Response(
            JSON.stringify({
              results: [{ name: 'admin_users.csv' }],
            }),
          );
        }
        if (url.endsWith('/jobs/job-1/data/admin_users.csv')) {
          return new Response(JSON.stringify({ signedUrl: 'https://signed.example/admin_users.csv' }));
        }
        if (url === 'https://signed.example/admin_users.csv') {
          return new Response('id,email\nu1,u1@example.com\n');
        }
        return new Response('{}');
      });

    const result = await runDcIngest(prisma as never);

    expect(result.status).toBe('quota-paused');
    expect(result.quotaUsed).toBe(1);
    expect(result.projectsProcessed).toBe(50);
    expect(ingestAdminSnapshot).not.toHaveBeenCalled();
    expect(prisma.accDcBackfillProgress.upsert).toHaveBeenCalledTimes(50);

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// loadPriorityInputs — read-only priority inputs loader
// ---------------------------------------------------------------------------

describe('loadPriorityInputs', () => {
  const t0 = new Date('2026-01-01T00:00:00Z'); // oldest updatedAt → age 0
  const t1 = new Date('2026-02-01T00:00:00Z');
  const t2 = new Date('2026-03-01T00:00:00Z');

  function makePriorityPrismaMock() {
    return {
      accDcProject: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'proj-a', name: 'Alpha', status: 'active', createdAt: new Date('2025-06-01T00:00:00Z') },
          { id: 'proj-b', name: 'Beta',  status: 'archived', createdAt: new Date('2025-07-01T00:00:00Z') },
        ]),
        create: vi.fn().mockRejectedValue(new Error('write not allowed')),
        update: vi.fn().mockRejectedValue(new Error('write not allowed')),
      },
      accProject: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'proj-a', folderCrawlStatus: 'complete' },
          // proj-b absent → falls back to 'unknown'
        ]),
        create: vi.fn().mockRejectedValue(new Error('write not allowed')),
        update: vi.fn().mockRejectedValue(new Error('write not allowed')),
      },
      accDcProjectUser: {
        groupBy: vi.fn().mockResolvedValue([
          { projectId: 'proj-a', _count: { userId: 5 } },
          { projectId: 'proj-b', _count: { userId: 2 } },
        ]),
        create: vi.fn().mockRejectedValue(new Error('write not allowed')),
        update: vi.fn().mockRejectedValue(new Error('write not allowed')),
      },
      accDcBackfillProgress: {
        // Returned ORDER BY updatedAt ASC: proj-b (t0=oldest), proj-a (t2=newest)
        findMany: vi.fn().mockResolvedValue([
          {
            projectId: 'proj-b',
            earliestCovered: new Date('2026-01-01T00:00:00Z'),
            latestCovered: new Date('2026-03-01T00:00:00Z'),
            projectCreatedAt: new Date('2025-07-01T00:00:00Z'),
            newProjectFlag: false,
            updatedAt: t0,
          },
          {
            projectId: 'proj-a',
            earliestCovered: null,
            latestCovered: null,
            projectCreatedAt: new Date('2025-06-01T00:00:00Z'),
            newProjectFlag: true,
            updatedAt: t2,
          },
        ]),
        // Write methods should never be called — make them throw to enforce it.
        create:  vi.fn().mockRejectedValue(new Error('write not allowed')),
        update:  vi.fn().mockRejectedValue(new Error('write not allowed')),
        upsert:  vi.fn().mockRejectedValue(new Error('write not allowed')),
        delete:  vi.fn().mockRejectedValue(new Error('write not allowed')),
      },
      $queryRaw: vi.fn().mockResolvedValue([
        {
          projectId: 'proj-a',
          rows: 42,
          activeDays: 7,
          services: ['docs', 'issues'],
          lastActivityAt: new Date('2026-03-15T00:00:00Z'),
        },
      ]),
    };
  }

  it('returns correctly shaped projects array', async () => {
    const prisma = makePriorityPrismaMock();
    const result = await loadPriorityInputs(prisma as never);

    expect(result.projects).toHaveLength(2);

    const alpha = result.projects.find((p) => p.id === 'proj-a');
    expect(alpha).toBeDefined();
    expect(alpha!.name).toBe('Alpha');
    expect(alpha!.status).toBe('active');
    expect(alpha!.createdAt).toEqual(new Date('2025-06-01T00:00:00Z'));
    expect(alpha!.folderCrawlStatus).toBe('complete');
    expect(alpha!.memberCount).toBe(5);

    const beta = result.projects.find((p) => p.id === 'proj-b');
    expect(beta!.folderCrawlStatus).toBe('unknown'); // absent from accProject
    expect(beta!.memberCount).toBe(2);
  });

  it('returns correctly shaped activity array', async () => {
    const prisma = makePriorityPrismaMock();
    const result = await loadPriorityInputs(prisma as never);

    expect(result.activity).toHaveLength(1);
    const act = result.activity[0];
    expect(act.projectId).toBe('proj-a');
    expect(act.rows).toBe(42);
    expect(act.activeDays).toBe(7);
    expect(act.services).toEqual(['docs', 'issues']);
    expect(act.lastActivityAt).toEqual(new Date('2026-03-15T00:00:00Z'));
  });

  it('returns correctly shaped backfillProgress array', async () => {
    const prisma = makePriorityPrismaMock();
    const result = await loadPriorityInputs(prisma as never);

    expect(result.backfillProgress).toHaveLength(2);

    const bpB = result.backfillProgress.find((r) => r.projectId === 'proj-b');
    expect(bpB).toBeDefined();
    expect(bpB!.earliestCovered).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(bpB!.latestCovered).toEqual(new Date('2026-03-01T00:00:00Z'));
    expect(bpB!.projectCreatedAt).toEqual(new Date('2025-07-01T00:00:00Z'));
    expect(bpB!.newProjectFlag).toBe(false);

    const bpA = result.backfillProgress.find((r) => r.projectId === 'proj-a');
    expect(bpA!.newProjectFlag).toBe(true);
    expect(bpA!.earliestCovered).toBeNull();
  });

  it('ranks ageByProjectId with oldest updatedAt as 0', async () => {
    const prisma = makePriorityPrismaMock();
    const result = await loadPriorityInputs(prisma as never);

    // proj-b has t0 (oldest) → rank 0; proj-a has t2 → rank 1
    expect(result.ageByProjectId.get('proj-b')).toBe(0);
    expect(result.ageByProjectId.get('proj-a')).toBe(1);
  });

  it('does not call any write methods (read-only guarantee)', async () => {
    const prisma = makePriorityPrismaMock();
    await loadPriorityInputs(prisma as never);

    expect(prisma.accDcBackfillProgress.create).not.toHaveBeenCalled();
    expect(prisma.accDcBackfillProgress.update).not.toHaveBeenCalled();
    expect(prisma.accDcBackfillProgress.upsert).not.toHaveBeenCalled();
    expect(prisma.accDcBackfillProgress.delete).not.toHaveBeenCalled();
    expect(prisma.accDcProject.create).not.toHaveBeenCalled();
    expect(prisma.accDcProject.update).not.toHaveBeenCalled();
    expect(prisma.accProject.create).not.toHaveBeenCalled();
    expect(prisma.accProject.update).not.toHaveBeenCalled();
    expect(prisma.accDcProjectUser.create).not.toHaveBeenCalled();
    expect(prisma.accDcProjectUser.update).not.toHaveBeenCalled();
  });

  it('filters out null/empty projectId rows from activity', async () => {
    const prisma = makePriorityPrismaMock();
    prisma.$queryRaw.mockResolvedValueOnce([
      { projectId: '', rows: 1, activeDays: 1, services: null, lastActivityAt: null },
      { projectId: null, rows: 2, activeDays: 1, services: null, lastActivityAt: null },
      { projectId: 'proj-a', rows: 10, activeDays: 3, services: ['docs'], lastActivityAt: null },
    ]);

    const result = await loadPriorityInputs(prisma as never);

    expect(result.activity).toHaveLength(1);
    expect(result.activity[0].projectId).toBe('proj-a');
  });

  it('returns empty ageByProjectId when no backfill rows', async () => {
    const prisma = makePriorityPrismaMock();
    prisma.accDcBackfillProgress.findMany.mockResolvedValueOnce([]);

    const result = await loadPriorityInputs(prisma as never);

    expect(result.ageByProjectId.size).toBe(0);
    expect(result.backfillProgress).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveFairnessReserve — env-var parsing
// ---------------------------------------------------------------------------

describe('resolveFairnessReserve', () => {
  afterEach(() => {
    delete process.env.DC_FAIRNESS_RESERVE;
  });

  it('returns Math.max(1, floor(budget * 0.2)) when DC_FAIRNESS_RESERVE is unset', () => {
    delete process.env.DC_FAIRNESS_RESERVE;
    expect(resolveFairnessReserve(20)).toBe(4);  // floor(20 * 0.2) = 4
    expect(resolveFairnessReserve(5)).toBe(1);   // floor(5 * 0.2) = 1 (max(1, 1) = 1)
    expect(resolveFairnessReserve(1)).toBe(1);   // floor(1 * 0.2) = 0, max(1, 0) = 1
    expect(resolveFairnessReserve(0)).toBe(1);   // floor(0 * 0.2) = 0, max(1, 0) = 1
  });

  it('parses DC_FAIRNESS_RESERVE integer and clamps to >= 0', () => {
    process.env.DC_FAIRNESS_RESERVE = '5';
    expect(resolveFairnessReserve(20)).toBe(5);
  });

  it('clamps negative DC_FAIRNESS_RESERVE to 0', () => {
    process.env.DC_FAIRNESS_RESERVE = '-3';
    expect(resolveFairnessReserve(20)).toBe(0);
  });

  it('falls back to default when DC_FAIRNESS_RESERVE is non-numeric', () => {
    process.env.DC_FAIRNESS_RESERVE = 'abc';
    expect(resolveFairnessReserve(10)).toBe(2); // floor(10 * 0.2) = 2
  });
});

// ---------------------------------------------------------------------------
// resolveSlicesForBudget — flag-gated ordering wiring
// ---------------------------------------------------------------------------

function makeTestSlice(
  projectIds: string[],
  reason: Slice['reason'],
  startISO: string,
  endISO: string,
): Slice {
  return { projectIds, start: new Date(startISO), end: new Date(endISO), reason };
}

describe('resolveSlicesForBudget — flag OFF (default path)', () => {
  afterEach(() => {
    delete process.env.DC_PRIORITY_BACKFILL;
  });

  it('returns plan.slices unchanged (by reference) when DC_PRIORITY_BACKFILL is unset, loader never called', async () => {
    delete process.env.DC_PRIORITY_BACKFILL;
    const slices = [
      makeTestSlice(['p1'], 'forward', '2024-01-01', '2024-01-31'),
      makeTestSlice(['p2'], 'backward', '2024-01-01', '2024-01-31'),
    ];
    const plan = { slices };
    const loadFn = vi.fn();
    const result = await resolveSlicesForBudget({} as never, plan, 10, new Date(), loadFn);
    expect(result).toBe(slices); // same reference — flag-off short-circuit
    expect(loadFn).not.toHaveBeenCalled(); // loader must never be called
  });

  it('returns plan.slices unchanged when DC_PRIORITY_BACKFILL is "0", loader never called', async () => {
    process.env.DC_PRIORITY_BACKFILL = '0';
    const slices = [makeTestSlice(['px'], 'forward', '2024-01-01', '2024-01-31')];
    const loadFn = vi.fn();
    const result = await resolveSlicesForBudget({} as never, { slices }, 10, new Date(), loadFn);
    expect(result).toBe(slices);
    expect(loadFn).not.toHaveBeenCalled();
  });
});

describe('resolveSlicesForBudget — flag ON, ordering applied', () => {
  afterEach(() => {
    delete process.env.DC_PRIORITY_BACKFILL;
    delete process.env.DC_FAIRNESS_RESERVE;
  });

  it('calls the injected loader exactly once and reorders slices correctly when DC_PRIORITY_BACKFILL=1', async () => {
    process.env.DC_PRIORITY_BACKFILL = '1';
    process.env.DC_FAIRNESS_RESERVE = '0'; // disable fairness so order is purely priority-driven

    // Two slices: pHigh scores rank 0 (highest priority) because it lacks activity data
    // and has folderCrawlStatus='unknown' — the planner prioritises under-explored projects.
    // pLow has 1000 activity rows + folderCrawlStatus='complete', so it ranks lower.
    // Input order is [sLow, sHigh] (low-priority first) so the reorder moves sHigh to position 0.
    const sLow  = makeTestSlice(['pLow'],  'forward', '2024-01-01', '2024-01-31');
    const sHigh = makeTestSlice(['pHigh'], 'forward', '2024-01-01', '2024-01-31');
    const slices = [sLow, sHigh]; // pLow first in input; reorder should put pHigh first

    // Known inputs designed so buildExtractionPriorityPlan gives pLow rank 0
    // and pHigh rank 1 (pLow has 1000 rows of recent activity; pHigh has none).
    const knownInputs: import('./dcIngest').PriorityInputs = {
      projects: [
        { id: 'pLow',  name: 'Low',  status: 'active', createdAt: new Date('2025-01-01'), folderCrawlStatus: 'complete', memberCount: 10 },
        { id: 'pHigh', name: 'High', status: 'active', createdAt: new Date('2025-01-01'), folderCrawlStatus: 'unknown', memberCount: 1 },
      ],
      activity: [
        { projectId: 'pLow', rows: 1000, activeDays: 30, services: ['docs'], lastActivityAt: new Date('2026-05-01') },
      ],
      backfillProgress: [],
      ageByProjectId: new Map([['pLow', 0], ['pHigh', 1]]),
    };

    const loadFn = vi.fn().mockResolvedValue(knownInputs);
    const generatedAt = new Date('2026-05-25T00:00:00Z');
    const budget = 2;

    const result = await resolveSlicesForBudget({} as never, { slices }, budget, generatedAt, loadFn);

    // Loader was called exactly once — proves the reorder path is genuinely exercised.
    expect(loadFn).toHaveBeenCalledTimes(1);

    // Compute the expected order in-test using the same inputs + helpers,
    // so the assertion is exact (deep order equality), not just "different from input".
    const { buildExtractionPriorityPlan } = await import('./extractionPriorityPlanner');
    const ranked = buildExtractionPriorityPlan({
      generatedAt,
      windowDays: 30,
      projects: knownInputs.projects,
      activity: knownInputs.activity,
      backfillProgress: knownInputs.backfillProgress,
    }).rankedProjects;
    const priorityByProjectId = new Map(ranked.map((p) => [p.projectId, p.rank]));
    const reserve = 0; // DC_FAIRNESS_RESERVE='0'
    const expected = composePrioritizedSlices(
      slices,
      priorityByProjectId,
      knownInputs.ageByProjectId,
      budget,
      reserve,
    );

    expect(result).toEqual(expected); // exact order match — proves the reorder path ran
    // Sanity: output differs from input (pHigh moves to position 0, pLow to position 1).
    expect(result[0].projectIds).toContain('pHigh');
    expect(result[1].projectIds).toContain('pLow');
  });
});

describe('resolveSlicesForBudget — fallback on error', () => {
  afterEach(() => {
    delete process.env.DC_PRIORITY_BACKFILL;
    delete process.env.DC_FAIRNESS_RESERVE;
  });

  it('returns plan.slices, logs a warning, and calls the loader once when loader rejects', async () => {
    process.env.DC_PRIORITY_BACKFILL = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const slices = [makeTestSlice(['p1'], 'forward', '2024-01-01', '2024-01-31')];
    const loadFn = vi.fn().mockRejectedValue(new Error('boom'));

    const result = await resolveSlicesForBudget({} as never, { slices }, 10, new Date(), loadFn);

    // Fallback: original slices returned by reference.
    expect(result).toBe(slices);
    // Loader was actually called — proves the catch path is genuinely exercised.
    expect(loadFn).toHaveBeenCalledTimes(1);
    // Warning was emitted.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[dcIngest] priority ordering failed'),
      expect.any(Error),
    );
    // Must not throw.
    warnSpy.mockRestore();
  });

  it('never throws even when the loader rejects', async () => {
    process.env.DC_PRIORITY_BACKFILL = '1';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const slices = [makeTestSlice(['p1'], 'forward', '2024-01-01', '2024-01-31')];
    const loadFn = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      resolveSlicesForBudget({} as never, { slices }, 10, new Date(), loadFn),
    ).resolves.toBe(slices);

    warnSpy.mockRestore();
  });
});
