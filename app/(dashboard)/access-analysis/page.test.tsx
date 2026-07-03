// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/server/accessInstanceView", () => ({
  loadInstanceView: vi.fn(async () => ([
    // Multi-role on one membership -> "Multiple roles".
    { projectId: "p1", projectName: "Tower A", userId: "u1", email: "a@hermosillo.com", name: "Ana",
      isInternal: true, isAdmin: true, status: "active", addedOn: "2024-01-01", company: "Hermosillo",
      roles: ["Admin", "Member"], modules: ["build"], adminModules: ["build"] },
    // Single role -> "Member".
    { projectId: "p2", projectName: "Tower B", userId: "u2", email: "b@acme.com", name: "Bob",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-02-01", company: "Acme",
      roles: ["Member"], modules: ["insight"], adminModules: [] },
    // No role -> "Unknown".
    { projectId: "p3", projectName: "Tower C", userId: "u3", email: "c@acme.com", name: "Cara",
      isInternal: false, isAdmin: false, status: "active", addedOn: "2024-03-01", company: "Acme",
      roles: [], modules: [], adminModules: [] },
  ])),
}));
// Empty activity -> the modules donut renders its empty state (no second echart),
// keeping this test focused on the roles donut.
vi.mock("@/lib/server/moduleActivityView", () => ({
  loadModuleActivity: vi.fn(async () => []),
}));
// Empty actor activity -> the Activity-by-role donut renders its empty state
// (no echart), so the singular getByTestId("echart") still resolves the roles donut.
vi.mock("@/lib/server/activityByActorView", () => ({
  loadActivityByActor: vi.fn(async () => []),
}));
// Empty timeline -> the Activity-over-time section renders its empty state
// (no echart), so the singular getByTestId("echart") still resolves the roles donut.
// Shape matches the new ActivityTimelineResult { rows, dataFloor, floorByProject }.
vi.mock("@/lib/server/activityTimelineView", () => ({
  loadActivityTimeline: vi.fn(async () => ({ rows: [], dataFloor: null, floorByProject: {} })),
}));
vi.mock("@/lib/server/coordinationByProjectView", () => ({
  loadCoordinationByProject: () =>
    Promise.resolve({ rows: [], accessibleProjects: 0, forbiddenProjects: 0, latestRunAt: null, coordinationCount: 0 }),
}));
vi.mock("@/lib/server/projectCoverageView", () => ({
  loadProjectCoverage: () => Promise.resolve([]),
}));
// TRUTH-01: DC coverage loader added by plan 11-04.
vi.mock("@/lib/server/dcCoverageView", () => ({
  loadDcCoverage: vi.fn(async () => ({ covered: 0, total: 0 })),
}));
// Empty terrain project list -> the folder-permission terrain section is omitted,
// keeping this test focused on the roles donut.
// loadFolderPermissionTerrain is NOT imported or called by page.tsx (terrain is now
// lazy via TerrainReveal — expands on click, not pre-loaded at mount).
vi.mock("@/lib/server/folderPermissionTerrainView", () => ({
  loadTerrainProjects: vi.fn(async () => []),
  loadFolderPermissionTerrain: vi.fn(async () => null),
}));
// Phase 20 loaders (plan 20-05 wiring) — mocked so this route test doesn't hit
// the real Prisma db (it only mocks loader modules, never @/server/db directly).
vi.mock("@/lib/server/permissionFootprintView", () => ({
  loadPermissionFootprint: vi.fn(async () => []),
}));
vi.mock("@/lib/server/signInRecencyView", () => ({
  loadSignInRecency: vi.fn(async () => []),
}));
vi.mock("@/lib/server/ingestFreshnessView", () => ({
  loadIngestFreshness: vi.fn(async () => null),
}));
// Server actions ("use server") — mocked so the route test doesn't pull auth/db wiring.
vi.mock("./coordinationActions", () => ({
  loadProjectClashes: vi.fn(async () => []),
}));
vi.mock("./folderTerrainActions", () => ({
  loadTerrainForProject: vi.fn(async () => null),
  loadOverviewTerrain: vi.fn(async () => null),
}));
vi.mock("./folderActivityActions", () => ({
  loadFolderActivityProjectsAction: vi.fn(async () => []),
  loadFolderActivityTreeAction: vi.fn(async () => []),
}));
/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    const titles = Array.isArray(props.option.title) ? props.option.title : [props.option.title];
    const subtexts = titles.map((t: any) => t?.subtext).filter(Boolean).join(" | ");
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={series.map((d: any) => d.name).join("|")}
        data-subtexts={subtexts}
      />
    );
  },
}));

// Import MainCharts directly from mainCharts.tsx (not from page.tsx) so Suspense
// tiers don't prevent async resolution. The route shell (page.tsx) wraps MainCharts
// in <Suspense> — jsdom/RTL don't resolve async RSC children automatically, so we
// bypass the boundary here and await MainCharts directly.
import { MainCharts } from "./mainCharts";
import { loadFolderPermissionTerrain } from "@/lib/server/folderPermissionTerrainView";

describe("AccessAnalysisRoute (roles donut)", () => {
  it("buckets single role, Multiple roles, and Unknown, and reports the role count", async () => {
    const ui = await MainCharts();
    const { getAllByTestId, getByText } = render(ui);
    // Two donuts now render an echart (roles + companies). Pick the roles donut
    // by its subtext, which names "roles" ("N roles · M user–project memberships").
    const el = getAllByTestId("echart").find((c) =>
      (c.getAttribute("data-subtexts") ?? "").includes("roles"),
    )!;
    expect(el).toBeTruthy();
    expect(el.getAttribute("data-slices")).toBe("3");
    const names = el.getAttribute("data-names")!.split("|");
    expect(names).toContain("Member");
    expect(names).toContain("Multiple roles");
    expect(names).toContain("Unknown");
    // Distinct roles seen anywhere = Admin, Member = 2.
    expect(el.getAttribute("data-subtexts")).toContain("2 roles");
    // The modules section is wired in below the roles donut.
    expect(getByText(/Activity by module/)).toBeTruthy();
  });

  it("does NOT call loadFolderPermissionTerrain during initial render (terrain is lazy)", async () => {
    // Terrain pre-load was the expensive sequential blocking await removed in 05-04.
    // It must not be called at page load — only on TerrainReveal expand.
    await MainCharts();
    expect(loadFolderPermissionTerrain).not.toHaveBeenCalled();
  });
});
