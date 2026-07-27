/**
 * Streaming ZIP ingest for APS Data Connector activity exports (ACTV-01 + ACTV-02).
 *
 * Downloads the signed S3 ZIP (no Authorization header — APS signs in querystring),
 * stream-unzips with `unzipper`, filters to `project_activities.csv` and
 * `admin_activities.csv`, stream-parses with `csv-parse`, and batched-inserts
 * into AccActivity via `createMany({ skipDuplicates: true })`.
 *
 * Memory profile: O(BATCH × row size) = ~500KB peak, regardless of ZIP size.
 *
 * Source pattern: 03-RESEARCH.md Pattern 2 + Pitfall 5 (entry serialization).
 */

import { Readable } from "node:stream";
import type { PrismaClient } from "@prisma/client";
import unzipper from "unzipper";
import { parse } from "csv-parse";

const BATCH = 500; // Pitfall 3: do NOT raise — Railway container memory.

const LEGACY_TARGET_CSVS = new Set(["project_activities.csv", "admin_activities.csv"]);
const USER_LOOKUP_CSVS = new Set(["admin_users.csv"]);

function isActivityCsv(filename: string): boolean {
  return LEGACY_TARGET_CSVS.has(filename) || /(?:^|_)activities\.csv$/i.test(filename);
}

export interface IngestResult {
  rowsByFile: Record<string, number>;
  unresolved: number;
}

type CsvRow = Record<string, string | undefined>;

interface MappedRow {
  autodeskId: string;
  userEmail: string | null;
  projectId: string; // sentinel "" for admin rows so @@unique dedup applies
  rawAction: string;
  service: string | null;
  tool: string | null;
  details: string | null;
  sourceFile: "project" | "admin";
  createdAt: Date;
}

/**
 * Map a raw CSV row to the AccActivity insert shape.
 *
 * Returns null for rows that are missing required fields (autodeskId, rawAction,
 * createdAt) — these can't be deduped via the composite @@unique and would
 * silently collide.
 */
function mapCsvRow(row: CsvRow, sourceFile: "project" | "admin"): MappedRow | null {
  // APS Data Connector CSV column names (verified from
  // APS_DOCS/HOW TO/HOW_TO_Extract_Activity_Logs.md + Phase 1 ingest research).
  // Defensive: accept both snake_case and camelCase variants.
  const autodeskId =
    row.user_id ?? row.userId ?? row.actor_id ?? row.actorId ?? row.created_by ?? "";
  const rawAction = row.action ?? row.action_type ?? row.actionType ?? row.activity_verb ?? "";
  const createdAtRaw =
    row.created_at ?? row.createdAt ?? row.timestamp ?? row.event_time ?? "";

  if (!autodeskId || !rawAction || !createdAtRaw) {
    return null;
  }

  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  const rawProjectId = row.project_id ?? row.projectId ?? row.bim360_project_id ?? "";
  // Admin rows lack projectId; sentinel "" keeps the @@unique dedup live
  // (Postgres treats NULL != NULL in unique constraints).
  const projectId = sourceFile === "admin" ? "" : rawProjectId || "";

  const userEmailRaw = row.user_email ?? row.userEmail ?? row.email ?? "";
  const userEmail = userEmailRaw ? userEmailRaw.toLowerCase() : null;

  return {
    autodeskId,
    userEmail,
    projectId,
    rawAction,
    service: row.service ?? row.service_name ?? null,
    tool: row.tool ?? row.tool_name ?? null,
    details:
      row.details ??
      row.description ??
      row.object_display_name ??
      row.target_display_name ??
      row.object_file_name ??
      null,
    sourceFile,
    createdAt,
  };
}

/**
 * Enrich rows with `userEmail` looked up from `AccProjectMember.autodeskId`.
 * Inline per-batch lookup avoids a second post-ingest pass.
 */
