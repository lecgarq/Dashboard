/**
 * dcIngest — Phase 8 Wave-2 daily orchestrator (plan 08-06).
 *
 * Composes the Wave-1 pure libraries with the APS HTTP protocol extracted
 * from `scripts/dc-ingest-where-i-admin.cjs` (the proven 470-line reference
 * impl). One call to `runDcIngest(prisma)` performs:
 *
 *   1. Kill-switch gate (DC8-10)             — `.dc-ingest.disabled` at repo root
 *   2. Stale-lock guard                       — reclaim status='running' rows >60min old
 *   3. Open AccDcIngestRun row                — status='running'
 *   4. Plan slice via planDailySlice          — yesterday-UTC bound
 *   5. Refresh 3-leg APS token                — lib/server/aps-oauth.refreshUserToken
 *   6. Per-Slice POST /requests               — dcSubmit() w/ retries + 504 handling
 *   7. Poll each request                      — reduceJobsStatus() exponential backoff
 *   8. Per-job /data-listing + per-file       — bare fetch(signedUrl), NO auth header (Pitfall 1)
 *      stream → ingestActivityCsv             — for activities_*_activities.csv files
 *      buffer → ingestAdminSnapshot           — for admin_*.csv files (Wave-1 plan 08-05)
 *   9. applySliceCompletion + upsert          — per project, per Slice
 *  10. Newly-detected projects (DC8-13)       — admin_projects.csv -> AccDcBackfillProgress upsert
 *  11. Finalize AccDcIngestRun row            — status + metrics + diff + unknownModulesSeen
 *
 * Quota exhaustion (HTTP 429 from APS) -> mark run 'quota-paused' and exit
 * cleanly so the next-day run resumes (DC8-11). All non-quota failures land
 * in status='failed' or 'quarantined' (assertNoAnomalies throw).
 *
 * Requirements: DC8-07/08/10/11/12/13.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';

import { refreshUserToken } from '@/lib/server/aps-oauth';
import { discoverAdminProjects, get2LegToken } from '@/lib/acc/dcProjectDiscovery';
import {
  planDailySlice,
  applySliceCompletion,
  type ProjectProgress,
  type Slice,
} from '@/lib/acc/dcProgressiveBackfill';
import {
  buildQuotaBudget,
  isSameUtcDay,
  limitSlicesToBudget,
  nextDailyQuotaReset,
} from '@/lib/acc/dcQuota';
import {
  ingestActivityCsv,
  parseModuleFromFilename,
  KNOWN_MODULES,
  ACTIVITY_FILE_RE,
} from '@/lib/acc/dcActivityCsvIngest';
import {
  ingestAdminSnapshot,
  ADMIN_CSV_ALLOWLIST,
  type AdminFileSource,
} from '@/lib/acc/dcAdminCsvIngest';
import {
  AnomalyError,
  type PreviousRunMetrics,
} from '@/lib/acc/dcAnomalyChecks';
import type {
  ExtractionPriorityProjectInput,
  ExtractionPriorityActivityInput,
  ExtractionPriorityBackfillInput,
} from '@/lib/acc/extractionPriorityPlanner';
import { buildExtractionPriorityPlan } from '@/lib/acc/extractionPriorityPlanner';
import { composePrioritizedSlices } from '@/lib/acc/dcBackfillPriority';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RunStatus =
  | 'success'
  | 'partial'
  | 'quota-paused'
  | 'quota-exceeded'
  | 'quarantined'
  | 'failed'
  | 'killed'
  | 'skipped';

export interface RunResult {
  ingestRunId: string | null;
  status: RunStatus;
  startedAt: Date;
  endedAt: Date;
  sliceWindowStart: Date | null;
  sliceWindowEnd: Date | null;
  projectsProcessed: number;
  rowsByModule: Record<string, number>;
  rowsByAdminCsv: Record<string, number>;
  quotaUsed: number;
  diffSummary: {
    usersAdded: number;
    usersRemoved: number;
    projectsAdded: number;
    projectsRemoved: number;
  } | null;
  unknownModulesSeen: string[];
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Constants — from scripts/dc-ingest-where-i-admin.cjs
// ---------------------------------------------------------------------------

const APS_DC_BASE = 'https://developer.api.autodesk.com/data-connector/v1';
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour per slice
const APS_FETCH_TIMEOUT_MS = 120_000;
const SIGNED_URL_FETCH_TIMEOUT_MS = 120_000;
const SERVICE_GROUPS = ['activities', 'admin'];
const STALE_LOCK_MIN = 60;

// Activity-analysis window (in days) used to rank projects for priority backfill.
export const PRIORITY_WINDOW_DAYS = 30;
// ~20% of daily budget reserved for most-starved projects; keeps priority slots dominant while guaranteeing low-priority progress.
const DEFAULT_FAIRNESS_FACTOR = 0.2;

const DC_USER_EMAIL =
  process.env.DC_USER_EMAIL?.trim() || 'luis.cortes@hermosillo.com';

// ---------------------------------------------------------------------------
// Kill-switch
// ---------------------------------------------------------------------------

const KILL_SWITCH_FILENAME = '.dc-ingest.disabled';

export function isKillSwitchActive(repoRoot: string): boolean {
  try {
    return fs.existsSync(path.join(repoRoot, KILL_SWITCH_FILENAME));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// APS protocol primitives — extracted from dc-ingest-where-i-admin.cjs
// Exported as `__apsProtocol` for test injection.
// ---------------------------------------------------------------------------

export class QuotaExceededError extends Error {
  constructor(message = 'APS Data Connector daily quota exceeded (HTTP 429)') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

interface DcSubmitOpts {
  accountId: string;
  userToken: string;
  projectIds: string[];
  startDate: Date;
  endDate: Date;
  description: string;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit | undefined,
  label: string,
  timeoutMs = APS_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function dcSubmit(opts: DcSubmitOpts): Promise<string> {
  const body = {
    description: opts.description,
    scheduleInterval: 'ONE_TIME',
    effectiveFrom: new Date().toISOString(),
    serviceGroups: SERVICE_GROUPS,
    dateRange: 'CUSTOM',
    startDate: opts.startDate.toISOString(),
    endDate: opts.endDate.toISOString(),
    projectIdList: opts.projectIds,
  };
  const maxAttempts = 4;
  let lastErr: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetchWithTimeout(
      `${APS_DC_BASE}/accounts/${opts.accountId}/requests`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opts.userToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      'POST /requests',
    );
    if (res.status === 429) {
      throw new QuotaExceededError();
    }
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (res.ok) {
      const j = json as { id?: string; requestId?: string };
      const requestId = j.id ?? j.requestId;
      if (!requestId) throw new Error(`POST /requests OK but no id in response`);
      return requestId;
    }
    const summary =
      typeof json === 'string'
        ? json.slice(0, 200)
        : JSON.stringify(json).slice(0, 200);
    if (res.status >= 500 && res.status < 600 && attempt < maxAttempts) {
      const backoffSec = Math.pow(2, attempt) * 5; // 10/20/40/80
      // eslint-disable-next-line no-console
      console.warn(
        `[dcIngest] POST /requests ${res.status} (attempt ${attempt}/${maxAttempts}); retry in ${backoffSec}s. ${summary}`,
      );
      await sleep(backoffSec * 1000);
      lastErr = `${res.status}: ${summary}`;
      continue;
    }
    throw new Error(`POST /requests ${res.status}: ${summary}`);
  }
  throw new Error(
    `POST /requests gave up after ${maxAttempts} attempts. Last: ${lastErr}`,
  );
}

interface DcJob {
  id: string;
  status?: string;
  completionStatus?: string;
}

async function dcPollJobs(
  accountId: string,
  userToken: string,
  requestId: string,
): Promise<DcJob[]> {
  const res = await fetchWithTimeout(
    `${APS_DC_BASE}/accounts/${accountId}/requests/${requestId}/jobs`,
    { headers: { Authorization: `Bearer ${userToken}` } },
    'GET /jobs',
  );
  if (res.status === 429) throw new QuotaExceededError();
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(
      `GET /jobs ${res.status}: ${
        typeof json === 'string'
          ? json.slice(0, 200)
          : JSON.stringify(json).slice(0, 200)
      }`,
    );
  }
  const j = json as { results?: DcJob[]; jobs?: DcJob[] };
  return j.results ?? j.jobs ?? (Array.isArray(json) ? (json as DcJob[]) : []);
}

function reduceJobsStatus(jobs: DcJob[]): 'pending' | 'running' | 'success' | 'failed' {
  if (jobs.length === 0) return 'pending';
  const norm = jobs.map((j) => ({
    status: String(j.status ?? '').toLowerCase(),
    completionStatus: String(j.completionStatus ?? '').toLowerCase(),
  }));
  if (norm.some((j) => /fail|cancel|error/.test(j.completionStatus))) {
    return 'failed';
  }
  if (
    norm.every(
      (j) => j.status === 'complete' && j.completionStatus === 'success',
    )
  ) {
    return 'success';
  }
  return 'running';
}

interface DcDataFile {
  name: string;
  downloadUrl?: string;
}

async function dcDataListing(
  accountId: string,
  userToken: string,
  jobId: string,
): Promise<DcDataFile[]> {
  const res = await fetchWithTimeout(
    `${APS_DC_BASE}/accounts/${accountId}/jobs/${jobId}/data-listing`,
    { headers: { Authorization: `Bearer ${userToken}` } },
    'GET /data-listing',
  );
  if (res.status === 429) throw new QuotaExceededError();
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`GET /data-listing ${res.status}: ${text.slice(0, 200)}`);
  }
  const j = json as { results?: DcDataFile[] };
  return Array.isArray(json) ? (json as DcDataFile[]) : j.results ?? [];
}

async function dcSignedUrl(
  accountId: string,
  userToken: string,
  jobId: string,
  name: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${APS_DC_BASE}/accounts/${accountId}/jobs/${jobId}/data/${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${userToken}` } },
    `GET /data/${name}`,
  );
  if (res.status === 429) throw new QuotaExceededError();
  const json = (await res.json()) as {
    url?: string;
    signedUrl?: string;
    downloadUrl?: string;
  };
  if (!res.ok) {
    throw new Error(`GET /data/${name} ${res.status}`);
  }
  const url = json.url ?? json.signedUrl ?? json.downloadUrl;
  if (!url) throw new Error(`No signed URL in response for ${name}`);
  return url;
}

async function fetchSignedUrlAsStream(
  signedUrl: string,
): Promise<NodeJS.ReadableStream> {
  // Pitfall 1: NO Authorization header on the signed-URL fetch.
  const res = await fetchWithTimeout(
    signedUrl,
    undefined,
    'Signed URL fetch',
    SIGNED_URL_FETCH_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`Signed URL fetch ${res.status}`);
  }
  if (!res.body) {
    throw new Error('Signed URL response had no body');
  }
  // Node 20+ supports Readable.fromWeb on undici streams.
  return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
}

function drainSkippedStream(stream: NodeJS.ReadableStream, filename: string): void {
  stream.on?.('error', (err) => {
    // Signed S3 downloads can terminate mid-drain for files we intentionally
    // skip. Treat that as a skipped-file warning, not a process-level crash.
    // eslint-disable-next-line no-console
    console.warn(
      `[dcIngest] Skipped file "${filename}" stream ended early: ${(err as Error).message}`,
    );
  });
  stream.resume?.();
}

function observeSignedStreamErrors(
  stream: NodeJS.ReadableStream,
  filename: string,
): void {
  stream.on?.('error', (err) => {
    // Without at least one listener, Node treats signed-url stream failures as
    // unhandled process errors. Downstream CSV parsers still receive normal
    // stream termination semantics; this listener keeps the orchestrator alive.
    // eslint-disable-next-line no-console
    console.warn(
      `[dcIngest] Signed stream "${filename}" emitted error: ${(err as Error).message}`,
    );
  });
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

interface AdminCsvAccumulator {
  header: string;
  rows: string[];
}

function appendAdminCsvPart(
  partsByFilename: Map<string, AdminCsvAccumulator>,
  filename: string,
  csvText: string,
): void {
  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.shift();
  if (!header) return;
  const rows = lines.filter((line) => line.trim() !== '');
  const existing = partsByFilename.get(filename);
  if (!existing) {
    partsByFilename.set(filename, { header, rows });
    return;
  }
  existing.rows.push(...rows);
}

function adminCsvSourcesFromParts(
  partsByFilename: Map<string, AdminCsvAccumulator>,
): AdminFileSource[] {
  return [...partsByFilename.entries()].map(([filename, part]) => ({
    filename,
    csvStream: Readable.from([[part.header, ...part.rows].join('\n') + '\n']),
  }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Pitfall 6: APS rejects punctuation in description; alnum + space + dash.
function safeDescription(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9 -]/g, '-').slice(0, 200);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function yesterdayUtc(): Date {
  const now = new Date();
  const utcToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  // End-of-yesterday-UTC (1ms before today UTC midnight).
  return new Date(utcToday.getTime() - 1);
}

function newProjectProgress(
  projectId: string,
  projectCreatedAt: Date,
): ProjectProgress {
  return {
    projectId,
    earliestCovered: null,
    latestCovered: null,
    projectCreatedAt,
    newProjectFlag: true,
  };
}

async function loadProjectProgress(
  prisma: PrismaClient,
): Promise<ProjectProgress[]> {
  const rows = await prisma.accDcBackfillProgress.findMany();
  return rows.map((r) => ({
    projectId: r.projectId,
    earliestCovered: r.earliestCovered,
    latestCovered: r.latestCovered,
    projectCreatedAt: r.projectCreatedAt,
    newProjectFlag: r.newProjectFlag,
  }));
}

// ---------------------------------------------------------------------------
// loadPriorityInputs — read-only loader for buildExtractionPriorityPlan
// ---------------------------------------------------------------------------

export interface PriorityInputs {
  projects: ExtractionPriorityProjectInput[];
  activity: ExtractionPriorityActivityInput[];
  backfillProgress: ExtractionPriorityBackfillInput[];
  ageByProjectId: Map<string, number>;
}

/**
 * Gathers the inputs required by `buildExtractionPriorityPlan`.
 *
 * - Mirrors the exact query shapes used in `server/routers/acc-sync.ts`
 *   `getExtractionPriorityPlan` (same models, same field selection, same
 *   activity aggregation SQL).
 * - READ-ONLY: only `findMany` / `groupBy` / `$queryRaw`. No writes.
 * - `ageByProjectId`: ranks AccDcBackfillProgress rows by `updatedAt` ASC
 *   (oldest → 0, next → 1, …) to feed a fairness reserve.
 */
