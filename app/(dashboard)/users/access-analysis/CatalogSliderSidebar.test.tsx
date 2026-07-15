// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CatalogSliderSidebar } from "./CatalogSliderSidebar";
import type { NodeFeatureSnapshot } from "./interactionTypes";

const FEATURES = [
  { nodeId: "u::p", actionCounts: { "issue-create": 3 } },
] as unknown as NodeFeatureSnapshot[];

function renderSidebar(): HTMLElement {
  render(<CatalogSliderSidebar features={FEATURES} />);
  return screen.getByTestId("catalog-slider-sidebar");
}

describe("CatalogSliderSidebar", () => {
  it("renders the 208-entry browse-only vocabulary", () => {
    const sidebar = renderSidebar();
    expect(sidebar.getAttribute("data-catalog-count")).toBe("208");
    expect(Number(sidebar.getAttribute("data-unavailable-count"))).toBeGreaterThanOrEqual(19);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByText("Reset all")).toBeNull();
    expect(screen.getAllByText("Activates in Phase 27").length).toBeGreaterThan(0);
  });

  it("searches actions and opens the matching activity branch", () => {
    renderSidebar();
    fireEvent.change(screen.getByTestId("dimension-search"), { target: { value: "Issue Create" } });
    expect(screen.getByText("Issue Create")).toBeTruthy();
    expect(screen.getByText("Activates in Phase 27")).toBeTruthy();
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
