/**
 * Pure transform for the "Issues by type" panel (ISSUE-05). Aggregates
 * `IssueFunnelTypeRow[]` (from `lib/server/issueFunnelView.ts`) into a top-N +
 * "Other" bucket list, cloning `permissionLevelCounts.ts::summarizePermissionLevel`'s
 * sort/slice/fold/drill-map shape. No React/DOM/IO — safe on both server and client.
 *
 * Aggregation rule (22-CONTEXT.md, planner decision, grounded): group resolved
 * rows by **typeName**, not GUID — APS issue types are project(container)-scoped,
 * so the same logical type ("Quality") carries a different GUID per project;
 * grouping by GUID would fragment the account-wide top-N into hundreds of
 * duplicate name rows (316 GUIDs vs a per-project taxonomy of ~10-25 names).
 * The caption stats stay GUID-level (`resolvedTypeGuids`/`totalTypeGuids`).
 *
 * Honesty guarantee: rows with a non-null `issueTypeId` whose GUID isn't in the
 * lookup table fold into ONE "Unknown type" bucket; rows with a null
 * `issueTypeId` fold into ONE "No type set" bucket. Both are distinct, both
 * compete for top-N rank by count like any real type — never pinned, never
 * dropped (20.1-03 UNKNOWN_COMPANY precedent). `total` always equals the sum of
 * every input row's count, independent of the top-N fold, so the panel
 * reconciles with the status donut above it.
 */
import type { IssueFunnelTypeRow } from "@/lib/server/issueFunnelView";

/** Default top-N cutoff before types fold into "Other (N types)". Exported so the
 * chart component can pass it back explicitly when the owner expands the
 * collapsed view (20.1-07 expand-in-place pattern: re-invoke with topN = rows.length). */
export const DEFAULT_TOP_N = 10;

const UNKNOWN_KEY = "__unknown_type__";
const UNKNOWN_LABEL = "Unknown type";
const NONE_KEY = "__no_type__";
const NONE_LABEL = "No type set";
const OTHER_KEY = "__other__";

export interface IssueTypeBucket {
  key: string;
  label: string;
  kind: "named" | "unknown" | "none" | "other";
  count: number;
}

/** One project row within a bucket's drill-down. */
interface IssueTypeProjectRow {
  projectId: string;
  projectName: string;
  count: number;
}

export interface IssueTypeSummary {
  /** Top-N buckets by count desc (ties by label asc), plus a trailing "Other (N types)" bucket. */
  buckets: IssueTypeBucket[];
  /** Bucket key -> per-project count rows sorted desc. No entry for the "Other" bucket. */
  projectsByBucket: Record<string, IssueTypeProjectRow[]>;
  /** Pre-fold bucket count — drives the "Other (N types)" label and the expand link. */
  totalBuckets: number;
  /** Sum of every input row's count — must reconcile with the status donut. */
  total: number;
  /** Distinct non-null issueTypeId GUIDs that resolved to a name. */
  resolvedTypeGuids: number;
  /** Distinct non-null issueTypeId GUIDs, resolved or not. */
  totalTypeGuids: number;
}

interface BucketAccumulator {
  key: string;
  label: string;
  kind: "named" | "unknown" | "none";
  count: number;
  projects: Map<string, IssueTypeProjectRow>;
}

/**
 * Aggregates per-(project, issueTypeId) rows into top-N + "Other" buckets,
 * grouped by resolved typeName (see module doc for the GUID-vs-name rationale).
 * Sorted count desc (tiebreak label localeCompare); buckets beyond `topN`
 * collapse into a single "Other (N types)" bucket with no drill entry.
 */
export function summarizeIssueType(
  rows: ReadonlyArray<IssueFunnelTypeRow>,
  topN: number = DEFAULT_TOP_N,
): IssueTypeSummary {
  const byKey = new Map<string, BucketAccumulator>();
  const resolvedGuids = new Set<string>();
  const allGuids = new Set<string>();
  let total = 0;

  for (const r of rows) {
    total += r.count;
    if (r.issueTypeId != null) {
      allGuids.add(r.issueTypeId);
      if (r.typeName != null) resolvedGuids.add(r.issueTypeId);
    }

    let key: string;
    let label: string;
    let kind: BucketAccumulator["kind"];
    if (r.issueTypeId == null) {
      key = NONE_KEY;
      label = NONE_LABEL;
      kind = "none";
    } else if (r.typeName == null) {
      key = UNKNOWN_KEY;
      label = UNKNOWN_LABEL;
      kind = "unknown";
    } else {
      key = r.typeName;
      label = r.typeName;
      kind = "named";
    }

    const entry = byKey.get(key) ?? { key, label, kind, count: 0, projects: new Map<string, IssueTypeProjectRow>() };
    entry.count += r.count;
    const existingProject = entry.projects.get(r.projectId);
    if (existingProject) {
      existingProject.count += r.count;
    } else {
      entry.projects.set(r.projectId, { projectId: r.projectId, projectName: r.projectName, count: r.count });
    }
    byKey.set(key, entry);
  }

  const allBuckets = [...byKey.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  const limit = Math.max(0, topN);
  const kept = allBuckets.slice(0, limit);
  const rest = allBuckets.slice(limit);

  const buckets: IssueTypeBucket[] = kept.map((b) => ({
    key: b.key,
    label: b.label,
    kind: b.kind,
    count: b.count,
  }));

  if (rest.length > 0) {
    const noun = rest.length === 1 ? "type" : "types";
    buckets.push({
      key: OTHER_KEY,
      label: `Other (${rest.length} ${noun})`,
      kind: "other",
      count: rest.reduce((sum, b) => sum + b.count, 0),
    });
  }

  const projectsByBucket: Record<string, IssueTypeProjectRow[]> = {};
  for (const b of kept) {
    projectsByBucket[b.key] = [...b.projects.values()].sort(
      (a, c) => c.count - a.count || a.projectName.localeCompare(c.projectName),
    );
  }

  return {
    buckets,
    projectsByBucket,
    totalBuckets: allBuckets.length,
    total,
    resolvedTypeGuids: resolvedGuids.size,
    totalTypeGuids: allGuids.size,
  };
}
