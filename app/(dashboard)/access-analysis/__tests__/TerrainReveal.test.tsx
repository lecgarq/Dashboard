// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { TerrainReveal } from "../components/TerrainReveal";
import type { TerrainProjectOption } from "../folderTerrain";

// Mock FolderPermissionTerrain so its heavy canvas/SVG build doesn't run in jsdom.
// The mock must honour the loadOverview call so we can assert it was called.
vi.mock("../components/FolderPermissionTerrain", () => ({
  FolderPermissionTerrain: vi.fn(({ loadOverview }: { loadOverview?: () => Promise<unknown> }) => {
    // Simulate the mount-time overview load the real component performs.
    if (loadOverview) void loadOverview();
    return <div data-testid="terrain-canvas">terrain</div>;
  }),
}));

const projects: TerrainProjectOption[] = [
  { id: "p1", name: "Demo Project", office: "MTY", folderCount: 4, permCount: 40, userRoleCount: 10 },
];

describe("TerrainReveal", () => {
  it("is collapsed by default — terrain canvas is not mounted", () => {
    const loadTerrain = vi.fn(async () => null);
    const loadOverview = vi.fn(async () => null);
    const { queryByTestId } = render(
      <TerrainReveal projects={projects} loadTerrain={loadTerrain} loadOverview={loadOverview} />,
    );
    // The terrain canvas must NOT be in the DOM before expand.
    expect(queryByTestId("terrain-canvas")).toBeNull();
    // The expand button must be visible.
    expect(queryByTestId("terrain-expand")).toBeTruthy();
  });

  it("clicking expand mounts the terrain and calls loadOverview (not loadTerrain for a default project)", () => {
    const loadTerrain = vi.fn(async () => null);
    const loadOverview = vi.fn(async () => null);
    const { getByTestId, queryByTestId } = render(
      <TerrainReveal projects={projects} loadTerrain={loadTerrain} loadOverview={loadOverview} />,
    );
    fireEvent.click(getByTestId("terrain-expand"));
    // Terrain canvas now mounted.
    expect(queryByTestId("terrain-canvas")).toBeTruthy();
    // loadOverview was called (the component triggers the account-wide view on mount).
    expect(loadOverview).toHaveBeenCalled();
    // loadTerrain must NOT have been called for any default project preload.
    expect(loadTerrain).not.toHaveBeenCalled();
  });

  it("collapse button hides the terrain again and shows Show button", () => {
    const loadTerrain = vi.fn(async () => null);
    const loadOverview = vi.fn(async () => null);
    const { getByTestId, queryByTestId } = render(
      <TerrainReveal projects={projects} loadTerrain={loadTerrain} loadOverview={loadOverview} />,
    );
    const btn = getByTestId("terrain-expand");
    // Expand
    fireEvent.click(btn);
    expect(queryByTestId("terrain-canvas")).toBeTruthy();
    // Collapse
    fireEvent.click(btn);
    expect(queryByTestId("terrain-canvas")).toBeNull();
  });
});
