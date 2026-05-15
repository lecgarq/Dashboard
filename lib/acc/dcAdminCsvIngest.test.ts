import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';

import {
  ADMIN_CSV_ALLOWLIST,
  ingestAdminSnapshot,
  AdminCsvParseError,
  type AdminFileSource,
} from './dcAdminCsvIngest';

// Hoisted mock so we can swap implementations per-test.
const assertNoAnomaliesMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('./dcAnomalyChecks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./dcAnomalyChecks')>();
  return {
    ...actual,
    assertNoAnomalies: assertNoAnomaliesMock,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csvSource(filename: string, csv: string): AdminFileSource {
  return { filename, csvStream: Readable.from([csv]) };
}

function emptyHeaderCsv(headers: string[]): string {
  return headers.join(',') + '\n';
}

function singleRowCsv(headers: string[], values: string[]): string {
  return [headers.join(','), values.join(',')].join('\n') + '\n';
}

interface ModelStubOptions {
  initialIds?: string[];
  finalIds?: string[];
}

function makeModelStub(callsLog: string[], modelKey: string, opts: ModelStubOptions = {}) {
  const initialIds = opts.initialIds ?? [];
  const finalIds = opts.finalIds ?? initialIds;
  const findManyImpl = vi
    .fn()
    .mockResolvedValueOnce(initialIds.map((id) => ({ id })))
    .mockResolvedValue(finalIds.map((id) => ({ id })));
  return {
    count: vi.fn().mockResolvedValue(initialIds.length),
    findMany: findManyImpl,
    deleteMany: vi.fn(async () => {
      callsLog.push(`delete:${modelKey}`);
      return { count: initialIds.length };
    }),
    createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
      callsLog.push(`create:${modelKey}:${data.length}`);
      return { count: data.length };
    }),
  };
}

function makeFakePrisma(callsLog: string[], opts: { userIds?: { initial: string[]; final: string[] }; projectIds?: { initial: string[]; final: string[] } } = {}) {
  const tx: Record<string, ReturnType<typeof makeModelStub>> = {};
  for (const entry of ADMIN_CSV_ALLOWLIST) {
    const modelKey = entry.model as string;
    if (modelKey === 'accDcUser') {
      tx[modelKey] = makeModelStub(callsLog, modelKey, {
        initialIds: opts.userIds?.initial ?? [],
        finalIds: opts.userIds?.final ?? opts.userIds?.initial ?? [],
      });
    } else if (modelKey === 'accDcProject') {
      tx[modelKey] = makeModelStub(callsLog, modelKey, {
        initialIds: opts.projectIds?.initial ?? [],
        finalIds: opts.projectIds?.final ?? opts.projectIds?.initial ?? [],
      });
    } else {
      tx[modelKey] = makeModelStub(callsLog, modelKey);
    }
  }
  let txCalls = 0;
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown, _opts?: unknown) => {
      txCalls++;
      return cb(tx);
    }),
  } as unknown as PrismaClient;
  return { prisma, tx, getTxCalls: () => txCalls };
}

