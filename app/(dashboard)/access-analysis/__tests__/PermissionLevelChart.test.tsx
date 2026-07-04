// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any; onEvents?: Record<string, (params: unknown) => void> }) => {
    // mergeEChartsTheme (components/ui/EChart.tsx) normalizes option.legend into an
    // array even when a single legend object is passed — mirror that here.
    const legendArr = Array.isArray(props.option.legend) ? props.option.legend : [props.option.legend].filter(Boolean);
    const legendData: string[] = legendArr[0]?.data ?? [];
    const series = props.option.series ?? [];
    const categories: string[] = (props.option.yAxis as any)?.data ?? [];
    return (
      <div data-testid="echart" data-series={series.length} data-legend={legendData.join("|")}>
        {categories.map((name) => (
          <button key={name} data-testid={`bar-${name}`} onClick={() => props.onEvents?.click?.({ name })}>
            {name}
          </button>
        ))}
      </div>
    );
  },
}));

import { PermissionLevelChart } from "../components/PermissionLevelChart";
import type { PermissionLevelRow } from "@/lib/server/permissionLevelView";

function row(over: Partial<PermissionLevelRow>): PermissionLevelRow {
  return {
    projectId: "p1",
    projectName: "Project One",
    roleId: "r1",
    roleName: "Role One",
    permType: "View Only",
    folderCount: 1,
    ...over,
  };
}

const rows: PermissionLevelRow[] = [
  row({ projectId: "p1", projectName: "Alpha", roleId: "r1", roleName: "Project Admin", permType: "Full Controller", folderCount: 12 }),
  row({ projectId: "p2", projectName: "Beta", roleId: "r1", roleName: "Project Admin", permType: "View Only", folderCount: 8 }),
  row({ projectId: "p1", projectName: "Alpha", roleId: "r2", roleName: "Viewer", permType: "View Only", folderCount: 20 }),
];

describe("PermissionLevelChart", () => {
  it("renders an empty state when there are no rows", () => {
    const { queryByTestId, getByText } = render(<PermissionLevelChart rows={[]} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no permission data for this view/i)).toBeTruthy();
  });

  it("renders one series per level present in the data, with verbatim level labels in the legend", () => {
    const { getByTestId } = render(<PermissionLevelChart rows={rows} />);
    const echart = getByTestId("echart");
    // Two distinct permTypes present: "Full Controller" and "View Only"
    expect(echart.getAttribute("data-series")).toBe("2");
    const legend = echart.getAttribute("data-legend") ?? "";
    expect(legend).toContain("Full Controller");
    expect(legend).toContain("View Only");
    // Never the PermTier remapped label
    expect(legend).not.toContain("Full administrative controls");
  });

  it("clicking a role's bar opens its per-project drill", () => {
    const { getByTestId, queryByTestId } = render(<PermissionLevelChart rows={rows} />);
    fireEvent.click(getByTestId("bar-Project Admin"));
    const drill = getByTestId("permission-level-drilldown");
    expect(drill.textContent).toContain("Alpha");
    expect(drill.textContent).toContain("Beta");

    // Clicking again closes it.
    fireEvent.click(getByTestId("bar-Project Admin"));
    expect(queryByTestId("permission-level-drilldown")).toBeNull();
  });

  it("does not drill when the 'Other' bar is clicked — it expands instead", () => {
    const manyRows: PermissionLevelRow[] = Array.from({ length: 12 }, (_, i) =>
      row({ projectId: `p${i}`, projectName: `Project ${i}`, roleId: `r${i}`, roleName: `Role ${i}`, folderCount: 100 - i }),
    );
    const { getByTestId, queryByTestId } = render(<PermissionLevelChart rows={manyRows} />);
    fireEvent.click(getByTestId("bar-Other (2 roles)"));
    expect(queryByTestId("permission-level-drilldown")).toBeNull();
  });

  it("expands the folded 'Other' bucket in place — the previously-hidden roles render as their own bars, and collapses back on request (UAT gap-closure item 2)", () => {
    const manyRows: PermissionLevelRow[] = Array.from({ length: 12 }, (_, i) =>
      row({ projectId: `p${i}`, projectName: `Project ${i}`, roleId: `r${i}`, roleName: `Role ${i}`, folderCount: 100 - i }),
    );
    const { getByTestId, queryByTestId, getByText } = render(<PermissionLevelChart rows={manyRows} />);
    expect(queryByTestId("bar-Role 10")).toBeNull();

    fireEvent.click(getByTestId("bar-Other (2 roles)"));
    expect(getByTestId("bar-Role 10")).toBeTruthy();
    expect(getByTestId("bar-Role 11")).toBeTruthy();
    expect(queryByTestId("bar-Other (2 roles)")).toBeNull();

    fireEvent.click(getByText(/Showing all 12 roles/));
    expect(getByTestId("bar-Other (2 roles)")).toBeTruthy();
    expect(queryByTestId("bar-Role 10")).toBeNull();
  });
});
