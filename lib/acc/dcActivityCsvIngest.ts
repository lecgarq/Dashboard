/**
 * dcActivityCsvIngest — per-module activity CSV ingest for the new APS Data
 * Connector schema (DC8-01 + DC8-03). Replaces the legacy single-ZIP path
 * (`lib/acc/ingestActivityZip.ts`) for the per-file backfill format introduced
 * by the 2-yr DC dry-run discovery (2026-05-15).
 *
 * Per CSV file:
 *   1. parseModuleFromFilename — strict regex; rejects _changes.csv siblings
 *      and submittals_target_*.csv (Pitfall 11).
 *   2. Unknown module name -> early return with `unknownModule` set; createMany
 *      is NEVER called (10th-module guard, RESEARCH Pattern 3).
 *   3. csv-parse with `bom: true, columns: true, relax_column_count: true`
 *      (Phase 3 03-01 decision; Pitfall 1).
 *   4. Per-row: drop bots via `isBotActor`; map to AccActivity shape with
 *      `service: <module>` ALWAYS set (RESEARCH Anti-Patterns point 3).
 *   5. Batched insert via `tx.accActivity.createMany({ skipDuplicates: true })`
 *      at 500-row boundary (Pitfall 3 — Railway memory).
 *
 * Pure-ish: depends on `csv-parse` and Prisma types only. The Prisma client
 * itself is injected by the orchestrator (plan 08-06) so this module is
 * trivially unit-testable with a mocked tx.
 */

import { parse as csvParse } from 'csv-parse';
import type { Prisma } from '@prisma/client';
import { isBotActor } from './dcKnownBots';

const BATCH = 500;

export const KNOWN_MODULES: Set<string> = new Set([
  'docs',
  'issues',
  'submittals',
  'rfis',
  'sheets',
  'admin',
  'cost',
  'assets',
  'bridge',
]);

// Strict regex — rejects activities_<mod>_changes.csv (audit-trail siblings)
// and submittals_target_*.csv (Pitfall 11). Case-insensitive for the rare
// Excel-roundtrip CSV that title-cases the filename.
export const ACTIVITY_FILE_RE = /^activities_([a-z_]+)_activities\.csv$/i;

export function parseModuleFromFilename(filename: string): string | null {
  const m = ACTIVITY_FILE_RE.exec(filename);
  if (!m) return null;
  return m[1].toLowerCase();
}

export interface IngestActivityCsvInput {
  filename: string;
  csvStream: NodeJS.ReadableStream;
  ingestRunId: string;
  /** autodeskId -> email; from admin_users.csv prefetch (orchestrator-owned). */
  emailLookup: Map<string, string>;
}

export interface IngestActivityCsvResult {
  module: string | null;
  rowsInserted: number;
  rowsSkippedBot: number;
  rowsSkippedNoModule: number;
  unknownModule: string | null;
}

type CsvRow = Record<string, string | undefined>;

interface MappedRow {
  autodeskId: string;
  userEmail: string | null;
  projectId: string;
  rawAction: string;
  service: string;
  tool: string | null;
  details: string | null;
  ingestRunId: string;
  createdAt: Date;
}

function parseApsDate(raw: string): Date {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)
    ? `${raw.replace(' ', 'T')}Z`
    : raw;
  return new Date(normalized);
}

