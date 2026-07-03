// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return <div data-testid="echart" data-names={series.map((d: any) => d.name).join("|")} />;
  },
}));

import { AccessAnalysisCharts } from "../components/AccessAnalysisCharts";
import type { ProjectRoleRow } from "../projectFilter";
import type { ModuleActivityRow } from "../moduleCounts";
import type { PermissionFootprintRow } from "@/lib/server/permissionFootprintView";
import type { SignInRecencyRow } from "@/lib/server/signInRecencyView";
import type { CoordinationByProjectData } from "@/lib/server/coordinationByProjectView";

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
    expect(getAllByTestId("project-search")).toHaveLength(1);
  });

  it("shows both donuts driven by the shared selection", () => {
    const { getByTestId } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    expect(getByTestId("role-legend").textContent).toContain("Member");
    expect(getByTestId("role-legend").textContent).toContain("Designer");
    expect(getByTestId("module-legend").textContent).toContain("Data Management");
    expect(getByTestId("module-legend").textContent).toContain("Build");
  });

  it("renders a Users-by-company donut driven by the shared selection", () => {
    const { getByTestId } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
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
    expect(getByTestId("role-legend").textContent).not.toContain("Designer");
    expect(getByTestId("module-legend").textContent).not.toContain("Build");
    // Tower A's contributions remain in both.
    expect(getByTestId("role-legend").textContent).toContain("Member");
    expect(getByTestId("module-legend").textContent).toContain("Data Management");
  });

  it("Clear empties both donuts together", () => {
    const { getByTestId, getByRole, getByText } = render(<AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />);
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("button", { name: /clear/i }));
    expect(getByText(/no role assignments/i)).toBeTruthy();
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
    const { queryByTestId, rerender, getByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />,
    );
    expect(queryByTestId("activity-role-legend")).toBeNull();
    rerender(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
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
    const legend = getByTestId("activity-role-legend");
    expect(legend.textContent).toContain("Member");
    expect(legend.textContent).toContain("Designer");
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // drops Bob's Designer activity
    expect(getByTestId("activity-role-legend").textContent).not.toContain("Designer");
    expect(getByTestId("activity-role-legend").textContent).toContain("Member");
  });

  it("drills into the people behind a role", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
    fireEvent.click(within(getByTestId("activity-role-legend")).getByRole("button", { name: /Member/ }));
    expect(getByTestId("activity-role-drilldown").textContent).toContain("Ana");
  });

  it("renders the Activity-by-company donut and drills into its people", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        activityActorRows={activityActorRows}
        membershipRows={membershipRows}
      />,
    );
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
    expect(getByTestId("filter-idle-tip").textContent).toContain("click any chart slice");
    expect(queryByTestId("filter-banner")).toBeFalsy();
  });

  it("swaps the idle tip for the FilterBanner with N-of-M scope on slice click", () => {
    const { getByTestId, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }));
    expect(queryByTestId("filter-idle-tip")).toBeFalsy();
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    expect(getByTestId("filter-scope").textContent).toMatch(/Showing \d+ of \d+ projects/);
  });

  it("clicking a legend role button sets a pill and rebuckets the company donut", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    // Click "Member" in the role-legend to set the cross-filter
    fireEvent.click(
      within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }),
    );
    // A filter-banner should appear with a "Member" pill
    const pillBar = getByTestId("filter-banner");
    expect(pillBar.textContent).toContain("Member");
    // Company legend should now only show companies of Member-holding people
    // (roleRowsRich has no company → falls to Unknown company; both rows carry
    //  different roles, so after filtering only the Member row remains)
    const companyLegend = getByTestId("company-legend");
    expect(companyLegend.textContent).toContain("Unknown company");
    // Designer row should not contribute to company donut after filter
    // (only one entry per donut; we assert the pill filtered the data by checking
    //  the activity legend is absent for Designer at this point — roles legend still shows
    //  Member after filter because roleSummary now only sees Member rows)
    const roleLegend = getByTestId("role-legend");
    expect(roleLegend.textContent).toContain("Member");
    expect(roleLegend.textContent).not.toContain("Designer");
  });

  it("clicking the same role button again removes the pill (toggle off)", () => {
    const { getByTestId, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
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
    // Set a role slice filter
    fireEvent.click(
      within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }),
    );
    expect(getByTestId("filter-banner").textContent).toContain("Member");
    // Click "Clear filters" on the FilterBanner
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
    const { getByTestId } = render(
      <AccessAnalysisCharts roleRows={rowsWithCompany} moduleRows={moduleRows} />,
    );
    // Set role filter
    fireEvent.click(within(getByTestId("role-legend")).getByRole("button", { name: /Member/ }));
    // Set company filter — after role filter only LECG row remains; click LECG in company legend
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
    const { getByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    const btn = getByTestId("view-people-role");
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.querySelector("svg")).toBeTruthy(); // people icon present
    expect(btn.textContent).toContain("View");
  });

  it("'View N people' button opens the people sheet", () => {
    const { getByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
    // Click the "View N people" affordance on the role distribution section
    fireEvent.click(getByTestId("view-people-role"));
    // people-sheet content should be rendered
    const sheet = getByTestId("people-sheet");
    expect(sheet.textContent).toContain("Ana");
  });

  it("clicking a slice alone does NOT open the people sheet", () => {
    const { getByTestId, queryByTestId } = render(
      <AccessAnalysisCharts roleRows={roleRowsRich} moduleRows={moduleRows} />,
    );
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
    const { getByTestId } = render(
      <AccessAnalysisCharts roleRows={rRows} moduleRows={moduleRows} activityActorRows={aRows} membershipRows={mRows} />,
    );
    const footer = getByTestId("no-activity-roles");
    expect(footer.textContent).toContain("No activity");
    expect(footer.textContent).toContain("Ghost");
  });
});

