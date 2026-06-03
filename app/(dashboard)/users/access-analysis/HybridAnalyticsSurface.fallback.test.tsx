// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HybridAnalyticsSurface } from "./HybridAnalyticsSurface";

const duckdbClientMocks = vi.hoisted(() => ({
  getDuckDbClient: vi.fn(),
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

describe("HybridAnalyticsSurface fallback rendering", () => {
  beforeEach(() => {
    duckdbClientMocks.getDuckDbClient.mockReset().mockRejectedValue(new Error("worker path failed"));
  });

  it("renders fallback chart content when DuckDB initialization fails", async () => {
    render(<HybridAnalyticsSurface />);

    await waitFor(() => {
      expect(screen.getByText(/DuckDB-Wasm unavailable/)).toBeTruthy();
    });

    expect(screen.getByText("Projects per user")).toBeTruthy();
    expect(screen.getByText("Project One")).toBeTruthy();
    expect(screen.getByText("Admin grants per user")).toBeTruthy();
    expect(screen.getByText("1 project admin grant")).toBeTruthy();
    expect(screen.getByText("Top roles")).toBeTruthy();
    expect(screen.getAllByText("Architect").length).toBeGreaterThan(0);
  });

  it("represents extracted project and role data while DuckDB is still initializing", () => {
    duckdbClientMocks.getDuckDbClient.mockImplementation(() => new Promise(() => undefined));

    render(<HybridAnalyticsSurface />);

    expect(screen.getByText("Top projects")).toBeTruthy();
    expect(screen.getByText("Project One")).toBeTruthy();
    expect(screen.getByText("Top roles")).toBeTruthy();
    expect(screen.getAllByText("Architect").length).toBeGreaterThan(0);
  });
});
