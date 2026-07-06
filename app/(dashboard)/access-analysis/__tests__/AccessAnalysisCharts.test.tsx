// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return <div data-testid="echart" data-names={series.map((d: any) => d.name).join("|")} />;
  },
}));

// UsersTabPanel's activity-recency detail table (20.1-06) uses the shared
// DataTable (@tanstack/react-virtual). jsdom has no scroll geometry so the
// real virtualizer returns 0 items by default — mock it to render every row,
// same pattern as components/ui/__tests__/DataTable.test.tsx and
// template-mty/__tests__/TemplateMembersTable.test.tsx.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (opts: { count: number }) => {
    const count = opts.count ?? 0;
    const items = Array.from({ length: count }, (_, i) => ({
      key: i,
      index: i,
      start: i * 72,
      end: (i + 1) * 72,
      lane: 0,
      size: 72,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * 72,
      measureElement: vi.fn(),
      options: { scrollMargin: 0 },
    };
  },
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

beforeAll(() => {
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
  if (typeof window !== "undefined" && !window.scrollTo) {
    window.scrollTo = vi.fn() as typeof window.scrollTo;
  }
});

import { AccessAnalysisCharts } from "../components/AccessAnalysisCharts";
import type { ProjectRoleRow } from "../projectFilter";
import type { ModuleActivityRow } from "../moduleCounts";
import type { ActivityRecencyRow } from "@/lib/server/activityRecencyView";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";
import type { FolderActivityActorRow } from "@/lib/server/folderActivityByCompanyView";
import type { CoordinationByProjectData } from "@/lib/server/coordinationByProjectView";
import type { TerrainProjectOption, FolderTerrainData } from "../folderTerrain";

// 20.1-05: /access-analysis is now a 6-tab shell (Overview · Roles · Users ·
// Companies · Projects · Compare) — Radix `TabsContent` unmounts INACTIVE tabs
// by default, so any assertion about content living in a non-default tab must
// first activate that tab. `@testing-library/user-event` is not an installed
// dependency in this repo (no-new-npm-deps constraint) — every existing test
// in this suite already uses `fireEvent`. Radix `Tabs.Trigger` activates on
// `onMouseDown` (not `onClick` — verified against
// node_modules/@radix-ui/react-tabs/dist/index.mjs), so activation here uses
// `fireEvent.mouseDown(..., { button: 0 })` rather than `fireEvent.click`.
function openTab(getByRole: (role: string, opts?: { name: RegExp }) => HTMLElement, name: RegExp) {
  fireEvent.mouseDown(getByRole("tab", { name }), { button: 0 });
}

const roleRows: ProjectRoleRow[] = [
  { projectId: "p1", projectName: "Tower A", roles: ["Member"] },
  { projectId: "p2", projectName: "Tower B", roles: ["Designer"] },
];
// view-entity -> Data Management, issue-create -> Build.
const moduleRows: ModuleActivityRow[] = [
  { projectId: "p1", projectName: "Tower A", rawAction: "view-entity", count: 100 },
  { projectId: "p2", projectName: "Tower B", rawAction: "issue-create", count: 40 },
];

describe("AccessAnalysisCharts (one picker, both donuts)", () => {
  it("renders exactly one project search bar", () => {
    const { getAllByTestId } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    // Project Picker is pinned ABOVE the tab strip — visible regardless of active tab.
    expect(getAllByTestId("project-search")).toHaveLength(1);
  });

  it("shows both donuts driven by the shared selection", () => {
    const { getByTestId, getByRole } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    // Role distribution lives on the Roles tab.
    openTab(getByRole, /roles/i);
    expect(getByTestId("role-legend").textContent).toContain("Member");
    expect(getByTestId("role-legend").textContent).toContain("Designer");
    // Activity by module lives on the Overview tab (the default).
    openTab(getByRole, /^overview$/i);
    expect(getByTestId("module-legend").textContent).toContain("Data Management");
    expect(getByTestId("module-legend").textContent).toContain("Build");
  });

  it("renders a Users-by-company donut driven by the shared selection", () => {
    const { getByTestId, getByRole } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    openTab(getByRole, /companies/i);
    // The test roleRows carry no company, so every membership lands in Unknown company.
    expect(getByTestId("company-legend").textContent).toContain("Unknown company");
  });

  it("offers one checkbox per project (union of both sources), all checked", () => {
    const { getByTestId, getAllByRole } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    fireEvent.focus(getByTestId("project-search"));
    const boxes = getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("unticking ONE project re-buckets BOTH donuts at once", () => {
    const { getByTestId, getByRole } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // p2: Designer role + Build activity
    openTab(getByRole, /roles/i);
    expect(getByTestId("role-legend").textContent).not.toContain("Designer");
    expect(getByTestId("role-legend").textContent).toContain("Member");
    openTab(getByRole, /^overview$/i);
    expect(getByTestId("module-legend").textContent).not.toContain("Build");
    // Tower A's contributions remain in both.
    expect(getByTestId("module-legend").textContent).toContain("Data Management");
  });

  it("Clear empties both donuts together", () => {
    const { getByTestId, getByRole, getByText } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("button", { name: /clear/i }));
    openTab(getByRole, /roles/i);
    expect(getByText(/no role assignments/i)).toBeTruthy();
    openTab(getByRole, /^overview$/i);
    expect(getByText(/no activity found/i)).toBeTruthy();
  });
});

const activityActorRows = [
  { projectId: "p1", projectName: "Tower A", userEmail: "ana@x.com", userName: "Ana", count: 100 },
  { projectId: "p2", projectName: "Tower B", userEmail: "bob@x.com", userName: "Bob", count: 40 },
];
const membershipRows = [
  { projectId: "p1", email: "ana@x.com", roles: ["Member"] },
  { projectId: "p2", email: "bob@x.com", roles: ["Designer"] },
];

describe("AccessAnalysisCharts — Activity by role donut", () => {
  it("renders the activity-by-role donut only when actor rows are supplied", () => {
    const { queryByTestId, rerender, getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /roles/i);
    expect(queryByTestId("activity-role-legend")).toBeNull();
    rerender(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    // Same Tabs instance — Roles stays the active tab across rerender.
    expect(getByTestId("activity-role-legend")).toBeTruthy();
  });

  it("sizes role slices by activity and re-buckets when a project is unticked", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    openTab(getByRole, /roles/i);
    const legend = getByTestId("activity-role-legend");
    expect(legend.textContent).toContain("Member");
    expect(legend.textContent).toContain("Designer");
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // drops Bob's Designer activity
    expect(getByTestId("activity-role-legend").textContent).not.toContain("Designer");
    expect(getByTestId("activity-role-legend").textContent).toContain("Member");
  });

  it("drills into the people behind a role", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    openTab(getByRole, /roles/i);
    fireEvent.click(within(getByTestId("activity-role-legend")).getByRole("button", { name: /Member/ }));
    expect(getByTestId("activity-role-drilldown").textContent).toContain("Ana");
  });

  it("renders the Activity-by-company donut and drills into its people", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    // Activity by company lives on the Companies tab.
    openTab(getByRole, /companies/i);
    const legend = getByTestId("activity-company-legend");
    // membershipRows carry no company → Unknown company holds all the activity.
    expect(legend.textContent).toContain("Unknown company");
    fireEvent.click(within(legend).getByRole("button", { name: /Unknown company/ }));
    expect(getByTestId("activity-company-drilldown").textContent).toContain("Ana");
  });
});

