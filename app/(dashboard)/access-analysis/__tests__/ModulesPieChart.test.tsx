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

import { ModulesPieChart } from "../components/ModulesPieChart";
import { UNMAPPED_MODULE, type ModuleSummary } from "../moduleCounts";

const summary: ModuleSummary = {
  slices: [
    { id: "dataManagement", name: "Data Management", value: 150 },
    { id: "build", name: "Build", value: 40 },
    { id: UNMAPPED_MODULE, name: "Unmapped", value: 7 },
  ],
  total: 197,
  activeModules: 2,
  zeroModules: [
    { id: "autospecs", name: "AutoSpecs" },
    { id: "design", name: "Design" },
    { id: "insight", name: "Insight" },
  ],
  typesByModule: new Map([
    ["dataManagement", [
      { label: "View Entity", raw: "view-entity", count: 100, category: "Viewing & exports" },
      { label: "Upload Entity", raw: "upload-entity", count: 50, category: "Content changes" },
    ]],
    ["build", [
      { label: "Issue View", raw: "issue-view", count: 30, category: "Workflow" },
      { label: "Issue Create", raw: "issue-create", count: 10, category: "Workflow" },
    ]],
    [UNMAPPED_MODULE, [{ label: "weird-action", raw: "weird-action", count: 7, category: "Other" }]],
  ]),
  attribution: { serviceCount: 0, verbCount: 197 },
};

const empty: ModuleSummary = {
  slices: [],
  total: 0,
  activeModules: 0,
  zeroModules: [],
  typesByModule: new Map(),
  attribution: { serviceCount: 0, verbCount: 0 },
};

describe("ModulesPieChart", () => {
  it("renders an empty state when there is no activity", () => {
    const { queryByTestId, getByText } = render(<ModulesPieChart summary={empty} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no activity found/i)).toBeTruthy();
  });

  it("draws one slice per module and lists them in the legend", () => {
    const { getByTestId } = render(<ModulesPieChart summary={summary} />);
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("3");
    const legend = getByTestId("module-legend");
    expect(legend.textContent).toContain("Data Management");
    expect(legend.textContent).toContain("Build");
  });

  it("flags the Unmapped bucket as a warning", () => {
    const { getAllByTestId } = render(<ModulesPieChart summary={summary} />);
    expect(getAllByTestId("warning-icon")).toHaveLength(1);
  });

  it("clicking a module drills into every activity type mapped into it, grouped by category", () => {
    const { getByTestId, getByRole } = render(<ModulesPieChart summary={summary} />);
    fireEvent.click(within(getByTestId("module-legend")).getByRole("button", { name: /Build/ }));
    const drill = getByTestId("module-drilldown");
    expect(drill.textContent).toContain("Issue View");
    expect(drill.textContent).toContain("Issue Create");
    expect(drill.textContent).toContain("Workflow"); // category header
    // Clicking again collapses it.
    fireEvent.click(within(getByTestId("module-legend")).getByRole("button", { name: /Build/ }));
    expect(getByRole).toBeTruthy();
    expect(document.querySelector('[data-testid="module-drilldown"]')).toBeNull();
  });

  it("shows the modules with no activity as greyed chips", () => {
    const { getByTestId } = render(<ModulesPieChart summary={summary} />);
    const zero = getByTestId("module-zero");
    expect(zero.textContent).toContain("AutoSpecs");
    expect(zero.textContent).toContain("Design");
    expect(zero.textContent).toContain("Insight");
  });
});
