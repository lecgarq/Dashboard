import type { Table } from "apache-arrow";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { GraphArrowTables } from "./graphTables";

export const GRAPH_ANALYTICS_SOURCE_TABLES = {
  users: "graph_users",
  userProjects: "graph_user_projects",
  similarityEdges: "graph_similarity_edges",
  folderPermissions: "graph_folder_permissions",
} as const;

export const ACTIVITY_RECENCY_THRESHOLDS_SQL = {
  active30dMs: "2592000000::BIGINT",
  active90dMs: "7776000000::BIGINT",
} as const;

export interface GraphAnalyticsSourceTables {
  users: string;
  userProjects: string;
  similarityEdges: string;
  folderPermissions: string;
}

export function quoteSqlIdent(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function createGraphAnalyticsViewSql({
  sourceTables = GRAPH_ANALYTICS_SOURCE_TABLES,
}: { sourceTables?: GraphAnalyticsSourceTables } = {}): string {
  return [
    ["users", sourceTables.users],
    ["user_projects", sourceTables.userProjects],
    ["similarity_edges", sourceTables.similarityEdges],
    ["folder_permissions", sourceTables.folderPermissions],
  ]
    .map(([viewName, sourceName]) => `CREATE OR REPLACE VIEW ${quoteSqlIdent(viewName)} AS SELECT * FROM ${quoteSqlIdent(sourceName)};`)
    .join("\n");
}

async function replaceArrowTable(connection: AsyncDuckDBConnection, name: string, table: Table): Promise<void> {
  // The previous implementation dropped `name` and then re-inserted it as two
  // separate statements. The `users` / `user_projects` / ... views resolve to
  // these source tables by name, and Mosaic's vgplot charts query those views on
  // the SAME shared DuckDB connection without being serialized against this
  // refresh (see MosaicCoordinatorContext + analyticsQueries query queue). A
  // chart read landing in the drop->insert gap throws a DuckDB Catalog Error
  // ("Table with name <name> does not exist") because view->table dependencies
  // are not tracked — crashing the analytics surface on every refresh.
  //
  // Instead, stage the Arrow data in an internal table that no view references
  // (so its churn is invisible to readers), then publish it with a single
  // transactional `CREATE OR REPLACE TABLE`. That swap is atomic, so a
  // concurrent reader always observes either the old or the new table, never a
  // missing one.
  const staging = `${name}__staging`;
  await connection.query(`DROP TABLE IF EXISTS ${quoteSqlIdent(staging)};`);
  await connection.insertArrowTable(table, { name: staging, create: true });
  await connection.query(
    `CREATE OR REPLACE TABLE ${quoteSqlIdent(name)} AS SELECT * FROM ${quoteSqlIdent(staging)};`,
  );
  await connection.query(`DROP TABLE IF EXISTS ${quoteSqlIdent(staging)};`);
}

let graphArrowTableRegistrationQueue: Promise<void> = Promise.resolve();

async function registerGraphArrowTablesUnlocked(connection: AsyncDuckDBConnection, tables: GraphArrowTables): Promise<void> {
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.users, tables.users);
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.userProjects, tables.userProjects);
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.similarityEdges, tables.similarityEdges);
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.folderPermissions, tables.folderPermissions);
  await connection.query(createGraphAnalyticsViewSql());
  await registerActivityBucketsView(connection);
}

export async function registerGraphArrowTables(connection: AsyncDuckDBConnection, tables: GraphArrowTables): Promise<void> {
  const run = graphArrowTableRegistrationQueue.then(() => registerGraphArrowTablesUnlocked(connection, tables));
  graphArrowTableRegistrationQueue = run.catch(() => undefined);
  return run;
}

export function resetGraphArrowTableRegistrationQueueForTests(): void {
  graphArrowTableRegistrationQueue = Promise.resolve();
}

/**
 * Creates (or replaces) the `user_activity_buckets` view that buckets each user
 * by how recently they last signed in.
 *
 * `last_sign_in` in the `users` table is stored as epoch-milliseconds (BIGINT / null),
 * matching the output of `timestampMillis()` in graphTables.ts. The comparison
 * `epoch_ms(now()) - last_sign_in` therefore yields a millisecond delta.
 *
 * The view exposes a `user_id` column (= email) so that
 * `COUNT(DISTINCT user_id)` in HistogramPanel works correctly.
 */
export async function registerActivityBucketsView(connection: AsyncDuckDBConnection): Promise<void> {
  await connection.query(`
    CREATE OR REPLACE VIEW user_activity_buckets AS
    SELECT
      email AS user_id,
      CASE
        WHEN last_sign_in IS NULL                                                           THEN 'No sign-in'
        WHEN epoch_ms(now()) - last_sign_in <= ${ACTIVITY_RECENCY_THRESHOLDS_SQL.active30dMs} THEN '0-30d'
        WHEN epoch_ms(now()) - last_sign_in <= ${ACTIVITY_RECENCY_THRESHOLDS_SQL.active90dMs} THEN '31-90d'
        ELSE '90d+'
      END AS bucket
    FROM users
  `);
}