// Enriched rows (with email+name) for INT-04/INT-02 tests.
const roleRowsRich: ProjectRoleRow[] = [
  { projectId: "p1", projectName: "Tower A", roles: ["Member"], email: "ana@x.com", name: "Ana" },
  { projectId: "p2", projectName: "Tower B", roles: ["Designer"], email: "bob@x.com", name: "Bob" },
];

describe("AccessAnalysisCharts — INT-04 slice cross-filter", () => {
  it("shows the idle tip when nothing is filtered", () => {
    const { getByTestId, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    // Idle tip / FilterBanner are pinned above the tab strip.
    expect(getByTestId("filter-idle-tip").textContent).toContain("click any chart slice");
    expect(queryByTestId("filter-banner")).toBeFalsy();
  });

  it("swaps the idle tip for the FilterBanner with N-of-M scope on slice click", () => {
    const { getByTestId, queryByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /roles/i);
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }));
    expect(queryByTestId("filter-idle-tip")).toBeFalsy();
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    expect(getByTestId("filter-scope").textContent).toMatch(/Showing \d+ of \d+ projects/);
  });

  it("clicking a legend role button sets a pill and rebuckets the company donut", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    // Click "Member" in the role-legend (Roles tab) to set the cross-filter
    openTab(getByRole, /roles/i);
    fireEvent.click(
      within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }),
    );
    // A filter-banner should appear with a "Member" pill (pinned above the tabs)
    const pillBar = getByTestId("filter-banner");
    expect(pillBar.textContent).toContain("Member");
    // Company legend (Companies tab) should now only show companies of Member-holding people
    // (roleRowsRich has no company → falls to Unknown company; both rows carry
    //  different roles, so after filtering only the Member row remains)
    openTab(getByRole, /companies/i);
    const companyLegend = getByTestId("company-legend");
    expect(companyLegend.textContent).toContain("Unknown company");
    // Role legend still shows Member after the filter (sliceFilters survive tab switches).
    openTab(getByRole, /roles/i);
    const roleLegend = getByTestId("role-legend");
    expect(roleLegend.textContent).toContain("Member");
    expect(roleLegend.textContent).not.toContain("Designer");
  });

  it("clicking the same role button again removes the pill (toggle off)", () => {
    const { getByTestId, queryByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /roles/i);
    const memberBtn = within(getByTestId("role-legend")).getByRole("button", { name: /Member/ });
    fireEvent.click(memberBtn);
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    // Second click on legend — toggleDrill closes drill AND toggleSliceFilter removes the filter
    fireEvent.click(memberBtn);
    // After toggle-off the filter-banner should be gone (empty → renders null)
    expect(queryByTestId("filter-banner")).toBeFalsy();
  });

  it("Clear filters on FilterBanner removes slice pills but leaves Project Picker untouched", () => {
    const { getByTestId, getByRole, queryByTestId, getAllByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    // Set a role slice filter (Roles tab)
    openTab(getByRole, /roles/i);
    fireEvent.click(
      within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }),
    );
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    // Click "Clear filters" on the FilterBanner (pinned above the tabs)
    fireEvent.click(getByRole("button", { name: /clear filters/i }));
    expect(queryByTestId("filter-banner")).toBeFalsy();
    // Project Picker checkboxes are still all checked (selected is unchanged)
    fireEvent.focus(getByTestId("project-search"));
    const boxes = getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it("AND-stack: role + company filters both show as pills", () => {
    const rowsWithCompany: ProjectRoleRow[] = [
      { projectId: "p1", projectName: "Tower A", roles: ["Member"], company: "LECG", email: "ana@x.com", name: "Ana" },
      { projectId: "p2", projectName: "Tower B", roles: ["Designer"], company: "Acme", email: "bob@x.com", name: "Bob" },
    ];
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={rowsWithCompany} moduleRows={moduleRows} />,
    );
    // Set role filter (Roles tab)
    openTab(getByRole, /roles/i);
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }));
    // Set company filter (Companies tab) — after role filter only LECG row remains; click LECG in company legend
    openTab(getByRole, /companies/i);
    fireEvent.click(within(getByTestId("company-legend")).getByRole("button", { name: /LECG/ }));
    const pillBar = getByTestId("filter-banner");
    expect(pillBar.textContent).toContain("Role");
    expect(pillBar.textContent).toContain("Member");
    expect(pillBar.textContent).toContain("Company");
    expect(pillBar.textContent).toContain("LECG");
  });
});

