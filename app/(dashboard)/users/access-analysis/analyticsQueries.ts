import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import { buildGraphArrowTables, type GraphFolderPermissionRow } from "./graphTables";
import { ACTIVITY_RECENCY_THRESHOLDS_SQL, registerGraphArrowTables } from "./graphSql";

export interface ChartDatum {
  label: string;
  value: number;
  field: string;
  values: string[];
  detail?: string;
}

export interface AnalyticsQueryState {
  status: "idle" | "loading" | "ready" | "fallback";
  projectMembership: ChartDatum[];
  roleDistribution: ChartDatum[];
  folderPermissionTiers: ChartDatum[];
  activityRecency: ChartDatum[];
  similarityDimensions: ChartDatum[];
  diagnostic: string | null;
}

export const EMPTY_ANALYTICS_QUERY_STATE: AnalyticsQueryState = {
  status: "idle",
  projectMembership: [],
  roleDistribution: [],
  folderPermissionTiers: [],
  activityRecency: [],
  similarityDimensions: [],
  diagnostic: null,
};

function toNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function rowValue(row: unknown, key: string): unknown {
  if (!row || typeof row !== "object") return undefined;
  const record = row as Record<string, unknown>;
  if (key in record) return record[key];
  const maybeJson = "toJSON" in record && typeof record.toJSON === "function"
    ? (record.toJSON as () => Record<string, unknown>)()
    : null;
  return maybeJson?.[key];
}

