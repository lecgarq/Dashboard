// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VgplotFacetChart } from "./VgplotFacetChart";

const plot = vi.fn(() => {
  const element = document.createElement("div");
  element.dataset.testid = "vgplot-chart";
  return element;
});

vi.mock("@uwdata/vgplot", () => ({
  plot,
  barX: vi.fn((...args: unknown[]) => ["barX", ...args]),
  width: vi.fn((value: number) => ["width", value]),
  height: vi.fn((value: number) => ["height", value]),
  marginLeft: vi.fn((value: number) => ["marginLeft", value]),
  marginRight: vi.fn((value: number) => ["marginRight", value]),
  marginTop: vi.fn((value: number) => ["marginTop", value]),
  marginBottom: vi.fn((value: number) => ["marginBottom", value]),
  xLabel: vi.fn((value: string | null) => ["xLabel", value]),
  yLabel: vi.fn((value: string | null) => ["yLabel", value]),
  xGrid: vi.fn((value: boolean) => ["xGrid", value]),
}));

describe("VgplotFacetChart", () => {
  it("renders rows through vgplot and keeps selectable row controls", async () => {
    render(
      <VgplotFacetChart
        rows={[
          { label: "Architect", value: 4, field: "role_id", values: ["Architect"] },
          { label: "Manager", value: 2, field: "role_id", values: ["Manager"] },
        ]}
        onSelect={() => undefined}
      />,
    );

    await waitFor(() => expect(plot).toHaveBeenCalled());
    expect(screen.getByTestId("vgplot-chart")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Architect 4/ })).toBeTruthy();
  });
});
