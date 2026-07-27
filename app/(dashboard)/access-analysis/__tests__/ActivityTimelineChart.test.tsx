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

import { ActivityTimelineChart } from "../components/ActivityTimelineChart";
import type { TimelineSummary } from "../timelineCounts";

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

describe("ActivityTimelineChart", () => {
  it("shows an empty state when there are no points", () => {
    const { queryByTestId, getByText } = render(<ActivityTimelineChart summary={empty} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no activity/i)).toBeTruthy();
  });

  it("renders the headline and one data point per month", () => {
    const { getByTestId } = render(<ActivityTimelineChart summary={summary} />);
    expect(getByTestId("echart").getAttribute("data-points")).toBe("3");
    const headline = getByTestId("timeline-headline");
    expect(headline.textContent).toContain("35");
    expect(headline.textContent).toContain("Mar 2024");
    expect(headline.textContent).toContain("2024");
  });

  it("omits the busiest-month label when peak is null", () => {
    const noPeak: TimelineSummary = {
      points: [{ month: "2024-01", label: "Jan 2024", count: 0 }],
      total: 0,
      peak: null,
      busiestYear: { year: "2024", count: 0 },
      span: { from: "2024-01", to: "2024-01" },
    };
    const { getByTestId } = render(<ActivityTimelineChart summary={noPeak} />);
    expect(getByTestId("echart").getAttribute("data-points")).toBe("1");
    expect(getByTestId("timeline-headline").textContent).not.toContain("busiest month");
  });

  // TRUTH-02: data floor caption
  it("renders 'Data available from Mon YYYY' caption when dataFloor is provided", () => {
    const { getByTestId } = render(
      <ActivityTimelineChart summary={summary} dataFloor="2025-06" />,
    );
    const caption = getByTestId("timeline-data-floor");
    expect(caption.textContent).toContain("Data available from");
    expect(caption.textContent).toContain("Jun 2025");
    // Must be month-year only — no day component.
    expect(caption.textContent).not.toMatch(/\bJun \d{1,2},/);
  });

  it("omits the data floor caption when dataFloor is null or absent", () => {
    const { queryByTestId: queryNull } = render(
      <ActivityTimelineChart summary={summary} dataFloor={null} />,
    );
    expect(queryNull("timeline-data-floor")).toBeNull();

    const { queryByTestId: queryAbsent } = render(
      <ActivityTimelineChart summary={summary} />,
    );
    expect(queryAbsent("timeline-data-floor")).toBeNull();
  });
});