describe("AccessAnalysisCharts — INT-02 View N people", () => {
  it("renders the View people control as a distinct icon button", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /roles/i);
    const btn = getByTestId("view-people-role");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.querySelector("svg")).toBeTruthy(); // people icon present
    expect(btn.textContent).toContain("View");
  });

  it("'View N people' button opens the people sheet", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    // Click the "View N people" affordance on the role distribution section (Roles tab)
    openTab(getByRole, /roles/i);
    fireEvent.click(getByTestId("view-people-role"));
    // people-sheet content should be rendered (shell-level, below the Tabs root)
    const sheet = getByTestId("people-sheet");
    expect(sheet.textContent).toContain("Ana");
  });

  it("clicking a slice alone does NOT open the people sheet", () => {
    const { getByTestId, queryByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /roles/i);
    // Click a legend item (fires toggleDrill + toggleSliceFilter; must NOT open people-sheet)
    fireEvent.click(
      within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }),
    );
    // Filter banner appeared — cross-filter fired
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    // But people-sheet must NOT be open
    expect(queryByTestId("people-sheet")).toBeFalsy();
  });
});

describe("AccessAnalysisCharts — 'No activity' footers (replaces the Dormant panel)", () => {
  it("no longer renders the standalone dormant panel", () => {
    const { queryByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    expect(queryByTestId("dormant-panel")).toBeNull();
  });

  it("lists roles with members but no activity under the Activity-by-role donut", () => {
    // "Ghost" role has a member (Zoe) on p3, but only Ana (Member) recorded activity.
    const rRows = [
      { projectId: "p1", projectName: "Tower A", roles: ["Member"], name: "Ana", email: "ana@x.com" },
      { projectId: "p3", projectName: "Tower C", roles: ["Ghost"], name: "Zoe", email: "zoe@x.com" },
    ];
    const aRows = [{ projectId: "p1", projectName: "Tower A", userEmail: "ana@x.com", userName: "Ana", count: 100 }];
    const mRows = [
      { projectId: "p1", email: "ana@x.com", roles: ["Member"] },
      { projectId: "p3", email: "zoe@x.com", roles: ["Ghost"] },
    ];
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={rRows} moduleRows={moduleRows} activityActorRows={aRows} membershipRows={mRows} />,
    );
    openTab(getByRole, /roles/i);
    const footer = getByTestId("no-activity-roles");
    expect(footer.textContent).toContain("No activity");
    expect(footer.textContent).toContain("Ghost");
  });
});