export async function loadPriorityInputs(
  prisma: PrismaClient,
  windowDays = PRIORITY_WINDOW_DAYS,
): Promise<PriorityInputs> {
  const now = new Date();
  const windowStart = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - windowDays + 1,
    ),
  );
  const windowEndExclusive = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    ),
  );

  const [dcProjects, folderProjects, memberCounts, progressRows, activityRows] =
    await Promise.all([
      prisma.accDcProject.findMany({
        select: { id: true, name: true, status: true, createdAt: true },
        orderBy: { name: 'asc' },
      }),
      prisma.accProject.findMany({
        select: { id: true, folderCrawlStatus: true },
      }),
      prisma.accDcProjectUser.groupBy({
        by: ['projectId'],
        _count: { userId: true },
      }),
      prisma.accDcBackfillProgress.findMany({
        select: {
          projectId: true,
          earliestCovered: true,
          latestCovered: true,
          projectCreatedAt: true,
          newProjectFlag: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.$queryRaw<
        Array<{
          projectId: string;
          rows: number | bigint;
          activeDays: number | bigint;
          services: string[] | null;
          lastActivityAt: Date | null;
        }>
      >`
        SELECT
          NULLIF("projectId", '') AS "projectId",
          COUNT(*)::int AS rows,
          COUNT(DISTINCT date_trunc('day', "createdAt"))::int AS "activeDays",
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(NULLIF(LOWER(service), ''), 'unknown')), NULL) AS services,
          MAX("createdAt") AS "lastActivityAt"
        FROM "AccActivity"
        WHERE "projectId" IS NOT NULL
          AND "projectId" <> ''
          AND "createdAt" >= ${windowStart}
          AND "createdAt" < ${windowEndExclusive}
        GROUP BY NULLIF("projectId", '')
      `,
    ]);

  const folderStatusByProject = new Map(
    folderProjects.map((p) => [p.id, p.folderCrawlStatus]),
  );
  const memberCountByProject = new Map(
    memberCounts.map((row) => [row.projectId, row._count.userId]),
  );

  const projects: ExtractionPriorityProjectInput[] = dcProjects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    createdAt: p.createdAt,
    folderCrawlStatus: folderStatusByProject.get(p.id) ?? 'unknown',
    memberCount: memberCountByProject.get(p.id) ?? 0,
  }));

  const activity: ExtractionPriorityActivityInput[] = activityRows
    .filter((row) => Boolean(row.projectId))
    .map((row) => ({
      projectId: row.projectId,
      rows: row.rows,
      activeDays: row.activeDays,
      services: row.services ?? [],
      lastActivityAt: row.lastActivityAt,
    }));

  const backfillProgress: ExtractionPriorityBackfillInput[] = progressRows.map(
    (r) => ({
      projectId: r.projectId,
      earliestCovered: r.earliestCovered,
      latestCovered: r.latestCovered,
      projectCreatedAt: r.projectCreatedAt,
      newProjectFlag: r.newProjectFlag,
    }),
  );

  // progressRows was fetched ORDER BY updatedAt ASC, so index === age rank
  // (0 = oldest / most starved).
  const ageByProjectId = new Map<string, number>(
    progressRows.map((r, idx) => [r.projectId, idx]),
  );

  return { projects, activity, backfillProgress, ageByProjectId };
}

