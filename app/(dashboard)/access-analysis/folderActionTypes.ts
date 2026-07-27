/**
 * Pure transform for the "Activity types by folder" heatmap. Buckets the
 * lossless AccActivityAccds.activityVerb into a small set of folder-level
 * action types (what people DO in a folder: view, download, upload, edit,
 * delete, share, review), then folds (folder, verb) counts into the heatmap
 * cell matrix. No React/DOM/IO — safe on both server and client.
 */

/** One raw cell from the server: activity volume for a (folder, verb) pair. */
export interface FolderActionCell {
  folderName: string;
  verb: string;
  count: number;
}

/** Column order for the heatmap x-axis. */
export const ACTION_TYPES: readonly string[] = [
  "Views",
  "Downloads & exports",
  "Uploads",
  "Edits & moves",
  "Deletions",
  "Sharing & links",
  "Reviews & approvals",
  "Other",
];

/**
 * Verb → folder action type. Rules run in order on the kebab-case verb;
 * transmittals count as sharing (they distribute documents), review/approval
 * workflow verbs group together, and the file-management long tail
 * (create/rename/move/copy/restore/lock/…) reads as "Edits & moves".
 */
export function actionTypeFor(verb: string): string {
  const v = verb.trim().toLowerCase();
  if (/review|approval|approve/.test(v)) return "Reviews & approvals";
  if (/transmittal|public-link|shared-with|share/.test(v)) return "Sharing & links";
  if (/^delete|^remove/.test(v)) return "Deletions";
  if (/^download|^export/.test(v)) return "Downloads & exports";
  if (/^upload/.test(v)) return "Uploads";
  if (/^view|^print|^open/.test(v)) return "Views";
  if (/^create|^rename|^move|^copy|^restore|^edit|^update|^lock|^unlock|^set-|^add-|^attach|^detach|^calibrate|version/.test(v)) {
    return "Edits & moves";
  }
  return "Other";
}

export interface FolderActionMatrix {
  /** Folder names ranked by total activity desc (heatmap y-axis, row 0 = busiest). */
  folders: string[];
  /** Action-type columns actually present, in ACTION_TYPES order (x-axis). */
  types: string[];
  /** Heatmap cells: [typeIndex, folderIndex, count] — zero cells omitted. */
  cells: Array<[number, number, number]>;
  /** Largest single cell count (drives the color scale). */
  maxCount: number;
  /** folderName -> its total activity (for tooltips / row captions). */
  totalByFolder: Map<string, number>;
  /** Sum of all cells. */
  total: number;
}

/** Fold raw (folder, verb) counts into the typed heatmap matrix. */
export function summarizeFolderActionMatrix(rows: ReadonlyArray<FolderActionCell>): FolderActionMatrix {
  // folder -> type -> count
  const byFolder = new Map<string, Map<string, number>>();
  const presentTypes = new Set<string>();
  for (const r of rows) {
    const type = actionTypeFor(r.verb);
    presentTypes.add(type);
    const m = byFolder.get(r.folderName) ?? byFolder.set(r.folderName, new Map()).get(r.folderName)!;
    m.set(type, (m.get(type) ?? 0) + r.count);
  }

  const totalByFolder = new Map<string, number>();
  for (const [name, m] of byFolder) {
    totalByFolder.set(name, [...m.values()].reduce((s, v) => s + v, 0));
  }

  const folders = [...byFolder.keys()].sort(
    (a, b) => (totalByFolder.get(b) ?? 0) - (totalByFolder.get(a) ?? 0) || a.localeCompare(b),
  );
  const types = ACTION_TYPES.filter((t) => presentTypes.has(t));

  const cells: Array<[number, number, number]> = [];
  let maxCount = 0;
  folders.forEach((name, fi) => {
    const m = byFolder.get(name)!;
    types.forEach((t, ti) => {
      const v = m.get(t) ?? 0;
      if (v > 0) {
        cells.push([ti, fi, v]);
        if (v > maxCount) maxCount = v;
      }
    });
  });

  const total = [...totalByFolder.values()].reduce((s, v) => s + v, 0);
  return { folders, types, cells, maxCount, totalByFolder, total };
}
