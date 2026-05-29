/**
 * lib/acc/folderCrawl.ts
 *
 * BFS folder crawl + role-permission fetch for an APS/ACC project.
 *
 * Key endpoint/ID discipline:
 *   - Top folders + folder contents: projectIdForDM (with "b." prefix)
 *   - Permissions:                   projectIdForPerms (bare UUID — "b." stripped by caller)
 *
 * This module is intentionally free of Prisma. It returns plain in-memory arrays.
 * Plan 04 will add an extractAndPersistFolders() wrapper that consumes these arrays
 * and writes AccFolder / AccFolderPermission rows.
 *
 * When dryRun === true, the function still performs all APS reads and returns real
 * data — the CALLER is responsible for skipping any DB writes.
 */

import type { PrismaClient } from "@prisma/client";
import pLimit from "p-limit";
import { fetchWithRetry } from "@/lib/server/acc-admin";
import { mapActions } from "@/lib/acc/permissionMapping";
import { parseFolderContents, type ApsFolderNode, type FolderItemRollup } from "./folderContentsParse";

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

const DM_BASE = "https://developer.api.autodesk.com";

// ---------------------------------------------------------------------------
// Types (exported for downstream consumption in Plan 04+)
// ---------------------------------------------------------------------------

export interface RawFolder {
  /** Folder URN — b.-prefixed (Data Management format) */
  id: string;
  /** Parent folder URN, or null for top-level folders */
  parentId: string | null;
  name: string;
  /** Slash-separated absolute path from hub root, e.g. "/ProjectFiles/Drawings" */
  fullPath: string;
  // ── Slice D file rollup (files DIRECTLY in this folder, from their tip versions) ──
  // Populated when this folder's contents are listed; absent if never reached (partial crawl).
  fileCount?: number;
  totalSizeBytes?: number;
  lastModifiedTime?: string | null;
  lastModifiedBy?: string | null;
  latestVersionAddedBy?: string | null;
  maxVersionNumber?: number | null;
}

export interface RawFolderPermission {
  folderId: string;
  /** subjectId of the ROLE entry (subjectType==="ROLE" already filtered) */
  roleId: string;
  /** Raw APS actions array — mapActions() in permissionMapping.ts converts to tier */
  actions: string[];
}

export interface FolderCrawlResult {
  folders: RawFolder[];
  permissions: RawFolderPermission[];
  durationMs: number;
  status: "ok" | "partial" | "failed" | "inaccessible";
  reason?: string;
}

export interface CrawlOptions {
  /** When true: no DB writes (caller responsible). Library always returns in-memory data. */
  dryRun: boolean;
  /** Log a warning when elapsed exceeds this (default: 5 min) */
  softCapMs?: number;
  /** Abort the BFS and mark status='partial' when elapsed exceeds this (default: 15 min) */
  hardCapMs?: number;
  /** Maximum concurrent APS requests per project (default: 5) */
  pLimitConcurrency?: number;
  /** Fetch a fresh APS access token when a long crawl outlives the current token. */
  refreshAccessToken?: () => Promise<string>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface QueueItem {
  folderId: string;
  parentId: string | null;
  parentPath: string;
  /** true when this folderId represents the synthetic "root" sentinel */
  isRoot?: boolean;
}

interface ApsFolder {
  id: string;
  attributes?: { displayName?: string; name?: string };
  relationships?: { parent?: { data?: { id?: string } } };
}

function folderName(f: ApsFolder): string {
  return f.attributes?.displayName ?? f.attributes?.name ?? f.id;
}

function isProjectAccessFailure(message: string): boolean {
  return /topFolders fetch failed \((403|404)\)/.test(message);
}

function isExpiredAccessTokenFailure(message: string): boolean {
  return /\(401\)/.test(message)
    && (/AUTH-006/.test(message) || /invalid or expired/i.test(message));
}

async function fetchTopFolders(
  hubId: string,
  projectIdForDM: string,
  accessToken: string,
): Promise<ApsFolder[]> {
  const url = `${DM_BASE}/project/v1/hubs/${hubId}/projects/${projectIdForDM}/topFolders`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`topFolders fetch failed (${res.status}): ${raw}`);
  }
  const parsed = JSON.parse(raw) as { data?: ApsFolder[] };
  return Array.isArray(parsed.data) ? parsed.data : [];
}

