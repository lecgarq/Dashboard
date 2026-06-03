import { describe, it, expect } from "vitest";
import { resolveLodMode } from "./lodState";

describe("resolveLodMode — drag-only aggregation", () => {
  it("dragging → aggregate (the cheap, fps-critical view)", () => {
    expect(resolveLodMode({ dragging: true })).toBe("aggregate");
  });

  it("settled → full (so hover/click/lasso run on real nodes)", () => {
    expect(resolveLodMode({ dragging: false })).toBe("full");
  });
});