// Phase 20 panels (20-05 mount): IssueFetchCoverageDonut, IngestFreshnessPanel —
// each behind an optional prop, relocated into Projects/Overview tabs by 20.1-05.
// The Roles-tab byte-footprint panel and Users-tab sign-in-recency panel were
// replaced by the PERM-01/ENG-01 panel-semantic pivots below (20.1-06).
const permissionLevelRows: PermissionLevelRow[] = [
  { projectId: "p1", projectName: "Tower A", roleId: "r1", roleName: "Project Admin", permType: "Full Controller", folderCount: 10 },
  { projectId: "p2", projectName: "Tower B", roleId: "r2", roleName: "Viewer", permType: "View Only", folderCount: 2 },
];
const activityRecencyRows: ActivityRecencyRow[] = [
  { projectId: "p1", email: "ana@x.com", name: "Ana", company: "LECG", roles: ["Member"], lastActivityAt: null },
  { projectId: "p2", email: "bob@x.com", name: "Bob", company: "Acme", roles: ["Designer"], lastActivityAt: "2026-01-01T00:00:00.000Z" },
];
const folderScopedActivityRows: FolderActivityActorRow[] = [
  { projectId: "p1", userEmail: "ana@x.com", userName: "Ana", count: 5 },
];
const coordinationDataWithCoverage: CoordinationByProjectData = {
  rows: [],
  accessibleProjects: 1,
  forbiddenProjects: 0,
  latestRunAt: "2026-07-01T00:00:00.000Z",
  coordinationCount: 0,
  issueCoverage: {
    runStatus: "done",
    runStartedAt: "2026-07-01T00:00:00.000Z",
    runFinishedAt: "2026-07-01T00:05:00.000Z",
    projects: [{ projectId: "p1", projectName: "Tower A", status: "ok", issueCount: 3 }],
  },
};

