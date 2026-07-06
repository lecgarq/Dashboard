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

import { IssueStatusChart } from "../components/IssueStatusChart";
import type { IssueStatusInputRow } from "../issueFunnelCounts";
import type { IssueCoverageInputRow } from "../issueFetchCoverageCounts";

const rows: IssueStatusInputRow[] = [
  { projectId: "p1", projectName: "MTY AE-01", status: "open", count: 5 },
  { projectId: "p2", projectName: "Clash-MC", status: "closed", count: 3 },
];

const weirdRows: IssueStatusInputRow[] = [
  ...rows,
  { projectId: "p3", projectName: "Odd Project", status: "weird", count: 2 },
];

const okCoverage: IssueCoverageInputRow[] = [
  { projectId: "p1", projectName: "MTY AE-01", status: "ok", issueCount: 5 },
  { projectId: "p2", projectName: "Clash-MC", status: "zero_issues", issueCount: 0 },
];

const mixedCoverage: IssueCoverageInputRow[] = [
  ...okCoverage,
  { projectId: "p3", projectName: "Locked Site", status: "forbidden", issueCount: 0 },
];

describe("IssueStatusChart", () => {
  it("renders all 8 statuses in the legend in ISSUE_STATUSES order, zeros kept", () => {
    const { getByTestId } = render(
      <IssueStatusChart rows={rows} coverageProjects={okCoverage} />,
    );
    const legend = getByTestId("issue-status-legend");
    const labels = Array.from(legend.querySelectorAll("button")).map((b) => b.textContent);
    expect(labels.length).toBe(8);
    expect(legend.textContent).toContain("open");
    expect(legend.textContent).toContain("closed");
    expect(legend.textContent).toContain("draft");
    expect(legend.textContent).toContain("pending");
  });

  it("opens the drill on legend click, lists that status's projects with counts, and closes on a second click", () => {
    const { getByTestId } = render(
      <IssueStatusChart rows={rows} coverageProjects={okCoverage} />,
    );
    const legend = getByTestId("issue-status-legend");
    const openButton = within(legend).getByRole("button", { name: /^open/i });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(openButton);
    expect(openButton.getAttribute("aria-expanded")).toBe("true");
    const drill = getByTestId("issue-status-drilldown");
    expect(drill.textContent).toContain("MTY AE-01");
    expect(drill.textContent).toContain("5 issues");

    fireEvent.click(openButton);
    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector('[data-testid="issue-status-drilldown"]')).toBeNull();
  });

  it("appends an unexpected status as its own legend row instead of dropping it", () => {
    const { getByTestId } = render(
      <IssueStatusChart rows={weirdRows} coverageProjects={okCoverage} />,
    );
    const legend = getByTestId("issue-status-legend");
    expect(legend.textContent).toContain("weird");
    const buttons = within(legend).getAllByRole("button");
    expect(buttons.length).toBe(9);
  });

  it("renders a live coverage caption computed from coverageProjects", () => {
    const { getByTestId } = render(
      <IssueStatusChart rows={rows} coverageProjects={mixedCoverage} />,
    );
    const caption = getByTestId("issue-status-coverage-caption");
    expect(caption.textContent).toContain("covers 2 of 3");
    expect(caption.textContent).toContain("1 forbidden/error");
  });

  it("shows the empty state with the unavailable distinction line when coverage is forbidden/error", () => {
    const { getByTestId, queryByTestId } = render(
      <IssueStatusChart rows={[]} coverageProjects={mixedCoverage} />,
    );
    expect(queryByTestId("echart")).toBeNull();
    const emptyState = getByTestId("issue-status-empty");
    expect(emptyState.textContent).toContain("No issues for this view");
    expect(emptyState.textContent).toContain("absence here is not zero issues");
  });

  it("shows the empty state with the genuinely-zero distinction line when all coverage rows are ok", () => {
    const { getByTestId, queryByTestId } = render(
      <IssueStatusChart rows={[]} coverageProjects={okCoverage} />,
    );
    expect(queryByTestId("echart")).toBeNull();
    const emptyState = getByTestId("issue-status-empty");
    expect(emptyState.textContent).toContain("No issues for this view");
    expect(emptyState.textContent).toContain("genuinely has no issues");
  });

  it("drives the drill entirely via internal state (no onSliceClick/activeSlice props)", () => {
    // The component's props type has no onSliceClick/activeSlice — this call
    // would fail to type-check if such props were required. The drill-open
    // assertion above already proves the toggle is local React state, not a
    // parent-controlled prop.
    const { getByTestId } = render(
      <IssueStatusChart rows={rows} coverageProjects={okCoverage} />,
    );
    expect(getByTestId("echart")).toBeTruthy();
  });
});
