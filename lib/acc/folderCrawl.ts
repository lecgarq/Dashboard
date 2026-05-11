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

import pLimit from "p-limit";
import { fetchWithRetry } from "@/lib/server/acc-admin";

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
  status: "ok" | "partial" | "failed";
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
): Promise<ApsFolder[]> {
  const url =
    `${DM_BASE}/data/v1/projects/${projectIdForDM}/folders/${folderId}/contents?filter[type]=folders`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`folderContents fetch failed (${res.status}): ${raw}`);
  }
  const parsed = JSON.parse(raw) as { data?: ApsFolder[] };
  return Array.isArray(parsed.data) ? parsed.data : [];
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

  const folders: RawFolder[] = [];
  let status: "ok" | "partial" | "failed" = "ok";
  let reason: string | undefined;
  let softCapWarned = false;

  // BFS queue — starts with a synthetic "root" sentinel to trigger topFolders fetch
  const queue: QueueItem[] = [{ folderId: "root", parentId: null, parentPath: "", isRoot: true }];

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
              const topFolders = await fetchTopFolders(hubId, projectIdForDM, accessToken);
              // Return child queue items (top folders have no parent)
              return { parent: null, children: topFolders, parentPath: "" };
            }

            // Fetch sub-folders of a known folder
            const subFolders = await fetchFolderContents(projectIdForDM, item.folderId, accessToken);
            return { parent: item, children: subFolders, parentPath: item.parentPath };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
              `[folder-crawl] Fetch failed for folder ${item.folderId} (project ${projectIdForDM}): ${msg}`,
            );
            status = "partial";
            reason = reason ?? "fetch_error";
            return { parent: item.isRoot ? null : item, children: [], parentPath: item.parentPath };
          }
        }),
      ),
    );

    // ── Push discovered folders + enqueue children ─────────────────────────
    for (const { parent, children, parentPath } of childSets) {
      for (const child of children) {
        const name = folderName(child);
        const fullPath = parentPath ? `${parentPath}/${name}` : `/${name}`;
        const parentId = parent?.isRoot ? null : (parent?.folderId ?? null);

        folders.push({ id: child.id, parentId, name, fullPath });
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
          const raw = await fetchFolderPermissions(projectIdForPerms, folder.id, accessToken);
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

  return {
    folders,
    permissions,
    durationMs: Date.now() - startedAt,
    status,
    ...(reason ? { reason } : {}),
  };
}
