// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupByControls } from "./GroupByControls";
import { SliderProvider } from "./SliderContext";
import type { CatalogDimension } from "./dimensionCatalog.types";
import type { NodeFeatureSnapshot } from "./interactionTypes";

// Radix Slider uses ResizeObserver, which is absent in jsdom.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

// Prevent SliderProvider's catalogDefaultSliders from pre-seeding "role" = 60
// (the primary-dim default). Test dims use surfaces:["color"] so they are not
// slider-surfaced — values[groupBy] is undefined, the ?? 0 fallback yields 0.
beforeEach(() => {
  window.localStorage.clear();
});

function dim(id: string): CatalogDimension {
  return {
    id, label: id[0].toUpperCase() + id.slice(1), family: "structure", kind: "categorical",
    source: "test", confidence: "high", available: true, surfaces: ["color"],
    extract: () => null,
  } as unknown as CatalogDimension;
}
const CATALOG = [dim("company"), dim("role"), dim("project")];

function renderControls(
  groupBy: string,
  onGroupByChange = vi.fn(),
  features: ReadonlyArray<NodeFeatureSnapshot> = [],
) {
  render(
    <SliderProvider physics={null} catalog={CATALOG}>
      <GroupByControls catalog={CATALOG} features={features} groupBy={groupBy} onGroupByChange={onGroupByChange} />
    </SliderProvider>,
  );
  return { onGroupByChange };
}

describe("GroupByControls", () => {
  it("renders a Group-by option per groupable dim, with the current one selected", () => {
    // Phase 25: the picker offers the full aperture — company is now included,
    // grouped into themed optgroups (Baseline / Identity).
    renderControls("role");
    const select = screen.getByTestId("group-by-select") as HTMLSelectElement;
    expect(select.value).toBe("role");
    expect(screen.getByRole("option", { name: "Company" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Role" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Project" })).toBeTruthy();
    // Themed optgroups wrap the options.
    expect(screen.getByRole("group", { name: "Baseline" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Identity" })).toBeTruthy();
  });

  it("calls onGroupByChange when the picker changes", () => {
    const { onGroupByChange } = renderControls("role");
    fireEvent.change(screen.getByTestId("group-by-select"), { target: { value: "company" } });
    expect(onGroupByChange).toHaveBeenCalledWith("company");
  });

  it("shows honest node-derived coverage inline, with ⚠ when under-covered", () => {
    // Real structural extractors drive coverage: company reads firmName.
    const features = [
      { firmName: "Hermosillo" },
      { firmName: "" },
    ] as unknown as NodeFeatureSnapshot[];
    renderControls("role", vi.fn(), features);
    // 1/2 covered (50% < 90% threshold) → coverage + caveat marker.
    expect(screen.getByRole("option", { name: "Company · 1/2 ⚠" })).toBeTruthy();
  });

  it("shows the strength value badge for the selected dim (defaults 0)", () => {
    renderControls("role");
    expect(screen.getByTestId("slider-value-role").textContent).toBe("0");
  });
});