async function loadPreviousRunMetrics(
  prisma: PrismaClient,
): Promise<PreviousRunMetrics | null> {
  const prev = await prisma.accDcIngestRun.findFirst({
    where: { status: 'success' },
    orderBy: { startedAt: 'desc' },
  });
  if (!prev) return null;
  // Snapshot user/project counts at the time of the LAST successful run by
  // reading the current AccDcUser / AccDcProject counts (they were set by
  // that run's snapshot transaction; nothing between successful runs mutates them).
  const [userCount, projectCount] = await Promise.all([
    prisma.accDcUser.count(),
    prisma.accDcProject.count(),
  ]);
  return {
    userCount,
    projectCount,
    rowsByAdminCsv:
      (prev.rowsByAdminCsv as Record<string, number> | null) ?? {},
  };
}

async function loadQuotaUsedToday(
  prisma: PrismaClient,
  now: Date,
): Promise<number> {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const [runs, legacyJobs] = await Promise.all([
    prisma.accDcIngestRun.findMany({
      where: {
        startedAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        startedAt: true,
        quotaUsed: true,
      },
    }),
    prisma.accDataConnectorJob.findMany({
      where: {
        startedAt: {
          gte: start,
          lt: end,
        },
      },
      select: {
        startedAt: true,
      },
    }),
  ]);

  const runQuota = runs
    .filter((row) => isSameUtcDay(row.startedAt, now))
    .reduce((sum, row) => sum + row.quotaUsed, 0);
  const legacyQuota = legacyJobs.filter((row) =>
    isSameUtcDay(row.startedAt, now),
  ).length;
  return runQuota + legacyQuota;
}