describe("AccessAnalysisCharts — Phase 20 panels (ISSUE-01/PIPE-01)", () => {
  it("hides the panels gated by a missing lazy-loader prop (no crash, no new sections)", async () => {
    const { queryByText, findByText, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /users/i);
    expect(queryByText("Activity recency detail")).toBeNull();
    openTab(getByRole, /roles/i);
    expect(queryByText("Permission volume by level")).toBeNull();
    expect(queryByText("Activity recency by role")).toBeNull();
    openTab(getByRole, /companies/i);
    expect(queryByText("Folder activity by company")).toBeNull();
    openTab(getByRole, /projects/i);
    expect(queryByText("Issue data coverage")).toBeNull();
    expect(queryByText("Issues over time")).toBeNull();
    expect(queryByText("Issues by status")).toBeNull();
    openTab(getByRole, /^overview$/i);
    expect(queryByText(/No Data Connector ingest runs recorded/)).toBeNull();
    // Confirms the "no crash" assertion isn't racing an unresolved effect.
    await findByText("Activity by module");
  });

  it("mounts Issue data coverage above Model Coordination on the Projects tab when coordinationData.issueCoverage is present", () => {
    const { getByText, getByTestId, getByRole } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        coordinationData={coordinationDataWithCoverage}
      />,
    );
    openTab(getByRole, /projects/i);
    expect(getByText("Issue data coverage")).toBeTruthy();
    expect(getByTestId("issue-coverage-legend")).toBeTruthy();
  });

  it("mounts the muted ingest-freshness strip on the Overview tab when ingestFreshness is supplied", () => {
    const { getByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        ingestFreshness={{
          id: "run1",
          startedAt: "2026-07-01T00:00:00.000Z",
          endedAt: "2026-07-01T00:10:00.000Z",
          status: "success",
          projectsProcessed: 550,
          activityRowCount: 1086,
        }}
      />,
    );
    // Overview is the default tab — no click needed.
    expect(getByText(/Account-wide/)).toBeTruthy();
  });
});

// Phase 21 (ISSUE-02/03): Issues over time + Issues by status, mounted on the
// Projects tab directly below Issue data coverage, riding the same lazy
// fetch-once-per-tab-activation ref-flag pattern as the 20.1-06 panels.
describe("AccessAnalysisCharts — Phase 21 issue-funnel panels (ISSUE-02/03)", () => {
  it("hides both issue-funnel panels when loadIssueFunnel is not supplied", () => {
    const { queryByText, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /projects/i);
    expect(queryByText("Issues over time")).toBeNull();
    expect(queryByText("Issues by status")).toBeNull();
  });

  it("does not call loadIssueFunnel on initial (Overview) render", () => {
    const loadIssueFunnel = vi.fn(async () => ({ monthRows: [], statusRows: [] }));
    render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} loadIssueFunnel={loadIssueFunnel} />,
    );
    expect(loadIssueFunnel).not.toHaveBeenCalled();
  });

  it("fetches the issue funnel exactly once on first Projects-tab activation, and caches on revisit", async () => {
    const loadIssueFunnel = vi.fn(async () => ({ monthRows: [], statusRows: [] }));
    const { getByRole, findByText } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} loadIssueFunnel={loadIssueFunnel} />,
    );
    openTab(getByRole, /projects/i);
    await findByText("Issues over time");
    await findByText("Issues by status");
    expect(loadIssueFunnel).toHaveBeenCalledTimes(1);

    // Revisit: Overview then back to Projects — cached, no refetch.
    openTab(getByRole, /^overview$/i);
    openTab(getByRole, /projects/i);
    expect(loadIssueFunnel).toHaveBeenCalledTimes(1);
  });
});

