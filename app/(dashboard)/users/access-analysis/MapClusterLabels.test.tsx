// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MapClusterLabels } from "./MapClusterLabels";
import type { LegendEntry } from "./bucketedColors";
import type { GraphCanvasHandle } from "./MapClusterLabels";

vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));

const legend: LegendEntry[] = [
  { label: "Reviewers", color: [0, 0, 0], count: 80 },
  { label: "Admins", color: [0, 0, 0], count: 50 },
  { label: "Other", color: [0, 0, 0], count: 30, isOther: true },
];

describe("MapClusterLabels — opacity", () => {
  const graphRef = { current: null } as React.RefObject<GraphCanvasHandle | null>;

  it("fades the whole label layer via the opacity prop (clamped 0..1)", () => {
    const { getByTestId, rerender } = render(
      <MapClusterLabels
        graphRef={graphRef}
        mode="2d"
        centersX={Float32Array.from([0, 0])}
        centersY={Float32Array.from([0, 0])}
        labels={["Reviewers", "Admins"]}
        legend={legend}
        opacity={0.3}
      />,
    );
    expect(getByTestId("map-cluster-labels").style.opacity).toBe("0.3");

    rerender(
      <MapClusterLabels
        graphRef={graphRef}
        mode="2d"
        centersX={Float32Array.from([0, 0])}
        centersY={Float32Array.from([0, 0])}
        labels={["Reviewers", "Admins"]}
        legend={legend}
        opacity={5}
      />,
    );
    expect(getByTestId("map-cluster-labels").style.opacity).toBe("1"); // clamped
  });

  it("defaults to full opacity when the prop is omitted", () => {
    const { getByTestId } = render(
      <MapClusterLabels
        graphRef={graphRef}
        mode="2d"
        centersX={Float32Array.from([0, 0])}
        centersY={Float32Array.from([0, 0])}
        labels={["Reviewers", "Admins"]}
        legend={legend}
      />,
    );
    expect(getByTestId("map-cluster-labels").style.opacity).toBe("1");
  });
});
