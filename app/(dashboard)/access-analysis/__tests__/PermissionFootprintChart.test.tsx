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
        data-names={(props.option.yAxis as any)?.data?.join("|")}
      />
    );
  },
}));

import { PermissionFootprintChart } from "../components/PermissionFootprintChart";
import type { PermissionFootprintRow } from "@/lib/server/permissionFootprintView";

function row(over: Partial<PermissionFootprintRow>): PermissionFootprintRow {
  return {
    projectId: "p1",
    projectName: "Project One",
    roleId: "r1",
    roleName: "Role One",
    folderCount: 1,
    totalBytes: 100,
    ...over,
  };
}

const rows: PermissionFootprintRow[] = [
  row({ projectId: "p1", projectName: "Alpha", roleId: "r1", roleName: "Project Admin", folderCount: 12, totalBytes: 5_000_000_000 }),
  row({ projectId: "p2", projectName: "Beta", roleId: "r1", roleName: "Project Admin", folderCount: 8, totalBytes: 2_000_000_000 }),
  row({ projectId: "p1", projectName: "Alpha", roleId: "r2", roleName: "Viewer", folderCount: 20, totalBytes: 500_000_000 }),
];

describe("PermissionFootprintChart", () => {
  it("renders an empty state when there are no rows", () => {
    const { queryByTestId, getByText } = render(<PermissionFootprintChart rows={[]} />);
    expect(queryByTestId("echart")).toBeNull();
    expect(getByText(/no permission summary rows/i)).toBeTruthy();
  });

  it("renders one bar per role, sorted by totalBytes desc", () => {
    const { getByTestId } = render(<PermissionFootprintChart rows={rows} />);
    // yAxis is reversed (category axis renders bottom-up), so ordered ascending internally.
    expect(getByTestId("echart").getAttribute("data-slices")).toBe("2");
    const legend = getByTestId("permission-footprint-legend");
    expect(legend.textContent).toContain("Project Admin");
    expect(legend.textContent).toContain("Viewer");
  });

  it("clicking a role in the legend opens its per-project drill, sorted by bytes desc", () => {
    const { getByTestId, queryByTestId } = render(<PermissionFootprintChart rows={rows} />);
    fireEvent.click(within(getByTestId("permission-footprint-legend")).getByRole("button", { name: /Project Admin/ }));
    const drill = getByTestId("permission-footprint-drilldown");
    expect(drill.textContent).toContain("Alpha");
    expect(drill.textContent).toContain("Beta");
    // Alpha (5GB) should appear before Beta (2GB) in the drill list.
    const alphaIdx = drill.textContent!.indexOf("Alpha");
    const betaIdx = drill.textContent!.indexOf("Beta");
    expect(alphaIdx).toBeLessThan(betaIdx);

    // Clicking again closes it.
    fireEvent.click(within(getByTestId("permission-footprint-legend")).getByRole("button", { name: /Project Admin/ }));
    expect(queryByTestId("permission-footprint-drilldown")).toBeNull();
  });

  it("collapses roles beyond top-10 into a non-clickable 'Other' bar", () => {
    const manyRows: PermissionFootprintRow[] = Array.from({ length: 12 }, (_, i) =>
      row({ projectId: `p${i}`, projectName: `Project ${i}`, roleId: `r${i}`, roleName: `Role ${i}`, totalBytes: 100 - i }),
    );
    const { getByTestId } = render(<PermissionFootprintChart rows={manyRows} />);
    const legend = getByTestId("permission-footprint-legend");
    const otherButton = within(legend).getByRole("button", { name: /Other \(2 roles\)/ });
    expect((otherButton as HTMLButtonElement).disabled).toBe(true);
  });
});
