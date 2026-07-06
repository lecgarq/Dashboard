/**
 * Pure transform for the "Activity share by project" donut (Overview tab,
 * item 3, UAT-21.1-03). Aggregates `ModuleActivityRow[]` (the same rows
 * `moduleActivityView.ts`'s `loadModuleActivity()` already ships for the
 * "Activity by module" donut) per project into a top-N + "Other" donut,
 * with a per-project drill payload for `summarizeModules`. No React/DOM/IO —
 * safe on both server and client.
 *
 * NO new loader, NO new fetch — purely client-side re-aggregation of the
 * existing `moduleRows` prop.
 */
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

/** Default top-N cutoff before projects fold into "Other (N projects)". */
export const DEFAULT_TOP_N = 10;

/** One project's total activity volume (or the trailing "Other" bucket). */
export interface ProjectActivitySlice {
  /** "" for the Other bucket. */
  projectId: string;
  /** projectName, or "Other (N projects)" for the collapsed tail. */
  name: string;
  /** Total activity volume. */
  value: number;
}

export interface ProjectActivitySummary {
  /** Top-N projects by volume desc, plus a trailing "Other (N projects)" slice
   *  (omitted when every project fits inside topN). */
  slices: ProjectActivitySlice[];
  /** Included volume — the synthetic Account-level bucket is excluded. */
  total: number;
  /** Excluded synthetic Account-level ("" projectId) volume, for the caption. */
  accountLevelCount: number;
  /** Count of projects folded into the Other bucket (0 if none). */
  otherProjectCount: number;
  /** projectId -> its raw rows, for KEPT slices only (feeds `summarizeModules`
   *  on click-to-drill). No entry for the Other bucket or Account-level. */
  rowsByProject: Map<string, ModuleActivityRow[]>;
}

/**
 * Aggregates activity rows (already project-filtered by the caller) per
 * project: total activity volume and the raw rows behind it (for the
 * per-project module-breakdown drill). The synthetic Account-level bucket
 * (`projectId === ""` — the exact sentinel `moduleActivityView.ts`'s
 * `ACCOUNT_LEVEL` logic uses) is excluded from the donut entirely and its
 * volume surfaced separately as `accountLevelCount` for the caption.
 *
 * Sorted by volume desc (tiebreak `name.localeCompare`); projects beyond
 * `topN` collapse into a single trailing "Other (N projects)" slice (no
 * drill entry — same convention as `summarizePermissionLevel`/
 * `summarizeProvisionedModules`). `total` sums all non-Account-level volume
 * (kept + Other), so donut percentages add to 100%.
 */
export function summarizeProjectActivity(
  rows: ReadonlyArray<ModuleActivityRow>,
  topN: number = DEFAULT_TOP_N,
): ProjectActivitySummary {
  let accountLevelCount = 0;
  const byProject = new Map<
    string,
    { projectId: string; projectName: string; value: number; rows: ModuleActivityRow[] }
  >();

  for (const row of rows) {
    if (row.projectId === "") {
      accountLevelCount += row.count;
      continue;
    }
    const entry = byProject.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      value: 0,
      rows: [],
    };
    entry.value += row.count;
    entry.rows.push(row);
    byProject.set(row.projectId, entry);
  }

  const projects = [...byProject.values()].sort(
    (a, b) => b.value - a.value || a.projectName.localeCompare(b.projectName),
  );

  const limit = Math.max(0, topN);
  const kept = projects.slice(0, limit);
  const rest = projects.slice(limit);

  const slices: ProjectActivitySlice[] = kept.map((p) => ({
    projectId: p.projectId,
    name: p.projectName,
    value: p.value,
  }));

  const otherProjectCount = rest.length;
  if (rest.length > 0) {
    const noun = rest.length === 1 ? "project" : "projects";
    slices.push({
      projectId: "",
      name: `Other (${rest.length} ${noun})`,
      value: rest.reduce((sum, p) => sum + p.value, 0),
    });
  }

  const total = slices.reduce((sum, s) => sum + s.value, 0);

  const rowsByProject = new Map<string, ModuleActivityRow[]>();
  for (const p of kept) {
    rowsByProject.set(p.projectId, p.rows);
  }

  return { slices, total, accountLevelCount, otherProjectCount, rowsByProject };
}