export async function ingestActivityCsv(
  tx: Prisma.TransactionClient,
  input: IngestActivityCsvInput,
): Promise<IngestActivityCsvResult> {
  const moduleName = parseModuleFromFilename(input.filename);

  // Non-activity filename — surface to caller; orchestrator may route to admin
  // CSV ingest (plan 08-05) or skip.
  if (moduleName === null) {
    return {
      module: null,
      rowsInserted: 0,
      rowsSkippedBot: 0,
      rowsSkippedNoModule: 1,
      unknownModule: null,
    };
  }

  // 10th-module guard (DC8-03): unknown module name flows up to the orchestrator
  // for runtime logging into AccDcIngestRun.unknownModulesSeen. Do NOT createMany.
  if (!KNOWN_MODULES.has(moduleName)) {
    return {
      module: moduleName,
      rowsInserted: 0,
      rowsSkippedBot: 0,
      rowsSkippedNoModule: 0,
      unknownModule: moduleName,
    };
  }

  const parser = csvParse({
    columns: true,
    bom: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  });

  let buffer: MappedRow[] = [];
  let rowsInserted = 0;
  let rowsSkippedBot = 0;
  let rowsSkippedNoModule = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    const slice = buffer;
    buffer = [];
    await tx.accActivity.createMany({ data: slice, skipDuplicates: true });
    rowsInserted += slice.length;
  };

  input.csvStream.pipe(parser);

  // 2026-05-18 diagnostic: log the column set + first-row sample of every parsed
  // CSV. We just shipped a fix for ingestRunId schema drift (Bug A) but the probe
  // still inserted zero rows, which suggests a second silent failure mode — most
  // likely that DC renamed columns in the new 30-day-window schema and every row
  // hits the !autodeskId/!rawAction/!createdAtRaw guard. This log answers it
  // definitively next run without burning quota on speculation. Remove once Bug D
  // is diagnosed and the column-name list at lines 135/143/144 is updated.
  let diagnosticLogged = false;

  for await (const raw of parser as AsyncIterable<CsvRow>) {
    if (!diagnosticLogged) {
      diagnosticLogged = true;
      // eslint-disable-next-line no-console
      console.log(
        `[dcActivityCsvIngest:diagnostic] file=${input.filename} columns=${JSON.stringify(Object.keys(raw))} sample=${JSON.stringify(raw).slice(0, 500)}`,
      );
    }
    const autodeskId =
      raw.autodesk_id ??
      raw.autodeskId ??
      raw.user_id ??
      raw.userId ??
      raw.created_by ??
      raw.createdBy ??
      '';
    const name = raw.user_name ?? raw.userName ?? raw.name ?? null;

    if (isBotActor({ autodeskId: autodeskId || null, name })) {
      rowsSkippedBot += 1;
      continue;
    }

    const rawAction =
      raw.raw_action ??
      raw.action ??
      raw.action_type ??
      raw.actionType ??
      raw.activity_verb ??
      raw.activityVerb ??
      '';
    const createdAtRaw = raw.created_at ?? raw.createdAt ?? raw.timestamp ?? '';
    if (!autodeskId || !rawAction || !createdAtRaw) {
      rowsSkippedNoModule += 1;
      continue;
    }
    const createdAt = parseApsDate(createdAtRaw);
    if (Number.isNaN(createdAt.getTime())) {
      rowsSkippedNoModule += 1;
      continue;
    }

    const projectIdRaw = raw.project_id ?? raw.projectId ?? raw.bim360_project_id ?? '';
    // Empty-string sentinel for admin rows so the AccActivity composite @@unique
    // dedup applies (Postgres treats NULL != NULL in unique constraints).
    const projectId = projectIdRaw || '';

    const lookupEmail = input.emailLookup.get(autodeskId);
    const csvEmail = (raw.user_email ?? raw.userEmail ?? raw.email ?? '').toLowerCase() || null;

    const tool = raw.tool ?? raw.tool_name ?? null;
    const details =
      raw.details ??
      raw.description ??
      raw.object_display_name ??
      raw.target_display_name ??
      raw.object_file_name ??
      null;

    buffer.push({
      autodeskId,
      userEmail: lookupEmail ?? csvEmail ?? null,
      projectId,
      rawAction,
      service: moduleName, // ALWAYS set — RESEARCH Anti-Patterns point 3.
      tool,
      details,
      ingestRunId: input.ingestRunId,
      createdAt,
    });

    if (buffer.length >= BATCH) {
      await flush();
    }
  }

  await flush();

  return {
    module: moduleName,
    rowsInserted,
    rowsSkippedBot,
    rowsSkippedNoModule,
    unknownModule: null,
  };
}
