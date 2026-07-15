// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GroupByControls } from "./GroupByControls";
import { PRIMARY_GROUP_DIMENSION_IDS } from "./groupByDimensions";
import { SliderProvider } from "./SliderContext";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => window.localStorage.clear());

const LABELS: Record<string, string> = {
  role: "Role",
  company: "Company",
  user: "Users",
  project: "Project name",
  activityRecency: "Last activity",
  activityVolume: "Activity volume",
  permissionTier: "Folder permission type",
  folderBreadth: "Folder access",
  typeOfActivity: "Activity type",
  moduleAccess: "Modules",
};

function dim(id: string): CatalogDimension {
  return {
    id,
    label: LABELS[id] ?? id,
    family: "structure",
    kind: "categorical",
    source: "test",
    confidence: "high",
    available: true,
    surfaces: ["color"],
    extract: (feature) => id === "role" ? feature.role : "covered",
  } as CatalogDimension;
}

const CATALOG = [...PRIMARY_GROUP_DIMENSION_IDS.map(dim), dim("riskScore")];

function renderControls(
  groupBy: string,
  onGroupByChange = vi.fn(),
  features: ReadonlyArray<NodeFeatureSnapshot> = [],
) {
  render(
    <SliderProvider physics={null} catalog={CATALOG}>
      <GroupByControls
        catalog={CATALOG}
        features={features}
        groupBy={groupBy}
        onGroupByChange={onGroupByChange}
        activeLayoutLabel={groupBy === "general" ? "General" : LABELS[groupBy]}
        colorLabel="Role"
      />
    </SliderProvider>,
  );
  return { onGroupByChange };
}

describe("GroupByControls", () => {
  it("renders General first and only the ten curated primary dimensions after it", () => {
    renderControls("general");
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "General · Similarity",
      ...PRIMARY_GROUP_DIMENSION_IDS.map((id) => LABELS[id]),
    ]);
    expect((screen.getByTestId("group-by-select") as HTMLSelectElement).value).toBe("general");
    expect(screen.queryByRole("option", { name: "riskScore" })).toBeNull();
  });

  it("selecting General calls the shell reset path and hides grouping strength", () => {
    const { onGroupByChange } = renderControls("role");
    fireEvent.change(screen.getByTestId("group-by-select"), { target: { value: "general" } });
    expect(onGroupByChange).toHaveBeenCalledWith("general");

    cleanup();
    renderControls("general");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("Grouping strength")).toBeNull();
  });

  it("shows a real dimension strength and the plain encoding model", () => {
    renderControls("role");
    expect(screen.getByRole("slider", { name: "Grouping strength thumb" })).toBeTruthy();
    expect(screen.getByText("Position: Similarity")).toBeTruthy();
    expect(screen.getByText("Group into: Role · 0")).toBeTruthy();
    expect(screen.getByText("Color: Role")).toBeTruthy();
  });

  it("uses neutral selected-dimension coverage and separates memberships from people", () => {
    const features = [
      { nodeId: "u1::p1", role: "admin" },
      { nodeId: "u1::p2", role: null },
      { nodeId: "u2::p1", role: "viewer" },
    ] as unknown as NodeFeatureSnapshot[];
    renderControls("role", vi.fn(), features);
    expect(screen.getByText("Role data · 2/3 memberships")).toBeTruthy();
    expect(screen.getByText("3 membership nodes · 2 distinct people")).toBeTruthy();
    expect(screen.queryByText(/⚠/)).toBeNull();
  });
});
