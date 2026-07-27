// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const data = props.option.series?.[0]?.data ?? [];
    return <div data-testid="echart" data-points={data.length} />;
  },
}));

import { IssueTimelineChart } from "../components/IssueTimelineChart";
import type { TimelineSummary } from "../timelineCounts";
import type { IssueCoverageInputRow } from "../issueFetchCoverageCounts";

const summary: TimelineSummary = {
  points: [
    { month: "2024-01", label: "Jan 2024", count: 10 },
    { month: "2024-02", label: "Feb 2024", count: 0 },
    { month: "2024-03", label: "Mar 2024", count: 25 },
  ],
  total: 35,
  peak: { month: "2024-03", label: "Mar 2024", count: 25 },
  busiestYear: { year: "2024", count: 35 },
  span: { from: "2024-01", to: "2024-03" },
};

const empty: TimelineSummary = { points: [], total: 0, peak: null, busiestYear: null, span: null };

const okCoverage: IssueCoverageInputRow[] = [
  { projectId: "p1", projectName: "MTY AE-01", status: "ok", issueCount: 12 },
  { projectId: "p2", projectName: "Clash-MC", status: "zero_issues", issueCount: 0 },
];

const mixedCoverage: IssueCoverageInputRow[] = [
  ...okCoverage,
  { projectId: "p3", projectName: "Locked Site", status: "forbidden", issueCount: 0 },
];

describe("IssueTimelineChart", () => {
  it("renders the headline with total/peak/busiest-year using the 'issues' noun", () => {
    const { getByTestId } = render(
      <IssueTimelineChart summary={summary} coverageProjects={okCoverage} />,
    );
    expect(getByTestId("echart").getAttribute("data-points")).toBe("3");
    const headline = getByTestId("issue-timeline-headline");
    expect(headline.textContent).toContain("35");
    expect(headline.textContent).toContain("issues");
    expect(headline.textContent).toContain("Mar 2024");
    expect(headline.textContent).toContain("2024");
  });

  it("renders a live coverage caption computed from coverageProjects", () => {
    const { getByTestId } = render(
      <IssueTimelineChart summary={summary} coverageProjects={mixedCoverage} />,
    );
    const caption = getByTestId("issue-timeline-coverage-caption");
    expect(caption.textContent).toContain("covers 2 of 3");
    expect(caption.textContent).toContain("1 forbidden/error");
  });

  it("shows the empty state with the unavailable distinction line when coverage is forbidden/error", () => {
    const { getByTestId, queryByTestId } = render(
      <IssueTimelineChart summary={empty} coverageProjects={mixedCoverage} />,
    );
    expect(queryByTestId("echart")).toBeNull();
    const emptyState = getByTestId("issue-timeline-empty");
    expect(emptyState.textContent).toContain("No issues for this view");
    expect(emptyState.textContent).toContain("absence here is not zero issues");
  });

  it("shows the empty state with the genuinely-zero distinction line when all coverage rows are ok", () => {
    const { getByTestId, queryByTestId } = render(
      <IssueTimelineChart summary={empty} coverageProjects={okCoverage} />,
    );
    expect(queryByTestId("echart")).toBeNull();
    const emptyState = getByTestId("issue-timeline-empty");
    expect(emptyState.textContent).toContain("No issues for this view");
    expect(emptyState.textContent).toContain("genuinely has no issues");
  });

  it("never renders a YoY comparison (locked no-YoY decision)", () => {
    const { container } = render(
      <IssueTimelineChart summary={summary} coverageProjects={okCoverage} />,
    );
    expect(container.textContent).not.toMatch(/vs 20/);
    expect(container.textContent).not.toMatch(/to compare/i);
  });
});
