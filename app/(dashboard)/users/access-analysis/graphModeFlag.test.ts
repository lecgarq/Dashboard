import { describe, it, expect } from "vitest";
import { is3dGraphEnabled } from "./graphModeFlag";

describe("is3dGraphEnabled", () => {
  it("returns false when flag unset/empty/0", () => {
    expect(is3dGraphEnabled(undefined)).toBe(false);
    expect(is3dGraphEnabled("")).toBe(false);
    expect(is3dGraphEnabled("0")).toBe(false);
  });
  it("returns true only when flag === '1'", () => {
    expect(is3dGraphEnabled("1")).toBe(true);
  });
});
