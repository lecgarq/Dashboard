import { describe, it, expect } from "vitest";
import { chooseGraphVariant } from "./graphVariant";

describe("chooseGraphVariant", () => {
  it("defaults to the physics shell when the flag is unset", () => {
    expect(chooseGraphVariant(undefined)).toBe("physics");
  });
  it("uses the physics shell for the legacy escape-hatch value 0", () => {
    expect(chooseGraphVariant("0")).toBe("physics");
  });
  it("opts into the projector only when the flag is exactly 1", () => {
    expect(chooseGraphVariant("1")).toBe("projector");
  });
  it("treats any other value as the physics shell", () => {
    expect(chooseGraphVariant("true")).toBe("physics");
  });
});