function topProjectMembership(users: readonly BulkAccUser[]): ChartDatum[] {
  const counts = new Map<string, { label: string; users: Set<string> }>();
  for (const user of users) {
    for (const project of user.projects) {
      const existing = counts.get(project.id) ?? { label: project.name, users: new Set<string>() };
      existing.users.add(user.email.toLowerCase());
      counts.set(project.id, existing);
    }
  }
  return Array.from(counts.entries())
    .map(([id, item]) => ({ label: item.label || id, value: item.users.size, field: "project_id", values: [id] }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function topRoleDistribution(users: readonly BulkAccUser[]): ChartDatum[] {
  const counts = new Map<string, Set<string>>();
  for (const user of users) {
    const roles = new Set([...(user.allRoles ?? []), ...(user.perProjectRoleNames ?? [])].filter(Boolean));
    for (const project of user.projects) for (const role of project.roles) if (role) roles.add(role);
    for (const role of roles) {
      const emails = counts.get(role) ?? new Set<string>();
      emails.add(user.email.toLowerCase());
      counts.set(role, emails);
    }
  }
  return Array.from(counts.entries())
    .map(([role, emails]) => ({ label: role, value: emails.size, field: "role_id", values: [role] }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function activityRecency(users: readonly BulkAccUser[]): ChartDatum[] {
  const now = Date.now();
  const buckets = [
    { label: "0-30d", value: 0, users: [] as string[] },
    { label: "31-90d", value: 0, users: [] as string[] },
    { label: "90d+", value: 0, users: [] as string[] },
    { label: "No sign-in", value: 0, users: [] as string[] },
  ];
  for (const user of users) {
    const t = user.lastSignIn ? Date.parse(user.lastSignIn) : NaN;
    const days = Number.isFinite(t) ? (now - t) / 86_400_000 : Infinity;
    const bucket = !Number.isFinite(days) ? buckets[3] : days <= 30 ? buckets[0] : days <= 90 ? buckets[1] : buckets[2];
    bucket.value++;
    bucket.users.push(user.email.toLowerCase());
  }
  return buckets.map((bucket) => ({ label: bucket.label, value: bucket.value, field: "user_id", values: bucket.users }));
}

function folderPermissionTiers(folderRows: readonly GraphFolderPermissionRow[]): ChartDatum[] {
  const counts = new Map<string, number>();
  for (const row of folderRows) counts.set(row.permType, (counts.get(row.permType) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([tier, value]) => ({ label: tier, value, field: "perm_tier", values: [tier] }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

function fallbackSimilarityDimensions(users: readonly BulkAccUser[], folderRows: readonly GraphFolderPermissionRow[]): ChartDatum[] {
  return [];
}

export function errorToAnalyticsDiagnostic(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `DuckDB-Wasm unavailable; using local fallback aggregations. ${detail}`;
}

export function buildFallbackAnalyticsState(
  users: readonly BulkAccUser[],
  folderRows: readonly GraphFolderPermissionRow[] = [],
  diagnostic: string | null = null,
): AnalyticsQueryState {
  return {
    status: "fallback",
    projectMembership: topProjectMembership(users),
    roleDistribution: topRoleDistribution(users),
    folderPermissionTiers: folderPermissionTiers(folderRows),
    activityRecency: activityRecency(users),
    similarityDimensions: fallbackSimilarityDimensions(users, folderRows),
    diagnostic,
  };
}

let graphAnalyticsQueryQueue: Promise<void> = Promise.resolve();

async function runGraphAnalyticsQueriesUnlocked(input: {
  connection: AsyncDuckDBConnection;
  users: BulkAccUser[];
  folderRows?: readonly GraphFolderPermissionRow[];
}): Promise<AnalyticsQueryState> {
  const folderRows = input.folderRows ?? [];
  const tables = await buildGraphArrowTables({ users: input.users, similarityInput: null, topology: null, folderRows });
  await registerGraphArrowTables(input.connection, tables);

  const [projects, roles, tiers, recency, dims] = await Promise.all([
    input.connection.query(`
      SELECT project_id, any_value(project_name) AS label, count(DISTINCT user_id) AS value
      FROM user_projects
      WHERE project_id <> ''
      GROUP BY project_id
      ORDER BY value DESC, label
      LIMIT 8
    `),
    input.connection.query(`
      SELECT role_id AS label, count(DISTINCT user_id) AS value
      FROM user_projects
      WHERE role_id <> ''
      GROUP BY role_id
      ORDER BY value DESC, label
      LIMIT 8
    `),
    input.connection.query(`
      SELECT perm_tier AS label, count(*) AS value
      FROM folder_permissions
      GROUP BY perm_tier
      ORDER BY value DESC, label
    `),
    input.connection.query(`
      SELECT bucket AS label, count(*) AS value, string_agg(user_id, '|') AS users
      FROM (
        SELECT user_id,
          CASE
            WHEN last_sign_in IS NULL THEN 'No sign-in'
            WHEN epoch_ms(now()) - last_sign_in <= ${ACTIVITY_RECENCY_THRESHOLDS_SQL.active30dMs} THEN '0-30d'
            WHEN epoch_ms(now()) - last_sign_in <= ${ACTIVITY_RECENCY_THRESHOLDS_SQL.active90dMs} THEN '31-90d'
            ELSE '90d+'
          END AS bucket
        FROM users
      )
      GROUP BY bucket
      ORDER BY value DESC, label
    `),
    input.connection.query(`
      SELECT dimension AS label, count(*) AS value, avg(score) AS avg_score
      FROM similarity_edges
      GROUP BY dimension
      ORDER BY value DESC, label
      LIMIT 8
    `),
  ]);

  return {
    status: "ready",
    projectMembership: projects.toArray().map((row) => ({
      label: String(rowValue(row, "label") ?? rowValue(row, "project_id") ?? "Unknown"),
      value: toNumber(rowValue(row, "value")),
      field: "project_id",
      values: [String(rowValue(row, "project_id") ?? "")],
    })),
    roleDistribution: roles.toArray().map((row) => ({
      label: String(rowValue(row, "label") ?? "Unknown"),
      value: toNumber(rowValue(row, "value")),
      field: "role_id",
      values: [String(rowValue(row, "label") ?? "")],
    })),
    folderPermissionTiers: tiers.toArray().map((row) => ({
      label: String(rowValue(row, "label") ?? "Unknown"),
      value: toNumber(rowValue(row, "value")),
      field: "perm_tier",
      values: [String(rowValue(row, "label") ?? "")],
    })),
    activityRecency: recency.toArray().map((row) => ({
      label: String(rowValue(row, "label") ?? "Unknown"),
      value: toNumber(rowValue(row, "value")),
      field: "user_id",
      values: String(rowValue(row, "users") ?? "").split("|").filter(Boolean),
    })),
    similarityDimensions: dims.toArray().map((row) => ({
      label: String(rowValue(row, "label") ?? "Unknown"),
      value: toNumber(rowValue(row, "value")),
      field: "dimension",
      values: [String(rowValue(row, "label") ?? "")],
      detail: `${toNumber(rowValue(row, "avg_score")).toFixed(2)} avg`,
    })),
    diagnostic: null,
  };
}

export async function runGraphAnalyticsQueries(input: {
  connection: AsyncDuckDBConnection;
  users: BulkAccUser[];
  folderRows?: readonly GraphFolderPermissionRow[];
}): Promise<AnalyticsQueryState> {
  const run = graphAnalyticsQueryQueue.then(() => runGraphAnalyticsQueriesUnlocked(input));
  graphAnalyticsQueryQueue = run.then(() => undefined, () => undefined);
  return run;
}

export function resetGraphAnalyticsQueryQueueForTests(): void {
  graphAnalyticsQueryQueue = Promise.resolve();
}