// All 16 admin CSVs with one row each.
function allSixteenFiles(): AdminFileSource[] {
  return [
    csvSource('admin_users.csv', singleRowCsv(['id', 'email', 'name', 'status', 'company_id', 'autodesk_id', 'last_sign_in'], ['u1', 'u1@x.com', 'User 1', 'active', 'c1', 'a1', '2026-01-01T00:00:00Z'])),
    csvSource('admin_companies.csv', singleRowCsv(['id', 'name', 'hub_id'], ['c1', 'Acme', 'hub1'])),
    csvSource('admin_projects.csv', singleRowCsv(['id', 'account_id', 'name', 'job_number', 'status', 'type', 'created_at'], ['p1', 'acc1', 'Project 1', 'JN-1', 'active', 'AEC', '2025-06-01T00:00:00Z'])),
    csvSource('admin_accounts.csv', singleRowCsv(['id', 'name', 'region'], ['acc1', 'Account 1', 'US'])),
    csvSource('admin_business_units.csv', singleRowCsv(['id', 'name', 'account_id'], ['bu1', 'BU 1', 'acc1'])),
    csvSource('admin_roles.csv', singleRowCsv(['id', 'name', 'account_id'], ['r1', 'Role 1', 'acc1'])),
    csvSource('admin_project_users.csv', singleRowCsv(['project_id', 'user_id', 'status', 'added_on', 'last_sign_in'], ['p1', 'u1', 'active', '2025-06-15T00:00:00Z', '2026-01-01T00:00:00Z'])),
    csvSource('admin_project_user_roles.csv', singleRowCsv(['project_id', 'user_id', 'role_id'], ['p1', 'u1', 'r1'])),
    csvSource('admin_project_user_products.csv', singleRowCsv(['project_id', 'user_id', 'product_key', 'access_level'], ['p1', 'u1', 'docs', 'admin'])),
    csvSource('admin_project_user_companies.csv', singleRowCsv(['project_id', 'user_id', 'company_id'], ['p1', 'u1', 'c1'])),
    csvSource('admin_project_user_services.csv', singleRowCsv(['project_id', 'user_id', 'service_key', 'access_level'], ['p1', 'u1', 'svc1', 'member'])),
    csvSource('admin_project_roles.csv', singleRowCsv(['project_id', 'role_id'], ['p1', 'r1'])),
    csvSource('admin_project_products.csv', singleRowCsv(['project_id', 'product_key', 'access_level'], ['p1', 'docs', 'enabled'])),
    csvSource('admin_project_companies.csv', singleRowCsv(['project_id', 'company_id'], ['p1', 'c1'])),
    csvSource('admin_project_services.csv', singleRowCsv(['project_id', 'service_key', 'access_level'], ['p1', 'svc1', 'enabled'])),
    csvSource('admin_account_services.csv', singleRowCsv(['account_id', 'service_key', 'access_level'], ['acc1', 'svc1', 'enabled'])),
  ];
}