export function isDcIngestRelevantFile(filename: string): boolean {
  return (
    ACTIVITY_FILE_RE.test(filename) ||
    ADMIN_CSV_ALLOWLIST.some((entry) => entry.filename === filename)
  );
}

function emptyResult(
  status: RunStatus,
  startedAt: Date,
  errorMessage: string | null = null,
): RunResult {
  return {
    ingestRunId: null,
    status,
    startedAt,
    endedAt: new Date(),
    sliceWindowStart: null,
    sliceWindowEnd: null,
    projectsProcessed: 0,
    rowsByModule: {},
    rowsByAdminCsv: {},
    quotaUsed: 0,
    diffSummary: null,
    unknownModulesSeen: [],
    errorMessage,
  };
}

// ---------------------------------------------------------------------------
// Flag-gated value-first slice ordering
// ---------------------------------------------------------------------------

/**
 * Resolves the fairness reserve slot count for the priority backfill path.
 *
 * Reads `DC_FAIRNESS_RESERVE` env var (parsed as int, clamped >= 0).
 * Falls back to `Math.max(1, Math.floor(budget * DEFAULT_FAIRNESS_FACTOR))`
 * when unset/invalid (0 for a non-positive budget).
 */
export function resolveFairnessReserve(budget: number): number {
  const raw = process.env.DC_FAIRNESS_RESERVE;
  if (raw !== undefined && raw.trim() !== '') {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return budget <= 0 ? 0 : Math.max(1, Math.floor(budget * DEFAULT_FAIRNESS_FACTOR));
}

/**
 * Returns the ordered slice list to hand to `limitSlicesToBudget`.
 *
 * - Flag OFF (`DC_PRIORITY_BACKFILL !== '1'`): returns `plan.slices` unchanged
 *   (byte-for-byte identical to the pre-feature behavior).
 * - Flag ON: builds priority ranks + fairness reserve, then calls
 *   `composePrioritizedSlices` so the most-valuable slices bubble to the
 *   front while the fairness reserve prevents indefinite starvation.
 * - On ANY error: logs a warning and falls back to `plan.slices` — never throws.
 */
export async function resolveSlicesForBudget(
  prisma: PrismaClient,
  plan: { slices: Slice[] },
  budget: number,
  generatedAt: Date,
  loadInputs: typeof loadPriorityInputs = loadPriorityInputs,
): Promise<Slice[]> {
  if (process.env.DC_PRIORITY_BACKFILL !== '1') {
    // eslint-disable-next-line no-console
    console.log('[dcIngest] slice ordering: mode=fair/breadth-first (DC_PRIORITY_BACKFILL not set)');
    return plan.slices;
  }
  try {
    const inputs = await loadInputs(prisma);
    const ranked = buildExtractionPriorityPlan({
      generatedAt,
      windowDays: PRIORITY_WINDOW_DAYS,
      projects: inputs.projects,
      activity: inputs.activity,
      backfillProgress: inputs.backfillProgress,
    }).rankedProjects;
    const priorityByProjectId = new Map(ranked.map((p) => [p.projectId, p.rank]));
    const reserve = resolveFairnessReserve(budget);
    const reordered = composePrioritizedSlices(
      plan.slices,
      priorityByProjectId,
      inputs.ageByProjectId,
      budget,
      reserve,
    );
    const runnable = Math.min(budget, reordered.length);
    const deferred = Math.max(0, reordered.length - runnable);
    const nameById = new Map(inputs.projects.map((p) => [p.id, p.name]));
    const top5 = reordered.slice(0, 5);
    // eslint-disable-next-line no-console
    console.log(
      `[dcIngest] slice ordering: mode=priority budget=${budget} reserve=${reserve}` +
        ` total=${reordered.length} runnable=${runnable} deferred=${deferred}`,
    );
    for (const s of top5) {
      const bestRank = Math.min(
        ...s.projectIds.map((id) => priorityByProjectId.get(id) ?? Infinity),
      );
      const sample = nameById.get(s.projectIds[0]) ?? s.projectIds[0];
      // eslint-disable-next-line no-console
      console.log(
        `  reason=${s.reason} projects=${s.projectIds.length} bestRank=${isFinite(bestRank) ? bestRank : 'unranked'} sample="${sample}"`,
      );
    }
    return reordered;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[dcIngest] priority ordering failed, falling back to unordered:', err);
    return plan.slices;
  }
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function runDcIngest(prisma: PrismaClient): Promise<RunResult> {
  const startedAt = new Date();

  // 1. Kill-switch
  if (isKillSwitchActive(process.cwd())) {
    return emptyResult('killed', startedAt);
  }

  // 2. Stale-lock guard
  const concurrent = await prisma.accDcIngestRun.findFirst({
    where: { status: 'running' },
    orderBy: { startedAt: 'desc' },
  });
  if (concurrent) {
    const ageMin = (Date.now() - concurrent.startedAt.getTime()) / 60_000;
    if (ageMin < STALE_LOCK_MIN) {
      return emptyResult(
        'skipped',
        startedAt,
        `Concurrent run ${concurrent.id} in flight (age=${ageMin.toFixed(1)}min)`,
      );
    }
    // Reclaim
    await prisma.accDcIngestRun.update({
      where: { id: concurrent.id },
      data: {
        status: 'failed',
        endedAt: new Date(),
        errorMessage: `Reclaimed stale run (age=${ageMin.toFixed(1)}min)`,
      },
    });
  }

  // 3. Open run row
  const run = await prisma.accDcIngestRun.create({
    data: {
      status: 'running',
      rowsByModule: {},
      rowsByAdminCsv: {},
    },
  });

  // 4. Discovery (runs on every call — cheap, 1-2 requests + local filter).
  //    Fail-fast guard: all four env vars must be present before any APS call.
  const accountId = (process.env.APS_HUB_ID || process.env.ACC_ACCOUNT_ID)?.trim();
  const userId = process.env.LUIS_ACC_USER_ID?.trim();
  const clientId = process.env.APS_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_CLIENT_SECRET?.trim();

  const missingVars: string[] = [];
  if (!accountId) missingVars.push('APS_HUB_ID/ACC_ACCOUNT_ID');
  if (!userId) missingVars.push('LUIS_ACC_USER_ID');
  if (!clientId) missingVars.push('APS_CLIENT_ID');
  if (!clientSecret) missingVars.push('APS_CLIENT_SECRET');

  if (missingVars.length > 0) {
    const errorMessage = `Missing required env var(s) for discovery: ${missingVars.join(', ')}`;
    await prisma.accDcIngestRun.update({
      where: { id: run.id },
      data: { status: 'failed', endedAt: new Date(), errorMessage },
    });
    return emptyResult('failed', startedAt, errorMessage);
  }

  // Fetch 2-leg token for Admin v1 discovery (distinct from 3-leg DC token).
  let token2Leg: string;
  try {
    token2Leg = await get2LegToken(clientId!, clientSecret!);
  } catch (err) {
    const errorMessage = `2-leg token fetch failed: ${(err as Error).message}`;
    await prisma.accDcIngestRun.update({
      where: { id: run.id },
      data: { status: 'failed', endedAt: new Date(), errorMessage },
    });
    return emptyResult('failed', startedAt, errorMessage);
  }

  // Discover projects where userId is an actual Project Admin.
  let adminProjects: Awaited<ReturnType<typeof discoverAdminProjects>>;
  try {
    adminProjects = await discoverAdminProjects({
      accountId: accountId!.replace(/^b\./, ''),
      userId: userId!,
      token2Leg,
    });
  } catch (err) {
    const errorMessage = `Discovery failed: ${(err as Error).message}`;
    await prisma.accDcIngestRun.update({
      where: { id: run.id },
      data: { status: 'failed', endedAt: new Date(), errorMessage },
    });
    return emptyResult('failed', startedAt, errorMessage);
  }

  // Seed AccDcBackfillProgress for any newly-discovered admin project.
  const existing = await loadProjectProgress(prisma);
  const knownIds = new Set(existing.map((p) => p.projectId));
  const newOnes = adminProjects.filter((p) => !knownIds.has(p.id));

  for (const p of newOnes) {
    await prisma.accDcBackfillProgress.upsert({
      where: { projectId: p.id },
      create: {
        projectId: p.id,
        projectCreatedAt: new Date(p.createdAt),
        newProjectFlag: true,
        earliestCovered: null,
        latestCovered: null,
      },
      update: {}, // do not overwrite existing progress on incremental runs
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `[dcIngest] discovery: ${adminProjects.length} admin projects; ${newOnes.length} newly seeded`,
  );

  // Re-load progress so cold start (empty table) has rows to plan against.
  const progress = newOnes.length > 0 ? await loadProjectProgress(prisma) : existing;

  // 5. Plan slice
  const yesterday = yesterdayUtc();
  const plan = planDailySlice(progress, yesterday);

  if (plan.slices.length === 0) {
    // Nothing to do — fully backfilled (or still no admin projects).
    const endedAt = new Date();
    await prisma.accDcIngestRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        endedAt,
        sliceWindowStart: null,
        sliceWindowEnd: yesterday,
        projectsProcessed: 0,
        rowsByModule: {},
        rowsByAdminCsv: {},
        quotaUsed: 0,
      },
    });
    return {
      ingestRunId: run.id,
      status: 'success',
      startedAt,
      endedAt,
      sliceWindowStart: null,
      sliceWindowEnd: yesterday,
      projectsProcessed: 0,
      rowsByModule: {},
      rowsByAdminCsv: {},
      quotaUsed: 0,
      diffSummary: null,
      unknownModulesSeen: [],
      errorMessage: null,
    };
  }

  const quotaUsedToday = await loadQuotaUsedToday(prisma, startedAt);
  // 2026-05-18: opt-in env override to push into the reserve (between safe budget
  // and the hard cap). Defaults preserve the safe budget. Intended for manual
  // recovery probes after a long outage; never set in the cron environment.
  const safeBudgetOverride = process.env.DC_DAILY_SAFE_BUDGET
    ? Math.max(0, Math.min(25, parseInt(process.env.DC_DAILY_SAFE_BUDGET, 10) || 0))
    : undefined;
  const quotaBudget = buildQuotaBudget({
    usedToday: quotaUsedToday,
    dailySafeRequestBudget: safeBudgetOverride,
  });
  const slicesForBudget = await resolveSlicesForBudget(
    prisma,
    plan,
    quotaBudget.safeRemainingToday,
    startedAt,
  );
  const limitedPlan = limitSlicesToBudget(
    slicesForBudget,
    quotaBudget.safeRemainingToday,
  );
  if (limitedPlan.runnableRequests === 0) {
    return finalize(prisma, run.id, startedAt, {
      status: 'quota-paused',
      errorMessage:
        `Daily safe quota exhausted (${quotaBudget.usedToday}/${quotaBudget.dailySafeRequestBudget} used). ` +
        `Next safe run: ${nextDailyQuotaReset(startedAt).toISOString()}. ` +
        `${limitedPlan.deferredRequests} request(s) deferred.`,
      quotaUsed: 0,
      projectsProcessed: 0,
      sliceWindowStart: plan.slices[0]?.start ?? null,
      sliceWindowEnd: yesterday,
    });
  }

  // 6+. Execute the plan against APS.
  return executePlan(
    prisma,
    run.id,
    limitedPlan.runnableSlices,
    startedAt,
    yesterday,
    {
      finalStatusOnComplete:
        limitedPlan.deferredRequests > 0 ? 'quota-paused' : 'success',
      deferredRequests: limitedPlan.deferredRequests,
      plannedRequests: limitedPlan.plannedRequests,
      quotaUsedBeforeRun: quotaBudget.usedToday,
      nextSafeRunAt: nextDailyQuotaReset(startedAt),
      skipAdminSnapshot: limitedPlan.deferredRequests > 0,
    },
  );
}

async function executePlan(
  prisma: PrismaClient,
  ingestRunId: string,
  slices: Slice[],
  startedAt: Date,
  yesterday: Date,
  options: {
    finalStatusOnComplete?: RunStatus;
    deferredRequests?: number;
    plannedRequests?: number;
    quotaUsedBeforeRun?: number;
    nextSafeRunAt?: Date;
    skipAdminSnapshot?: boolean;
  } = {},
): Promise<RunResult> {
  const rawHubId = process.env.APS_HUB_ID?.trim();
  if (!rawHubId) {
    return finalize(prisma, ingestRunId, startedAt, {
      status: 'failed',
      errorMessage: 'APS_HUB_ID env var not set',
      sliceWindowStart: null,
      sliceWindowEnd: yesterday,
    });
  }
  const accountId = rawHubId.replace(/^b\./, '');

  let userToken: string;
  try {
    // eslint-disable-next-line no-console
    console.log(`[dcIngest] Refreshing Autodesk user token for ${DC_USER_EMAIL}`);
    userToken = await refreshUserToken(prisma, { userEmail: DC_USER_EMAIL });
    // eslint-disable-next-line no-console
    console.log(`[dcIngest] Autodesk user token ready`);
  } catch (err) {
    return finalize(prisma, ingestRunId, startedAt, {
      status: 'failed',
      errorMessage: `Token refresh failed: ${(err as Error).message}`,
      sliceWindowStart: null,
      sliceWindowEnd: yesterday,
    });
  }

  const rowsByModule: Record<string, number> = {};
  const adminCsvParts = new Map<string, AdminCsvAccumulator>();
  const unknownModulesSet = new Set<string>();
  const completedSlices: Slice[] = [];
  let quotaUsed = 0;
  let projectsProcessedSet = new Set<string>();

  let sliceWindowStart: Date | null = null;
  let sliceWindowEnd: Date | null = null;

  // Process each slice in sequence (rate-limit conservative; mirrors the
  // reference impl). Quota errors short-circuit cleanly.
  for (const slice of slices) {
    if (sliceWindowStart === null || slice.start < sliceWindowStart) {
      sliceWindowStart = slice.start;
    }
    if (sliceWindowEnd === null || slice.end > sliceWindowEnd) {
      sliceWindowEnd = slice.end;
    }

    let requestId: string;
    try {
      // Refresh token before each submit (cheap if still fresh).
      // eslint-disable-next-line no-console
      console.log(
        `[dcIngest] Refreshing user token before submit for ${slice.projectIds.length} project(s)`,
      );
      userToken = await refreshUserToken(prisma, { userEmail: DC_USER_EMAIL });
      const description = safeDescription(
        `dc-ingest ${ingestRunId} ${slice.reason} ${slice.projectIds.length}p`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[dcIngest] Submitting slice ${slice.start.toISOString()} to ${slice.end.toISOString()} for ${slice.projectIds.length} project(s)`,
      );
      requestId = await dcSubmit({
        accountId,
        userToken,
        projectIds: slice.projectIds,
        startDate: slice.start,
        endDate: slice.end,
        description,
      });
      // eslint-disable-next-line no-console
      console.log(`[dcIngest] Submitted request ${requestId}`);
      quotaUsed += 1;
      await prisma.accDcIngestRun.update({
        where: { id: ingestRunId },
        data: {
          quotaUsed,
          sliceWindowStart,
          sliceWindowEnd,
        },
      });
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return finalize(prisma, ingestRunId, startedAt, {
          status: 'quota-paused',
          errorMessage: `${err.message}. Next safe run: ${nextDailyQuotaReset(new Date()).toISOString()}.`,
          rowsByModule,
          quotaUsed,
          unknownModulesSeen: [...unknownModulesSet],
          projectsProcessed: projectsProcessedSet.size,
          sliceWindowStart,
          sliceWindowEnd,
        });
      }
      // Non-quota submit failure -> mark partial + continue with NEXT slice.
      // eslint-disable-next-line no-console
      console.error(`[dcIngest] Submit failed for slice: ${(err as Error).message}`);
      continue;
    }

    // Poll
    const pollStart = Date.now();
    let jobs: DcJob[] = [];
    let pollErr: string | null = null;
    // eslint-disable-next-line no-console
    console.log(`[dcIngest] Polling request ${requestId}`);
    while (Date.now() - pollStart < POLL_TIMEOUT_MS) {
      try {
        userToken = await refreshUserToken(prisma, { userEmail: DC_USER_EMAIL });
        jobs = await dcPollJobs(accountId, userToken, requestId);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return finalize(prisma, ingestRunId, startedAt, {
            status: 'quota-paused',
            errorMessage: `${err.message}. Next safe run: ${nextDailyQuotaReset(new Date()).toISOString()}.`,
            rowsByModule,
            quotaUsed,
            unknownModulesSeen: [...unknownModulesSet],
            projectsProcessed: projectsProcessedSet.size,
            sliceWindowStart,
            sliceWindowEnd,
          });
        }
        pollErr = (err as Error).message;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      const status = reduceJobsStatus(jobs);
      // eslint-disable-next-line no-console
      console.log(
        `[dcIngest] Request ${requestId} status=${status} jobs=${jobs.length}`,
      );
      if (status === 'success') break;
      if (status === 'failed') {
        pollErr = 'APS reported job failure';
        break;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    if (reduceJobsStatus(jobs) !== 'success') {
      // eslint-disable-next-line no-console
      console.error(
        `[dcIngest] Slice failed (${pollErr ?? 'poll timeout'}); skipping.`,
      );
      continue;
    }

    // Per-job: data-listing -> per-file download
    for (const job of jobs) {
      if (String(job.completionStatus).toLowerCase() !== 'success') continue;
      let files: DcDataFile[];
      try {
        userToken = await refreshUserToken(prisma, { userEmail: DC_USER_EMAIL });
        // eslint-disable-next-line no-console
        console.log(`[dcIngest] Listing data for job ${job.id}`);
        files = await dcDataListing(accountId, userToken, job.id);
        // eslint-disable-next-line no-console
        console.log(`[dcIngest] Job ${job.id} returned ${files.length} file(s)`);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return finalize(prisma, ingestRunId, startedAt, {
            status: 'quota-paused',
            errorMessage: `${err.message}. Next safe run: ${nextDailyQuotaReset(new Date()).toISOString()}.`,
            rowsByModule,
            quotaUsed,
            unknownModulesSeen: [...unknownModulesSet],
            projectsProcessed: projectsProcessedSet.size,
            sliceWindowStart,
            sliceWindowEnd,
          });
        }
        // 2026-05-18 Bug B fix: hard abort. Previously console.error+continue, which let
        // the run finalize as 'success' with zero rows. See docs/superpowers/specs/2026-05-18-dc-ingest-drift-recovery-design.md.
        return finalize(prisma, ingestRunId, startedAt, {
          status: 'failed',
          errorMessage: `data-listing failed for job ${job.id}: ${(err as Error).message}`,
          rowsByModule,
          quotaUsed,
          unknownModulesSeen: [...unknownModulesSet],
          projectsProcessed: projectsProcessedSet.size,
          sliceWindowStart,
          sliceWindowEnd,
        });
      }

      for (const f of files) {
        if (!isDcIngestRelevantFile(f.name)) {
          // Skip package metadata before signed-url lookup; these files are not ingested.
          // eslint-disable-next-line no-console
          console.warn(`[dcIngest] Unknown file "${f.name}" — skipped`);
          continue;
        }
        try {
          userToken = await refreshUserToken(prisma, { userEmail: DC_USER_EMAIL });
          const signed =
            f.downloadUrl ?? (await dcSignedUrl(accountId, userToken, job.id, f.name));
          // eslint-disable-next-line no-console
          console.log(`[dcIngest] Downloading ${f.name}`);
          const stream = await fetchSignedUrlAsStream(signed);
          observeSignedStreamErrors(stream, f.name);

          if (ACTIVITY_FILE_RE.test(f.name)) {
            const moduleName = parseModuleFromFilename(f.name);
            if (moduleName && !KNOWN_MODULES.has(moduleName)) {
              unknownModulesSet.add(moduleName);
            }
            // Activity rows are an event stream — skipDuplicates handles dedup.
            // NOT inside the admin-snapshot transaction.
            const result = await ingestActivityCsv(
              prisma as unknown as Parameters<typeof ingestActivityCsv>[0],
              {
                filename: f.name,
                csvStream: stream,
                ingestRunId,
                emailLookup: new Map<string, string>(),
              },
            );
            if (result.module) {
              rowsByModule[result.module] =
                (rowsByModule[result.module] ?? 0) + result.rowsInserted;
            }
            if (result.unknownModule) unknownModulesSet.add(result.unknownModule);
          } else if (
            ADMIN_CSV_ALLOWLIST.some((e) => e.filename === f.name)
          ) {
            appendAdminCsvPart(adminCsvParts, f.name, await streamToString(stream));
          } else {
            // Unknown — log + skip
            // eslint-disable-next-line no-console
            console.warn(`[dcIngest] Unknown file "${f.name}" — skipped`);
            // Drain the stream so the underlying socket can close.
            drainSkippedStream(stream, f.name);
          }
        } catch (err) {
          if (err instanceof QuotaExceededError) {
            return finalize(prisma, ingestRunId, startedAt, {
              status: 'quota-paused',
              errorMessage: `${err.message}. Next safe run: ${nextDailyQuotaReset(new Date()).toISOString()}.`,
              rowsByModule,
              quotaUsed,
              unknownModulesSeen: [...unknownModulesSet],
              projectsProcessed: projectsProcessedSet.size,
              sliceWindowStart,
              sliceWindowEnd,
            });
          }
          // 2026-05-18 Bug B fix: hard abort on any download/ingest exception. Previously
          // console.error+continue, which silently dropped failed inserts and let the run
          // finalize as 'success' with rowsByModule all zero. This is exactly how the
          // ingestRunId schema drift hid for 5 days.
          return finalize(prisma, ingestRunId, startedAt, {
            status: 'failed',
            errorMessage: `Download/ingest ${f.name} failed: ${(err as Error).message}`,
            rowsByModule,
            quotaUsed,
            unknownModulesSeen: [...unknownModulesSet],
            projectsProcessed: projectsProcessedSet.size,
            sliceWindowStart,
            sliceWindowEnd,
          });
        }
      }
    }

    completedSlices.push(slice);
    for (const pid of slice.projectIds) projectsProcessedSet.add(pid);
  }

  // 9. Admin snapshot transaction (atomic across all 16 tables).
  //
  // 2026-05-18 Bug C fix: only run the admin snapshot when at least one
  // non-backward slice contributed CSVs. Backward windows naturally report
  // smaller admin user populations than forward windows (DC reports admin
  // users *active in the requested window*), which trips the anomaly check
  // and rolls back. The admin tables represent CURRENT state — backward
  // slices should never write to them. Admin CSVs collected during
  // backward-only slices are discarded.
  //
  // See docs/superpowers/specs/2026-05-18-dc-ingest-drift-recovery-design.md.
  const hasNonBackwardCompleted = completedSlices.some(
    (s) => s.reason !== 'backward',
  );
  let rowsByAdminCsv: Record<string, number> = {};
  let diffSummary: RunResult['diffSummary'] = null;
  if (
    !options.skipAdminSnapshot &&
    hasNonBackwardCompleted &&
    adminCsvParts.size > 0
  ) {
    const previous = await loadPreviousRunMetrics(prisma);
    try {
      const snapshot = await ingestAdminSnapshot(
        prisma,
        adminCsvSourcesFromParts(adminCsvParts),
        ingestRunId,
        previous,
      );
      rowsByAdminCsv = snapshot.rowsByAdminCsv;
      diffSummary = snapshot.diffSummary;
    } catch (err) {
      if (err instanceof AnomalyError) {
        return finalize(prisma, ingestRunId, startedAt, {
          status: 'quarantined',
          errorMessage: `Anomaly detected — admin snapshot rolled back: ${err.message}`,
          rowsByModule,
          quotaUsed,
          unknownModulesSeen: [...unknownModulesSet],
          projectsProcessed: projectsProcessedSet.size,
          sliceWindowStart,
          sliceWindowEnd,
        });
      }
      return finalize(prisma, ingestRunId, startedAt, {
        status: 'failed',
        errorMessage: `Admin snapshot failed: ${(err as Error).message}`,
        rowsByModule,
        quotaUsed,
        unknownModulesSeen: [...unknownModulesSet],
        projectsProcessed: projectsProcessedSet.size,
        sliceWindowStart,
        sliceWindowEnd,
      });
    }
  }

  // 10. Apply slice completion -> upsert AccDcBackfillProgress
  for (const slice of completedSlices) {
    for (const projectId of slice.projectIds) {
      const prev = await prisma.accDcBackfillProgress.findUnique({
        where: { projectId },
      });
      // Resolve nullable AccDcProject.createdAt -> earliest known activity ts.
      let projectCreatedAt: Date | null = null;
      if (prev) {
        projectCreatedAt = prev.projectCreatedAt;
      } else {
        const proj = await prisma.accDcProject.findUnique({
          where: { id: projectId },
          select: { createdAt: true },
        });
        projectCreatedAt = proj?.createdAt ?? null;
        if (projectCreatedAt === null) {
          const earliestActivity = await prisma.accActivity.findFirst({
            where: { projectId },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          });
          projectCreatedAt = earliestActivity?.createdAt ?? slice.start;
        }
      }
      const seed = prev
        ? ({
            projectId,
            earliestCovered: prev.earliestCovered,
            latestCovered: prev.latestCovered,
            projectCreatedAt: prev.projectCreatedAt,
            newProjectFlag: prev.newProjectFlag,
          } as ProjectProgress)
        : newProjectProgress(projectId, projectCreatedAt);
      const next = applySliceCompletion(seed, slice);
      await prisma.accDcBackfillProgress.upsert({
        where: { projectId },
        create: {
          projectId,
          earliestCovered: next.earliestCovered,
          latestCovered: next.latestCovered,
          projectCreatedAt: next.projectCreatedAt,
          newProjectFlag: next.newProjectFlag,
        },
        update: {
          earliestCovered: next.earliestCovered,
          latestCovered: next.latestCovered,
          projectCreatedAt: next.projectCreatedAt,
          newProjectFlag: next.newProjectFlag,
        },
      });
    }
  }

  // 11. Newly-detected projects (DC8-13)
  const allDcProjects = await prisma.accDcProject.findMany({
    select: { id: true, createdAt: true },
  });
  const knownProgress = new Set(
    (await prisma.accDcBackfillProgress.findMany({ select: { projectId: true } })).map(
      (r) => r.projectId,
    ),
  );
  for (const p of allDcProjects) {
    if (knownProgress.has(p.id)) continue;
    const floor = p.createdAt ?? yesterday;
    await prisma.accDcBackfillProgress.create({
      data: {
        projectId: p.id,
        projectCreatedAt: floor,
        newProjectFlag: true,
      },
    });
  }

  const completedAllRunnable = completedSlices.length === slices.length;
  const status: RunStatus = completedAllRunnable
    ? options.finalStatusOnComplete ?? 'success'
    : 'partial';
  const deferredMessage =
    completedAllRunnable && options.deferredRequests && options.deferredRequests > 0
      ? `Daily safe quota budget reached after ${
          options.quotaUsedBeforeRun ?? 0
        } previous request(s); ${options.deferredRequests} of ${
          options.plannedRequests ?? slices.length
        } planned request(s) deferred until ${
          options.nextSafeRunAt?.toISOString() ?? nextDailyQuotaReset(new Date()).toISOString()
        }.`
      : undefined;
  return finalize(prisma, ingestRunId, startedAt, {
    status,
    errorMessage: deferredMessage,
    rowsByModule,
    rowsByAdminCsv,
    diffSummary,
    quotaUsed,
    unknownModulesSeen: [...unknownModulesSet],
    projectsProcessed: projectsProcessedSet.size,
    sliceWindowStart,
    sliceWindowEnd,
  });
}

interface FinalizePatch {
  status: RunStatus;
  errorMessage?: string;
  rowsByModule?: Record<string, number>;
  rowsByAdminCsv?: Record<string, number>;
  diffSummary?: RunResult['diffSummary'];
  quotaUsed?: number;
  unknownModulesSeen?: string[];
  projectsProcessed?: number;
  sliceWindowStart?: Date | null;
  sliceWindowEnd?: Date | null;
}

async function finalize(
  prisma: PrismaClient,
  ingestRunId: string,
  startedAt: Date,
  patch: FinalizePatch,
): Promise<RunResult> {
  const endedAt = new Date();
  await prisma.accDcIngestRun.update({
    where: { id: ingestRunId },
    data: {
      status: patch.status,
      endedAt,
      sliceWindowStart: patch.sliceWindowStart ?? null,
      sliceWindowEnd: patch.sliceWindowEnd ?? null,
      projectsProcessed: patch.projectsProcessed ?? 0,
      rowsByModule: patch.rowsByModule ?? {},
      rowsByAdminCsv: patch.rowsByAdminCsv ?? {},
      quotaUsed: patch.quotaUsed ?? 0,
      diffSummary: patch.diffSummary ?? undefined,
      unknownModulesSeen: patch.unknownModulesSeen ?? [],
      errorMessage: patch.errorMessage ?? null,
    },
  });
  return {
    ingestRunId,
    status: patch.status,
    startedAt,
    endedAt,
    sliceWindowStart: patch.sliceWindowStart ?? null,
    sliceWindowEnd: patch.sliceWindowEnd ?? null,
    projectsProcessed: patch.projectsProcessed ?? 0,
    rowsByModule: patch.rowsByModule ?? {},
    rowsByAdminCsv: patch.rowsByAdminCsv ?? {},
    quotaUsed: patch.quotaUsed ?? 0,
    diffSummary: patch.diffSummary ?? null,
    unknownModulesSeen: patch.unknownModulesSeen ?? [],
    errorMessage: patch.errorMessage ?? null,
  };
}
