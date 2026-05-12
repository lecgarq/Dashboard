/**
 * Pure depth-N folder-collapse module.
 *
 * Folds rows from `accFoldersRouter.getMatrix` down to a smaller set of folder
 * "hubs" at depth N (default 2). Permissions on descendants are UNIONed onto
 * the depth-N ancestor and deduped per `(roleId, permType)` — no silent drop
 * of permission picture (Pitfall 3 of phase RESEARCH).
 *
 * Pure: zero Prisma, zero React, no external runtime deps.
 *
 * Plan 07-02. Consumed by Plan 07-05 (2D wiring) and 07-07 (3D wiring).
 */

/**
 * Structural input shape — the 5 fields used from `FolderMatrixRow`
 * (see `server/routers/acc-folders.ts:FolderMatrixRow`). Callers can adapt
 * any object satisfying this shape; we deliberately avoid importing the
 * server-router type so this module stays pure.
 */
export interface FolderHubInputRow {
  folderId: string;
  folderPath: string;
  projectId: string;
  roleId: string;
  permType: string;
}

export interface CollapsedFolder {
  /** Original folderId when depth ≤ maxDepth; else `collapsed:${projectId}::${path}`. */
  id: string;
  projectId: string;
  /** Last non-empty path segment, or the full path if no segments. */
  name: string;
  /** Folder path at the collapse boundary. */
  fullPath: string;
  /** Deduped union of (roleId, permType) across all descendants. */
  permissions: Array<{ roleId: string; permType: string }>;
}

function splitSegments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/**
 * Collapse folder-permission rows to depth `maxDepth` (default 2).
 *
 * - depth ≤ maxDepth → folder preserved as-is (id, path unchanged).
 * - depth > maxDepth → folded into a synthetic hub at depth `maxDepth`.
 *   - Hub id is `collapsed:${projectId}::${collapsedPath}`.
 *   - Permissions from all descendant rows are UNIONed (deduped on
 *     `roleId::permType`).
 * - `maxDepth=Infinity` short-circuits the collapse for every row.
 * - Cross-project rows on identical paths are never merged.
 */
export function collapseFoldersToDepth(
  rows: ReadonlyArray<FolderHubInputRow>,
  maxDepth: number = 2
): CollapsedFolder[] {
  const groups = new Map<
    string,
    {
      id: string;
      projectId: string;
      name: string;
      fullPath: string;
      permSeen: Set<string>;
      permissions: Array<{ roleId: string; permType: string }>;
    }
  >();

  // Preserve first-seen order so callers get stable output across runs.
  const order: string[] = [];

  for (const r of rows) {
    const segs = splitSegments(r.folderPath);
    const depth = segs.length;

    let collapsedPath: string;
    let collapsedId: string;

    if (depth <= maxDepth) {
      // Preserve as-is (also covers maxDepth=Infinity).
      collapsedPath = r.folderPath;
      collapsedId = r.folderId;
    } else {
      const truncSegs = segs.slice(0, maxDepth);
      collapsedPath = "/" + truncSegs.join("/");
      collapsedId = `collapsed:${r.projectId}::${collapsedPath}`;
    }

    // Key by (projectId, collapsedPath) so cross-project paths stay distinct.
    const groupKey = `${r.projectId}::${collapsedPath}`;
    let group = groups.get(groupKey);
    if (!group) {
      // For shallow rows we still want the original folderId on the first
      // observation; for collapsed rows the id is deterministic by key.
      const segsForName = splitSegments(collapsedPath);
      const name =
        segsForName.length > 0 ? segsForName[segsForName.length - 1] : collapsedPath;
      group = {
        id: collapsedId,
        projectId: r.projectId,
        name,
        fullPath: collapsedPath,
        permSeen: new Set<string>(),
        permissions: [],
      };
      groups.set(groupKey, group);
      order.push(groupKey);
    }

    const permKey = `${r.roleId}::${r.permType}`;
    if (!group.permSeen.has(permKey)) {
      group.permSeen.add(permKey);
      group.permissions.push({ roleId: r.roleId, permType: r.permType });
    }
  }

  return order.map((k) => {
    const g = groups.get(k)!;
    return {
      id: g.id,
      projectId: g.projectId,
      name: g.name,
      fullPath: g.fullPath,
      permissions: g.permissions,
    };
  });
}