// 20.1-06: PERM-01 reframe (Permission volume by level) + ENG-01 pivot (Activity
// recency by role + the Users-tab detail table) + UAT-6 (Folder activity by
// company) — all three ride lazy per-tab `load*` function props (fetched by the
// shell on first Roles/Users/Companies tab activation), NOT eager data props.
describe("AccessAnalysisCharts — 20.1-06 panel-semantic swaps (PERM-01/ENG-01/UAT-6)", () => {
  it("mounts Permission volume by level and Activity recency by role after the donut grid when their loaders are supplied", async () => {
    const loadPermissionLevel = vi.fn(async (): Promise<PermissionLevelRow[]> => permissionLevelRows);
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const { getByRole, findByText, getAllByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadPermissionLevel={loadPermissionLevel}
        loadActivityRecency={loadActivityRecency}
      />,
    );
    openTab(getByRole, /roles/i);
    await findByText("Permission volume by level");
    expect(await findByText("Activity recency by role")).toBeTruthy();
    // Both charts rendered (not their empty state) — 2 non-empty EChart nodes.
    expect(getAllByTestId("echart").length).toBeGreaterThanOrEqual(2);
  });

  it("mounts the per-membership activity-recency detail table on the Users tab when its loader is supplied", async () => {
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const { getByRole, findByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadActivityRecency={loadActivityRecency}
      />,
    );
    openTab(getByRole, /users/i);
    await findByText("Activity recency detail");
    expect(await findByText("Ana")).toBeTruthy();
    expect(await findByText("Bob")).toBeTruthy();
  });

  it("mounts Folder activity by company after the two existing company donuts when its loaders are supplied", async () => {
    const loadFolderScopedActivity = vi.fn(async (): Promise<FolderActivityActorRow[]> => folderScopedActivityRows);
    const loadCompanyFolderBreakdown = vi.fn(async () => []);
    const { getByRole, findByText, getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadFolderScopedActivity={loadFolderScopedActivity}
        loadCompanyFolderBreakdown={loadCompanyFolderBreakdown}
      />,
    );
    openTab(getByRole, /companies/i);
    await findByText("Folder activity by company");
    // No membershipRows supplied → every activity row falls into Unknown company (honest, not dropped).
    expect(getByTestId("folder-activity-by-company-legend").textContent).toContain("Unknown company");
  });

  it("filters Activity recency by role by the project picker selection", async () => {
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const { getByTestId, getByRole, findByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadActivityRecency={loadActivityRecency}
      />,
    );
    openTab(getByRole, /roles/i);
    const headline = await findByTestId("activity-recency-headline");
    expect(headline.textContent).toContain("2");
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // untick p2 (Bob's only project)
    expect(getByTestId("activity-recency-headline").textContent).toContain("1");
  });

  it("does not call any of the three lazy loaders on initial (Overview) render", () => {
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const loadPermissionLevel = vi.fn(async (): Promise<PermissionLevelRow[]> => permissionLevelRows);
    const loadFolderScopedActivity = vi.fn(async (): Promise<FolderActivityActorRow[]> => folderScopedActivityRows);
    const loadCompanyFolderBreakdown = vi.fn(async () => []);
    render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadActivityRecency={loadActivityRecency}
        loadPermissionLevel={loadPermissionLevel}
        loadFolderScopedActivity={loadFolderScopedActivity}
        loadCompanyFolderBreakdown={loadCompanyFolderBreakdown}
      />,
    );
    expect(loadActivityRecency).not.toHaveBeenCalled();
    expect(loadPermissionLevel).not.toHaveBeenCalled();
    expect(loadFolderScopedActivity).not.toHaveBeenCalled();
  });

  it("fetches activity-recency + permission-level exactly once on first Roles-tab activation, and caches on revisit", async () => {
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const loadPermissionLevel = vi.fn(async (): Promise<PermissionLevelRow[]> => permissionLevelRows);
    const { getByRole, findByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadActivityRecency={loadActivityRecency}
        loadPermissionLevel={loadPermissionLevel}
      />,
    );
    openTab(getByRole, /roles/i);
    await findByText("Permission volume by level");
    await findByText("Activity recency by role");
    expect(loadActivityRecency).toHaveBeenCalledTimes(1);
    expect(loadPermissionLevel).toHaveBeenCalledTimes(1);

    // Revisit: Overview then back to Roles — cached, no refetch.
    openTab(getByRole, /^overview$/i);
    openTab(getByRole, /roles/i);
    expect(loadActivityRecency).toHaveBeenCalledTimes(1);
    expect(loadPermissionLevel).toHaveBeenCalledTimes(1);
  });

  it("shares the activity-recency fetch across the Roles and Users tabs (fetched once, visible on both)", async () => {
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const { getByRole, findByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadActivityRecency={loadActivityRecency}
      />,
    );
    openTab(getByRole, /users/i);
    await findByText("Activity recency detail");
    expect(loadActivityRecency).toHaveBeenCalledTimes(1);

    // Roles tab reads the SAME cached rows — no second fetch.
    openTab(getByRole, /roles/i);
    await findByText("Activity recency by role");
    expect(loadActivityRecency).toHaveBeenCalledTimes(1);
  });

  it("fetches folder-scoped activity exactly once on first Companies-tab activation, and caches on revisit", async () => {
    const loadFolderScopedActivity = vi.fn(async (): Promise<FolderActivityActorRow[]> => folderScopedActivityRows);
    const loadCompanyFolderBreakdown = vi.fn(async () => []);
    const { getByRole, findByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        loadFolderScopedActivity={loadFolderScopedActivity}
        loadCompanyFolderBreakdown={loadCompanyFolderBreakdown}
      />,
    );
    openTab(getByRole, /companies/i);
    await findByText("Folder activity by company");
    expect(loadFolderScopedActivity).toHaveBeenCalledTimes(1);

    openTab(getByRole, /^overview$/i);
    openTab(getByRole, /companies/i);
    expect(loadFolderScopedActivity).toHaveBeenCalledTimes(1);
  });
});

