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

import { CompaniesActivityPieChart } from "../components/CompaniesActivityPieChart";
import { UNKNOWN_COMPANY } from "../companyCounts";
import type { CompanyActivitySummary } from "../companyActivityCounts";

const summary: CompanyActivitySummary = {
  slices: [
    { name: "Hermosillo", value: 100 },
    { name: "Estructure", value: 60 },
    { name: UNKNOWN_COMPANY, value: 20 },
    { name: "PICSA", value: 15 },
    { name: "PROLOGIS", value: 5 },
  ],
  total: 200,
  distinctCompanies: 4,
  usersByCompany: new Map([
    ["Hermosillo", [
      { email: "ana@x.com", name: "Ana", count: 70 },
      { email: "al@x.com", name: "Al", count: 30 },
    ]],
    ["Estructure", [{ email: "ben@x.com", name: "Ben", count: 60 }]],
  ]),
};

const empty: CompanyActivitySummary = { slices: [], total: 0, distinctCompanies: 0, usersByCompany: new Map() };

describe("CompaniesActivityPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<CompaniesActivityPieChart summary={empty} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no company activity/i)).toBeTruthy();
  });

  it("renders one legend row per slice", () => {
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    const legend = getByTestId("activity-company-legend");
    expect(legend.textContent).toContain("Hermosillo");
    expect(legend.textContent).toContain("PROLOGIS");
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("5");
  });

  it("flags Unknown company as the only warning", () => {
    const { getAllByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(1);
  });

  it("opens a drill-down of the people behind a company when its legend row is clicked", () => {
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    fireEvent.click(within(getByTestId("activity-company-legend")).getByRole("button", { name: /Hermosillo/ }));
    const drill = getByTestId("activity-company-drilldown");
    expect(drill.textContent).toContain("Ana");
    expect(drill.textContent).toContain("Al");
    expect(drill.textContent).toContain("70");
  });

  it("calls onUserClick with the person's email when a drilled user is clicked", () => {
    const onUserClick = vi.fn();
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} onUserClick={onUserClick} />);
    fireEvent.click(within(getByTestId("activity-company-legend")).getByRole("button", { name: /Hermosillo/ }));
    fireEvent.click(within(getByTestId("activity-company-drilldown")).getByRole("button", { name: /Ana/ }));
    expect(onUserClick).toHaveBeenCalledWith("ana@x.com");
  });

  it("collapses to a top-N with an Others bucket", () => {
    const { getByTestId } = render(<CompaniesActivityPieChart summary={summary} />);
    fireEvent.change(getByTestId("activity-company-topn-input"), { target: { value: "2" } });
    const legend = getByTestId("activity-company-legend");
    expect(within(legend).getByText(/Others \(2 companies\)/)).toBeTruthy();
    // Kept: Hermosillo, Estructure + pinned Unknown company + Others = 4 slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
  });
});
