// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CatalogPreviewRow, DisabledRow } from "./CatalogTreeSection";
import type { CatalogDimension } from "./dimensionCatalog.types";

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

describe("catalog preview rows", () => {
  it("shows the Phase 27 activation status for available dimensions without a slider", () => {
    render(<CatalogPreviewRow dim={base} />);
    expect(screen.getByText("Project")).toBeTruthy();
    expect(screen.getByText("Activates in Phase 27")).toBeTruthy();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("shows an unavailable reason inline", () => {
    render(<DisabledRow label="Folder Size" reason="Not collected yet." />);
    const row = screen.getByTestId("disabled-dim-row");
    expect(row.textContent).toContain("Folder Size");
    expect(row.textContent).toContain("Not collected yet.");
    expect(row.getAttribute("title")).toBe("Not collected yet.");
  });
});
