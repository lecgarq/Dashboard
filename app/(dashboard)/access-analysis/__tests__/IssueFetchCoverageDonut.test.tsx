// @vitest-environment jsdom
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

import { IssueFetchCoverageDonut } from "../components/IssueFetchCoverageDonut";
import type { IssueCoverageInputRow } from "../issueFetchCoverageCounts";

const rows: IssueCoverageInputRow[] = [
  { projectId: "p1", projectName: "MTY AE-01", status: "ok", issueCount: 12 },
  { projectId: "p2", projectName: "Clash-MC", status: "zero_issues", issueCount: 0 },
  { projectId: "p3", projectName: "Locked Site", status: "forbidden", issueCount: 0 },
  { projectId: "p4", projectName: "Broken Fetch", status: "error", issueCount: 0 },
];

describe("IssueFetchCoverageDonut", () => {
  it("shows an empty state when no issue fetch run has ever been recorded", () => {
    const { getByText, queryByTestId } = render(<IssueFetchCoverageDonut coverage={null} projects={[]} />);
    expect(getByText(/no issue fetch run recorded yet/i)).toBeTruthy();
    expect(queryByTestId("echart")).toBeNull();
  });

  it("shows an empty state when the current selection has no fetch results", () => {
    const { getByText, queryByTestId } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "done", runStartedAt: new Date().toISOString(), runFinishedAt: new Date().toISOString() }}
        projects={[]}
      />,
    );
    expect(getByText(/no fetch results for this selection/i)).toBeTruthy();
    expect(queryByTestId("echart")).toBeNull();
  });

  it("renders all 4 honest buckets in the legend, even when some are zero", () => {
    const { getByTestId } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "done", runStartedAt: new Date().toISOString(), runFinishedAt: new Date().toISOString() }}
        projects={rows}
      />,
    );
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
    const legend = getByTestId("issue-coverage-legend");
    expect(legend.textContent).toContain("Issues fetched");
    expect(legend.textContent).toContain("Zero issues");
    expect(legend.textContent).toContain("Forbidden");
    expect(legend.textContent).toContain("Error");
  });

  it("opens a project drill-down when clicking the ok bucket (consistent click behavior across buckets)", () => {
    const { getByTestId } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "done", runStartedAt: new Date().toISOString(), runFinishedAt: new Date().toISOString() }}
        projects={rows}
      />,
    );
    fireEvent.click(within(getByTestId("issue-coverage-legend")).getByRole("button", { name: /Issues fetched/i }));
    const drill = getByTestId("issue-coverage-drilldown");
    expect(drill.textContent).toContain("MTY AE-01");
    expect(drill.textContent).toContain("12 issues");

    // Clicking again collapses it.
    fireEvent.click(within(getByTestId("issue-coverage-legend")).getByRole("button", { name: /Issues fetched/i }));
    expect(document.querySelector('[data-testid="issue-coverage-drilldown"]')).toBeNull();
  });

  it("opens a project drill-down for the zero_issues bucket too (drill works on every bucket)", () => {
    const { getByTestId } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "done", runStartedAt: new Date().toISOString(), runFinishedAt: new Date().toISOString() }}
        projects={rows}
      />,
    );
    fireEvent.click(within(getByTestId("issue-coverage-legend")).getByRole("button", { name: /Zero issues/i }));
    const drill = getByTestId("issue-coverage-drilldown");
    expect(drill.textContent).toContain("Clash-MC");
    expect(drill.textContent).toContain("No issues found");
  });

  it("shows the in-progress caption instead of presenting a running run's counts as final", () => {
    const { getByTestId } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "running", runStartedAt: new Date().toISOString(), runFinishedAt: null }}
        projects={rows}
      />,
    );
    expect(getByTestId("issue-coverage-in-progress").textContent).toMatch(/in progress/i);
  });

  it("does not show the in-progress caption for a finished run", () => {
    const { queryByTestId } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "done", runStartedAt: new Date().toISOString(), runFinishedAt: new Date().toISOString() }}
        projects={rows}
      />,
    );
    expect(queryByTestId("issue-coverage-in-progress")).toBeNull();
  });

  it("shows the freshness chip with a relative time", () => {
    const { getByText } = render(
      <IssueFetchCoverageDonut
        coverage={{ runStatus: "done", runStartedAt: new Date(Date.now() - 60_000).toISOString(), runFinishedAt: new Date().toISOString() }}
        projects={rows}
      />,
    );
    expect(getByText(/Latest issue fetch: .* ago/i)).toBeTruthy();
  });
});
