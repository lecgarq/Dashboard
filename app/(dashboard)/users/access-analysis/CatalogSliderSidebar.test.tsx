// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CatalogSliderSidebar } from "./CatalogSliderSidebar";
import { SliderProvider } from "./SliderContext";
import { buildStructuralDimensions } from "./dimensionCatalog.structural";
import type { NodeFeatureSnapshot } from "./interactionTypes";
import type { PhysicsLayer, TargetArrays } from "./physicsLayer";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const FEATURES = [
  { nodeId: "u::p", actionCounts: { "issue-create": 3 } },
] as unknown as NodeFeatureSnapshot[];

function renderSidebar() {
  const targets: TargetArrays = {};
  const weights: Record<string, Float32Array> = {};
  const registerTargets = vi.fn((nextTargets: TargetArrays, nextWeights: Record<string, Float32Array>) => {
    Object.assign(targets, nextTargets);
    Object.assign(weights, nextWeights);
  });
  const physics = {
    getTargets: () => targets,
    getDimWeights: () => weights,
    registerTargets,
    updateSliders: vi.fn(),
    setActiveInput: vi.fn(),
  } as unknown as PhysicsLayer;
  const structural = buildStructuralDimensions();
  const onCatalogReady = vi.fn();
  render(
    <SliderProvider physics={physics} catalog={structural}>
      <CatalogSliderSidebar
        features={FEATURES}
        physics={physics}
        onCatalogReady={onCatalogReady}
      />
    </SliderProvider>,
  );
  return { sidebar: screen.getByTestId("catalog-slider-sidebar"), registerTargets, onCatalogReady };
}

describe("CatalogSliderSidebar", () => {
  it("renders the 208-entry actionable vocabulary and registers missing targets", async () => {
    const { sidebar, registerTargets, onCatalogReady } = renderSidebar();
    expect(sidebar.getAttribute("data-catalog-count")).toBe("208");
    expect(Number(sidebar.getAttribute("data-unavailable-count"))).toBeGreaterThanOrEqual(19);
    expect(screen.getAllByRole("slider").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Phase 27/)).toBeNull();
    await waitFor(() => expect(registerTargets).toHaveBeenCalledTimes(1));
    const registered = registerTargets.mock.calls[0][0] as TargetArrays;
    expect(registered["issue-create"]).toBeDefined();
    expect(onCatalogReady).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: "issue-create" }),
    ]));
  });

  it("searches actions and exposes a live action slider", () => {
    renderSidebar();
    fireEvent.change(screen.getByTestId("dimension-search"), { target: { value: "Issue Create" } });
    expect(screen.getByText("Issue Create")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Issue Create thumb" })).toBeTruthy();
  });

  it("keeps unavailable folder dimensions visible with their reason inline", () => {
    renderSidebar();
    fireEvent.change(screen.getByTestId("dimension-search"), { target: { value: "Folder Description" } });
    const row = screen.getByTestId("disabled-dim-row");
    expect(row.textContent).toContain("Folder Description");
    expect(row.textContent).toContain("Not collected yet");
  });

  it("shows a useful no-match state", () => {
    renderSidebar();
    fireEvent.change(screen.getByTestId("dimension-search"), { target: { value: "zz-no-dimension" } });
    expect(screen.getByText(/No dimensions match/)).toBeTruthy();
  });
});
