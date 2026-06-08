// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { RightPanelStack } from "./RightPanelStack";
import { SliderProvider } from "./SliderContext";
import { SelectionProvider } from "./SelectionContext";
import type { CatalogDimension } from "./dimensionCatalog.types";

// Radix Slider uses ResizeObserver, which is absent in jsdom.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// trpc queries used by RightPanelStack must not hit the network in a unit test.
vi.mock("@/lib/core/trpc", () => ({
  trpc: {
    accDcGraph: { bulkUsers: { useQuery: () => ({ data: [] }) } },
    accMembers: { enrichedUsers: { useQuery: () => ({ data: [] }) } },
  },
}));

function dim(id: string): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind: "categorical",
    source: "test", confidence: "high", available: true, surfaces: ["slider", "color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}
const CATALOG = [dim("company"), dim("role")];

function renderStack(useGroupByControls: boolean) {
  render(
    <SliderProvider physics={null} catalog={CATALOG}>
      <SelectionProvider>
        <RightPanelStack
          features={[]}
          catalog={CATALOG}
          visibleSelectedIndices={null}
          useGroupByControls={useGroupByControls}
          groupBy="company"
          onGroupByChange={vi.fn()}
        />
      </SelectionProvider>
    </SliderProvider>,
  );
}

describe("RightPanelStack — sidebar selection", () => {
  it("renders GroupByControls when useGroupByControls is true", () => {
    renderStack(true);
    expect(screen.getByTestId("group-by-controls")).toBeTruthy();
    expect(screen.queryByTestId("catalog-slider-sidebar")).toBeNull();
  });

  it("renders the legacy CatalogSliderSidebar when useGroupByControls is false", () => {
    renderStack(false);
    expect(screen.getByTestId("catalog-slider-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("group-by-controls")).toBeNull();
  });
});