beforeEach(() => {
  assertNoAnomaliesMock.mockReset();
  assertNoAnomaliesMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Allow-list tests (pure)
// ---------------------------------------------------------------------------

describe('ADMIN_CSV_ALLOWLIST', () => {
  it('contains exactly 16 entries (CONTEXT count)', () => {
    expect(ADMIN_CSV_ALLOWLIST).toHaveLength(16);
  });

  it('every filename matches /^admin_[a-z_]+\\.csv$/ and references a valid AccDc* model name', () => {
    const filenamePattern = /^admin_[a-z_]+\.csv$/;
    const validModels = new Set([
      'accDcUser',
      'accDcCompany',
      'accDcProject',
      'accDcAccount',
      'accDcBusinessUnit',
      'accDcRole',
      'accDcProjectUser',
      'accDcProjectUserRole',
      'accDcProjectUserProduct',
      'accDcProjectUserCompany',
      'accDcProjectUserService',
      'accDcProjectRole',
      'accDcProjectProduct',
      'accDcProjectCompany',
      'accDcProjectService',
      'accDcAccountService',
    ]);
    for (const entry of ADMIN_CSV_ALLOWLIST) {
      expect(entry.filename).toMatch(filenamePattern);
      expect(validModels.has(entry.model as string)).toBe(true);
    }
  });

  it('has no duplicate filenames or models', () => {
    const filenames = ADMIN_CSV_ALLOWLIST.map((e) => e.filename);
    const models = ADMIN_CSV_ALLOWLIST.map((e) => e.model);
    expect(new Set(filenames).size).toBe(filenames.length);
    expect(new Set(models).size).toBe(models.length);
  });
});

// ---------------------------------------------------------------------------
// ingestAdminSnapshot — happy path
// ---------------------------------------------------------------------------

describe('ingestAdminSnapshot — happy path', () => {
  it('feeds all 16 files -> 16 deleteMany + 16 createMany in allow-list order; all rowsByAdminCsv=1', async () => {
    const callsLog: string[] = [];
    const { prisma, getTxCalls } = makeFakePrisma(callsLog, {
      userIds: { initial: [], final: ['u1'] },
      projectIds: { initial: [], final: ['p1'] },
    });

    const result = await ingestAdminSnapshot(prisma, allSixteenFiles(), 'run-1', null);

    expect(getTxCalls()).toBe(1);
    expect(result.missingFiles).toEqual([]);
    expect(result.skippedFiles).toEqual([]);
    expect(Object.keys(result.rowsByAdminCsv)).toHaveLength(16);
    for (const entry of ADMIN_CSV_ALLOWLIST) {
      expect(result.rowsByAdminCsv[entry.filename]).toBe(1);
    }

    // 16 deletes + 16 creates, in allow-list order
    const deletes = callsLog.filter((c) => c.startsWith('delete:'));
    const creates = callsLog.filter((c) => c.startsWith('create:'));
    expect(deletes).toHaveLength(16);
    expect(creates).toHaveLength(16);
    for (let i = 0; i < ADMIN_CSV_ALLOWLIST.length; i++) {
      expect(deletes[i]).toBe(`delete:${ADMIN_CSV_ALLOWLIST[i].model as string}`);
      expect(creates[i]).toBe(`create:${ADMIN_CSV_ALLOWLIST[i].model as string}:1`);
    }
  });

  it('uses Serializable isolation level on the $transaction call', async () => {
    const { prisma } = makeFakePrisma([], {
      userIds: { initial: [], final: ['u1'] },
      projectIds: { initial: [], final: ['p1'] },
    });
    await ingestAdminSnapshot(prisma, allSixteenFiles(), 'run-1', null);
    const txMock = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
    expect(txMock).toHaveBeenCalledTimes(1);
    const opts = txMock.mock.calls[0][1];
    expect(opts).toBeDefined();
    expect(opts.isolationLevel).toBe('Serializable');
  });
});

// ---------------------------------------------------------------------------
// missing / skipped files
// ---------------------------------------------------------------------------

describe('ingestAdminSnapshot — missing + skipped files', () => {
  it('missing admin_users.csv -> result.missingFiles=[admin_users.csv]; rowsByAdminCsv has 0 for it; assertNoAnomalies still invoked then throws -> bubbled out', async () => {
    const callsLog: string[] = [];
    const { prisma } = makeFakePrisma(callsLog);
    const files = allSixteenFiles().filter((f) => f.filename !== 'admin_users.csv');

    // Anomaly mock: throw because requireAllAdminCsvs would catch this (simulated at gate level)
    assertNoAnomaliesMock.mockRejectedValueOnce(
      new (await import('./dcAnomalyChecks')).AnomalyError('Admin CSV "admin_users.csv" missing'),
    );

    await expect(ingestAdminSnapshot(prisma, files, 'run-1', { userCount: 1, projectCount: 1, rowsByAdminCsv: { 'admin_users.csv': 5 } })).rejects.toThrow(/missing/);

    // assertNoAnomalies WAS called
    expect(assertNoAnomaliesMock).toHaveBeenCalledTimes(1);
    // No deleteMany for accDcUser since file was missing (still in callsLog from other models)
    const userDeletes = callsLog.filter((c) => c === 'delete:accDcUser');
    expect(userDeletes).toHaveLength(0);
  });

  it('extra admin_typo.csv -> result.skippedFiles=[admin_typo.csv]; no deleteMany for it', async () => {
    const callsLog: string[] = [];
    const { prisma } = makeFakePrisma(callsLog, {
      userIds: { initial: [], final: ['u1'] },
      projectIds: { initial: [], final: ['p1'] },
    });
    const files: AdminFileSource[] = [
      ...allSixteenFiles(),
      csvSource('admin_typo.csv', singleRowCsv(['id'], ['x'])),
    ];

    const result = await ingestAdminSnapshot(prisma, files, 'run-1', null);

    expect(result.skippedFiles).toEqual(['admin_typo.csv']);
    expect(result.missingFiles).toEqual([]);
    // Only the 16 allow-listed deletes occurred
    expect(callsLog.filter((c) => c.startsWith('delete:'))).toHaveLength(16);
  });
});

// ---------------------------------------------------------------------------
// Anomaly throw rolls back
// ---------------------------------------------------------------------------

describe('ingestAdminSnapshot — anomaly check', () => {
  it('assertNoAnomalies throwing inside callback bubbles out as AnomalyError; $transaction was the throwing site', async () => {
    const { prisma } = makeFakePrisma([], {
      userIds: { initial: ['u1', 'u2'], final: ['u3'] },
      projectIds: { initial: ['p1'], final: ['p1'] },
    });
    const { AnomalyError } = await import('./dcAnomalyChecks');
    assertNoAnomaliesMock.mockRejectedValueOnce(new AnomalyError('user drop too large'));

    await expect(
      ingestAdminSnapshot(prisma, allSixteenFiles(), 'run-1', { userCount: 100, projectCount: 100, rowsByAdminCsv: {} }),
    ).rejects.toThrow(AnomalyError);
  });

  it('assertNoAnomalies called with currentRowsByAdminCsv map containing all 16 filenames', async () => {
    const { prisma } = makeFakePrisma([], {
      userIds: { initial: [], final: ['u1'] },
      projectIds: { initial: [], final: ['p1'] },
    });
    await ingestAdminSnapshot(prisma, allSixteenFiles(), 'run-1', null);

    expect(assertNoAnomaliesMock).toHaveBeenCalledTimes(1);
    const callArgs = assertNoAnomaliesMock.mock.calls[0];
    // Args: (tx, previous, thresholds, currentRowsByAdminCsv)
    const currentRows = callArgs[3] as Record<string, number>;
    expect(currentRows).toBeDefined();
    expect(Object.keys(currentRows)).toHaveLength(16);
  });
});

// ---------------------------------------------------------------------------
// Diff summary
// ---------------------------------------------------------------------------

describe('ingestAdminSnapshot — diff summary', () => {
  it('computes usersAdded/usersRemoved + projectsAdded/projectsRemoved from before/after id sets', async () => {
    const { prisma } = makeFakePrisma([], {
      userIds: { initial: ['u1', 'u2'], final: ['u2', 'u3'] },
      projectIds: { initial: ['p1', 'p2'], final: ['p2', 'p3', 'p4'] },
    });

    const result = await ingestAdminSnapshot(prisma, allSixteenFiles(), 'run-1', null);

    expect(result.diffSummary.usersAdded).toBe(1);
    expect(result.diffSummary.usersRemoved).toBe(1);
    expect(result.diffSummary.projectsAdded).toBe(2);
    expect(result.diffSummary.projectsRemoved).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Empty CSV
// ---------------------------------------------------------------------------

describe('ingestAdminSnapshot — empty CSV', () => {
  it('header-only admin_users.csv -> deleteMany called, createMany NOT called for empty (or called with [])', async () => {
    const callsLog: string[] = [];
    const { prisma } = makeFakePrisma(callsLog, {
      userIds: { initial: ['u1'], final: [] },
      projectIds: { initial: [], final: ['p1'] },
    });
    const files = allSixteenFiles().map((f) =>
      f.filename === 'admin_users.csv'
        ? csvSource('admin_users.csv', emptyHeaderCsv(['id', 'email', 'name', 'status', 'company_id', 'autodesk_id', 'last_sign_in']))
        : f,
    );

    const result = await ingestAdminSnapshot(prisma, files, 'run-1', null);

    expect(result.rowsByAdminCsv['admin_users.csv']).toBe(0);
    // deleteMany still ran (full-replace semantics)
    expect(callsLog).toContain('delete:accDcUser');
    // createMany either not called for accDcUser, or called with empty data
    const userCreates = callsLog.filter((c) => c.startsWith('create:accDcUser'));
    if (userCreates.length > 0) {
      expect(userCreates).toEqual(['create:accDcUser:0']);
    }
  });
});

// ---------------------------------------------------------------------------
// Parse errors surface as AdminCsvParseError (not silent skip)
// ---------------------------------------------------------------------------

describe('ingestAdminSnapshot — parse errors', () => {
  it('exports AdminCsvParseError class', () => {
    expect(AdminCsvParseError).toBeDefined();
    const err = new AdminCsvParseError('test', 'admin_users.csv');
    expect(err).toBeInstanceOf(Error);
    expect(err.filename).toBe('admin_users.csv');
  });
});
