/**
 * dcAdminCsvIngest — DC8-05 + DC8-06 transactional 16-CSV admin/permission snapshot.
 *
 * Each daily DC ingest replaces the entirety of all 16 AccDc* permission tables
 * inside a single `prisma.$transaction` (Serializable isolation). If
 * `assertNoAnomalies` throws, ALL 16 tables roll back — the dashboard never
 * sees an empty intermediate state.
 *
 * RESEARCH.md Pattern 2 (transaction shape) + Pattern 4 (anomaly gate).
 * Pitfall 11 defense: explicit allow-list — no greedy `admin_*.csv` glob.
 *
 * Bot filter (dcKnownBots) does NOT apply here — admin CSVs are entity-snapshot
 * tables, not event streams.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import { parse as parseCsv } from 'csv-parse';

import { assertNoAnomalies, DEFAULT_THRESHOLDS, type PreviousRunMetrics } from './dcAnomalyChecks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminFileSource {
  filename: string;
  csvStream: NodeJS.ReadableStream;
}

export interface AdminSnapshotResult {
  rowsByAdminCsv: Record<string, number>;
  missingFiles: string[]; // any allow-list entry not in input
  skippedFiles: string[]; // any input file not in allow-list
  diffSummary: {
    usersAdded: number;
    usersRemoved: number;
    projectsAdded: number;
    projectsRemoved: number;
  };
}

export class AdminCsvParseError extends Error {
  filename: string;
  constructor(message: string, filename: string) {
    super(`[${filename}] ${message}`);
    this.name = 'AdminCsvParseError';
    this.filename = filename;
  }
}

// CsvRow = freeform string-keyed object from csv-parse (columns:true mode).
type CsvRow = Record<string, string | undefined>;

interface AllowlistEntry {
  filename: string;
  // Prisma TransactionClient model accessor key (camelCase).
  model: keyof Prisma.TransactionClient;
  mapper: (row: CsvRow, ctx: MapperCtx) => Record<string, unknown>;
}

interface MapperCtx {
  ingestRunId: string;
  ingestedAt: Date;
}

// ---------------------------------------------------------------------------
// Mappers — one per CSV. Each takes a parsed row (snake_case keys from APS DC
// output) and returns the Prisma createMany row shape (camelCase fields per
// schema.prisma AccDc* models). Always include `ingestRunId` + `ingestedAt`
// for tables that have those columns (all 16 do).
// ---------------------------------------------------------------------------

function toDateOrNull(value: string | undefined): Date | null {
  if (!value || value.trim() === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nullable(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function required(value: string | undefined, field: string, filename: string): string {
  const v = nullable(value);
  if (v == null) {
    throw new AdminCsvParseError(`Required field "${field}" missing or empty`, filename);
  }
  return v;
}

const mapAdminUser = (row: CsvRow, ctx: MapperCtx) => ({
  id: required(row.id, 'id', 'admin_users.csv'),
  email: nullable(row.email),
  name: nullable(row.name),
  status: nullable(row.status),
  companyId: nullable(row.company_id),
  autodeskId: nullable(row.autodesk_id),
  lastSignIn: toDateOrNull(row.last_sign_in),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminCompany = (row: CsvRow, ctx: MapperCtx) => ({
  id: required(row.id, 'id', 'admin_companies.csv'),
  name: required(row.name, 'name', 'admin_companies.csv'),
  hubId: nullable(row.hub_id),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProject = (row: CsvRow, ctx: MapperCtx) => ({
  id: required(row.id, 'id', 'admin_projects.csv'),
  accountId: required(row.account_id, 'account_id', 'admin_projects.csv'),
  name: required(row.name, 'name', 'admin_projects.csv'),
  jobNumber: nullable(row.job_number),
  status: nullable(row.status),
  type: nullable(row.type),
  createdAt: toDateOrNull(row.created_at),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminAccount = (row: CsvRow, ctx: MapperCtx) => ({
  id: required(row.id, 'id', 'admin_accounts.csv'),
  name: required(row.name, 'name', 'admin_accounts.csv'),
  region: nullable(row.region),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminBusinessUnit = (row: CsvRow, ctx: MapperCtx) => ({
  id: required(row.id, 'id', 'admin_business_units.csv'),
  name: required(row.name, 'name', 'admin_business_units.csv'),
  accountId: nullable(row.account_id),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminRole = (row: CsvRow, ctx: MapperCtx) => ({
  id: required(row.id, 'id', 'admin_roles.csv'),
  name: required(row.name, 'name', 'admin_roles.csv'),
  accountId: nullable(row.account_id),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectUser = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_users.csv'),
  userId: required(row.user_id, 'user_id', 'admin_project_users.csv'),
  status: nullable(row.status),
  addedOn: toDateOrNull(row.added_on),
  lastSignIn: toDateOrNull(row.last_sign_in),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectUserRole = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_user_roles.csv'),
  userId: required(row.user_id, 'user_id', 'admin_project_user_roles.csv'),
  roleId: required(row.role_id, 'role_id', 'admin_project_user_roles.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectUserProduct = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_user_products.csv'),
  userId: required(row.user_id, 'user_id', 'admin_project_user_products.csv'),
  productKey: required(row.product_key, 'product_key', 'admin_project_user_products.csv'),
  accessLevel: required(row.access_level, 'access_level', 'admin_project_user_products.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectUserCompany = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_user_companies.csv'),
  userId: required(row.user_id, 'user_id', 'admin_project_user_companies.csv'),
  companyId: required(row.company_id, 'company_id', 'admin_project_user_companies.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectUserService = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_user_services.csv'),
  userId: required(row.user_id, 'user_id', 'admin_project_user_services.csv'),
  serviceKey: required(row.service_key, 'service_key', 'admin_project_user_services.csv'),
  accessLevel: required(row.access_level, 'access_level', 'admin_project_user_services.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectRole = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_roles.csv'),
  roleId: required(row.role_id, 'role_id', 'admin_project_roles.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectProduct = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_products.csv'),
  productKey: required(row.product_key, 'product_key', 'admin_project_products.csv'),
  accessLevel: required(row.access_level, 'access_level', 'admin_project_products.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectCompany = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_companies.csv'),
  companyId: required(row.company_id, 'company_id', 'admin_project_companies.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminProjectService = (row: CsvRow, ctx: MapperCtx) => ({
  projectId: required(row.project_id, 'project_id', 'admin_project_services.csv'),
  serviceKey: required(row.service_key, 'service_key', 'admin_project_services.csv'),
  accessLevel: required(row.access_level, 'access_level', 'admin_project_services.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

const mapAdminAccountService = (row: CsvRow, ctx: MapperCtx) => ({
  accountId: required(row.account_id, 'account_id', 'admin_account_services.csv'),
  serviceKey: required(row.service_key, 'service_key', 'admin_account_services.csv'),
  accessLevel: required(row.access_level, 'access_level', 'admin_account_services.csv'),
  ingestRunId: ctx.ingestRunId,
  ingestedAt: ctx.ingestedAt,
});

// ---------------------------------------------------------------------------
// Allow-list — explicit, no greedy patterns (Pitfall 11). Order matters:
// declared order is the order deleteMany + createMany are issued inside the
// transaction. Stable order makes test assertions + log-trace deterministic.
// ---------------------------------------------------------------------------

export const ADMIN_CSV_ALLOWLIST: AllowlistEntry[] = [
  { filename: 'admin_users.csv', model: 'accDcUser', mapper: mapAdminUser },
  { filename: 'admin_companies.csv', model: 'accDcCompany', mapper: mapAdminCompany },
  { filename: 'admin_projects.csv', model: 'accDcProject', mapper: mapAdminProject },
  { filename: 'admin_accounts.csv', model: 'accDcAccount', mapper: mapAdminAccount },
  { filename: 'admin_business_units.csv', model: 'accDcBusinessUnit', mapper: mapAdminBusinessUnit },
  { filename: 'admin_roles.csv', model: 'accDcRole', mapper: mapAdminRole },
  { filename: 'admin_project_users.csv', model: 'accDcProjectUser', mapper: mapAdminProjectUser },
  { filename: 'admin_project_user_roles.csv', model: 'accDcProjectUserRole', mapper: mapAdminProjectUserRole },
  { filename: 'admin_project_user_products.csv', model: 'accDcProjectUserProduct', mapper: mapAdminProjectUserProduct },
  { filename: 'admin_project_user_companies.csv', model: 'accDcProjectUserCompany', mapper: mapAdminProjectUserCompany },
  { filename: 'admin_project_user_services.csv', model: 'accDcProjectUserService', mapper: mapAdminProjectUserService },
  { filename: 'admin_project_roles.csv', model: 'accDcProjectRole', mapper: mapAdminProjectRole },
  { filename: 'admin_project_products.csv', model: 'accDcProjectProduct', mapper: mapAdminProjectProduct },
  { filename: 'admin_project_companies.csv', model: 'accDcProjectCompany', mapper: mapAdminProjectCompany },
  { filename: 'admin_project_services.csv', model: 'accDcProjectService', mapper: mapAdminProjectService },
  { filename: 'admin_account_services.csv', model: 'accDcAccountService', mapper: mapAdminAccountService },
];

// ---------------------------------------------------------------------------
// CSV streaming — buffer into BATCH-sized chunks. Mirrors ingestActivityZip.ts
// csv-parse options (columns:true, bom:true, relax_column_count:true).
// ---------------------------------------------------------------------------

const BATCH = 500;

async function streamParseCsvToRows(
  source: AdminFileSource,
  mapper: (row: CsvRow, ctx: MapperCtx) => Record<string, unknown>,
  ctx: MapperCtx,
): Promise<Record<string, unknown>[]> {
  const parser = parseCsv({
    columns: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  });
  source.csvStream.pipe(parser);
  const out: Record<string, unknown>[] = [];
  try {
    for await (const raw of parser as AsyncIterable<CsvRow>) {
      out.push(mapper(raw, ctx));
    }
  } catch (err) {
    if (err instanceof AdminCsvParseError) throw err;
    throw new AdminCsvParseError(
      err instanceof Error ? err.message : String(err),
      source.filename,
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function ingestAdminSnapshot(
  prisma: PrismaClient,
  files: AdminFileSource[],
  ingestRunId: string,
  previous: PreviousRunMetrics | null,
): Promise<AdminSnapshotResult> {
  // Index input by filename
  const byFilename = new Map<string, AdminFileSource>();
  for (const f of files) byFilename.set(f.filename, f);

  // Diff input vs allow-list
  const allowlistFilenames = new Set(ADMIN_CSV_ALLOWLIST.map((e) => e.filename));
  const inputFilenames = new Set(byFilename.keys());

  const missingFiles: string[] = [];
  for (const expected of ADMIN_CSV_ALLOWLIST) {
    if (!inputFilenames.has(expected.filename)) missingFiles.push(expected.filename);
  }
  const skippedFiles: string[] = [];
  for (const incoming of inputFilenames) {
    if (!allowlistFilenames.has(incoming)) {
      skippedFiles.push(incoming);
      // eslint-disable-next-line no-console
      console.warn(`[dcAdminCsvIngest] Unknown admin CSV "${incoming}" — skipped (not in ADMIN_CSV_ALLOWLIST)`);
    }
  }

  const ctx: MapperCtx = { ingestRunId, ingestedAt: new Date() };
  const rowsByAdminCsv: Record<string, number> = {};
  let usersAdded = 0;
  let usersRemoved = 0;
  let projectsAdded = 0;
  let projectsRemoved = 0;

  await prisma.$transaction(
    async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const txAny = tx as any;

      // Capture pre-state for diff summary (before any deletes)
      const [prevUserRows, prevProjectRows] = await Promise.all([
        txAny.accDcUser.findMany({ select: { id: true } }) as Promise<{ id: string }[]>,
        txAny.accDcProject.findMany({ select: { id: true } }) as Promise<{ id: string }[]>,
      ]);
      const prevUserIds = new Set(prevUserRows.map((r) => r.id));
      const prevProjectIds = new Set(prevProjectRows.map((r) => r.id));

      // Process each allow-list entry in declared order
      for (const entry of ADMIN_CSV_ALLOWLIST) {
        const source = byFilename.get(entry.filename);
        if (!source) {
          // Missing — record 0 and continue. assertNoAnomalies will flag it later
          // if requireAllAdminCsvs is set against a previous baseline.
          rowsByAdminCsv[entry.filename] = 0;
          continue;
        }

        // Stream parse first, then atomic delete + batched create.
        const rows = await streamParseCsvToRows(source, entry.mapper, ctx);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = txAny[entry.model as string];
        await model.deleteMany({});

        if (rows.length > 0) {
          // Batch into 500-row chunks for createMany
          for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            await model.createMany({ data: slice });
          }
        } else {
          // Header-only CSV — invoke createMany with empty array to keep the
          // call surface consistent (tests assert deleteMany ran; createMany
          // with [] is acceptable per plan task 1 case 8).
          await model.createMany({ data: [] });
        }

        rowsByAdminCsv[entry.filename] = rows.length;
      }

      // Capture post-state for diff summary
      const [newUserRows, newProjectRows] = await Promise.all([
        txAny.accDcUser.findMany({ select: { id: true } }) as Promise<{ id: string }[]>,
        txAny.accDcProject.findMany({ select: { id: true } }) as Promise<{ id: string }[]>,
      ]);
      const newUserIds = new Set(newUserRows.map((r) => r.id));
      const newProjectIds = new Set(newProjectRows.map((r) => r.id));

      for (const id of newUserIds) if (!prevUserIds.has(id)) usersAdded++;
      for (const id of prevUserIds) if (!newUserIds.has(id)) usersRemoved++;
      for (const id of newProjectIds) if (!prevProjectIds.has(id)) projectsAdded++;
      for (const id of prevProjectIds) if (!newProjectIds.has(id)) projectsRemoved++;

      // Anomaly gate — throws inside callback => Prisma rolls back the tx.
      await assertNoAnomalies(
        tx,
        previous,
        { ...DEFAULT_THRESHOLDS, requireAllAdminCsvs: true },
        rowsByAdminCsv,
      );
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      timeout: 5 * 60 * 1000, // 5 min — full snapshot of 16 tables
      maxWait: 30_000,
    },
  );

  return {
    rowsByAdminCsv,
    missingFiles,
    skippedFiles,
    diffSummary: { usersAdded, usersRemoved, projectsAdded, projectsRemoved },
  };
}
