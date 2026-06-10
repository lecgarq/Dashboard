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
import { AnomalyError } from './dcAnomalyChecks';
import { isDcIngestRelevantFile, isKillSwitchActive, runDcIngest, loadPriorityInputs, resolveSlicesForBudget, resolveFairnessReserve, resolveBisectConfig, dcSubmit } from './dcIngest';
import { DcSubmitForbiddenError } from './dcBisect';
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
    'DC_SKIP_ADMIN_SNAPSHOT',
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
    delete process.env.DC_SKIP_ADMIN_SNAPSHOT;
    vi.clearAllMocks();
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

  it('does not submit APS requests when pending projects are only low-value allowlisted names', async () => {
    const previousVitest = process.env.VITEST;
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.VITEST = 'false';
    process.env.NODE_ENV = 'production';

    const prisma = makePrismaMock();
    prisma.accDcBackfillProgress.findMany.mockResolvedValue([
      {
        projectId: '2a46d219-9e58-479f-a4ba-daed763c7d61',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
      {
        projectId: '96ed997a-f39b-4035-baf9-9eca1b5eb6b3',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
    ]);
    prisma.accDcProject.findMany.mockResolvedValue([
      {
        id: '2a46d219-9e58-479f-a4ba-daed763c7d61',
        name: 'ACC Template Ejecucion MTY',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: '96ed997a-f39b-4035-baf9-9eca1b5eb6b3',
        name: 'MTY BIM Sharespace',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));

    try {
      const result = await runDcIngest(prisma as never);

      expect(result.status).toBe('success');
      expect(result.quotaUsed).toBe(0);
      expect(result.projectsProcessed).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (previousVitest === undefined) {
        delete process.env.VITEST;
      } else {
        process.env.VITEST = previousVitest;
      }
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
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

  it('skips admin snapshot when DC_SKIP_ADMIN_SNAPSHOT=1 even if all runnable slices completed', async () => {
    process.env.DC_SKIP_ADMIN_SNAPSHOT = '1';
    const prisma = makePrismaMock();
    const projects = [
      {
        projectId: 'p1',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
    ];
    prisma.accDcBackfillProgress.findMany.mockResolvedValue(projects);
    prisma.accDcBackfillProgress.findUnique.mockImplementation(
      async ({ where }: { where: { projectId: string } }) =>
        projects.find((project) => project.projectId === where.projectId) ?? null,
    );
    vi.mocked(ingestAdminSnapshot).mockRejectedValueOnce(
      new AnomalyError('User count dropped 56.6% (from 3870 to 1680); threshold 10%'),
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

    expect(result.status).toBe('success');
    expect(result.quotaUsed).toBe(1);
    expect(result.projectsProcessed).toBe(1);
    expect(ingestAdminSnapshot).not.toHaveBeenCalled();
    expect(prisma.accDcBackfillProgress.upsert).toHaveBeenCalledTimes(1);

    fetchSpy.mockRestore();
  });

  it('commits completed progress even when the admin snapshot is quarantined', async () => {
    const prisma = makePrismaMock();
    const projects = [
      {
        projectId: 'p1',
        earliestCovered: null,
        latestCovered: null,
        projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
        newProjectFlag: true,
      },
    ];
    prisma.accDcBackfillProgress.findMany.mockResolvedValue(projects);
    prisma.accDcBackfillProgress.findUnique.mockImplementation(
      async ({ where }: { where: { projectId: string } }) =>
        projects.find((project) => project.projectId === where.projectId) ?? null,
    );
    vi.mocked(ingestAdminSnapshot).mockRejectedValueOnce(
      new AnomalyError('User count dropped 56.6% (from 3367 to 1461); threshold 10%'),
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

    expect(result.status).toBe('quarantined');
    expect(result.quotaUsed).toBe(1);
    expect(result.projectsProcessed).toBe(1);
    expect(prisma.accDcBackfillProgress.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.accDcBackfillProgress.upsert.mock.calls[0]?.[0]).toMatchObject({
      where: { projectId: 'p1' },
      update: { newProjectFlag: false },
    });

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

  it('returns Math.max(1, floor(budget * 0.2)) when DC_FAIRNESS_RESERVE is unset (0 for non-positive budget)', () => {
    delete process.env.DC_FAIRNESS_RESERVE;
    expect(resolveFairnessReserve(20)).toBe(4);  // floor(20 * 0.2) = 4
    expect(resolveFairnessReserve(5)).toBe(1);   // floor(5 * 0.2) = 1 (max(1, 1) = 1)
    expect(resolveFairnessReserve(1)).toBe(1);   // floor(1 * 0.2) = 0, max(1, 0) = 1
    expect(resolveFairnessReserve(0)).toBe(0);   // budget <= 0 short-circuits to 0
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

    // Two slices, named by their ACTUAL rank outcome:
    //  - pWinner: no activity rows + folderCrawlStatus='unknown' → planner puts it
    //    in the `use_quota_first` lane, so it WINS priority (ranks first / position 0).
    //  - pLoser: 1000 activity rows + folderCrawlStatus='complete' → lower-priority
    //    lane, so it LOSES (ranks second / position 1).
    // Input order is [sLoser, sWinner] (loser first) so the reorder must move
    // sWinner to position 0.
    const sLoser  = makeTestSlice(['pLoser'],  'forward', '2024-01-01', '2024-01-31');
    const sWinner = makeTestSlice(['pWinner'], 'forward', '2024-01-01', '2024-01-31');
    const slices = [sLoser, sWinner]; // loser first in input; reorder should put winner first

    // Known inputs designed so buildExtractionPriorityPlan ranks pWinner first
    // (no activity, under-explored) and pLoser second (1000 rows of recent activity).
    const knownInputs: import('./dcIngest').PriorityInputs = {
      projects: [
        { id: 'pLoser',  name: 'Loser',  status: 'active', createdAt: new Date('2025-01-01'), folderCrawlStatus: 'complete', memberCount: 10 },
        { id: 'pWinner', name: 'Winner', status: 'active', createdAt: new Date('2025-01-01'), folderCrawlStatus: 'unknown', memberCount: 1 },
      ],
      activity: [
        { projectId: 'pLoser', rows: 1000, activeDays: 30, services: ['docs'], lastActivityAt: new Date('2026-05-01') },
      ],
      backfillProgress: [],
      ageByProjectId: new Map([['pLoser', 0], ['pWinner', 1]]),
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
    // Sanity: output differs from input (pWinner moves to position 0, pLoser to position 1).
    expect(result[0].projectIds).toContain('pWinner');
    expect(result[1].projectIds).toContain('pLoser');
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

// ---------------------------------------------------------------------------
// resolveBisectConfig — env-var parsing
// ---------------------------------------------------------------------------

describe('resolveBisectConfig', () => {
  it('defaults to disabled + maxRequests=32 when DC_403_BISECT is unset', () => {
    expect(resolveBisectConfig({})).toEqual({ enabled: false, maxRequests: 32 });
  });

  it('enables bisection when DC_403_BISECT="1"', () => {
    expect(resolveBisectConfig({ DC_403_BISECT: '1' })).toEqual({
      enabled: true,
      maxRequests: 32,
    });
  });

  it('keeps disabled for any DC_403_BISECT value other than "1"', () => {
    expect(resolveBisectConfig({ DC_403_BISECT: '0' }).enabled).toBe(false);
    expect(resolveBisectConfig({ DC_403_BISECT: 'true' }).enabled).toBe(false);
  });

  it('reads DC_BISECT_MAX_REQUESTS when valid (>= 1)', () => {
    expect(resolveBisectConfig({ DC_BISECT_MAX_REQUESTS: '5' }).maxRequests).toBe(5);
  });

  it('falls back to 32 for invalid / zero / blank DC_BISECT_MAX_REQUESTS', () => {
    expect(resolveBisectConfig({ DC_BISECT_MAX_REQUESTS: '0' }).maxRequests).toBe(32);
    expect(resolveBisectConfig({ DC_BISECT_MAX_REQUESTS: '-3' }).maxRequests).toBe(32);
    expect(resolveBisectConfig({ DC_BISECT_MAX_REQUESTS: 'abc' }).maxRequests).toBe(32);
    expect(resolveBisectConfig({ DC_BISECT_MAX_REQUESTS: '  ' }).maxRequests).toBe(32);
    expect(resolveBisectConfig({ DC_BISECT_MAX_REQUESTS: '' }).maxRequests).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// dcSubmit — typed 403 error
// ---------------------------------------------------------------------------

describe('dcSubmit — typed errors', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws DcSubmitForbiddenError carrying the input projectIds on HTTP 403', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response('{"detail":"Invalid user access level"}', { status: 403 }),
      );

    const ids = ['pA', 'pB', 'pC'];
    await expect(
      dcSubmit({
        accountId: 'acct',
        userToken: 'tok',
        projectIds: ids,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        description: 'test',
      }),
    ).rejects.toBeInstanceOf(DcSubmitForbiddenError);

    // Re-run to inspect .projectIds (rejection above consumed the first call).
    let caught: unknown;
    try {
      await dcSubmit({
        accountId: 'acct',
        userToken: 'tok',
        projectIds: ids,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        description: 'test',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(DcSubmitForbiddenError);
    expect((caught as DcSubmitForbiddenError).projectIds).toEqual(ids);

    fetchSpy.mockRestore();
  });

  it('resolves to the request id on HTTP 200', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ id: 'req-1' })));

    const id = await dcSubmit({
      accountId: 'acct',
      userToken: 'tok',
      projectIds: ['p1'],
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      description: 'test',
    });
    expect(id).toBe('req-1');

    fetchSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 403 batch bisection — flag OFF vs ON, end-to-end through runDcIngest
// ---------------------------------------------------------------------------

describe('runDcIngest — 403 batch bisection', () => {
  let killSwitchPath: string;
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_VARS = [
    'APS_HUB_ID',
    'ACC_ACCOUNT_ID',
    'LUIS_ACC_USER_ID',
    'APS_CLIENT_ID',
    'APS_CLIENT_SECRET',
    'DC_403_BISECT',
    'DC_BISECT_MAX_REQUESTS',
  ] as const;

  beforeEach(() => {
    killSwitchPath = path.join(process.cwd(), '.dc-ingest.disabled');
    if (fs.existsSync(killSwitchPath)) fs.unlinkSync(killSwitchPath);
    for (const k of ENV_VARS) savedEnv[k] = process.env[k];
    process.env.APS_HUB_ID = 'test-hub-id';
    process.env.LUIS_ACC_USER_ID = 'test-user-id';
    process.env.APS_CLIENT_ID = 'test-client-id';
    process.env.APS_CLIENT_SECRET = 'test-client-secret';
    delete process.env.DC_403_BISECT;
    delete process.env.DC_BISECT_MAX_REQUESTS;
  });
  afterEach(() => {
    if (fs.existsSync(killSwitchPath)) fs.unlinkSync(killSwitchPath);
    for (const k of ENV_VARS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    delete process.env.DC_403_BISECT;
    delete process.env.DC_BISECT_MAX_REQUESTS;
    vi.restoreAllMocks();
  });

  // Seed N new-projects → planDailySlice buckets them into ONE 'new-project'
  // slice (same window) containing all ids — exactly the multi-project slice
  // bisection must handle.
  function seedProjects(prisma: PrismaMock, ids: string[]) {
    const rows = ids.map((id) => ({
      projectId: id,
      earliestCovered: null,
      latestCovered: null,
      projectCreatedAt: new Date('2026-01-01T00:00:00Z'),
      newProjectFlag: true,
    }));
    prisma.accDcBackfillProgress.findMany.mockResolvedValue(rows);
    prisma.accDcBackfillProgress.findUnique.mockImplementation(
      async ({ where }: { where: { projectId: string } }) =>
        rows.find((r) => r.projectId === where.projectId) ?? null,
    );
  }

  it('flag OFF: a 403 on the slice skips the WHOLE batch (no coverage), run finalizes partial', async () => {
    // DC_403_BISECT unset (beforeEach deletes it).
    const prisma = makePrismaMock();
    seedProjects(prisma, ['p0', 'p1', 'p2', 'p3']);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/requests')) {
          return new Response('{"detail":"Invalid user access level"}', {
            status: 403,
          });
        }
        return new Response('{}');
      });

    const result = await runDcIngest(prisma as never);

    // No project's progress advanced — whole slice skipped.
    expect(prisma.accDcBackfillProgress.upsert).not.toHaveBeenCalled();
    // Slice skipped (none completed) -> partial.
    expect(result.status).toBe('partial');
    // 403 throws before quotaUsed increments (same as today's submit-fail path).
    expect(result.quotaUsed).toBe(0);

    fetchSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('flag ON: salvages good projects, isolates the 403 culprit, advances progress for the rest', async () => {
    process.env.DC_403_BISECT = '1';
    const prisma = makePrismaMock();
    seedProjects(prisma, ['p0', 'p1', 'p2', 'p3']);

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let reqCounter = 0;
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (init?.method === 'POST' && url.endsWith('/requests')) {
          const body = JSON.parse(String(init.body)) as {
            projectIdList: string[];
          };
          if (body.projectIdList.includes('p2')) {
            return new Response('{"detail":"Invalid user access level"}', {
              status: 403,
            });
          }
          reqCounter += 1;
          return new Response(JSON.stringify({ id: `req-${reqCounter}` }));
        }
        // GET /requests/:id/jobs → one successful job.
        if (/\/requests\/req-\d+\/jobs$/.test(url)) {
          return new Response(
            JSON.stringify({
              results: [
                { id: `job-${url.match(/req-(\d+)/)?.[1]}`, status: 'complete', completionStatus: 'success' },
              ],
            }),
          );
        }
        // data-listing → empty file list (no downloads, no admin snapshot).
        if (/\/jobs\/job-\d+\/data-listing$/.test(url)) {
          return new Response(JSON.stringify({ results: [] }));
        }
        return new Response('{}');
      });

    const result = await runDcIngest(prisma as never);

    // Good projects had their progress advanced.
    const upsertedIds = prisma.accDcBackfillProgress.upsert.mock.calls.map(
      (c) => (c[0] as { where: { projectId: string } }).where.projectId,
    );
    expect(upsertedIds).toEqual(expect.arrayContaining(['p0', 'p1', 'p3']));
    // Culprit was NOT advanced.
    expect(upsertedIds).not.toContain('p2');

    // Inaccessible-project log line emitted for p2.
    const inaccessibleLogged = errSpy.mock.calls.some((c) =>
      String(c[0]).includes('inaccessible project pid=p2'),
    );
    expect(inaccessibleLogged).toBe(true);

    // Bisection summary line emitted.
    const summaryLogged = logSpy.mock.calls.some((c) =>
      String(c[0]).includes('[dcIngest] bisection slice='),
    );
    expect(summaryLogged).toBe(true);

    // Sanity: the run did not finalize fatal/quota.
    expect(['success', 'partial']).toContain(result.status);

    fetchSpy.mockRestore();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