async function enrichEmails(
  rows: MappedRow[],
  prisma: PrismaClient,
  zipUserEmailById?: ReadonlyMap<string, string>
): Promise<void> {
  // Only look up rows that don't already have an email from the CSV.
  const idsToLookup = new Set<string>();
  for (const r of rows) {
    if (!r.userEmail && r.autodeskId) idsToLookup.add(r.autodeskId);
  }
  if (idsToLookup.size === 0) return;

  const idToEmail = new Map<string, string>();
  for (const id of idsToLookup) {
    const email = zipUserEmailById?.get(id);
    if (email) idToEmail.set(id, email.toLowerCase());
  }

  const members = await prisma.accProjectMember.findMany({
    where: { autodeskId: { in: Array.from(idsToLookup) } },
    select: { autodeskId: true, email: true },
  });

  for (const m of members) {
    if (m.email && !idToEmail.has(m.autodeskId)) {
      idToEmail.set(m.autodeskId, m.email.toLowerCase());
    }
  }

  const unresolvedIds = Array.from(idsToLookup).filter((id) => !idToEmail.has(id));
  if (unresolvedIds.length > 0) {
    const cachedMembers = await prisma.accMemberCache.findMany({
      select: { email: true, data: true },
    });
    const unresolved = new Set(unresolvedIds);
    for (const member of cachedMembers) {
      if (!member.email || !member.data || typeof member.data !== "object") continue;
      const autodeskId = (member.data as Record<string, unknown>).autodeskId;
      if (typeof autodeskId === "string" && unresolved.has(autodeskId)) {
        idToEmail.set(autodeskId, member.email.toLowerCase());
        unresolved.delete(autodeskId);
        if (unresolved.size === 0) break;
      }
    }
  }

  for (const r of rows) {
    if (!r.userEmail && r.autodeskId) {
      const email = idToEmail.get(r.autodeskId);
      if (email) r.userEmail = email;
    }
  }
}

/**
 * Ingest one CSV entry stream into AccActivity in BATCH-sized chunks.
 * Returns the number of rows that passed through createMany (before dedup).
 */
async function ingestCsvEntry(
  entry: NodeJS.ReadableStream,
  sourceFile: "project" | "admin",
  prisma: PrismaClient,
  zipUserEmailById: ReadonlyMap<string, string>
): Promise<number> {
  const parser = parse({
    columns: true,
    bom: true, // Pitfall 1: non-negotiable for Excel/Windows-encoded CSVs.
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  });

  let buffer: MappedRow[] = [];
  let totalRows = 0;
  let skipped = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    const slice = buffer;
    buffer = [];
    await enrichEmails(slice, prisma, zipUserEmailById);
    await prisma.accActivity.createMany({
      data: slice,
      skipDuplicates: true,
    });
    totalRows += slice.length;
  };

  // Pipe ZIP entry → csv-parse. We iterate the parser as an async iterable
  // so backpressure is honored automatically (no manual pause/resume).
  entry.pipe(parser);

  try {
    for await (const raw of parser as AsyncIterable<CsvRow>) {
      const mapped = mapCsvRow(raw, sourceFile);
      if (!mapped) {
        skipped++;
        continue;
      }
      buffer.push(mapped);
      if (buffer.length >= BATCH) {
        await flush();
      }
    }
    await flush();
  } finally {
    if (skipped > 0) {
      console.warn(
        `[ingestActivityZip] ${sourceFile}: skipped ${skipped} rows missing autodeskId/rawAction/createdAt`
      );
    }
  }

  return totalRows;
}