// 20.1-05: tab-IA structural cases (new this plan).
describe("AccessAnalysisCharts — 6-tab IA (20.1-05)", () => {
  it("defaults to the Overview tab: Activity over time is visible without clicks; Role distribution is not in the DOM", () => {
    const { getByText, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} timelineRows={[]} />,
    );
    expect(getByText("Activity over time")).toBeTruthy();
    // Roles tab content is unmounted (Radix TabsContent, no forceMount) until activated.
    expect(queryByTestId("role-legend")).toBeNull();
  });

  it("renders all 6 tab triggers in the locked order", () => {
    const { getAllByRole } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    const names = getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["Overview", "Roles", "Users", "Companies", "Projects", "Compare"]);
  });

  it("selection survives tab switches (picker state + a selection-derived KPI unchanged)", () => {
    // "Projects" KPI value tile is the value div immediately preceding the
    // "Projects" label div INSIDE the StatStrip grid (stat-tile.tsx renders
    // value then label as adjacent siblings). Scoped to `.grid.gap-3` (the
    // StatStrip's own wrapper) so this doesn't collide with the "Projects"
    // TabsTrigger, which also matches a plain `getByText("Projects")`.
    const projectsKpiValue = (container: HTMLElement) => {
      const strip = container.querySelector(".grid.gap-3")!;
      const label = within(strip as HTMLElement).getByText("Projects");
      return label.previousElementSibling?.textContent;
    };

    const { container, getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />,
    );
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // untick p2
    expect(projectsKpiValue(container)).toBe("1");
    openTab(getByRole, /roles/i);
    openTab(getByRole, /^overview$/i);
    // Picker + KPI unchanged after round-tripping through a tab switch.
    fireEvent.focus(getByTestId("project-search"));
    const boxes = getByRole("checkbox", { name: /tower b/i }) as HTMLInputElement;
    expect(boxes.checked).toBe(false);
    expect(projectsKpiValue(container)).toBe("1");
  });

  it("sliceFilters survive tab switches: FilterBanner set on Roles stays visible on Companies", () => {
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    openTab(getByRole, /roles/i);
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }));
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    openTab(getByRole, /companies/i);
    // FilterBanner lives above the tabs, not inside any TabsContent.
    expect(getByTestId("filter-banner").textContent).toContain("Member");
  });

  it("Compare tab mounts the terrain without its own project pickers (single global search bar)", () => {
    const terrainProjects: TerrainProjectOption[] = [
      { id: "p1", name: "Tower A", office: "MTY", folderCount: 2, permCount: 3, userRoleCount: 3 },
      { id: "p2", name: "Tower B", office: "MTY", folderCount: 2, permCount: 1, userRoleCount: 2 },
    ];
    const loadTerrain = vi.fn(async (): Promise<FolderTerrainData | null> => null);
    const loadOverview = vi.fn(async (): Promise<FolderTerrainData | null> => null);
    const { container, getByRole, queryByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        terrainProjects={terrainProjects}
        loadTerrain={loadTerrain}
        loadOverview={loadOverview}
      />,
    );
    // Exactly one project search bar exists on the whole page (the global picker above the tabs).
    expect(container.querySelectorAll('[data-testid="project-search"]')).toHaveLength(1);
    openTab(getByRole, /compare/i);
    // FolderPermissionTerrain renders with hidePickers -> no <select> (ProjectSelect)
    // and no ProjectMultiSelect trigger button ("Pick projects to compare…").
    expect(container.querySelector("select")).toBeNull();
    expect(queryByText(/Pick projects to compare/i)).toBeNull();
  });

  it("panel-inventory guard: every one of the 16 panels (post-21-04) is reachable inside its assigned tab", async () => {
    const terrainProjects: TerrainProjectOption[] = [
      { id: "p1", name: "Tower A", office: "MTY", folderCount: 2, permCount: 3, userRoleCount: 3 },
    ];
    const loadTerrain = vi.fn(async (): Promise<FolderTerrainData | null> => null);
    const loadOverview = vi.fn(async (): Promise<FolderTerrainData | null> => null);
    const loadActivityRecency = vi.fn(async (): Promise<ActivityRecencyRow[]> => activityRecencyRows);
    const loadPermissionLevel = vi.fn(async (): Promise<PermissionLevelRow[]> => permissionLevelRows);
    const loadFolderScopedActivity = vi.fn(async (): Promise<FolderActivityActorRow[]> => folderScopedActivityRows);
    const loadCompanyFolderBreakdown = vi.fn(async () => []);
    const loadIssueFunnel = vi.fn(async () => ({ monthRows: [], statusRows: [] }));
    const { getByText, getByRole, findByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        timelineRows={[]}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
        loadActivityRecency={loadActivityRecency}
        loadPermissionLevel={loadPermissionLevel}
        loadFolderScopedActivity={loadFolderScopedActivity}
        loadCompanyFolderBreakdown={loadCompanyFolderBreakdown}
        loadIssueFunnel={loadIssueFunnel}
        coordinationData={coordinationDataWithCoverage}
        ingestFreshness={{
          id: "run1",
          startedAt: "2026-07-01T00:00:00.000Z",
          endedAt: "2026-07-01T00:10:00.000Z",
          status: "success",
          projectsProcessed: 550,
          activityRowCount: 1086,
        }}
        terrainProjects={terrainProjects}
        loadTerrain={loadTerrain}
        loadOverview={loadOverview}
      />,
    );

    // Overview: Activity over time, Activity by module, Ingest freshness.
    openTab(getByRole, /^overview$/i);
    expect(getByText("Activity over time")).toBeTruthy();
    expect(getByText("Activity by module")).toBeTruthy();
    expect(getByText(/Account-wide/)).toBeTruthy();

    // Roles: Role distribution, Activity by role, Permission volume by level
    // (PERM-01), Activity recency by role (ENG-01).
    openTab(getByRole, /roles/i);
    expect(getByText("Role distribution")).toBeTruthy();
    expect(getByText("Activity by role")).toBeTruthy();
    await findByText("Permission volume by level");
    expect(getByText("Activity recency by role")).toBeTruthy();

    // Users: Activity recency detail (ENG-01 user-level cut).
    openTab(getByRole, /users/i);
    await findByText("Activity recency detail");

    // Companies: Users by company, Activity by company, Folder activity by company (UAT-6).
    openTab(getByRole, /companies/i);
    expect(getByText("Users by company")).toBeTruthy();
    expect(getByText("Activity by company")).toBeTruthy();
    await findByText("Folder activity by company");

    // Projects: Issue data coverage, Issues over time, Issues by status (ISSUE-02/03), Model Coordination.
    openTab(getByRole, /projects/i);
    expect(getByText("Issue data coverage")).toBeTruthy();
    await findByText("Issues over time");
    await findByText("Issues by status");
    expect(getByText("Model Coordination")).toBeTruthy();

    // Compare: the folder permission terrain.
    openTab(getByRole, /compare/i);
    expect(getByText("Folder permission terrain")).toBeTruthy();
  });
});
