import { createRequire } from 'node:module';
import { AddressInfo } from 'node:net';

import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createMonitorServer } = require('./start-monitor-ui.cjs');

function makeBlockingPrisma() {
  return {
    accProject: {
      findMany: async () => [
        {
          id: 'p-1',
          name: 'MTY Project',
          status: 'active',
          createdAt: new Date('2025-01-01T00:00:00Z'),
        },
      ],
    },
    accDcBackfillProgress: {
      findMany: async () => [
        { projectId: 'p-1', earliestCovered: new Date('2026-03-15T00:00:00Z') },
      ],
    },
    accDcIngestRun: {
      findMany: async () => [{ quotaUsed: 25, status: 'success' }],
      findFirst: async () => null,
    },
    accDataConnectorJob: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    accDcProject: {
      findMany: async () => [],
    },
    $queryRawUnsafe: async () => [],
  };
}

describe('monitor server command endpoint', () => {
  let server: ReturnType<typeof createMonitorServer> | null = null;

  afterEach(async () => {
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server!.close((error?: Error) => (error ? reject(error) : resolve()));
    });
    server = null;
  });

  it('returns blocked preflight status without spawning scripts', async () => {
    let spawnCount = 0;
    server = createMonitorServer({
      prisma: makeBlockingPrisma(),
      activeProcesses: {},
      spawnImpl: () => {
        spawnCount += 1;
        throw new Error('spawn must not be called for blocked preflight');
      },
    });

    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/api/trigger-crawl?type=backward`);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.success).toBe(false);
    expect(body.preflight.allowed).toBe(false);
    expect(body.preflight.reason).toContain('hard cap');
    expect(spawnCount).toBe(0);
  });
});
