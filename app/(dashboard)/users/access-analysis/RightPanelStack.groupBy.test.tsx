// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RightPanelStack } from "./RightPanelStack";
import { SliderProvider } from "./SliderContext";
import { SelectionProvider } from "./SelectionContext";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { PhysicsLayer } from "./physicsLayer";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: { bulkUsers: { useQuery: () => ({ data: [] }) } },
    accMembers: { enrichedUsers: { useQuery: () => ({ data: [] }) } },
    users: {
      getOrgDirectory: { useQuery: () => ({ data: undefined }) },
      getDirectory: { useQuery: () => ({ data: [] }) },
    },
  },
}));

function dim(id: string): CatalogDimension {
  return {
    id,
    label: id === "role" ? "Role" : "Company",
    family: "structure",
    kind: "categorical",
    source: "test",
    confidence: "high",
    available: true,
    surfaces: ["slider", "color"],
    extract: () => null,
  } as CatalogDimension;
}

const CATALOG = [dim("company"), dim("role")];
const physics = {
  getTargets: () => ({}),
  getDimWeights: () => ({}),
  registerTargets: vi.fn(),
  updateSliders: vi.fn(),
  setActiveInput: vi.fn(),
} as unknown as PhysicsLayer;

function renderStack(): void {
  render(
    <SliderProvider physics={physics} catalog={CATALOG}>
      <SelectionProvider>
        <RightPanelStack
          features={[]}
          physics={physics}
          catalog={CATALOG}
          visibleSelectedIndices={null}
          groupBy="general"
          onGroupByChange={vi.fn()}
          colorLabel="Role"
        />
      </SelectionProvider>
    </SliderProvider>,
  );
}

describe("RightPanelStack — base rail views", () => {
  it("defaults to Layout and keeps Dimensions lazy", () => {
    renderStack();
    expect(screen.getByTestId("group-by-controls")).toBeTruthy();
    expect(screen.queryByTestId("catalog-slider-sidebar")).toBeNull();
    expect(screen.getByRole("tab", { name: "Layout" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Dimensions" }).getAttribute("aria-selected")).toBe("false");
  });

  it("loads Dimensions only after its tab is selected", async () => {
    renderStack();
    const dimensionsTab = screen.getByTestId("dimensions-tab");
    fireEvent.mouseDown(dimensionsTab, { button: 0, ctrlKey: false });
    fireEvent.click(dimensionsTab);
    expect(await screen.findByTestId("catalog-slider-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("group-by-controls")).toBeNull();
    expect(screen.getByRole("tab", { name: "Dimensions" }).getAttribute("aria-selected")).toBe("true");
  });
});
