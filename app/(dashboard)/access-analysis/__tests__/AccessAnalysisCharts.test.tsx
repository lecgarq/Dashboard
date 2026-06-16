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
