// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    return (
      <div
        data-testid="echart"
        data-slices={series.length}
        data-names={series.map((d: any) => d.name).join("|")}
      />
    );
  },
}));

import { ProjectActivityDonut } from "../components/ProjectActivityDonut";
import { summarizeProjectActivity } from "../projectActivityCounts";
import type { ModuleActivityRow } from "@/lib/acc/moduleCountsTypes";

const mk = (projectId: string, rawAction: string, count: number): ModuleActivityRow => ({
  projectId,
  projectName: projectId === "" ? "Account-level" : `Project ${projectId}`,
  rawAction,
  count,
});

// 3 real projects (2 of them multi-action, for a module breakdown) + the
// synthetic Account-level bucket (must be excluded from the donut).
const rows: ModuleActivityRow[] = [
  mk("p1", "view-entity", 100),
  mk("p1", "issue-create", 40),
  mk("p2", "upload-entity", 50),
  mk("p3", "create-custom-attribute", 5),
  mk("", "admin-action", 12),
];

describe("ProjectActivityDonut", () => {
  it("renders an empty state when there is no project activity", () => {
    const summary = summarizeProjectActivity([]);
    const { queryByTestId, getByText } = render(<ProjectActivityDonut summary={summary} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no project activity for this selection/i)).toBeTruthy();
  });

  it("draws one slice per kept project plus the Other slice, and lists them in the legend", () => {
    const summary = summarizeProjectActivity(rows, 2); // p1, p2 kept; p3 -> Other
    const { getByTestId } = render(<ProjectActivityDonut summary={summary} />);
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("3"); // p1, p2, Other
    const legend = getByTestId("project-activity-legend");
    expect(legend.textContent).toContain("Project p1");
    expect(legend.textContent).toContain("Project p2");
    expect(legend.textContent).toContain("Other (1 project)");
    expect(legend.textContent).not.toContain("Project p3");
  });

  it("clicking a project slice drills into its module breakdown, and closes on a second click", () => {
    const summary = summarizeProjectActivity(rows, 2);
    const { getByTestId, queryByTestId } = render(<ProjectActivityDonut summary={summary} />);
    const legend = getByTestId("project-activity-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Project p1/ }));
    const drill = getByTestId("project-activity-drilldown");
    expect(drill.textContent).toContain("Data Management"); // view-entity
    expect(drill.textContent).toContain("Build"); // issue-create
    expect(drill.textContent).toContain("140"); // drillSummary.total

    fireEvent.click(within(legend).getByRole("button", { name: /Project p1/ }));
    expect(queryByTestId("project-activity-drilldown")).toBeNull();
  });

  it("clicking the Other slice is a no-op — it is not drillable", () => {
    const summary = summarizeProjectActivity(rows, 2); // p3 -> Other
    const { getByTestId, queryByTestId } = render(<ProjectActivityDonut summary={summary} />);
    const legend = getByTestId("project-activity-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Other \(1 project\)/ }));
    expect(queryByTestId("project-activity-drilldown")).toBeNull();
  });

  it("shows the live account-level exclusion figure and the top-N-of-M caption", () => {
    const summary = summarizeProjectActivity(rows, 2);
    const { getByText } = render(<ProjectActivityDonut summary={summary} />);
    expect(getByText(/account-level admin activity \(12 actions\) is excluded/i)).toBeTruthy();
    expect(getByText(/top 2 of 3 projects/i)).toBeTruthy();
  });

  it("omits the account-level caption and the top-N-of-M caption when neither applies", () => {
    const noAccountLevel: ModuleActivityRow[] = [mk("p1", "view-entity", 10), mk("p2", "view-entity", 5)];
    const summary = summarizeProjectActivity(noAccountLevel, 10); // both fit, no Other
    const { queryByText } = render(<ProjectActivityDonut summary={summary} />);
    expect(queryByText(/is excluded/i)).toBeNull();
    expect(queryByText(/of.*projects\./i)).toBeNull();
  });

  it("does not reference the cross-filter bus (onSliceClick/activeSlice) — local drill only", () => {
    const source = readFileSync(
      join(__dirname, "../components/ProjectActivityDonut.tsx"),
      "utf-8",
    );
    expect(source).not.toContain("onSliceClick");
    expect(source).not.toContain("activeSlice");
    expect(source).not.toContain("sliceFilters");
  });
});
