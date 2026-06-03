import type { Table } from "apache-arrow";
import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGraphAnalyticsViewSql,
  GRAPH_ANALYTICS_SOURCE_TABLES,
  quoteSqlIdent,
  registerActivityBucketsView,
  registerGraphArrowTables,
  resetGraphArrowTableRegistrationQueueForTests,
} from "./graphSql";
import type { GraphArrowTables } from "./graphTables";

describe("graphSql", () => {
  it("quotes SQL identifiers safely", () => {
    expect(quoteSqlIdent('odd"name')).toBe('"odd""name"');
  });

  it("creates DuckDB view SQL using quoted source and view names", () => {
    const sql = createGraphAnalyticsViewSql({
      sourceTables: {
        users: 'graph"users',
        userProjects: "graph_user_projects",
        similarityEdges: "graph_similarity_edges",
        folderPermissions: "graph_folder_permissions",
      },
    });

    expect(sql).toContain('CREATE OR REPLACE VIEW "users" AS SELECT * FROM "graph""users"');
    expect(sql).toContain('CREATE OR REPLACE VIEW "user_projects" AS SELECT * FROM "graph_user_projects"');
    expect(sql).toContain('CREATE OR REPLACE VIEW "similarity_edges" AS SELECT * FROM "graph_similarity_edges"');
    expect(sql).toContain('CREATE OR REPLACE VIEW "folder_permissions" AS SELECT * FROM "graph_folder_permissions"');
  });

  it("uses BIGINT millisecond thresholds for activity buckets", async () => {
    const connection = { query: vi.fn(async () => undefined) } as unknown as AsyncDuckDBConnection;

    await registerActivityBucketsView(connection);

    const sql = String(vi.mocked(connection.query).mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("2592000000::BIGINT");
    expect(sql).toContain("7776000000::BIGINT");
    expect(sql).not.toContain("30  * 86400000");
    expect(sql).not.toContain("90  * 86400000");
  });

  afterEach(() => {
    resetGraphArrowTableRegistrationQueueForTests();
  });

  it("never exposes a missing source table mid-refresh", async () => {
    // Mosaic's vgplot charts share this connection (see MosaicCoordinatorContext)
    // and query the `users` view, which resolves to the `graph_users` source
    // table. Their reads are NOT serialized against registration, so a read can
    // land between any two registration ops. The connection runs ops serially,
    // so a reader can only ever observe catalog state *between* ops. We snapshot
    // the catalog after every op: if `graph_users` is ever absent once seeded, a
    // concurrent read could hit DuckDB's "Table ... does not exist" Catalog Error
    // (view->table dependencies are not tracked) — the crash we are fixing.
    const catalog = new Set<string>();
    let seeded = false;
    let observedMissingSource = false;

    const snapshot = () => {
      if (seeded && !catalog.has(GRAPH_ANALYTICS_SOURCE_TABLES.users)) {
        observedMissingSource = true;
      }
    };

    const connection = {
      insertArrowTable: vi.fn(async (_table: Table, opts: { name: string }) => {
        catalog.add(opts.name);
        snapshot();
      }),
      query: vi.fn(async (sql: string) => {
        const drop = sql.match(/^DROP TABLE IF EXISTS "([^"]+)"/i);
        if (drop) catalog.delete(drop[1]);
        const replace = sql.match(/^CREATE OR REPLACE TABLE "([^"]+)" AS SELECT \* FROM "([^"]+)"/i);
        if (replace) catalog.add(replace[1]);
        snapshot();
        return { toArray: () => [] };
      }),
    } as unknown as AsyncDuckDBConnection;

    const table = {} as Table;
    const tables: GraphArrowTables = {
      users: table,
      userProjects: table,
      similarityEdges: table,
      folderPermissions: table,
    };

    // Seed the catalog with a completed first registration, then refresh.
    await registerGraphArrowTables(connection, tables);
    seeded = true;
    await registerGraphArrowTables(connection, tables);

    expect(observedMissingSource).toBe(false);
  });

  it("serializes table replacement so overlapping refreshes cannot create duplicate source tables", async () => {
    let activeInserts = 0;
    let maxActiveInserts = 0;
    const connection = {
      query: vi.fn(async () => undefined),
      insertArrowTable: vi.fn(async () => {
        activeInserts += 1;
        maxActiveInserts = Math.max(maxActiveInserts, activeInserts);
        if (activeInserts > 1) throw new Error("concurrent insert");
        await new Promise((resolve) => setTimeout(resolve, 1));
        activeInserts -= 1;
      }),
    } as unknown as AsyncDuckDBConnection;
    const table = {} as Table;
    const tables: GraphArrowTables = {
      users: table,
      userProjects: table,
      similarityEdges: table,
      folderPermissions: table,
    };

    await expect(Promise.all([
      registerGraphArrowTables(connection, tables),
      registerGraphArrowTables(connection, tables),
    ])).resolves.toHaveLength(2);
    expect(maxActiveInserts).toBe(1);
  });
});