async function loadZipUserEmailMap(downloadUrl: string): Promise<Map<string, string>> {
  const res = await fetch(downloadUrl);
  if (!res.ok || !res.body) {
    throw new Error(
      `[ingestActivityZip] Signed S3 GET failed while loading user map: HTTP ${res.status}`
    );
  }

  const emailsById = new Map<string, string>();
  const directory = Readable.fromWeb(res.body as never).pipe(
    unzipper.Parse({ forceStream: true })
  );

  for await (const entryUnknown of directory as AsyncIterable<unknown>) {
    const entry = entryUnknown as {
      path: string;
      type: string;
      autodrain: () => void;
    } & NodeJS.ReadableStream;

    const filename = entry.path.split("/").pop() ?? entry.path;
    if (entry.type !== "File" || !USER_LOOKUP_CSVS.has(filename)) {
      entry.autodrain();
      continue;
    }

    const parser = parse({
      columns: true,
      bom: true,
      relax_column_count: true,
      trim: true,
      skip_empty_lines: true,
    });
    entry.pipe(parser);

    for await (const row of parser as AsyncIterable<CsvRow>) {
      const autodeskId = row.autodesk_id ?? row.autodeskId ?? row.id ?? "";
      const email = row.email?.toLowerCase();
      if (autodeskId && email) emailsById.set(autodeskId, email);
    }
  }

  return emailsById;
}

/**
 * Download a signed S3 ZIP from APS Data Connector and ingest both target CSVs.
 *
 * @param downloadUrl Pre-signed S3 URL from APS `/requests/:id/jobs` (NO Authorization header — Pitfall 2).
 * @param prisma Caller-owned Prisma client. Helper does NOT call `$disconnect()`.
 * @param jobId AccDataConnectorJob.id (for log correlation).
 */
export async function ingestActivityZip(
  downloadUrl: string,
  prisma: PrismaClient,
  jobId: string
): Promise<IngestResult> {
  const zipUserEmailById = await loadZipUserEmailMap(downloadUrl);

  // Bare fetch — no Authorization header. APS signed URLs return 403 with any
  // Authorization header attached (HOW_TO_Extract_Activity_Logs.md + RESEARCH Pitfall 2).
  const res = await fetch(downloadUrl);
  if (!res.ok || !res.body) {
    throw new Error(
      `[ingestActivityZip] Signed S3 GET failed for job ${jobId}: HTTP ${res.status}`
    );
  }

  const counts: Record<string, number> = {};
  let unresolvedDelta = 0;

  // Capture starting UnresolvedAttribution count to compute delta from this run.
  // Cheap aggregate count is fine vs. tracking inline (forensic table grows slowly).
  const unresolvedBefore = await prisma.unresolvedAttribution.count();

  // Web ReadableStream → Node Readable (Node 22 fetch returns WHATWG stream).
  const nodeStream = Readable.fromWeb(res.body as never);

  // Collect entries first so we can process them strictly sequentially (Pitfall 5).
  // unzipper.Parse() is a Transform; iterating its async output gives us one
  // entry at a time with no in-flight overlap.
  const directory = nodeStream.pipe(unzipper.Parse({ forceStream: true }));

  for await (const entryUnknown of directory as AsyncIterable<unknown>) {
    const entry = entryUnknown as {
      path: string;
      type: string;
      autodrain: () => void;
    } & NodeJS.ReadableStream;

    const filename = entry.path.split("/").pop() ?? entry.path;

    if (entry.type !== "File" || !isActivityCsv(filename)) {
      entry.autodrain();
      continue;
    }

    const sourceFile: "project" | "admin" = filename.startsWith("admin")
      || filename.includes("admin_activities")
      ? "admin"
      : "project";

    try {
      const inserted = await ingestCsvEntry(entry, sourceFile, prisma, zipUserEmailById);
      counts[filename] = (counts[filename] ?? 0) + inserted;
      console.log(
        `[ingestActivityZip] job ${jobId} ${filename}: processed ${inserted} rows`
      );
    } catch (err) {
      console.error(
        `[ingestActivityZip] job ${jobId} ${filename} failed:`,
        err instanceof Error ? err.message : err
      );
      throw err;
    }
  }

  const unresolvedAfter = await prisma.unresolvedAttribution.count();
  unresolvedDelta = Math.max(0, unresolvedAfter - unresolvedBefore);

  return { rowsByFile: counts, unresolved: unresolvedDelta };
}
