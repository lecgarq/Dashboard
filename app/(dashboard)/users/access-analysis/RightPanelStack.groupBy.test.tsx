// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    users: {
      getOrgDirectory: { useQuery: () => ({ data: undefined }) },
      getDirectory: { useQuery: () => ({ data: [] }) },
    },
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

function renderStack() {
  render(
    <SliderProvider physics={null} catalog={CATALOG}>
      <SelectionProvider>
        <RightPanelStack
          features={[]}
          catalog={CATALOG}
          visibleSelectedIndices={null}
          groupBy="company"
          onGroupByChange={vi.fn()}
        />
      </SelectionProvider>
    </SliderProvider>,
  );
}

describe("RightPanelStack — base rail views", () => {
  it("defaults to Grouping and exposes both view tabs", () => {
    renderStack();
    expect(screen.getByTestId("group-by-controls")).toBeTruthy();
    expect(screen.queryByTestId("catalog-slider-sidebar")).toBeNull();
    expect(screen.getByRole("tab", { name: "Grouping" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Catalog preview" }).getAttribute("aria-selected")).toBe("false");
  });

  it("opens Catalog preview only after its tab is selected", async () => {
    renderStack();
    const catalogTab = screen.getByTestId("catalog-preview-tab");
    fireEvent.mouseDown(catalogTab, { button: 0, ctrlKey: false });
    fireEvent.click(catalogTab);
    expect(await screen.findByTestId("catalog-slider-sidebar")).toBeTruthy();
    expect(screen.queryByTestId("group-by-controls")).toBeNull();
    expect(screen.getByRole("tab", { name: "Catalog preview" }).getAttribute("aria-selected")).toBe("true");
  });
});
