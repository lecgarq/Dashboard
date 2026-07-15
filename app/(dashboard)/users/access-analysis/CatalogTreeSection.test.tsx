// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogPreviewRow, DisabledRow } from "./CatalogTreeSection";
import { SliderProvider } from "./SliderContext";
import type { CatalogDimension } from "./dimensionCatalog.types";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const base: CatalogDimension = {
  id: "project",
  label: "Project",
  family: "structure",
  kind: "categorical",
  source: "test",
  confidence: "high",
  available: true,
  surfaces: ["slider"],
  extract: () => null,
};

describe("catalog dimension rows", () => {
  it("renders an available dimension as a real slider without roadmap copy", () => {
    render(
      <SliderProvider physics={null} catalog={[base]}>
        <CatalogPreviewRow dim={base} />
      </SliderProvider>,
    );
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Project thumb" })).toBeTruthy();
    expect(screen.queryByText(/Phase 27/)).toBeNull();
  });

  it("shows an unavailable reason inline", () => {
    render(<DisabledRow label="Folder Size" reason="Not collected yet." />);
    const row = screen.getByTestId("disabled-dim-row");
    expect(row.textContent).toContain("Folder Size");
    expect(row.textContent).toContain("Not collected yet.");
    expect(row.getAttribute("title")).toBe("Not collected yet.");
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
