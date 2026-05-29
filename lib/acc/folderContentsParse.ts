/**
 * folderContentsParse.ts — pure parser for the Data Management "folder contents" response.
 *
 * Splits the JSON:API payload into (a) sub-folders for the BFS crawl (unchanged behaviour)
 * and (b) a per-folder FILE rollup from the items' tip versions (Slice D). The crawl used to
 * request `?filter[type]=folders`, which suppressed items entirely; once that filter is
 * dropped the same call also returns items (`data[]`) + their tip versions (`included[]`),
 * which carry storageSize / versionNumber / lastModifiedTime / lastModifiedUserName /
 * createUserName. No IO here — unit-tested against a fixture.
 */

export interface ApsFolderNode {
  id: string;
  attributes?: { displayName?: string; name?: string };
  relationships?: { parent?: { data?: { id?: string } } };
}

/** Per-folder rollup of the files directly in a folder, derived from their tip versions. */
export interface FolderItemRollup {
  fileCount: number;
  totalSizeBytes: number;
  /** ISO timestamp — the most recent lastModifiedTime across the folder's files. */
  lastModifiedTime: string | null;
  /** Name of the most-recent modifier (paired with lastModifiedTime). */
  lastModifiedBy: string | null;
  /** createUserName of the most-recent version (paired with lastModifiedTime). */
  latestVersionAddedBy: string | null;
  /** Highest tip versionNumber seen in the folder. */
  maxVersionNumber: number | null;
}

interface RawContents {
  data?: unknown[];
  included?: unknown[];
}

export const EMPTY_ROLLUP: FolderItemRollup = {
  fileCount: 0,
  totalSizeBytes: 0,
  lastModifiedTime: null,
  lastModifiedBy: null,
  latestVersionAddedBy: null,
  maxVersionNumber: null,
};

export function parseFolderContents(parsed: RawContents): { folders: ApsFolderNode[]; rollup: FolderItemRollup } {
  const data = Array.isArray(parsed.data) ? parsed.data : [];
  const included = Array.isArray(parsed.included) ? parsed.included : [];

  const folders = data.filter((d): d is ApsFolderNode => (d as { type?: unknown } | null)?.type === "folders");

  const rollup: FolderItemRollup = { ...EMPTY_ROLLUP };
  for (const v of included) {
    if ((v as { type?: unknown } | null)?.type !== "versions") continue;
    const a = ((v as { attributes?: Record<string, unknown> }).attributes ?? {}) as Record<string, unknown>;
    rollup.fileCount += 1;
    if (typeof a.storageSize === "number" && Number.isFinite(a.storageSize)) {
      rollup.totalSizeBytes += a.storageSize;
    }
    if (typeof a.versionNumber === "number") {
      rollup.maxVersionNumber = Math.max(rollup.maxVersionNumber ?? 0, a.versionNumber);
    }
    const lmt = typeof a.lastModifiedTime === "string" ? a.lastModifiedTime : null;
    if (lmt && (rollup.lastModifiedTime === null || lmt > rollup.lastModifiedTime)) {
      rollup.lastModifiedTime = lmt;
      rollup.lastModifiedBy = typeof a.lastModifiedUserName === "string" ? a.lastModifiedUserName : null;
      rollup.latestVersionAddedBy = typeof a.createUserName === "string" ? a.createUserName : null;
    }
  }
  return { folders, rollup };
}
