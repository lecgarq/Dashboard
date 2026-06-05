// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Legend } from "./Legend";
import type { LegendEntry } from "./bucketedColors";

const entries: LegendEntry[] = [
  { label: "Coordinators", color: [0.2, 0.5, 0.9], count: 1135 },
  { label: "Reviewers", color: [0.9, 0.4, 0.1], count: 892 },
  { label: "Other", color: [0.7, 0.7, 0.78], count: 240, isOther: true },
];

describe("Legend", () => {
  it("renders a row per entry with label + formatted count", () => {
    render(<Legend entries={entries} />);
    expect(screen.getByTestId("graph-legend")).toBeTruthy();
    expect(screen.getByText("Coordinators")).toBeTruthy();
    expect(screen.getByText("1,135")).toBeTruthy();
    expect(screen.getByText("Other")).toBeTruthy();
  });

  it("renders nothing when entries is empty (e.g. ordered ramp)", () => {
    const { container } = render(<Legend entries={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
