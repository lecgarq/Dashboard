// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HybridAnalyticsSurface } from "./HybridAnalyticsSurface";
import type { AnalyticsQueryState } from "./analyticsQueries";

const duckdbClientMocks = vi.hoisted(() => ({
  getDuckDbClient: vi.fn(),
}));

const analyticsQueryMocks = vi.hoisted(() => ({
  runGraphAnalyticsQueries: vi.fn(),
}));

vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accSync: {
      getActiveDeepSyncJob: { useQuery: () => ({ data: null }) },
      getSyncFreshness: { useQuery: () => ({ data: undefined }) },
      getDcIngestStatus: { useQuery: () => ({ data: undefined }) },
    },
    accMembers: {
      getKpiSummary: { useQuery: () => ({ data: undefined }) },
      getGovernanceCompliance: {
        useQuery: () => ({
          data: {
            score: 95,
            violations: [],
            metrics: { criticalCount: 0, warningCount: 0, infoCount: 0, auditedUsersCount: 1 }
          }
        })
      },
      getPermissionRiskScorecard: {
        useQuery: () => ({
          data: {
            worstUsersByFootprint: [
              { email: "alpha@example.com", name: "Alpha", company: "LECG", projectCount: 12, distinctRoles: 3, rolesHeld: ["Architect"] }
            ],
            worstUsersByBlastRadius: [
              { email: "alpha@example.com", name: "Alpha", company: "LECG", writeFolderCount: 5, adminFolderCount: 2 }
            ],
            overPrivilegedRoles: [
              { roleName: "Architect", projectCount: 12, fullControllerCount: 2 }
            ],
            inheritanceBreaks: [
              { roleName: "Architect", averageAssignmentsPerProject: 1.5, totalFolderAssignments: 18 }
            ],
            lockouts: [
              { folderName: "Plans", projectName: "Project One", folderPath: "/Plans" }
            ],
            sprawlFolders: [
              { folderName: "Plans", projectName: "Project One", folderPath: "/Plans", totalRoles: 4 }
            ]
          }
        })
      },
    },
    accFolders: {
      getMatrix: {
        useQuery: () => ({
          data: {
            rows: [
              {
                folderId: "f1",
                folderPath: "/Plans",
                projectId: "p1",
                roleName: "Architect",
                permType: "View",
              },
            ],
          },
        }),
      },
    },
  },
}));

vi.mock("../useMergedAccUsers", () => ({
  useMergedAccUsers: () => ({
    loading: false,
    users: [
      {
        email: "alpha@example.com",
        name: "Alpha",
        found: true,
        projectCount: 12,
        activeCount: 1,
        adminCount: 1,
        hasNoProjects: false,
        syncedAt: "2026-05-01T00:00:00.000Z",
        allRoles: ["Architect"],
        allModules: ["Docs"],
        projects: [
          {
            id: "p1",
            name: "Project One",
            status: "active",
            isAdmin: true,
            roles: ["Architect"],
            modules: ["Docs"],
          },
        ],
        isAccountAdmin: false,
        addedOn: null,
        lastSignIn: "2026-04-20T00:00:00.000Z",
        companyName: "LECG",
      },
    ],
  }),
}));

vi.mock("./duckdbClient", () => ({
  canInitializeDuckDbInBrowser: () => true,
  getDuckDbClient: duckdbClientMocks.getDuckDbClient,
}));

vi.mock("./analyticsQueries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./analyticsQueries")>();
  return {
    ...actual,
    runGraphAnalyticsQueries: analyticsQueryMocks.runGraphAnalyticsQueries,
  };
});

vi.mock("./AccessEventsChart", () => ({
  AccessEventsChart: () => <div data-testid="timeline-chart" />,
}));

vi.mock("./DistributionPanel", () => ({
  DistributionPanel: ({ title }: { title: string }) => <div data-testid="mosaic-distribution">{title}</div>,
}));

vi.mock("./HeatmapPanel", () => ({
  HeatmapPanel: ({ title }: { title: string }) => <div data-testid="mosaic-heatmap">{title}</div>,
}));

vi.mock("./HistogramPanel", () => ({
  HistogramPanel: ({ title }: { title: string }) => <div data-testid="mosaic-histogram">{title}</div>,
}));

const READY_STATE: AnalyticsQueryState = {
  status: "ready",
  projectMembership: [
    { label: "Project One", value: 1, field: "project_id", values: ["p1"] },
  ],
  roleDistribution: [
    { label: "Architect", value: 1, field: "role_id", values: ["Architect"] },
  ],
  folderPermissionTiers: [
    { label: "View", value: 1, field: "perm_tier", values: ["View"] },
  ],
  activityRecency: [
    { label: "0-30d", value: 1, field: "user_id", values: ["alpha@example.com"] },
  ],
  similarityDimensions: [],
  diagnostic: null,
};

describe("HybridAnalyticsSurface main DuckDB-Wasm query path", () => {
  beforeEach(() => {
    duckdbClientMocks.getDuckDbClient.mockReset().mockResolvedValue({ connection: {} });
    analyticsQueryMocks.runGraphAnalyticsQueries.mockReset().mockResolvedValue(READY_STATE);
  });

  it("renders the DuckDB-Wasm ready badge and the Mosaic panels when the main query resolves", async () => {
    render(<HybridAnalyticsSurface />);

    await waitFor(() => {
      expect(screen.getByText("DuckDB-Wasm")).toBeTruthy();
    });

    expect(screen.getAllByTestId("mosaic-distribution").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("mosaic-heatmap").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("mosaic-histogram").length).toBe(3);

    expect(screen.queryByText(/DuckDB-Wasm unavailable/)).toBeNull();
  });

  it("calls runGraphAnalyticsQueries with the connection, users, and folderRows contract", async () => {
    render(<HybridAnalyticsSurface />);

    await waitFor(() => {
      expect(analyticsQueryMocks.runGraphAnalyticsQueries).toHaveBeenCalled();
    });

    const callArg = analyticsQueryMocks.runGraphAnalyticsQueries.mock.calls[0][0];
    expect(callArg).toHaveProperty("connection");
    expect(Array.isArray(callArg.users)).toBe(true);
    expect(Array.isArray(callArg.folderRows)).toBe(true);
  });
});
