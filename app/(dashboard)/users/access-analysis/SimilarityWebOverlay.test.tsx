// @vitest-environment jsdom
import React from "react";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { SimilarityWebOverlay } from "./SimilarityWebOverlay";
import type { GraphCanvasHandle } from "./GraphCanvas";

describe("SimilarityWebOverlay", () => {
  const noEdges = {
    src: new Int32Array(0),
    dst: new Int32Array(0),
    bucket: new Uint16Array(0),
    strength: new Float32Array(0),
    band: new Uint8Array(0),
    palette: new Float32Array(0),
  };

  it("renders nothing in 3D mode", () => {
    const ref = createRef<GraphCanvasHandle | null>();
    const { container } = render(
      <SimilarityWebOverlay
        graphRef={ref}
        mode="3d"
        {...noEdges}
        opacity={1}
        isMorphing={() => false}
      />,
    );
    expect(container.querySelector("canvas")).toBeNull();
  });

  it("mounts a canvas in 2D mode", () => {
    const ref = createRef<GraphCanvasHandle | null>();
    const { container } = render(
      <SimilarityWebOverlay
        graphRef={ref}
        mode="2d"
        {...noEdges}
        opacity={1}
        isMorphing={() => false}
      />,
    );
    expect(container.querySelector("canvas")).not.toBeNull();
  });
});
