import type { Table } from "apache-arrow";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { GraphArrowTables } from "./graphTables";

export const GRAPH_ANALYTICS_SOURCE_TABLES = {
  users: "graph_users",
  userProjects: "graph_user_projects",
  similarityEdges: "graph_similarity_edges",
  folderPermissions: "graph_folder_permissions",
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
  await connection.query(`DROP TABLE IF EXISTS ${quoteSqlIdent(name)};`);
  await connection.insertArrowTable(table, { name, create: true });
}

export async function registerGraphArrowTables(connection: AsyncDuckDBConnection, tables: GraphArrowTables): Promise<void> {
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.users, tables.users);
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.userProjects, tables.userProjects);
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.similarityEdges, tables.similarityEdges);
  await replaceArrowTable(connection, GRAPH_ANALYTICS_SOURCE_TABLES.folderPermissions, tables.folderPermissions);
  await connection.query(createGraphAnalyticsViewSql());
  await registerActivityBucketsView(connection);
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
        WHEN last_sign_in IS NULL                                   THEN 'No sign-in'
        WHEN epoch_ms(now()) - last_sign_in <= 30  * 86400000       THEN '0-30d'
        WHEN epoch_ms(now()) - last_sign_in <= 90  * 86400000       THEN '31-90d'
        ELSE '90d+'
      END AS bucket
    FROM users
  `);
}

