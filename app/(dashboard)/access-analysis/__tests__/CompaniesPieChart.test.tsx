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
        data-active={series.filter((d: any) => d.value > 0).length}
        data-names={series.map((d: any) => d.name).join("|")}
      />
    );
  },
}));

import { CompaniesPieChart } from "../components/CompaniesPieChart";
import { UNKNOWN_COMPANY } from "../companyCounts";

const data = [
  { name: "Hermosillo", value: 50 },
  { name: UNKNOWN_COMPANY, value: 30 },
  { name: "Estructure", value: 25 },
  { name: "PICSA", value: 20 },
  { name: "PROLOGIS", value: 15 },
  { name: "SOLUTEC", value: 10 },
];

describe("CompaniesPieChart", () => {
  it("renders an empty state when there is no data", () => {
    const { queryByTestId, getByText } = render(<CompaniesPieChart data={[]} distinctCompanies={0} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no company data/i)).toBeTruthy();
  });

  it("shows all companies by default with no Others", () => {
    const { getByTestId, queryByText } = render(<CompaniesPieChart data={data} distinctCompanies={5} />);
    const legend = getByTestId("company-legend");
    expect(legend.textContent).toContain("Hermosillo");
    expect(legend.textContent).toContain("SOLUTEC");
    expect(queryByText(/Others \(/)).toBeNull();
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("6");
  });

  it("flags Unknown company as the only warning", () => {
    const { getAllByTestId } = render(<CompaniesPieChart data={data} distinctCompanies={5} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(1);
  });

  it("typing a top-N collapses the rest into Others (companies)", () => {
    const { getByTestId, within: _w } = render(<CompaniesPieChart data={data} distinctCompanies={5} />) as any;
    fireEvent.change(getByTestId("company-topn-input"), { target: { value: "2" } });
    const legend = getByTestId("company-legend");
    expect(within(legend).getByText(/Others \(3 companies\)/)).toBeTruthy();
    // Donut shows Unknown company, Hermosillo, Estructure, Others = 4 slices.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("4");
  });

  it("toggles a company off from the legend", () => {
    const { getByTestId } = render(<CompaniesPieChart data={data} distinctCompanies={5} />);
    const legend = getByTestId("company-legend");
    const top = within(legend).getByRole("button", { name: /Hermosillo/ });
    fireEvent.click(top);
    expect(top.getAttribute("aria-pressed")).toBe("false");
    expect(getByTestId("echart").getAttribute("data-active")).toBe("5"); // 6 shown, 1 hidden
    expect(getByTestId("company-metrics").textContent).toContain("100 users"); // 150 - 50
  });
});
