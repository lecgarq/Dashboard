import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'node:stream';
import type { Prisma } from '@prisma/client';
import {
  parseModuleFromFilename,
  ingestActivityCsv,
  KNOWN_MODULES,
  ACTIVITY_FILE_RE,
} from './dcActivityCsvIngest';

// ---------------------------------------------------------------------------
// Pure function tests — parseModuleFromFilename + KNOWN_MODULES
// ---------------------------------------------------------------------------

describe('parseModuleFromFilename', () => {
  it('extracts "docs" from activities_docs_activities.csv (DC8-01)', () => {
    expect(parseModuleFromFilename('activities_docs_activities.csv')).toBe('docs');
  });

  it('extracts each of the 9 known module names', () => {
    const cases: Array<[string, string]> = [
      ['activities_issues_activities.csv', 'issues'],
      ['activities_submittals_activities.csv', 'submittals'],
      ['activities_rfis_activities.csv', 'rfis'],
      ['activities_sheets_activities.csv', 'sheets'],
      ['activities_admin_activities.csv', 'admin'],
      ['activities_cost_activities.csv', 'cost'],
      ['activities_assets_activities.csv', 'assets'],
      ['activities_bridge_activities.csv', 'bridge'],
      ['activities_docs_activities.csv', 'docs'],
    ];
    for (const [filename, expected] of cases) {
      expect(parseModuleFromFilename(filename)).toBe(expected);
    }
  });

  it('returns null for admin_users.csv (non-activity CSV)', () => {
    expect(parseModuleFromFilename('admin_users.csv')).toBeNull();
  });

  it('returns null for activities_docs_changes.csv (Pitfall 11 — _changes audit-trail sibling)', () => {
    expect(parseModuleFromFilename('activities_docs_changes.csv')).toBeNull();
  });

  it('returns null for submittals_target_status.csv (Pitfall 11 — submittals target sibling)', () => {
    expect(parseModuleFromFilename('submittals_target_status.csv')).toBeNull();
  });

  it('is case-insensitive — Activities_Docs_Activities.csv -> docs', () => {
    expect(parseModuleFromFilename('Activities_Docs_Activities.csv')).toBe('docs');
  });

  it('KNOWN_MODULES has exactly 9 entries (DC8-03 — 10th-module guard)', () => {
    expect(KNOWN_MODULES.size).toBe(9);
  });

  it('exports ACTIVITY_FILE_RE matching the strict pattern', () => {
    expect(ACTIVITY_FILE_RE.test('activities_docs_activities.csv')).toBe(true);
    expect(ACTIVITY_FILE_RE.test('activities_docs_changes.csv')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration-shape tests — ingestActivityCsv with mock Prisma + Readable stream
// ---------------------------------------------------------------------------

function buildCsv(rows: Array<Record<string, string>>, withBom = false): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => row[h] ?? '').join(','));
  }
  const body = lines.join('\n') + '\n';
  return withBom ? '﻿' + body : body;
}

function makeMockTx() {
  const created: any[] = [];
  const tx = {
    accActivity: {
      createMany: vi.fn(async ({ data }: { data: any[] }) => {
        created.push(...data);
        return { count: data.length };
      }),
    },
    accProjectMember: {
      findMany: vi.fn(async () => [] as Array<{ autodeskId: string; email: string | null }>),
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, created };
}

describe('ingestActivityCsv', () => {
  it('Test 8: known module + 3 clean rows -> 3 inserts, service=docs on all rows', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv([
      { autodesk_id: 'A1', user_name: 'Alice', raw_action: 'view', created_at: '2026-05-14T10:00:00Z', project_id: 'b.p1' },
      { autodesk_id: 'A2', user_name: 'Bob', raw_action: 'download', created_at: '2026-05-14T10:01:00Z', project_id: 'b.p1' },
      { autodesk_id: 'A3', user_name: 'Carol', raw_action: 'edit', created_at: '2026-05-14T10:02:00Z', project_id: 'b.p2' },
    ]);
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_docs_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.module).toBe('docs');
    expect(result.rowsInserted).toBe(3);
    expect(result.rowsSkippedBot).toBe(0);
    expect(created.length).toBe(3);
    for (const row of created) {
      expect(row.service).toBe('docs');
    }
  });

  it('Test 9: bot rows filtered via isBotActor, only humans inserted', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv([
      { autodesk_id: 'A1', user_name: 'Alice', raw_action: 'view', created_at: '2026-05-14T10:00:00Z', project_id: 'b.p1' },
      { autodesk_id: 'BOT1', user_name: 'Autodesk Cloud Worker', raw_action: 'sync', created_at: '2026-05-14T10:01:00Z', project_id: 'b.p1' },
      { autodesk_id: 'BOT2', user_name: 'BIM 360 System', raw_action: 'sync', created_at: '2026-05-14T10:02:00Z', project_id: 'b.p1' },
    ]);
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_docs_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.rowsInserted).toBe(1);
    expect(result.rowsSkippedBot).toBe(2);
    expect(created.length).toBe(1);
    expect(created[0].autodeskId).toBe('A1');
  });

  it('Test 10: unknown module name -> 0 rows, unknownModule recorded, createMany NEVER called', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv([
      { autodesk_id: 'A1', user_name: 'Alice', raw_action: 'view', created_at: '2026-05-14T10:00:00Z', project_id: 'b.p1' },
    ]);
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_newmod_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.unknownModule).toBe('newmod');
    expect(result.rowsInserted).toBe(0);
    expect(created.length).toBe(0);
    expect((tx.accActivity.createMany as any).mock.calls.length).toBe(0);
  });

  it('Test 11: non-activity filename -> module=null, createMany never called', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv([
      { autodesk_id: 'A1', email: 'alice@example.com' },
    ]);
    const result = await ingestActivityCsv(tx, {
      filename: 'admin_users.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.module).toBeNull();
    expect(result.rowsInserted).toBe(0);
    expect(created.length).toBe(0);
    expect((tx.accActivity.createMany as any).mock.calls.length).toBe(0);
  });

  it('Test 12: 501-row 500-batch boundary -> createMany called exactly twice (500 + 1)', async () => {
    const { tx, created } = makeMockTx();
    const rows = Array.from({ length: 501 }, (_, i) => ({
      autodesk_id: `A${i}`,
      user_name: `User${i}`,
      raw_action: 'view',
      created_at: `2026-05-14T10:00:${String(i % 60).padStart(2, '0')}Z`,
      project_id: 'b.p1',
    }));
    const csv = buildCsv(rows);
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_docs_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.rowsInserted).toBe(501);
    expect(created.length).toBe(501);
    const calls = (tx.accActivity.createMany as any).mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0].data.length).toBe(500);
    expect(calls[1][0].data.length).toBe(1);
  });

  it('Test 13: BOM-prefixed CSV -> first row parsed correctly (BOM stripped)', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv(
      [
        { autodesk_id: 'A1', user_name: 'Alice', raw_action: 'view', created_at: '2026-05-14T10:00:00Z', project_id: 'b.p1' },
      ],
      /* withBom */ true,
    );
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_docs_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.rowsInserted).toBe(1);
    expect(created[0].autodeskId).toBe('A1');
    expect(created[0].service).toBe('docs');
  });

  it('emailLookup is honored — autodeskId resolves to email when present', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv([
      { autodesk_id: 'A1', user_name: 'Alice', raw_action: 'view', created_at: '2026-05-14T10:00:00Z', project_id: 'b.p1' },
    ]);
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_docs_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map([['A1', 'alice@example.com']]),
    });
    expect(result.rowsInserted).toBe(1);
    expect(created[0].userEmail).toBe('alice@example.com');
  });

  it('rows with invalid createdAt are skipped (counted, not crashed)', async () => {
    const { tx, created } = makeMockTx();
    const csv = buildCsv([
      { autodesk_id: 'A1', user_name: 'Alice', raw_action: 'view', created_at: 'not-a-date', project_id: 'b.p1' },
      { autodesk_id: 'A2', user_name: 'Bob', raw_action: 'view', created_at: '2026-05-14T10:01:00Z', project_id: 'b.p1' },
    ]);
    const result = await ingestActivityCsv(tx, {
      filename: 'activities_docs_activities.csv',
      csvStream: Readable.from([csv]),
      ingestRunId: 'run-1',
      emailLookup: new Map(),
    });
    expect(result.rowsInserted).toBe(1);
    expect(created.length).toBe(1);
    expect(created[0].autodeskId).toBe('A2');
  });
});
