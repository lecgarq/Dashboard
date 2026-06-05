import { describe, it, expect } from "vitest";
import { activeGroupingDimension } from "./activeGrouping";

const ORDER = ["role", "project", "user", "company"];

describe("activeGroupingDimension", () => {
  it("returns the fallback when every slider is 0", () => {
    expect(activeGroupingDimension({ role: 0, project: 0 }, ORDER, "role")).toBe("role");
  });
  it("returns the single non-zero slider's dim", () => {
    expect(activeGroupingDimension({ role: 0, project: 70 }, ORDER, "role")).toBe("project");
  });
  it("returns the highest slider when several are non-zero", () => {
    expect(activeGroupingDimension({ role: 30, project: 80, user: 10 }, ORDER, "role")).toBe("project");
  });
  it("breaks ties by ORDER (first wins)", () => {
    expect(activeGroupingDimension({ role: 50, project: 50 }, ORDER, "role")).toBe("role");
  });
  it("ignores ids absent from ORDER", () => {
    expect(activeGroupingDimension({ ghost: 99, role: 40 }, ORDER, "role")).toBe("role");
  });
});
