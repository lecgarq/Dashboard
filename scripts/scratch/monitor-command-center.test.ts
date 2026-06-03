import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const commandCenter = require('./monitor-command-center.cjs');

function makeProjects(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `p-${index + 1}`,
    name: `MTY Project ${index + 1}`,
    status: 'active',
    createdAt: new Date('2025-01-01T00:00:00Z'),
  }));
}

function makeBackfills(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    projectId: `p-${index + 1}`,
    earliestCovered: new Date('2026-03-15T00:00:00Z'),
  }));
}

function fakePrisma(options: {
  candidateCount?: number;
  quotaUsed?: number;
  activeDcRun?: unknown;
  activeLegacyJob?: unknown;
}) {
  const candidateCount = options.candidateCount ?? 0;
  return {
    accProject: {
      findMany: async () => makeProjects(candidateCount),
    },
    accDcBackfillProgress: {
      findMany: async () => makeBackfills(candidateCount),
    },
    accDcIngestRun: {
      findMany: async () =>
        options.quotaUsed ? [{ quotaUsed: options.quotaUsed, status: 'success' }] : [],
      findFirst: async () => options.activeDcRun ?? null,
    },
    accDataConnectorJob: {
      findMany: async () => [],
      findFirst: async () => options.activeLegacyJob ?? null,
    },
  };
}

describe('monitor command registry', () => {
  it('registers every extraction command with metadata', () => {
    expect(Object.keys(commandCenter.COMMAND_REGISTRY).sort()).toEqual([
      'activity',
      'backward',
      'bulk',
      'folder',
    ]);
    expect(commandCenter.COMMAND_REGISTRY.bulk.riskLevel).toBe('high');
    expect(commandCenter.COMMAND_REGISTRY.folder.baseCost).toBe(0);
  });

  it('calculates dynamic bulk batch count from remaining backward candidates', async () => {
    const estimate = await commandCenter.estimateCommandCost(
      'bulk',
      fakePrisma({ candidateCount: 162 }),
    );

    expect(estimate.cost).toBe(3);
    expect(estimate.estimatedBatches).toBe(3);
    expect(estimate.plannedProjects).toBe(112);
    expect(estimate.description).toContain('3 requests, 112 projects');
  });
});

describe('monitor command preflight', () => {
  it('blocks when command cost would exceed the 25 request hard cap', async () => {
    const preflight = await commandCenter.buildPreflight('bulk', {
      prisma: fakePrisma({ candidateCount: 162, quotaUsed: 24 }),
      activeProcesses: {},
      now: new Date('2026-06-01T12:00:00Z'),
    });

    expect(preflight.allowed).toBe(false);
    expect(preflight.cost).toBe(3);
    expect(preflight.quotaUsedToday).toBe(24);
    expect(preflight.hardRemaining).toBe(1);
    expect(preflight.reason).toContain('hard cap');
  });

  it('blocks on an in-memory active process lock', async () => {
    const preflight = await commandCenter.buildPreflight('backward', {
      prisma: fakePrisma({ candidateCount: 12 }),
      activeProcesses: { activity: { pid: 1234 } },
      now: new Date('2026-06-01T12:00:00Z'),
    });

    expect(preflight.allowed).toBe(false);
    expect(preflight.activeRun).toMatchObject({
      source: 'process',
      type: 'activity',
      pid: 1234,
    });
    expect(preflight.reason).toContain('already running');
  });

  it('blocks on a running DB job row', async () => {
    const preflight = await commandCenter.buildPreflight('backward', {
      prisma: fakePrisma({
        candidateCount: 12,
        activeDcRun: { id: 'run-1', status: 'running', startedAt: new Date() },
      }),
      activeProcesses: {},
      now: new Date('2026-06-01T12:00:00Z'),
    });

    expect(preflight.allowed).toBe(false);
    expect(preflight.activeRun).toMatchObject({
      source: 'db',
      type: 'accDcIngestRun',
      id: 'run-1',
    });
    expect(preflight.reason).toContain('database');
  });
});