async function fetchFolderContents(
  projectIdForDM: string,
  folderId: string,
  accessToken: string,
): Promise<{ folders: ApsFolderNode[]; rollup: FolderItemRollup }> {
  // No `filter[type]=folders` (Slice D): the unfiltered response ALSO returns items
  // (data[]) and their tip versions (included[]), which carry storageSize / versionNumber /
  // lastModifiedTime / lastModifiedUserName / createUserName. Same one-call-per-folder cost.
  const url =
    `${DM_BASE}/data/v1/projects/${projectIdForDM}/folders/${folderId}/contents`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`folderContents fetch failed (${res.status}): ${raw}`);
  }
  const parsed = JSON.parse(raw) as { data?: unknown[]; included?: unknown[] };
  return parseFolderContents(parsed);
}

interface ApsPermissionEntry {
  subjectType?: string;
  subjectId?: string;
  actions?: string[];
}

async function fetchFolderPermissions(
  projectIdForPerms: string,
  folderId: string,
  accessToken: string,
): Promise<ApsPermissionEntry[]> {
  const url =
    `${DM_BASE}/bim360/docs/v1/projects/${projectIdForPerms}/folders/${folderId}/permissions`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    // 404 = folder may not be in BIM360 Docs scope — treat as empty, not fatal
    if (res.status === 404) return [];
    throw new Error(`permissions fetch failed (${res.status}): ${raw}`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  return Array.isArray(parsed) ? (parsed as ApsPermissionEntry[]) : [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Crawl all folders in a project using BFS with pLimit concurrency control
 * and per-project time budgets.
 *
 * @param hubId             - APS hub ID with b. prefix (stored as Project.apsHubId)
 * @param projectIdForDM    - APS project ID with b. prefix (Data Management endpoints)
 * @param projectIdForPerms - APS project ID without b. prefix (BIM360 Docs permissions endpoint)
 * @param accessToken       - 2-legged app token
 * @param options           - CrawlOptions (dryRun, caps, concurrency)
 */
export async function crawlProjectFolders(
  hubId: string,
  projectIdForDM: string,
  projectIdForPerms: string,
  accessToken: string,
  options: CrawlOptions,
): Promise<FolderCrawlResult> {
  const startedAt = Date.now();
  const softCapMs = options.softCapMs ?? 5 * 60_000;   // 5 min
  const hardCapMs = options.hardCapMs ?? 15 * 60_000;  // 15 min
  const limit = pLimit(options.pLimitConcurrency ?? 5);
  let currentAccessToken = accessToken;

  const folders: RawFolder[] = [];
  // Slice D: lookup so a folder's file-rollup (captured when ITS contents are listed)
  // can be attached back to the RawFolder created when its parent was listed.
  const foldersById = new Map<string, RawFolder>();
  let status: "ok" | "partial" | "failed" | "inaccessible" = "ok";
  let reason: string | undefined;
  let softCapWarned = false;

  // BFS queue — starts with a synthetic "root" sentinel to trigger topFolders fetch
  const queue: QueueItem[] = [{ folderId: "root", parentId: null, parentPath: "", isRoot: true }];

  async function withFreshToken<T>(operation: (token: string) => Promise<T>): Promise<T> {
    try {
      return await operation(currentAccessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!options.refreshAccessToken || !isExpiredAccessTokenFailure(msg)) {
        throw err;
      }
      currentAccessToken = await options.refreshAccessToken();
      return operation(currentAccessToken);
    }
  }

  while (queue.length > 0) {
    // ── Time budget check ──────────────────────────────────────────────────
    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs >= hardCapMs) {
      console.warn(
        `[folder-crawl] Hard cap (${hardCapMs}ms) exceeded for project ${projectIdForDM} — marking partial`,
      );
      status = "partial";
      reason = "hard_cap_exceeded";
      break;
    }

    if (elapsedMs >= softCapMs && !softCapWarned) {
      console.warn(
        `[folder-crawl] Soft cap (${softCapMs}ms) exceeded for project ${projectIdForDM}`,
      );
      softCapWarned = true;
    }

    // ── Drain up to `concurrency` items from the queue in parallel ─────────
    const batchSize = options.pLimitConcurrency ?? 5;
    const batch = queue.splice(0, batchSize);

    const childSets = await Promise.all(
      batch.map((item) =>
        limit(async () => {
          try {
            if (item.isRoot) {
              // Fetch top-level folders for this project
            const topFolders = await withFreshToken((token) =>
              fetchTopFolders(hubId, projectIdForDM, token)
            );
              // Return child queue items (top folders have no parent)
              return { parent: null, children: topFolders, parentPath: "", rollup: null, forFolderId: null };
            }

            // Fetch sub-folders + this folder's file rollup
          const { folders: subFolders, rollup } = await withFreshToken((token) =>
            fetchFolderContents(projectIdForDM, item.folderId, token)
          );
            return { parent: item, children: subFolders, parentPath: item.parentPath, rollup, forFolderId: item.folderId };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
              `[folder-crawl] Fetch failed for folder ${item.folderId} (project ${projectIdForDM}): ${msg}`,
            );
            if (item.isRoot && isProjectAccessFailure(msg)) {
              status = "inaccessible";
              reason = "project_access_denied";
            } else {
              status = "partial";
              reason = reason ?? "fetch_error";
            }
            return { parent: item.isRoot ? null : item, children: [] as ApsFolderNode[], parentPath: item.parentPath, rollup: null, forFolderId: null };
          }
        }),
      ),
    );

    // ── Push discovered folders + enqueue children ─────────────────────────
    for (const { parent, children, parentPath, rollup, forFolderId } of childSets) {
      // Attach this folder's file rollup to the RawFolder created when its parent
      // was listed (top folders are registered below before they are dequeued).
      if (forFolderId && rollup) {
        const rf = foldersById.get(forFolderId);
        if (rf) {
          rf.fileCount = rollup.fileCount;
          rf.totalSizeBytes = rollup.totalSizeBytes;
          rf.lastModifiedTime = rollup.lastModifiedTime;
          rf.lastModifiedBy = rollup.lastModifiedBy;
          rf.latestVersionAddedBy = rollup.latestVersionAddedBy;
          rf.maxVersionNumber = rollup.maxVersionNumber;
        }
      }
      for (const child of children) {
        const name = folderName(child);
        const fullPath = parentPath ? `${parentPath}/${name}` : `/${name}`;
        const parentId = parent?.isRoot ? null : (parent?.folderId ?? null);

        const rf: RawFolder = { id: child.id, parentId, name, fullPath };
        folders.push(rf);
        foldersById.set(child.id, rf);
        queue.push({ folderId: child.id, parentId, parentPath: fullPath });
      }
    }
  }

  // ── Permissions phase: fetch for every discovered folder ─────────────────
  const permissions: RawFolderPermission[] = [];

  const permResults = await Promise.all(
    folders.map((folder) =>
      limit(async () => {
        // Check time budget before each permissions batch too
        if (Date.now() - startedAt >= hardCapMs) {
          status = "partial";
          reason = reason ?? "hard_cap_exceeded";
          return [];
        }
        try {
        const raw = await withFreshToken((token) =>
          fetchFolderPermissions(projectIdForPerms, folder.id, token)
        );
          // Filter to ROLE entries only — USER permissions are out of scope
          return raw
            .filter((p) => p.subjectType === "ROLE" && p.subjectId)
            .map<RawFolderPermission>((p) => ({
              folderId: folder.id,
              roleId: p.subjectId!,
              actions: Array.isArray(p.actions) ? p.actions : [],
            }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[folder-crawl] Permissions fetch failed for folder ${folder.id}: ${msg}`,
          );
          status = "partial";
          reason = reason ?? "permissions_fetch_error";
          return [];
        }
      }),
    ),
  );

  for (const batch of permResults) {
    permissions.push(...batch);
  }

  // ── Permissions-empty downgrade guard (2026-05-26) ───────────────────────
  // The crawler returns status="ok" by default, and the permissions phase only
  // sets "partial" when an explicit fetch error throws. A project where every
  // /permissions call quietly returns [] (the FWD-Promociones shape from the
  // 2026-05-26 dry-run) would therefore land as status="ok" with zero rows in
  // AccFolderPermission — and `ok` is terminal for the priority planner and
  // the recovery sweep. Downgrade that specific shape to "partial" so the
  // permissions-only recovery pass (folder-perms-recover.cjs) picks it up.
  // Guard is intentionally narrow: only fires when folders > 0 AND the prior
  // status was "ok"; truly-empty projects (folders === 0) and already-degraded
  // statuses are left untouched.
  if (status === "ok" && folders.length > 0 && permissions.length === 0) {
    status = "partial";
    reason = reason ?? "permissions_empty";
  }

  return {
    folders,
    permissions,
    durationMs: Date.now() - startedAt,
    status,
    ...(reason ? { reason } : {}),
  };
}

// ---------------------------------------------------------------------------
// Persistence wrapper (Plan 04-04)
// ---------------------------------------------------------------------------
//
// Thin DB-writing wrapper around `crawlProjectFolders`. Imported by:
//   - lib/acc/quick-sync-extraction.ts (release path, env-gated)
//   - scripts/folder-crawl-cron.cjs    (Railway weekly cron)
//
// Persistence contract (per Plan 04-04 interfaces section):
//   - AccFolder.upsert by URN id (additive — folders not seen this pass are NOT deleted)
//   - AccFolderPermission.upsert by (folderId, roleId) compound unique
//   - permType computed via mapActions(actions).tier ?? "View Only" (null floor)
//   - AccProject.folderCrawlStatus written per project after each crawl completes
// ---------------------------------------------------------------------------

const PERSIST_BATCH_SIZE = 50;
const PERSIST_CONCURRENCY = readPositiveEnvInt("FOLDER_CRAWL_REQUEST_CONCURRENCY", 5);

function readPositiveEnvInt(name: string, fallback: number): number;
function readPositiveEnvInt(name: string, fallback: undefined): number | undefined;
function readPositiveEnvInt(name: string, fallback: number | undefined): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export interface ExtractAndPersistResult {
  folderCount: number;
  permissionCount: number;
  status: "ok" | "partial" | "failed" | "inaccessible";
}

/**
 * Crawl all folders + role permissions for a single project and persist them
 * to AccFolder / AccFolderPermission. Updates AccProject.folderCrawlStatus.
 *
 * Additive-only: folders or permissions no longer present in APS are NOT
 * deleted. Matches the Phase 2 MemberAggregator pattern (stale rows tolerable;
 * missing rows would zero the matrix).
 *
 * @param prisma       PrismaClient
 * @param hubId        APS hub ID with b. prefix (from Project.apsHubId)
 * @param project      AccProject row { id, accountId, name } — id stored WITHOUT b. prefix
 * @param accessToken  2-legged APS token
 */
export async function extractAndPersistFolders(
  prisma: PrismaClient,
  hubId: string,
  project: { id: string; accountId: string; name: string },
  accessToken: string,
  options: { refreshAccessToken?: () => Promise<string> } = {},
): Promise<ExtractAndPersistResult> {
  const startedAt = Date.now();

  // AccProject.id is stored WITHOUT the b. prefix (Construction Admin format).
  // Data Management endpoints need the b.-prefixed form; permissions need bare UUID.
  const projectIdForDM = `b.${project.id}`;
  const projectIdForPerms = project.id.replace(/^b\./, "");

  let crawl: FolderCrawlResult;
  try {
    crawl = await crawlProjectFolders(
      hubId,
      projectIdForDM,
      projectIdForPerms,
      accessToken,
      {
        dryRun: false,
        pLimitConcurrency: PERSIST_CONCURRENCY,
        softCapMs: readPositiveEnvInt("FOLDER_CRAWL_SOFT_CAP_MS", undefined),
        hardCapMs: readPositiveEnvInt("FOLDER_CRAWL_HARD_CAP_MS", undefined),
        refreshAccessToken: options.refreshAccessToken,
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[folder-crawl] project=${project.name} crawl threw: ${msg}`,
    );
    await prisma.accProject
      .update({ where: { id: project.id }, data: { folderCrawlStatus: "failed" } })
      .catch((updateErr: unknown) => {
        console.error(
          `[folder-crawl] failed to mark project ${project.id} folderCrawlStatus=failed:`,
          updateErr instanceof Error ? updateErr.message : updateErr,
        );
      });
    return { folderCount: 0, permissionCount: 0, status: "failed" };
  }

  const now = new Date();
  const writeLimit = pLimit(PERSIST_CONCURRENCY);

  // ---- Upsert folders in batches ------------------------------------------
  let folderWriteFailed = false;
  for (let i = 0; i < crawl.folders.length; i += PERSIST_BATCH_SIZE) {
    const batch = crawl.folders.slice(i, i + PERSIST_BATCH_SIZE);
    await Promise.all(
      batch.map((folder) =>
        writeLimit(async () => {
          // Slice D file rollup (undefined → null when the folder wasn't listed).
          const rollup = {
            fileCount: folder.fileCount ?? null,
            totalSizeBytes: folder.totalSizeBytes ?? null,
            lastModifiedTime: folder.lastModifiedTime ? new Date(folder.lastModifiedTime) : null,
            lastModifiedBy: folder.lastModifiedBy ?? null,
            latestVersionAddedBy: folder.latestVersionAddedBy ?? null,
            maxVersionNumber: folder.maxVersionNumber ?? null,
          };
          try {
            await prisma.accFolder.upsert({
              where: { id: folder.id },
              create: {
                id: folder.id,
                projectId: project.id,
                parentId: folder.parentId,
                name: folder.name,
                fullPath: folder.fullPath,
                syncedAt: now,
                ...rollup,
              },
              update: {
                projectId: project.id,
                parentId: folder.parentId,
                name: folder.name,
                fullPath: folder.fullPath,
                syncedAt: now,
                ...rollup,
              },
            });
          } catch (err) {
            folderWriteFailed = true;
            console.error(
              `[folder-crawl] folder upsert failed (project=${project.name} id=${folder.id}):`,
              err instanceof Error ? err.message : err,
            );
          }
        }),
      ),
    );
  }

  // ---- Upsert permissions in batches --------------------------------------
  let permWriteFailed = false;
  for (let i = 0; i < crawl.permissions.length; i += PERSIST_BATCH_SIZE) {
    const batch = crawl.permissions.slice(i, i + PERSIST_BATCH_SIZE);
    await Promise.all(
      batch.map((perm) =>
        writeLimit(async () => {
          const permType = mapActions(perm.actions).tier ?? "View Only";
          try {
            await prisma.accFolderPermission.upsert({
              where: {
                folderId_roleId: { folderId: perm.folderId, roleId: perm.roleId },
              },
              create: {
                folderId: perm.folderId,
                roleId: perm.roleId,
                actions: perm.actions,
                permType,
                syncedAt: now,
              },
              update: {
                actions: perm.actions,
                permType,
                syncedAt: now,
              },
            });
          } catch (err) {
            permWriteFailed = true;
            console.error(
              `[folder-crawl] permission upsert failed (folder=${perm.folderId} role=${perm.roleId}):`,
              err instanceof Error ? err.message : err,
            );
          }
        }),
      ),
    );
  }

  // ---- Compute final status ------------------------------------------------
  let status: "ok" | "partial" | "failed" | "inaccessible" = crawl.status;
  if (folderWriteFailed || permWriteFailed) {
    // Downgrade ok → partial when any DB write failed; leave partial/failed unchanged.
    if (status === "ok") status = "partial";
  }

  // ---- Update project crawl status ----------------------------------------
  try {
    await prisma.accProject.update({
      where: { id: project.id },
      data: { folderCrawlStatus: status },
    });
  } catch (err) {
    console.error(
      `[folder-crawl] failed to update folderCrawlStatus for ${project.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[folder-crawl] project=${project.name} folders=${crawl.folders.length} ` +
      `perms=${crawl.permissions.length} status=${status} duration=${durationMs}ms`,
  );

  return {
    folderCount: crawl.folders.length,
    permissionCount: crawl.permissions.length,
    status,
  };
}

// ---------------------------------------------------------------------------
// Permissions-only recovery pass (2026-05-19)
// ---------------------------------------------------------------------------
//
// Use case: a project that hit the hard cap during Phase 1 (folder discovery)
// wrote its folders to AccFolder but never started Phase 2 (permissions) — so
// it sits in `folderCrawlStatus=partial` with zero rows in AccFolderPermission.
// This skips Phase 1 entirely (re-using already-persisted folders) and runs
// only the per-folder permissions fetch + upsert. Faster than re-crawling
// AND immune to the Phase-1 budget exhaustion that caused the partial in the
// first place.
//
// Re-running on a project with permissions already in the DB is safe: the
// (folderId, roleId) upsert refreshes syncedAt and overwrites permType.
// ---------------------------------------------------------------------------

export interface PermissionsOnlyResult {
  folderCount: number;
  permissionCount: number;
  permissionFetchFailures: number;
  status: "ok" | "partial" | "failed";
  durationMs: number;
}

export async function recoverPermissionsForExistingFolders(
  prisma: PrismaClient,
  project: { id: string; name: string },
  accessToken: string,
  options: { refreshAccessToken?: () => Promise<string> } = {},
): Promise<PermissionsOnlyResult> {
  const startedAt = Date.now();
  const projectIdForPerms = project.id.replace(/^b\./, "");
  let currentToken = accessToken;

  async function withFreshToken<T>(op: (t: string) => Promise<T>): Promise<T> {
    try {
      return await op(currentToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!options.refreshAccessToken || !isExpiredAccessTokenFailure(msg)) throw err;
      currentToken = await options.refreshAccessToken();
      return op(currentToken);
    }
  }

  const folders = await prisma.accFolder.findMany({
    where: { projectId: project.id },
    select: { id: true },
  });

  if (folders.length === 0) {
    console.log(`[perms-recover] project=${project.name} has no AccFolder rows — nothing to do.`);
    return { folderCount: 0, permissionCount: 0, permissionFetchFailures: 0, status: "ok", durationMs: 0 };
  }

  console.log(`[perms-recover] project=${project.name} folders=${folders.length} — fetching permissions…`);

  const fetchLimit = pLimit(PERSIST_CONCURRENCY);
  let fetchFailures = 0;

  const perFolderResults = await Promise.all(
    folders.map((f) =>
      fetchLimit(async () => {
        try {
          const raw = await withFreshToken((t) => fetchFolderPermissions(projectIdForPerms, f.id, t));
          return raw
            .filter((p) => p.subjectType === "ROLE" && p.subjectId)
            .map<RawFolderPermission>((p) => ({
              folderId: f.id,
              roleId: p.subjectId!,
              actions: Array.isArray(p.actions) ? p.actions : [],
            }));
        } catch (err) {
          fetchFailures += 1;
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[perms-recover] fetch failed (folder=${f.id}): ${msg}`);
          return [];
        }
      }),
    ),
  );

  const permissions = perFolderResults.flat();
  const now = new Date();
  const writeLimit = pLimit(PERSIST_CONCURRENCY);
  let writeFailures = 0;

  for (let i = 0; i < permissions.length; i += PERSIST_BATCH_SIZE) {
    const batch = permissions.slice(i, i + PERSIST_BATCH_SIZE);
    await Promise.all(
      batch.map((perm) =>
        writeLimit(async () => {
          const permType = mapActions(perm.actions).tier ?? "View Only";
          try {
            await prisma.accFolderPermission.upsert({
              where: { folderId_roleId: { folderId: perm.folderId, roleId: perm.roleId } },
              create: { folderId: perm.folderId, roleId: perm.roleId, actions: perm.actions, permType, syncedAt: now },
              update: { actions: perm.actions, permType, syncedAt: now },
            });
          } catch (err) {
            writeFailures += 1;
            console.error(
              `[perms-recover] upsert failed (folder=${perm.folderId} role=${perm.roleId}):`,
              err instanceof Error ? err.message : err,
            );
          }
        }),
      ),
    );
  }

  // Status: ok if everything succeeded; partial if any fetch OR write failed.
  // We don't downgrade to "failed" because folders are still intact.
  const status: "ok" | "partial" = fetchFailures > 0 || writeFailures > 0 ? "partial" : "ok";

  try {
    await prisma.accProject.update({ where: { id: project.id }, data: { folderCrawlStatus: status } });
  } catch (err) {
    console.error(
      `[perms-recover] failed to update folderCrawlStatus for ${project.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[perms-recover] project=${project.name} folders=${folders.length} perms=${permissions.length} ` +
      `fetchFailures=${fetchFailures} writeFailures=${writeFailures} status=${status} duration=${durationMs}ms`,
  );

  return {
    folderCount: folders.length,
    permissionCount: permissions.length,
    permissionFetchFailures: fetchFailures,
    status,
    durationMs,
  };
}
