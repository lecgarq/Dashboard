// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartPanel } from "./ChartPanel";

describe("ChartPanel", () => {
  it("renders title, subtitle, insight, affordance, and children", () => {
    render(
      <ChartPanel
        title="User status"
        subtitle="Aggregated across project memberships"
        insight={{ text: "3 members are stale.", severity: "risk" }}
        affordance="click-to-filter"
      >
        <div data-testid="body">chart</div>
      </ChartPanel>,
    );

    expect(screen.getByRole("heading", { name: "User status" })).toBeTruthy();
    expect(screen.getByText("Aggregated across project memberships")).toBeTruthy();
    expect(screen.getByText("3 members are stale.")).toBeTruthy();
    expect(screen.getByText("click to filter")).toBeTruthy();
    expect(screen.getByTestId("body")).toBeTruthy();
  });

  it("omits optional regions when not provided", () => {
    render(
      <ChartPanel title="Bare">
        <div>body</div>
      </ChartPanel>,
    );

    expect(screen.getByRole("heading", { name: "Bare" })).toBeTruthy();
    expect(screen.queryByText("click to filter")).toBeNull();
    expect(screen.queryByText("drag to filter")).toBeNull();
  });
});
