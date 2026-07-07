// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

/* eslint-disable @typescript-eslint/no-explicit-any */
vi.mock("echarts-for-react", () => ({
  default: (props: { option: any }) => {
    const series = props.option.series?.[0]?.data ?? [];
    const yData = props.option.yAxis?.data ?? [];
    return <div data-testid="echart" data-cells={series.length} data-folders={yData.join("|")} />;
  },
}));

import { FolderActionHeatmap } from "../components/FolderActionHeatmap";
import type { FolderActionCell } from "../folderActionTypes";

const matrix: FolderActionCell[] = [
  { folderName: "Project Files", verb: "view-entity", count: 100 },
  { folderName: "Project Files", verb: "upload-entity", count: 40 },
  { folderName: "ARQ", verb: "download-entity", count: 30 },
];

describe("FolderActionHeatmap", () => {
  it("does not load until expanded", () => {
    const loadMatrix = vi.fn(async () => matrix);
    render(<FolderActionHeatmap selectedProjectIds={["p1"]} loadMatrix={loadMatrix} />);
    expect(loadMatrix).not.toHaveBeenCalled();
  });

  it("renders the heatmap with ranked folder rows on expand", async () => {
    const loadMatrix = vi.fn(async () => matrix);
    const { getByTestId } = render(<FolderActionHeatmap selectedProjectIds={["p1", "p2"]} loadMatrix={loadMatrix} />);
    fireEvent.click(getByTestId("folder-heatmap-expand"));
    await waitFor(() => expect(getByTestId("echart")).toBeTruthy());
    expect(loadMatrix).toHaveBeenCalledWith(["p1", "p2"]);
    // Busiest folder first on the y-axis; 3 non-zero cells.
    expect(getByTestId("echart").getAttribute("data-folders")).toBe("Project Files|ARQ");
    expect(getByTestId("echart").getAttribute("data-cells")).toBe("3");
    // Live caption, never hardcoded.
    expect(getByTestId("folder-heatmap-panel").textContent).toContain("Top 2 folders by activity");
    expect(getByTestId("folder-heatmap-panel").textContent).toContain("170 activities");
  });

  it("shows the empty state when the selection has no folder activity", async () => {
    const loadMatrix = vi.fn(async () => [] as FolderActionCell[]);
    const { getByTestId, getByText } = render(<FolderActionHeatmap selectedProjectIds={["p1"]} loadMatrix={loadMatrix} />);
    fireEvent.click(getByTestId("folder-heatmap-expand"));
    await waitFor(() => expect(getByText(/no folder activity/i)).toBeTruthy());
  });
});