// Phase 20 panels (20-05 mount): PermissionFootprintChart, DormantSignInChart,
// IssueFetchCoverageDonut, IngestFreshnessPanel — each behind an optional prop.
const permissionFootprintRows: PermissionFootprintRow[] = [
  { projectId: "p1", projectName: "Tower A", roleId: "r1", roleName: "Project Admin", folderCount: 10, totalBytes: 5_000_000 },
];
const signInRecencyRows: SignInRecencyRow[] = [
  { projectId: "p1", name: "Ana", company: "LECG", lastSignIn: null },
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

describe("AccessAnalysisCharts — Phase 20 panels (PERM-01/ENG-01/ISSUE-01/PIPE-01)", () => {
  it("hides all four new panels when their props are omitted (no crash, no new sections)", () => {
    const { queryByText } = render(
      <AccessAnalysisCharts roleRows={roleRows} moduleRows={moduleRows} />,
    );
    expect(queryByText("Dormant users")).toBeNull();
    expect(queryByText("Permission footprint by role")).toBeNull();
    expect(queryByText("Issue data coverage")).toBeNull();
    expect(queryByText(/No Data Connector ingest runs recorded/)).toBeNull();
  });

  it("mounts Permission footprint by role after Role distribution when rows are supplied", () => {
    const { getByText } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        permissionFootprintRows={permissionFootprintRows}
      />,
    );
    expect(getByText("Permission footprint by role")).toBeTruthy();
    expect(getByText("Project Admin")).toBeTruthy();
  });

  it("mounts Dormant users in the donut grid when sign-in recency rows are supplied", () => {
    const { getByText, getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        signInRecencyRows={signInRecencyRows}
      />,
    );
    expect(getByText("Dormant users")).toBeTruthy();
    expect(getByTestId("dormant-headline")).toBeTruthy();
  });

  it("mounts Issue data coverage above Model Coordination when coordinationData.issueCoverage is present", () => {
    const { getByText, getByTestId } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        coordinationData={coordinationDataWithCoverage}
      />,
    );
    expect(getByText("Issue data coverage")).toBeTruthy();
    expect(getByTestId("issue-coverage-legend")).toBeTruthy();
  });

  it("mounts the muted ingest-freshness strip at the bottom when ingestFreshness is supplied", () => {
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
    expect(getByText(/Account-wide/)).toBeTruthy();
  });

  it("filters the three project-keyed panels by the project picker selection", () => {
    const twoProjectPermissionRows: PermissionFootprintRow[] = [
      ...permissionFootprintRows,
      { projectId: "p2", projectName: "Tower B", roleId: "r2", roleName: "Viewer", folderCount: 2, totalBytes: 1_000 },
    ];
    const { getByTestId, getByRole } = render(
      <AccessAnalysisCharts
        roleRows={roleRows}
        moduleRows={moduleRows}
        permissionFootprintRows={twoProjectPermissionRows}
      />,
    );
    expect(getByTestId("permission-footprint-legend").textContent).toContain("Viewer");
    fireEvent.focus(getByTestId("project-search"));
    fireEvent.click(getByRole("checkbox", { name: /tower b/i })); // untick p2 (Viewer's only project)
    expect(getByTestId("permission-footprint-legend").textContent).not.toContain("Viewer");
    expect(getByTestId("permission-footprint-legend").textContent).toContain("Project Admin");
  });
});
