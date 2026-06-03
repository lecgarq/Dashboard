import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BulkAccUser } from "@/lib/acc/acc-types";
import {
  buildFallbackAnalyticsState,
  errorToAnalyticsDiagnostic,
  resetGraphAnalyticsQueryQueueForTests,
  runGraphAnalyticsQueries,
} from "./analyticsQueries";
import { resetGraphArrowTableRegistrationQueueForTests } from "./graphSql";

function user(overrides: Partial<BulkAccUser>): BulkAccUser {
  return {
    email: "alpha@example.com",
    name: "Alpha",
    found: true,
    projectCount: 1,
    activeCount: 1,
    adminCount: 0,
    hasNoProjects: false,
    syncedAt: "2026-05-01T00:00:00.000Z",
    allRoles: ["Architect"],
    allModules: ["Docs"],
    projects: [],
    isAccountAdmin: false,
    addedOn: null,
    ...overrides,
  };
}

describe("analyticsQueries", () => {
  afterEach(() => {
    resetGraphAnalyticsQueryQueueForTests();
    resetGraphArrowTableRegistrationQueueForTests();
  });

  it("builds fallback folder tier rows from matrix data", () => {
    const state = buildFallbackAnalyticsState(
      [user({ email: "alpha@example.com" })],
      [
        { folderId: "f1", folderPath: "Plans", projectId: "p1", roleId: "Architect", permType: "View Only" },
        { folderId: "f2", folderPath: "Specs", projectId: "p1", roleId: "Architect", permType: "Full Controller" },
        { folderId: "f3", folderPath: "Models", projectId: "p1", roleId: "Manager", permType: "Full Controller" },
      ],
    );

    expect(state.folderPermissionTiers).toEqual([
      { label: "Full Controller", value: 2, field: "perm_tier", values: ["Full Controller"] },
      { label: "View Only", value: 1, field: "perm_tier", values: ["View Only"] },
    ]);
  });

  it("keeps DuckDB diagnostics explicit in fallback mode", () => {
    expect(errorToAnalyticsDiagnostic(new Error("worker path failed"))).toContain("DuckDB-Wasm unavailable");
  });

  it("serializes full DuckDB analytics runs so refresh registration cannot overlap chart reads", async () => {
    let activeChartReads = 0;
    const queryResult = { toArray: () => [] };
    const connection = {
      insertArrowTable: vi.fn(async () => undefined),
      query: vi.fn(async (sql: string) => {
        const normalized = sql.trim().toUpperCase();
        if (normalized.startsWith("SELECT")) {
          activeChartReads += 1;
          await new Promise((resolve) => setTimeout(resolve, 5));
          activeChartReads -= 1;
          return queryResult;
        }
        if (activeChartReads > 0) throw new Error("registration overlapped chart reads");
        return queryResult;
      }),
    } as unknown as AsyncDuckDBConnection;
    const users = [
      user({
        email: "alpha@example.com",
        projects: [
          { id: "p1", name: "Project One", status: "active", isAdmin: false, roles: ["Architect"], modules: ["Docs"] },
        ],
      }),
    ];

    await expect(Promise.all([
      runGraphAnalyticsQueries({ connection, users }),
      runGraphAnalyticsQueries({ connection, users }),
    ])).resolves.toHaveLength(2);
  });

  it("uses BIGINT millisecond thresholds in DuckDB recency aggregation", async () => {
    const queryResult = { toArray: () => [] };
    const connection = {
      insertArrowTable: vi.fn(async () => undefined),
      query: vi.fn(async () => queryResult),
    } as unknown as AsyncDuckDBConnection;

    await runGraphAnalyticsQueries({ connection, users: [user({ email: "alpha@example.com" })] });

    const recencySql = vi.mocked(connection.query).mock.calls
      .map(([sql]) => String(sql))
      .find((sql) => sql.includes("GROUP BY bucket") && sql.includes("epoch_ms(now())"));
    expect(recencySql).toContain("2592000000::BIGINT");
    expect(recencySql).toContain("7776000000::BIGINT");
    expect(recencySql).not.toContain("30 * 86400000");
    expect(recencySql).not.toContain("90 * 86400000");
  });
});
