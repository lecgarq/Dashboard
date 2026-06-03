// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DonutPanel } from "./DonutPanel";

describe("DonutPanel", () => {
  it("renders an empty state for zero data", () => {
    render(<DonutPanel title="User status" data={[]} />);

    expect(screen.getByText("No data")).toBeTruthy();
  });

  it("renders single-slice data as one accessible chart", () => {
    render(
      <DonutPanel
        title="User status"
        data={[{ label: "Active", value: 8, color: "#10b981" }]}
      />,
    );

    expect(screen.getByRole("img", { name: "User status" })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText(/100%/)).toBeTruthy();
  });

  it("surfaces findings and preserves long labels for hover disclosure", () => {
    const label = "Very long permission tier label that should truncate visually";

    render(
      <DonutPanel
        title="Permission tiers"
        finding="View is the top folder permission tier with 2 grants."
        data={[{ label, value: 2, color: "#06b6d4" }]}
      />,
    );

    expect(screen.getByText("View is the top folder permission tier with 2 grants.")).toBeTruthy();
    expect(screen.getByText(label).getAttribute("title")).toBe(label);
  });
});
