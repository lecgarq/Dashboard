// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any; onEvents?: Record<string, (params: unknown) => void> }) => {
    const series = props.option.series?.[0];
    const data: Array<{ value: number; id: string; itemStyle?: unknown }> = series?.data ?? [];
    const categories: string[] = (props.option.yAxis as any)?.data ?? [];
    return (
      <div data-testid="echart" data-bars={data.length}>
        {data.map((d, i) => (
          <button
            key={d.id}
            data-testid={`bar-${categories[i]}`}
            onClick={() => props.onEvents?.click?.({ data: d, name: categories[i] })}
          >
            {categories[i]}
          </button>
        ))}
      </div>
    );
  },
}));

import { ProvisionedModulesChart } from "../components/ProvisionedModulesChart";
import { summarizeProvisionedModules } from "../provisionedModulesCounts";
import type { ProvisionedModuleRow } from "@/lib/server/provisionedModulesView";

const mk = (projectId: string, moduleId: string, count: number): ProvisionedModuleRow => ({
  projectId,
  projectName: `Project ${projectId}`,
  moduleId,
  count,
});

const rows: ProvisionedModuleRow[] = [
  mk("p1", "dataManagement", 100),
  mk("p2", "dataManagement", 50),
  mk("p1", "build", 40),
];

describe("ProvisionedModulesChart", () => {
  it("renders an empty state when total grants is zero", () => {
    const summary = summarizeProvisionedModules([]);
    const { queryByTestId, getByText } = render(<ProvisionedModulesChart summary={summary} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no module grants for this selection/i)).toBeTruthy();
  });

  it("renders one bar per module with grants", () => {
    const summary = summarizeProvisionedModules(rows);
    const { getByTestId } = render(<ProvisionedModulesChart summary={summary} />);
    expect(getByTestId("echart").getAttribute("data-bars")).toBe("2"); // dataManagement, build
  });

  it("clicking a bar opens the module's project drill, and closes on a second click", () => {
    const summary = summarizeProvisionedModules(rows);
    const { getByTestId, queryByTestId } = render(<ProvisionedModulesChart summary={summary} />);
    fireEvent.click(getByTestId("bar-Data Management"));
    const drill = getByTestId("provisioned-modules-drilldown");
    expect(drill.textContent).toContain("Project p1");
    expect(drill.textContent).toContain("Project p2");
    expect(drill.textContent).toContain("100 grants");

    fireEvent.click(getByTestId("bar-Data Management"));
    expect(queryByTestId("provisioned-modules-drilldown")).toBeNull();
  });

  it("caps the drill list at 30 rows and shows a '+N more projects' line", () => {
    const manyRows: ProvisionedModuleRow[] = Array.from({ length: 35 }, (_, i) => mk(`p${i}`, "build", 35 - i));
    const summary = summarizeProvisionedModules(manyRows);
    const { getByTestId, getByText } = render(<ProvisionedModulesChart summary={summary} />);
    fireEvent.click(getByTestId("bar-Build"));
    const drill = getByTestId("provisioned-modules-drilldown");
    expect(drill.querySelectorAll("li").length).toBe(30);
    expect(getByText("+5 more projects")).toBeTruthy();
  });

  it("shows a muted zero-grant footer listing module names when some modules have zero grants", () => {
    const summary = summarizeProvisionedModules(rows);
    const { getByTestId } = render(<ProvisionedModulesChart summary={summary} />);
    const zero = getByTestId("provisioned-modules-zero");
    expect(zero.textContent).toContain("Insight");
    expect(zero.textContent).toContain("Datum");
    // dataManagement/build have grants -- must NOT appear in the zero footer
    expect(zero.textContent).not.toContain("Data Management");
  });

  it("does not reference the cross-filter bus (onSliceClick/activeSlice) -- local drill only", () => {
    const source = readFileSync(
      join(__dirname, "../components/ProvisionedModulesChart.tsx"),
      "utf-8",
    );
    expect(source).not.toContain("onSliceClick");
    expect(source).not.toContain("activeSlice");
    expect(source).not.toContain("sliceFilters");
  });
});
