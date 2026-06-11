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

import { ActivityByRolePieChart } from "../components/ActivityByRolePieChart";
import { UNKNOWN_ROLE, MULTIPLE_ROLES } from "../roleCounts";
import type { RoleActivitySummary } from "../roleActivityCounts";

const summary: RoleActivitySummary = {
  slices: [
    { name: "Alpha", value: 100 },
    { name: "Bravo", value: 60 },
    { name: MULTIPLE_ROLES, value: 30 },
    { name: UNKNOWN_ROLE, value: 20 },
    { name: "Charlie", value: 15 },
    { name: "Delta", value: 5 },
  ],
  total: 230,
  distinctRoles: 4,
  usersByRole: new Map([
    ["Alpha", [
      { email: "ana@x.com", name: "Ana", count: 70 },
      { email: "al@x.com", name: "Al", count: 30 },
    ]],
    ["Bravo", [{ email: "ben@x.com", name: "Ben", count: 60 }]],
  ]),
};

const empty: RoleActivitySummary = { slices: [], total: 0, distinctRoles: 0, usersByRole: new Map() };

describe("ActivityByRolePieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<ActivityByRolePieChart summary={empty} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no activity/i)).toBeTruthy();
  });

  it("renders one legend row per slice", () => {
    const { getByTestId } = render(<ActivityByRolePieChart summary={summary} />);
    const legend = getByTestId("activity-role-legend");
    expect(legend.textContent).toContain("Alpha");
    expect(legend.textContent).toContain("Delta");
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });

  it("flags Unknown and Multiple roles as warnings", () => {
    const { getAllByTestId } = render(<ActivityByRolePieChart summary={summary} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(2);
  });

  it("opens a drill-down of the users behind a role when its legend row is clicked", () => {
    const { getByTestId } = render(<ActivityByRolePieChart summary={summary} />);
    const legend = getByTestId("activity-role-legend");
    fireEvent.click(within(legend).getByRole("button", { name: /Alpha/ }));
    const drill = getByTestId("activity-role-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Al");
    expect(drill.textContent).toContain("70");
  });

  it("collapses to a top-N with an Others bucket", () => {
    const { getByTestId, queryByText } = render(<ActivityByRolePieChart summary={summary} />);
    fireEvent.change(getByTestId("activity-topn-input"), { target: { value: "2" } });
    const legend = getByTestId("activity-role-legend");
    expect(within(legend).getByText(/Others \(2 roles\)/)).toBeTruthy();
    // Kept: Alpha, Bravo + pinned Unknown, Multiple roles + Others = 5 slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("5");
    expect(queryByText(/Others \(2 roles\)/)).toBeTruthy();
  });
});
