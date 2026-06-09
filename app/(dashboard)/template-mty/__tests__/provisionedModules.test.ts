import { describe, it, expect } from "vitest";
import { summarizeProvisionedModules } from "../provisionedModules";

describe("summarizeProvisionedModules", () => {
  it("returns an empty summary for no members", () => {
    expect(summarizeProvisionedModules([])).toEqual({ slices: [], total: 0, memberCount: 0 });
  });

  it("counts distinct members per module and maps keys to friendly names", () => {
    const s = summarizeProvisionedModules([
      { products: { docs: "member", build: "administrator" } },
      { products: { docs: "member", forma: "member" } },
    ]);
    expect(s.memberCount).toBe(2);
    expect(s.slices).toEqual([
      { id: "dataManagement", name: "Data Management", value: 2 },
      { id: "build", name: "Build", value: 1 },
      { id: "design", name: "Design", value: 1 },
    ]);
    expect(s.total).toBe(4);
  });

  it("ignores products with no access", () => {
    const s = summarizeProvisionedModules([{ products: { docs: "none", build: "" } }]);
    expect(s.slices).toEqual([]);
    expect(s.total).toBe(0);
    expect(s.memberCount).toBe(1);
  });
});
